/**
 * Pure Native Electron IPC Bridge — Replaces the Node.js HTTP Server.
 *
 * Exposes all Orchestrator, Plugin, Connector, Security, Database, RAG,
 * and System Configuration capabilities directly through Electron's native IPC,
 * eliminating loopback TCP sockets, HTTP port hunting, and SSE text overhead.
 */

import { ipcMain, BrowserWindow, shell, dialog } from "electron";
import { readFileSync, existsSync, readdirSync, statSync, unlinkSync, writeFileSync, mkdirSync, rmdirSync, copyFileSync } from "node:fs";
import { resolve, dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { Orchestrator } from "../core/orchestrator.js";
import { AgentDatabase } from "../core/database.js";
import { isChatMode } from "../core/chat-mode.js";
import type { ChatMode } from "../core/types.js";
import { shellPlugin } from "../plugins/tools/shell-plugin.js";
import { webSearchPlugin } from "../plugins/tools/web-search.js";
import { ragPlugin, setSharedVectorStore } from "../plugins/tools/rag-plugin.js";
import { outcomeSummaryPlugin } from "../plugins/tools/outcome-summary.js";
import { thinkingInspectorPlugin } from "../plugins/tools/thinking-inspector.js";
import { ttsPlugin } from "../plugins/tools/tts-plugin.js";
import { sttPlugin } from "../plugins/tools/stt-plugin.js";
import { TTSService } from "../core/tts-service.js";
import { STTService } from "../core/stt-service.js";
import { createAIProvider, getAvailableProviders } from "../providers/provider-factory.js";
import { ProviderRegistry } from "../providers/provider-registry.js";
import {
  CONFIG,
  PROVIDER_MODELS,
  PROVIDER_EMBEDDING_MODELS,
  THINKING_PRESETS,
  type ThinkingLevel,
  logVerbose,
  getResolvedConfigYamlPath,
  getResolvedEnvPath,
} from "../core/config.js";
import { parseDocumentContent } from "../core/document-parser.js";
import type { ProviderType } from "../core/ai-provider.js";
import { ConnectorManager } from "../core/connector-manager.js";
import { classifyError, formatForIPC, validationError, ErrorCode } from "../core/error-handler.js";
import { logger } from "../core/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Safe IPC Handler Wrapper ─────────────────────────────────────────
// Wraps ipcMain.handle so that any thrown error (sync or async) is caught
// and returned as a structured { success, error, code, recoverable } object
// rather than propagating as an unhandled IPC rejection.
function safeHandle(
  channel: string,
  handler: Parameters<typeof ipcMain.handle>[1]
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await (handler as any)(event, ...args);
    } catch (err: unknown) {
      const appErr = classifyError(err, { channel });
      logger.error("IPC", `Handler '${channel}' threw: ${appErr.message}`, {
        code: appErr.code,
        recoverable: appErr.recoverable,
      });
      return formatForIPC(appErr);
    }
  });
}

const _userBase = () => process.env.AIPLATE_USERDATA || process.cwd();
const SANDBOX_DIR = resolve(_userBase(), CONFIG.SHELL.SANDBOX_DIR || ".sandbox");
const ARTIFACTS_DIR = resolve(_userBase(), CONFIG.SHELL.ARTIFACTS_DIR || "artifacts");

// Ensure operational directories exist safely
try {
  if (!existsSync(SANDBOX_DIR)) mkdirSync(SANDBOX_DIR, { recursive: true });
  if (!existsSync(ARTIFACTS_DIR)) mkdirSync(ARTIFACTS_DIR, { recursive: true });
} catch {}

function syncNestedSandboxArtifacts(): void {
  try {
    const nested = join(SANDBOX_DIR, "artifacts");
    if (existsSync(nested)) {
      if (!existsSync(ARTIFACTS_DIR)) mkdirSync(ARTIFACTS_DIR, { recursive: true });
      // Recursively sync all files from .sandbox/artifacts/ (including subdirs like animations/)
      syncDirRecursive(nested, ARTIFACTS_DIR);
    }
  } catch {}
}

function syncDirRecursive(srcDir: string, dstDir: string): void {
  if (!existsSync(srcDir)) return;
  try {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = join(srcDir, entry.name);
      if (entry.isFile()) {
        // Copy to both the matching subdirectory structure AND the flat root for easy discovery
        const dstPath = join(dstDir, entry.name);
        try {
          copyFileSync(srcPath, dstPath);
        } catch {}
      } else if (
        entry.isDirectory() &&
        entry.name !== "venv" &&
        entry.name !== "__pycache__" &&
        entry.name !== ".venv_manim" &&
        entry.name !== "node_modules"
      ) {
        // Recurse into subdirectories
        const subDstDir = join(dstDir, entry.name);
        if (!existsSync(subDstDir)) mkdirSync(subDstDir, { recursive: true });
        syncDirRecursive(srcPath, subDstDir);
        // Also copy files from subdirectory to root artifacts/ for flat listing
        try {
          for (const subEntry of readdirSync(srcPath)) {
            const subSrc = join(srcPath, subEntry);
            try {
              if (statSync(subSrc).isFile()) {
                const flatDst = join(dstDir, subEntry);
                if (!existsSync(flatDst)) {
                  copyFileSync(subSrc, flatDst);
                }
              }
            } catch {}
          }
        } catch {}
      }
    }
  } catch {}
}

let orchestrator: Orchestrator;
let connectorManager: ConnectorManager;
let activeProviderInstance = createAIProvider();

