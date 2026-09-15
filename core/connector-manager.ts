/**
 * App Connector Manager — AI Plate (Open Power)
 *
 * Provides a modular, high-speed integration bridge to connect to,
 * test, and control external desktop & creative applications:
 *   - Blender 3D (via companion HTTP/WS bridge or CLI)
 *   - OBS Studio (via obs-websocket v5 protocol)
 *   - ComfyUI / Stable Diffusion (via REST API)
 *   - Godot Game Engine (via HTTP/RPC)
 *   - Custom REST / WebSocket APIs
 *
 * Dynamically registers and unregisters function-calling tools with
 * the LLM Reasoning Agent based on active connection state.
 */

import { EventEmitter } from "node:events";
import { exec, execSync, spawn } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { AgentDatabase } from "./database.js";
import { PluginManager } from "./plugin-manager.js";
import type { ToolSchema, ToolHandler } from "./types.js";
import { CONFIG, logVerbose } from "./config.js";
import { PythonEngine } from "./python-engine.js";

// ─── Interfaces ───────────────────────────────────────────────────────

export type ConnectorType = "blender" | "obs" | "comfyui" | "godot" | "custom_rest" | "custom_ws";

export interface CustomToolEndpoint {
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  parametersJsonSchema?: any;
}

export interface ConnectorManifest {
  manifest_type: "connector";
  id: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  icon_url?: string;
  type?: ConnectorType;
  connection: {
    protocol: "http" | "https" | "ws" | "wss";
    host: string;
    port: number;
    authType?: "none" | "bearer" | "apikey" | "basic";
    authToken?: string;
    customHeaders?: Record<string, string>;
  };
  options?: Record<string, any>;
  companion_script?: string;
  endpoints?: CustomToolEndpoint[];
}

export interface ConnectorConfig {
  id: string;
  name: string;
  type: ConnectorType;
  description: string;
  icon: string;
  icon_url?: string;
  enabled: boolean;
  host: string;
  port: number;
  protocol?: "http" | "https" | "ws" | "wss";
  authType?: "none" | "bearer" | "apikey" | "basic";
  authToken?: string;
  autoStartCompanion?: boolean;
  customHeaders?: Record<string, string>;
  customTools?: CustomToolEndpoint[];
  options?: Record<string, any>;
  isModular?: boolean;
  packageDir?: string;
  lastTestedAt?: string;
  lastStatus?: "connected" | "offline" | "untested" | "error";
  lastLatencyMs?: number;
  lastErrorMessage?: string;
}

export interface CompanionProcessInfo {
  id: string;
  pid?: number;
  status: "running" | "stopped" | "crashed" | "starting";
  startedAt?: string;
  lastError?: string;
  scriptPath?: string;
  port?: number;
  autoStart?: boolean;
}

export interface ConnectorTestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, any>;
}

export function normalizeParameterSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(normalizeParameterSchema);

  const copy: Record<string, any> = { ...schema };

  // Guarantee that array types declare an items schema for LLM providers (e.g. Gemini OpenAPI schema)
  if (copy.type === "array") {
    if (!copy.items || typeof copy.items !== "object") {
      copy.items = { type: "string" };
    } else {
      copy.items = normalizeParameterSchema(copy.items);
    }
  }

  // Recursively sanitize nested properties
  if (copy.properties && typeof copy.properties === "object") {
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(copy.properties)) {
      props[k] = normalizeParameterSchema(v);
    }
    copy.properties = props;
  }

  // Recursively sanitize items if defined on non-array
  if (copy.items && typeof copy.items === "object" && copy.type !== "array") {
    copy.items = normalizeParameterSchema(copy.items);
  }

  return copy;
}

const CONNECTORS_META_KEY = "ai_plate_app_connectors_config";
const _userBase = () => process.env.AIPLATE_USERDATA || process.cwd();
const ARTIFACTS_DIR = resolve(_userBase(), CONFIG.SHELL.ARTIFACTS_DIR || "artifacts");
const SANDBOX_DIR = resolve(_userBase(), CONFIG.SHELL.SANDBOX_DIR || ".sandbox");
export const INSTALLED_CONNECTORS_DIR = resolve(_userBase(), "connectors", "installed");

// ─── Default Preset Connectors ────────────────────────────────────────

export const DEFAULT_CONNECTOR_PRESETS: ConnectorConfig[] = [];

// ─── High-Speed WebSocket Client for Blender Bridge ─────────────────

export class BlenderWebSocketClient {
  private static instances = new Map<string, BlenderWebSocketClient>();
  private ws: any = null;
  private pending = new Map<string, { resolve: (data: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }>();
  private connectPromise: Promise<void> | null = null;

  public static getInstance(url: string): BlenderWebSocketClient {
    if (!this.instances.has(url)) {
      this.instances.set(url, new BlenderWebSocketClient(url));
    }
    return this.instances.get(url)!;
  }

  constructor(private url: string) {}

  public async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === 1) return; // 1 = OPEN
    if (this.connectPromise) return this.connectPromise;

    const WS = (globalThis as any).WebSocket;
    if (!WS) throw new Error("WebSocket API not available in runtime");

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        const socket = new WS(this.url);
        const timeout = setTimeout(() => {
          try { socket.close(); } catch {}
          reject(new Error("Blender WebSocket connection timeout"));
        }, 3000);

        socket.onopen = () => {
          clearTimeout(timeout);
          this.ws = socket;
          this.connectPromise = null;
          resolve();
        };

        socket.onmessage = (event: any) => {
          try {
            const raw = typeof event.data === "string" ? event.data : event.data?.toString?.();
            const msg = JSON.parse(raw);
            const reqId = msg.id;
            if (reqId && this.pending.has(reqId)) {
              const { resolve: reqResolve, reject: reqReject, timer } = this.pending.get(reqId)!;
              clearTimeout(timer);
              this.pending.delete(reqId);
              if (msg.success) {
                reqResolve(msg.data !== undefined ? msg.data : msg);
              } else {
                reqReject(new Error(msg.error || "Blender WebSocket error"));
              }
            }
          } catch {}
        };

        socket.onerror = () => {
          clearTimeout(timeout);
          this.connectPromise = null;
          reject(new Error("Blender WebSocket error"));
        };

        socket.onclose = () => {
          this.ws = null;
          this.connectPromise = null;
        };
      } catch (err) {
        this.connectPromise = null;
        reject(err);
      }
    });

    return this.connectPromise;
  }

  public async sendAction(action: string, params: Record<string, any> = {}, timeoutMs = 15000): Promise<any> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error("Blender WebSocket is not connected");
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = { id, action, ...params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Blender WebSocket action '${action}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(payload));
    });
  }

  public close(): void {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.connectPromise = null;
  }
}

export class ObsWebSocketClient {
  private static instances = new Map<string, ObsWebSocketClient>();
  private ws: any = null;
  private pending = new Map<string, { resolve: (data: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }>();
  private connectPromise: Promise<void> | null = null;
  private identified = false;

  public static getInstance(url: string, password = ""): ObsWebSocketClient {
    const key = `${url}__${password}`;
    if (!this.instances.has(key)) {
      this.instances.set(key, new ObsWebSocketClient(url, password));
    }
    return this.instances.get(key)!;
  }

  constructor(private url: string, private password = "") {}

  public async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === 1 && this.identified) return;
    if (this.connectPromise) return this.connectPromise;

    const WS = (globalThis as any).WebSocket;
    if (!WS) throw new Error("WebSocket API not available in runtime");

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        const socket = new WS(this.url);
        let identifiedResolved = false;

        const timeout = setTimeout(() => {
          try { socket.close(); } catch {}
          this.connectPromise = null;
          reject(new Error("OBS WebSocket connection timeout"));
        }, 4000);

        socket.onopen = () => {
          this.ws = socket;
        };

