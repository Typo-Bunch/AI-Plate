/**
 * Plugin Manager — Pub/Sub Event Bus & Hot Plug & Play Tool Registry.
 *
 * Singleton class extending Node's EventEmitter that serves as the
 * central nervous system of the harness. Plugins register their tools
 * here; the Orchestrator queries schemas and dispatches executions.
 *
 * Features:
 *   - Hot Plug & Play: enable/disable plugins dynamically at runtime.
 *   - Schema isolation: only active/enabled plugin schemas are passed to LLMs.
 *   - Rich metadata & introspection for UI dashboards.
 */

import { EventEmitter } from "node:events";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, rmSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as crypto from "node:crypto";
import AdmZip from "adm-zip";
import { AgentDatabase } from "./database.js";
import { VectorStore } from "./vector-store.js";
import { CONFIG } from "./config.js";
import type {
  CustomPluginDefinition,
  ManifestTool,
  PluginContext,
  PluginInfo,
  PluginManifest,
  RegisteredTool,
  ToolExecutionResult,
  ToolHandler,
  ToolPlugin,
  ToolSchema,
  UIExtensionManifest,
} from "./types.js";

const execAsync = promisify(exec);

interface PluginRegistration {
  plugin: ToolPlugin;
  enabled: boolean;
  isCustom: boolean;
  manifest?: PluginManifest;
  uiExtension?: UIExtensionManifest;
  bundleDir?: string;
  tools: Map<string, RegisteredTool>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGINS_STATE_META_KEY = "plugins_enabled_state";
const BUNDLED_PLUGINS_DIR = resolve(__dirname, "../../plugins/installed");
// Use AIPLATE_USERDATA env var (set by main.ts before dynamic import) so these
// module-level constants always resolve to the user-writable userData directory.
const _userBase = () => process.env.AIPLATE_USERDATA || process.cwd();
const CUSTOM_PLUGINS_INSTALLED_DIR = resolve(_userBase(), "plugins", "installed");
const SANDBOX_DIR = resolve(_userBase(), CONFIG.SHELL.SANDBOX_DIR || ".sandbox");
const ARTIFACTS_DIR = resolve(_userBase(), CONFIG.SHELL.ARTIFACTS_DIR || "artifacts");

export class PluginManager extends EventEmitter {
  private static instance: PluginManager | null = null;
  private plugins: Map<string, PluginRegistration> = new Map();
  private standaloneTools: Map<string, RegisteredTool> = new Map();
  private sharedVectorStore: VectorStore | null = null;

  private constructor() {
    super();
    this.ensureCustomPluginsDir();
  }

  /** Set shared vector store instance for dynamic plugin RAG queries. */
  public setSharedVectorStore(vs: VectorStore): void {
    this.sharedVectorStore = vs;
  }

  /** Get or create the singleton instance. */
  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /** Ensure storage directories exist for custom plugin files, sandbox, and artifacts. */
  private ensureCustomPluginsDir(): void {
    try {
      if (!existsSync(CUSTOM_PLUGINS_INSTALLED_DIR)) {
        mkdirSync(CUSTOM_PLUGINS_INSTALLED_DIR, { recursive: true });
      }
      if (!existsSync(SANDBOX_DIR)) {
        mkdirSync(SANDBOX_DIR, { recursive: true });
      }
      if (!existsSync(ARTIFACTS_DIR)) {
        mkdirSync(ARTIFACTS_DIR, { recursive: true });
      }
    } catch {
      // Non-fatal
    }
  }

  /** Read saved plugin states from persistent SQLite metadata table. */
  private getSavedPluginStates(): Record<string, boolean> {
    try {
      const db = AgentDatabase.getInstance();
      const raw = db.getMeta(PLUGINS_STATE_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      }
    } catch (err) {
      // Non-fatal if DB not yet initialized
    }
    return {};
  }

  /** Persist current plugin enabled states to SQLite by merging with existing keys. */
  private persistPluginStates(): void {
    try {
      const db = AgentDatabase.getInstance();
      const existing = this.getSavedPluginStates();
      for (const [id, reg] of this.plugins.entries()) {
        existing[id] = reg.enabled;
      }
      db.setMeta(PLUGINS_STATE_META_KEY, JSON.stringify(existing));
    } catch (err) {
      // Non-fatal
    }
  }