export function setupIpcBridge(mainWindow: BrowserWindow): void {
  // ─── 1. Initialize Engines ──────────────────────────────────────────
  // Each subsystem is initialized in isolation — a failure in one module
  // does not crash the entire bridge; the app degrades gracefully.
  try {
    orchestrator = new Orchestrator(
      { verbose: CONFIG.VERBOSE },
      (level, msg) => logVerbose(level, msg),
      activeProviderInstance
    );
  } catch (err) {
    logger.fatal("IPC", `Orchestrator init failed: ${err}`);
    throw err; // Orchestrator is mandatory — re-throw so the app knows
  }

  try {
    const pluginManager = orchestrator.getPluginManager();
    setSharedVectorStore(orchestrator.getVectorStore());
    orchestrator.registerPlugin(shellPlugin, true);
    orchestrator.registerPlugin(webSearchPlugin, true);
    orchestrator.registerPlugin(ragPlugin, true);
    orchestrator.registerPlugin(outcomeSummaryPlugin, true);
    orchestrator.registerPlugin(thinkingInspectorPlugin, true);
    orchestrator.registerPlugin(ttsPlugin, true);
    orchestrator.registerPlugin(sttPlugin, true);
    pluginManager.loadPersistedCustomPlugins();

    // Pre-warm STT model in background so first user speech has 0s cold-start lag
    const stt = STTService.getInstance();
    stt.preload().catch((err) => {
      logger.warn("IPC", `STT preload deferred: ${err}`);
    });
  } catch (err) {
    logger.error("IPC", `Plugin registration failed (non-fatal): ${err}`);
  }

  try {
    connectorManager = ConnectorManager.getInstance();
  } catch (err) {
    logger.error("IPC", `ConnectorManager init failed (non-fatal): ${err}`);
    connectorManager = ConnectorManager.getInstance(); // retry once
  }

  try {
    orchestrator.initialize();
  } catch (err) {
    logger.error("IPC", `Orchestrator.initialize() failed (non-fatal): ${err}`);
  }

  const pluginManager = orchestrator.getPluginManager();

  // ─── 2. Chat Streaming & Execution IPC ──────────────────────────────
  // Note: chat:send uses raw ipcMain.handle (not safeHandle) because it
  // has its own fine-grained error streaming back to the UI via sendStreamEvent.
  ipcMain.handle("chat:send", async (event, payload: { message?: string; attachments?: any[]; sessionId?: string; mode?: ChatMode }) => {
    const message = (payload?.message || "").trim();
    const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

    if (payload?.mode !== undefined && !isChatMode(payload.mode)) {
      return { success: false, error: "Invalid chat mode", code: "VALIDATION_ERROR" };
    }
    // Input validation
    if (!message && attachments.length === 0) {
      return { success: false, error: "Message or attachment is required.", code: "VALIDATION_ERROR" };
    }
    if (message.length > 100_000) {
      return { success: false, error: "Message is too long (max 100,000 characters).", code: "VALIDATION_ERROR" };
    }

    const sessionId = payload?.sessionId || orchestrator.activeSessionId;

    const sendStreamEvent = (evtType: string, data: Record<string, any>) => {
      if (!mainWindow.isDestroyed()) {
        try {
          const safePayload = JSON.parse(JSON.stringify(data));
          mainWindow.webContents.send("chat:stream-chunk", { event: evtType, payload: safePayload, sessionId });
        } catch {
          mainWindow.webContents.send("chat:stream-chunk", { event: evtType, payload: { text: String(data) }, sessionId });
        }
      }
    };

    sendStreamEvent("start", { message });

    // Auto-update session title immediately if currently a default title
    let autoUpdatedTitle: string | undefined;
    const currentSessions = orchestrator.listSessions();
    const targetSession = currentSessions.find((s) => s.id === sessionId);
    if (
      targetSession &&
      (targetSession.title === "New Chat" ||
        targetSession.title === "Initial Chat" ||
        targetSession.title === "Chat Session")
    ) {
      const promptSnippet = (message || (attachments[0] ? `File: ${attachments[0].filename}` : "Chat Session"))
        .replace(/\[User attached and embedded[^\]]*\]\s*/g, "")
        .replace(/^#+\s*/, "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 36)
        .trim();
      if (promptSnippet) {
        orchestrator.updateSessionTitle(sessionId, promptSnippet);
        autoUpdatedTitle = promptSnippet;
        sendStreamEvent("session_title_updated", { sessionId, title: promptSnippet });
      }
    }

    // Wire up tool and security listeners for this turn (isolated by sessionId)
    const onToolExecuting = (name: string, args: Record<string, unknown>, ctx?: { sessionId?: string }) => {
      if (ctx?.sessionId && ctx.sessionId !== sessionId) return;
      sendStreamEvent("tool_executing", { tool: name, args });
    };
    const onToolCompleted = (name: string, result: Record<string, unknown>, ctx?: { sessionId?: string }) => {
      if (ctx?.sessionId && ctx.sessionId !== sessionId) return;
      sendStreamEvent("tool_completed", { tool: name, result });
    };
    const onToolError = (name: string, error: Record<string, unknown>, ctx?: { sessionId?: string }) => {
      if (ctx?.sessionId && ctx.sessionId !== sessionId) return;
      sendStreamEvent("tool_error", { tool: name, error });
    };
    const securityManager = orchestrator.getSecurityManager();
    const onApprovalRequested = (req: import("../core/types.js").ApprovalRequest) => {
      if (req.sessionId && req.sessionId !== sessionId) return;
      sendStreamEvent("approval_required", {
        id: req.id,
        tool: req.toolName,
        args: req.args,
        riskLevel: req.riskLevel,
        capability: req.capability,
        description: req.description,
        timestamp: req.timestamp,
        formattedCode: req.formattedCode,
      });
    };

    pluginManager.on("tool:executing", onToolExecuting);
    pluginManager.on("tool:completed", onToolCompleted);
    pluginManager.on("tool:error", onToolError);
    securityManager.on("approval:requested", onApprovalRequested);

    let augmentedMessage = message;

    // Process attachments directly in memory & embed into Vector Store
    if (attachments.length > 0) {
      const attachedFilenames: string[] = [];
      for (const att of attachments) {
        if (att.filename && att.content) {
          try {
            sendStreamEvent("embedding_start", { filename: att.filename });
            const rawBuffer = att.isBase64 ? Buffer.from(att.content, "base64") : Buffer.from(att.content, "utf-8");
            const filePath = join(SANDBOX_DIR, att.filename);
            writeFileSync(filePath, rawBuffer);

            const parsed = await parseDocumentContent(att.filename, rawBuffer);
            let chunkCount = 0;
            if (parsed.text && parsed.text.trim().length > 0) {
              const ingestResult = await orchestrator.getVectorStore().ingestText(att.filename, parsed.text);
              chunkCount = ingestResult.chunkCount;
              orchestrator.addEmbeddingTokens(Math.ceil(parsed.text.length / 4));
            }
            attachedFilenames.push(att.filename);
            sendStreamEvent("attachment_embedded", {
              filename: att.filename,
              chunks: chunkCount,
              embeddingModel: orchestrator.activeEmbeddingModel,
            });
          } catch (embedErr: any) {
            sendStreamEvent("attachment_error", { filename: att.filename, error: embedErr.message });
          }
        }
      }
      if (attachedFilenames.length > 0) {
        augmentedMessage = `[User attached and embedded ${attachedFilenames.length} file(s) into vector memory: ${attachedFilenames.join(", ")}]\n\n${message}`;
      }
    }

    // Evaluate cognitive directives / skills right at prompt start and stream event
    let triggeredSkills: Array<{ id: string; name: string; category: string; description: string; triggers?: string[] }> = [];
    try {
      const skillsManager = orchestrator.getSkillsManager();
      const applicable = skillsManager.getApplicableSkills(augmentedMessage || message);
      if (applicable.length > 0) {
        triggeredSkills = applicable.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          description: s.description,
          triggers: s.triggers,
        }));
        sendStreamEvent("skills_triggered", {
          sessionId,
          skills: triggeredSkills,
        });
      }
    } catch (skillsErr: any) {
      logVerbose("WARN", `[ChatIPC] Failed to evaluate skills for prompt: ${skillsErr.message}`);
    }

    try {
      const responseText = await orchestrator.processPrompt(augmentedMessage, undefined, sessionId, payload.mode);
      const meta = orchestrator.getLastExecutionMeta(sessionId);
      const activeSkillNames = meta?.skills && meta.skills.length > 0 ? meta.skills : triggeredSkills.map((s) => s.name);
      sendStreamEvent("response", {
        text: responseText,
        canImplementPlan: meta?.canImplementPlan === true,
        usage: meta?.usage,
        elapsedMs: meta?.elapsedMs,
        iterations: meta?.iterations,
        model: orchestrator.activeModel,
        sessionTitle: autoUpdatedTitle,
        skills: activeSkillNames,
      });
      return { success: true, text: responseText, meta, sessionTitle: autoUpdatedTitle, skills: activeSkillNames };
    } catch (err: any) {
      logVerbose("ERROR", `[ChatIPC] processPrompt error: ${err.message}`);
      const errMsg = err.message || "An unexpected error occurred during execution.";
      if (
        errMsg.includes("API key not valid") ||
        errMsg.includes("API_KEY_INVALID") ||
        errMsg.includes("401") ||
        errMsg.includes("403")
      ) {
        orchestrator.clearSessionInstances();
      }
      const failure = formatForIPC(err);
      sendStreamEvent("error", failure);
      return failure;
    } finally {
      pluginManager.off("tool:executing", onToolExecuting);
      pluginManager.off("tool:completed", onToolCompleted);
      pluginManager.off("tool:error", onToolError);
      securityManager.off("approval:requested", onApprovalRequested);
    }
  });

  safeHandle("chat:stop", (_event, payload?: { sessionId?: string }) => {
    const targetSessionId = payload?.sessionId;
    const stopped = orchestrator.abortCurrentExecution(targetSessionId);
    return { success: true, stopped, sessionId: targetSessionId };
  });

  safeHandle("chat:reset", (_event, payload?: { sessionId?: string }) => {
    if (payload?.sessionId) {
      orchestrator.resetSessionContext(payload.sessionId);
      return { success: true, message: `Memory context cleared for session ${payload.sessionId}` };
    }
    orchestrator.reset();
    return { success: true, message: "Conversation reset successfully." };
  });

  safeHandle("chat:clear-session-cache", (_event, payload?: { allSessions?: boolean; sessionId?: string }) => {
    if (payload?.allSessions) {
      orchestrator.clearAllSessionCache();
      return { success: true, message: "All session cache and temporary conversation history cleared successfully." };
    }
    const targetSessionId = payload?.sessionId || orchestrator.activeSessionId;
    orchestrator.resetSessionContext(targetSessionId);
    return { success: true, sessionId: targetSessionId, message: `Session cache cleared for ${targetSessionId}` };
  });

  // ─── 3. Models & Provider Management IPC ────────────────────────────
  safeHandle("models:get-state", async () => {
    let dynamicModels = PROVIDER_MODELS;
    let dynamicEmbeddingModels = PROVIDER_EMBEDDING_MODELS;
    try {
      dynamicModels = await ProviderRegistry.getInstance().getAllProviderModelsAsync();
      dynamicEmbeddingModels = await ProviderRegistry.getInstance().getAllProviderEmbeddingModelsAsync();
    } catch {}

    const vs = orchestrator.getVectorStore();
    const stats = vs.getStats();

    return {
      name: CONFIG.NAME,
      tagline: CONFIG.TAGLINE,
      provider: orchestrator.activeProvider,
      model: orchestrator.activeModel,
      embeddingModel: orchestrator.activeEmbeddingModel,
      embeddingProvider: orchestrator.activeEmbeddingProvider,
      thinkingLevel: orchestrator.thinkingLevel,
      thinkingPresets: Object.values(THINKING_PRESETS),
      availableProviders: getAvailableProviders(),
      providerModels: dynamicModels,
      providerEmbeddingModels: dynamicEmbeddingModels,
      totalDocuments: stats.totalDocuments,
      totalChunks: stats.totalChunks,
      toolsCount: orchestrator.getTools().length,
      tools: orchestrator.getTools(),
      plugins: orchestrator.getPluginsInfo(),
      contextCompressor: {
        config: orchestrator.getContextCompressor().getConfig(),
        stats: orchestrator.getContextCompressor().getStats(),
      },
    };
  });

  safeHandle("compressor:get-stats", () => {
    return {
      success: true,
      config: orchestrator.getContextCompressor().getConfig(),
      stats: orchestrator.getContextCompressor().getStats(),
    };
  });

  safeHandle("compressor:update-config", (_event, payload: Partial<import("../core/context-compressor.js").ContextCompressorConfig>) => {
    if (!payload || typeof payload !== "object") throw validationError("Invalid config payload");
    orchestrator.getContextCompressor().updateConfig(payload);
    return {
      success: true,
      config: orchestrator.getContextCompressor().getConfig(),
      stats: orchestrator.getContextCompressor().getStats(),
    };
  });

  safeHandle("compressor:reset-stats", () => {
    orchestrator.getContextCompressor().resetStats();
    return {
      success: true,
      stats: orchestrator.getContextCompressor().getStats(),
    };
  });

  safeHandle("compressor:compress-session", (_event, payload?: { sessionId?: string }) => {
    return orchestrator.compressSessionContext(payload?.sessionId);
  });

  safeHandle("compressor:get-context-tokens", (_event, payload?: { sessionId?: string; draftText?: string }) => {
    return orchestrator.getSessionContextTokens(payload?.sessionId, payload?.draftText);
  });

  safeHandle("models:set-active", (_event, payload: { model?: string; provider?: ProviderType; thinkingLevel?: ThinkingLevel; embeddingModel?: string; embeddingProvider?: ProviderType }) => {
    if (!payload || typeof payload !== "object") throw validationError("Invalid payload for models:set-active");
    if (payload.provider || payload.model) {
      activeProviderInstance = createAIProvider({
        provider: payload.provider,
        model: payload.model,
        embeddingModel: payload.embeddingModel || orchestrator.activeEmbeddingModel,
      });
      orchestrator.setProvider(activeProviderInstance);
    }

    if (payload.embeddingModel || payload.embeddingProvider) {
      orchestrator.setEmbeddingModel(
        payload.embeddingModel || orchestrator.activeEmbeddingModel,
        payload.embeddingProvider
      );
    }

    if (payload.thinkingLevel) {
      orchestrator.setThinkingLevel(payload.thinkingLevel);
    }

    return {
      success: true,
      provider: orchestrator.activeProvider,
      model: orchestrator.activeModel,
      embeddingModel: orchestrator.activeEmbeddingModel,
      embeddingProvider: orchestrator.activeEmbeddingProvider,
      thinkingLevel: orchestrator.thinkingLevel,
    };
  });

  // ─── 4. Plugins & Tools IPC ─────────────────────────────────────────
  safeHandle("plugins:list", () => {
    const plugins = orchestrator.getPluginsInfo();
    const tools = orchestrator.getTools();
    return { plugins, toolsCount: tools.length, tools };
  });

  safeHandle("plugins:toggle", async (_event, payload: { id: string; enabled: boolean }) => {
    if (!payload?.id) throw validationError("Plugin id is required");
    const toggled = orchestrator.setPluginEnabled(payload.id, payload.enabled);
    if (!toggled) throw new Error(`Plugin "${payload.id}" not found`);
    if (payload.id === "tts" && !payload.enabled) {
      try {
        await TTSService.getInstance().unload();
      } catch {}
    }
    return { success: true, plugins: orchestrator.getPluginsInfo(), tools: orchestrator.getTools() };
  });

  safeHandle("plugins:install-zip", (_event, payload: { base64Data: any; filename?: string }) => {
    if (!payload?.base64Data) throw validationError("ZIP data is required");
    const raw = payload.base64Data;
    const base64Clean = typeof raw === "string" && raw.includes(",")
      ? raw.split(",")[1]
      : typeof raw === "string"
      ? raw
      : "";
    const buffer = Buffer.isBuffer(raw)
      ? raw
      : Array.isArray(raw)
      ? Buffer.from(raw)
      : Buffer.from(base64Clean, "base64");

    if (buffer.length === 0) throw validationError("ZIP buffer is empty");
    if (buffer.length > 50 * 1024 * 1024) throw validationError("ZIP file exceeds 50 MB size limit");

    const res = orchestrator.installPluginFromZip(buffer);
    if (!res.success) throw new Error(res.error || "Installation failed");
    return { success: true, plugin: res.plugin, plugins: orchestrator.getPluginsInfo(), tools: orchestrator.getTools() };
  });

  safeHandle("plugins:uninstall", async (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Plugin id is required");
    const res = await orchestrator.uninstallPlugin(payload.id);
    if (!res.success) throw new Error(res.error || `Failed to uninstall plugin "${payload.id}"`);
    return { success: true, plugins: orchestrator.getPluginsInfo(), tools: orchestrator.getTools() };
  });

  safeHandle("plugins:get-ui-extensions", () => {
    return { success: true, extensions: orchestrator.getActiveUIExtensions() };
  });

  safeHandle("plugins:reload", async () => {
    const reloadResult = await orchestrator.reloadPlugins();
    return { success: true, count: reloadResult.count, plugins: orchestrator.getPluginsInfo(), tools: orchestrator.getTools() };
  });

  // ─── 5. Connectors IPC ──────────────────────────────────────────────
  safeHandle("connectors:list", () => {
    return {
      connectors: connectorManager.getAllConnectors(),
      companionStatuses: connectorManager.getAllCompanionStatuses(),
      tools: orchestrator.getTools(),
    };
  });

  safeHandle("connectors:start-companion", async (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const res = await connectorManager.startCompanion(payload.id);
    return {
      success: res.success,
      result: res,
      companionStatus: connectorManager.getCompanionStatus(payload.id),
      connectors: connectorManager.getAllConnectors(),
    };
  });

  safeHandle("connectors:stop-companion", async (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const res = await connectorManager.stopCompanion(payload.id);
    return {
      success: res.success,
      result: res,
      companionStatus: connectorManager.getCompanionStatus(payload.id),
      connectors: connectorManager.getAllConnectors(),
    };
  });

  safeHandle("connectors:restart-companion", async (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const res = await connectorManager.restartCompanion(payload.id);
    return {
      success: res.success,
      result: res,
      companionStatus: connectorManager.getCompanionStatus(payload.id),
      connectors: connectorManager.getAllConnectors(),
    };
  });

  safeHandle("connectors:companion-status", (_event, payload?: { id?: string }) => {
    if (payload?.id) {
      return { success: true, status: connectorManager.getCompanionStatus(payload.id) };
    }
    return { success: true, statuses: connectorManager.getAllCompanionStatuses() };
  });

  safeHandle("connectors:read-docs", (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    return { success: true, id: payload.id, ...connectorManager.readPackageDocs(payload.id) };
  });

  safeHandle("connectors:save", (_event, payload: any) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const saved = connectorManager.saveConnector(payload);
    orchestrator.initialize();
    return {
      success: true,
      connector: saved,
      connectors: connectorManager.getAllConnectors(),
      companionStatus: connectorManager.getCompanionStatus(payload.id),
      companionStatuses: connectorManager.getAllCompanionStatuses(),
      tools: orchestrator.getTools(),
    };
  });

  safeHandle("connectors:toggle", (_event, payload: { id: string; enabled: boolean }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const toggled = connectorManager.toggleConnector(payload.id, payload.enabled);
    if (!toggled) throw new Error(`Connector "${payload.id}" not found.`);
    orchestrator.initialize();
    return {
      success: true,
      connector: toggled,
      connectors: connectorManager.getAllConnectors(),
      companionStatus: connectorManager.getCompanionStatus(payload.id),
      companionStatuses: connectorManager.getAllCompanionStatuses(),
      tools: orchestrator.getTools(),
    };
  });

  safeHandle("connectors:test", async (_event, payload: { id: string; config?: any }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const testResult = await connectorManager.testConnection(payload.id, payload.config);
    return {
      success: testResult.success,
      result: testResult,
      connectors: connectorManager.getAllConnectors(),
      companionStatus: connectorManager.getCompanionStatus(payload.id),
      companionStatuses: connectorManager.getAllCompanionStatuses(),
    };
  });

  safeHandle("connectors:delete", (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const deleted = connectorManager.deleteConnector(payload.id);
    orchestrator.initialize();
    return {
      success: deleted,
      connectors: connectorManager.getAllConnectors(),
      companionStatuses: connectorManager.getAllCompanionStatuses(),
      tools: orchestrator.getTools(),
    };
  });

  safeHandle("connectors:install-package", async (_event, payload: { buffer?: any; filename?: string }) => {
    if (!payload?.buffer) {
      return { success: false, error: "Connector package must be provided as a .zip file.", code: "VALIDATION_ERROR" };
    }

    const buf = Buffer.isBuffer(payload.buffer)
      ? payload.buffer
      : Array.isArray(payload.buffer)
      ? Buffer.from(payload.buffer)
      : typeof payload.buffer === "string" && payload.buffer.startsWith("data:")
      ? Buffer.from(payload.buffer.split(",")[1] || "", "base64")
      : Buffer.from(payload.buffer);

    const isZip = payload.filename?.toLowerCase().endsWith(".zip") || (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b);
    if (!isZip) {
      return { success: false, error: "Only .zip connector packages are accepted.", code: "VALIDATION_ERROR" };
    }

    const result = await connectorManager.installConnectorZip(buf);
    if (result.success) orchestrator.initialize();
    return {
      ...result,
      connectors: connectorManager.getAllConnectors(),
      companionStatuses: connectorManager.getAllCompanionStatuses(),
      tools: orchestrator.getTools(),
    };
  });

  safeHandle("connectors:export-package", (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Connector id is required");
    const exported = connectorManager.exportConnector(payload.id);
    if (!exported) throw new Error(`Connector "${payload.id}" not found.`);
    return exported;
  });

  // ─── 6. Security & Governance IPC ───────────────────────────────────
  safeHandle("security:get-settings", () => {
    const sm = orchestrator.getSecurityManager();
    const config = sm.getConfig();
    const sessionWhitelists = sm.getSessionWhitelists();
    const pendingApprovals = sm.getPendingApprovals();
    const rawDetails = sm.getSessionWhitelistDetails();

    const allSessions = orchestrator.getSessionMemory().listSessions();
    const sessionMap = new Map<string, string>();
    for (const s of allSessions) {
      sessionMap.set(s.id, s.title);
    }

    const sessionWhitelistDetails = rawDetails.map((item) => ({
      sessionId: item.sessionId,
      sessionTitle: sessionMap.get(item.sessionId) || `Session ${item.sessionId.slice(0, 8)}`,
      tools: item.tools,
    }));

    return { config, sessionWhitelists, sessionWhitelistDetails, pendingApprovals };
  });

  safeHandle("security:update-settings", (_event, payload: any) => {
    if (!payload || typeof payload !== "object") throw validationError("Invalid security settings payload");
    const sm = orchestrator.getSecurityManager();
    const updated = sm.updateConfig(payload);
    const sessionWhitelists = sm.getSessionWhitelists();
    const pendingApprovals = sm.getPendingApprovals();
    const rawDetails = sm.getSessionWhitelistDetails();

    const allSessions = orchestrator.getSessionMemory().listSessions();
    const sessionMap = new Map<string, string>();
    for (const s of allSessions) {
      sessionMap.set(s.id, s.title);
    }

    const sessionWhitelistDetails = rawDetails.map((item) => ({
      sessionId: item.sessionId,
      sessionTitle: sessionMap.get(item.sessionId) || `Session ${item.sessionId.slice(0, 8)}`,
      tools: item.tools,
    }));

    return { success: true, config: updated, sessionWhitelists, sessionWhitelistDetails, pendingApprovals };
  });

  safeHandle("security:resolve-approval", (_event, payload: { approvalId: string; decision: import("../core/types.js").ApprovalDecision }) => {
    if (!payload?.approvalId) throw validationError("approvalId is required");
    const sm = orchestrator.getSecurityManager();
    const resolved = sm.resolveApproval(payload.approvalId, payload.decision);
    return { success: resolved, approvalId: payload.approvalId, decision: payload.decision };
  });

  safeHandle("security:reset", () => {
    const sm = orchestrator.getSecurityManager();
    const updated = sm.resetToDefaults();
    const sessionWhitelists = sm.getSessionWhitelists();
    const pendingApprovals = sm.getPendingApprovals();
    const sessionWhitelistDetails = sm.getSessionWhitelistDetails();
    return { success: true, config: updated, sessionWhitelists, sessionWhitelistDetails, pendingApprovals };
  });

  safeHandle("security:clear-whitelist", (_event, payload?: { sessionId?: string }) => {
    const sm = orchestrator.getSecurityManager();
    sm.clearSessionWhitelist(payload?.sessionId);
    return { success: true, message: "Session whitelists cleared." };
  });

  safeHandle("security:revoke-permission", (_event, payload: { sessionId: string; toolName: string }) => {
    if (!payload?.sessionId || !payload?.toolName) throw validationError("sessionId and toolName are required");
    const sm = orchestrator.getSecurityManager();
    const revoked = sm.revokeSessionPermission(payload.sessionId, payload.toolName);
    return { success: revoked, sessionId: payload.sessionId, toolName: payload.toolName };
  });

  // ─── 6.45 Skills & Cognitive Directives IPC ─────────────────────────
  safeHandle("skills:list", () => {
    const sm = orchestrator.getSkillsManager();
    const skills = sm.getSkills();
    const filterMode = sm.getFilterMode();
    const activeCount = skills.filter((s) => s.enabled).length;
    return { success: true, skills, filterMode, activeCount, total: skills.length };
  });

  safeHandle("skills:toggle", (_event, payload: { id: string; enabled: boolean }) => {
    if (!payload?.id) throw validationError("Skill id is required");
    const sm = orchestrator.getSkillsManager();
    const toggled = sm.toggleSkill(payload.id, Boolean(payload.enabled));
    if (!toggled) throw new Error(`Skill "${payload.id}" not found.`);
    const skills = sm.getSkills();
    return { success: true, skills, activeCount: skills.filter((s) => s.enabled).length };
  });

  safeHandle("skills:save", (_event, payload: any) => {
    if (!payload || !payload.name) throw validationError("Skill name is required");
    const sm = orchestrator.getSkillsManager();
    const saved = sm.saveSkill(payload);
    const skills = sm.getSkills();
    return { success: true, skill: saved, skills, activeCount: skills.filter((s) => s.enabled).length };
  });

  safeHandle("skills:delete", (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Skill id is required");
    const sm = orchestrator.getSkillsManager();
    const deleted = sm.deleteSkill(payload.id);
    const skills = sm.getSkills();
    return { success: deleted, skills, activeCount: skills.filter((s) => s.enabled).length };
  });

  safeHandle("skills:set-filter-mode", (_event, payload: { mode: "smart_filter" | "always_active" }) => {
    if (payload?.mode !== "smart_filter" && payload?.mode !== "always_active") {
      throw validationError("Valid mode must be 'smart_filter' or 'always_active'");
    }
    const sm = orchestrator.getSkillsManager();
    sm.setFilterMode(payload.mode);
    return { success: true, filterMode: sm.getFilterMode() };
  });

  safeHandle("skills:reset", () => {
    const sm = orchestrator.getSkillsManager();
    const skills = sm.resetToDefaults();
    return { success: true, skills, filterMode: sm.getFilterMode(), activeCount: skills.filter((s) => s.enabled).length };
  });

  safeHandle("skills:test-filter", (_event, payload: { prompt: string }) => {
    const prompt = String(payload?.prompt || "");
    const sm = orchestrator.getSkillsManager();
    const matchedSkills = sm.getApplicableSkills(prompt);
    return {
      success: true,
      filterMode: sm.getFilterMode(),
      matchedSkills,
      matchedCount: matchedSkills.length,
    };
  });

  safeHandle("skills:import", (_event, payload: { content: string; filename?: string }) => {
    if (!payload?.content) throw validationError("Skill markdown or text content is required");
    const sm = orchestrator.getSkillsManager();
    const imported = sm.importSkillFromMarkdown(payload.content, payload.filename);
    const skills = sm.getSkills();
    return { success: true, skill: imported, skills, activeCount: skills.filter((s) => s.enabled).length };
  });

  safeHandle("skills:export", (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Skill id is required");
    const sm = orchestrator.getSkillsManager();
    const exported = sm.exportSkill(payload.id);
    if (!exported) throw new Error(`Skill "${payload.id}" not found.`);
    return { success: true, ...exported };
  });

  // ─── 6.5 Generic Tool Execution IPC ─────────────────────────────────
  safeHandle("tools:execute", async (_event, payload: { name?: string; toolName?: string; args?: any; params?: any }) => {
    const toolName = String(payload?.name || payload?.toolName || "").trim();
    if (!toolName) throw validationError("Tool name is required");
    const toolArgs = payload?.args || payload?.params || {};
    const execResult = await orchestrator.getPluginManager().executeTool(toolName, toolArgs);
    return { success: true, name: toolName, result: execResult.response };
  });

  // ─── 6.6 Knowledge Base RAG Documents IPC ───────────────────────────
  safeHandle("kb:documents", () => {
    const vs = orchestrator.getVectorStore();
    const docs = vs.listDocuments();
    const stats = vs.getStats();
    return { documents: docs, stats };
  });

  safeHandle("kb:upload", async (_event, payload: { filename: string; content: string; isBase64?: boolean }) => {
    if (!payload?.filename || !payload?.content) throw validationError("filename and content are required");
    if (payload.filename.length > 255) throw validationError("Filename too long");
    const rawBuffer = payload.isBase64 ? Buffer.from(payload.content, "base64") : Buffer.from(payload.content, "utf-8");
    if (rawBuffer.length > 100 * 1024 * 1024) throw validationError("File exceeds 100 MB size limit");
    const parsed = await parseDocumentContent(payload.filename, rawBuffer);
    let chunkCount = 0;
    if (parsed.text && parsed.text.trim().length > 0) {
      const ingestResult = await orchestrator.getVectorStore().ingestText(payload.filename, parsed.text);
      chunkCount = ingestResult.chunkCount;
    }
    return { success: true, filename: payload.filename, chunks: chunkCount };
  });

  // ─── 6.7 Sandbox Management IPC ─────────────────────────────────────
  safeHandle("sandbox:files", () => {
    syncNestedSandboxArtifacts();
    const fileList: any[] = [];
    if (existsSync(SANDBOX_DIR)) {
      for (const file of readdirSync(SANDBOX_DIR)) {
        if (file === "venv" || file === "artifacts" || file.startsWith(".")) continue;
        const full = join(SANDBOX_DIR, file);
        try {
          const st = statSync(full);
          if (st.isFile()) {
            const ext = extname(file).toLowerCase();
            fileList.push({
              name: file,
              sizeBytes: st.size,
              modifiedAt: st.mtime.toISOString(),
              isImage: [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".bmp"].includes(ext),
              isVideo: [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi", ".m4v"].includes(ext),
              isAudio: [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext),
              isCode: [".py", ".js", ".ts", ".json", ".csv", ".txt", ".md", ".html", ".sh", ".bat", ".yaml", ".yml"].includes(ext),
              ext,
            });
          }
        } catch {}
      }
    }
    return { sandboxDir: SANDBOX_DIR, files: fileList };
  });

  safeHandle("sandbox:clean", () => {
    cleanSandboxOnShutdown(true);
    return { success: true };
  });

  safeHandle("connectors:blender-script", () => {
    const installedPath = resolve(process.cwd(), "connectors", "installed", "blender", "scripts", "blender_bridge.py");
    if (existsSync(installedPath)) {
      return readFileSync(installedPath, "utf-8");
    }
    const fixturePath = resolve(process.cwd(), "tests", "fixtures", "blender_bridge.py");
    if (existsSync(fixturePath)) {
      return readFileSync(fixturePath, "utf-8");
    }
    return "";
  });

  // ─── 7. Session Management IPC ──────────────────────────────────────
  safeHandle("sessions:set-mode", (_event, payload: { sessionId: string; mode: ChatMode }) => {
    if (!payload?.sessionId || !isChatMode(payload.mode)) throw validationError("Valid sessionId and mode are required");
    orchestrator.getSessionMemory().setSessionMode(payload.sessionId, payload.mode);
    return { success: true, mode: payload.mode };
  });

  safeHandle("sessions:list", () => {
    return { sessions: orchestrator.listSessions(), activeSessionId: orchestrator.activeSessionId };
  });

  safeHandle("sessions:create", (_event, payload?: { title?: string }) => {
    const session = orchestrator.createSession(payload?.title || "New Chat");
    return { success: true, session };
  });

  safeHandle("sessions:switch", (_event, payload: { sessionId: string }) => {
    if (!payload?.sessionId) throw validationError("sessionId is required");
    orchestrator.switchSession(payload.sessionId);
    const messages = orchestrator.getSessionMessages(payload.sessionId);
    return { success: true, sessionId: payload.sessionId, messages };
  });

  safeHandle("sessions:get-messages", (_event, payload?: { sessionId?: string }) => {
    const targetSessionId = payload?.sessionId || orchestrator.activeSessionId;
    return { sessionId: targetSessionId, messages: orchestrator.getSessionMessages(targetSessionId) };
  });

  safeHandle("sessions:delete", (_event, payload: { sessionId: string }) => {
    if (!payload?.sessionId) throw validationError("sessionId is required");
    const deleted = orchestrator.deleteSession(payload.sessionId);
    return { success: deleted, activeSessionId: orchestrator.activeSessionId };
  });

  safeHandle("sessions:update-title", (_event, payload: { sessionId: string; title: string }) => {
    if (!payload?.sessionId) throw validationError("sessionId is required");
    const cleanTitle = (payload.title || "Chat Session")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 36)
      .trim();
    orchestrator.updateSessionTitle(payload.sessionId, cleanTitle);
    return { success: true, sessionId: payload.sessionId, title: cleanTitle };
  });

  // ─── 8. System Configuration File I/O (Direct OS Native) ────────────
  safeHandle("system-config:read", () => {
    let configYamlPath = getResolvedConfigYamlPath();
    let envPath = getResolvedEnvPath();

    // Auto-bootstrap config.yaml from config.example.yaml if missing
    if (!existsSync(configYamlPath)) {
      const candidates = [
        (process as any).resourcesPath ? resolve((process as any).resourcesPath, "config.yaml") : "",
        (process as any).resourcesPath ? resolve((process as any).resourcesPath, "config.example.yaml") : "",
        resolve(dirname(configYamlPath), "config.example.yaml"),
        resolve(process.cwd(), "config.example.yaml"),
        resolve(__dirname, "../../config.example.yaml"),
      ].filter(Boolean);
      for (const cand of candidates) {
        if (existsSync(cand)) {
          try { copyFileSync(cand, configYamlPath); break; } catch {}
        }
      }
    }

    // Auto-bootstrap .env from .env.example if missing
    if (!existsSync(envPath)) {
      const candidates = [
        (process as any).resourcesPath ? resolve((process as any).resourcesPath, ".env") : "",
        (process as any).resourcesPath ? resolve((process as any).resourcesPath, ".env.example") : "",
        resolve(dirname(envPath), ".env.example"),
        resolve(process.cwd(), ".env.example"),
        resolve(__dirname, "../../.env.example"),
      ].filter(Boolean);
      for (const cand of candidates) {
        if (existsSync(cand)) {
          try { copyFileSync(cand, envPath); break; } catch {}
        }
      }
    }

    const configYaml = existsSync(configYamlPath) ? readFileSync(configYamlPath, "utf-8") : "";
    const env = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    if (env) {
      try {
        const parsed = dotenv.parse(env);
        for (const [k, v] of Object.entries(parsed)) {
          process.env[k] = (v || "").trim().replace(/^["']|["']$/g, "").trim();
        }
      } catch {}
    }
    return { configYamlPath, configYaml, envPath, env };
  });

  safeHandle("system-config:save", (_event, payload: { fileType: "yaml" | "env"; content: string }) => {
    if (!payload?.fileType || !payload?.content === undefined) throw validationError("fileType and content are required");
    if (payload.fileType !== "yaml" && payload.fileType !== "env") throw validationError("fileType must be 'yaml' or 'env'");
    if (typeof payload.content !== "string") throw validationError("content must be a string");
    if (payload.content.length > 2 * 1024 * 1024) throw validationError("Config file exceeds 2 MB size limit");

    if (payload.fileType === "yaml") {
      const targetPath = getResolvedConfigYamlPath();
      writeFileSync(targetPath, String(payload.content), "utf-8");
      orchestrator.initialize();
      return { success: true, message: "config.yaml saved successfully", path: targetPath };
    } else {
      const targetPath = getResolvedEnvPath();
      writeFileSync(targetPath, String(payload.content), "utf-8");
      const parsed = dotenv.parse(String(payload.content));
      for (const [k, v] of Object.entries(parsed)) {
        process.env[k] = (v || "").trim().replace(/^["']|["']$/g, "").trim();
      }
      ProviderRegistry.getInstance().clearCaches();
      try {
        activeProviderInstance = createAIProvider({
          provider: orchestrator.activeProvider as any,
          model: orchestrator.activeModel,
          embeddingModel: orchestrator.activeEmbeddingModel,
        });
        orchestrator.setProvider(activeProviderInstance);
      } catch (provErr) {
        logVerbose("WARN", `[IPC] Failed to hot-reload provider after .env save: ${provErr}`);
      }
      return { success: true, message: ".env saved and AI engine hot-reloaded with new credentials", path: targetPath };
    }
  });

  safeHandle("system-config:open-external", (_event, payload: { fileType: "yaml" | "env"; action?: "file" | "folder" }) => {
    if (!payload?.fileType) throw validationError("fileType is required");
    const target = payload.fileType === "env" ? getResolvedEnvPath() : getResolvedConfigYamlPath();
    if (payload.action === "folder") {
      shell.showItemInFolder(target);
    } else {
      shell.openPath(target);
    }
    return { success: true, target };
  });

  // ─── 9. Artifacts & Media Storage IPC ───────────────────────────────
  safeHandle("artifacts:list", () => {
    syncNestedSandboxArtifacts();
    const fileMap = new Map<string, any>();

    function scanArtifactDir(dir: string, depth = 0): void {
      if (!existsSync(dir) || depth > 3) return;
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") || entry.name === "venv" || entry.name === "__pycache__" || entry.name === "node_modules") continue;
          const full = join(dir, entry.name);
          if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            // Use basename as the key to avoid duplicates (flat copies vs subdirectory originals)
            if (!fileMap.has(entry.name)) {
              try {
                const st = statSync(full);
                fileMap.set(entry.name, {
                  name: entry.name,
                  sizeBytes: st.size,
                  modifiedAt: st.mtime.toISOString(),
                  isImage: [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".bmp"].includes(ext),
                  isVideo: [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi", ".m4v"].includes(ext),
                  isAudio: [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext),
                  isCode: [".py", ".js", ".ts", ".json", ".csv", ".txt", ".md", ".html", ".sh", ".bat", ".yaml", ".yml"].includes(ext),
                  ext,
                });
              } catch {}
            }
          } else if (entry.isDirectory()) {
            scanArtifactDir(full, depth + 1);
          }
        }
      } catch {}
    }

    scanArtifactDir(ARTIFACTS_DIR);
    return { artifactsDir: ARTIFACTS_DIR, files: Array.from(fileMap.values()) };
  });

  safeHandle("artifacts:delete", (_event, payload: { name: string }) => {
    if (!payload?.name) throw validationError("Artifact name is required");
    const cleanName = payload.name.replace(/^[/\\]+/, "").split(/[/\\]/).pop() || payload.name;
    const targetPath = join(ARTIFACTS_DIR, cleanName);
    if (existsSync(targetPath)) {
      unlinkSync(targetPath);
    }
    try {
      const db = AgentDatabase.getInstance().db;
      db.prepare("DELETE FROM media_storage WHERE name = ?").run(cleanName);
    } catch {}
    return { success: true, filename: cleanName };
  });

  safeHandle("artifacts:get-file", (_event, payload: { name: string }) => {
    if (!payload?.name) throw validationError("Artifact name is required");
    const cleanName = (payload.name || "").replace(/^[/\\]+/, "").split(/[/\\]/).pop() || payload.name;

    // Search in ARTIFACTS_DIR root first, then recursively in subdirectories
    function findArtifactFile(name: string): string | null {
      const direct = join(ARTIFACTS_DIR, name);
      if (existsSync(direct)) return direct;
      // Recursive search in subdirectories (animations/, videos/, etc.)
      if (existsSync(ARTIFACTS_DIR)) {
        try {
          for (const entry of readdirSync(ARTIFACTS_DIR, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const subPath = join(ARTIFACTS_DIR, entry.name, name);
              if (existsSync(subPath)) return subPath;
            }
          }
        } catch {}
      }
      // Also check sandbox artifacts
      const sandboxArtifacts = join(SANDBOX_DIR, "artifacts");
      if (existsSync(sandboxArtifacts)) {
        const sbDirect = join(sandboxArtifacts, name);
        if (existsSync(sbDirect)) return sbDirect;
        try {
          for (const entry of readdirSync(sandboxArtifacts, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const subPath = join(sandboxArtifacts, entry.name, name);
              if (existsSync(subPath)) return subPath;
            }
          }
        } catch {}
      }
      return null;
    }

    const targetPath = findArtifactFile(cleanName);
    if (targetPath) {
      const buf = readFileSync(targetPath);
      const ext = extname(cleanName).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".ogg": "video/ogg",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
        ".m4v": "video/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".flac": "audio/flac",
        ".json": "application/json",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".html": "text/html",
        ".csv": "text/csv",
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".ts": "text/typescript",
      };
      const isBinary = Boolean(ext.match(/\.(png|jpg|jpeg|webp|gif|zip|exe|bin|ico|mp4|webm|ogg|mov|mkv|avi|m4v|mp3|wav|m4a|flac)$/i));
      return {
        exists: true,
        filename: cleanName,
        mime: mimeMap[ext] || "application/octet-stream",
        base64: buf.toString("base64"),
        isText: !isBinary,
        text: !isBinary ? buf.toString("utf-8") : undefined,
      };
    }
    return { exists: false, filename: cleanName };
  });

  safeHandle("artifacts:open-external", (_event, payload: { name: string; isSandbox?: boolean; action?: "play" | "folder" }) => {
    if (!payload?.name) throw validationError("Artifact name is required");
    const cleanName = (payload.name || "").replace(/^[/\\]+/, "").split(/[/\\]/).pop() || payload.name;
    const baseDir = payload.isSandbox ? SANDBOX_DIR : ARTIFACTS_DIR;

    // Search for the file in root and common subdirectories
    let targetPath = join(baseDir, cleanName);
    if (!existsSync(targetPath)) {
      // Check subdirectories
      const subdirs = ["animations", "videos", "media", "audio", "plots", "images"];
      for (const sub of subdirs) {
        const subPath = join(baseDir, sub, cleanName);
        if (existsSync(subPath)) { targetPath = subPath; break; }
      }
      // Also try sandbox artifacts subdirectory
      if (!existsSync(targetPath)) {
        const sbArtifacts = join(SANDBOX_DIR, "artifacts");
        const sbPath = join(sbArtifacts, cleanName);
        if (existsSync(sbPath)) targetPath = sbPath;
        else {
          for (const sub of ["animations", "videos", "media"]) {
            const subPath = join(sbArtifacts, sub, cleanName);
            if (existsSync(subPath)) { targetPath = subPath; break; }
          }
        }
      }
      // Fallback: check artifacts dir too
      if (!existsSync(targetPath)) {
        const artPath = join(ARTIFACTS_DIR, cleanName);
        if (existsSync(artPath)) targetPath = artPath;
        else {
          for (const sub of ["animations", "videos", "media"]) {
            const subPath = join(ARTIFACTS_DIR, sub, cleanName);
            if (existsSync(subPath)) { targetPath = subPath; break; }
          }
        }
      }
    }

    if (!existsSync(targetPath)) {
      return { success: false, error: `File not found: ${cleanName}` };
    }

    if (payload.action === "folder") {
      shell.showItemInFolder(targetPath);
    } else {
      shell.openPath(targetPath);
    }
    return { success: true, path: targetPath };
  });

  safeHandle("artifacts:upload", (_event, payload: { filename: string; data: string }) => {
    if (!payload?.filename) throw validationError("Filename is required");
    const cleanName = (payload.filename || "").replace(/^[/\\]+/, "").split(/[/\\]/).pop() || `artifact_${Date.now()}.png`;
    const targetPath = join(ARTIFACTS_DIR, cleanName);
    let rawBuffer: Buffer;
    if (typeof payload.data === "string" && payload.data.startsWith("data:")) {
      const base64Data = payload.data.split(",")[1] || "";
      rawBuffer = Buffer.from(base64Data, "base64");
    } else if (typeof payload.data === "string") {
      rawBuffer = Buffer.from(payload.data, "base64");
    } else {
      rawBuffer = Buffer.from(JSON.stringify(payload.data), "utf-8");
    }
    writeFileSync(targetPath, rawBuffer);

    try {
      const db = AgentDatabase.getInstance().db;
      db.prepare(`
        INSERT OR REPLACE INTO media_storage (name, path, mime_type, size_bytes, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(cleanName, targetPath, "image/png", rawBuffer.length);
    } catch {}

    return { success: true, filename: cleanName, url: `/api/artifacts/file?name=${encodeURIComponent(cleanName)}` };
  });

  ipcMain.handle("artifacts:share-web", async (_event, payload: { name: string; isSandbox?: boolean }) => {
    const cleanName = (payload.name || "").replace(/^[/\\]+/, "").split(/[/\\]/).pop() || payload.name;
    const targetDir = payload.isSandbox ? SANDBOX_DIR : ARTIFACTS_DIR;
    let targetPath = join(targetDir, cleanName);

    if (!existsSync(targetPath)) {
      const altDir = payload.isSandbox ? ARTIFACTS_DIR : SANDBOX_DIR;
      const altPath = join(altDir, cleanName);
      if (existsSync(altPath)) {
        targetPath = altPath;
      } else {
        throw new Error(`Artifact file "${cleanName}" not found on disk.`);
      }
    }

    let fileBuffer = readFileSync(targetPath);
    const ext = extname(cleanName).toLowerCase();

    const mimeMap: Record<string, string> = {
      ".html": "text/html",
      ".htm": "text/html",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".gif": "image/gif",
      ".md": "text/markdown",
      ".txt": "text/plain",
      ".json": "application/json",
      ".csv": "text/csv",
      ".py": "text/plain",
      ".js": "text/javascript",
      ".ts": "text/plain",
      ".css": "text/css",
    };

    const mimeType = mimeMap[ext] || "text/plain";

    // For HTML web artifacts, inject a clean floating attribution badge if not already present
    if (ext === ".html" || ext === ".htm") {
      let htmlStr = fileBuffer.toString("utf-8");
      if (!htmlStr.includes("Created with AI Plate") && !htmlStr.includes("Made with AI Plate")) {
        const badgeSnippet = `
<!-- AI Plate Web Share Badge -->
<div style="position:fixed;bottom:14px;right:14px;z-index:999999;font-family:system-ui,-apple-system,sans-serif;pointer-events:auto;">
  <a href="https://github.com/ai-plate/ai-plate" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:7px;background:rgba(15,17,23,0.88);color:#f1f5f9;border:1px solid rgba(255,255,255,0.18);padding:6px 13px;border-radius:24px;font-size:11.5px;font-weight:500;text-decoration:none;box-shadow:0 4px 20px rgba(0,0,0,0.45);backdrop-filter:blur(8px);transition:transform 0.15s ease,box-shadow 0.15s ease;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 24px rgba(99,102,241,0.3)';" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 20px rgba(0,0,0,0.45)';">
    <span style="font-size:13px;line-height:1;">⚡</span>
    <span>Created with <strong style="color:#818cf8;font-weight:700;">AI Plate</strong></span>
  </a>
</div>
`;
        if (htmlStr.includes("</body>")) {
          htmlStr = htmlStr.replace("</body>", `${badgeSnippet}\n</body>`);
        } else {
          htmlStr += badgeSnippet;
        }
        fileBuffer = Buffer.from(htmlStr, "utf-8");
      }
    }

    // 1. Primary provider: bytebin (immediate live rendering of HTML, images, and text)
    try {
      const uploadRes = await fetch("https://bytebin.lucko.me/post", {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: fileBuffer,
        signal: AbortSignal.timeout(12000),
      });

      if (uploadRes.ok) {
        const resJson: any = await uploadRes.json();
        if (resJson?.key) {
          const publicUrl = `https://bytebin.lucko.me/${resJson.key}`;
          return {
            success: true,
            url: publicUrl,
            key: resJson.key,
            filename: cleanName,
            mime: mimeType,
            sizeBytes: fileBuffer.length,
          };
        }
      }
    } catch (err) {
      logVerbose("WARN", `[Share Artifact] Bytebin upload failed: ${err}. Attempting fallback...`);
    }

    // 2. Fallback provider: tmpfiles.org
    try {
      const formData = new FormData();
      formData.append("file", new Blob([fileBuffer], { type: mimeType }), cleanName);
      const fbRes = await fetch("https://tmpfiles.org/api/v1/upload", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(15000),
      });
      if (fbRes.ok) {
        const json: any = await fbRes.json();
        if (json?.data?.url) {
          const rawUrl = json.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
          return {
            success: true,
            url: rawUrl,
            filename: cleanName,
            mime: mimeType,
            sizeBytes: fileBuffer.length,
          };
        }
      }
    } catch (fbErr: any) {
      logVerbose("WARN", `[Share Artifact] Fallback upload failed: ${fbErr}`);
    }

    throw new Error("Public web deployment service is temporarily unreachable. Please check your network connection.");
  });

  safeHandle("sandbox:get-file", (_event, payload: { name: string }) => {
    const cleanName = (payload?.name || "").replace(/^[/\\]+/, "").split(/[/\\]/).pop() || payload?.name;
    if (!cleanName) return { exists: false, filename: "" };

    // Search in SANDBOX_DIR root first, then recursively in subdirectories
    function findSandboxFile(name: string): string | null {
      const direct = join(SANDBOX_DIR, name);
      if (existsSync(direct)) return direct;
      // Check subdirectories (artifacts/, artifacts/animations/, etc.)
      if (existsSync(SANDBOX_DIR)) {
        const subdirs = ["artifacts", "artifacts/animations", "artifacts/videos", "artifacts/media"];
        for (const sub of subdirs) {
          const subPath = join(SANDBOX_DIR, sub, name);
          if (existsSync(subPath)) return subPath;
        }
        try {
          for (const entry of readdirSync(SANDBOX_DIR, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "venv" && entry.name !== "__pycache__") {
              const subPath = join(SANDBOX_DIR, entry.name, name);
              if (existsSync(subPath)) return subPath;
            }
          }
        } catch {}
      }
      // Also check artifacts dir
      const artDirect = join(ARTIFACTS_DIR, name);
      if (existsSync(artDirect)) return artDirect;
      return null;
    }

    const targetPath = findSandboxFile(cleanName);
    if (targetPath) {
      const buf = readFileSync(targetPath);
      const ext = extname(cleanName).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".ogg": "video/ogg",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
        ".m4v": "video/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".flac": "audio/flac",
        ".json": "application/json",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".html": "text/html",
        ".csv": "text/csv",
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".ts": "text/typescript",
      };
      const isBinary = Boolean(ext.match(/\.(png|jpg|jpeg|webp|gif|zip|exe|bin|ico|mp4|webm|ogg|mov|mkv|avi|m4v|mp3|wav|m4a|flac)$/i));
      return {
        exists: true,
        filename: cleanName,
        mime: mimeMap[ext] || "application/octet-stream",
        base64: buf.toString("base64"),
        isText: !isBinary,
        text: !isBinary ? buf.toString("utf-8") : undefined,
      };
    }
    return { exists: false, filename: cleanName };
  });

  safeHandle("sandbox:delete-file", (_event, payload: { name: string }) => {
    if (!payload?.name) return { success: false, filename: "" };
    const cleanName = (payload.name || "").replace(/^[/\\]+/, "").split(/[/\\]/).pop() || payload.name;
    const targetPath = join(SANDBOX_DIR, cleanName);
    if (existsSync(targetPath)) {
      unlinkSync(targetPath);
      return { success: true, filename: cleanName };
    }
    return { success: false, filename: cleanName };
  });

  safeHandle("plugins:export", (_event, payload: { id: string }) => {
    if (!payload?.id) throw validationError("Plugin id is required");
    const zipBuf = orchestrator.getPluginManager().exportPluginZip(payload.id);
    if (zipBuf) {
      return { success: true, filename: `${payload.id}.zip`, base64: zipBuf.toString("base64") };
    }
    return { success: false, filename: `${payload.id}.zip` };
  });

  // ─── 10. Native File Dialogs ────────────────────────────────────────
  safeHandle("dialog:select-file", async (_event, options?: { title?: string; extensions?: string[] }) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: options?.title || "Select File",
      filters: options?.extensions ? [{ name: "Supported Files", extensions: options.extensions }] : undefined,
      properties: ["openFile"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const buffer = readFileSync(filePath);
    return {
      filePath,
      filename: basename(filePath),
      base64Data: buffer.toString("base64"),
      sizeBytes: buffer.length,
    };
  });

  // ─── 11. Kokoro Text-to-Speech (TTS) ────────────────────────────────
  safeHandle("tts:speak", async (_event, payload: { text: string; voice?: string; speed?: number }) => {
    if (!payload?.text) throw validationError("Text is required for speech synthesis");
    const tts = TTSService.getInstance();
    const res = await tts.synthesize(payload.text, {
      voice: payload.voice,
      speed: payload.speed,
      returnBase64: true,
    });
    return res;
  });

  safeHandle("tts:get-voices", async () => {
    const tts = TTSService.getInstance();
    const voices = await tts.getVoices();
    return { success: true, voices };
  });

  safeHandle("tts:get-status", async () => {
    const tts = TTSService.getInstance();
    return {
      success: true,
      available: tts.isAvailable(),
      engine: "Kokoro-v1.0 ONNX",
    };
  });

  safeHandle("tts:unload", async () => {
    const tts = TTSService.getInstance();
    await tts.unload();
    return { success: true };
  });

  safeHandle("tts:model-status", async () => {
    const tts = TTSService.getInstance();
    return { success: true, ...tts.getModelStatus() };
  });

  safeHandle("tts:download-model", async () => {
    const tts = TTSService.getInstance();
    const result = await tts.downloadModel((progress) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("tts:download-progress", progress);
        }
      } catch (err: any) {
        logger.warn("TTS", `Failed to send download progress to window: ${err?.message || err}`);
      }
    });
    return result;
  });

  safeHandle("tts:delete-model", async () => {
    const tts = TTSService.getInstance();
    const result = await tts.deleteModel();
    return result;
  });

  // ─── 12. Moonshine Speech-to-Text (STT) ─────────────────────────────
  safeHandle("stt:transcribe", async (_event, payload: { audioBase64?: string; audioBuffer?: any; model?: "moonshine/tiny" | "moonshine/base" }) => {
    if (!payload?.audioBase64 && !payload?.audioBuffer) {
      throw validationError("Audio data (audioBase64 or audioBuffer) is required for speech recognition");
    }
    const stt = STTService.getInstance();
    const data = payload.audioBase64 || Buffer.from(payload.audioBuffer);
    const res = await stt.transcribe(data, {
      model: payload.model,
    });
    return res;
  });

  safeHandle("stt:get-status", async () => {
    const stt = STTService.getInstance();
    return {
      success: true,
      available: stt.isAvailable(),
      engine: "Moonshine-ONNX",
    };
  });

  safeHandle("stt:unload", async () => {
    const stt = STTService.getInstance();
    await stt.unload();
    return { success: true };
  });

  safeHandle("stt:model-status", async () => {
    const stt = STTService.getInstance();
    return { success: true, ...stt.getModelStatus() };
  });

  safeHandle("stt:download-model", async (_event, payload?: { model?: "moonshine/tiny" | "moonshine/base" }) => {
    const stt = STTService.getInstance();
    const modelName = payload?.model || "moonshine/tiny";
    const result = await stt.downloadModel(modelName, (progress) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("stt:download-progress", progress);
        }
      } catch (err: any) {
        logger.warn("STT", `Failed to send download progress to window: ${err?.message || err}`);
      }
    });
    return result;
  });

  safeHandle("stt:delete-model", async () => {
    const stt = STTService.getInstance();
    const result = stt.deleteModel();
    return result;
  });

  // ─── Personal Memory & General Settings ───────────────────────────
  safeHandle("personal-memory:get-profile", async () => {
    const pm = orchestrator.getPersonalMemory();
    const facts = pm.listActiveFacts();
    const reflections = pm.listActiveReflections();
    const settings = pm.getAllGeneralSettings();
    let rawDossier = "";
    try {
      if (existsSync(pm.getProfilePath())) {
        rawDossier = readFileSync(pm.getProfilePath(), "utf-8");
      }
    } catch {}
    return {
      success: true,
      facts,
      reflections,
      settings,
      profilePath: pm.getProfilePath(),
      rawDossier,
    };
  });

  safeHandle("personal-memory:commit-fact", async (event, payload: any) => {
    const { category, factKey, factValue, importance } = payload || {};
    if (!factKey || !factValue) return { success: false, error: "Missing key or value" };
    const pm = orchestrator.getPersonalMemory();
    const result = pm.commitFact(category || "preference", factKey, factValue, 1.0, importance || 5);
    return { success: true, result, facts: pm.listActiveFacts() };
  });

  safeHandle("personal-memory:delete-fact", async (event, payload: any) => {
    const { factId } = payload || {};
    if (!factId) return { success: false, error: "Missing factId" };
    const pm = orchestrator.getPersonalMemory();
    const deleted = pm.deleteFact(Number(factId));
    return { success: deleted, facts: pm.listActiveFacts() };
  });

  safeHandle("personal-memory:delete-reflection", async (event, payload: any) => {
    const { reflectionId } = payload || {};
    if (!reflectionId) return { success: false, error: "Missing reflectionId" };
    const pm = orchestrator.getPersonalMemory();
    const deleted = pm.deleteReflection(Number(reflectionId));
    return { success: deleted, reflections: pm.listActiveReflections() };
  });

  safeHandle("personal-memory:reveal-file", async () => {
    const pm = orchestrator.getPersonalMemory();
    const p = pm.getProfilePath();
    if (existsSync(p)) {
      shell.showItemInFolder(p);
      return { success: true, path: p };
    }
    return { success: false, error: "File not found" };
  });

  safeHandle("personal-memory:wipe", async () => {
    const pm = orchestrator.getPersonalMemory();
    pm.wipePersonalMemory();
    return { success: true };
  });

  safeHandle("general-settings:get", async () => {
    const pm = orchestrator.getPersonalMemory();
    return { success: true, settings: pm.getAllGeneralSettings() };
  });

  safeHandle("general-settings:update", async (event, payload: any) => {
    const { key, value } = payload || {};
    if (!key) return { success: false, error: "Missing setting key" };
    const pm = orchestrator.getPersonalMemory();
    pm.setGeneralSetting(key, String(value));
    return { success: true, settings: pm.getAllGeneralSettings() };
  });
}

export function cleanSandboxOnShutdown(force: boolean = false): void {
  if (!force && CONFIG.SHELL.CLEAN_SANDBOX_ON_EXIT !== true) {
    return; // Preserve sandbox files across app restarts unless explicitly configured
  }
  try {
    if (existsSync(SANDBOX_DIR)) {
      const files = readdirSync(SANDBOX_DIR);
      for (const file of files) {
        if (file === "venv" || file === "tts" || file.startsWith(".")) continue;
        const full = join(SANDBOX_DIR, file);
        try {
          unlinkSync(full);
        } catch {}
      }
    }
  } catch {}
}

export function stopAllCompanionsOnShutdown(): void {
  try {
    connectorManager.stopAllCompanions();
  } catch {}
}