        socket.onmessage = (event: any) => {
          try {
            const raw = typeof event.data === "string" ? event.data : event.data?.toString?.();
            const msg = JSON.parse(raw);

            // Opcode 0: Hello from OBS
            if (msg.op === 0) {
              const helloData = msg.d || {};
              const identifyPayload: any = {
                op: 1,
                d: {
                  rpcVersion: helloData.rpcVersion || 1,
                },
              };

              // Authentication challenge response if password configured
              if (helloData.authentication) {
                const { salt, challenge } = helloData.authentication;
                const pass = this.password || "";
                const passHash = crypto.createHash("sha256").update(pass + salt).digest("base64");
                const authSecret = crypto.createHash("sha256").update(passHash + challenge).digest("base64");
                identifyPayload.d.authentication = authSecret;
              }

              socket.send(JSON.stringify(identifyPayload));
            }
            // Opcode 2: Identified confirmation from OBS
            else if (msg.op === 2) {
              clearTimeout(timeout);
              this.identified = true;
              identifiedResolved = true;
              this.connectPromise = null;
              resolve();
            }
            // Opcode 7: RequestResponse
            else if (msg.op === 7) {
              const reqData = msg.d || {};
              const reqId = reqData.requestId;
              if (reqId && this.pending.has(reqId)) {
                const { resolve: reqResolve, reject: reqReject, timer } = this.pending.get(reqId)!;
                clearTimeout(timer);
                this.pending.delete(reqId);
                const status = reqData.requestStatus || {};
                if (status.result) {
                  reqResolve(reqData.responseData || { success: true });
                } else {
                  const errorMsg = status.comment || `OBS command failed (Code: ${status.code})`;
                  reqReject(new Error(errorMsg));
                }
              }
            }
          } catch {}
        };

        socket.onerror = () => {
          clearTimeout(timeout);
          this.connectPromise = null;
          this.identified = false;
          if (!identifiedResolved) reject(new Error("OBS WebSocket error"));
        };