  /**
   * Build a comprehensive, sandbox-safe execution context for any custom plugin.
   */
  public createPluginContext(pluginId: string, params: Record<string, unknown> = {}, customConsole?: any): PluginContext {
    const db = AgentDatabase.getInstance();

    return {
      pluginId,
      params,
      fs: {
        readFile: (relPath: string, encoding: BufferEncoding = "utf-8"): string => {
          const inSandbox = resolve(SANDBOX_DIR, relPath);
          if (existsSync(inSandbox)) return readFileSync(inSandbox, encoding);
          const inArtifacts = resolve(ARTIFACTS_DIR, relPath);
          if (existsSync(inArtifacts)) return readFileSync(inArtifacts, encoding);
          const inRoot = resolve(process.cwd(), relPath);
          if (existsSync(inRoot)) return readFileSync(inRoot, encoding);
          throw new Error(`File not found: "${relPath}"`);
        },
        readBuffer: (relPath: string): Buffer => {
          const inSandbox = resolve(SANDBOX_DIR, relPath);
          if (existsSync(inSandbox)) return readFileSync(inSandbox);
          const inArtifacts = resolve(ARTIFACTS_DIR, relPath);
          if (existsSync(inArtifacts)) return readFileSync(inArtifacts);
          const inRoot = resolve(process.cwd(), relPath);
          if (existsSync(inRoot)) return readFileSync(inRoot);
          throw new Error(`File not found: "${relPath}"`);
        },
        writeFile: (relPath: string, content: string | Buffer): string => {
          const full = resolve(SANDBOX_DIR, relPath);
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, content);
          return full;
        },
        saveArtifact: (filename: string, content: string | Buffer): string => {
          const cleanName = basename(filename);
          if (!existsSync(ARTIFACTS_DIR)) mkdirSync(ARTIFACTS_DIR, { recursive: true });
          const full = resolve(ARTIFACTS_DIR, cleanName);
          writeFileSync(full, content);

          // Also mirror image artifacts in SQLite media_storage for instant zero-loss retrieval
          try {
            const ext = extname(cleanName).toLowerCase();
            const extMimeMap: Record<string, string> = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".webp": "image/webp",
              ".svg": "image/svg+xml",
              ".gif": "image/gif",
              ".ico": "image/x-icon",
            };
            if (extMimeMap[ext]) {
              const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, typeof content === "string" ? "utf-8" : undefined);
              const db = AgentDatabase.getInstance().db;
              db.prepare(`
                INSERT OR REPLACE INTO media_storage (name, mime_type, base64_data, size_bytes, created_at)
                VALUES (?, ?, ?, ?, ?)
              `).run(cleanName, extMimeMap[ext], buffer.toString("base64"), buffer.length, new Date().toISOString());
            }
          } catch {}

          return full;
        },
        listSandboxFiles: (): string[] => {
          if (!existsSync(SANDBOX_DIR)) return [];
          return readdirSync(SANDBOX_DIR).filter((f) => !f.startsWith("."));
        },
        listArtifactFiles: (): string[] => {
          if (!existsSync(ARTIFACTS_DIR)) return [];
          return readdirSync(ARTIFACTS_DIR).filter((f) => !f.startsWith("."));
        },
        exists: (relPath: string): boolean => {
          return (
            existsSync(resolve(SANDBOX_DIR, relPath)) ||
            existsSync(resolve(ARTIFACTS_DIR, relPath)) ||
            existsSync(resolve(process.cwd(), relPath))
          );
        },
        deleteFile: (relPath: string): boolean => {
          const full = resolve(SANDBOX_DIR, relPath);
          if (existsSync(full)) {
            unlinkSync(full);
            return true;
          }
          return false;
        },
        getSandboxDir: (): string => SANDBOX_DIR,
        getArtifactsDir: (): string => ARTIFACTS_DIR,
      },
      shell: {
        exec: async (
          command: string,
          timeoutMs: number = 30_000
        ): Promise<{ stdout: string; stderr: string; exitCode: number; error?: string }> => {
          try {
            const sanitizedEnv = { ...process.env };
            delete sanitizedEnv["GOOGLE_API_KEY"];
            delete sanitizedEnv["GEMINI_API_KEY"];
            delete sanitizedEnv["OPENAI_API_KEY"];
            delete sanitizedEnv["ANTHROPIC_API_KEY"];
            delete sanitizedEnv["OPENROUTER_API_KEY"];

            const { stdout, stderr } = await execAsync(command, {
              cwd: SANDBOX_DIR,
              timeout: timeoutMs,
              maxBuffer: 2 * 1024 * 1024,
              env: sanitizedEnv,
            });
            return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
          } catch (err: any) {
            return {
              stdout: err.stdout?.trim() || "",
              stderr: err.stderr?.trim() || "",
              exitCode: err.code ?? 1,
              error: err.message,
            };
          }
        },
        runPython: async (
          codeOrScriptPath: string,
          args: string[] = [],
          timeoutMs: number = 30_000
        ): Promise<{ stdout: string; stderr: string; exitCode: number; error?: string }> => {
          let scriptPath = codeOrScriptPath;
          let isTemp = false;
          const fullScript = resolve(SANDBOX_DIR, codeOrScriptPath);
          if (!existsSync(fullScript) && !codeOrScriptPath.endsWith(".py")) {
            scriptPath = `tmp_plugin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.py`;
            writeFileSync(resolve(SANDBOX_DIR, scriptPath), codeOrScriptPath, "utf-8");
            isTemp = true;
          }
          try {
            const cmd = `python "${resolve(SANDBOX_DIR, scriptPath)}" ${args.map((a) => `"${a}"`).join(" ")}`;
            const res = await execAsync(cmd, { cwd: SANDBOX_DIR, timeout: timeoutMs });
            return { stdout: res.stdout.trim(), stderr: res.stderr.trim(), exitCode: 0 };
          } catch (err: any) {
            return {
              stdout: err.stdout?.trim() || "",
              stderr: err.stderr?.trim() || "",
              exitCode: err.code ?? 1,
              error: err.message,
            };
          } finally {
            if (isTemp) {
              try {
                unlinkSync(resolve(SANDBOX_DIR, scriptPath));
              } catch {}
            }
          }
        },
      },
      storage: {
        get: <T = unknown>(key: string, defaultValue: T | null = null): T | null => {
          return db.getPluginData<T>(pluginId, key, defaultValue);
        },
        set: (key: string, value: unknown): void => {
          db.setPluginData(pluginId, key, value);
        },
        delete: (key: string): boolean => {
          return db.deletePluginData(pluginId, key);
        },
        list: (): Record<string, unknown> => {
          return db.listPluginData(pluginId);
        },
        clear: (): void => {
          db.clearPluginData(pluginId);
        },
      },
      rag: {
        search: async (query: string, topK: number = 3) => {
          try {
            const vs = this.sharedVectorStore || new VectorStore();
            const results = await vs.query(query, topK, 0.4);
            return results.map((r) => ({
              document: r.chunk.sourceDocument,
              text: r.chunk.text,
              similarity: r.similarity,
            }));
          } catch {
            return [];
          }
        },
        ingest: async (docName: string, text: string) => {
          const vs = this.sharedVectorStore || new VectorStore();
          const doc = await vs.ingestText(docName, text);
          return { chunksIngested: doc.chunkCount };
        },
        listDocuments: () => {
          const vs = this.sharedVectorStore || new VectorStore();
          return vs.listDocuments().map((d) => ({ name: d.name, chunkCount: d.chunkCount }));
        },
      },
      crypto,
      Buffer,
      env: { ...process.env },
      log: (message: string, ...args: unknown[]) => {
        if (customConsole?.log) {
          customConsole.log(`[Plugin:${pluginId}] ${message}`, ...args);
        }
        this.emit("plugin:log", { pluginId, message, args });
      },
    };
  }

  /**
   * Validate a declarative .aiplugin / .plugin.json manifest.
   */
  public static validateManifest(data: any): { valid: boolean; error?: string; manifest?: PluginManifest } {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "Manifest must be a valid JSON object." };
    }

    const rawId = typeof data.id === "string" ? data.id.trim() : "";
    const rawName = typeof data.name === "string" ? data.name.trim() : "";

    if (!rawName) {
      return { valid: false, error: "Manifest missing required field 'name'." };
    }

    const id = (rawId || rawName.toLowerCase().replace(/[^a-z0-9_]+/g, "_")).replace(/^[0-9_]+/, "");
    if (!id) {
      return { valid: false, error: "Invalid plugin ID. Must contain alphanumeric characters." };
    }

    if (!Array.isArray(data.tools)) {
      return { valid: false, error: "Manifest missing required array 'tools'." };
    }

    for (let i = 0; i < data.tools.length; i++) {
      const tool = data.tools[i];
      if (!tool || typeof tool !== "object") {
        return { valid: false, error: `Tool at index ${i} is not a valid object.` };
      }
      if (!tool.name || typeof tool.name !== "string") {
        return { valid: false, error: `Tool at index ${i} is missing a valid 'name'.` };
      }
      if (!tool.description || typeof tool.description !== "string") {
        return { valid: false, error: `Tool '${tool.name}' is missing a valid 'description'.` };
      }
      if (!tool.parameters && !tool.parametersJsonSchema) {
        return { valid: false, error: `Tool '${tool.name}' is missing a 'parameters' schema definition.` };
      }
      if (!tool.handler || typeof tool.handler !== "object" || !tool.handler.type) {
        return { valid: false, error: `Tool '${tool.name}' is missing a valid 'handler' object with 'type'.` };
      }
    }

    const cleanManifest: PluginManifest = {
      ...(data.$schema ? { $schema: data.$schema } : {}),
      id,
      name: rawName,
      version: data.version || "1.0.0",
      author: data.author || "Custom / Drag & Drop",
      description: data.description || "Custom AI Plate dynamic extension.",
      icon: data.icon || "🔌",
      category: data.category || "custom",
      homepage: data.homepage || "",
      enabled: data.enabled !== false,
      type: "custom",
      tools: data.tools,
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
    };

    return { valid: true, manifest: cleanManifest };
  }

  /**
   * Compile a declarative ManifestTool handler into an executable ToolHandler function with full context.
   */
  public compileManifestToolHandler(tool: ManifestTool, customConsole?: any): ToolHandler {
    const { handler, name } = tool;
    const pluginId = (tool as any).pluginId || "custom";

    if (handler.type === "javascript") {
      const userCode = handler.code || "return { success: true, message: 'Executed' };";
      try {
        // Safe evaluation wrapping with AsyncFunction injecting complete context & globals
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const compiledFn = new AsyncFunction(
          "params",
          "ctx",
          "context",
          "fetch",
          "console",
          "fs",
          "shell",
          "storage",
          "rag",
          "crypto",
          "Buffer",
          "env",
          `"use strict";\n${userCode}`
        );

        return async (params: Record<string, unknown>) => {
          try {
            const ctx = this.createPluginContext(pluginId, params, customConsole);
            const activeConsole = customConsole || console;
            const result = await compiledFn(
              params,
              ctx,
              ctx,
              fetch,
              activeConsole,
              ctx.fs,
              ctx.shell,
              ctx.storage,
              ctx.rag,
              ctx.crypto,
              ctx.Buffer,
              ctx.env
            );
            return result !== undefined ? result : { success: true };
          } catch (execErr: any) {
            return { error: `Dynamic tool '${name}' execution error: ${execErr.message || String(execErr)}` };
          }
        };
      } catch (compileErr: any) {
        return async () => ({ error: `Failed to compile tool '${name}': ${compileErr.message}` });
      }
    }

    if (handler.type === "http") {
      return async (params: Record<string, unknown>) => {
        try {
          let url = handler.url || "";
          // Replace template placeholders like {{paramName}} or {{params.paramName}}
          for (const [key, value] of Object.entries(params)) {
            url = url.replace(new RegExp(`{{\\s*(params\\.)?${key}\\s*}}`, "g"), encodeURIComponent(String(value)));
          }

          const method = handler.method || "GET";
          const headers: Record<string, string> = {
            "User-Agent": "AI-Plate-Plugin-Engine/1.0",
            ...(handler.headers || {}),
          };

          let body: string | undefined;
          if (method !== "GET" && handler.bodyTemplate) {
            let rendered = handler.bodyTemplate;
            for (const [key, value] of Object.entries(params)) {
              rendered = rendered.replace(new RegExp(`{{\\s*(params\\.)?${key}\\s*}}`, "g"), JSON.stringify(value));
            }
            body = rendered;
            if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
          }

          const response = await fetch(url, { method, headers, body });
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await response.json();
            return { status: response.status, data };
          } else {
            const text = await response.text();
            return { status: response.status, data: text };
          }
        } catch (fetchErr: any) {
          return { error: `HTTP Tool '${name}' request failed: ${fetchErr.message}` };
        }
      };
    }

    // Default echo handler
    return async (params: Record<string, unknown>) => {
      return { message: `Echo from custom tool '${name}'`, parameters: params };
    };
  }

  /**
   * Register a full plugin bundle with its metadata and tools.
   * Restores previously saved ON/OFF state from SQLite if available.
   */
  registerPlugin(plugin: ToolPlugin, defaultEnabled = true, isCustom = false, manifest?: PluginManifest): void {
    const id = plugin.id || plugin.name.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const pluginTools: Map<string, RegisteredTool> = new Map();

    // Custom collector for plugin tools
    const toolCollector = (schema: ToolSchema, handler: ToolHandler) => {
      pluginTools.set(schema.name, { schema, handler });
      this.emit("tool:registered", schema.name, id);
    };

    plugin.register(toolCollector);

    // If manifest not provided, check if a pre-bundled sample package exists on disk
    let effectiveManifest = manifest;
    if (!effectiveManifest) {
      try {
        const samplePath = resolve(process.cwd(), "plugins", "samples", `${id}.aiplugin.json`);
        if (existsSync(samplePath)) {
          const raw = readFileSync(samplePath, "utf-8");
          effectiveManifest = JSON.parse(raw);
        }
      } catch {}
    }

    // Restore saved state from SQLite or use default
    const savedStates = this.getSavedPluginStates();
    const isEnabled = typeof savedStates[id] === "boolean" ? savedStates[id] : defaultEnabled;

    this.plugins.set(id, {
      plugin,
      enabled: isEnabled,
      isCustom,
      manifest: effectiveManifest,
      tools: pluginTools,
    });

    this.emit("plugin:registered", { id, name: plugin.name, toolCount: pluginTools.size, enabled: isEnabled, isCustom });
  }

  /**
   * Install a custom plugin package from a parsed or dragged .aiplugin.json manifest.
   */
  installPluginFromManifest(
    manifestInput: any,
    persist = true
  ): { success: boolean; plugin?: PluginInfo; error?: string } {
    const validation = PluginManager.validateManifest(manifestInput);
    if (!validation.valid || !validation.manifest) {
      return { success: false, error: validation.error || "Invalid plugin manifest" };
    }

    const manifest = validation.manifest;
    const id = manifest.id;

    // Prevent overwriting native core plugins if the manifest is just a placeholder
    const existing = this.plugins.get(id);
    if (
      existing &&
      !existing.isCustom &&
      manifest.tools.some((t) => t.handler?.code?.includes("// Built-in native handler"))
    ) {
      return {
        success: false,
        error: `Cannot overwrite core built-in plugin '${existing.plugin.name}' with an empty placeholder manifest.`,
      };
    }

    // Create ToolPlugin bridge
    const customPlugin: ToolPlugin = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      icon: manifest.icon,
      category: manifest.category,
      register: (registerTool) => {
        for (const toolDef of manifest.tools) {
          const paramSchema =
            toolDef.parametersJsonSchema ||
            (toolDef.parameters as any) || {
              type: "object",
              properties: {},
              required: [],
            };

          const schema: ToolSchema = {
            name: toolDef.name,
            description: toolDef.description,
            parametersJsonSchema: paramSchema,
          };
          (toolDef as any).pluginId = manifest.id;
          const handler = this.compileManifestToolHandler(toolDef);
          registerTool(schema, handler);
        }
      },
    };

    // Register into memory
    this.registerPlugin(customPlugin, manifest.enabled !== false, true, manifest);

    // Persist to Disk and SQLite
    if (persist) {
      try {
        const jsonStr = JSON.stringify(manifest, null, 2);
        const dirPath = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, id);
        if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
          writeFileSync(resolve(dirPath, "plugin.json"), jsonStr, "utf-8");
        } else {
          const filePath = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, `${id}.aiplugin.json`);
          writeFileSync(filePath, jsonStr, "utf-8");
        }

        const db = AgentDatabase.getInstance();
        db.saveCustomPlugin(id, manifest.name, jsonStr);
        this.persistPluginStates();
      } catch (err: any) {
        console.warn(`[PluginManager] Failed to persist custom plugin '${id}':`, err.message);
      }
    }

    const registered = this.plugins.get(id);
    const pluginInfo: PluginInfo = {
      id,
      name: manifest.name,
      description: manifest.description || "",
      icon: manifest.icon || "🔌",
      enabled: registered ? registered.enabled : true,
      isCustom: true,
      version: manifest.version,
      author: manifest.author,
      category: manifest.category,
      canUninstall: true,
      toolCount: manifest.tools.length,
      tools: manifest.tools.map((t) => ({ name: t.name, description: t.description })),
      ui_extension: manifest.ui_extension,
      quick_actions: manifest.quick_actions,
    };

    this.emit("plugin:installed", pluginInfo);
    return { success: true, plugin: pluginInfo };
  }

  /**
   * Install a programmatic code plugin defined in TS/JS.
   */
  installProgrammaticPlugin(def: CustomPluginDefinition, defaultEnabled = true): PluginInfo {
    const id = def.id;
    const customPlugin: ToolPlugin = {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      category: def.category,
      register: (registerTool) => {
        for (const toolDef of def.tools) {
          const paramSchema =
            toolDef.parametersJsonSchema ||
            (toolDef.parameters as any) || {
              type: "object",
              properties: {},
              required: [],
            };

          const schema: ToolSchema = {
            name: toolDef.name,
            description: toolDef.description,
            parametersJsonSchema: paramSchema,
          };
          const handler: ToolHandler = async (params) => {
            const ctx = this.createPluginContext(id, params);
            return toolDef.handler(params, ctx);
          };
          registerTool(schema, handler);
        }
      },
    };

    this.registerPlugin(customPlugin, defaultEnabled, true);

    const registered = this.plugins.get(id);
    const pluginInfo: PluginInfo = {
      id,
      name: def.name,
      description: def.description || "",
      icon: def.icon || "🔌",
      enabled: registered ? registered.enabled : true,
      isCustom: true,
      version: def.version || "1.0.0",
      author: def.author || "Custom Plugin",
      category: def.category || "custom",
      canUninstall: true,
      toolCount: def.tools.length,
      tools: def.tools.map((t) => ({ name: t.name, description: t.description })),
    };

    this.emit("plugin:installed", pluginInfo);
    return pluginInfo;
  }

  /**
   * Unregister a plugin from active memory without deleting files.
   */
  unregisterPlugin(pluginId: string): boolean {
    const reg = this.plugins.get(pluginId);
    if (!reg) return false;

    this.plugins.delete(pluginId);
    this.emit("plugin:unregistered", { id: pluginId, name: reg.plugin.name });
    return true;
  }

  /**
   * Completely uninstall a custom plugin, deleting its stored package, DB records, and plugin_storage namespace.
   */
  async uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const reg = this.plugins.get(pluginId);
    if (!reg) {
      return { success: false, error: `Plugin "${pluginId}" not found.` };
    }

    if (!reg.isCustom) {
      return { success: false, error: `Core built-in plugin "${reg.plugin.name}" cannot be uninstalled.` };
    }

    // 1. Run optional manifest lifecycle on_uninstall hook if defined
    if (reg.manifest?.lifecycle?.on_uninstall) {
      try {
        const hook = reg.manifest.lifecycle.on_uninstall;
        const ctx = this.createPluginContext(pluginId);
        if (hook.type === "javascript" && hook.code) {
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFunction("params", "context", "storage", "fs", "shell", "rag", hook.code);
          await fn({}, ctx, ctx.storage, ctx.fs, ctx.shell, ctx.rag);
        }
      } catch (hookErr: any) {
        console.warn(`[PluginManager] Lifecycle on_uninstall hook error for '${pluginId}':`, hookErr.message);
      }
    }

    // 2. Unregister from active memory & tool registry
    this.unregisterPlugin(pluginId);

    // 3. Wipe plugin's SQLite persistent storage namespace
    try {
      const db = AgentDatabase.getInstance();
      db.clearPluginData(pluginId); // Purges from plugin_storage table
      db.deleteCustomPlugin(pluginId); // Removes from custom_plugins table

      // Clean up enabled state map
      const states = this.getSavedPluginStates();
      delete states[pluginId];
      db.setMeta(PLUGINS_STATE_META_KEY, JSON.stringify(states));
    } catch (err: any) {
      console.warn(`[PluginManager] DB cleanup error during uninstall of '${pluginId}':`, err.message);
    }

    // 4. Remove .aiplugin.json file or directory bundle from plugins/installed/
    try {
      const filePath = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, `${pluginId}.aiplugin.json`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      const dirPath = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, pluginId);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (err: any) {
      console.warn(`[PluginManager] File cleanup error during uninstall of '${pluginId}':`, err.message);
    }

    this.emit("plugin:uninstalled", { id: pluginId, name: reg.plugin.name });
    return { success: true };
  }

  /**
   * Load a modular directory plugin bundle (e.g. plugins/installed/<name>/)
   * containing plugin.json / manifest.json and optional ui/ directory.
   */
  public loadPluginFromDirectory(
    dirPath: string,
    persist = false
  ): { success: boolean; plugin?: PluginInfo; error?: string } {
    try {
      if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
        return { success: false, error: `Directory not found: "${dirPath}"` };
      }

      const pluginJsonPath = resolve(dirPath, "plugin.json");
      const manifestJsonPath = resolve(dirPath, "manifest.json");
      const manifestPath = existsSync(pluginJsonPath) ? pluginJsonPath : existsSync(manifestJsonPath) ? manifestJsonPath : null;

      if (!manifestPath) {
        return { success: false, error: `No plugin.json or manifest.json found in "${dirPath}"` };
      }

      const rawContent = readFileSync(manifestPath, "utf-8");
      const manifest: PluginManifest = JSON.parse(rawContent);
      const bundleId = manifest.id || basename(dirPath).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      manifest.id = bundleId;

      // Check for ui/ directory
      const uiDir = resolve(dirPath, "ui");
      if (existsSync(uiDir) && statSync(uiDir).isDirectory()) {
        const uiFiles = readdirSync(uiDir);
        let html = "";
        let js = "";
        let css = "";

        for (const file of uiFiles) {
          const fullPath = resolve(uiDir, file);
          if (statSync(fullPath).isDirectory()) continue;
          if (file.endsWith(".html")) {
            html += (html ? "\n" : "") + readFileSync(fullPath, "utf-8");
          } else if (file.endsWith(".js")) {
            js += (js ? "\n" : "") + readFileSync(fullPath, "utf-8");
          } else if (file.endsWith(".css")) {
            css += (css ? "\n" : "") + readFileSync(fullPath, "utf-8");
          }
        }

        if (html || js || css || manifest.ui_extension) {
          manifest.ui_extension = {
            pluginId: bundleId,
            name: manifest.ui_extension?.name || manifest.name,
            icon: manifest.ui_extension?.icon || manifest.icon || "🔌",
            type: manifest.ui_extension?.type || (manifest.ui_extension?.actionButtons?.length ? "media_editor" : "custom"),
            fileTypes: manifest.ui_extension?.fileTypes || (manifest.ui_extension?.actionButtons?.length ? ["image/*", ".png", ".jpg", ".jpeg", ".webp"] : []),
            actionButtons: manifest.ui_extension?.actionButtons || [],
            ...(manifest.ui_extension || {}),
            html: html || manifest.ui_extension?.html || "",
            js: js || manifest.ui_extension?.js || "",
            css: css || manifest.ui_extension?.css || "",
          };
        }
      }

      const res = this.installPluginFromManifest(manifest, persist);
      if (res.success && res.plugin) {
        const reg = this.plugins.get(bundleId);
        if (reg) {
          reg.bundleDir = dirPath;
          if (manifest.ui_extension) reg.uiExtension = manifest.ui_extension;
        }
      }
      return res;
    } catch (err: any) {
      return { success: false, error: `Failed to load directory plugin bundle: ${err.message}` };
    }
  }

  /**
   * Install a plugin package from a .zip / .aiplugin.zip archive buffer or file path.
   * Automatically unpacks into plugins/installed/<plugin_id>/ and registers tools and UI extensions.
   */
  public installPluginFromZip(
    zipInput: Buffer | string,
    persist = true
  ): { success: boolean; plugin?: PluginInfo; error?: string } {
    try {
      const zip = new AdmZip(zipInput);
      const zipEntries = zip.getEntries();

      if (!zipEntries || zipEntries.length === 0) {
        return { success: false, error: "The provided ZIP file is empty." };
      }

      // Find plugin.json or manifest.json entry
      const manifestEntry = zipEntries.find(
        (e) =>
          !e.isDirectory &&
          (e.entryName === "plugin.json" ||
            e.entryName === "manifest.json" ||
            e.entryName.endsWith("/plugin.json") ||
            e.entryName.endsWith("/manifest.json"))
      );

      if (!manifestEntry) {
        return {
          success: false,
          error: "ZIP package does not contain a valid 'plugin.json' or 'manifest.json' manifest.",
        };
      }

      const manifestRaw = zip.readAsText(manifestEntry);
      const manifestParsed = JSON.parse(manifestRaw);
      const validation = PluginManager.validateManifest(manifestParsed);
      if (!validation.valid || !validation.manifest) {
        return { success: false, error: validation.error || "Invalid plugin manifest inside ZIP." };
      }

      const manifest = validation.manifest;
      const pluginId = manifest.id;
      const targetDir = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, pluginId);

      // Wipe target directory if existing
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      mkdirSync(targetDir, { recursive: true });

      // Detect if files are nested in a parent folder inside the zip
      const prefix = manifestEntry.entryName.includes("/")
        ? manifestEntry.entryName.slice(0, manifestEntry.entryName.lastIndexOf("/") + 1)
        : "";

      // Extract files with relative path normalization
      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        let relativePath = entry.entryName;
        if (prefix && relativePath.startsWith(prefix)) {
          relativePath = relativePath.slice(prefix.length);
        }
        if (!relativePath) continue;

        const destPath = resolve(targetDir, relativePath);
        mkdirSync(dirname(destPath), { recursive: true });
        writeFileSync(destPath, entry.getData());
      }

      // Now load the extracted directory bundle
      const res = this.loadPluginFromDirectory(targetDir, persist);
      if (res.success && res.plugin) {
        this.persistPluginStates();
      }
      return res;
    } catch (err: any) {
      return { success: false, error: `Failed to install plugin from ZIP: ${err.message}` };
    }
  }

  /**
   * Export a plugin as a downloadable .zip package containing all files and UI assets.
   */
  public exportPluginZip(pluginId: string): Buffer | null {
    const reg = this.plugins.get(pluginId);
    if (!reg) return null;

    const targetDir = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, pluginId);
    const zip = new AdmZip();

    if (existsSync(targetDir) && statSync(targetDir).isDirectory()) {
      zip.addLocalFolder(targetDir);
      return zip.toBuffer();
    }

    // If legacy .aiplugin.json file
    const legacyFile = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, `${pluginId}.aiplugin.json`);
    if (existsSync(legacyFile)) {
      const manifestJson = readFileSync(legacyFile, "utf-8");
      zip.addFile("plugin.json", Buffer.from(manifestJson, "utf-8"));
      return zip.toBuffer();
    }

    // Fallback: If manifest exists in memory
    if (reg.manifest) {
      zip.addFile("plugin.json", Buffer.from(JSON.stringify(reg.manifest, null, 2), "utf-8"));
      return zip.toBuffer();
    }

    return null;
  }

  /**
   * Export a plugin manifest as a downloadable JSON / .aiplugin.json object.
   * Built-in native core plugins are protected and cannot be exported.
   */
  exportPluginManifest(pluginId: string): PluginManifest | null {
    const reg = this.plugins.get(pluginId);
    if (!reg) return null;

    // Built-in core plugins cannot be exported
    if (!reg.isCustom && !reg.manifest) {
      return null;
    }

    if (reg.manifest) {
      return reg.manifest;
    }

    // Check if there is a package in plugins/installed/
    try {
      const installedPath = resolve(CUSTOM_PLUGINS_INSTALLED_DIR, `${pluginId}.aiplugin.json`);
      if (existsSync(installedPath)) {
        const raw = readFileSync(installedPath, "utf-8");
        return JSON.parse(raw);
      }
    } catch {}

    return null;
  }

  /**
   * Load and re-register all persisted custom plugins from plugins/installed/, plugins/custom/, and SQLite storage on app startup.
   */
  async loadPersistedCustomPlugins(): Promise<void> {
    this.ensureCustomPluginsDir();
    const loadedIds = new Set<string>();

    // 1. Scan and load all packages/directories from bundled asar and user plugins/installed/
    const pluginDirsToScan = Array.from(
      new Set([BUNDLED_PLUGINS_DIR, CUSTOM_PLUGINS_INSTALLED_DIR])
    ).filter((dir) => existsSync(dir));

    for (const pluginDir of pluginDirsToScan) {
      try {
        const entries = readdirSync(pluginDir);
        // Pass 1: Load all directory bundles
        for (const entry of entries) {
          const fullPath = resolve(pluginDir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            const res = this.loadPluginFromDirectory(fullPath, false);
            if (res.success && res.plugin) loadedIds.add(res.plugin.id);
          }
        }
        // Pass 2: Load standalone .aiplugin.json files if not already loaded from directory
        for (const entry of entries) {
          if (entry.endsWith(".aiplugin.json")) {
            const baseId = entry.replace(/\.aiplugin\.json$/, "");
            if (loadedIds.has(baseId)) continue;
            const fullPath = resolve(pluginDir, entry);
            try {
              const content = readFileSync(fullPath, "utf-8");
              const manifest = JSON.parse(content);
              const res = this.installPluginFromManifest(manifest, false);
              if (res.success && res.plugin) loadedIds.add(res.plugin.id);
            } catch (fileErr: any) {
              console.warn(`[PluginManager] Failed to load plugin file '${entry}' from ${pluginDir}:`, fileErr.message);
            }
          }
        }
      } catch (dirErr: any) {
        console.warn(`[PluginManager] Failed to scan plugins directory '${pluginDir}':`, dirErr.message);
      }
    }

    // 2. Load any additional custom plugins from SQLite
    try {
      const db = AgentDatabase.getInstance();
      const customRows = db.listCustomPlugins();

      for (const row of customRows) {
        if (!loadedIds.has(row.id)) {
          try {
            const manifest = JSON.parse(row.manifest_json);
            this.installPluginFromManifest(manifest, true);
            loadedIds.add(row.id);
          } catch (parseErr: any) {
            console.warn(`[PluginManager] Failed to load custom plugin '${row.id}' from SQLite:`, parseErr.message);
          }
        }
      }
    } catch (err: any) {
      console.warn("[PluginManager] Failed to query custom plugins from SQLite on startup:", err.message);
    }
  }

  /**
   * Hot-reload all custom plugins dynamically from disk without restarting the server.
   */
  async reloadCustomPlugins(): Promise<{ count: number; plugins: PluginInfo[] }> {
    for (const [id, reg] of Array.from(this.plugins.entries())) {
      if (reg.isCustom) {
        this.plugins.delete(id);
      }
    }
    await this.loadPersistedCustomPlugins();
    return {
      count: this.plugins.size,
      plugins: this.getPluginsInfo(),
    };
  }

  /**
   * Sandbox test execution of any arbitrary tool handler without installing it.
   */
  async testCustomTool(
    toolDef: ManifestTool,
    testParams: Record<string, unknown> = {}
  ): Promise<{ success: boolean; result?: any; error?: string; logs: string[] }> {
    const logs: string[] = [];
    const testConsole = {
      log: (...args: any[]) =>
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")),
      warn: (...args: any[]) =>
        logs.push("[WARN] " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")),
      error: (...args: any[]) =>
        logs.push("[ERROR] " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")),
      info: (...args: any[]) =>
        logs.push("[INFO] " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")),
    };

    try {
      const handler = this.compileManifestToolHandler(toolDef, testConsole);
      const result = await handler(testParams);
      return { success: !result.error, result, logs };
    } catch (err: any) {
      return { success: false, error: err.message || String(err), logs };
    }
  }

  /**
   * Toggle a plugin ON or OFF at runtime and persist state across restarts.
   * Returns true if the plugin was found and toggled.
   */
  setPluginEnabled(pluginId: string, enabled: boolean): boolean {
    const reg = this.plugins.get(pluginId);
    if (!reg) return false;

    reg.enabled = enabled;
    this.persistPluginStates();
    this.emit("plugin:toggled", { id: pluginId, name: reg.plugin.name, enabled });
    return true;
  }

  /** Check if a plugin is currently enabled. */
  isPluginEnabled(pluginId: string): boolean {
    const reg = this.plugins.get(pluginId);
    return reg ? reg.enabled : true;
  }

  /**
   * Register a standalone tool directly (fallback/ad-hoc tools).
   */
  registerTool(schema: ToolSchema, handler: ToolHandler): void {
    if (this.standaloneTools.has(schema.name)) {
      this.emit("warning", `Tool "${schema.name}" is being re-registered.`);
    }

    this.standaloneTools.set(schema.name, { schema, handler });
    this.emit("tool:registered", schema.name);
  }

  /**
   * Unregister a standalone tool directly.
   */
  unregisterTool(name: string): boolean {
    const deleted = this.standaloneTools.delete(name);
    if (deleted) {
      this.emit("tool:unregistered", name);
    }
    return deleted;
  }

  /** Returns all active tool schemas for enabled plugins (for LLM function declarations). */
  getToolSchemas(): ToolSchema[] {
    const schemas: ToolSchema[] = [];

    // 1. Schemas from enabled plugins
    for (const reg of this.plugins.values()) {
      if (reg.enabled) {
        for (const tool of reg.tools.values()) {
          schemas.push(tool.schema);
        }
      }
    }

    // 2. Schemas from standalone tools
    for (const tool of this.standaloneTools.values()) {
      schemas.push(tool.schema);
    }

    return schemas;
  }

  /** Returns the list of currently active tool names. */
  getToolNames(): string[] {
    return this.getToolSchemas().map((s) => s.name);
  }

  /** Returns structured introspection info for all registered plugins. */
  getPluginsInfo(): PluginInfo[] {
    const info: PluginInfo[] = [];

    for (const [id, reg] of this.plugins.entries()) {
      info.push({
        id,
        name: reg.plugin.name,
        description: reg.plugin.description || "Custom agent tool extension.",
        icon: reg.plugin.icon || "🔌",
        enabled: reg.enabled,
        isCustom: reg.isCustom,
        canUninstall: reg.isCustom,
        version: reg.manifest?.version || "1.0.0",
        author: reg.manifest?.author || (reg.isCustom ? "Custom" : "AI Plate Core"),
        category: reg.plugin.category || (reg.isCustom ? "custom" : "builtin"),
        toolCount: reg.tools.size,
        tools: Array.from(reg.tools.values()).map((t) => ({
          name: t.schema.name,
          description: t.schema.description,
          parameters: t.schema.parametersJsonSchema || t.schema.parameters,
          parametersJsonSchema: t.schema.parametersJsonSchema || t.schema.parameters,
        })),
        ui_extension: reg.uiExtension || reg.manifest?.ui_extension || reg.plugin.ui_extension,
        quick_actions: reg.manifest?.quick_actions || (reg.plugin as any).quick_actions,
      });
    }

    return info;
  }

  /**
   * Returns all active UI Extensions for currently enabled plugins.
   */
  getActiveUIExtensions(): UIExtensionManifest[] {
    const list: UIExtensionManifest[] = [];
    for (const [id, reg] of this.plugins.entries()) {
      if (reg.enabled) {
        const ext = reg.uiExtension || reg.manifest?.ui_extension || reg.plugin.ui_extension;
        if (ext) {
          list.push({
            ...ext,
            pluginId: id,
            name: ext.name || reg.plugin.name,
            icon: ext.icon || reg.plugin.icon || "🎨",
          });
        }
      }
    }
    return list;
  }

  /**
   * Find a registered tool and verify its plugin's active status.
   */
  private findTool(name: string): { tool: RegisteredTool; pluginName?: string; isEnabled: boolean } | null {
    // Check plugins
    for (const reg of this.plugins.values()) {
      if (reg.tools.has(name)) {
        return {
          tool: reg.tools.get(name)!,
          pluginName: reg.plugin.name,
          isEnabled: reg.enabled,
        };
      }
    }

    // Check standalone
    if (this.standaloneTools.has(name)) {
      return {
        tool: this.standaloneTools.get(name)!,
        isEnabled: true,
      };
    }

    return null;
  }

  /**
   * Execute a tool by name with the given arguments.
   * Returns a structured ToolExecutionResult.
   */
  async executeTool(
    name: string,
    args: Record<string, unknown>,
    context?: { sessionId?: string }
  ): Promise<ToolExecutionResult> {
    const match = this.findTool(name);

    if (!match) {
      const errorResult: ToolExecutionResult = {
        name,
        response: {
          error: `Tool "${name}" is not registered. Available tools: ${this.getToolNames().join(", ") || "(none)"}`,
        },
      };
      this.emit("tool:error", name, errorResult.response, context);
      return errorResult;
    }

    if (!match.isEnabled) {
      const errorResult: ToolExecutionResult = {
        name,
        response: {
          error: `Plugin "${match.pluginName || name}" is currently DISABLED. Please enable it in Settings > Plugins to execute this tool.`,
        },
      };
      this.emit("tool:error", name, errorResult.response, context);
      return errorResult;
    }

    this.emit("tool:executing", name, args, context);

    try {
      const response = await match.tool.handler(args, context);
      const result: ToolExecutionResult = { name, response };
      this.emit("tool:completed", name, response, context);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorResult: ToolExecutionResult = {
        name,
        response: { error: `Tool "${name}" failed: ${errorMsg}` },
      };
      this.emit("tool:error", name, errorResult.response, context);
      return errorResult;
    }
  }

  /** Clear all registered tools and plugins. */
  clearTools(): void {
    this.plugins.clear();
    this.standaloneTools.clear();
    this.emit("tools:cleared");
  }
}