        socket.onclose = () => {
          this.ws = null;
          this.identified = false;
          this.connectPromise = null;
        };
      } catch (err) {
        this.connectPromise = null;
        reject(err);
      }
    });

    return this.connectPromise;
  }

  public async callRequest(requestType: string, requestData: Record<string, any> = {}, timeoutMs = 8000): Promise<any> {
    await this.connect();
    if (!this.ws || this.ws.readyState !== 1 || !this.identified) {
      throw new Error("OBS WebSocket is not connected or identified");
    }

    const requestId = `obs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      op: 6,
      d: {
        requestType,
        requestId,
        requestData,
      },
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS command '${requestType}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });
      this.ws.send(JSON.stringify(payload));
    });
  }

  public close(): void {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.identified = false;
    this.connectPromise = null;
  }
}

// ─── Connector Manager Implementation ─────────────────────────────────

export class ConnectorManager extends EventEmitter {
  private static instance: ConnectorManager | null = null;
  private connectors: Map<string, ConnectorConfig> = new Map();
  private registeredToolNames: Set<string> = new Set();
  private pluginManager: PluginManager;
  private companionProcesses = new Map<
    string,
    {
      process: ReturnType<typeof spawn>;
      pid: number;
      startedAt: string;
      status: "running" | "stopped" | "crashed" | "starting";
      lastError?: string;
      scriptPath: string;
      port: number;
      recentLogs: string[];
    }
  >();
  private companionStatusHistory = new Map<string, CompanionProcessInfo>();

  private constructor() {
    super();
    this.pluginManager = PluginManager.getInstance();
    this.ensureDirectories();
    this.loadPersistedConnectors();
    this.loadInstalledConnectorPackages();
    for (const connector of this.connectors.values()) {
      if (connector.enabled && connector.autoStartCompanion !== false) {
        this.startCompanion(connector).catch((err) => {
          logVerbose("warn", `Auto-start companion for '${connector.id}' failed: ${err.message}`);
        });
      }
    }

    const shutdownHandler = () => this.stopAllCompanions();
    process.once("exit", shutdownHandler);
    process.once("SIGINT", shutdownHandler);
    process.once("SIGTERM", shutdownHandler);
  }

  private ensureDirectories(): void {
    try {
      if (!existsSync(INSTALLED_CONNECTORS_DIR)) {
        mkdirSync(INSTALLED_CONNECTORS_DIR, { recursive: true });
      }
    } catch {}
  }

  public static getInstance(): ConnectorManager {
    if (!ConnectorManager.instance) {
      ConnectorManager.instance = new ConnectorManager();
    }
    return ConnectorManager.instance;
  }

  /**
   * Validate a connector manifest with strict schema rules.
   * Strictly isolates connectors from standard UI/tool plugins.
   */
  public static validateConnectorManifest(data: any): { valid: boolean; manifest?: ConnectorManifest; error?: string } {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "Connector manifest must be a valid JSON object" };
    }

    // Strict Isolation: Reject standard plugin style manifests
    if (
      data.manifest_version !== undefined ||
      data.ui_extension !== undefined ||
      (data.tools && Array.isArray(data.tools) && data.manifest_type !== "connector")
    ) {
      return {
        valid: false,
        error: "Validation Error: This package is a standard UI/Tool Plugin. Please install standard plugins in the Plugins tab.",
      };
    }

    if (!data.id || typeof data.id !== "string" || !/^[a-z0-9_-]+$/i.test(data.id)) {
      return { valid: false, error: "Connector manifest 'id' is required and must be alphanumeric (a-z, 0-9, _, -)" };
    }

    if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
      return { valid: false, error: "Connector manifest 'name' is required" };
    }

    // Connection configuration block or top-level fields
    const conn = data.connection || {};
    const protocol = (conn.protocol || data.protocol || "http").toLowerCase();
    const host = (conn.host || data.host || "localhost").trim();
    const rawPort = conn.port !== undefined ? conn.port : data.port;
    const port = Number(rawPort);

    if (!["http", "https", "ws", "wss"].includes(protocol)) {
      return { valid: false, error: `Invalid connection protocol '${protocol}': must be http, https, ws, or wss` };
    }

    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, error: `Invalid connection port '${rawPort}': must be a valid integer between 1 and 65535` };
    }

    const manifest: ConnectorManifest = {
      manifest_type: "connector",
      id: data.id.trim(),
      name: data.name.trim(),
      version: data.version || "1.0.0",
      description: data.description || "",
      icon: data.icon || "🔌",
      icon_url: typeof data.icon_url === "string" ? data.icon_url : undefined,
      type: data.type || (protocol.startsWith("ws") ? "custom_ws" : "custom_rest"),
      connection: {
        protocol: protocol as any,
        host,
        port,
        authType: conn.authType || data.authType || "none",
        authToken: conn.authToken || data.authToken,
        customHeaders: conn.customHeaders || data.customHeaders,
      },
      options: data.options || {},
      companion_script: data.companion_script,
      endpoints: Array.isArray(data.endpoints)
        ? data.endpoints
        : Array.isArray(data.customTools)
        ? data.customTools
        : [],
    };

    return { valid: true, manifest };
  }

  /**
   * Install a modular connector from a .zip package buffer.
   */
  public async installConnectorZip(zipBuffer: Buffer): Promise<{ success: boolean; connector?: ConnectorConfig; error?: string }> {
    try {
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      // Check for forbidden standard plugin manifest
      const hasPluginJson = zipEntries.some((e) => e.entryName.toLowerCase().endsWith("plugin.json"));
      const connectorEntry = zipEntries.find((e) => e.entryName.toLowerCase().endsWith("connector.json"));

      if (hasPluginJson && !connectorEntry) {
        return {
          success: false,
          error: "Validation Error: This package is a standard UI/Tool Plugin. Please install standard plugins in the Plugins tab.",
        };
      }

      if (!connectorEntry) {
        return {
          success: false,
          error: "Invalid connector package: 'connector.json' manifest was not found in the archive root.",
        };
      }

      const manifestContent = connectorEntry.getData().toString("utf-8");
      const parsed = JSON.parse(manifestContent);
      const validation = ConnectorManager.validateConnectorManifest(parsed);
      if (!validation.valid || !validation.manifest) {
        return { success: false, error: validation.error || "Invalid connector manifest" };
      }

      const m = validation.manifest;
      const targetDir = join(INSTALLED_CONNECTORS_DIR, m.id);
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      mkdirSync(targetDir, { recursive: true });

      zip.extractAllTo(targetDir, true);

      const config: ConnectorConfig = {
        id: m.id,
        name: m.name,
        type: m.type || (m.connection.protocol.startsWith("ws") ? "custom_ws" : "custom_rest"),
        description: m.description || "",
        icon: m.icon || "🔌",
        icon_url: m.icon_url,
        enabled: true,
        host: m.connection.host,
        port: m.connection.port,
        protocol: m.connection.protocol,
        authType: m.connection.authType,
        authToken: m.connection.authToken,
        autoStartCompanion: m.companion_script ? true : undefined,
        customHeaders: m.connection.customHeaders,
        customTools: m.endpoints,
        options: { ...(m.options || {}), companion_script: m.companion_script, version: m.version },
        isModular: true,
        packageDir: targetDir,
        lastStatus: "untested",
      };

      const saved = this.saveConnector(config);
      return { success: true, connector: saved };
    } catch (err: any) {
      return { success: false, error: `Failed to install connector package: ${err.message}` };
    }
  }

  /**
   * Export a connector configuration as a complete portable .connector.zip package.
   */
  public exportConnector(id: string): { filename: string; bufferBase64: string; manifestJson: string } | null {
    const conn = this.connectors.get(id);
    if (!conn) return null;

    const manifest: ConnectorManifest = {
      manifest_type: "connector",
      id: conn.id,
      name: conn.name,
      version: conn.options?.version || "1.0.0",
      description: conn.description || "",
      icon: conn.icon || "🔌",
      icon_url: conn.icon_url,
      type: conn.type,
      connection: {
        protocol: conn.protocol || "http",
        host: conn.host,
        port: conn.port,
        authType: conn.authType || "none",
        authToken: conn.authToken,
        customHeaders: conn.customHeaders,
      },
      options: conn.options || {},
      companion_script: conn.options?.companion_script,
      endpoints: conn.customTools || [],
    };

    const zip = new AdmZip();
    zip.addFile("connector.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));

    // If installed package directory has companion scripts or files, include them
    if (conn.packageDir && existsSync(conn.packageDir)) {
      try {
        const files = readdirSync(conn.packageDir, { withFileTypes: true });
        for (const file of files) {
          if (file.name === "connector.json") continue;
          const fullPath = join(conn.packageDir, file.name);
          if (file.isDirectory()) {
            zip.addLocalFolder(fullPath, file.name);
          } else {
            zip.addLocalFile(fullPath);
          }
        }
      } catch {}
    }

    const zipBuffer = zip.toBuffer();
    return {
      filename: `${conn.id}.connector.zip`,
      bufferBase64: zipBuffer.toString("base64"),
      manifestJson: JSON.stringify(manifest, null, 2),
    };
  }

  /**
   * Scan connectors/installed/ directory and load any modular connector packages.
   */
  private loadInstalledConnectorPackages(): void {
    try {
      if (!existsSync(INSTALLED_CONNECTORS_DIR)) {
        mkdirSync(INSTALLED_CONNECTORS_DIR, { recursive: true });
        return;
      }

      const entries = readdirSync(INSTALLED_CONNECTORS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = join(INSTALLED_CONNECTORS_DIR, entry.name);
        const manifestPath = join(dirPath, "connector.json");
        if (existsSync(manifestPath)) {
          try {
            const raw = readFileSync(manifestPath, "utf-8");
            const parsed = JSON.parse(raw);
            const validation = ConnectorManager.validateConnectorManifest(parsed);
            if (validation.valid && validation.manifest) {
              const m = validation.manifest;
              if (!this.connectors.has(m.id)) {
                const config: ConnectorConfig = {
                  id: m.id,
                  name: m.name,
                  type: m.type || (m.connection.protocol.startsWith("ws") ? "custom_ws" : "custom_rest"),
                  description: m.description || "",
                  icon: m.icon || "🔌",
                  enabled: false,
                  host: m.connection.host,
                  port: m.connection.port,
                  protocol: m.connection.protocol,
                  authType: m.connection.authType,
                  authToken: m.connection.authToken,
                  autoStartCompanion: m.companion_script ? true : undefined,
                  customHeaders: m.connection.customHeaders,
                  customTools: m.endpoints,
                  options: { ...(m.options || {}), companion_script: m.companion_script, version: m.version },
                  isModular: true,
                  packageDir: dirPath,
                  lastStatus: "untested",
                };
                this.connectors.set(m.id, config);
              }
            }
          } catch (err: any) {
            logVerbose("warn", `Error loading modular connector from ${dirPath}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      logVerbose("warn", `Error scanning installed connectors: ${err.message}`);
    }
  }

  /**
   * Load stored connectors from SQLite or initialize defaults.
   */
  private loadPersistedConnectors(): void {
    try {
      const db = AgentDatabase.getInstance();
      const raw = db.getMeta(CONNECTORS_META_KEY);
      if (raw) {
        const list: ConnectorConfig[] = JSON.parse(raw);
        for (const item of list) {
          // Ephemeral test status starts fresh on each application launch
          const cleanItem = {
            ...item,
            lastStatus: "untested" as const,
            lastLatencyMs: undefined,
            lastTestedAt: undefined,
            lastErrorMessage: undefined,
          };
          this.connectors.set(cleanItem.id, cleanItem);
        }
      }
    } catch (err: any) {
      logVerbose("warn", `ConnectorManager load error: ${err.message}`);
    }

    // Merge default presets if missing
    for (const preset of DEFAULT_CONNECTOR_PRESETS) {
      if (!this.connectors.has(preset.id)) {
        this.connectors.set(preset.id, { ...preset, lastStatus: "untested" as const });
      }
    }

    // Sync tools for enabled connectors
    this.syncToolsToPluginManager();
  }

  /**
   * Persist connectors configuration to SQLite (ephemeral test status excluded).
   */
  private persistConnectors(): void {
    try {
      const db = AgentDatabase.getInstance();
      const list = Array.from(this.connectors.values()).map((c) => {
        // Strip ephemeral test state so app restarts always start fresh
        const { lastStatus, lastLatencyMs, lastTestedAt, lastErrorMessage, ...persistedConfig } = c;
        return persistedConfig;
      });
      db.setMeta(CONNECTORS_META_KEY, JSON.stringify(list));
    } catch (err: any) {
      logVerbose("warn", `ConnectorManager persist error: ${err.message}`);
    }
  }

  /**
   * Get all configured connectors.
   */
  public getAllConnectors(): ConnectorConfig[] {
    return Array.from(this.connectors.values());
  }

  public readPackageDocs(id: string): { readme: string; setup: string } {
    const connector = this.connectors.get(id);
    if (!connector?.packageDir) return { readme: "", setup: "" };
    const read = (filename: string) => {
      const filePath = join(connector.packageDir!, filename);
      return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    };
    return { readme: read("README.md"), setup: read("SETUP.md") };
  }

  /**
   * Get single connector by ID.
   */
  public getConnector(id: string): ConnectorConfig | undefined {
    return this.connectors.get(id);
  }

  /**
   * Save or update a connector configuration.
   */
  public saveConnector(config: ConnectorConfig): ConnectorConfig {
    const existing = this.connectors.get(config.id);
    const updated: ConnectorConfig = {
      ...(existing || {}),
      ...config,
      options: { ...(existing?.options || {}), ...(config.options || {}) },
    };

    // Synchronize token into .env on disk immediately if packageDir exists
    if (updated.packageDir && existsSync(updated.packageDir) && updated.authToken) {
      try {
        const envPath = join(updated.packageDir, ".env");
        let envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
        if (/SPOTIFY_ACCESS_TOKEN=/i.test(envContent)) {
          envContent = envContent.replace(/SPOTIFY_ACCESS_TOKEN=.*/i, `SPOTIFY_ACCESS_TOKEN=${updated.authToken}`);
        } else if (updated.id === "spotify_api") {
          envContent = `SPOTIFY_ACCESS_TOKEN=${updated.authToken}\n` + envContent;
        }
        if (!/AUTH_TOKEN=/i.test(envContent)) {
          envContent += `\nAUTH_TOKEN=${updated.authToken}\n`;
        }
        writeFileSync(envPath, envContent.trim() + "\n", "utf8");
      } catch {}
    }

    this.connectors.set(updated.id, updated);
    this.persistConnectors();
    this.syncToolsToPluginManager();
    this.emit("connector:updated", updated);

    // Process companion lifecycle
    if (
      updated.enabled &&
      updated.autoStartCompanion !== false &&
      (updated.options?.companion_script || updated.packageDir)
    ) {
      const current = this.companionProcesses.get(updated.id);
      if (!current) {
        this.startCompanion(updated).catch(() => {});
      } else {
        this.restartCompanion(updated.id).catch(() => {});
      }
    } else if (!updated.enabled || updated.autoStartCompanion === false) {
      this.stopCompanion(updated.id).catch(() => {});
    }
    return updated;
  }

  /**
   * Toggle connector enabled state.
   */
  public toggleConnector(id: string, enabled: boolean): ConnectorConfig | null {
    const connector = this.connectors.get(id);
    if (!connector) return null;

    connector.enabled = enabled;
    this.connectors.set(id, connector);
    this.persistConnectors();
    this.syncToolsToPluginManager();
    this.emit("connector:toggled", { id, enabled });
    if (enabled) {
      if (connector.autoStartCompanion !== false) {
        this.startCompanion(connector).catch(() => {});
      }
    } else {
      this.stopCompanion(id).catch(() => {});
    }
    return connector;
  }

  /**
   * Delete a custom or modular connector.
   */
  public deleteConnector(id: string): boolean {
    const connector = this.connectors.get(id);
    if (!connector) return false;

    this.stopCompanion(id).catch(() => {});

    // Clean up installed modular directory if present
    if (connector.packageDir && existsSync(connector.packageDir)) {
      try {
        rmSync(connector.packageDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    } else {
      const fallbackDir = join(INSTALLED_CONNECTORS_DIR, id);
      if (existsSync(fallbackDir)) {
        try {
          rmSync(fallbackDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
      }
    }

    this.companionStatusHistory.delete(id);
    this.connectors.delete(id);
    this.persistConnectors();
    this.syncToolsToPluginManager();
    this.emit("connector:deleted", id);
    return true;
  }

  /**
   * Start companion script for a connector with lifecycle tracking and environment injection.
   */
  public async startCompanion(
    idOrConnector: string | ConnectorConfig
  ): Promise<{ success: boolean; pid?: number; error?: string }> {
    const connector = typeof idOrConnector === "string" ? this.connectors.get(idOrConnector) : idOrConnector;
    if (!connector) return { success: false, error: "Connector not found" };

    if (!connector.isModular || !connector.packageDir) {
      return { success: false, error: `Connector '${connector.id}' is not a modular package with a local companion script.` };
    }

    const scriptName = connector.options?.companion_script;
    if (typeof scriptName !== "string" || !scriptName.trim()) {
      return { success: false, error: `Connector '${connector.id}' does not declare a companion_script.` };
    }

    const scriptPath = join(connector.packageDir, scriptName);
    if (!existsSync(scriptPath)) {
      return { success: false, error: `Companion script not found at ${scriptPath}` };
    }

    // Check if already running and alive
    const existingEntry = this.companionProcesses.get(connector.id);
    if (existingEntry && !existingEntry.process.killed) {
      return { success: true, pid: existingEntry.pid };
    }

    // Update status to starting
    this.companionStatusHistory.set(connector.id, {
      id: connector.id,
      status: "starting",
      startedAt: new Date().toISOString(),
      scriptPath,
      port: connector.port,
      autoStart: connector.autoStartCompanion !== false,
    });
    this.emit("companion:status", this.companionStatusHistory.get(connector.id));

    // Prepare environment variables
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    const envPath = join(connector.packageDir, ".env");
    if (existsSync(envPath)) {
      try {
        for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
          const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
          if (match) env[match[1].trim()] = match[2].replace(/^['"]|['"]$/g, "");
        }
      } catch {}
    }

    // Token configuration injection
    if (connector.authToken) {
      env.AUTH_TOKEN = connector.authToken;
      // Spotify companion expects SPOTIFY_ACCESS_TOKEN
      if (connector.id === "spotify_api" || !env.SPOTIFY_ACCESS_TOKEN) {
        env.SPOTIFY_ACCESS_TOKEN = connector.authToken;
      }
      // Also write / update .env so it stays synchronized on disk
      try {
        let envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
        if (/SPOTIFY_ACCESS_TOKEN=/i.test(envContent)) {
          envContent = envContent.replace(/SPOTIFY_ACCESS_TOKEN=.*/i, `SPOTIFY_ACCESS_TOKEN=${connector.authToken}`);
        } else if (connector.id === "spotify_api") {
          envContent = `SPOTIFY_ACCESS_TOKEN=${connector.authToken}\n` + envContent;
        }
        if (!/AUTH_TOKEN=/i.test(envContent)) {
          envContent += `\nAUTH_TOKEN=${connector.authToken}\n`;
        }
        writeFileSync(envPath, envContent.trim() + "\n", "utf8");
      } catch {}
    }

    // Select runtime
    let runner = process.env.AIPLATE_NODE_EXECUTABLE || "node";
    let runnerArgs = [scriptPath];

    if (/\.py$/i.test(scriptName)) {
      try {
        const pyEngine = PythonEngine.getInstance();
        if (!pyEngine.isAvailable) {
          await pyEngine.initialize().catch(() => {});
        }
        runner = process.env.AIPLATE_PYTHON_EXECUTABLE || pyEngine.executable || (process.platform === "win32" ? "python" : "python3");
      } catch {
        runner = process.env.AIPLATE_PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");
      }
      // Pass -u for unbuffered streaming so logs appear immediately
      runnerArgs = ["-u", scriptPath];
    }

    const recentLogs: string[] = [];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(runner, runnerArgs, {
        cwd: connector.packageDir,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (spawnErr: any) {
      const errMsg = `Failed to spawn companion: ${spawnErr.message}`;
      this.companionStatusHistory.set(connector.id, {
        id: connector.id,
        status: "crashed",
        lastError: errMsg,
        scriptPath,
        port: connector.port,
        autoStart: connector.autoStartCompanion !== false,
      });
      this.emit("companion:status", this.companionStatusHistory.get(connector.id));
      return { success: false, error: errMsg };
    }

    const pid = child.pid || 0;
    const processEntry = {
      process: child,
      pid,
      startedAt: new Date().toISOString(),
      status: "running" as const,
      scriptPath,
      port: connector.port,
      recentLogs,
    };

    child.stdout?.on("data", (data: Buffer) => {
      const str = data.toString("utf-8");
      for (const line of str.split(/\r?\n/)) {
        if (line.trim()) {
          recentLogs.push(line.trim());
          logVerbose("info", `[Companion:${connector.id}] ${line.trim()}`);
        }
      }
      if (recentLogs.length > 40) recentLogs.splice(0, recentLogs.length - 40);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const str = data.toString("utf-8");
      for (const line of str.split(/\r?\n/)) {
        if (line.trim()) {
          recentLogs.push(line.trim());
          logVerbose("warn", `[Companion:${connector.id}:stderr] ${line.trim()}`);
        }
      }
      if (recentLogs.length > 40) recentLogs.splice(0, recentLogs.length - 40);
    });

    child.once("error", (error) => {
      logVerbose("warn", `Companion '${connector.id}' process error: ${error.message}`);
      this.companionProcesses.delete(connector.id);
      this.companionStatusHistory.set(connector.id, {
        id: connector.id,
        pid,
        status: "crashed",
        lastError: error.message,
        scriptPath,
        port: connector.port,
        autoStart: connector.autoStartCompanion !== false,
      });
      this.emit("companion:status", this.companionStatusHistory.get(connector.id));
    });

    child.once("exit", (code, signal) => {
      this.companionProcesses.delete(connector.id);
      const isClean = signal === "SIGTERM" || signal === "SIGKILL" || code === 0;
      const lastLine = recentLogs.slice(-2).join(" | ");
      const errMsg = !isClean ? (lastLine || `Companion exited with code ${code}`) : undefined;

      this.companionStatusHistory.set(connector.id, {
        id: connector.id,
        pid,
        status: isClean ? "stopped" : "crashed",
        lastError: errMsg,
        scriptPath,
        port: connector.port,
        autoStart: connector.autoStartCompanion !== false,
      });
      logVerbose("info", `Companion '${connector.id}' exited (code: ${code}, signal: ${signal})`);
      this.emit("companion:status", this.companionStatusHistory.get(connector.id));
    });

    this.companionProcesses.set(connector.id, processEntry);
    this.companionStatusHistory.set(connector.id, {
      id: connector.id,
      pid,
      status: "running",
      startedAt: processEntry.startedAt,
      scriptPath,
      port: connector.port,
      autoStart: connector.autoStartCompanion !== false,
    });
    this.emit("companion:status", this.companionStatusHistory.get(connector.id));
    logVerbose("info", `Started companion for connector '${connector.id}' (PID: ${pid}).`);

    return { success: true, pid };
  }

  /**
   * Stop companion process for a connector with process tree termination.
   */
  public async stopCompanion(id: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.companionProcesses.get(id);
    if (!entry) {
      const hist = this.companionStatusHistory.get(id);
      if (hist && hist.status !== "stopped") {
        hist.status = "stopped";
        this.emit("companion:status", hist);
      }
      return { success: true };
    }

    const pid = entry.pid;
    this.companionProcesses.delete(id);

    try {
      if (process.platform === "win32" && pid) {
        try {
          exec(`taskkill /F /T /PID ${pid}`, () => {});
        } catch {}
      }
      entry.process.kill("SIGTERM");
    } catch {}

    this.companionStatusHistory.set(id, {
      id,
      pid,
      status: "stopped",
      scriptPath: entry.scriptPath,
      port: entry.port,
      autoStart: this.connectors.get(id)?.autoStartCompanion !== false,
    });
    this.emit("companion:status", this.companionStatusHistory.get(id));
    logVerbose("info", `Stopped companion for connector '${id}' (PID: ${pid}).`);
    return { success: true };
  }

  /**
   * Restart companion process.
   */
  public async restartCompanion(id: string): Promise<{ success: boolean; pid?: number; error?: string }> {
    await this.stopCompanion(id);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return this.startCompanion(id);
  }

  /**
   * Get current runtime companion status for a single connector.
   */
  public getCompanionStatus(id: string): CompanionProcessInfo {
    const active = this.companionProcesses.get(id);
    const connector = this.connectors.get(id);
    if (active && !active.process.killed) {
      return {
        id,
        pid: active.pid,
        status: "running",
        startedAt: active.startedAt,
        scriptPath: active.scriptPath,
        port: active.port,
        autoStart: connector?.autoStartCompanion !== false,
      };
    }
    const history = this.companionStatusHistory.get(id);
    if (history) {
      return { ...history, autoStart: connector?.autoStartCompanion !== false };
    }
    return {
      id,
      status: "stopped",
      port: connector?.port,
      autoStart: connector?.autoStartCompanion !== false,
    };
  }

  /**
   * Get runtime companion status for all connectors.
   */
  public getAllCompanionStatuses(): Record<string, CompanionProcessInfo> {
    const result: Record<string, CompanionProcessInfo> = {};
    for (const id of this.connectors.keys()) {
      result[id] = this.getCompanionStatus(id);
    }
    return result;
  }

  /**
   * Synchronously / safely stop all active companion processes on application shutdown.
   */
  public stopAllCompanions(): void {
    for (const [id, entry] of this.companionProcesses.entries()) {
      try {
        if (process.platform === "win32" && entry.pid) {
          try {
            execSync(`taskkill /F /T /PID ${entry.pid}`, { stdio: "ignore" });
          } catch {}
        }
        entry.process.kill("SIGKILL");
      } catch {}
    }
    this.companionProcesses.clear();
    logVerbose("info", "All companion processes stopped.");
  }

  // ─── Test Connection & Ping ──────────────────────────────────────────

  public async testConnection(
    id: string,
    overrideConfig?: Partial<ConnectorConfig>
  ): Promise<ConnectorTestResult> {
    const base = this.connectors.get(id);

    // If connector has a companion script and auto-start is active, ensure companion is running before pinging
    if (base?.isModular && base.options?.companion_script && base.autoStartCompanion !== false) {
      const currentComp = this.getCompanionStatus(id);
      if (currentComp.status !== "running") {
        await this.startCompanion(base);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const cfg: ConnectorConfig = {
      ...(base || {
        id,
        name: id,
        type: "custom_rest",
        description: "",
        icon: "🔌",
        enabled: false,
        host: "localhost",
        port: 8080,
      }),
      ...(overrideConfig || {}),
    };

    const startTime = Date.now();
    let result: ConnectorTestResult;

    try {
      switch (cfg.type) {
        case "blender":
          result = await this.testBlenderConnection(cfg);
          break;
        case "obs":
          result = await this.testObsConnection(cfg);
          break;
        case "comfyui":
          result = await this.testComfyUiConnection(cfg);
          break;
        case "godot":
          result = await this.testGodotConnection(cfg);
          break;
        case "custom_ws":
          result = await this.testWebSocketConnection(cfg);
          break;
        case "custom_rest":
        default:
          result = await this.testHttpConnection(cfg);
          break;
      }
    } catch (err: any) {
      result = {
        success: false,
        latencyMs: Date.now() - startTime,
        message: `Connection failed: ${err.message}`,
      };
    }

    // Update connector state
    if (this.connectors.has(id)) {
      const conn = this.connectors.get(id)!;
      conn.lastTestedAt = new Date().toISOString();
      conn.lastLatencyMs = result.latencyMs;
      conn.lastStatus = result.success ? "connected" : "offline";
      conn.lastErrorMessage = result.success ? undefined : result.message;
      this.persistConnectors();
    }

    return result;
  }

  // ─── Protocol Test Helpers ───────────────────────────────────────────

  private async testBlenderConnection(cfg: ConnectorConfig): Promise<ConnectorTestResult> {
    const start = Date.now();
    const wsUrl = `ws://${cfg.host || "localhost"}:${cfg.port || 8198}/ws`;
    const httpUrl = `http://${cfg.host || "localhost"}:${cfg.port || 8198}/status`;

    // 1. Try high-speed WebSocket handshake and ping
    try {
      const wsClient = BlenderWebSocketClient.getInstance(wsUrl);
      const pingResult = await wsClient.sendAction("ping", {}, 2000);
      const latencyMs = Date.now() - start;
      return {
        success: true,
        latencyMs,
        message: `Connected to Blender WebSocket Bridge (Version: ${pingResult.version || "active"}) [${latencyMs}ms]`,
        details: pingResult,
      };
    } catch {}

    // 2. Fallback to HTTP status endpoint
    try {
      const res = await this.fetchWithTimeout(httpUrl, { method: "GET" }, 2500);
      const latencyMs = Date.now() - start;
      if (res.ok) {
        let details: any = {};
        try {
          details = JSON.parse(res.body);
        } catch {}
        return {
          success: true,
          latencyMs,
          message: `Connected to Blender HTTP Bridge (Version: ${details.version || "active"})`,
          details,
        };
      }
    } catch {}

    // 3. Fallback to root HTTP ping
    try {
      const rootUrl = `http://${cfg.host || "localhost"}:${cfg.port || 8198}/`;
      const res = await this.fetchWithTimeout(rootUrl, { method: "GET" }, 2500);
      const latencyMs = Date.now() - start;
      if (res.ok || res.status === 200 || res.status === 404) {
        return {
          success: true,
          latencyMs,
          message: `Connected to Blender HTTP Listener on port ${cfg.port || 8198}`,
        };
      }
    } catch {}

    return {
      success: false,
      latencyMs: Date.now() - start,
      message: `Could not connect to Blender on ${cfg.host}:${cfg.port} via WebSocket or HTTP. Please ensure Blender is running with the companion bridge script active.`,
    };
  }

  private async testObsConnection(cfg: ConnectorConfig): Promise<ConnectorTestResult> {
    const start = Date.now();
    const host = cfg.host || "localhost";
    const port = cfg.port || 4455;
    const password = cfg.options?.password || "";
    const wsUrl = `ws://${host}:${port}`;

    try {
      const client = ObsWebSocketClient.getInstance(wsUrl, password);
      const version = await client.callRequest("GetVersion", {}, 3000);
      const latencyMs = Date.now() - start;
      const obsVer = version?.obsVersion ? `OBS v${version.obsVersion}` : "OBS Studio";
      const wsVer = version?.obsWebSocketVersion ? ` (WebSocket v${version.obsWebSocketVersion})` : "";
      return {
        success: true,
        latencyMs,
        message: `Connected to ${obsVer}${wsVer} on port ${port}`,
        details: version,
      };
    } catch (err: any) {
      const msg = err.message || "";
      let detail = msg;
      if (msg.includes("ECONNREFUSED") || msg.includes("timeout") || msg.includes("error")) {
        detail = `Could not reach OBS Studio on ${host}:${port}. Ensure OBS is open with WebSocket Server enabled (Tools -> WebSocket Server Settings, Port 4455).`;
      }
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: detail,
      };
    }
  }

  private async testComfyUiConnection(cfg: ConnectorConfig): Promise<ConnectorTestResult> {
    const start = Date.now();
    const url = `${cfg.protocol || "http"}://${cfg.host || "localhost"}:${cfg.port || 8188}/system_stats`;

    try {
      const res = await this.fetchWithTimeout(url, { method: "GET" }, 3000);
      const latencyMs = Date.now() - start;
      if (res.ok) {
        const data = JSON.parse(res.body);
        const device = data?.devices?.[0]?.name || "CPU/GPU";
        const vram = data?.devices?.[0]?.vram_total
          ? `${Math.round(data.devices[0].vram_total / (1024 * 1024 * 1024))}GB`
          : "";
        return {
          success: true,
          latencyMs,
          message: `Connected to ComfyUI (${device} ${vram})`,
          details: data,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `ComfyUI is offline on ${cfg.host}:${cfg.port} (${err.message})`,
      };
    }

    return {
      success: false,
      latencyMs: Date.now() - start,
      message: `Failed to communicate with ComfyUI API on ${cfg.host}:${cfg.port}`,
    };
  }

  private async testGodotConnection(cfg: ConnectorConfig): Promise<ConnectorTestResult> {
    const start = Date.now();
    const url = `${cfg.protocol || "http"}://${cfg.host || "localhost"}:${cfg.port || 6006}/status`;

    try {
      const res = await this.fetchWithTimeout(url, { method: "GET" }, 2500);
      return {
        success: res.ok,
        latencyMs: Date.now() - start,
        message: res.ok ? "Connected to Godot RPC Bridge" : `Godot responded with HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Godot Engine connection failed on ${cfg.host}:${cfg.port}: ${err.message}`,
      };
    }
  }

  private async testHttpConnection(cfg: ConnectorConfig): Promise<ConnectorTestResult> {
    const start = Date.now();
    const proto = cfg.protocol || "http";
    const portPart = cfg.port ? `:${cfg.port}` : "";
    const testPath = cfg.options?.test_path || "/";
    const url = `${proto}://${cfg.host}${portPart}${testPath.startsWith("/") ? "" : "/"}${testPath}`;

    const headers: Record<string, string> = { ...(cfg.customHeaders || {}) };
    if (cfg.authType === "bearer" && cfg.authToken) {
      headers["Authorization"] = `Bearer ${cfg.authToken}`;
    } else if (cfg.authType === "apikey" && cfg.authToken) {
      headers["X-API-Key"] = cfg.authToken;
    }

    try {
      const res = await this.fetchWithTimeout(url, { method: "GET", headers }, 3500);
      const latencyMs = Date.now() - start;
      const isAuthError = res.status === 401 || res.status === 403;
      return {
        success: res.status >= 200 && res.status < 400,
        latencyMs,
        message: isAuthError
          ? `HTTP ${res.status} Unauthorized — Verify your API token/credentials`
          : `Endpoint responded with HTTP ${res.status} (${latencyMs}ms)`,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `HTTP request failed: ${err.message}`,
      };
    }
  }

  private async testWebSocketConnection(cfg: ConnectorConfig): Promise<ConnectorTestResult> {
    const start = Date.now();
    const proto = cfg.protocol === "wss" ? "https" : "http";
    const portPart = cfg.port ? `:${cfg.port}` : "";
    const probeUrl = `${proto}://${cfg.host}${portPart}/`;

    try {
      const res = await this.fetchWithTimeout(probeUrl, { method: "GET" }, 3000);
      const latencyMs = Date.now() - start;
      return {
        success: true,
        latencyMs,
        message: `WebSocket server host is reachable on port ${cfg.port || 80}`,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `WebSocket host unreachable: ${err.message}`,
      };
    }
  }

  private fetchWithTimeout(
    urlStr: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {},
    timeoutMs = 3000
  ): Promise<{ status: number; ok: boolean; body: string }> {
    return new Promise((resolvePromise, rejectPromise) => {
      try {
        const parsed = new URL(urlStr);
        const isHttps = parsed.protocol === "https:";
        const client = isHttps ? https : http;

        const reqHeaders = { ...(options.headers || {}) };
        let bodyBuffer: Buffer | null = null;
        if (options.body !== undefined && options.body !== null) {
          bodyBuffer = Buffer.isBuffer(options.body) ? options.body : Buffer.from(String(options.body), "utf-8");
          reqHeaders["Content-Length"] = String(bodyBuffer.length);
        }

        const isLocalhost =
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "::1";

        const req = client.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: options.method || "GET",
            headers: reqHeaders,
            timeout: timeoutMs,
            rejectUnauthorized: isHttps && isLocalhost ? false : undefined,
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              resolvePromise({
                status: res.statusCode || 0,
                ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
                body: data,
              });
            });
          }
        );

        req.on("timeout", () => {
          req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
        });

        req.on("error", (err) => rejectPromise(err));

        if (bodyBuffer) {
          req.write(bodyBuffer);
        }
        req.end();
      } catch (err) {
        rejectPromise(err);
      }
    });
  }

  // ─── Dynamic Tool Synchronization ────────────────────────────────────

  /**
   * Sync tool declarations directly to PluginManager based on active connectors.
   */
  public syncToolsToPluginManager(): void {
    const all = Array.from(this.connectors.values());
    const currentActiveTools = new Set<string>();

    for (const connector of all) {
      if (connector.enabled) {
        const tools = this.generateToolsForConnector(connector);
        for (const { schema, handler } of tools) {
          this.pluginManager.registerTool(schema, handler);
          currentActiveTools.add(schema.name);
        }
      }
    }

    // Unregister any tools that are now disabled or removed
    for (const toolName of this.registeredToolNames) {
      if (!currentActiveTools.has(toolName)) {
        this.pluginManager.unregisterTool(toolName);
      }
    }

    this.registeredToolNames = currentActiveTools;
    logVerbose("info", `🔗 App Connectors synced: ${this.registeredToolNames.size} active connector tools.`);
}

  /**
   * Generate executable tools for a specific connector.
   */
  private generateToolsForConnector(
    cfg: ConnectorConfig
  ): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    switch (cfg.type) {
      case "blender":
        return this.getBlenderTools(cfg);
      case "obs":
        return this.getObsTools(cfg);
      case "comfyui":
        return this.getComfyUiTools(cfg);
      case "godot":
        return this.getGodotTools(cfg);
      case "custom_ws":
        return this.getCustomWsTools(cfg);
      case "custom_rest":
      default:
        return this.getCustomRestTools(cfg);
    }
  }

  // ─── 1. Blender Toolset ──────────────────────────────────────────────

  private getBlenderTools(cfg: ConnectorConfig): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const wsUrl = `ws://${cfg.host || "localhost"}:${cfg.port || 8198}/ws`;
    const httpUrl = `http://${cfg.host || "localhost"}:${cfg.port || 8198}`;
    const wsClient = BlenderWebSocketClient.getInstance(wsUrl);

    const executeWithFallback = async (action: string, params: Record<string, any>, httpPath: string, httpBody: any) => {
      // 1. Primary: High-Speed WebSocket connection
      try {
        return await wsClient.sendAction(action, params, 15000);
      } catch (wsErr: any) {
        // 2. Fallback: Standard HTTP
        try {
          const res = await this.fetchWithTimeout(
            `${httpUrl}${httpPath}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(httpBody),
            },
            15000
          );
          if (res.ok) {
            try { return JSON.parse(res.body); } catch { return { success: true, output: res.body }; }
          }
          return { error: `Blender error: HTTP ${res.status} - ${res.body}` };
        } catch (httpErr: any) {
          return {
            error: `Failed to communicate with Blender bridge via WebSocket (${wsErr.message}) and HTTP (${httpErr.message}). Ensure the Blender companion bridge script is running inside Blender.`,
          };
        }
      }
    };

    return [
      {
        schema: {
          name: "blender_exec_script",
          description:
            "Execute arbitrary Python code in the active Blender instance to create 3D meshes, animate objects, set materials, setup lighting, adjust cameras, or modify scenes.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              script: {
                type: "string",
                description:
                  "Python script using Blender's bpy module (e.g. import bpy; bpy.ops.mesh.primitive_cube_add(size=2, location=(0,0,1)))",
              },
            },
            required: ["script"],
          },
        },
        handler: async (args) => {
          const script = String(args.script || "");
          if (!script.trim()) return { error: "Missing script parameter" };
          return executeWithFallback("exec", { script }, "/exec", { script });
        },
      },
      {
        schema: {
          name: "blender_get_scene_info",
          description:
            "Inspect the active 3D scene in Blender: lists all objects, mesh counts, materials, active cameras, lights, and render engine.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              includeMaterials: {
                type: "boolean",
                description: "Whether to include detailed material node names and parameters.",
              },
            },
          },
        },
        handler: async () => {
          try {
            return await wsClient.sendAction("scene", {}, 5000);
          } catch {
            try {
              const res = await this.fetchWithTimeout(`${httpUrl}/scene`, { method: "GET" }, 5000);
              if (res.ok) return JSON.parse(res.body);
              return { error: `Blender responded with status ${res.status}` };
            } catch (err: any) {
              return { error: `Blender query failed: ${err.message}` };
            }
          }
        },
      },
      {
        schema: {
          name: "blender_render_frame",
          description:
            "Render the current Blender scene camera or viewport to an image file saved in artifacts.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              filename: {
                type: "string",
                description: "Output filename (e.g. 'render_output.png').",
              },
              resolution_x: {
                type: "number",
                description: "Horizontal render resolution in pixels (default 1920).",
              },
              resolution_y: {
                type: "number",
                description: "Vertical render resolution in pixels (default 1080).",
              },
              engine: {
                type: "string",
                description: "Render engine: 'BLENDER_EEVEE_NEXT', 'CYCLES', or 'BLENDER_WORKBENCH'.",
                enum: ["BLENDER_EEVEE_NEXT", "CYCLES", "BLENDER_WORKBENCH"],
              },
            },
          },
        },
        handler: async (args) => {
          const filename = String(args.filename || `blender_render_${Date.now()}.png`);
          const outPath = join(ARTIFACTS_DIR, filename);
          const renderParams = {
            outputPath: outPath,
            resolutionX: args.resolution_x || 1920,
            resolutionY: args.resolution_y || 1080,
            engine: args.engine || "BLENDER_EEVEE_NEXT",
          };

          return executeWithFallback("render", renderParams, "/render", renderParams);
        },
      },
    ];
  }

  // ─── 2. OBS Studio Toolset ───────────────────────────────────────────

  private getObsTools(cfg: ConnectorConfig): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const host = cfg.host || "localhost";
    const port = cfg.port || 4455;
    const password = cfg.options?.password || "";
    const wsUrl = `ws://${host}:${port}`;

    return [
      {
        schema: {
          name: "obs_get_status",
          description: "Get OBS Studio streaming status, recording status, current active scene, and available scenes list.",
          parametersJsonSchema: {
            type: "object",
            properties: {},
          },
        },
        handler: async () => {
          try {
            const client = ObsWebSocketClient.getInstance(wsUrl, password);
            const [version, sceneList, recordStatus, streamStatus] = await Promise.allSettled([
              client.callRequest("GetVersion", {}, 3000),
              client.callRequest("GetSceneList", {}, 3000),
              client.callRequest("GetRecordStatus", {}, 3000),
              client.callRequest("GetStreamStatus", {}, 3000),
            ]);

            const scenes =
              sceneList.status === "fulfilled"
                ? (sceneList.value?.scenes || []).map((s: any) => s.sceneName || s)
                : [];
            const currentScene =
              sceneList.status === "fulfilled"
                ? sceneList.value?.currentProgramSceneName
                : "unknown";

            return {
              status: "connected",
              obsVersion: version.status === "fulfilled" ? version.value?.obsVersion : undefined,
              currentScene,
              availableScenes: scenes,
              recording: recordStatus.status === "fulfilled" ? recordStatus.value?.outputActive : false,
              recordingPaused: recordStatus.status === "fulfilled" ? recordStatus.value?.outputPaused : false,
              streaming: streamStatus.status === "fulfilled" ? streamStatus.value?.outputActive : false,
            };
          } catch (err: any) {
            return { error: `OBS status check failed: ${err.message}` };
          }
        },
      },
      {
        schema: {
          name: "obs_switch_scene",
          description: "Switch the active program scene in OBS Studio.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              sceneName: {
                type: "string",
                description: "Name of the target scene in OBS Studio.",
              },
            },
            required: ["sceneName"],
          },
        },
        handler: async (args) => {
          const sceneName = String(args.sceneName || "").trim();
          if (!sceneName) {
            return { error: "sceneName parameter is required" };
          }
          try {
            const client = ObsWebSocketClient.getInstance(wsUrl, password);
            await client.callRequest("SetCurrentProgramScene", { sceneName });
            return { success: true, activeScene: sceneName, message: `Active OBS scene switched to "${sceneName}"` };
          } catch (err: any) {
            return { error: `OBS switch scene error: ${err.message}` };
          }
        },
      },
      {
        schema: {
          name: "obs_get_scenes",
          description: "List all scenes and current active scene in OBS Studio.",
          parametersJsonSchema: {
            type: "object",
            properties: {},
          },
        },
        handler: async () => {
          try {
            const client = ObsWebSocketClient.getInstance(wsUrl, password);
            const res = await client.callRequest("GetSceneList");
            const scenes = (res?.scenes || []).map((s: any) => s.sceneName || s);
            return {
              currentProgramSceneName: res?.currentProgramSceneName,
              scenes,
            };
          } catch (err: any) {
            return { error: `OBS get scenes failed: ${err.message}` };
          }
        },
      },
      {
        schema: {
          name: "obs_control_recording",
          description: "Start, stop, pause, or resume OBS Studio video recording.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "Recording action: 'start', 'stop', 'pause', 'resume', 'toggle'.",
                enum: ["start", "stop", "pause", "resume", "toggle"],
              },
            },
            required: ["action"],
          },
        },
        handler: async (args) => {
          const action = String(args.action || "start").toLowerCase();
          try {
            const client = ObsWebSocketClient.getInstance(wsUrl, password);
            if (action === "start") {
              await client.callRequest("StartRecord");
              return { success: true, action: "start", message: "OBS recording started" };
            } else if (action === "stop") {
              const res = await client.callRequest("StopRecord");
              return { success: true, action: "stop", outputPath: res?.outputPath, message: "OBS recording stopped" };
            } else if (action === "pause") {
              await client.callRequest("PauseRecord");
              return { success: true, action: "pause", message: "OBS recording paused" };
            } else if (action === "resume") {
              await client.callRequest("ResumeRecord");
              return { success: true, action: "resume", message: "OBS recording resumed" };
            } else if (action === "toggle") {
              const res = await client.callRequest("ToggleRecord");
              return { success: true, action: "toggle", outputActive: res?.outputActive };
            }
            return { error: `Unsupported recording action: ${action}` };
          } catch (err: any) {
            return { error: `OBS recording control failed: ${err.message}` };
          }
        },
      },
      {
        schema: {
          name: "obs_control_streaming",
          description: "Start or stop live streaming in OBS Studio.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "Streaming action: 'start', 'stop', 'toggle'.",
                enum: ["start", "stop", "toggle"],
              },
            },
            required: ["action"],
          },
        },
        handler: async (args) => {
          const action = String(args.action || "start").toLowerCase();
          try {
            const client = ObsWebSocketClient.getInstance(wsUrl, password);
            if (action === "start") {
              await client.callRequest("StartStream");
              return { success: true, action: "start", message: "OBS streaming started" };
            } else if (action === "stop") {
              await client.callRequest("StopStream");
              return { success: true, action: "stop", message: "OBS streaming stopped" };
            } else if (action === "toggle") {
              const res = await client.callRequest("ToggleStream");
              return { success: true, action: "toggle", outputActive: res?.outputActive };
            }
            return { error: `Unsupported streaming action: ${action}` };
          } catch (err: any) {
            return { error: `OBS streaming control failed: ${err.message}` };
          }
        },
      },
    ];
  }

  // ─── 3. ComfyUI Toolset ──────────────────────────────────────────────

  private getComfyUiTools(cfg: ConnectorConfig): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const baseUrl = `${cfg.protocol || "http"}://${cfg.host || "localhost"}:${cfg.port || 8188}`;

    return [
      {
        schema: {
          name: "comfyui_get_models_and_samplers",
          description: "Query available Stable Diffusion / FLUX checkpoints, LoRAs, and samplers loaded in ComfyUI.",
          parametersJsonSchema: {
            type: "object",
            properties: {},
          },
        },
        handler: async () => {
          try {
            const res = await this.fetchWithTimeout(`${baseUrl}/object_info`, { method: "GET" }, 5000);
            if (res.ok) {
              const data = JSON.parse(res.body);
              const checkpoints =
                data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
              const samplers = data?.KSampler?.input?.required?.sampler_name?.[0] || [];
              return { checkpoints, samplers };
            }
            return { error: `ComfyUI error: HTTP ${res.status}` };
          } catch (err: any) {
            return { error: `ComfyUI models query failed: ${err.message}` };
          }
        },
      },
      {
        schema: {
          name: "comfyui_queue_prompt",
          description: "Send a generation workflow or text prompt to ComfyUI.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              positivePrompt: {
                type: "string",
                description: "Positive text description for image generation.",
              },
              negativePrompt: {
                type: "string",
                description: "Negative text prompt.",
              },
              width: { type: "number", description: "Image width (e.g. 1024)." },
              height: { type: "number", description: "Image height (e.g. 1024)." },
              steps: { type: "number", description: "Inference steps (default 20)." },
            },
            required: ["positivePrompt"],
          },
        },
        handler: async (args) => {
          try {
            const res = await this.fetchWithTimeout(
              `${baseUrl}/prompt`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: args }),
              },
              8000
            );
            if (res.ok) return JSON.parse(res.body);
            return { error: `ComfyUI queue error: ${res.body}` };
          } catch (err: any) {
            return { error: `ComfyUI execution failed: ${err.message}` };
          }
        },
      },
    ];
  }

  // ─── 4. Godot Toolset ────────────────────────────────────────────────

  private getGodotTools(cfg: ConnectorConfig): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const baseUrl = `${cfg.protocol || "http"}://${cfg.host || "localhost"}:${cfg.port || 6006}`;

    return [
      {
        schema: {
          name: "godot_send_command",
          description: "Send an editor command, scene inspect request, or debug instruction to Godot Engine.",
          parametersJsonSchema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "Command name (e.g. 'get_scene_tree', 'instantiate_node', 'play_scene').",
              },
              params: {
                type: "object",
                description: "Optional parameters for the command.",
              },
            },
            required: ["command"],
          },
        },
        handler: async (args) => {
          try {
            const res = await this.fetchWithTimeout(
              `${baseUrl}/command`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args),
              },
              5000
            );
            if (res.ok) return JSON.parse(res.body);
            return { error: `Godot error: ${res.body}` };
          } catch (err: any) {
            return { error: `Godot command failed: ${err.message}` };
          }
        },
      },
    ];
  }

  // ─── 5. Custom REST Toolset ──────────────────────────────────────────

  private getCustomRestTools(cfg: ConnectorConfig): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const tools: Array<{ schema: ToolSchema; handler: ToolHandler }> = [];
    const proto = cfg.protocol || "http";
    const portPart = cfg.port ? `:${cfg.port}` : "";
    const baseUrl = `${proto}://${cfg.host}${portPart}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(cfg.customHeaders || {}),
    };
    if (cfg.authType === "bearer" && cfg.authToken) {
      headers["Authorization"] = `Bearer ${cfg.authToken}`;
    } else if (cfg.authType === "apikey" && cfg.authToken) {
      headers["X-API-Key"] = cfg.authToken;
    }

    if (cfg.customTools && cfg.customTools.length > 0) {
      for (const endpoint of cfg.customTools) {
        tools.push({
          schema: {
            name: `${cfg.id}_${endpoint.name}`,
            description: endpoint.description || `Call ${endpoint.method} ${endpoint.path} on ${cfg.name}`,
            parametersJsonSchema: normalizeParameterSchema(
              endpoint.parametersJsonSchema || {
                type: "object",
                properties: {
                  payload: {
                    type: "object",
                    description: "JSON payload or query parameters to send.",
                  },
                },
              }
            ),
          },
          handler: async (args) => {
            let resolvedPath = endpoint.path;
            const bodyPayload = typeof args === "object" && args !== null ? { ...(args.payload || args) } : {};
            if (typeof args === "object" && args !== null) {
              for (const [k, v] of Object.entries(args)) {
                if (resolvedPath.includes(`{${k}}`)) {
                  resolvedPath = resolvedPath.replace(new RegExp(`\\{${k}\\}`, "g"), encodeURIComponent(String(v)));
                  delete (bodyPayload as any)[k];
                }
              }
            }
            const url = `${baseUrl}${resolvedPath.startsWith("/") ? "" : "/"}${resolvedPath}`;
            try {
              const res = await this.fetchWithTimeout(
                url,
                {
                  method: endpoint.method,
                  headers,
                  body: endpoint.method !== "GET" ? JSON.stringify(bodyPayload) : undefined,
                },
                10000
              );
              if (res.ok) {
                try {
                  return JSON.parse(res.body);
                } catch {
                  return { response: res.body };
                }
              }
              return { error: `API error: HTTP ${res.status} - ${res.body}` };
            } catch (err: any) {
              return { error: `Request to ${url} failed: ${err.message}` };
            }
          },
        });
      }
    } else {
      // Default generic caller tool
      tools.push({
        schema: {
          name: `${cfg.id}_api_request`,
          description: `Send an HTTP request to ${cfg.name} (${baseUrl}).`,
          parametersJsonSchema: {
            type: "object",
            properties: {
              endpoint: {
                type: "string",
                description: "Relative URL path (e.g. '/api/v1/status' or '/items').",
              },
              method: {
                type: "string",
                description: "HTTP method: GET, POST, PUT, DELETE.",
                enum: ["GET", "POST", "PUT", "DELETE"],
              },
              body: {
                type: "object",
                description: "JSON request body (for POST/PUT).",
              },
            },
            required: ["endpoint"],
          },
        },
        handler: async (args) => {
          const endpoint = String(args.endpoint || "/");
          const method = String(args.method || "GET").toUpperCase();
          const url = `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

          try {
            const res = await this.fetchWithTimeout(
              url,
              {
                method,
                headers,
                body: method !== "GET" && args.body ? JSON.stringify(args.body) : undefined,
              },
              10000
            );

            if (res.ok) {
              try {
                return JSON.parse(res.body);
              } catch {
                return { response: res.body };
              }
            }
            return { error: `HTTP ${res.status}: ${res.body}` };
          } catch (err: any) {
            return { error: `Failed to call ${url}: ${err.message}` };
          }
        },
      });
    }

    return tools;
  }

  // ─── 6. Custom WebSocket Toolset ─────────────────────────────────────

  private getCustomWsTools(cfg: ConnectorConfig): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    const tools: Array<{ schema: ToolSchema; handler: ToolHandler }> = [];
    const proto = cfg.protocol || "ws";
    const portPart = cfg.port ? `:${cfg.port}` : "";
    const wsUrl = `${proto}://${cfg.host}${portPart}`;
    const wsClient = BlenderWebSocketClient.getInstance(wsUrl);

    if (cfg.customTools && cfg.customTools.length > 0) {
      for (const endpoint of cfg.customTools) {
        tools.push({
          schema: {
            name: `${cfg.id}_${endpoint.name}`,
            description: endpoint.description || `Send WebSocket action '${endpoint.name}' to ${cfg.name}`,
            parametersJsonSchema: normalizeParameterSchema(
              endpoint.parametersJsonSchema || {
                type: "object",
                properties: {
                  payload: {
                    type: "object",
                    description: "JSON parameters to send.",
                  },
                },
              }
            ),
          },
          handler: async (args) => {
            try {
              const res = await wsClient.sendAction(endpoint.name, args.payload || args, 10000);
              return res;
            } catch (err: any) {
              return { error: `WebSocket action '${endpoint.name}' failed: ${err.message}` };
            }
          },
        });
      }
    } else {
      tools.push({
        schema: {
          name: `${cfg.id}_send_ws_action`,
          description: `Send a JSON action message over WebSocket to ${cfg.name} (${wsUrl}).`,
          parametersJsonSchema: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "Action or command name to execute.",
              },
              params: {
                type: "object",
                description: "Optional JSON parameters.",
              },
            },
            required: ["action"],
          },
        },
        handler: async (args) => {
          const action = String(args.action || "ping");
          try {
            const res = await wsClient.sendAction(action, args.params || {}, 10000);
            return res;
          } catch (err: any) {
            return { error: `WebSocket action '${action}' failed: ${err.message}` };
          }
        },
      });
    }

    return tools;
  }
}
