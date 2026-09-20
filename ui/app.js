/**
 * AI Plate — Open Power: High-End Sleek Client Logic
 */

// ─── Native Desktop IPC Interceptor ─────────────────────────────────
if (window.electronAPI) {
  const _origFetch = window.fetch;

  function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  async function nativeIpcFetch(urlStr, options = {}) {
    const url = new URL(urlStr, "http://localhost");
    const pathname = url.pathname;
    const method = (options.method || "GET").toUpperCase();
    let body = {};
    if (options.body) {
      try {
        body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
      } catch {
        body = {};
      }
    }

    try {
      // 1. Models & Status & Config
      if (pathname === "/api/models" || pathname === "/api/status" || pathname === "/api/config") {
        if (method === "GET") {
          const data = await window.electronAPI.models.getState();
          if (pathname === "/api/models") {
            const provider = url.searchParams.get("provider");
            const type = url.searchParams.get("type");
            if (type === "embedding" && provider) {
              const provKey = provider.toLowerCase();
              const models =
                (data.providerEmbeddingModels && (data.providerEmbeddingModels[provKey] || data.providerEmbeddingModels[provider])) || [];
              return jsonResponse({ models });
            } else if (provider) {
              const provKey = provider.toLowerCase();
              const models =
                (data.providerModels && (data.providerModels[provKey] || data.providerModels[provider])) || [];
              return jsonResponse({ models });
            }
          }
          return jsonResponse(data);
        } else {
          const data = await window.electronAPI.models.setActive(body);
          return jsonResponse(data);
        }
      }

      // 2. Plugins
      if (pathname === "/api/plugins") {
        const data = await window.electronAPI.plugins.list();
        return jsonResponse(data);
      }
      if (pathname === "/api/plugins/toggle") {
        const data = await window.electronAPI.plugins.toggle(body.id, body.enabled);
        return jsonResponse(data);
      }
      if (pathname === "/api/plugins/install-zip" || pathname === "/api/plugins/install") {
        const data = await window.electronAPI.plugins.installZip(body.data || body.base64Data, body.filename);
        return jsonResponse(data);
      }
      if (pathname === "/api/plugins/uninstall") {
        const data = await window.electronAPI.plugins.uninstall(body.id);
        return jsonResponse(data);
      }
      if (pathname === "/api/plugins/ui-extensions") {
        const data = await window.electronAPI.plugins.getUIExtensions();
        return jsonResponse(data);
      }
      if (pathname === "/api/plugins/reload") {
        const data = await window.electronAPI.plugins.reload();
        return jsonResponse(data);
      }

      // 2.5 Skills & Cognitive Directives
      if (pathname === "/api/skills") {
        if (method === "GET") {
          const data = await window.electronAPI.skills.list();
          return jsonResponse(data);
        } else {
          const data = await window.electronAPI.skills.save(body);
          return jsonResponse(data);
        }
      }
      if (pathname === "/api/skills/toggle") {
        const data = await window.electronAPI.skills.toggle(body.id, body.enabled);
        return jsonResponse(data);
      }
      if (pathname === "/api/skills/delete") {
        const id = url.searchParams.get("id") || body.id;
        const data = await window.electronAPI.skills.delete(id);
        return jsonResponse(data);
      }
      if (pathname === "/api/skills/filter-mode") {
        const data = await window.electronAPI.skills.setFilterMode(body.mode);
        return jsonResponse(data);
      }
      if (pathname === "/api/skills/test-filter") {
        const prompt = url.searchParams.get("prompt") || body.prompt;
        const data = await window.electronAPI.skills.testFilter(prompt);
        return jsonResponse(data);
      }
      if (pathname === "/api/skills/import") {
        const data = await window.electronAPI.skills.import(body.content, body.filename);
        return jsonResponse(data);
      }
      if (pathname === "/api/skills/export") {
        const id = url.searchParams.get("id") || body.id;
        const data = await window.electronAPI.skills.export(id);
        return jsonResponse(data);
      }
      if (pathname === "/api/skills/reset") {
        const data = await window.electronAPI.skills.reset();
        return jsonResponse(data);
      }

      // 3. Connectors
      if (pathname === "/api/connectors/blender-script") {
        const data = await window.electronAPI.connectors.blenderScript();
        return new Response(data, { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      if (pathname === "/api/connectors") {
        if (method === "GET") {
          const data = await window.electronAPI.connectors.list();
          return jsonResponse(data);
        } else if (method === "DELETE" || pathname === "/api/connectors/delete") {
          const id = url.searchParams.get("id") || body.id;
          const data = await window.electronAPI.connectors.delete(id);
          return jsonResponse(data);
        } else {
          const data = await window.electronAPI.connectors.save(body);
          return jsonResponse(data);
        }
      }
      if (pathname === "/api/connectors/toggle") {
        const data = await window.electronAPI.connectors.toggle(body.id, body.enabled);
        return jsonResponse(data);
      }
      if (pathname === "/api/connectors/test") {
        const data = await window.electronAPI.connectors.test(body.id, body.config);
        return jsonResponse(data);
      }
      if (pathname === "/api/connectors/install-package") {
        const data = await window.electronAPI.connectors.installPackage(body);
        return jsonResponse(data);
      }
      if (pathname === "/api/connectors/export-package") {
        const id = url.searchParams.get("id") || body.id;
        const data = await window.electronAPI.connectors.exportPackage(id);
        return jsonResponse(data);
      }

      // 4. Security
      if (pathname === "/api/security/settings") {
        if (method === "GET") {
          const data = await window.electronAPI.security.getSettings();
          return jsonResponse(data);
        } else {
          const data = await window.electronAPI.security.updateSettings(body);
          return jsonResponse(data);
        }
      }
      if (pathname === "/api/security/approve") {
        const data = await window.electronAPI.security.resolveApproval(body.approvalId, body.decision);
        return jsonResponse(data);
      }
      if (pathname === "/api/security/reset") {
        const data = await window.electronAPI.security.reset();
        return jsonResponse(data);
      }
      if (pathname === "/api/security/clear-whitelist") {
        const data = await window.electronAPI.security.clearWhitelist(body.sessionId);
        return jsonResponse(data);
      }
      if (pathname === "/api/security/revoke-permission") {
        const data = await window.electronAPI.security.revokePermission(body);
        return jsonResponse(data);
      }

      // 5. Sessions
      if (pathname === "/api/sessions") {
        if (method === "GET") {
          const data = await window.electronAPI.sessions.list();
          return jsonResponse(data);
        } else if (method === "DELETE") {
          const sessionId = url.searchParams.get("id") || body.sessionId;
          const data = await window.electronAPI.sessions.delete(sessionId);
          return jsonResponse(data);
        } else if (method === "PATCH" || method === "PUT") {
          const sessionId = body.sessionId || url.searchParams.get("id");
          const data = await window.electronAPI.sessions.updateTitle(sessionId, body.title);
          return jsonResponse(data);
        } else {
          const data = await window.electronAPI.sessions.create(body.title);
          return jsonResponse(data);
        }
      }
      if (pathname === "/api/sessions/title") {
        const sessionId = body.sessionId || url.searchParams.get("id");
        const data = await window.electronAPI.sessions.updateTitle(sessionId, body.title);
        return jsonResponse(data);
      }
      if (pathname === "/api/sessions/switch") {
        const data = await window.electronAPI.sessions.switch(body.sessionId);
        return jsonResponse(data);
      }
      if (pathname === "/api/sessions/messages") {
        const sessionId = url.searchParams.get("id");
        const data = await window.electronAPI.sessions.getMessages(sessionId);
        return jsonResponse(data);
      }

      // 6. System Configuration
      if (pathname === "/api/system-config") {
        if (method === "GET") {
          const data = await window.electronAPI.systemConfig.read();
          return jsonResponse(data);
        } else {
          const data = await window.electronAPI.systemConfig.save(body);
          return jsonResponse(data);
        }
      }
      if (pathname === "/api/system-config/open-external") {
        const data = await window.electronAPI.systemConfig.openExternal(body);
        return jsonResponse(data);
      }

      // 7. Chat Streaming (Native SSE Pipe via ReadableStream in main world)
      if (pathname === "/api/chat" && method === "POST") {
        const encoder = new TextEncoder();
        // Sanitize payload to guaranteed pure JSON primitives
        const cleanPayload = JSON.parse(JSON.stringify({
          message: String(body.message || ""),
          sessionId: body.sessionId ? String(body.sessionId) : undefined,
          mode: body.mode,
          attachments: Array.isArray(body.attachments)
            ? body.attachments.map((a) => ({
                filename: String(a.filename || ""),
                content: typeof a.content === "string" ? a.content : "",
                isBase64: Boolean(a.isBase64),
              }))
            : [],
        }));
        const targetSessionId = cleanPayload.sessionId;

        let onStreamEvent = null;
        const stream = new ReadableStream({
          start(controller) {
            onStreamEvent = (e) => {
              const chunk = e.detail;
              if (!chunk) return;
              // Strict session isolation: ignore stream chunks belonging to a different simultaneous session
              if (targetSessionId && chunk.sessionId && chunk.sessionId !== targetSessionId) {
                return;
              }
              try {
                const sseText = `event: ${chunk.event}\ndata: ${JSON.stringify(chunk.payload)}\n\n`;
                controller.enqueue(encoder.encode(sseText));
              } catch {}
              if (chunk.event === "response" || chunk.event === "error") {
                window.removeEventListener("chat:stream-chunk", onStreamEvent);
                try { controller.close(); } catch {}
              }
            };

            window.addEventListener("chat:stream-chunk", onStreamEvent);

            window.electronAPI.chat.send(cleanPayload).then((result) => {
              if (result?.success === false) throw new Error(result.error || "Chat request failed");
            }).catch((err) => {
              try {
                const errText = `event: error\ndata: ${JSON.stringify({ error: err.message || "Failed to execute chat IPC" })}\n\n`;
                controller.enqueue(encoder.encode(errText));
              } catch {}
              if (onStreamEvent) window.removeEventListener("chat:stream-chunk", onStreamEvent);
              try { controller.close(); } catch {}
            });
          },
          cancel() {
            if (onStreamEvent) {
              window.removeEventListener("chat:stream-chunk", onStreamEvent);
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }

      // 8. Stop / Reset
      if (pathname === "/api/chat/stop") {
        const data = await window.electronAPI.chat.stop(body.sessionId);
        return jsonResponse(data);
      }
      if (pathname === "/api/reset" || pathname === "/api/sessions/clear-context") {
        const targetSid = body?.sessionId || url.searchParams.get("id") || currentSessionId;
        const data = await window.electronAPI.chat.reset(targetSid);
        return jsonResponse(data);
      }
      if (pathname === "/api/sessions/clear-cache" || pathname === "/api/chat/clear-cache") {
        let data;
        if (window.electronAPI && window.electronAPI.chat && window.electronAPI.chat.clearCache) {
          data = await window.electronAPI.chat.clearCache(body || { allSessions: true });
        } else if (window.electronAPI && window.electronAPI.chat && window.electronAPI.chat.reset) {
          data = await window.electronAPI.chat.reset(body?.sessionId);
        } else {
          data = { success: true, message: "Cleared session cache" };
        }
        return jsonResponse(data);
      }

      // 8b. Context Compressor
      if (pathname === "/api/compressor/compress" || pathname === "/api/chat/compress") {
        const targetSid = body?.sessionId || url.searchParams.get("id") || currentSessionId;
        const data = await window.electronAPI.compressor.compressSession(targetSid);
        return jsonResponse(data);
      }
      if (pathname === "/api/compressor/stats") {
        const data = await window.electronAPI.compressor.getStats();
        return jsonResponse(data);
      }
      if (pathname === "/api/compressor/context-tokens") {
        const targetSid = body?.sessionId || url.searchParams.get("id") || currentSessionId;
        const draftText = body?.draftText || "";
        const data = await window.electronAPI.compressor.getContextTokens(targetSid, draftText);
        return jsonResponse(data);
      }

      // 9. Artifacts & Media
      if (pathname === "/api/artifacts" || pathname === "/api/artifacts/files" || pathname === "/api/media") {
        const data = await window.electronAPI.artifacts.list();
        return jsonResponse(data);
      }
      if (pathname === "/api/artifacts/file" || pathname === "/api/media/file") {
        const name = url.searchParams.get("name") || body.name;
        if (method === "DELETE") {
          const data = await window.electronAPI.artifacts.delete(name);
          return jsonResponse(data);
        } else {
          const fileData = await window.electronAPI.artifacts.getFile(name);
          if (!fileData || !fileData.exists) {
            return new Response("File Not Found", { status: 404 });
          }
          if (fileData.text !== undefined) {
            return new Response(fileData.text, {
              status: 200,
              headers: { "Content-Type": fileData.mime || "text/plain" },
            });
          }
          const byteCharacters = atob(fileData.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          return new Response(byteArray, {
            status: 200,
            headers: { "Content-Type": fileData.mime || "application/octet-stream" },
          });
        }
      }
      if (pathname === "/api/media/upload" || pathname === "/api/artifacts/upload") {
        const data = await window.electronAPI.artifacts.upload(body);
        return jsonResponse(data);
      }
      if (pathname === "/api/artifacts/share" || pathname === "/api/artifacts/share-web") {
        const data = await window.electronAPI.artifacts.shareWeb(body.name || body.filename, body.isSandbox);
        return jsonResponse(data);
      }

      // 10. Knowledge Base & Sandbox & Tools
      if (pathname === "/api/kb/documents") {
        const data = await window.electronAPI.kb.documents();
        return jsonResponse(data);
      }
      if (pathname === "/api/kb/upload") {
        const data = await window.electronAPI.kb.upload(body);
        return jsonResponse(data);
      }
      if (pathname === "/api/sandbox/files") {
        const data = await window.electronAPI.sandbox.files();
        return jsonResponse(data);
      }
      if (pathname === "/api/sandbox/file") {
        const name = url.searchParams.get("name") || body.name;
        if (method === "DELETE") {
          const data = await window.electronAPI.sandbox.deleteFile(name);
          return jsonResponse(data);
        } else {
          const fileData = await window.electronAPI.sandbox.getFile(name);
          if (!fileData || !fileData.exists) {
            return new Response("File Not Found", { status: 404 });
          }
          if (fileData.text !== undefined) {
            return new Response(fileData.text, {
              status: 200,
              headers: { "Content-Type": fileData.mime || "text/plain" },
            });
          }
          const byteCharacters = atob(fileData.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          return new Response(byteArray, {
            status: 200,
            headers: { "Content-Type": fileData.mime || "application/octet-stream" },
          });
        }
      }
      if (pathname === "/api/sandbox/clean") {
        const data = await window.electronAPI.sandbox.clean();
        return jsonResponse(data);
      }
      if (pathname === "/api/tools/execute") {
        const data = await window.electronAPI.tools.execute(body);
        return jsonResponse(data);
      }
      if (pathname === "/api/plugins/export") {
        const id = url.searchParams.get("id") || body.id;
        const data = await window.electronAPI.plugins.export(id);
        return jsonResponse(data);
      }

      // 12. Text-to-Speech (TTS)
      if (pathname === "/api/tts/speak") {
        const data = await window.electronAPI.tts.speak(body);
        return jsonResponse(data);
      }
      if (pathname === "/api/tts/voices") {
        const data = await window.electronAPI.tts.getVoices();
        return jsonResponse(data);
      }
      if (pathname === "/api/tts/status") {
        const data = await window.electronAPI.tts.getStatus();
        return jsonResponse(data);
      }
      if (pathname === "/api/tts/unload") {
        const data = await window.electronAPI.tts.unload();
        return jsonResponse(data);
      }
      if (pathname === "/api/tts/model-status") {
        const data = await window.electronAPI.tts.getModelStatus();
        return jsonResponse(data);
      }
      if (pathname === "/api/tts/download-model") {
        const data = await window.electronAPI.tts.downloadModel();
        return jsonResponse(data);
      }
      if (pathname === "/api/tts/delete-model") {
        const data = await window.electronAPI.tts.deleteModel();
        return jsonResponse(data);
      }

      // 13. Speech-to-Text (STT - Moonshine)
      if (pathname === "/api/stt/transcribe") {
        const data = await window.electronAPI.stt.transcribe(body);
        return jsonResponse(data);
      }
      if (pathname === "/api/stt/status") {
        const data = await window.electronAPI.stt.getStatus();
        return jsonResponse(data);
      }
      if (pathname === "/api/stt/model-status") {
        const data = await window.electronAPI.stt.getModelStatus();
        return jsonResponse(data);
      }
      if (pathname === "/api/stt/download-model") {
        const data = await window.electronAPI.stt.downloadModel(body);
        return jsonResponse(data);
      }
      if (pathname === "/api/stt/delete-model") {
        const data = await window.electronAPI.stt.deleteModel();
        return jsonResponse(data);
      }
      if (pathname === "/api/stt/unload") {
        const data = await window.electronAPI.stt.unload();
        return jsonResponse(data);
      }

      // Safe Graceful Fallback for any unspecified /api/* endpoint
      return jsonResponse({ success: true, message: "OK", pathname }, 200);
    } catch (err) {
      console.error(`[NativeFetch] Error on ${pathname}:`, err);
      return jsonResponse({ error: err.message }, 500);
    }
  }

  window.fetch = async function(input, init) {
    const url = typeof input === "string" ? input : (input && input.url ? input.url : "");
    if (url.startsWith("/api/") || (url.includes("localhost") && url.includes("/api/"))) {
      return nativeIpcFetch(url, init);
    }
    return _origFetch.apply(window, arguments);
  };
}

// ─── DOM References ─────────────────────────────────────────────────

const appLayout = document.getElementById("app-layout");
const sidebar = document.getElementById("sidebar");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
const btnNewChat = document.getElementById("btn-new-chat");
const navItems = document.querySelectorAll(".nav-item");
const tabViews = document.querySelectorAll(".tab-view");
const currentViewTitle = document.getElementById("current-view-title");

// Chat & Hero
const chatContainer = document.querySelector(".chat-container");
const chatHero = document.getElementById("chat-hero");
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const btnDockAttach = document.getElementById("btn-dock-attach");
const chatFileInput = document.getElementById("chat-file-input");
const dockAttachments = document.getElementById("dock-attachments");
const chatDropzone = document.getElementById("chat-dropzone");
const footerEngineTag = document.getElementById("footer-engine-tag");
const dockContainer = document.getElementById("dock-container");

let pendingAttachments = [];

// Status Badges & Pill
const themeToggle = document.getElementById("theme-toggle");
const btnReset = document.getElementById("btn-reset");
const providerNameBadge = document.getElementById("provider-name");
const modelBadge = document.getElementById("badge-model");
const embeddingNameBadge = document.getElementById("embedding-name");
const sidebarProviderPill = document.getElementById("sidebar-provider-pill");

// Badge Counts
const kbCountBadge = document.getElementById("kb-count-badge");
const sandboxCountBadge = document.getElementById("sandbox-count-badge");
const sessionCountBadge = document.getElementById("session-count-badge");
const sessionsList = document.getElementById("sessions-list");

let currentSessionId = localStorage.getItem("ai_plate_active_session") || "default";
const chatModeSelect = document.getElementById("chat-mode");
const sessionModes = new Map();
const dirtySessionModes = new Set();
const modeDescriptions = {
  normal: "General help, search, and knowledge retrieval",
  plan: "Inspect files and create a plan without making changes",
  code: "Implement changes and run verification with security checks",
};
function syncChatModeSelector() {
  const mode = sessionModes.get(currentSessionId) || "normal";
  chatModeSelect.value = mode;
  chatModeSelect.title = modeDescriptions[mode] + ". Changes apply to the next message.";
}
async function saveChatMode(sessionId, mode) {
  sessionModes.set(sessionId, mode);
  dirtySessionModes.add(sessionId);
  syncChatModeSelector();
  try {
    const result = await window.electronAPI.sessions.setMode(sessionId, mode);
    if (!result.success) throw new Error(result.error || "Unable to save chat mode");
    return true;
  } catch (error) {
    showToast(error.message, "error");
    return false;
  }
}
chatModeSelect.addEventListener("change", () => saveChatMode(currentSessionId, chatModeSelect.value));
syncChatModeSelector();

// Knowledge Base Elements
const kbDropzone = document.getElementById("kb-dropzone");
const kbFileInput = document.getElementById("kb-file-input");
const btnBrowseKb = document.getElementById("btn-browse-kb");
const btnRefreshKb = document.getElementById("btn-refresh-kb");
const kbTableBody = document.getElementById("kb-table-body");
const kbTagline = document.getElementById("kb-tagline");

// Artifacts & Sandbox Elements
const artifactsGrid = document.getElementById("artifacts-grid");
const artifactsCountBadge = document.getElementById("artifacts-count-badge");
const btnRefreshArtifacts = document.getElementById("btn-refresh-artifacts");
const sandboxGrid = document.getElementById("sandbox-grid");
const btnRefreshSandbox = document.getElementById("btn-refresh-sandbox");
const btnCleanSandbox = document.getElementById("btn-clean-sandbox");

// Settings Elements
const selectProvider = document.getElementById("select-provider");
const selectModel = document.getElementById("select-model");
const customModelInput = document.getElementById("custom-model-input");
const selectEmbeddingProvider = document.getElementById("select-embedding-provider");
const selectEmbeddingModel = document.getElementById("select-embedding-model");
const customEmbeddingModelInput = document.getElementById("custom-embedding-model-input");
const selectThinkingLevel = document.getElementById("select-thinking-level");
const thinkingHintBox = document.getElementById("thinking-hint-box");
const btnSaveSettings = document.getElementById("btn-save-settings");
const settingsFeedback = document.getElementById("settings-feedback");

// Modal
const modalContainer = document.getElementById("modal-container");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");

let isProcessing = false;
let serverStatus = null;

const topbarWorkingDot = document.getElementById("topbar-working-dot");
const topbarWorkingIndicator = document.getElementById("topbar-working-indicator");
const navChatUnvisitedDot = document.getElementById("nav-chat-unvisited-dot");

const unvisitedDoneSessions = new Set();
const runningSessions = new Map(); // sessionId -> { abortController, blockElement, thinkingCard, messageBody, toolContainer, startTime }

function isSessionRunning(sessionId) {
  return runningSessions.has(sessionId);
}

function updateDockControlsForSession(sessionId = currentSessionId) {
  const isRunning = sessionId ? runningSessions.has(sessionId) : false;
  if (isRunning) {
    if (sendBtn) {
      sendBtn.classList.add("is-stopping");
      sendBtn.title = "Stop process safely (Esc)";
      sendBtn.setAttribute("aria-label", "Stop process safely (Esc)");
      sendBtn.disabled = false;
      const sendIcon = sendBtn.querySelector(".send-icon");
      const stopIcon = sendBtn.querySelector(".stop-icon");
      if (sendIcon) sendIcon.style.display = "none";
      if (stopIcon) stopIcon.style.display = "inline-flex";
    }
    if (stopBtn) stopBtn.style.display = "none";
    if (footerEngineTag) footerEngineTag.textContent = "⚡ Reasoning...";
  } else {
    if (sendBtn) {
      sendBtn.classList.remove("is-stopping");
      sendBtn.title = "Send message (Enter)";
      sendBtn.setAttribute("aria-label", "Send message (Enter)");
      sendBtn.disabled = false;
      const sendIcon = sendBtn.querySelector(".send-icon");
      const stopIcon = sendBtn.querySelector(".stop-icon");
      if (sendIcon) sendIcon.style.display = "inline-flex";
      if (stopIcon) stopIcon.style.display = "none";
    }
    if (stopBtn) stopBtn.style.display = "none";
    if (footerEngineTag) footerEngineTag.textContent = "⚡ Ready";
  }
}

// Ensure dock controls are in the idle/ready state on boot
updateDockControlsForSession();

function updateWorkspaceTabsUnvisitedDots() {
  const activeTab = document.querySelector(".tab-view.active")?.id;
  if (navChatUnvisitedDot) {
    if (activeTab !== "tab-chat" && (unvisitedDoneSessions.size > 0 || runningSessions.size > 0)) {
      navChatUnvisitedDot.classList.remove("hidden");
    } else {
      navChatUnvisitedDot.classList.add("hidden");
    }
  }
}

function updateGlobalRunningIndicators() {
  const anyRunning = runningSessions.size > 0;
  isProcessing = anyRunning;
  setAgentRunningState(anyRunning);
  updateWorkspaceTabsUnvisitedDots();
}

function setAgentRunningState(running) {
  if (topbarWorkingDot) {
    if (running) {
      topbarWorkingDot.classList.add("running");
      if (topbarWorkingIndicator) {
        topbarWorkingIndicator.title = "AI Agent: Processing & Reasoning...";
      }
    } else {
      topbarWorkingDot.classList.remove("running");
      if (topbarWorkingIndicator) {
        topbarWorkingIndicator.title = "AI Agent: Idle";
      }
    }
  }
}

// ─── Theme Management ───────────────────────────────────────────────

const savedTheme = localStorage.getItem("ai_plate_theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);

function syncTitleBarTheme() {
  if (!window.electronAPI?.setTitleBarTheme) return;
  requestAnimationFrame(() => {
    const topbar = document.querySelector(".topbar");
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    let bgHex = isLight ? "#f4f4f6" : "#101014";
    let symbolHex = isLight ? "#52525b" : "#a1a1aa";

    if (topbar) {
      const computed = window.getComputedStyle(topbar);
      const bg = computed.backgroundColor;
      const fg = computed.color;

      if (bg) {
        if (bg.startsWith("#")) {
          bgHex = bg;
        } else {
          const rgbMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (rgbMatch) {
            const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, "0");
            const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, "0");
            const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, "0");
            bgHex = `#${r}${g}${b}`;
          }
        }
      }

      if (fg) {
        if (fg.startsWith("#")) {
          symbolHex = fg;
        } else {
          const fgMatch = fg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (fgMatch) {
            const r = parseInt(fgMatch[1], 10).toString(16).padStart(2, "0");
            const g = parseInt(fgMatch[2], 10).toString(16).padStart(2, "0");
            const b = parseInt(fgMatch[3], 10).toString(16).padStart(2, "0");
            symbolHex = `#${r}${g}${b}`;
          }
        }
      }
    }

    window.electronAPI.setTitleBarTheme({
      color: bgHex,
      symbolColor: symbolHex,
    });
  });
}
window.syncTitleBarTheme = syncTitleBarTheme;

if (window.electronAPI?.isDesktop) {
  document.body.classList.add("desktop-app");
  syncTitleBarTheme();

  // Double-click topbar to toggle maximize / restore
  const topbar = document.querySelector(".topbar");
  if (topbar) {
    topbar.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input, select, a, .prompt-chip")) return;
      window.electronAPI?.maximize?.();
    });
  }

  // Handle tray shortcuts
  window.addEventListener("action:new-chat", () => {
    const btnNewChat = document.getElementById("btn-new-chat");
    if (btnNewChat) btnNewChat.click();
  });

  window.addEventListener("action:open-settings", () => {
    if (typeof openSettingsModal === "function") openSettingsModal();
  });
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";

    const applyTheme = () => {
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("ai_plate_theme", next);
      syncTitleBarTheme();
    };

    // If browser doesn't support View Transitions or user prefers reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || prefersReducedMotion) {
      applyTheme();
      showPluginToast(`Switched to ${next === "light" ? "☀️ Light Mode" : "🌙 Dark Mode"}`);
      return;
    }

    const rect = themeToggle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      applyTheme();
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 420,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });

    showPluginToast(`Switched to ${next === "light" ? "☀️ Light Mode" : "🌙 Dark Mode"}`);
  });
}

// ─── Kokoro Local Text-to-Speech (TTS) Manager ──────────────────────

let currentTTSAudio = null;
let currentTTSBtn = null;
let currentTTSAbortController = null;
let currentTTSRequestId = 0;
let isAutoReadEnabled = localStorage.getItem("ai_plate_auto_read") === "true";
let ttsVoice = localStorage.getItem("ai_plate_tts_voice") || "af_heart";
let ttsSpeed = parseFloat(localStorage.getItem("ai_plate_tts_speed") || "1.0");

// ─── Mathematical LaTeX to Human Spoken Speech Translation ─────────────

function extractBalancedGroupTTS(str, startIndex, openChar = "{", closeChar = "}") {
  if (startIndex >= str.length || str[startIndex] !== openChar) return null;
  let depth = 0;
  let i = startIndex;
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      i += 2;
      continue;
    }
    if (str[i] === openChar) depth++;
    else if (str[i] === closeChar) {
      depth--;
      if (depth === 0) return { content: str.slice(startIndex + 1, i), endIndex: i + 1 };
    }
    i++;
  }
  return null;
}

const TTS_GREEK = {
  "\\alpha": "alpha", "\\beta": "beta", "\\gamma": "gamma", "\\Gamma": "capital gamma",
  "\\delta": "delta", "\\Delta": "capital delta", "\\epsilon": "epsilon", "\\varepsilon": "epsilon",
  "\\zeta": "zeta", "\\eta": "eta", "\\theta": "theta", "\\Theta": "capital theta",
  "\\iota": "iota", "\\kappa": "kappa", "\\lambda": "lambda", "\\Lambda": "capital lambda",
  "\\mu": "mu", "\\nu": "nu", "\\xi": "xi", "\\Xi": "capital xi",
  "\\pi": "pi", "\\Pi": "capital pi", "\\rho": "rho", "\\sigma": "sigma",
  "\\Sigma": "capital sigma", "\\tau": "tau", "\\phi": "phi", "\\Phi": "capital phi",
  "\\chi": "chi", "\\psi": "psi", "\\omega": "omega", "\\Omega": "capital omega"
};

const TTS_MATH_SYMBOLS = {
  "\\pm": "plus or minus", "\\mp": "minus or plus", "\\times": "times", "\\cdot": "times",
  "\\div": "divided by", "\\ast": "times", "\\circ": "degrees", "\\degree": "degrees",
  "\\le": "is less than or equal to", "\\leq": "is less than or equal to",
  "\\ge": "is greater than or equal to", "\\geq": "is greater than or equal to",
  "\\ne": "is not equal to", "\\neq": "is not equal to",
  "\\approx": "is approximately equal to", "\\sim": "is similar to",
  "\\equiv": "is equivalent to", "\\propto": "is proportional to",
  "\\in": "in", "\\notin": "not in", "\\subset": "is a subset of",
  "\\cup": "union", "\\cap": "intersection", "\\emptyset": "the empty set",
  "\\forall": "for all", "\\exists": "there exists", "\\nabla": "del",
  "\\partial": "partial", "\\infty": "infinity", "\\to": "approaches",
  "\\rightarrow": "approaches", "\\implies": "implies", "\\iff": "if and only if",
  "\\perp": "is perpendicular to", "\\parallel": "is parallel to"
};

const TTS_MATH_FUNCS = {
  "\\sin": "sine", "\\cos": "cosine", "\\tan": "tangent",
  "\\sec": "secant", "\\csc": "cosecant", "\\cot": "cotangent",
  "\\arcsin": "arc sine", "\\arccos": "arc cosine", "\\arctan": "arc tangent",
  "\\sinh": "hyperbolic sine", "\\cosh": "hyperbolic cosine", "\\tanh": "hyperbolic tangent",
  "\\ln": "the natural log of", "\\log": "log", "\\exp": "exponential of",
  "\\det": "determinant of", "\\min": "minimum", "\\max": "maximum"
};

const TTS_NUMBER_SETS = {
  "\\mathbb{R}": "the real numbers", "\\mathbb{C}": "the complex numbers",
  "\\mathbb{Z}": "the integers", "\\mathbb{N}": "the natural numbers",
  "\\mathbb{Q}": "the rational numbers"
};

function latexToHumanSpeech(latex) {
  if (!latex || typeof latex !== "string") return "";
  let expr = latex.trim();
  expr = expr.replace(/^\$\$|\$\$$|^\\\[|\\\]$|^\\\(|\\\)$/g, "").trim();
  expr = expr.replace(/\\,/g, " ").replace(/\\;/g, " ").replace(/\\:/g, " ").replace(/\\quad/g, " ").replace(/\\qquad/g, " ");

  // Separate digits & juxtaposed math variables early (e.g. 2a -> 2 a, 4ac -> 4 a c, mc -> m c)
  expr = expr.replace(/(\d)([a-zA-Z])/g, "$1 $2");
  expr = expr.replace(/([a-zA-Z])(\d)/g, "$1 $2");
  const knownTokens = new Set([
    "is", "in", "to", "or", "of", "on", "at", "by", "as", "if", "an", "we", "he", "so",
    "and", "the", "for", "not", "sum", "row", "set", "log", "cos", "sin", "tan", "sec",
    "cot", "csc", "del", "bar", "hat", "dot", "root", "plus", "over", "from", "with",
    "cube", "into", "cases", "double", "prime", "sub", "net", "total", "max", "min",
    "one", "two", "half", "three", "four", "five", "six", "seven", "eight", "nine", "ten"
  ]);
  expr = expr.replace(/(^|[^\\])\b([a-zA-Z]{2,3})\b/g, (match, prefix, token) => {
    if (knownTokens.has(token.toLowerCase())) return match;
    return prefix + token.split("").join(" ");
  });

  // Number sets
  for (const [k, v] of Object.entries(TTS_NUMBER_SETS)) {
    expr = expr.split(k).join(` ${v} `);
  }

  // Text wrappers e.g. \text{...}, \mathbf{...}
  let txtRes = "";
  let idx = 0;
  while (idx < expr.length) {
    const m = expr.slice(idx).match(/^\\(text|mathrm|mathbf|mathcal)\s*\{/);
    if (m) {
      const bIdx = idx + m[0].length - 1;
      const grp = extractBalancedGroupTTS(expr, bIdx, "{", "}");
      if (grp) {
        let inner = grp.content.trim();
        if (m[1] === "mathbf") inner = `vector ${inner}`;
        txtRes += ` ${inner} `;
        idx = grp.endIndex;
        continue;
      }
    }
    txtRes += expr[idx];
    idx++;
  }
  expr = txtRes;

  // Limits e.g. \lim_{x \to 0}
  let limRes = "";
  idx = 0;
  while (idx < expr.length) {
    if (expr.slice(idx).startsWith("\\lim")) {
      let cur = idx + 4;
      while (cur < expr.length && /\s/.test(expr[cur])) cur++;
      if (expr[cur] === "_") {
        cur++;
        while (cur < expr.length && /\s/.test(expr[cur])) cur++;
        let cond = "";
        if (expr[cur] === "{") {
          const g = extractBalancedGroupTTS(expr, cur, "{", "}");
          if (g) { cond = g.content; cur = g.endIndex; }
        } else {
          const tm = expr.slice(cur).match(/^[^\s^_{}]+/);
          if (tm) { cond = tm[0]; cur += tm[0].length; }
        }
        if (cond) {
          limRes += ` the limit as ${latexToHumanSpeech(cond)} of, `;
          idx = cur;
          continue;
        }
      }
      limRes += " the limit of ";
      idx = cur;
      continue;
    }
    limRes += expr[idx];
    idx++;
  }
  expr = limRes;

  // Calculus: \sum, \prod, \int
  let calcRes = "";
  idx = 0;
  while (idx < expr.length) {
    const cm = expr.slice(idx).match(/^\\(sum|prod|int|iint|iiint|oint)(?![a-zA-Z])/);
    if (cm) {
      const op = cm[1];
      let cur = idx + cm[0].length;
      let lower = "";
      let upper = "";
      for (let p = 0; p < 2; p++) {
        while (cur < expr.length && /\s/.test(expr[cur])) cur++;
        if (expr[cur] === "_") {
          cur++;
          if (expr[cur] === "{") {
            const g = extractBalancedGroupTTS(expr, cur, "{", "}");
            if (g) { lower = g.content; cur = g.endIndex; }
          } else {
            const tm = expr.slice(cur).match(/^[a-zA-Z0-9\\]+/);
            if (tm) { lower = tm[0]; cur += tm[0].length; }
          }
        } else if (expr[cur] === "^") {
          cur++;
          if (expr[cur] === "{") {
            const g = extractBalancedGroupTTS(expr, cur, "{", "}");
            if (g) { upper = g.content; cur = g.endIndex; }
          } else {
            const tm = expr.slice(cur).match(/^[a-zA-Z0-9\\]+/);
            if (tm) { upper = tm[0]; cur += tm[0].length; }
          }
        }
      }
      const opName = op === "prod" ? "the product" : op === "int" ? "the integral" : "the sum";
      if (lower && upper) {
        calcRes += ` ${opName} from ${latexToHumanSpeech(lower)} to ${latexToHumanSpeech(upper)} of, `;
      } else if (lower) {
        calcRes += ` ${opName} over ${latexToHumanSpeech(lower)} of, `;
      } else {
        calcRes += ` ${opName} of, `;
      }
      idx = cur;
      continue;
    }
    calcRes += expr[idx];
    idx++;
  }
  expr = calcRes;

  // Fractions
  let fracRes = "";
  idx = 0;
  while (idx < expr.length) {
    const fm = expr.slice(idx).match(/^\\(frac|dfrac|tfrac|cfrac)(?![a-zA-Z])/);
    if (fm) {
      let cur = idx + fm[0].length;
      while (cur < expr.length && /\s/.test(expr[cur])) cur++;
      const numG = extractBalancedGroupTTS(expr, cur, "{", "}");
      if (numG) {
        cur = numG.endIndex;
        while (cur < expr.length && /\s/.test(expr[cur])) cur++;
        const denG = extractBalancedGroupTTS(expr, cur, "{", "}");
        if (denG) {
          const numRaw = numG.content.trim();
          const denRaw = denG.content.trim();
          if (numRaw === "1" && denRaw === "2") fracRes += " one half ";
          else if (numRaw === "1" && denRaw === "3") fracRes += " one third ";
          else if (numRaw === "2" && denRaw === "3") fracRes += " two thirds ";
          else if (numRaw === "1" && denRaw === "4") fracRes += " one fourth ";
          else if (numRaw === "3" && denRaw === "4") fracRes += " three fourths ";
          else if (numRaw === "dy" && denRaw === "dx") fracRes += " d y by d x ";
          else if (numRaw === "d" && denRaw === "dx") fracRes += " d by d x ";
          else {
            fracRes += ` ${latexToHumanSpeech(numRaw)}, over ${latexToHumanSpeech(denRaw)} `;
          }
          idx = denG.endIndex;
          continue;
        }
      }
    }
    fracRes += expr[idx];
    idx++;
  }
  expr = fracRes;

  // Roots
  let rootRes = "";
  idx = 0;
  while (idx < expr.length) {
    if (expr.slice(idx).startsWith("\\sqrt")) {
      let cur = idx + 5;
      while (cur < expr.length && /\s/.test(expr[cur])) cur++;
      let degree = "";
      if (expr[cur] === "[") {
        const og = extractBalancedGroupTTS(expr, cur, "[", "]");
        if (og) { degree = og.content.trim(); cur = og.endIndex; }
      }
      while (cur < expr.length && /\s/.test(expr[cur])) cur++;
      const bg = extractBalancedGroupTTS(expr, cur, "{", "}");
      if (bg) {
        const bSpoken = latexToHumanSpeech(bg.content.trim());
        if (!degree || degree === "2") rootRes += ` the square root of ${bSpoken} `;
        else if (degree === "3") rootRes += ` the cube root of ${bSpoken} `;
        else rootRes += ` the ${latexToHumanSpeech(degree)}-th root of ${bSpoken} `;
        idx = bg.endIndex;
        continue;
      }
    }
    rootRes += expr[idx];
    idx++;
  }
  expr = rootRes;

  // Exponents
  let expRes = "";
  idx = 0;
  while (idx < expr.length) {
    if (expr[idx] === "^") {
      let cur = idx + 1;
      while (cur < expr.length && /\s/.test(expr[cur])) cur++;
      let expContent = "";
      if (expr[cur] === "{") {
        const g = extractBalancedGroupTTS(expr, cur, "{", "}");
        if (g) { expContent = g.content.trim(); cur = g.endIndex; }
      } else {
        const sm = expr.slice(cur).match(/^([a-zA-Z0-9\\]+)/);
        if (sm) { expContent = sm[1]; cur += sm[1].length; }
      }
      if (expContent) {
        if (expContent === "2") expRes += " squared ";
        else if (expContent === "3") expRes += " cubed ";
        else if (expContent === "\\circ" || expContent === "\\degree") expRes += " degrees ";
        else if (expContent === "-1") expRes += " inverse ";
        else expRes += ` to the power of ${latexToHumanSpeech(expContent)} `;
        idx = cur;
        continue;
      }
    }
    expRes += expr[idx];
    idx++;
  }
  expr = expRes;

  // Subscripts
  let subRes = "";
  idx = 0;
  while (idx < expr.length) {
    if (expr[idx] === "_") {
      let cur = idx + 1;
      while (cur < expr.length && /\s/.test(expr[cur])) cur++;
      let subContent = "";
      if (expr[cur] === "{") {
        const g = extractBalancedGroupTTS(expr, cur, "{", "}");
        if (g) { subContent = g.content.trim(); cur = g.endIndex; }
      } else {
        const sm = expr.slice(cur).match(/^([a-zA-Z0-9\\]+)/);
        if (sm) { subContent = sm[1]; cur += sm[1].length; }
      }
      if (subContent) {
        if (subContent === "net") subRes += " net ";
        else if (subContent === "total") subRes += " total ";
        else if (subContent === "max") subRes += " maximum ";
        else if (subContent === "min") subRes += " minimum ";
        else subRes += ` sub ${latexToHumanSpeech(subContent)} `;
        idx = cur;
        continue;
      }
    }
    subRes += expr[idx];
    idx++;
  }
  expr = subRes;

  // Functions, Greek, Symbols
  for (const [k, v] of Object.entries(TTS_MATH_FUNCS)) {
    expr = expr.replace(new RegExp(k.replace(/\\/g, "\\\\") + "(?![a-zA-Z])", "g"), ` ${v} `);
  }
  for (const [k, v] of Object.entries(TTS_GREEK)) {
    expr = expr.replace(new RegExp(k.replace(/\\/g, "\\\\") + "(?![a-zA-Z])", "g"), ` ${v} `);
  }
  for (const [k, v] of Object.entries(TTS_MATH_SYMBOLS)) {
    expr = expr.replace(new RegExp(k.replace(/\\/g, "\\\\") + "(?![a-zA-Z])", "g"), ` ${v} `);
  }

  // Operators, relations, differentials
  expr = expr.replace(/\\left\(/g, " ( ").replace(/\\right\)/g, " ) ");
  expr = expr.replace(/\\left\[/g, " [ ").replace(/\\right\]/g, " ] ");
  expr = expr.replace(/\\left\\\{|\\\{/g, " the set of ").replace(/\\right\\\}|\\\}/g, " ");
  expr = expr.replace(/\\(cdots|ldots|dots)/g, " and so on ");
  expr = expr.replace(/([a-zA-Z0-9\)]+)\s*!/g, "$1 factorial");
  expr = expr.replace(/([^\s])\s*=\s*/g, "$1 equals, ");
  expr = expr.replace(/\s*=\s*/g, " equals, ");
  expr = expr.replace(/([^\s])\s*\+\s*/g, "$1 plus ");
  expr = expr.replace(/\s*\+\s*/g, " plus ");
  expr = expr.replace(/([^\s])\s*-\s*/g, "$1 minus ");
  expr = expr.replace(/\s*-\s*/g, " minus ");
  expr = expr.replace(/([^\s])\s*\*\s*/g, "$1 times ");
  expr = expr.replace(/\s*\*\s*/g, " times ");
  expr = expr.replace(/([^\s])\s*<\s*/g, "$1 is less than ");
  expr = expr.replace(/\s*<\s*/g, " is less than ");
  expr = expr.replace(/([^\s])\s*>\s*/g, "$1 is greater than ");
  expr = expr.replace(/\s*>\s*/g, " is greater than ");
  expr = expr.replace(/\s+d\s*([xyztuvw])\b/g, " with respect to $1");

  expr = expr.replace(/\\[a-zA-Z]+/g, " ").replace(/[{}]/g, " ");
  expr = expr.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  return expr;
}

function convertLatexForTTS(text) {
  if (!text || typeof text !== "string") return "";
  let res = text;
  // Display math $$...$$ and \[...\]
  res = res.replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => " " + latexToHumanSpeech(math) + " ");
  res = res.replace(/\\\[([\s\S]*?)\\\]/g, (_m, math) => " " + latexToHumanSpeech(math) + " ");
  res = res.replace(/\\\(([\s\S]*?)\\\)/g, (_m, math) => " " + latexToHumanSpeech(math) + " ");

  // Inline math $...$ (preserving currency like $50 or $19.99)
  res = res.replace(/\$([^\$\n]+?)\$/g, (m, math) => {
    const trimmed = math.trim();
    if (/^\d+(\.\d{1,2})?$/.test(trimmed)) return m;
    if (
      trimmed.includes("\\") || trimmed.includes("^") || trimmed.includes("_") ||
      trimmed.includes("=") || trimmed.includes("+") || trimmed.includes("-") ||
      /[a-zA-Z]/.test(trimmed)
    ) {
      return " " + latexToHumanSpeech(trimmed) + " ";
    }
    return m;
  });

  // Naked LaTeX commands
  if (res.includes("\\")) {
    res = res.replace(
      /\\(frac|dfrac|tfrac|sqrt|sum|prod|int|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|approx|le|ge|ne|times|pm|cdot)\b[^{}\s]*(\{[^{}]*\})?/g,
      (cmd) => " " + latexToHumanSpeech(cmd) + " "
    );
  }
  return res.replace(/[ \t]{2,}/g, " ");
}

function sanitizeForTTS(text) {
  if (!text || typeof text !== "string") return "";
  let clean = text;
  clean = clean.replace(/```[\s\S]*?```/g, " Code snippet provided in chat. ");
  clean = clean.replace(/`([^`]+)`/g, "$1");

  // Translate mathematical LaTeX expressions ($...$, $$...$$, fractions, equations) to human spoken words
  clean = convertLatexForTTS(clean);

  clean = clean.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  clean = clean.replace(/^\|.*\|$/gm, "");
  clean = clean.replace(/^#{1,6}\s+/gm, "");
  clean = clean.replace(/^>\s+/gm, "");
  clean = clean.replace(/^\s*[-*+]\s+/gm, "");
  clean = clean.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  clean = clean.replace(/<[^>]+>/g, "");
  clean = clean.replace(/\r\n/g, "\n").replace(/\n{2,}/g, ". ").replace(/\n/g, " ").replace(/\s{2,}/g, " ");
  return clean.trim();
}

function getTTSBtnElements(btn) {
  if (!btn) return { label: null, icon: null };
  const label =
    btn.querySelector(".tts-btn-label") ||
    btn.querySelector("#btn-plugin-test-voice-label") ||
    btn.querySelector("span:last-child");
  const icon =
    btn.querySelector(".tts-icon") ||
    btn.querySelector("span:first-child");
  return { label, icon };
}

function resetTTSButtonState(btn) {
  if (!btn) return;
  btn.classList.remove("speaking", "loading");
  const { label, icon } = getTTSBtnElements(btn);
  if (btn.id === "btn-plugin-test-voice") {
    if (label) label.textContent = "Test Voice";
    if (icon) icon.textContent = "🔊";
  } else {
    if (label) label.textContent = "Read Aloud";
    if (icon) icon.textContent = "🔊";
  }
  const waves = btn.querySelector(".tts-wave-bars");
  if (waves) waves.remove();
}

function stopTTSAudio() {
  // 1. Invalidate any in-flight synthesis request
  currentTTSRequestId++;
  if (currentTTSAbortController) {
    try {
      currentTTSAbortController.abort();
    } catch {}
    currentTTSAbortController = null;
  }

  // 2. Immediately stop, detach, and unload active audio
  if (currentTTSAudio) {
    try {
      currentTTSAudio.pause();
      currentTTSAudio.onended = null;
      currentTTSAudio.onerror = null;
      currentTTSAudio.currentTime = 0;
      currentTTSAudio.src = "";
    } catch {}
    currentTTSAudio = null;
  }

  // 3. Reset primary active button
  if (currentTTSBtn) {
    resetTTSButtonState(currentTTSBtn);
    currentTTSBtn = null;
  }

  // 4. Ensure any other button in the DOM that was marked speaking/loading is reset
  document
    .querySelectorAll(".message-tts-btn.speaking, .message-tts-btn.loading, #btn-plugin-test-voice.speaking, #btn-plugin-test-voice.loading")
    .forEach((btn) => resetTTSButtonState(btn));
}

function splitTextIntoTTSChunks(text, maxChunkChars = 160) {
  if (!text || text.length <= maxChunkChars) {
    return [text];
  }
  const regex = /[^.!?\n]+[.!?\n]+|\S+$/g;
  const sentences = text.match(regex) || [text];
  const chunks = [];
  let current = "";

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((current + " " + trimmed).trim().length <= maxChunkChars) {
      current = (current + " " + trimmed).trim();
    } else {
      if (current) chunks.push(current);
      current = trimmed;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

async function fetchTTSChunk(textChunk, signal) {
  const res = await fetch("/api/tts/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      text: textChunk,
      voice: ttsVoice,
      speed: ttsSpeed,
    }),
  });
  const data = await res.json();
  if (!data.success || !data.audioBase64) {
    throw new Error(data.error || "TTS synthesis failed");
  }
  return data.audioBase64;
}

async function playTTS(rawText, btnElement) {
  if (!isTTSPluginEnabled()) {
    showPluginToast("Kokoro TTS plugin is disabled. Enable it in Plugins & Tools to use voice.");
    return;
  }

  // If clicking a button that is already actively speaking or in the middle of generating audio, treat this click as STOP
  if (
    btnElement &&
    (btnElement === currentTTSBtn ||
      btnElement.classList.contains("speaking") ||
      btnElement.classList.contains("loading"))
  ) {
    stopTTSAudio();
    return;
  }

  // Strictly stop and tear down any existing audio / request before starting a new one
  stopTTSAudio();

  const text = sanitizeForTTS(rawText);
  if (!text) {
    showPluginToast("No readable text to speak");
    return;
  }

  // Assign a unique request ID and abort controller for this specific invocation
  const thisRequestId = currentTTSRequestId;
  const abortController = new AbortController();
  currentTTSAbortController = abortController;

  if (btnElement) {
    currentTTSBtn = btnElement;
    btnElement.classList.add("loading");
    const { label, icon } = getTTSBtnElements(btnElement);
    if (label) label.textContent = "Generating...";
    if (icon) icon.textContent = "⏳";
  }

  try {
    const chunks = splitTextIntoTTSChunks(text, 160);

    const playAudioBuffer = (base64) => {
      return new Promise((resolve, reject) => {
        if (thisRequestId !== currentTTSRequestId) return resolve();
        const audio = new Audio("data:audio/wav;base64," + base64);
        currentTTSAudio = audio;

        audio.onended = () => {
          if (thisRequestId === currentTTSRequestId) resolve();
        };
        audio.onerror = () => {
          if (thisRequestId === currentTTSRequestId) {
            reject(new Error("Audio playback error"));
          }
        };

        if (thisRequestId !== currentTTSRequestId) {
          try { audio.src = ""; } catch {}
          return resolve();
        }

        audio.play().catch(reject);
      });
    };

    // Pre-request chunk 1 in background while chunk 0 is being fetched
    let nextChunkPromise = null;
    if (chunks.length > 1) {
      nextChunkPromise = fetchTTSChunk(chunks[1], abortController.signal).catch(() => null);
    }

    const firstBase64 = await fetchTTSChunk(chunks[0], abortController.signal);
    if (thisRequestId !== currentTTSRequestId) return;

    // Update button to speaking state
    if (btnElement && currentTTSBtn === btnElement) {
      btnElement.classList.remove("loading");
      btnElement.classList.add("speaking");
      const { label, icon } = getTTSBtnElements(btnElement);
      if (label) label.textContent = "Stop";
      if (icon) icon.textContent = "⏹️";
      if (!btnElement.querySelector(".tts-wave-bars")) {
        const wave = document.createElement("span");
        wave.className = "tts-wave-bars";
        wave.innerHTML = "<span></span><span></span><span></span>";
        btnElement.appendChild(wave);
      }
    }

    // Play chunk 0 immediately (Instant Time-To-First-Audio < 1 second!)
    let currentPlaybackPromise = playAudioBuffer(firstBase64);

    for (let i = 1; i < chunks.length; i++) {
      if (thisRequestId !== currentTTSRequestId) return;

      // Start fetching next chunk if not already pre-fetching
      if (!nextChunkPromise) {
        nextChunkPromise = fetchTTSChunk(chunks[i], abortController.signal).catch(() => null);
      }

      // Pre-schedule chunk i+1 if more remain
      let followingPromise = null;
      if (i + 1 < chunks.length) {
        followingPromise = fetchTTSChunk(chunks[i + 1], abortController.signal).catch(() => null);
      }

      // Await playback of the currently playing chunk
      await currentPlaybackPromise;
      if (thisRequestId !== currentTTSRequestId) return;

      // Get the audio data for chunk i (already completed in background while chunk i-1 was playing)
      const chunkBase64 = await nextChunkPromise;
      if (!chunkBase64 || thisRequestId !== currentTTSRequestId) return;

      // Play chunk i immediately
      currentPlaybackPromise = playAudioBuffer(chunkBase64);
      nextChunkPromise = followingPromise;
    }

    // Wait for the final chunk to finish playing
    await currentPlaybackPromise;

    if (thisRequestId === currentTTSRequestId) {
      stopTTSAudio();
    }
  } catch (err) {
    if (err.name === "AbortError" || thisRequestId !== currentTTSRequestId) {
      return;
    }
    stopTTSAudio();
    console.error("[TTS Error]", err);
    showPluginToast(`Speech error: ${err.message}`);
  }
}

function isTTSPluginEnabled() {
  if (typeof registeredPlugins === "undefined" || !Array.isArray(registeredPlugins) || registeredPlugins.length === 0) {
    try {
      const cached = JSON.parse(localStorage.getItem("ai_plate_plugins_cache") || "[]");
      const p = cached.find((x) => x.id === "tts");
      return p ? Boolean(p.enabled) : true;
    } catch {
      return true;
    }
  }
  const p = registeredPlugins.find((x) => x.id === "tts");
  return p ? Boolean(p.enabled) : true;
}

function syncTTSUIState(forceEnabled) {
  let isTtsActive = forceEnabled !== undefined ? forceEnabled : isTTSPluginEnabled();

  const btnAutoRead = document.getElementById("btn-auto-read");
  if (btnAutoRead) {
    btnAutoRead.style.display = isTtsActive ? "inline-flex" : "none";
  }

  const ttsBtns = document.querySelectorAll(".message-tts-btn");
  ttsBtns.forEach((btn) => {
    btn.style.display = isTtsActive ? "inline-flex" : "none";
  });

  if (!isTtsActive) {
    stopTTSAudio();
  }
}

function updateAutoReadUI() {
  const btn = document.getElementById("btn-auto-read");
  if (btn) {
    btn.classList.toggle("active", isAutoReadEnabled);
    btn.setAttribute("aria-pressed", String(isAutoReadEnabled));
    btn.title = `Auto-Read Responses (Kokoro TTS): ${isAutoReadEnabled ? "ON" : "OFF"}`;
    const icon = btn.querySelector(".auto-read-icon");
    if (icon) icon.textContent = isAutoReadEnabled ? "🔊" : "🔇";
  }
  const checkbox = document.getElementById("plugin-tts-autoread");
  if (checkbox) {
    checkbox.checked = isAutoReadEnabled;
  }
}

function toggleAutoRead() {
  isAutoReadEnabled = !isAutoReadEnabled;
  localStorage.setItem("ai_plate_auto_read", String(isAutoReadEnabled));
  updateAutoReadUI();
  showPluginToast(isAutoReadEnabled ? "🔊 Auto-Read Enabled" : "🔇 Auto-Read Disabled");
}

const btnAutoRead = document.getElementById("btn-auto-read");
if (btnAutoRead) {
  btnAutoRead.addEventListener("click", toggleAutoRead);
  updateAutoReadUI();
}

function buildTTSPluginControlsHtml(plugin) {
  return `
    <div class="plugin-custom-config-section tts-plugin-config" style="margin-top: 14px; padding: 14px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-card);">
      <div style="font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <span>⚙️</span>
        <span>Voice &amp; Speech Configuration</span>
      </div>

      <!-- 1. Model Download & Status Card -->
      <div class="tts-model-manager-box" id="tts-model-box" style="margin-bottom: 14px; padding: 12px; border-radius: var(--radius-sm); background: var(--bg-hover); border: 1px solid var(--border-card);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🧠</span>
            <div>
              <div style="font-size: 12.5px; font-weight: 600;">Kokoro Neural ONNX Model</div>
              <div id="tts-model-status-text" style="font-size: 11.5px; color: var(--text-muted);">Checking model status...</div>
            </div>
          </div>
          <div id="tts-model-actions" style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="btn btn-primary btn-xs" id="btn-download-tts-model" style="font-size: 11px; padding: 5px 12px; font-weight: 600;">
              📥 Download Model (~351MB)
            </button>
            <button type="button" class="btn btn-secondary btn-xs" id="btn-delete-tts-model" style="display: none; font-size: 11px; padding: 5px 10px; color: var(--danger);">
              🗑️ Delete Model
            </button>
          </div>
        </div>

        <div class="tts-download-progress-wrap" id="tts-download-progress-wrap" style="display: none;">
          <div class="tts-download-progress-header">
            <span class="tts-download-file-name" id="tts-download-file-name">
              <span class="tts-download-icon">📥</span>
              <span id="tts-download-step-label">Connecting to download CDN...</span>
            </span>
            <span class="tts-download-meta" id="tts-download-meta">0%</span>
          </div>
          <div class="tts-download-track">
            <div class="tts-download-bar" id="tts-download-progress-bar" style="width: 0%;"></div>
          </div>
          <div class="tts-download-subinfo">
            <span id="tts-download-detail-text">Initializing download...</span>
            <span id="tts-download-speed-text">0.0 MB/s</span>
          </div>
        </div>
      </div>

      <!-- 2. Voice & Speed Controls -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 11.5px; font-weight: 600; color: var(--text-muted); margin-bottom: 5px;">VOICE PERSONA</label>
          <select id="plugin-tts-voice-select" class="form-select" style="width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-card); color: var(--text-main); font-size: 12px;">
            <option value="af_heart" selected>Heart (American Female) — Natural &amp; Warm</option>
            <option value="af_bella">Bella (American Female) — Clear &amp; Expressive</option>
            <option value="af_nicole">Nicole (American Female) — Soft &amp; Calming</option>
            <option value="af_sky">Sky (American Female) — Bright &amp; Energetic</option>
            <option value="am_adam">Adam (American Male) — Deep &amp; Grounded</option>
            <option value="am_michael">Michael (American Male) — Professional &amp; Authoritative</option>
            <option value="bf_emma">Emma (British Female) — Crisp &amp; Articulate</option>
            <option value="bm_george">George (British Male) — Classic British Narration</option>
          </select>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <label style="font-size: 11.5px; font-weight: 600; color: var(--text-muted);">SPEAKING SPEED</label>
            <span id="plugin-tts-speed-val" style="font-size: 11.5px; font-weight: 600; color: var(--accent-primary);">${ttsSpeed.toFixed(1)}x</span>
          </div>
          <input type="range" id="plugin-tts-speed" min="0.7" max="1.6" step="0.05" value="${ttsSpeed}" style="width: 100%; cursor: pointer; accent-color: var(--accent-primary);" />
        </div>
      </div>

      <!-- 3. Auto-Read Responses & Test Voice -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding-top: 8px; border-top: 1px solid var(--border-card);">
        <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12.5px; font-weight: 500;">
          <input type="checkbox" id="plugin-tts-autoread" ${isAutoReadEnabled ? "checked" : ""} style="width: 16px; height: 16px; accent-color: var(--accent-primary); cursor: pointer;" />
          <span>Auto-Read Responses</span>
        </label>

        <button type="button" class="btn btn-secondary btn-xs" id="btn-plugin-test-voice" style="display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; padding: 5px 10px;">
          <span>🔊</span>
          <span id="btn-plugin-test-voice-label">Test Voice</span>
        </button>
      </div>
    </div>
  `;
}

function updateTTSDownloadProgressUI(prog) {
  if (!prog) return;
  window.__ttsLastDownloadProgress = prog;

  const wrap = document.getElementById("tts-download-progress-wrap");
  const bar = document.getElementById("tts-download-progress-bar");
  const stepLabel = document.getElementById("tts-download-step-label");
  const meta = document.getElementById("tts-download-meta");
  const detailText = document.getElementById("tts-download-detail-text");
  const speedText = document.getElementById("tts-download-speed-text");
  const btnDownload = document.getElementById("btn-download-tts-model");
  const statusText = document.getElementById("tts-model-status-text");

  if (wrap) wrap.style.display = "block";
  if (btnDownload) {
    btnDownload.disabled = true;
    btnDownload.textContent = "⏳ Downloading...";
  }

  const pct = prog.overallPercent !== undefined ? prog.overallPercent : (prog.percent || 0);
  const boundedPct = Math.min(100, Math.max(0, Math.round(pct)));

  if (bar) {
    bar.style.width = `${boundedPct}%`;
  }

  if (stepLabel) {
    const stepStr = prog.step && prog.totalSteps ? `[${prog.step}/${prog.totalSteps}] ` : "";
    stepLabel.textContent = `${stepStr}${prog.file || "Kokoro Model"}`;
  }

  if (meta) {
    meta.textContent = `${boundedPct}%`;
  }

  if (detailText) {
    const curMB = prog.overallDownloadedBytes !== undefined
      ? (prog.overallDownloadedBytes / (1024 * 1024)).toFixed(1)
      : (prog.downloadedBytes ? (prog.downloadedBytes / (1024 * 1024)).toFixed(1) : "0.0");
    const totMB = prog.overallTotalBytes !== undefined
      ? (prog.overallTotalBytes / (1024 * 1024)).toFixed(1)
      : (prog.totalBytes ? (prog.totalBytes / (1024 * 1024)).toFixed(1) : "353.4");
    detailText.textContent = `${curMB} MB / ${totMB} MB downloaded`;
  }

  if (speedText) {
    speedText.textContent = prog.speedMBs ? `${prog.speedMBs} MB/s` : (boundedPct === 100 ? "Complete" : "Connecting...");
  }

  if (statusText && boundedPct < 100) {
    statusText.textContent = `⏳ Downloading Kokoro model (${boundedPct}%)...`;
  }
}

// Single persistent top-level listener for download progress from preload / worker
window.addEventListener("tts:download-progress", (e) => {
  if (e.detail) {
    updateTTSDownloadProgressUI(e.detail);
  }
});

async function initTTSPluginControls(cardElement) {
  if (!cardElement) return;

  const voiceSelect = cardElement.querySelector("#plugin-tts-voice-select");
  const speedSlider = cardElement.querySelector("#plugin-tts-speed");
  const speedVal = cardElement.querySelector("#plugin-tts-speed-val");
  const autoReadCheck = cardElement.querySelector("#plugin-tts-autoread");
  const btnTestVoice = cardElement.querySelector("#btn-plugin-test-voice");

  const statusText = cardElement.querySelector("#tts-model-status-text");
  const btnDownload = cardElement.querySelector("#btn-download-tts-model");
  const btnDelete = cardElement.querySelector("#btn-delete-tts-model");

  // 1. Synchronize voice list
  try {
    const res = await fetch("/api/tts/voices");
    const data = await res.json();
    if (data.success && Array.isArray(data.voices) && voiceSelect) {
      voiceSelect.innerHTML = "";
      data.voices.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = v.name;
        if (v.id === ttsVoice) opt.selected = true;
        voiceSelect.appendChild(opt);
      });
      if (!voiceSelect.value && voiceSelect.options.length > 0) {
        voiceSelect.options[0].selected = true;
        ttsVoice = voiceSelect.value;
      }
    }
  } catch {}

  // 2. Bind voice selection
  if (voiceSelect) {
    voiceSelect.addEventListener("change", (e) => {
      ttsVoice = e.target.value;
      localStorage.setItem("ai_plate_tts_voice", ttsVoice);
      showPluginToast(`TTS Voice set to: ${ttsVoice}`);
    });
  }

  // 3. Bind speed slider
  if (speedSlider) {
    speedSlider.addEventListener("input", (e) => {
      ttsSpeed = parseFloat(e.target.value);
      if (speedVal) speedVal.textContent = ttsSpeed.toFixed(1) + "x";
      localStorage.setItem("ai_plate_tts_speed", String(ttsSpeed));
    });
  }

  // 4. Bind auto-read switch
  if (autoReadCheck) {
    autoReadCheck.checked = isAutoReadEnabled;
    autoReadCheck.addEventListener("change", (e) => {
      isAutoReadEnabled = e.target.checked;
      localStorage.setItem("ai_plate_auto_read", String(isAutoReadEnabled));
      updateAutoReadUI();
      showPluginToast(isAutoReadEnabled ? "🔊 Auto-Read Enabled" : "🔇 Auto-Read Disabled");
    });
  }

  // 5. Bind test voice button
  if (btnTestVoice) {
    btnTestVoice.addEventListener("click", () => {
      playTTS("Hello! This is Kokoro Text-to-Speech running locally in AI Plate.", btnTestVoice);
    });
  }

  // 6. Check and render Model Status
  async function refreshModelStatus() {
    try {
      const res = await fetch("/api/tts/model-status");
      const data = await res.json();
      if (!data) return;

      if (data.isDownloading) {
        if (statusText) statusText.textContent = "⏳ Downloading Kokoro neural model...";
        if (btnDownload) {
          btnDownload.disabled = true;
          btnDownload.textContent = "⏳ Downloading...";
        }
        if (btnDelete) btnDelete.style.display = "none";
        const latestProg = data.currentProgress || window.__ttsLastDownloadProgress || {
          percent: 0,
          overallPercent: 0,
          file: "voices-v1.0.bin",
          step: 1,
          totalSteps: 2,
        };
        updateTTSDownloadProgressUI(latestProg);
        return;
      }

      if (data.downloaded) {
        const sizeMb = data.totalSizeBytes ? Math.round(data.totalSizeBytes / (1024 * 1024)) : 351;
        if (statusText) statusText.textContent = `✅ Ready (${sizeMb} MB on disk)`;
        if (btnDownload) {
          btnDownload.textContent = "✅ Downloaded";
          btnDownload.disabled = true;
          btnDownload.classList.remove("btn-primary");
          btnDownload.classList.add("btn-secondary");
        }
        if (btnDelete) btnDelete.style.display = "inline-flex";
        const wrap = document.getElementById("tts-download-progress-wrap");
        if (wrap) wrap.style.display = "none";
        window.__ttsLastDownloadProgress = null;
      } else {
        if (statusText) statusText.textContent = "⚠️ Model not downloaded (~351 MB required)";
        if (btnDownload) {
          btnDownload.textContent = "📥 Download Model (~351MB)";
          btnDownload.disabled = false;
          btnDownload.classList.remove("btn-secondary");
          btnDownload.classList.add("btn-primary");
        }
        if (btnDelete) btnDelete.style.display = "none";
        const wrap = document.getElementById("tts-download-progress-wrap");
        if (wrap) wrap.style.display = "none";
      }
    } catch (err) {
      if (statusText) statusText.textContent = "⚠️ Could not check model status";
    }
  }

  await refreshModelStatus();

  // 7. Bind Download Button
  if (btnDownload) {
    btnDownload.addEventListener("click", async () => {
      btnDownload.disabled = true;
      btnDownload.textContent = "⏳ Downloading...";
      updateTTSDownloadProgressUI({
        file: "voices-v1.0.bin",
        step: 1,
        totalSteps: 2,
        percent: 0,
        overallPercent: 0,
        downloadedBytes: 0,
        totalBytes: 28214398,
        overallDownloadedBytes: 0,
        overallTotalBytes: 369414398,
        speedMBs: 0,
        statusText: "Connecting to model CDN...",
      });
      showPluginToast("Starting Kokoro model download (~351MB)...");

      try {
        const res = await fetch("/api/tts/download-model", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          showPluginToast("✅ Kokoro TTS Model downloaded and ready!");
          await refreshModelStatus();
        } else {
          showPluginToast(`❌ Download failed: ${data.error || "Unknown error"}`, true);
          btnDownload.disabled = false;
          btnDownload.textContent = "📥 Retry Download";
        }
      } catch (err) {
        showPluginToast(`❌ Download error: ${err.message}`, true);
        btnDownload.disabled = false;
        btnDownload.textContent = "📥 Retry Download";
      }
    });
  }

  // 8. Bind Delete Button
  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      const ok = confirm("Are you sure you want to remove the Kokoro model files (~351MB)? You will need to download them again to use speech.");
      if (!ok) return;

      btnDelete.disabled = true;
      btnDelete.textContent = "Deleting...";
      try {
        const res = await fetch("/api/tts/delete-model", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          showPluginToast("🗑️ Model files removed from disk");
          await refreshModelStatus();
        } else {
          showPluginToast(`❌ Failed to delete: ${data.error || "Unknown error"}`, true);
        }
      } catch (err) {
        showPluginToast(`❌ Delete error: ${err.message}`, true);
      } finally {
        btnDelete.disabled = false;
        btnDelete.textContent = "🗑️ Delete Model";
      }
    });
  }
}

// ─── Moonshine Local Speech-to-Text (STT) Manager & Microphone Pipeline ───

let sttMediaStream = null;
let sttAudioContext = null;
let sttAudioCapture = null;
let sttScriptProcessor = null;
let sttAudioChunks = [];
let sttIsRecording = false;
let sttAnalyserNode = null;
let sttAnimFrameId = null;
let sttRecordStartTime = 0;
let sttTimerInterval = null;
let sttActiveModelVariant = localStorage.getItem("ai_plate_stt_model") || "moonshine/tiny";
let sttActiveMicDeviceId = localStorage.getItem("ai_plate_stt_mic_device_id") || "default";
let sttInitialPromptPrefix = "";
let sttLiveTranscript = "";
let sttInterimInterval = null;
let sttInterimInProgress = false;
let sttLastInterimSampleCount = 0;
let sttStopMode = localStorage.getItem("ai_plate_stt_stop_mode") || "vad"; // "vad" | "manual"
let sttSilenceDurationSec = localStorage.getItem("ai_plate_stt_silence_sec") || "2.0";
let sttSilenceDurationMs = parseFloat(sttSilenceDurationSec) * 1000;
let sttHasSpoken = false;
let sttLastSpeechTime = 0;

function getSTTAudioConstraints() {
  const constraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  const activeId = localStorage.getItem("ai_plate_stt_mic_device_id") || sttActiveMicDeviceId;
  if (activeId && activeId !== "default") {
    constraints.deviceId = { exact: activeId };
  }
  return constraints;
}

async function requestSTTMicrophoneStream() {
  const constraints = getSTTAudioConstraints();
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (err) {
    if (constraints.deviceId) {
      console.warn("[STT] Selected microphone unavailable, falling back to default:", err);
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }
    throw err;
  }
}

async function populateSTTMicSelector(selectEl, promptIfBlank = false) {
  if (!selectEl) return;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      selectEl.innerHTML = '<option value="default">🎙️ Default System Microphone (Auto)</option>';
      return;
    }

    let devices = await navigator.mediaDevices.enumerateDevices();
    let audioInputs = devices.filter((d) => d.kind === "audioinput");

    if (promptIfBlank && audioInputs.some((d) => !d.label)) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
        audioInputs = devices.filter((d) => d.kind === "audioinput");
      } catch {}
    }

    selectEl.innerHTML = "";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "default";
    defaultOpt.textContent = "🎙️ Default System Microphone (Auto)";
    selectEl.appendChild(defaultOpt);

    const activeId = localStorage.getItem("ai_plate_stt_mic_device_id") || sttActiveMicDeviceId || "default";

    audioInputs.forEach((dev, idx) => {
      if (dev.deviceId === "default" || dev.deviceId === "communications") {
        if (dev.label) {
          defaultOpt.textContent = `🎙️ Default: ${dev.label}`;
        }
        return;
      }
      const opt = document.createElement("option");
      opt.value = dev.deviceId;
      opt.textContent = `🎤 ${dev.label || `Microphone ${idx + 1}`}`;
      selectEl.appendChild(opt);
    });

    selectEl.value = activeId;
    if (!selectEl.value) {
      selectEl.value = "default";
      sttActiveMicDeviceId = "default";
      localStorage.setItem("ai_plate_stt_mic_device_id", "default");
    }
  } catch (err) {
    console.warn("[STT] populateSTTMicSelector error:", err);
  }
}

function isSTTPluginEnabled() {
  if (typeof registeredPlugins === "undefined" || !Array.isArray(registeredPlugins) || registeredPlugins.length === 0) {
    try {
      const cached = JSON.parse(localStorage.getItem("ai_plate_plugins_cache") || "[]");
      const p = cached.find((x) => x.id === "stt");
      return p ? Boolean(p.enabled) : true;
    } catch {
      return true;
    }
  }
  const p = registeredPlugins.find((x) => x.id === "stt");
  return p ? Boolean(p.enabled) : true;
}

function syncSTTUIState(forceEnabled) {
  const isSttActive = forceEnabled !== undefined ? forceEnabled : isSTTPluginEnabled();
  const btnMic = document.getElementById("btn-mic-input");
  if (btnMic) {
    btnMic.style.display = isSttActive ? "inline-flex" : "none";
  }
  if (!isSttActive && sttIsRecording) {
    cancelSTTRecording();
  }
}

// High-fidelity PCM WAV encoder (16kHz 16-bit Mono)
function encodeWavBuffer(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");

  // "fmt " sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);          // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);           // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true);           // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true);  // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true);           // BlockAlign
  view.setUint16(34, 16, true);          // BitsPerSample

  // "data" sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  // PCM samples write
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

// Convert ArrayBuffer to Base64 safely without call-stack limits
function bufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return window.btoa(binary);
}

// Anti-aliased linear downsampling filter
function downsampleBuffer(buffer, inputRate, outputRate = 16000) {
  if (inputRate === outputRate) {
    return buffer;
  }
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// Modern AudioWorklet PCM streaming with graceful fallback
async function attachSTTAudioProcessor(audioContext, sourceNode, onData) {
  if (audioContext.audioWorklet) {
    try {
      try {
        await audioContext.audioWorklet.addModule("stt-processor.js");
      } catch {
        const workletCode = `
          class STTAudioProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0];
              if (input && input.length > 0 && input[0]) {
                this.port.postMessage(input[0]);
              }
              return true;
            }
          }
          registerProcessor('stt-audio-processor', STTAudioProcessor);
        `;
        const blob = new Blob([workletCode], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);
      }

      const workletNode = new AudioWorkletNode(audioContext, "stt-audio-processor");
      workletNode.port.onmessage = (e) => {
        if (e.data) onData(e.data);
      };
      sourceNode.connect(workletNode);
      workletNode.connect(audioContext.destination);

      return {
        disconnect: () => {
          try { workletNode.disconnect(); } catch {}
        },
      };
    } catch (workletErr) {
      console.warn("[STT] AudioWorklet setup fallback to ScriptProcessor:", workletErr);
    }
  }

  // Graceful fallback for environments where AudioWorklet is unavailable
  const bufferSize = 4096;
  const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
  scriptNode.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    onData(inputData);
  };
  sourceNode.connect(scriptNode);
  scriptNode.connect(audioContext.destination);

  return {
    disconnect: () => {
      try { scriptNode.disconnect(); } catch {}
    },
  };
}

function cancelSTTRecording() {
  sttIsRecording = false;
  if (sttInterimInterval) {
    clearInterval(sttInterimInterval);
    sttInterimInterval = null;
  }
  if (sttTimerInterval) {
    clearInterval(sttTimerInterval);
    sttTimerInterval = null;
  }
  if (sttAnimFrameId) {
    cancelAnimationFrame(sttAnimFrameId);
    sttAnimFrameId = null;
  }
  const btnMic = document.getElementById("btn-mic-input");
  const micIdleIcon = btnMic?.querySelector(".mic-icon-idle");
  const micRecIcon = btnMic?.querySelector(".mic-icon-rec");
  if (btnMic) {
    btnMic.classList.remove("recording");
    btnMic.setAttribute("title", "Voice Input (Moonshine STT)");
    if (micIdleIcon) micIdleIcon.style.display = "inline-flex";
    if (micRecIcon) micRecIcon.style.display = "none";
  }
  if (userInput && sttInitialPromptPrefix !== undefined) {
    userInput.value = sttInitialPromptPrefix;
    if (typeof adjustTextareaHeight === "function") adjustTextareaHeight();
  }
  sttCleanupRecording();
}

async function startSTTRecording() {
  if (sttIsRecording) return;

  if (!isSTTPluginEnabled()) {
    showPluginToast("Moonshine STT plugin is disabled. Enable it in Plugins & Tools to use voice.");
    return;
  }

  const btnMic = document.getElementById("btn-mic-input");
  const micIdleIcon = btnMic?.querySelector(".mic-icon-idle");
  const micRecIcon = btnMic?.querySelector(".mic-icon-rec");

  try {
    const stream = await requestSTTMicrophoneStream();

    sttMediaStream = stream;
    sttAudioChunks = [];
    sttIsRecording = true;
    sttRecordStartTime = Date.now();
    sttInitialPromptPrefix = userInput?.value || "";
    sttLiveTranscript = "";
    sttInterimInProgress = false;
    sttLastInterimSampleCount = 0;
    sttHasSpoken = false;
    sttLastSpeechTime = 0;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    sttAudioContext = new AudioContextClass();
    const sourceNode = sttAudioContext.createMediaStreamSource(stream);

    // Audio processor to collect PCM samples via modern AudioWorkletNode
    sttAudioCapture = await attachSTTAudioProcessor(sttAudioContext, sourceNode, (inputData) => {
      if (!sttIsRecording) return;
      sttAudioChunks.push(new Float32Array(inputData));

      // Voice Activity Detection (VAD)
      if (sttStopMode === "vad") {
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        if (rms > 0.015) {
          sttHasSpoken = true;
          sttLastSpeechTime = Date.now();
        }
      }
    });

    // UI State: Recording (mic button glows red)
    if (btnMic) {
      btnMic.classList.add("recording");
      btnMic.setAttribute("title", sttStopMode === "vad"
        ? `Listening (Auto-stops after ${sttSilenceDurationSec}s silence)`
        : "Recording (Click to stop, 60s max)");
      if (micIdleIcon) micIdleIcon.style.display = "none";
      if (micRecIcon) micRecIcon.style.display = "inline-flex";
    }

    // Monitoring timer: checks VAD silence auto-stop and 60s hard limit
    if (sttTimerInterval) clearInterval(sttTimerInterval);
    sttTimerInterval = setInterval(() => {
      if (!sttIsRecording) return;
      const now = Date.now();
      const elapsedSec = Math.floor((now - sttRecordStartTime) / 1000);

      // VAD Auto-Stop: trigger if user has spoken and has now been silent for configured duration
      if (sttStopMode === "vad" && sttHasSpoken && sttLastSpeechTime > 0) {
        if (now - sttLastSpeechTime >= sttSilenceDurationMs) {
          stopSTTRecording();
          return;
        }
      }

      // Hard Timer safety cap: 60s
      if (elapsedSec >= 60) {
        stopSTTRecording();
      }
    }, 200);

    // Live interim transcription loop: updates user-input textarea in real-time as speech arrives
    if (sttInterimInterval) clearInterval(sttInterimInterval);
    sttInterimInterval = setInterval(async () => {
      if (!sttIsRecording || sttInterimInProgress) return;
      const inputRate = sttAudioContext?.sampleRate || 44100;
      const chunks = sttAudioChunks.slice();
      let totalSamples = 0;
      for (const c of chunks) totalSamples += c.length;

      // Need at least 0.4s of audio and 0.3s of new speech
      if (totalSamples < inputRate * 0.4) return;
      if (totalSamples - sttLastInterimSampleCount < inputRate * 0.3) return;

      sttInterimInProgress = true;
      sttLastInterimSampleCount = totalSamples;

      const merged = new Float32Array(totalSamples);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.length;
      }

      const downsampled = downsampleBuffer(merged, inputRate, 16000);
      const wavBuffer = encodeWavBuffer(downsampled, 16000);
      const base64Wav = bufferToBase64(wavBuffer);

      try {
        const res = await window.electronAPI.stt.transcribe({
          audioBase64: base64Wav,
          model: sttActiveModelVariant,
        });

        if (sttIsRecording && res && res.success && res.text) {
          const recognized = res.text.trim();
          if (recognized) {
            sttLiveTranscript = recognized;
            if (userInput) {
              const prefix = sttInitialPromptPrefix
                ? (sttInitialPromptPrefix.endsWith(" ") ? sttInitialPromptPrefix : sttInitialPromptPrefix + " ")
                : "";
              userInput.value = prefix + recognized;
              if (typeof adjustTextareaHeight === "function") adjustTextareaHeight();
              userInput.scrollTop = userInput.scrollHeight;
            }
          }
        }
      } catch {
        // Silently continue interim pass
      } finally {
        sttInterimInProgress = false;
      }
    }, 600);

  } catch (err) {
    console.error("[STT Mic Error]", err);
    showPluginToast(`Microphone access error: ${err.message}`);
    cancelSTTRecording();
  }
}

async function stopSTTRecording() {
  if (!sttIsRecording) return;
  sttIsRecording = false;

  if (sttInterimInterval) {
    clearInterval(sttInterimInterval);
    sttInterimInterval = null;
  }
  if (sttTimerInterval) {
    clearInterval(sttTimerInterval);
    sttTimerInterval = null;
  }
  if (sttAnimFrameId) {
    cancelAnimationFrame(sttAnimFrameId);
    sttAnimFrameId = null;
  }

  const btnMic = document.getElementById("btn-mic-input");
  const micIdleIcon = btnMic?.querySelector(".mic-icon-idle");
  const micRecIcon = btnMic?.querySelector(".mic-icon-rec");

  if (btnMic) {
    btnMic.classList.remove("recording");
    btnMic.setAttribute("title", "Voice Input (Moonshine STT)");
    if (micIdleIcon) micIdleIcon.style.display = "inline-flex";
    if (micRecIcon) micRecIcon.style.display = "none";
  }

  const inputRate = sttAudioContext?.sampleRate || 44100;
  const chunks = sttAudioChunks.slice();
  sttCleanupRecording();

  let totalSamples = 0;
  for (const c of chunks) totalSamples += c.length;

  if (totalSamples < inputRate * 0.2) {
    if (sttLiveTranscript && userInput) {
      const prefix = sttInitialPromptPrefix
        ? (sttInitialPromptPrefix.endsWith(" ") ? sttInitialPromptPrefix : sttInitialPromptPrefix + " ")
        : "";
      userInput.value = prefix + sttLiveTranscript;
      if (typeof adjustTextareaHeight === "function") adjustTextareaHeight();
    }
    return;
  }

  const merged = new Float32Array(totalSamples);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }

  const downsampled = downsampleBuffer(merged, inputRate, 16000);
  const wavBuffer = encodeWavBuffer(downsampled, 16000);
  const base64Wav = bufferToBase64(wavBuffer);

  try {
    const res = await window.electronAPI.stt.transcribe({
      audioBase64: base64Wav,
      model: sttActiveModelVariant,
    });

    if (res && res.success && res.text) {
      const recognized = res.text.trim();
      if (recognized) {
        if (userInput) {
          const prefix = sttInitialPromptPrefix
            ? (sttInitialPromptPrefix.endsWith(" ") ? sttInitialPromptPrefix : sttInitialPromptPrefix + " ")
            : "";
          userInput.value = prefix + recognized;
          if (typeof adjustTextareaHeight === "function") adjustTextareaHeight();
          userInput.focus();
          userInput.setSelectionRange(userInput.value.length, userInput.value.length);
        }
        return;
      }
    }

    if (sttLiveTranscript) {
      if (userInput) {
        const prefix = sttInitialPromptPrefix
          ? (sttInitialPromptPrefix.endsWith(" ") ? sttInitialPromptPrefix : sttInitialPromptPrefix + " ")
          : "";
        userInput.value = prefix + sttLiveTranscript;
        if (typeof adjustTextareaHeight === "function") adjustTextareaHeight();
        userInput.focus();
        userInput.setSelectionRange(userInput.value.length, userInput.value.length);
      }
      return;
    }

    showPluginToast("No speech recognized");
  } catch (err) {
    console.error("[STT Transcribe Error]", err);
    if (sttLiveTranscript && userInput) {
      const prefix = sttInitialPromptPrefix
        ? (sttInitialPromptPrefix.endsWith(" ") ? sttInitialPromptPrefix : sttInitialPromptPrefix + " ")
        : "";
      userInput.value = prefix + sttLiveTranscript;
      if (typeof adjustTextareaHeight === "function") adjustTextareaHeight();
      return;
    }
    showPluginToast(`Voice transcription error: ${err.message || "Failed"}`);
  }
}

function sttCleanupRecording() {
  if (sttMediaStream) {
    sttMediaStream.getTracks().forEach((t) => t.stop());
    sttMediaStream = null;
  }
  if (sttAudioCapture) {
    try { sttAudioCapture.disconnect(); } catch {}
    sttAudioCapture = null;
  }
  if (sttScriptProcessor) {
    try { sttScriptProcessor.disconnect(); } catch {}
    sttScriptProcessor = null;
  }
  if (sttAnalyserNode) {
    try { sttAnalyserNode.disconnect(); } catch {}
    sttAnalyserNode = null;
  }
  if (sttAudioContext) {
    try { sttAudioContext.close(); } catch {}
    sttAudioContext = null;
  }
}

// Wire mic input button click
const btnMicInput = document.getElementById("btn-mic-input");
if (btnMicInput) {
  btnMicInput.addEventListener("click", () => {
    if (sttIsRecording) {
      stopSTTRecording();
    } else {
      startSTTRecording();
    }
  });
}

// ─── Moonshine STT Plugins & Tools Configuration ───────────────────

function buildSTTPluginControlsHtml(plugin) {
  return `
    <div class="plugin-custom-config-section stt-plugin-config" style="margin-top: 14px; padding: 14px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-card);">
      <div style="font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <span>🎙️</span>
        <span>Speech Recognition &amp; Model Configuration</span>
      </div>

      <!-- 1. Model Download & Status Box -->
      <div class="stt-model-manager-box" id="stt-model-box" style="margin-bottom: 14px; padding: 12px; border-radius: var(--radius-sm); background: var(--bg-hover); border: 1px solid var(--border-card);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🧠</span>
            <div>
              <div style="font-size: 12.5px; font-weight: 600;">Moonshine Neural ONNX Model</div>
              <div id="stt-model-status-text" style="font-size: 11.5px; color: var(--text-muted);">Checking model status...</div>
            </div>
          </div>
          <div id="stt-model-actions" style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="btn btn-primary btn-xs" id="btn-download-stt-model" style="font-size: 11px; padding: 5px 12px; font-weight: 600;">
              📥 Download Model (~27MB)
            </button>
            <button type="button" class="btn btn-secondary btn-xs" id="btn-delete-stt-model" style="display: none; font-size: 11px; padding: 5px 10px; color: var(--danger);">
              🗑️ Delete Model
            </button>
          </div>
        </div>

        <div class="tts-download-progress-wrap" id="stt-download-progress-wrap" style="display: none; margin-top: 10px;">
          <div class="tts-download-progress-header">
            <span class="tts-download-file-name" id="stt-download-file-name">
              <span class="tts-download-icon">📥</span>
              <span id="stt-download-step-label">Connecting to download CDN...</span>
            </span>
            <span class="tts-download-meta" id="stt-download-meta">0%</span>
          </div>
          <div class="tts-download-track">
            <div class="tts-download-bar" id="stt-download-progress-bar" style="width: 0%;"></div>
          </div>
          <div class="tts-download-subinfo">
            <span id="stt-download-detail-text">Initializing model download...</span>
          </div>
        </div>
      </div>

      <!-- 2. Model Variant & Microphone Selection -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 12px;">
        <div>
          <label style="display: block; font-size: 11.5px; font-weight: 600; color: var(--text-muted); margin-bottom: 5px;">MODEL VARIANT</label>
          <select id="plugin-stt-model-select" class="form-select" style="width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-card); color: var(--text-main); font-size: 12px;">
            <option value="moonshine/tiny" ${sttActiveModelVariant === "moonshine/tiny" ? "selected" : ""}>Moonshine Tiny (~27MB) — Ultra Fast (&lt;120ms latency)</option>
            <option value="moonshine/base" ${sttActiveModelVariant === "moonshine/base" ? "selected" : ""}>Moonshine Base (~65MB) — Higher Accuracy</option>
          </select>
        </div>
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
            <label style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); margin: 0;">MICROPHONE INPUT</label>
            <button type="button" class="btn btn-ghost btn-xs" id="btn-refresh-stt-mics" title="Detect &amp; refresh connected microphones" style="font-size: 10.5px; padding: 1px 6px; height: auto;">
              🔄 Detect
            </button>
          </div>
          <select id="plugin-stt-mic-select" class="form-select" style="width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-card); color: var(--text-main); font-size: 12px;">
            <option value="default">🎙️ Default System Microphone (Auto)</option>
          </select>
        </div>
      </div>

      <!-- 3. Recording Auto-Stop Mode (VAD vs Hard Timer) -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 14px;">
        <div>
          <label style="display: block; font-size: 11.5px; font-weight: 600; color: var(--text-muted); margin-bottom: 5px;">RECORDING STOP MODE</label>
          <select id="plugin-stt-stop-mode-select" class="form-select" style="width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-card); color: var(--text-main); font-size: 12px;">
            <option value="vad" ${sttStopMode === "vad" ? "selected" : ""}>🗣️ Auto-Stop on Silence (Voice Activity Detection)</option>
            <option value="manual" ${sttStopMode === "manual" ? "selected" : ""}>⏱️ Hard Timer / Manual (Click to stop, 60s hard limit)</option>
          </select>
        </div>
        <div id="stt-silence-duration-wrap" style="${sttStopMode === 'manual' ? 'display: none;' : ''}">
          <label style="display: block; font-size: 11.5px; font-weight: 600; color: var(--text-muted); margin-bottom: 5px;">SILENCE PAUSE TIMEOUT</label>
          <select id="plugin-stt-silence-select" class="form-select" style="width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-card); color: var(--text-main); font-size: 12px;">
            <option value="1.5" ${sttSilenceDurationSec === "1.5" ? "selected" : ""}>1.5 seconds (Fast stop)</option>
            <option value="2.0" ${sttSilenceDurationSec === "2.0" ? "selected" : ""}>2.0 seconds (Recommended natural pause)</option>
            <option value="2.5" ${sttSilenceDurationSec === "2.5" ? "selected" : ""}>2.5 seconds (Relaxed pauses)</option>
            <option value="3.0" ${sttSilenceDurationSec === "3.0" ? "selected" : ""}>3.0 seconds (Long pauses)</option>
          </select>
        </div>
      </div>

      <!-- 4. Transcribe Live Tester -->
      <div class="stt-tester-card" id="stt-tester-card">
        <div class="stt-tester-header">
          <div class="stt-tester-title-group">
            <div class="stt-tester-title">
              <span>⚡</span>
              <span>Transcribe Live Tester</span>
            </div>
            <div class="stt-tester-badge status-ready" id="stt-tester-status-badge">
              <span class="stt-tester-dot"></span>
              <span id="stt-tester-status-text">Ready</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="font-size: 10.5px; color: var(--text-muted); font-family: monospace; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-card);" id="stt-tester-vad-indicator" title="Stop Mode">
              ${sttStopMode === "vad" ? `🗣️ VAD (${sttSilenceDurationSec}s)` : "⏱️ Hard Timer"}
            </div>
            <div style="font-size: 10.5px; color: var(--text-muted); font-family: monospace; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-card);" id="stt-tester-mic-indicator" title="Active Microphone">
              🎙️ Default
            </div>
            <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;" id="stt-tester-model-indicator">
              ${sttActiveModelVariant}
            </div>
          </div>
        </div>

        <!-- Controls Row -->
        <div class="stt-tester-controls-row">
          <button type="button" class="btn btn-primary btn-xs stt-tester-btn-record" id="btn-stt-tester-record">
            <span class="stt-tester-record-icon">🎙️</span>
            <span id="btn-stt-tester-record-label">Start Live Test</span>
          </button>

          <label class="btn btn-secondary btn-xs" style="cursor: pointer; display: inline-flex; align-items: center; gap: 5px; margin: 0; font-size: 11.5px;">
            <span>📁</span>
            <span>Test Audio File</span>
            <input type="file" id="stt-tester-file-input" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" style="display: none;" />
          </label>

          <button type="button" class="btn btn-ghost btn-xs" id="btn-stt-tester-clear" title="Clear results" style="font-size: 11px; color: var(--text-muted); margin-left: auto;">
            <span>✕ Clear</span>
          </button>
        </div>

        <!-- Visualizer & VU Meter Box -->
        <div class="stt-tester-visualizer-box" id="stt-tester-viz-box">
          <div class="stt-tester-waves-row">
            <div class="stt-tester-waves" id="stt-tester-wave-bars">
              <span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="stt-tester-timer" id="stt-tester-timer">00:00.0</div>
          </div>

          <div class="stt-tester-vu-wrap">
            <span>MIC LEVEL</span>
            <div class="stt-tester-vu-bar">
              <div class="stt-tester-vu-fill" id="stt-tester-vu-fill"></div>
            </div>
          </div>
        </div>

        <!-- Live Transcription Result Display -->
        <div class="stt-tester-output-box empty" id="stt-tester-output-box">
          Click "Start Live Test" to record speech or select an audio file to benchmark Moonshine ONNX.
        </div>

        <!-- Performance / Benchmarking Telemetry -->
        <div class="stt-tester-metrics-row" id="stt-tester-metrics" style="display: none;">
          <div class="stt-tester-metric-chip">
            <span>⚡ Latency:</span>
            <strong id="stt-metric-latency">-</strong>
          </div>
          <div class="stt-tester-metric-chip">
            <span>⏱️ Audio:</span>
            <strong id="stt-metric-duration">-</strong>
          </div>
          <div class="stt-tester-metric-chip">
            <span>🚀 Speed:</span>
            <strong id="stt-metric-speed">-</strong>
          </div>
          <div class="stt-tester-metric-chip">
            <span>🧠 Model:</span>
            <strong id="stt-metric-model">${sttActiveModelVariant}</strong>
          </div>
        </div>

        <!-- Action Buttons (Copy / Insert into Chat) -->
        <div class="stt-tester-actions-row" id="stt-tester-actions" style="display: none;">
          <button type="button" class="btn btn-secondary btn-xs" id="btn-stt-copy-transcript" style="font-size: 11px;">
            <span>📋 Copy</span>
          </button>
          <button type="button" class="btn btn-primary btn-xs" id="btn-stt-insert-chat" style="font-size: 11px;">
            <span>💬 Insert into Chat</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateSTTDownloadProgressUI(prog) {
  if (!prog) return;
  const wrap = document.getElementById("stt-download-progress-wrap");
  const bar = document.getElementById("stt-download-progress-bar");
  const stepLabel = document.getElementById("stt-download-step-label");
  const meta = document.getElementById("stt-download-meta");
  const detailText = document.getElementById("stt-download-detail-text");
  const btnDownload = document.getElementById("btn-download-stt-model");

  if (wrap) wrap.style.display = "block";
  if (btnDownload) {
    btnDownload.disabled = true;
    btnDownload.textContent = "⏳ Downloading...";
  }

  const pct = Math.min(100, Math.max(0, Math.round(prog.percent || 0)));
  if (bar) bar.style.width = `${pct}%`;
  if (stepLabel) stepLabel.textContent = prog.label || "Moonshine Model";
  if (meta) meta.textContent = `${pct}%`;
  if (detailText) detailText.textContent = prog.statusText || "Downloading ONNX model...";
}

window.addEventListener("stt:download-progress", (e) => {
  if (e.detail) {
    updateSTTDownloadProgressUI(e.detail);
  }
});

async function initSTTPluginControls(cardElement) {
  if (!cardElement) return;

  const modelSelect = cardElement.querySelector("#plugin-stt-model-select");
  const statusText = cardElement.querySelector("#stt-model-status-text");
  const btnDownload = cardElement.querySelector("#btn-download-stt-model");
  const btnDelete = cardElement.querySelector("#btn-delete-stt-model");

  // Tester Elements
  const testerCard = cardElement.querySelector("#stt-tester-card");
  const statusBadge = cardElement.querySelector("#stt-tester-status-badge");
  const testerStatusText = cardElement.querySelector("#stt-tester-status-text");
  const modelIndicator = cardElement.querySelector("#stt-tester-model-indicator");
  const btnRecord = cardElement.querySelector("#btn-stt-tester-record");
  const btnRecordLabel = cardElement.querySelector("#btn-stt-tester-record-label");
  const fileInput = cardElement.querySelector("#stt-tester-file-input");
  const btnClear = cardElement.querySelector("#btn-stt-tester-clear");
  const waveBars = cardElement.querySelectorAll("#stt-tester-wave-bars span");
  const testerTimer = cardElement.querySelector("#stt-tester-timer");
  const vuFill = cardElement.querySelector("#stt-tester-vu-fill");
  const outputBox = cardElement.querySelector("#stt-tester-output-box");
  const metricsRow = cardElement.querySelector("#stt-tester-metrics");
  const metricLatency = cardElement.querySelector("#stt-metric-latency");
  const metricDuration = cardElement.querySelector("#stt-metric-duration");
  const metricSpeed = cardElement.querySelector("#stt-metric-speed");
  const metricModel = cardElement.querySelector("#stt-metric-model");
  const actionsRow = cardElement.querySelector("#stt-tester-actions");
  const btnCopy = cardElement.querySelector("#btn-stt-copy-transcript");
  const btnInsertChat = cardElement.querySelector("#btn-stt-insert-chat");

  let testerIsRecording = false;
  let testerMediaStream = null;
  let testerAudioContext = null;
  let testerAnalyser = null;
  let testerAudioCapture = null;
  let testerScriptProcessor = null;
  let testerAudioChunks = [];
  let testerStartTime = 0;
  let testerTimerInterval = null;
  let testerAnimId = null;
  let testerInterimInterval = null;
  let testerInterimInProgress = false;
  let testerLastInterimSamples = 0;
  let lastTranscribedText = "";

  function updateTesterModelLabels() {
    if (modelIndicator) modelIndicator.textContent = sttActiveModelVariant;
    if (metricModel) metricModel.textContent = sttActiveModelVariant;
  }

  if (modelSelect) {
    modelSelect.addEventListener("change", (e) => {
      sttActiveModelVariant = e.target.value;
      localStorage.setItem("ai_plate_stt_model", sttActiveModelVariant);
      showPluginToast(`STT Model set to: ${sttActiveModelVariant}`);
      updateTesterModelLabels();
      refreshSTTModelStatus();
    });
  }

  const micSelect = cardElement.querySelector("#plugin-stt-mic-select");
  const btnRefreshMics = cardElement.querySelector("#btn-refresh-stt-mics");
  const testerMicIndicator = cardElement.querySelector("#stt-tester-mic-indicator");

  function updateTesterMicIndicator() {
    if (!testerMicIndicator) return;
    if (micSelect && micSelect.selectedOptions && micSelect.selectedOptions[0]) {
      const text = micSelect.selectedOptions[0].textContent || "🎙️ Default";
      testerMicIndicator.textContent = text.length > 24 ? text.slice(0, 22) + "…" : text;
      testerMicIndicator.title = `Active Mic: ${text}`;
    } else {
      testerMicIndicator.textContent = "🎙️ Default";
      testerMicIndicator.title = "Default System Microphone";
    }
  }

  if (micSelect) {
    populateSTTMicSelector(micSelect, false).then(() => {
      updateTesterMicIndicator();
    });

    micSelect.addEventListener("change", (e) => {
      sttActiveMicDeviceId = e.target.value;
      localStorage.setItem("ai_plate_stt_mic_device_id", sttActiveMicDeviceId);
      updateTesterMicIndicator();
      const selectedName = micSelect.selectedOptions[0]?.textContent || sttActiveMicDeviceId;
      showPluginToast(`Microphone selected: ${selectedName}`);
    });
  }

  if (btnRefreshMics) {
    btnRefreshMics.addEventListener("click", async () => {
      const originalText = btnRefreshMics.innerHTML;
      btnRefreshMics.innerHTML = "⏳ Detecting...";
      btnRefreshMics.disabled = true;
      try {
        await populateSTTMicSelector(micSelect, true);
        updateTesterMicIndicator();
        showPluginToast("Audio input devices detected");
      } catch (err) {
        console.warn("[STT] Failed to detect audio devices:", err);
      } finally {
        btnRefreshMics.innerHTML = originalText;
        btnRefreshMics.disabled = false;
      }
    });
  }

  const handleDeviceChange = () => {
    if (micSelect) {
      populateSTTMicSelector(micSelect, false).then(() => {
        updateTesterMicIndicator();
      });
    }
  };
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
  }

  const stopModeSelect = cardElement.querySelector("#plugin-stt-stop-mode-select");
  const silenceWrap = cardElement.querySelector("#stt-silence-duration-wrap");
  const silenceSelect = cardElement.querySelector("#plugin-stt-silence-select");
  const vadIndicator = cardElement.querySelector("#stt-tester-vad-indicator");

  function updateTesterVadIndicator() {
    if (!vadIndicator) return;
    if (sttStopMode === "vad") {
      vadIndicator.textContent = `🗣️ VAD (${sttSilenceDurationSec}s)`;
      vadIndicator.title = `Voice Activity Detection: auto-stop after ${sttSilenceDurationSec}s silence`;
    } else {
      vadIndicator.textContent = `⏱️ Hard Timer`;
      vadIndicator.title = `Manual stop or 60s hard limit`;
    }
  }

  if (stopModeSelect) {
    stopModeSelect.value = sttStopMode;
    stopModeSelect.addEventListener("change", (e) => {
      sttStopMode = e.target.value;
      localStorage.setItem("ai_plate_stt_stop_mode", sttStopMode);
      if (silenceWrap) {
        silenceWrap.style.display = sttStopMode === "manual" ? "none" : "";
      }
      updateTesterVadIndicator();
      showPluginToast(sttStopMode === "vad"
        ? `STT: Auto-stop on silence enabled (VAD ${sttSilenceDurationSec}s)`
        : "STT: Hard timer / Manual stop enabled (60s limit)");
    });
  }

  if (silenceSelect) {
    silenceSelect.value = sttSilenceDurationSec;
    silenceSelect.addEventListener("change", (e) => {
      sttSilenceDurationSec = e.target.value;
      sttSilenceDurationMs = parseFloat(sttSilenceDurationSec) * 1000;
      localStorage.setItem("ai_plate_stt_silence_sec", sttSilenceDurationSec);
      updateTesterVadIndicator();
      showPluginToast(`STT Silence pause timeout: ${sttSilenceDurationSec}s`);
    });
  }

  function cleanupTesterRecording() {
    testerIsRecording = false;
    if (testerInterimInterval) {
      clearInterval(testerInterimInterval);
      testerInterimInterval = null;
    }
    if (testerTimerInterval) {
      clearInterval(testerTimerInterval);
      testerTimerInterval = null;
    }
    if (testerAnimId) {
      cancelAnimationFrame(testerAnimId);
      testerAnimId = null;
    }
    if (testerMediaStream) {
      testerMediaStream.getTracks().forEach((t) => t.stop());
      testerMediaStream = null;
    }
    if (testerAudioCapture) {
      try { testerAudioCapture.disconnect(); } catch {}
      testerAudioCapture = null;
    }
    if (testerScriptProcessor) {
      try { testerScriptProcessor.disconnect(); } catch {}
      testerScriptProcessor = null;
    }
    if (testerAnalyser) {
      try { testerAnalyser.disconnect(); } catch {}
      testerAnalyser = null;
    }
    if (testerAudioContext) {
      try { testerAudioContext.close(); } catch {}
      testerAudioContext = null;
    }
    if (waveBars) {
      waveBars.forEach((b) => (b.style.height = "4px"));
    }
    if (vuFill) {
      vuFill.style.width = "0%";
    }
    if (testerCard) testerCard.classList.remove("recording");
    if (btnRecord) btnRecord.classList.remove("recording");
    if (btnRecordLabel) btnRecordLabel.textContent = "Start Live Test";
  }

  async function startTesterRecording() {
    if (testerIsRecording) return;

    // Stop dock mic if recording
    if (typeof sttIsRecording !== "undefined" && sttIsRecording && typeof stopSTTRecording === "function") {
      stopSTTRecording();
    }

    try {
      const stream = await requestSTTMicrophoneStream();

      testerMediaStream = stream;
      testerAudioChunks = [];
      testerIsRecording = true;
      testerStartTime = performance.now();
      let testerHasSpoken = false;
      let testerLastSpeechTime = 0;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      testerAudioContext = new AudioContextClass();
      const source = testerAudioContext.createMediaStreamSource(stream);

      testerAnalyser = testerAudioContext.createAnalyser();
      testerAnalyser.fftSize = 64;
      testerAnalyser.smoothingTimeConstant = 0.4;
      source.connect(testerAnalyser);

      // Collect PCM samples via modern AudioWorkletNode
      testerAudioCapture = await attachSTTAudioProcessor(testerAudioContext, source, (inputData) => {
        if (!testerIsRecording) return;
        testerAudioChunks.push(new Float32Array(inputData));

        // Voice Activity Detection (VAD)
        if (sttStopMode === "vad") {
          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);
          if (rms > 0.015) {
            testerHasSpoken = true;
            testerLastSpeechTime = performance.now();
          }
        }
      });

      // UI update to Recording state
      if (testerCard) testerCard.classList.add("recording");
      if (btnRecord) btnRecord.classList.add("recording");
      if (btnRecordLabel) btnRecordLabel.textContent = "Stop & Transcribe";
      if (statusBadge) statusBadge.className = "stt-tester-badge status-recording";
      if (testerStatusText) testerStatusText.textContent = "Listening...";
      if (outputBox) {
        outputBox.className = "stt-tester-output-box";
        outputBox.innerHTML = '<span style="color: #ef4444; font-weight: 500;">🔴 Recording... Speak into your microphone</span>';
      }
      if (metricsRow) metricsRow.style.display = "none";
      if (actionsRow) actionsRow.style.display = "none";

      // High-resolution live timer & VAD monitoring
      testerTimerInterval = setInterval(() => {
        if (!testerIsRecording) return;
        const now = performance.now();
        const elapsed = now - testerStartTime;
        const totalSec = elapsed / 1000;
        const mins = Math.floor(totalSec / 60);
        const secs = Math.floor(totalSec % 60);
        const tenths = Math.floor((elapsed % 1000) / 100);
        if (testerTimer) {
          testerTimer.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
        }

        // VAD Auto-Stop in tester
        if (sttStopMode === "vad" && testerHasSpoken && testerLastSpeechTime > 0) {
          if (now - testerLastSpeechTime >= sttSilenceDurationMs) {
            stopTesterRecording();
            return;
          }
        }

        // Hard Timer cap (60s)
        if (totalSec >= 60) {
          stopTesterRecording();
        }
      }, 75);

      // Live interim transcription loop: updates tester output box in real-time as speech arrives
      testerLastInterimSamples = 0;
      testerInterimInProgress = false;
      if (testerInterimInterval) clearInterval(testerInterimInterval);
      testerInterimInterval = setInterval(async () => {
        if (!testerIsRecording || testerInterimInProgress) return;
        const rate = testerAudioContext?.sampleRate || 44100;
        const testChunks = testerAudioChunks.slice();
        let samplesCount = 0;
        for (const c of testChunks) samplesCount += c.length;

        if (samplesCount < rate * 0.4) return;
        if (samplesCount - testerLastInterimSamples < rate * 0.3) return;

        testerInterimInProgress = true;
        testerLastInterimSamples = samplesCount;

        const mergedBuf = new Float32Array(samplesCount);
        let pos = 0;
        for (const c of testChunks) {
          mergedBuf.set(c, pos);
          pos += c.length;
        }

        const downBuf = downsampleBuffer(mergedBuf, rate, 16000);
        const wBuf = encodeWavBuffer(downBuf, 16000);
        const b64 = bufferToBase64(wBuf);

        try {
          const interimRes = await window.electronAPI.stt.transcribe({
            audioBase64: b64,
            model: sttActiveModelVariant,
          });

          if (testerIsRecording && interimRes && interimRes.success && interimRes.text) {
            const interimText = interimRes.text.trim();
            if (interimText && outputBox) {
              outputBox.className = "stt-tester-output-box";
              outputBox.innerHTML = `<div style="font-size: 13.5px; font-weight: 500; color: var(--text-main); line-height: 1.5;">"${escapeHtmlStr(interimText)}" <span style="font-size: 11px; color: var(--accent-primary); font-weight: 600; opacity: 0.85;">(live...)</span></div>`;
            }
          }
        } catch {
        } finally {
          testerInterimInProgress = false;
        }
      }, 600);

      // Real-time animated frequency visualizer & VU meter
      const freqData = new Uint8Array(testerAnalyser.frequencyBinCount);
      const barCount = waveBars ? waveBars.length : 16;

      function renderViz() {
        if (!testerIsRecording) return;
        testerAnalyser.getByteFrequencyData(freqData);

        let sum = 0;
        for (let i = 0; i < barCount; i++) {
          const idx = Math.min(freqData.length - 1, Math.floor((i / barCount) * 22) + 1);
          const val = freqData[idx] || 0;
          sum += val;
          if (waveBars && waveBars[i]) {
            const h = Math.max(3, Math.min(28, Math.round((val / 255) * 28)));
            waveBars[i].style.height = `${h}px`;
          }
        }

        const avg = sum / (barCount * 255);
        const vuPct = Math.min(100, Math.round(avg * 160));
        if (vuFill) vuFill.style.width = `${vuPct}%`;

        testerAnimId = requestAnimationFrame(renderViz);
      }
      testerAnimId = requestAnimationFrame(renderViz);
    } catch (err) {
      console.error("[STT Tester Mic Error]", err);
      cleanupTesterRecording();
      if (statusBadge) statusBadge.className = "stt-tester-badge";
      if (testerStatusText) testerStatusText.textContent = "Mic Error";
      if (outputBox) {
        outputBox.className = "stt-tester-output-box empty";
        outputBox.textContent = `❌ Microphone access error: ${err.message}`;
      }
      showPluginToast(`Microphone error: ${err.message}`, true);
    }
  }

  async function stopTesterRecording() {
    if (!testerIsRecording) return;

    const inputRate = testerAudioContext?.sampleRate || 44100;
    const chunks = testerAudioChunks.slice();
    cleanupTesterRecording();

    let totalSamples = 0;
    for (const c of chunks) totalSamples += c.length;

    if (totalSamples < inputRate * 0.25) {
      if (statusBadge) statusBadge.className = "stt-tester-badge";
      if (testerStatusText) testerStatusText.textContent = "Audio too short";
      if (outputBox) {
        outputBox.className = "stt-tester-output-box empty";
        outputBox.textContent = "⚠️ Audio too short. Please speak for at least 0.5s.";
      }
      return;
    }

    if (statusBadge) statusBadge.className = "stt-tester-badge status-transcribing";
    if (testerStatusText) testerStatusText.textContent = "Transcribing...";
    if (outputBox) {
      outputBox.className = "stt-tester-output-box";
      outputBox.innerHTML = '<span style="display: flex; align-items: center; gap: 8px; color: var(--accent-primary);"><span>⏳</span> <span>Transcribing audio with Moonshine ONNX...</span></span>';
    }

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    const downsampled = downsampleBuffer(merged, inputRate, 16000);
    const wavBuffer = encodeWavBuffer(downsampled, 16000);
    const base64Wav = bufferToBase64(wavBuffer);
    const audioDurSec = downsampled.length / 16000;

    const t0 = performance.now();
    try {
      const res = await window.electronAPI.stt.transcribe({
        audioBase64: base64Wav,
        model: sttActiveModelVariant,
      });
      const clientLatency = Math.round(performance.now() - t0);
      handleTesterResult(res, audioDurSec, clientLatency);
    } catch (err) {
      console.error("[STT Tester Transcribe Error]", err);
      if (statusBadge) statusBadge.className = "stt-tester-badge";
      if (testerStatusText) testerStatusText.textContent = "Error";
      if (outputBox) {
        outputBox.className = "stt-tester-output-box empty";
        outputBox.textContent = `❌ Transcription failed: ${err.message}`;
      }
    }
  }

  function handleTesterResult(res, audioDurSec, clientLatency) {
    if (res && res.success) {
      const text = (res.text || "").trim();
      lastTranscribedText = text;

      if (statusBadge) statusBadge.className = "stt-tester-badge status-ready";
      if (testerStatusText) testerStatusText.textContent = "✓ Transcribed";

      if (text) {
        if (outputBox) {
          outputBox.className = "stt-tester-output-box";
          outputBox.innerHTML = `<div style="font-size: 13.5px; font-weight: 500; color: var(--text-main); line-height: 1.5;">"${escapeHtmlStr(text)}"</div>`;
        }
        if (actionsRow) actionsRow.style.display = "flex";
      } else {
        if (outputBox) {
          outputBox.className = "stt-tester-output-box empty";
          outputBox.textContent = "No speech detected in audio.";
        }
        if (actionsRow) actionsRow.style.display = "none";
      }

      // Benchmark telemetry
      const latencyMs = res.elapsedMs !== undefined ? res.elapsedMs : clientLatency;
      const dur = Number(res.duration || audioDurSec || 1);
      const rtf = (dur / (latencyMs / 1000)).toFixed(1);

      if (metricLatency) metricLatency.textContent = `${latencyMs} ms`;
      if (metricDuration) metricDuration.textContent = `${dur.toFixed(2)} s`;
      if (metricSpeed) metricSpeed.textContent = `${rtf}x realtime`;
      if (metricModel) metricModel.textContent = res.model || sttActiveModelVariant;
      if (metricsRow) metricsRow.style.display = "flex";
    } else {
      if (statusBadge) statusBadge.className = "stt-tester-badge";
      if (testerStatusText) testerStatusText.textContent = "Failed";
      if (outputBox) {
        outputBox.className = "stt-tester-output-box empty";
        outputBox.textContent = `❌ ${res?.error || "Transcription failed"}`;
      }
      if (metricsRow) metricsRow.style.display = "none";
      if (actionsRow) actionsRow.style.display = "none";
    }
  }

  if (btnRecord) {
    btnRecord.addEventListener("click", () => {
      if (testerIsRecording) {
        stopTesterRecording();
      } else {
        startTesterRecording();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (testerIsRecording) {
        cleanupTesterRecording();
      }

      if (statusBadge) statusBadge.className = "stt-tester-badge status-transcribing";
      if (testerStatusText) testerStatusText.textContent = "Decoding file...";
      if (outputBox) {
        outputBox.className = "stt-tester-output-box";
        outputBox.innerHTML = `<span style="display: flex; align-items: center; gap: 8px; color: var(--accent-primary);"><span>📁</span> <span>Decoding audio file "${escapeHtmlStr(file.name)}"...</span></span>`;
      }
      if (metricsRow) metricsRow.style.display = "none";
      if (actionsRow) actionsRow.style.display = "none";

      try {
        const arrayBuf = await file.arrayBuffer();
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const decodeCtx = new AudioContextClass();
        const audioBuf = await decodeCtx.decodeAudioData(arrayBuf);
        try { await decodeCtx.close(); } catch {}

        if (statusBadge) statusBadge.className = "stt-tester-badge status-transcribing";
        if (testerStatusText) testerStatusText.textContent = "Transcribing file...";
        if (outputBox) {
          outputBox.innerHTML = `<span style="display: flex; align-items: center; gap: 8px; color: var(--accent-primary);"><span>⏳</span> <span>Transcribing "${escapeHtmlStr(file.name)}" (${audioBuf.duration.toFixed(1)}s) with Moonshine...</span></span>`;
        }

        let channelData;
        if (audioBuf.numberOfChannels === 1) {
          channelData = audioBuf.getChannelData(0);
        } else {
          const ch0 = audioBuf.getChannelData(0);
          const ch1 = audioBuf.getChannelData(1);
          channelData = new Float32Array(audioBuf.length);
          for (let i = 0; i < audioBuf.length; i++) {
            channelData[i] = (ch0[i] + ch1[i]) * 0.5;
          }
        }

        const downsampled = downsampleBuffer(channelData, audioBuf.sampleRate, 16000);
        const wavBuffer = encodeWavBuffer(downsampled, 16000);
        const base64Wav = bufferToBase64(wavBuffer);

        const t0 = performance.now();
        const res = await window.electronAPI.stt.transcribe({
          audioBase64: base64Wav,
          model: sttActiveModelVariant,
        });
        const clientLatency = Math.round(performance.now() - t0);
        handleTesterResult(res, audioBuf.duration, clientLatency);
      } catch (err) {
        console.error("[STT File Test Error]", err);
        if (statusBadge) statusBadge.className = "stt-tester-badge";
        if (testerStatusText) testerStatusText.textContent = "File Error";
        if (outputBox) {
          outputBox.className = "stt-tester-output-box empty";
          outputBox.textContent = `❌ Audio file error: ${err.message}`;
        }
      } finally {
        fileInput.value = "";
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      lastTranscribedText = "";
      if (statusBadge) statusBadge.className = "stt-tester-badge status-ready";
      if (testerStatusText) testerStatusText.textContent = "Ready";
      if (testerTimer) testerTimer.textContent = "00:00.0";
      if (outputBox) {
        outputBox.className = "stt-tester-output-box empty";
        outputBox.textContent = 'Click "Start Live Test" to record speech or select an audio file to benchmark Moonshine ONNX.';
      }
      if (metricsRow) metricsRow.style.display = "none";
      if (actionsRow) actionsRow.style.display = "none";
      if (vuFill) vuFill.style.width = "0%";
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      if (!lastTranscribedText) return;
      try {
        await navigator.clipboard.writeText(lastTranscribedText);
        showPluginToast("📋 Transcript copied to clipboard!");
        const origHtml = btnCopy.innerHTML;
        btnCopy.innerHTML = "<span>✓ Copied!</span>";
        setTimeout(() => { btnCopy.innerHTML = origHtml; }, 2000);
      } catch (err) {
        showPluginToast(`Copy failed: ${err.message}`, true);
      }
    });
  }

  if (btnInsertChat) {
    btnInsertChat.addEventListener("click", () => {
      if (!lastTranscribedText) return;
      if (userInput) {
        if (userInput.value && !userInput.value.endsWith(" ")) {
          userInput.value += " " + lastTranscribedText;
        } else {
          userInput.value = (userInput.value || "") + lastTranscribedText;
        }
        if (typeof adjustTextareaHeight === "function") adjustTextareaHeight();
        userInput.focus();
        userInput.setSelectionRange(userInput.value.length, userInput.value.length);
        showPluginToast("💬 Transcript inserted into chat prompt!");
      }
    });
  }

  async function refreshSTTModelStatus() {
    try {
      const res = await fetch("/api/stt/model-status");
      const data = await res.json();
      if (!data) return;

      if (data.isDownloading) {
        if (statusText) statusText.textContent = "⏳ Downloading Moonshine ONNX model...";
        if (btnDownload) {
          btnDownload.disabled = true;
          btnDownload.textContent = "⏳ Downloading...";
        }
        if (btnDelete) btnDelete.style.display = "none";
        if (data.currentProgress) updateSTTDownloadProgressUI(data.currentProgress);
        return;
      }

      if (data.downloaded) {
        const sizeMb = data.totalSizeBytes ? Math.round(data.totalSizeBytes / (1024 * 1024)) : 27;
        if (statusText) statusText.textContent = `✅ Ready (${sizeMb} MB on disk - ${data.activeModel || sttActiveModelVariant})`;
        if (btnDownload) {
          btnDownload.textContent = "✅ Ready";
          btnDownload.disabled = true;
          btnDownload.classList.remove("btn-primary");
          btnDownload.classList.add("btn-secondary");
        }
        if (btnDelete) btnDelete.style.display = "inline-flex";
        const wrap = document.getElementById("stt-download-progress-wrap");
        if (wrap) wrap.style.display = "none";
      } else {
        const sizeText = sttActiveModelVariant.includes("tiny") ? "~27MB" : "~65MB";
        if (statusText) statusText.textContent = `⚠️ Model not downloaded (${sizeText} required)`;
        if (btnDownload) {
          btnDownload.textContent = `📥 Download Model (${sizeText})`;
          btnDownload.disabled = false;
          btnDownload.classList.remove("btn-secondary");
          btnDownload.classList.add("btn-primary");
        }
        if (btnDelete) btnDelete.style.display = "none";
        const wrap = document.getElementById("stt-download-progress-wrap");
        if (wrap) wrap.style.display = "none";
      }
    } catch {
      if (statusText) statusText.textContent = "⚠️ Could not check model status";
    }
  }

  if (btnDownload) {
    btnDownload.addEventListener("click", async () => {
      btnDownload.disabled = true;
      btnDownload.textContent = "Connecting...";
      showPluginToast(`Starting Moonshine ${sttActiveModelVariant} download...`);

      const wrap = document.getElementById("stt-download-progress-wrap");
      if (wrap) wrap.style.display = "block";
      updateSTTDownloadProgressUI({
        percent: 15,
        label: `Downloading ${sttActiveModelVariant}`,
        statusText: "Fetching model weights...",
      });

      try {
        const res = await fetch("/api/stt/download-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: sttActiveModelVariant }),
        });
        const data = await res.json();
        if (data.success) {
          showPluginToast("✅ Moonshine STT Model downloaded and ready!");
          await refreshSTTModelStatus();
        } else {
          showPluginToast(`❌ Download failed: ${data.error || "Unknown error"}`, true);
          await refreshSTTModelStatus();
        }
      } catch (err) {
        showPluginToast(`❌ Download error: ${err.message}`, true);
        await refreshSTTModelStatus();
      }
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      const ok = confirm("Are you sure you want to remove the Moonshine model files? You will need to re-download them to use voice input.");
      if (!ok) return;

      btnDelete.disabled = true;
      btnDelete.textContent = "Deleting...";
      try {
        const res = await fetch("/api/stt/delete-model", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          showPluginToast("🗑️ Moonshine model files removed from disk");
          await refreshSTTModelStatus();
        } else {
          showPluginToast(`❌ Failed to delete: ${data.error || "Unknown error"}`, true);
        }
      } catch (err) {
        showPluginToast(`❌ Delete error: ${err.message}`, true);
      } finally {
        btnDelete.disabled = false;
        btnDelete.textContent = "🗑️ Delete Model";
      }
    });
  }

  refreshSTTModelStatus();
}

function setSidebarCollapsed(collapsed) {
  const isCurrentlyCollapsed = appLayout.classList.contains("sidebar-collapsed");
  const shouldCollapse = collapsed !== undefined ? Boolean(collapsed) : !isCurrentlyCollapsed;
  if (shouldCollapse) {
    appLayout.classList.add("sidebar-collapsed");
    document.body.classList.add("sidebar-collapsed");
  } else {
    appLayout.classList.remove("sidebar-collapsed");
    document.body.classList.remove("sidebar-collapsed");
  }
}

if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener("click", () => setSidebarCollapsed());
}

if (sidebarCloseBtn) {
  sidebarCloseBtn.addEventListener("click", () => setSidebarCollapsed(true));
}

const sidebarBackdrop = document.getElementById("sidebar-backdrop");
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", () => setSidebarCollapsed(true));
}

// ─── Navigation Tabs ────────────────────────────────────────────────

const tabTitles = {
  "tab-chat": "Chat",
  "tab-kb": "Knowledge Base",
  "tab-sandbox": "Artifacts & Workspace",
};

function switchTab(targetId) {
  // Settings is now a modal — ignore if somehow called
  if (targetId === "tab-settings") {
    openSettingsModal();
    return;
  }

  navItems.forEach((t) => t.classList.toggle("active", t.dataset.tab === targetId));
  tabViews.forEach((v) => v.classList.toggle("active", v.id === targetId));

  if (currentViewTitle) {
    if (window.AIPlateI18n) {
      if (targetId === "tab-chat") currentViewTitle.textContent = window.AIPlateI18n.t("topbar.chat");
      else if (targetId === "tab-kb") currentViewTitle.textContent = window.AIPlateI18n.t("topbar.kb");
      else if (targetId === "tab-sandbox") currentViewTitle.textContent = window.AIPlateI18n.t("topbar.artifacts");
      else currentViewTitle.textContent = tabTitles[targetId] || "AI Plate";
    } else {
      currentViewTitle.textContent = tabTitles[targetId] || "AI Plate";
    }
  }

  // Show floating input dock only in Chat view
  if (targetId === "tab-chat") {
    dockContainer.style.display = "flex";
    userInput.focus();
    scrollToBottom(true);
    if (unvisitedDoneSessions.has(currentSessionId)) {
      unvisitedDoneSessions.delete(currentSessionId);
      loadSessions();
    }
    updateWorkspaceTabsUnvisitedDots();
  } else {
    dockContainer.style.display = "none";
    updateWorkspaceTabsUnvisitedDots();
  }

  if (targetId === "tab-kb") loadKnowledgeBase();
  if (targetId === "tab-sandbox") {
    loadArtifacts();
    loadSandboxFiles();
  }

  // Close sidebar on mobile
  if (window.innerWidth < 768) {
    setSidebarCollapsed(true);
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", () => switchTab(item.dataset.tab));
});

// ─── Settings Modal Open/Close ──────────────────────────────────────

const settingsModal = document.getElementById("settings-modal");
const settingsModalClose = document.getElementById("settings-modal-close");

function openSettingsModal() {
  loadGeneralSettingsAndDossier();
  populateSettings();
  loadSkills();
  loadPlugins();
  loadSecuritySettings();
  loadConnectors();
  loadSystemConfig();
  settingsModal.classList.remove("hidden");
  // Force reflow so the transition triggers
  void settingsModal.offsetWidth;
  settingsModal.classList.add("visible");

  const btnSidebarSettings = document.getElementById("btn-sidebar-settings");
  if (btnSidebarSettings) btnSidebarSettings.classList.add("active");

  // Close sidebar on mobile when opening settings
  if (window.innerWidth < 768) {
    setSidebarCollapsed(true);
  }
}

function closeSettingsModal() {
  settingsModal.classList.remove("visible");
  const btnSidebarSettings = document.getElementById("btn-sidebar-settings");
  if (btnSidebarSettings) btnSidebarSettings.classList.remove("active");

  // After transition ends, hide completely
  setTimeout(() => {
    if (!settingsModal.classList.contains("visible")) {
      settingsModal.classList.add("hidden");
    }
  }, 280);
}

// ─── Settings Modal Sub-Tabs (Models vs Plugins vs Connectors vs Security) ───
const settingsTabBtns = document.querySelectorAll(".settings-tab-btn");
const settingsTabPanes = document.querySelectorAll(".settings-tab-pane");
const settingsViewTitle = document.getElementById("settings-view-title");
const settingsViewDesc = document.getElementById("settings-view-desc");

const settingsTabMeta = {
  "tab-settings-general": {
    title: "General & Personal Memory",
    desc: "Personalize your butler, configure language & chat interactions, and manage your sovereign Living Dossier.",
  },
  "tab-settings-models": {
    title: "Models & Reasoning",
    desc: "Configure active AI providers, reasoning models, and vector embedding options.",
  },
  "tab-settings-skills": {
    title: "Skills & Cognitive Directives",
    desc: "Modular reasoning scripts (e.g. humanizer, superpowers TDD & debugging) that shape how the LLM thinks, verifies, and formulates answers.",
  },
  "tab-settings-plugins": {
    title: "Plugins & Tools",
    desc: "Real-time hot plug & play tool capabilities for agent execution.",
  },
  "tab-settings-connectors": {
    title: "App Connectors & Integrations",
    desc: "Connect to external applications (Blender 3D, OBS Studio, ComfyUI) and control them via AI agent tool calls.",
  },
  "tab-settings-security": {
    title: "Security & Permissions",
    desc: "Manage automated agent permissions, risk boundaries, and interactive approval requests.",
  },
  "tab-settings-system-config": {
    title: "System Configuration & Secrets",
    desc: "Directly view, modify, and hot-reload config.yaml engine knobs and .env credentials.",
  },
};

function switchSettingsTab(targetTabId) {
  settingsTabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.settingsTab === targetTabId);
  });
  settingsTabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === targetTabId);
  });

  if (settingsTabMeta[targetTabId]) {
    if (settingsViewTitle) settingsViewTitle.textContent = settingsTabMeta[targetTabId].title;
    if (settingsViewDesc) settingsViewDesc.textContent = settingsTabMeta[targetTabId].desc;
  }

  if (targetTabId === "tab-settings-general") {
    loadGeneralSettingsAndDossier();
  }
  if (targetTabId === "tab-settings-models") {
    populateSettings();
  }
  if (targetTabId === "tab-settings-skills") {
    loadSkills();
  }
  if (targetTabId === "tab-settings-plugins") {
    loadPlugins();
  }
  if (targetTabId === "tab-settings-connectors") {
    loadConnectors();
  }
  if (targetTabId === "tab-settings-security") {
    loadSecuritySettings();
  }
  if (targetTabId === "tab-settings-system-config") {
    loadSystemConfig();
  }
}

// ─── General Settings & Sovereign Living Dossier ───────────────────────

let currentDossierData = {
  facts: [],
  reflections: [],
  settings: {},
  rawDossier: "",
  profilePath: "",
};

async function loadGeneralSettingsAndDossier() {
  try {
    let data;
    if (window.electronAPI && window.electronAPI.personalMemory) {
      data = await window.electronAPI.personalMemory.getProfile();
    } else {
      data = {
        success: true,
        facts: [],
        reflections: [],
        settings: {
          ui_language: localStorage.getItem("ai_plate_ui_language") || "en",
          response_language: localStorage.getItem("ai_plate_response_language") || "match_ui",
          user_name: localStorage.getItem("ai_plate_user_name") || "",
          butler_tone: localStorage.getItem("ai_plate_butler_tone") || "butler",
          send_shortcut: localStorage.getItem("ai_plate_send_shortcut") || "enter",
          token_streaming: localStorage.getItem("ai_plate_token_streaming") !== "false",
          auto_scroll: localStorage.getItem("ai_plate_auto_scroll") !== "false",
          audio_cues: localStorage.getItem("ai_plate_audio_cues") !== "false",
          auto_learn: localStorage.getItem("ai_plate_auto_learn") !== "false",
          close_action: localStorage.getItem("ai_plate_close_action") || "tray",
          confirm_quit: localStorage.getItem("ai_plate_confirm_quit") === "true",
          launch_startup: localStorage.getItem("ai_plate_launch_startup") === "true",
          start_minimized: localStorage.getItem("ai_plate_start_minimized") === "true",
          restore_session: localStorage.getItem("ai_plate_restore_session") !== "false",
        },
        rawDossier: "# 👤 Sovereign Personal Dossier\n*Maintained on-device in your sanctuary*\n",
        profilePath: "USER_PROFILE.md",
      };
    }

    if (data && data.success) {
      currentDossierData = data;

      const s = data.settings || {};
      const elUserName = document.getElementById("general-user-name");
      const elButlerTone = document.getElementById("general-butler-tone");
      const elUiLang = document.getElementById("general-ui-language");
      const elRespLang = document.getElementById("general-response-language");
      const elSendShortcut = document.getElementById("general-send-shortcut");
      const elAutoScroll = document.getElementById("general-auto-scroll");
      const elAudioCues = document.getElementById("general-audio-cues");
      const elAutoLearn = document.getElementById("general-auto-learn");
      const elDbPath = document.getElementById("general-db-path");
      const elCloseAction = document.getElementById("general-close-action");
      const elConfirmQuit = document.getElementById("general-confirm-quit");
      const elLaunchStartup = document.getElementById("general-launch-startup");
      const elStartMinimized = document.getElementById("general-start-minimized");
      const elRestoreSession = document.getElementById("general-restore-session");

      if (elUserName && s.user_name !== undefined) elUserName.value = s.user_name;
      if (elButlerTone && s.butler_tone) elButlerTone.value = s.butler_tone;
      if (elUiLang && s.ui_language) {
        elUiLang.value = s.ui_language;
        if (window.AIPlateI18n && window.AIPlateI18n.applyLanguage) {
          window.AIPlateI18n.applyLanguage(s.ui_language);
        }
      }
      if (elRespLang && s.response_language) elRespLang.value = s.response_language;
      if (elSendShortcut && s.send_shortcut) elSendShortcut.value = s.send_shortcut;
      const elTokenStreaming = document.getElementById("general-token-streaming");
      if (elTokenStreaming && s.token_streaming !== undefined) elTokenStreaming.checked = Boolean(s.token_streaming);
      if (elAutoScroll && s.auto_scroll !== undefined) elAutoScroll.checked = Boolean(s.auto_scroll);
      if (elAudioCues && s.audio_cues !== undefined) elAudioCues.checked = Boolean(s.audio_cues);
      if (elAutoLearn && s.auto_learn !== undefined) elAutoLearn.checked = Boolean(s.auto_learn);
      if (elCloseAction && s.close_action) elCloseAction.value = s.close_action;
      if (elConfirmQuit && s.confirm_quit !== undefined) elConfirmQuit.checked = Boolean(s.confirm_quit);
      if (elStartMinimized && s.start_minimized !== undefined) elStartMinimized.checked = Boolean(s.start_minimized);
      if (elRestoreSession && s.restore_session !== undefined) elRestoreSession.checked = Boolean(s.restore_session);

      if (elLaunchStartup) {
        if (window.electronAPI && window.electronAPI.general && window.electronAPI.general.getStartupSettings) {
          window.electronAPI.general.getStartupSettings().then((startup) => {
            if (startup && startup.openAtLogin !== undefined) {
              elLaunchStartup.checked = Boolean(startup.openAtLogin);
            }
          }).catch(() => {});
        } else if (s.launch_startup !== undefined) {
          elLaunchStartup.checked = Boolean(s.launch_startup);
        }
      }

      if (elDbPath && data.profilePath) {
        elDbPath.value = data.profilePath.replace("USER_PROFILE.md", "agent_data.db");
      }

      if (s.send_shortcut) {
        localStorage.setItem("ai_plate_send_shortcut", s.send_shortcut);
        updateDockSendHint();
      }

      renderDossierFacts(data.facts || []);
      renderDossierReflections(data.reflections || []);
      renderDossierMarkdown(data.rawDossier || "");
    }
  } catch (err) {
    console.error("Failed to load general settings and dossier:", err);
  }
}

function renderDossierFacts(facts) {
  const container = document.getElementById("dossier-facts-container");
  const badge = document.getElementById("dossier-facts-badge");
  if (badge) badge.textContent = String(facts.length);

  if (!container) return;

  if (!facts || facts.length === 0) {
    container.innerHTML = `
      <div class="dossier-empty-state">
        <span class="empty-icon">🪪</span>
        <p>No personal facts recorded yet. Introduce yourself in chat (e.g. <em>"My name is Alex"</em>) or click <strong>+ Add Fact</strong>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = facts
    .map((f) => {
      const catClass = `cat-${f.category || "preference"}`;
      const catLabel = (f.category || "preference").toUpperCase();
      const updatedDate = f.updated_at ? new Date(f.updated_at).toLocaleDateString() : "";
      return `
        <div class="dossier-fact-item" data-fact-id="${f.id}">
          <div class="fact-item-left">
            <span class="fact-category-badge ${catClass}">${escapeHtmlStr(catLabel)}</span>
            <div class="fact-content-wrap">
              <span class="fact-item-title">${escapeHtmlStr(f.fact_value)}</span>
              <span class="fact-item-meta">Key: <code>${escapeHtmlStr(f.fact_key)}</code> • Conf: ${Math.round((f.confidence || 1) * 100)}% • ${updatedDate}</span>
            </div>
          </div>
          <div class="fact-item-right">
            <span class="fact-importance-pill" title="Importance score">${f.importance || 5}/10</span>
            <button type="button" class="btn-delete-fact" data-fact-id="${f.id}" title="Forget this fact">🗑️</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderDossierReflections(reflections) {
  const container = document.getElementById("dossier-reflections-container");
  const badge = document.getElementById("dossier-reflections-badge");
  if (badge) badge.textContent = String(reflections.length);

  if (!container) return;

  if (!reflections || reflections.length === 0) {
    container.innerHTML = `
      <div class="dossier-empty-state">
        <span class="empty-icon">🧠</span>
        <p>The reflection engine will synthesize working style insights as you talk to your butler.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = reflections
    .map((r) => {
      const confPercent = Math.round((r.confidence || 0.85) * 100);
      return `
        <div class="dossier-reflection-item" data-reflection-id="${r.id}">
          <div style="flex: 1; min-width: 0;">
            <div class="reflection-title-row">
              <span class="reflection-title">💡 ${escapeHtmlStr(r.title)}</span>
              <span class="reflection-confidence-tag">${confPercent}% Confidence</span>
              <span class="fact-importance-pill">${r.importance || 7}/10</span>
            </div>
            <p class="reflection-insight">${escapeHtmlStr(r.insight)}</p>
          </div>
          <button type="button" class="btn-delete-fact" data-reflection-id="${r.id}" title="Dismiss this reflection">✕</button>
        </div>
      `;
    })
    .join("");
}

function updateDockSendHint() {
  const sendShortcut = localStorage.getItem("ai_plate_send_shortcut") || "enter";
  const dockHintEl = document.querySelector(".dock-hint span kbd:first-child");
  if (dockHintEl) {
    dockHintEl.textContent = sendShortcut === "ctrl_enter" ? "Ctrl+Enter" : "Enter";
  }
}

function renderDossierMarkdown(rawMarkdown) {
  const el = document.getElementById("dossier-markdown-content");
  if (el) {
    el.textContent = rawMarkdown || "# 👤 Sovereign Personal Dossier\n*No dossier generated yet.*\n";
  }
}

async function saveGeneralSetting(key, val) {
  try {
    localStorage.setItem(`ai_plate_${key}`, String(val));
    if (window.electronAPI && window.electronAPI.general) {
      await window.electronAPI.general.update(key, String(val));
    }
  } catch (err) {
    console.error(`Failed to save setting ${key}:`, err);
  }
}

// ─── Setup General Settings & Dossier Event Listeners ─────────────────
function initGeneralSettingsEvents() {
  if (initGeneralSettingsEvents._initialized) return;
  initGeneralSettingsEvents._initialized = true;
  const elUserName = document.getElementById("general-user-name");
  const elButlerTone = document.getElementById("general-butler-tone");
  const elUiLang = document.getElementById("general-ui-language");
  const elRespLang = document.getElementById("general-response-language");
  const elSendShortcut = document.getElementById("general-send-shortcut");
  const elAutoScroll = document.getElementById("general-auto-scroll");
  const elAudioCues = document.getElementById("general-audio-cues");
  const elAutoLearn = document.getElementById("general-auto-learn");
  const elCloseAction = document.getElementById("general-close-action");
  const elConfirmQuit = document.getElementById("general-confirm-quit");
  const elLaunchStartup = document.getElementById("general-launch-startup");
  const elStartMinimized = document.getElementById("general-start-minimized");
  const elRestoreSession = document.getElementById("general-restore-session");
  const btnQuitAppNow = document.getElementById("btn-quit-app-now");
  const btnCopyDb = document.getElementById("btn-copy-db-path");
  const btnExportSanctuary = document.getElementById("btn-export-sanctuary");
  const btnClearChatCache = document.getElementById("btn-clear-chat-cache");
  const btnOpenDossier = document.getElementById("btn-open-dossier-file");
  const btnAddFact = document.getElementById("btn-add-fact-trigger");
  const modalAddFact = document.getElementById("modal-add-fact");
  const btnCloseFactModal = document.getElementById("btn-close-fact-modal");
  const btnCancelFactModal = document.getElementById("btn-cancel-fact-modal");
  const formAddFact = document.getElementById("form-add-fact");
  const factImportanceSlider = document.getElementById("fact-importance");
  const factImportanceVal = document.getElementById("fact-importance-val");

  if (elUserName) {
    elUserName.addEventListener("change", () => saveGeneralSetting("user_name", elUserName.value.trim()));
    elUserName.addEventListener("blur", () => saveGeneralSetting("user_name", elUserName.value.trim()));
  }

  if (elButlerTone) {
    elButlerTone.addEventListener("change", () => saveGeneralSetting("butler_tone", elButlerTone.value));
  }

  if (elUiLang) {
    elUiLang.addEventListener("change", () => {
      saveGeneralSetting("ui_language", elUiLang.value);
      localStorage.setItem("ai_plate_ui_language", elUiLang.value);
      if (window.AIPlateI18n && window.AIPlateI18n.applyLanguage) {
        window.AIPlateI18n.applyLanguage(elUiLang.value);
      }
    });
  }

  if (elRespLang) {
    elRespLang.addEventListener("change", () => saveGeneralSetting("response_language", elRespLang.value));
  }

  if (elSendShortcut) {
    elSendShortcut.addEventListener("change", () => {
      saveGeneralSetting("send_shortcut", elSendShortcut.value);
      localStorage.setItem("ai_plate_send_shortcut", elSendShortcut.value);
      updateDockSendHint();
    });
  }

  const elTokenStreaming = document.getElementById("general-token-streaming");
  if (elTokenStreaming) {
    elTokenStreaming.addEventListener("change", () => {
      saveGeneralSetting("token_streaming", elTokenStreaming.checked);
      localStorage.setItem("ai_plate_token_streaming", elTokenStreaming.checked);
    });
  }

  if (elAutoScroll) {
    elAutoScroll.addEventListener("change", () => saveGeneralSetting("auto_scroll", elAutoScroll.checked));
  }

  if (elAudioCues) {
    elAudioCues.addEventListener("change", () => saveGeneralSetting("audio_cues", elAudioCues.checked));
  }

  if (elAutoLearn) {
    elAutoLearn.addEventListener("change", () => saveGeneralSetting("auto_learn", elAutoLearn.checked));
  }

  if (elCloseAction) {
    elCloseAction.addEventListener("change", () => saveGeneralSetting("close_action", elCloseAction.value));
  }

  if (elConfirmQuit) {
    elConfirmQuit.addEventListener("change", () => saveGeneralSetting("confirm_quit", elConfirmQuit.checked));
  }

  if (elLaunchStartup) {
    elLaunchStartup.addEventListener("change", async () => {
      const openAtLogin = elLaunchStartup.checked;
      const openAsHidden = elStartMinimized ? elStartMinimized.checked : false;
      saveGeneralSetting("launch_startup", openAtLogin);
      if (window.electronAPI && window.electronAPI.general && window.electronAPI.general.setStartupSettings) {
        await window.electronAPI.general.setStartupSettings({ openAtLogin, openAsHidden });
      }
    });
  }

  if (elStartMinimized) {
    elStartMinimized.addEventListener("change", async () => {
      const openAsHidden = elStartMinimized.checked;
      saveGeneralSetting("start_minimized", openAsHidden);
      const openAtLogin = elLaunchStartup ? elLaunchStartup.checked : false;
      if (openAtLogin && window.electronAPI && window.electronAPI.general && window.electronAPI.general.setStartupSettings) {
        await window.electronAPI.general.setStartupSettings({ openAtLogin, openAsHidden });
      }
    });
  }

  if (elRestoreSession) {
    elRestoreSession.addEventListener("change", () => saveGeneralSetting("restore_session", elRestoreSession.checked));
  }

  if (btnQuitAppNow) {
    btnQuitAppNow.addEventListener("click", async () => {
      const confirmQuitSetting = elConfirmQuit ? elConfirmQuit.checked : false;
      if (confirmQuitSetting) {
        const confirmed = await showThemedConfirm({
          title: "Quit AI Plate",
          message: "Are you sure you want to terminate all background sessions and quit AI Plate?",
          confirmText: "Quit AI Plate",
          confirmLevel: "danger",
        });
        if (!confirmed) return;
      }
      if (window.electronAPI && window.electronAPI.general && window.electronAPI.general.quitApp) {
        await window.electronAPI.general.quitApp(true);
      } else {
        window.close();
      }
    });
  }

  // Copy DB Path
  if (btnCopyDb) {
    btnCopyDb.addEventListener("click", () => {
      const el = document.getElementById("general-db-path");
      if (el && el.value) {
        navigator.clipboard.writeText(el.value);
        const originalText = btnCopyDb.textContent;
        btnCopyDb.textContent = "✔ Copied!";
        setTimeout(() => { btnCopyDb.textContent = originalText; }, 1800);
      }
    });
  }

  // Reveal Dossier File in OS
  if (btnOpenDossier) {
    btnOpenDossier.addEventListener("click", async () => {
      if (window.electronAPI && window.electronAPI.personalMemory) {
        await window.electronAPI.personalMemory.revealFile();
      }
    });
  }

  // Refresh Dossier
  const btnRefreshDossier = document.getElementById("btn-refresh-dossier");
  if (btnRefreshDossier) {
    btnRefreshDossier.addEventListener("click", async () => {
      btnRefreshDossier.innerHTML = "<span>🔄 Refreshing...</span>";
      await loadGeneralSettingsAndDossier();
      btnRefreshDossier.innerHTML = "<span>✔ Refreshed</span>";
      setTimeout(() => { btnRefreshDossier.innerHTML = "<span>🔄 Refresh</span>"; }, 1500);
    });
  }

  // Wipe Dossier & Personal Memory
  const btnWipeDossier = document.getElementById("btn-wipe-dossier");
  if (btnWipeDossier) {
    btnWipeDossier.addEventListener("click", async () => {
      const confirmed = await showThemedConfirm({
        title: "Wipe Personal Memory Sanctuary",
        message: "This will permanently delete all learned personal facts and synthesized reflections from USER_PROFILE.md and your local database. General UI settings will remain. Proceed?",
        confirmText: "Wipe Memory",
        icon: "🗑️",
        danger: true,
      });
      if (confirmed) {
        try {
          if (window.electronAPI && window.electronAPI.personalMemory && window.electronAPI.personalMemory.wipe) {
            await window.electronAPI.personalMemory.wipe();
          }
          await loadGeneralSettingsAndDossier();
          showToast("Personal memory sanctuary wiped", "info");
        } catch (err) {
          showToast("Failed to wipe personal memory: " + err.message, "error");
        }
      }
    });
  }

  // Export Sanctuary Data
  if (btnExportSanctuary) {
    btnExportSanctuary.addEventListener("click", () => {
      const exportBlob = new Blob([JSON.stringify(currentDossierData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(exportBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai_plate_sanctuary_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Clear Session Cache in Storage & Data Sanctuary
  let isClearingSessionCache = false;

  async function clearSessionCache() {
    if (isClearingSessionCache) return;

    const confirmed = await showThemedConfirm({
      title: "Clear Session Cache",
      message: "This will clear temporary conversation history and cached session turns from your local SQLite database, while preserving all permanent Living Dossier facts, settings, and skills. Proceed?",
      confirmText: "Clear Cache",
      icon: "🧹",
      danger: true,
    });
    if (!confirmed) return;

    isClearingSessionCache = true;
    const btn = document.getElementById("btn-clear-chat-cache");
    if (btn) {
      btn.innerHTML = "<span>🧹 Clearing...</span>";
      btn.disabled = true;
    }

    try {
      // 1. Abort any running session execution
      if (typeof runningSessions !== "undefined" && runningSessions.has(currentSessionId)) {
        if (typeof stopExecution === "function") {
          try { await stopExecution(currentSessionId); } catch {}
        }
      }

      // 2. Call backend to clear all session cache with 4s timeout safeguard
      try {
        if (window.electronAPI && window.electronAPI.chat && window.electronAPI.chat.clearCache) {
          await Promise.race([
            window.electronAPI.chat.clearCache({ allSessions: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000)),
          ]);
        } else {
          await Promise.race([
            fetch("/api/sessions/clear-cache", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ allSessions: true }),
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000)),
          ]);
        }
      } catch (backendErr) {
        console.warn("Backend cache purge warning:", backendErr);
      }

      // 3. Reset client-side active session state
      currentSessionId = "default";
      sessionModes.clear();
      dirtySessionModes.clear();
      syncChatModeSelector();
      localStorage.setItem("ai_plate_active_session", "default");

      // 4. Clear chat messages DOM and restore welcome hero
      if (chatMessages) {
        chatMessages.innerHTML = "";
      }
      if (chatHero) {
        chatHero.classList.remove("hidden");
      }

      // 5. Reset tokens and counters
      currentSessionHistoryTokens = 0;
      currentSessionTurnsCount = 0;
      currentTokensSaved = 0;
      updateContextTokensUI();
      if (typeof refreshSessionContextTokens === "function") {
        try { refreshSessionContextTokens("default"); } catch {}
      }

      // 6. Reload sessions sidebar
      if (typeof loadSessions === "function") {
        try { await loadSessions(); } catch {}
      }
      if (typeof updateDockControlsForSession === "function") {
        try { updateDockControlsForSession("default"); } catch {}
      }

      // 7. Feedback
      showToast("Session cache cleared successfully", "success");
      if (btn) {
        btn.innerHTML = "<span>✔ Cleared!</span>";
      }
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.error("Failed to clear session cache:", err);
      showToast("Failed to clear session cache: " + err.message, "error");
    } finally {
      isClearingSessionCache = false;
      const finalBtn = document.getElementById("btn-clear-chat-cache");
      if (finalBtn) {
        finalBtn.innerHTML = "<span>🧹 Clear Session Cache</span>";
        finalBtn.disabled = false;
      }
    }
  }

  window.clearSessionCache = clearSessionCache;
  window.resetChatSession = clearSessionCache;

  if (btnClearChatCache) {
    btnClearChatCache.onclick = clearSessionCache;
  }

  // Dossier View Pills Switching
  document.querySelectorAll(".dossier-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const view = pill.getAttribute("data-dossier-view");
      document.querySelectorAll(".dossier-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      document.querySelectorAll(".dossier-view-pane").forEach((pane) => pane.classList.remove("active"));
      const targetPane = document.getElementById(`dossier-view-${view}`);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  // Add Fact Modal
  if (btnAddFact && modalAddFact) {
    btnAddFact.addEventListener("click", () => {
      modalAddFact.classList.remove("hidden");
      void modalAddFact.offsetWidth;
      modalAddFact.classList.add("visible");
      const firstInput = document.getElementById("fact-key");
      if (firstInput) firstInput.focus();
    });
  }

  const closeFactModal = () => {
    if (modalAddFact) {
      modalAddFact.classList.remove("visible");
      setTimeout(() => modalAddFact.classList.add("hidden"), 200);
      if (formAddFact) formAddFact.reset();
      if (factImportanceVal) factImportanceVal.textContent = "8/10";
    }
  };

  if (btnCloseFactModal) btnCloseFactModal.addEventListener("click", closeFactModal);
  if (btnCancelFactModal) btnCancelFactModal.addEventListener("click", closeFactModal);

  if (factImportanceSlider && factImportanceVal) {
    factImportanceSlider.addEventListener("input", () => {
      factImportanceVal.textContent = `${factImportanceSlider.value}/10`;
    });
  }

  // Add Fact Form Submit
  if (formAddFact) {
    formAddFact.addEventListener("submit", async (e) => {
      e.preventDefault();
      const category = document.getElementById("fact-category")?.value || "preference";
      const factKey = document.getElementById("fact-key")?.value?.trim() || "";
      const factValue = document.getElementById("fact-value")?.value?.trim() || "";
      const importance = Number(factImportanceSlider?.value || 8);

      if (!factKey || !factValue) return;

      if (window.electronAPI && window.electronAPI.personalMemory) {
        await window.electronAPI.personalMemory.commitFact({ category, factKey, factValue, importance });
      }

      closeFactModal();
      await loadGeneralSettingsAndDossier();
    });
  }

  // Delete Fact Delegation
  const factsContainer = document.getElementById("dossier-facts-container");
  if (factsContainer) {
    factsContainer.addEventListener("click", async (e) => {
      const delBtn = e.target.closest(".btn-delete-fact");
      if (!delBtn) return;
      const factId = delBtn.getAttribute("data-fact-id");
      if (factId && window.electronAPI && window.electronAPI.personalMemory) {
        await window.electronAPI.personalMemory.deleteFact(Number(factId));
        await loadGeneralSettingsAndDossier();
      }
    });
  }

  // Delete Reflection Delegation
  const reflectionsContainer = document.getElementById("dossier-reflections-container");
  if (reflectionsContainer) {
    reflectionsContainer.addEventListener("click", async (e) => {
      const delBtn = e.target.closest(".btn-delete-fact");
      if (!delBtn) return;
      const reflId = delBtn.getAttribute("data-reflection-id");
      if (reflId && window.electronAPI && window.electronAPI.personalMemory) {
        await window.electronAPI.personalMemory.deleteReflection(Number(reflId));
        await loadGeneralSettingsAndDossier();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initGeneralSettingsEvents();
  loadGeneralSettingsAndDossier();
});
setTimeout(() => {
  initGeneralSettingsEvents();
  loadGeneralSettingsAndDossier();
}, 200);

// ─── System Configuration (.env & config.yaml) Manager ─────────────────

let currentSysConfigData = {
  activeType: "yaml", // "yaml" | "env"
  yamlContent: "",
  yamlPath: "",
  envContent: "",
  envPath: "",
  isDirty: false,
};

async function loadSystemConfig() {
  const textarea = document.getElementById("sysconfig-editor-textarea");
  const pathLabel = document.getElementById("sysconfig-active-path");
  const statusBadge = document.getElementById("sysconfig-status-badge");

  try {
    if (statusBadge) {
      statusBadge.textContent = "Loading...";
      statusBadge.className = "sysconfig-status-badge status-ready";
    }

    let data;
    if (window.electronAPI && window.electronAPI.systemConfig && typeof window.electronAPI.systemConfig.read === "function") {
      data = await window.electronAPI.systemConfig.read();
    } else {
      const res = await fetch("/api/system-config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }

    currentSysConfigData.yamlContent = data.configYaml || "";
    currentSysConfigData.yamlPath = data.configYamlPath || "";
    currentSysConfigData.envContent = data.env || "";
    currentSysConfigData.envPath = data.envPath || "";
    currentSysConfigData.isDirty = false;

    renderActiveSysConfigFile();
  } catch (err) {
    console.error("Failed to fetch system config:", err);
    if (pathLabel) pathLabel.textContent = "Error loading config files: " + err.message;
    if (statusBadge) {
      statusBadge.textContent = "Error";
      statusBadge.className = "sysconfig-status-badge status-modified";
    }
  }
}

function renderActiveSysConfigFile() {
  const textarea = document.getElementById("sysconfig-editor-textarea");
  const pathLabel = document.getElementById("sysconfig-active-path");
  const statusBadge = document.getElementById("sysconfig-status-badge");
  const pillYaml = document.getElementById("pill-config-yaml");
  const pillEnv = document.getElementById("pill-env");

  const isYaml = currentSysConfigData.activeType === "yaml";

  if (pillYaml) pillYaml.classList.toggle("active", isYaml);
  if (pillEnv) pillEnv.classList.toggle("active", !isYaml);

  if (textarea) {
    textarea.value = isYaml ? currentSysConfigData.yamlContent : currentSysConfigData.envContent;
    updateSysConfigHighlight();
  }
  if (pathLabel) {
    pathLabel.textContent = isYaml ? currentSysConfigData.yamlPath : currentSysConfigData.envPath;
  }
  if (statusBadge) {
    statusBadge.textContent = "Ready";
    statusBadge.className = "sysconfig-status-badge status-ready";
  }
  currentSysConfigData.isDirty = false;
}

function updateSysConfigHighlight() {
  const textarea = document.getElementById("sysconfig-editor-textarea");
  const gutter = document.getElementById("sysconfig-gutter");
  if (!textarea) return;

  const code = textarea.value || "";

  // 1. Line numbers gutter
  if (gutter) {
    const lineCount = (code.match(/\n/g) || []).length + 1;
    let gutterHtml = "";
    for (let i = 1; i <= lineCount; i++) {
      gutterHtml += i + "\n";
    }
    gutter.textContent = gutterHtml;
    gutter.scrollTop = textarea.scrollTop;
  }
}

function sysConfigEscapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function colorizeCodeCustom(code, isYaml) {
  if (isYaml) {
    const lines = code.split("\n");
    return lines.map((line) => {
      const commentIdx = line.indexOf("#");
      if (commentIdx !== -1) {
        const before = line.slice(0, commentIdx);
        const comment = line.slice(commentIdx);
        return colorizeYamlLine(before) + `<span class="token-comment">${sysConfigEscapeHtml(comment)}</span>`;
      }
      return colorizeYamlLine(line);
    }).join("\n");
  } else {
    const lines = code.split("\n");
    return lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("#")) {
        return `<span class="token-comment">${sysConfigEscapeHtml(line)}</span>`;
      }
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx);
        const val = line.slice(eqIdx + 1);
        const isSecret = /KEY|SECRET|TOKEN|PASSWORD|AUTH|API/i.test(key);
        const valClass = isSecret ? "token-env-secret" : "token-env-val";
        return `<span class="token-env-key">${sysConfigEscapeHtml(key)}</span>=<span class="${valClass}">${sysConfigEscapeHtml(val)}</span>`;
      }
      return sysConfigEscapeHtml(line);
    }).join("\n");
  }
}

function colorizeYamlLine(line) {
  if (!line) return "";
  let esc = sysConfigEscapeHtml(line);
  if (/───/.test(esc)) {
    return `<span class="token-section">${esc}</span>`;
  }
  esc = esc.replace(/^(\s*(?:-\s+)?)([a-zA-Z0-9_\-\.]+)(:)/, '$1<span class="token-key">$2</span>$3');
  esc = esc.replace(/:\s+(true|false|null)\b/g, ': <span class="token-boolean">$1</span>');
  esc = esc.replace(/:\s+(-?\d+(?:\.\d+)?)\b/g, ': <span class="token-number">$1</span>');
  esc = esc.replace(/(".*?"|'.*?')/g, '<span class="token-string">$1</span>');
  return esc;
}

function initSystemConfigUI() {
  const textarea = document.getElementById("sysconfig-editor-textarea");
  const highlightLayer = document.querySelector(".sysconfig-highlight-layer");
  const gutter = document.getElementById("sysconfig-gutter");
  const pillYaml = document.getElementById("pill-config-yaml");
  const pillEnv = document.getElementById("pill-env");
  const saveBtn = document.getElementById("sysconfig-save-btn");
  const reloadBtn = document.getElementById("sysconfig-reload-btn");
  const revealBtn = document.getElementById("sysconfig-reveal-btn");
  const openNativeBtn = document.getElementById("sysconfig-open-native-btn");
  const statusBadge = document.getElementById("sysconfig-status-badge");

  if (!textarea) return;

  // Synchronize scrolling between textarea, highlight layer, and line number gutter
  textarea.addEventListener("scroll", () => {
    if (highlightLayer) {
      highlightLayer.scrollTop = textarea.scrollTop;
      highlightLayer.scrollLeft = textarea.scrollLeft;
    }
    if (gutter) {
      gutter.scrollTop = textarea.scrollTop;
    }
  });

  // Enable Tab key for 2-space indentation (essential for YAML)
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      currentSysConfigData.isDirty = true;
      updateSysConfigHighlight();
      if (statusBadge) {
        statusBadge.textContent = "Modified";
        statusBadge.className = "sysconfig-status-badge status-modified";
      }
    }
  });

  textarea.addEventListener("input", () => {
    currentSysConfigData.isDirty = true;
    updateSysConfigHighlight();
    if (statusBadge) {
      statusBadge.textContent = "Modified";
      statusBadge.className = "sysconfig-status-badge status-modified";
    }
  });

  if (pillYaml) {
    pillYaml.addEventListener("click", () => {
      if (currentSysConfigData.activeType === "yaml") return;
      if (currentSysConfigData.isDirty) {
        if (!confirm("You have unsaved changes. Discard them and switch to config.yaml?")) return;
      }
      currentSysConfigData.activeType = "yaml";
      renderActiveSysConfigFile();
    });
  }

  if (pillEnv) {
    pillEnv.addEventListener("click", () => {
      if (currentSysConfigData.activeType === "env") return;
      if (currentSysConfigData.isDirty) {
        if (!confirm("You have unsaved changes. Discard them and switch to .env?")) return;
      }
      currentSysConfigData.activeType = "env";
      renderActiveSysConfigFile();
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      loadSystemConfig();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const isYaml = currentSysConfigData.activeType === "yaml";
      const newContent = textarea.value;

      try {
        if (statusBadge) {
          statusBadge.textContent = "Saving...";
          statusBadge.className = "sysconfig-status-badge status-modified";
        }

        if (window.electronAPI && window.electronAPI.systemConfig && typeof window.electronAPI.systemConfig.save === "function") {
          await window.electronAPI.systemConfig.save({
            fileType: isYaml ? "yaml" : "env",
            content: newContent,
          });
        } else {
          const res = await fetch("/api/system-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileType: isYaml ? "yaml" : "env",
              content: newContent,
            }),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || `HTTP ${res.status}`);
          }
        }

        if (isYaml) {
          currentSysConfigData.yamlContent = newContent;
        } else {
          currentSysConfigData.envContent = newContent;
        }
        currentSysConfigData.isDirty = false;

        if (statusBadge) {
          statusBadge.textContent = "Saved";
          statusBadge.className = "sysconfig-status-badge status-saved";
          setTimeout(() => {
            if (!currentSysConfigData.isDirty && statusBadge) {
              statusBadge.textContent = "Ready";
              statusBadge.className = "sysconfig-status-badge status-ready";
            }
          }, 2500);
        }

        if (typeof showNotificationToast === "function") {
          showNotificationToast(`✔ ${isYaml ? "config.yaml" : ".env"} saved and hot-reloaded!`);
        }
        if (typeof loadStatus === "function") {
          loadStatus();
        }
      } catch (err) {
        alert(`Failed to save: ${err.message}`);
        if (statusBadge) {
          statusBadge.textContent = "Error";
          statusBadge.className = "sysconfig-status-badge status-modified";
        }
      }
    });
  }

  if (revealBtn) {
    revealBtn.addEventListener("click", async () => {
      const isYaml = currentSysConfigData.activeType === "yaml";
      const path = isYaml ? currentSysConfigData.yamlPath : currentSysConfigData.envPath;
      if (window.electronAPI && typeof window.electronAPI.showItemInFolder === "function" && path) {
        await window.electronAPI.showItemInFolder(path);
      } else {
        await fetch("/api/system-config/open-external", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileType: isYaml ? "yaml" : "env", action: "folder" }),
        });
      }
    });
  }

  if (openNativeBtn) {
    openNativeBtn.addEventListener("click", async () => {
      const isYaml = currentSysConfigData.activeType === "yaml";
      const path = isYaml ? currentSysConfigData.yamlPath : currentSysConfigData.envPath;
      if (window.electronAPI && typeof window.electronAPI.openPathExternal === "function" && path) {
        await window.electronAPI.openPathExternal(path);
      } else {
        await fetch("/api/system-config/open-external", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileType: isYaml ? "yaml" : "env", action: "file" }),
        });
      }
    });
  }
}

// ─── Skills & Cognitive Directives Manager ───────────────────────────

let registeredSkills = [];
let currentSkillsFilterMode = "smart_filter";
let activeSkillCategoryFilter = "all";
let skillSearchQuery = "";
let expandedSkillIds = new Set();
let isSkillsUIInitialized = false;

async function loadSkills() {
  const container = document.getElementById("skills-list-container");
  const badge = document.getElementById("skills-active-count");
  const modeTag = document.getElementById("skills-current-mode-tag");
  const modeButtons = document.querySelectorAll("#skills-mode-segmented .seg-btn");

  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.list === "function") {
      data = await window.electronAPI.skills.list();
    } else {
      const res = await fetch("/api/skills");
      data = await res.json();
    }

    if (data && Array.isArray(data.skills)) {
      registeredSkills = data.skills;
      currentSkillsFilterMode = data.filterMode || "smart_filter";

      // Update badge
      const activeCount = registeredSkills.filter((s) => s.enabled).length;
      if (badge) {
        badge.textContent = `${activeCount}/${registeredSkills.length}`;
        badge.style.color = activeCount === 0 ? "var(--danger)" : "var(--success)";
      }

      // Update mode buttons and tag
      if (modeTag) {
        modeTag.textContent = currentSkillsFilterMode === "always_active" ? "🌐 Always Active" : "⚡ Smart Intent Filter";
      }
      modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === currentSkillsFilterMode);
      });

      renderSkills(registeredSkills);
      initSkillsUI();
    }
  } catch (err) {
    console.warn("Failed to load skills:", err);
    if (container) {
      container.innerHTML = `<div style="color: var(--danger); padding: 16px; text-align: center;">Failed to load skills: ${escapeHtmlStr(err.message)}</div>`;
    }
  }
}

function renderSkills(skills) {
  const container = document.getElementById("skills-list-container");
  if (!container) return;

  // Filter by category and search query
  let filtered = skills;
  if (activeSkillCategoryFilter !== "all") {
    filtered = filtered.filter((s) => s.category === activeSkillCategoryFilter);
  }
  if (skillSearchQuery.trim()) {
    const q = skillSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.triggers && s.triggers.some((t) => t.toLowerCase().includes(q)))
    );
  }

  // Update category counts
  const countAll = document.getElementById("skills-cat-count-all");
  if (countAll) countAll.textContent = String(skills.length);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 32px 16px; background: var(--bg-hover); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg);">
        <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px;">No skills matched your search</div>
        <div style="font-size: 12px;">Try adjusting your search query or category filter, or click <strong>+ Create Skill</strong> to add a new one.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  const categoryLabels = {
    writing_voice: "✍️ Writing & Voice",
    engineering_discipline: "🧪 Engineering",
    architecture_planning: "📐 Architecture",
    quality_security: "🛡️ Security & QA",
    reasoning_verification: "🎯 Reasoning",
    custom: "📦 Custom",
  };

  filtered.forEach((skill) => {
    const isExpanded = expandedSkillIds.has(skill.id);
    const card = document.createElement("div");
    card.className = `skill-card ${skill.enabled ? "" : "disabled"}`;
    card.id = `skill-card-${skill.id}`;

    const triggersHtml = (skill.triggers || [])
      .map((tr) => `<span class="skill-trigger-tag">${escapeHtmlStr(tr)}</span>`)
      .join("");

    const refHtml = skill.referenceUrl
      ? `<a href="#" class="skills-inline-link" data-url="${escapeHtmlStr(skill.referenceUrl)}" style="font-size: 11px; margin-left: 6px;" title="View GitHub reference repository">🔗 ${escapeHtmlStr(skill.author || "source")}</a>`
      : "";

    card.innerHTML = `
      <div class="skill-card-header">
        <div class="skill-card-left">
          <div class="skill-card-icon">${renderPluginIcon(skill.icon || "🧠")}</div>
          <div class="skill-card-title-group">
            <div class="skill-title-row">
              <span class="skill-name">${escapeHtmlStr(skill.name)}</span>
              <span class="skill-badge ${skill.isBuiltin ? "skill-badge-builtin" : "skill-badge-custom"}">
                ${skill.isBuiltin ? "⚡ Built-in" : "📦 Custom"}
              </span>
              <span class="skill-category-badge">${categoryLabels[skill.category] || "Skill"}</span>
              ${skill.alwaysActive ? '<span class="skill-always-badge">🌐 Always Active</span>' : ""}
              ${refHtml}
            </div>
            <p class="skill-desc">${escapeHtmlStr(skill.description)}</p>
            ${
              triggersHtml
                ? `
              <div class="skill-triggers-row">
                <span class="skill-trigger-label">Triggers:</span>
                ${triggersHtml}
              </div>
            `
                : ""
            }
          </div>
        </div>
        <div class="skill-card-right">
          <label class="skill-toggle-switch" title="${skill.enabled ? "Disable this skill" : "Enable this skill"}">
            <input type="checkbox" class="skill-toggle-checkbox" data-skill-id="${escapeHtmlStr(skill.id)}" ${skill.enabled ? "checked" : ""} />
            <span class="skill-toggle-slider"></span>
          </label>
          <div class="skill-card-actions">
            ${
              !skill.isBuiltin
                ? `
              <button type="button" class="btn-skill-expand btn-edit-custom-skill" data-skill-id="${escapeHtmlStr(skill.id)}" title="Edit custom skill">
                ✏️ Edit
              </button>
              <button type="button" class="btn-skill-expand btn-delete-custom-skill" data-skill-id="${escapeHtmlStr(skill.id)}" title="Delete custom skill" style="color: var(--danger);">
                🗑️
              </button>
            `
                : ""
            }
            <button type="button" class="btn-skill-expand btn-toggle-skill-expand" data-skill-id="${escapeHtmlStr(skill.id)}">
              <span>${isExpanded ? "▲ Hide Script" : "▼ View Script"}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="skill-card-body ${isExpanded ? "expanded" : ""}" id="skill-body-${skill.id}">
        <div class="skill-script-header">
          <span class="skill-script-title">Cognitive Directives Script:</span>
          <div class="skill-script-actions">
            <button type="button" class="btn btn-secondary btn-xs btn-copy-skill-script" data-skill-id="${escapeHtmlStr(skill.id)}" title="Copy script instructions to clipboard">
              📋 Copy Prompt
            </button>
            <button type="button" class="btn btn-secondary btn-xs btn-export-skill" data-skill-id="${escapeHtmlStr(skill.id)}" title="Export as SKILL.md">
              📤 Export .md
            </button>
          </div>
        </div>
        <pre class="skill-script-content">${escapeHtmlStr(skill.promptInstructions)}</pre>
        <div class="skill-footer-meta">
          <span>${skill.isBuiltin ? "Protected engine directive" : "User-defined custom directive"}</span>
          <span>ID: <code>${escapeHtmlStr(skill.id)}</code></span>
        </div>
      </div>
    `;

    // Wire toggle switch
    const toggle = card.querySelector(".skill-toggle-checkbox");
    if (toggle) {
      toggle.addEventListener("change", async (e) => {
        e.stopPropagation();
        await toggleSkillState(skill.id, toggle.checked);
      });
    }

    // Wire expand button
    const btnExpand = card.querySelector(".btn-toggle-skill-expand");
    if (btnExpand) {
      btnExpand.addEventListener("click", (e) => {
        e.stopPropagation();
        const body = card.querySelector(".skill-card-body");
        if (body) {
          const nowExpanded = body.classList.toggle("expanded");
          if (nowExpanded) {
            expandedSkillIds.add(skill.id);
            btnExpand.innerHTML = "<span>▲ Hide Script</span>";
          } else {
            expandedSkillIds.delete(skill.id);
            btnExpand.innerHTML = "<span>▼ View Script</span>";
          }
        }
      });
    }

    // Wire copy button
    const btnCopy = card.querySelector(".btn-copy-skill-script");
    if (btnCopy) {
      btnCopy.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(skill.promptInstructions);
          showPluginToast(`📋 Copied script for "${skill.name}" to clipboard!`);
        } catch {
          showPluginToast("Failed to copy to clipboard", true);
        }
      });
    }

    // Wire export button
    const btnExport = card.querySelector(".btn-export-skill");
    if (btnExport) {
      btnExport.addEventListener("click", async (e) => {
        e.stopPropagation();
        await exportSkillMarkdown(skill.id);
      });
    }

    // Wire edit button (custom skills)
    const btnEdit = card.querySelector(".btn-edit-custom-skill");
    if (btnEdit) {
      btnEdit.addEventListener("click", (e) => {
        e.stopPropagation();
        openSkillEditor(skill);
      });
    }

    // Wire delete button (custom skills)
    const btnDelete = card.querySelector(".btn-delete-custom-skill");
    if (btnDelete) {
      btnDelete.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = confirm(`Are you sure you want to delete custom skill "${skill.name}"?`);
        if (confirmed) {
          await deleteCustomSkill(skill.id);
        }
      });
    }

    // Wire inline links
    card.querySelectorAll(".skills-inline-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = link.dataset.url;
        if (url) {
          if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
          } else {
            window.open(url, "_blank");
          }
        }
      });
    });

    container.appendChild(card);
  });
}

async function toggleSkillState(id, enabled) {
  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.toggle === "function") {
      data = await window.electronAPI.skills.toggle(id, enabled);
    } else {
      const res = await fetch("/api/skills/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      data = await res.json();
    }

    if (data && data.success) {
      registeredSkills = data.skills;
      const badge = document.getElementById("skills-active-count");
      const activeCount = registeredSkills.filter((s) => s.enabled).length;
      if (badge) {
        badge.textContent = `${activeCount}/${registeredSkills.length}`;
        badge.style.color = activeCount === 0 ? "var(--danger)" : "var(--success)";
      }
      renderSkills(registeredSkills);
      showPluginToast(`Skill "${id}" ${enabled ? "activated" : "deactivated"}.`);
    }
  } catch (err) {
    showPluginToast(`Failed to toggle skill: ${err.message}`, true);
  }
}

async function setSkillFilterMode(mode) {
  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.setFilterMode === "function") {
      data = await window.electronAPI.skills.setFilterMode(mode);
    } else {
      const res = await fetch("/api/skills/filter-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      data = await res.json();
    }

    if (data && data.success) {
      currentSkillsFilterMode = mode;
      const modeTag = document.getElementById("skills-current-mode-tag");
      if (modeTag) {
        modeTag.textContent = mode === "always_active" ? "🌐 Always Active" : "⚡ Smart Intent Filter";
      }
      const modeButtons = document.querySelectorAll("#skills-mode-segmented .seg-btn");
      modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
      });
      showPluginToast(`Skill filter mode set to: ${mode === "always_active" ? "Always Active" : "Smart Intent Filter"}`);
    }
  } catch (err) {
    showPluginToast(`Failed to set mode: ${err.message}`, true);
  }
}

async function testSkillFilter(prompt) {
  const matchesContainer = document.getElementById("skills-tester-matches");
  if (!matchesContainer) return;

  if (!prompt || !prompt.trim()) {
    matchesContainer.innerHTML = `<span class="skills-tester-hint">Type a prompt to test trigger detection...</span>`;
    return;
  }

  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.testFilter === "function") {
      data = await window.electronAPI.skills.testFilter(prompt);
    } else {
      const res = await fetch(`/api/skills/test-filter?prompt=${encodeURIComponent(prompt)}`);
      data = await res.json();
    }

    if (data && data.success) {
      const matched = data.matchedSkills || [];
      if (matched.length === 0) {
        matchesContainer.innerHTML = `<span class="skills-tester-hint" style="color: var(--text-dim);">No skills triggered for this prompt. (In Smart Filter mode, standard thinking is used).</span>`;
      } else {
        matchesContainer.innerHTML = matched
          .map(
            (s) =>
              `<span class="skill-match-pill ${s.enabled ? "" : "match-inactive"}" title="${s.enabled ? "Active" : "Skill matched but currently disabled"}">
                ${renderPluginIcon(s.icon || "🧠")} ${escapeHtmlStr(s.name)} ${s.enabled ? "✓" : "(disabled)"}
              </span>`
          )
          .join("");
      }
    }
  } catch (err) {
    matchesContainer.innerHTML = `<span class="skills-tester-hint" style="color: var(--danger);">Filter test error: ${escapeHtmlStr(err.message)}</span>`;
  }
}

function openSkillEditor(skillToEdit) {
  const modal = document.getElementById("modal-skill-editor");
  if (!modal) return;

  const idInput = document.getElementById("skill-edit-id");
  const nameInput = document.getElementById("skill-edit-name");
  const catInput = document.getElementById("skill-edit-category");
  const iconInput = document.getElementById("skill-edit-icon");
  const descInput = document.getElementById("skill-edit-description");
  const triggersInput = document.getElementById("skill-edit-triggers");
  const alwaysActiveInput = document.getElementById("skill-edit-always-active");
  const promptInput = document.getElementById("skill-edit-prompt");
  const modalTitle = document.getElementById("skill-editor-modal-title");

  if (skillToEdit) {
    if (modalTitle) modalTitle.textContent = "Edit Custom Skill";
    if (idInput) idInput.value = skillToEdit.id;
    if (nameInput) nameInput.value = skillToEdit.name;
    if (catInput) catInput.value = skillToEdit.category;
    if (iconInput) iconInput.value = skillToEdit.icon || "🧠";
    if (descInput) descInput.value = skillToEdit.description || "";
    if (triggersInput) triggersInput.value = (skillToEdit.triggers || []).join(", ");
    if (alwaysActiveInput) alwaysActiveInput.checked = Boolean(skillToEdit.alwaysActive);
    if (promptInput) promptInput.value = skillToEdit.promptInstructions || "";
  } else {
    if (modalTitle) modalTitle.textContent = "Create Cognitive Skill";
    if (idInput) idInput.value = "";
    if (nameInput) nameInput.value = "";
    if (catInput) catInput.value = "custom";
    if (iconInput) iconInput.value = "🧠";
    if (descInput) descInput.value = "";
    if (triggersInput) triggersInput.value = "";
    if (alwaysActiveInput) alwaysActiveInput.checked = false;
    if (promptInput) promptInput.value = "";
  }

  modal.classList.remove("hidden");
  modal.classList.add("visible");
  if (nameInput) nameInput.focus();
}

function closeSkillEditor() {
  const modal = document.getElementById("modal-skill-editor");
  if (!modal) return;
  modal.classList.remove("visible");
  setTimeout(() => modal.classList.add("hidden"), 200);
}

async function saveSkillForm(e) {
  e.preventDefault();
  const idInput = document.getElementById("skill-edit-id");
  const nameInput = document.getElementById("skill-edit-name");
  const catInput = document.getElementById("skill-edit-category");
  const iconInput = document.getElementById("skill-edit-icon");
  const descInput = document.getElementById("skill-edit-description");
  const triggersInput = document.getElementById("skill-edit-triggers");
  const alwaysActiveInput = document.getElementById("skill-edit-always-active");
  const promptInput = document.getElementById("skill-edit-prompt");

  const name = nameInput ? nameInput.value.trim() : "";
  if (!name) {
    alert("Skill name is required.");
    return;
  }

  const triggers = triggersInput
    ? triggersInput.value
        .split(/[,;]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const payload = {
    id: idInput && idInput.value ? idInput.value.trim() : undefined,
    name,
    category: catInput ? catInput.value : "custom",
    icon: iconInput && iconInput.value.trim() ? iconInput.value.trim() : "🧠",
    description: descInput ? descInput.value.trim() : "",
    triggers,
    alwaysActive: alwaysActiveInput ? alwaysActiveInput.checked : false,
    promptInstructions: promptInput ? promptInput.value.trim() : "",
  };

  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.save === "function") {
      data = await window.electronAPI.skills.save(payload);
    } else {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    }

    if (data && data.success) {
      registeredSkills = data.skills;
      closeSkillEditor();
      renderSkills(registeredSkills);
      const badge = document.getElementById("skills-active-count");
      const activeCount = registeredSkills.filter((s) => s.enabled).length;
      if (badge) badge.textContent = `${activeCount}/${registeredSkills.length}`;
      showPluginToast(`✅ Skill "${data.skill?.name || name}" saved successfully!`);
    } else {
      alert(data?.error || "Failed to save skill.");
    }
  } catch (err) {
    alert("Error saving skill: " + err.message);
  }
}

async function deleteCustomSkill(id) {
  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.delete === "function") {
      data = await window.electronAPI.skills.delete(id);
    } else {
      const res = await fetch(`/api/skills/delete?id=${encodeURIComponent(id)}`, { method: "POST" });
      data = await res.json();
    }

    if (data && data.success) {
      registeredSkills = data.skills;
      expandedSkillIds.delete(id);
      renderSkills(registeredSkills);
      const badge = document.getElementById("skills-active-count");
      const activeCount = registeredSkills.filter((s) => s.enabled).length;
      if (badge) badge.textContent = `${activeCount}/${registeredSkills.length}`;
      showPluginToast(`🗑️ Custom skill deleted.`);
    } else {
      showPluginToast(data?.error || "Failed to delete skill.", true);
    }
  } catch (err) {
    showPluginToast("Delete error: " + err.message, true);
  }
}

async function exportSkillMarkdown(id) {
  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.export === "function") {
      data = await window.electronAPI.skills.export(id);
    } else {
      const res = await fetch(`/api/skills/export?id=${encodeURIComponent(id)}`);
      data = await res.json();
    }

    if (data && data.markdown) {
      const blob = new Blob([data.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}.skill.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showPluginToast(`📥 Exported ${id}.skill.md!`);
    }
  } catch (err) {
    showPluginToast("Export failed: " + err.message, true);
  }
}

async function importSkillFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.import === "function") {
      data = await window.electronAPI.skills.import(text, file.name);
    } else {
      const res = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, filename: file.name }),
      });
      data = await res.json();
    }

    if (data && data.success) {
      registeredSkills = data.skills;
      renderSkills(registeredSkills);
      const badge = document.getElementById("skills-active-count");
      const activeCount = registeredSkills.filter((s) => s.enabled).length;
      if (badge) badge.textContent = `${activeCount}/${registeredSkills.length}`;
      showPluginToast(`✅ Imported skill "${data.skill?.name || file.name}"!`);
    } else {
      showPluginToast(data?.error || "Import failed.", true);
    }
  } catch (err) {
    showPluginToast("Import error: " + err.message, true);
  }
}

async function resetSkillsToDefaults() {
  const confirmed = confirm("Reset all skills to built-in factory defaults (Humanizer, Superpowers TDD, Debugging, Spec-First, Code Review, CoVE)? Custom skills will be cleared.");
  if (!confirmed) return;

  try {
    let data;
    if (window.electronAPI && window.electronAPI.skills && typeof window.electronAPI.skills.reset === "function") {
      data = await window.electronAPI.skills.reset();
    } else {
      const res = await fetch("/api/skills/reset", { method: "POST" });
      data = await res.json();
    }

    if (data && data.success) {
      registeredSkills = data.skills;
      currentSkillsFilterMode = data.filterMode || "smart_filter";
      renderSkills(registeredSkills);
      const badge = document.getElementById("skills-active-count");
      const activeCount = registeredSkills.filter((s) => s.enabled).length;
      if (badge) badge.textContent = `${activeCount}/${registeredSkills.length}`;
      showPluginToast("🔄 Reset skills to factory defaults.");
    }
  } catch (err) {
    showPluginToast("Reset error: " + err.message, true);
  }
}

function initSkillsUI() {
  if (isSkillsUIInitialized) return;
  isSkillsUIInitialized = true;

  // Mode buttons
  const modeButtons = document.querySelectorAll("#skills-mode-segmented .seg-btn");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode) setSkillFilterMode(mode);
    });
  });

  // Search input
  const searchInput = document.getElementById("skills-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      skillSearchQuery = searchInput.value;
      renderSkills(registeredSkills);
    });
  }

  // Category chips
  const catChips = document.querySelectorAll("#skills-category-chips .skills-chip");
  catChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      catChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeSkillCategoryFilter = chip.dataset.category || "all";
      renderSkills(registeredSkills);
    });
  });

  // Create skill button
  const btnCreate = document.getElementById("btn-create-skill");
  if (btnCreate) {
    btnCreate.addEventListener("click", () => openSkillEditor());
  }

  // Import skill button and file input
  const btnImport = document.getElementById("btn-import-skill");
  const fileImport = document.getElementById("skill-import-input");
  if (btnImport && fileImport) {
    btnImport.addEventListener("click", () => fileImport.click());
    fileImport.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        importSkillFile(file);
        fileImport.value = "";
      }
    });
  }

  // Reset button
  const btnReset = document.getElementById("btn-reset-skills");
  if (btnReset) {
    btnReset.addEventListener("click", () => resetSkillsToDefaults());
  }

  // Live tester
  const testerInput = document.getElementById("skills-tester-input");
  const btnTest = document.getElementById("btn-run-skill-test");
  if (testerInput) {
    testerInput.addEventListener("input", () => {
      testSkillFilter(testerInput.value);
    });
    testerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") testSkillFilter(testerInput.value);
    });
  }
  if (btnTest && testerInput) {
    btnTest.addEventListener("click", () => testSkillFilter(testerInput.value));
  }

  // Modal close buttons
  const btnCloseModal = document.getElementById("btn-close-skill-editor");
  const btnCancelModal = document.getElementById("btn-cancel-skill-editor");
  const skillModal = document.getElementById("modal-skill-editor");
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeSkillEditor);
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeSkillEditor);
  if (skillModal) {
    skillModal.addEventListener("click", (e) => {
      if (e.target === skillModal) closeSkillEditor();
    });
  }

  // Skill editor form submit
  const formSkill = document.getElementById("form-skill-editor");
  if (formSkill) {
    formSkill.addEventListener("submit", saveSkillForm);
  }

  // Templates buttons
  const btnTmplHumanizer = document.querySelector(".btn-template-humanizer");
  const btnTmplSuperpowers = document.querySelector(".btn-template-superpowers");
  const promptInput = document.getElementById("skill-edit-prompt");

  if (btnTmplHumanizer && promptInput) {
    btnTmplHumanizer.addEventListener("click", () => {
      promptInput.value = `### Skill: Custom Humanizer (Anti-AI Prose Directives)
Reference: blader/humanizer

#### Banned AI Tropes & Vocabulary:
- Do not use: "delve", "tapestry", "beacon", "testament to", "game-changer", "pivotal", "elevate".
- Avoid robotic symmetry, forced rule-of-three, and em dash overuse.

#### Verification Pass:
- Pass 1: Write direct, conversational human prose with varying cadence.
- Pass 2: Audit to verify 100% factual accuracy and zero invented statements.`;
    });
  }

  if (btnTmplSuperpowers && promptInput) {
    btnTmplSuperpowers.addEventListener("click", () => {
      promptInput.value = `### Skill: Superpowers: Strict TDD & Engineering
Reference: obra/superpowers

#### Engineering Protocol:
1. Red Phase: Formulate failing test case or repro command before writing code.
2. Green Phase: Implement minimal code to satisfy the test assertions.
3. Refactor: Polish design and naming while keeping tests green.`;
    });
  }
}

function getApplicableSkillsLocally(prompt, skillsList = registeredSkills, mode = currentSkillsFilterMode) {
  if (!prompt || !Array.isArray(skillsList)) return [];
  const enabled = skillsList.filter((s) => s.enabled);
  if (enabled.length === 0) return [];
  if (mode === "always_active") return enabled;

  const cleanPrompt = ` ${prompt.toLowerCase().replace(/[^a-z0-9_\-\s]/g, " ")} `;
  return enabled.filter((skill) => {
    if (skill.alwaysActive) return true;
    if (!skill.triggers || skill.triggers.length === 0) return false;
    return skill.triggers.some((tr) => {
      const cleanTr = tr.trim().toLowerCase();
      if (!cleanTr) return false;
      if (cleanTr.includes(" ")) {
        return cleanPrompt.includes(` ${cleanTr} `) || cleanPrompt.includes(cleanTr);
      }
      return new RegExp(`\\b${cleanTr}\\b`, "i").test(cleanPrompt);
    });
  });
}

function renderMessageSkills(blockElement, skills) {
  if (!blockElement) return;
  const indicator = blockElement.querySelector(".message-skills-indicator");
  if (!indicator) return;

  if (!skills || !Array.isArray(skills) || skills.length === 0) {
    indicator.innerHTML = "";
    indicator.classList.add("hidden");
    indicator.style.display = "none";
    return;
  }

  // Resolve skill details
  const resolved = skills
    .map((item) => {
      if (typeof item === "object" && item && item.name) return item;
      const found = registeredSkills.find((s) => s.name === item || s.id === item);
      if (found) return found;
      return { id: String(item), name: String(item), category: "custom", description: "Cognitive Thinking Directive" };
    })
    .filter(Boolean);

  if (resolved.length === 0) {
    indicator.innerHTML = "";
    indicator.classList.add("hidden");
    indicator.style.display = "none";
    return;
  }

  const categoryIcons = {
    writing: "✍️",
    engineering: "🛠️",
    reasoning: "🧠",
    reasoning_verification: "🎯",
    custom: "⚡",
  };

  const chipsHtml = resolved
    .map((skill) => {
      const icon = categoryIcons[skill.category] || skill.icon || "⚡";
      const desc = skill.description ? `\n\n${skill.description}` : "";
      const trig = skill.triggers && skill.triggers.length > 0 ? `\nTriggers: ${skill.triggers.slice(0, 5).join(", ")}` : "";
      const tooltip = `${skill.name} (${skill.category})${desc}${trig}\n\nClick to inspect in Settings`;
      return `
        <span class="skill-active-tag" data-skill-id="${escapeHtmlStr(skill.id || skill.name)}" title="${escapeHtmlStr(tooltip)}" onclick="openSkillInspector('${escapeHtmlStr(skill.id || skill.name)}')">
          <span class="skill-active-tag-icon">${icon}</span>
          <span class="skill-active-tag-name">${escapeHtmlStr(skill.name)}</span>
          <span class="skill-active-tag-badge">Active</span>
        </span>
      `;
    })
    .join("");

  indicator.innerHTML = `
    <div class="skills-indicator-content">
      <div class="skills-indicator-lead">
        <span class="skills-sparkle-icon">⚡</span>
        <span class="skills-indicator-label">Cognitive Directives Active:</span>
      </div>
      <div class="skills-indicator-chips">${chipsHtml}</div>
    </div>
  `;

  indicator.classList.remove("hidden");
  indicator.style.display = "";
}

function openSkillInspector(skillId) {
  const settingsBtn = document.querySelector('[data-tab="tab-settings"]');
  if (settingsBtn) settingsBtn.click();
  if (typeof switchSettingsTab === "function") {
    switchSettingsTab("tab-settings-skills");
  }
  setTimeout(() => {
    const card = document.querySelector(`.skill-card[data-skill-id="${skillId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("highlight-pulse");
      setTimeout(() => card.classList.remove("highlight-pulse"), 2500);
    }
  }, 100);
}

// Initial bootstrap load of skills on launch
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    loadSkills();
  });
} else {
  loadSkills();
}

// Initialize system config listeners on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSystemConfigUI);
} else {
  initSystemConfigUI();
}

settingsTabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchSettingsTab(btn.dataset.settingsTab);
  });
});

// Gear icon opens settings modal
const btnSidebarSettings = document.getElementById("btn-sidebar-settings");
if (btnSidebarSettings) {
  btnSidebarSettings.addEventListener("click", () => openSettingsModal());
}

// Provider pill opens settings modal
if (sidebarProviderPill) {
  sidebarProviderPill.addEventListener("click", () => openSettingsModal());
}

// Close button
if (settingsModalClose) {
  settingsModalClose.addEventListener("click", () => closeSettingsModal());
}

// Backdrop click closes
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

// Escape key closes
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsModal.classList.contains("visible")) {
    closeSettingsModal();
  }
});

btnNewChat.addEventListener("click", createNewSession);

// ─── Chat Window File Attachments & Embedding ───────────────────────

function getFileIcon(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (["py", "js", "ts", "html", "css", "cpp", "c", "rs", "go", "java", "sh", "bat"].includes(ext)) return "🐍";
  if (["json", "yaml", "yml", "xml", "csv", "tsv", "sql"].includes(ext)) return "📊";
  if (["md", "txt", "log", "doc", "pdf", "docx"].includes(ext)) return "📝";
  if (["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(ext)) return "🖼️";
  return "📄";
}

async function readFileData(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const isBinary = ["pdf", "png", "jpg", "jpeg", "webp", "gif", "docx", "zip", "exe"].includes(ext);

  if (isBinary) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Url = reader.result;
        const base64Data = String(base64Url).split(",")[1] || "";
        resolve({ content: base64Data, isBase64: true });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } else {
    const text = await file.text();
    return { content: text, isBase64: false };
  }
}

async function queueAttachment(file) {
  try {
    const { content, isBase64 } = await readFileData(file);
    // Avoid duplicate filenames
    if (pendingAttachments.some((a) => a.filename === file.name)) {
      return;
    }
    pendingAttachments.push({
      filename: file.name,
      size: file.size,
      content: content,
      isBase64: isBase64,
    });
    renderPendingAttachments();
  } catch (err) {
    alert("Could not read file: " + err.message);
  }
}

function renderPendingAttachments() {
  if (!dockAttachments) return;
  if (pendingAttachments.length === 0) {
    dockAttachments.style.display = "none";
    dockAttachments.innerHTML = "";
    return;
  }

  dockAttachments.style.display = "flex";
  dockAttachments.innerHTML = pendingAttachments
    .map(
      (att, idx) => `
    <div class="attachment-chip" data-idx="${idx}">
      <span class="attachment-chip-icon">${getFileIcon(att.filename)}</span>
      <span class="attachment-chip-name" title="${att.filename}">${att.filename}</span>
      <span class="attachment-chip-tag">🔮 Embed RAG</span>
      <button class="attachment-chip-remove" onclick="removePendingAttachment(${idx})" title="Remove attachment">✕</button>
    </div>
  `
    )
    .join("");
}

window.removePendingAttachment = function (idx) {
  pendingAttachments.splice(idx, 1);
  renderPendingAttachments();
};

if (btnDockAttach && chatFileInput) {
  btnDockAttach.addEventListener("click", () => {
    chatFileInput.click();
  });

  chatFileInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (const file of files) {
        await queueAttachment(file);
      }
      chatFileInput.value = "";
    }
  });
}

// Paste event support in user input
if (userInput) {
  userInput.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            await queueAttachment(file);
          }
        }
      }
    }
  });
}

// Drag & drop support on chat container
if (chatContainer) {
  let dragCounter = 0;
  chatContainer.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    if (chatDropzone) chatDropzone.classList.add("active");
  });

  chatContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  chatContainer.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0 && chatDropzone) {
      chatDropzone.classList.remove("active");
      dragCounter = 0;
    }
  });

  chatContainer.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (chatDropzone) chatDropzone.classList.remove("active");
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const file of files) {
        await queueAttachment(file);
      }
    }
  });
}

// ─── Status & Models Loader ─────────────────────────────────────────

async function loadStatus(loadMessages = false) {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    serverStatus = await res.json();

    if (serverStatus.provider) {
      providerNameBadge.textContent = serverStatus.provider.toUpperCase();
      selectProvider.value = serverStatus.provider;
    }
    if (serverStatus.model) {
      modelBadge.textContent = serverStatus.model;
    }
    if (serverStatus.embeddingModel && embeddingNameBadge) {
      embeddingNameBadge.textContent = serverStatus.embeddingModel;
    }
    if (serverStatus.embeddingProvider && selectEmbeddingProvider) {
      const embProv = serverStatus.embeddingProvider.toLowerCase();
      let hasOption = false;
      for (let i = 0; i < selectEmbeddingProvider.options.length; i++) {
        if (selectEmbeddingProvider.options[i].value.toLowerCase() === embProv) {
          selectEmbeddingProvider.selectedIndex = i;
          hasOption = true;
          break;
        }
      }
      if (!hasOption) {
        const opt = document.createElement("option");
        opt.value = embProv;
        opt.textContent = embProv.charAt(0).toUpperCase() + embProv.slice(1);
        selectEmbeddingProvider.appendChild(opt);
        selectEmbeddingProvider.value = embProv;
      }
    }
    if (serverStatus.totalDocuments !== undefined && kbCountBadge) {
      kbCountBadge.textContent = serverStatus.totalDocuments;
    }
    if (kbTagline && serverStatus.embeddingModel) {
      kbTagline.textContent = `Persistent SQLite Vector Store with active embedding model: ${serverStatus.embeddingModel}.`;
    }

    if (serverStatus.thinkingLevel) {
      setThinkingLevel(serverStatus.thinkingLevel, false);
    }

    populateModelOptions(serverStatus.provider);
    populateEmbeddingModelOptions(serverStatus.embeddingProvider || serverStatus.provider || "openrouter");
    loadArtifacts();
    loadSandboxFiles();
    await loadSessions();
    loadKnowledgeBase();
    updateBadgeCounts();

    if (serverStatus.plugins && Array.isArray(serverStatus.plugins)) {
      registeredPlugins = serverStatus.plugins;
      renderPlugins(serverStatus.plugins);
    }

    loadSecuritySettings();

    // Load active session messages ONLY on initial boot or explicit session switch
    if (loadMessages && currentSessionId) {
      try {
        const msgRes = await fetch(`/api/sessions/messages?id=${encodeURIComponent(currentSessionId)}`);
        const msgData = await msgRes.json();
        if (msgData.messages && msgData.messages.length > 0) {
          await renderSessionMessages(msgData.messages);
        }
      } catch {}
    }
    if (typeof refreshSessionContextTokens === "function") {
      refreshSessionContextTokens(currentSessionId);
    }
  } catch {
    // Non-fatal
  }
}

loadStatus(true);

// ─── Provider & Model Settings ──────────────────────────────────────

async function populateModelOptions(provider, force = false) {
  if (!selectModel) return;

  const models = (serverStatus && serverStatus.providerModels && serverStatus.providerModels[provider]) || [];
  const currentProvider = selectModel?.dataset?.currentProvider;

  const renderOptions = (modelList) => {
    selectModel.innerHTML = "";
    for (const m of modelList) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      selectModel.appendChild(opt);
    }
    if (serverStatus && serverStatus.model && modelList.includes(serverStatus.model)) {
      selectModel.value = serverStatus.model;
    }
  };

  if (!force && currentProvider === provider && selectModel.options.length > 0) {
    if (serverStatus && serverStatus.model) {
      selectModel.value = serverStatus.model;
    }
    return;
  }

  selectModel.dataset.currentProvider = provider;
  renderOptions(models);

  // Background live query to get any newly available live dynamic models
  try {
    const res = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        if (selectModel.dataset.currentProvider === provider) {
          renderOptions(data.models);
        }
      }
    }
  } catch {
    // Keep initial render
  }
}

async function populateEmbeddingModelOptions(provider, force = false) {
  if (!selectEmbeddingModel) return;

  const targetProvider = (
    provider ||
    (selectEmbeddingProvider && selectEmbeddingProvider.value) ||
    (serverStatus && serverStatus.embeddingProvider) ||
    "openrouter"
  ).toLowerCase();

  const currentProvider = selectEmbeddingModel?.dataset?.currentProvider;
  const models =
    (serverStatus &&
      serverStatus.providerEmbeddingModels &&
      (serverStatus.providerEmbeddingModels[targetProvider] ||
        serverStatus.providerEmbeddingModels[provider])) || [
      "liquid/lfm-2.5-embedding-350m:free",
      "openai/text-embedding-3-small",
      "gemini-embedding-2",
    ];

  const renderOptions = (modelList) => {
    selectEmbeddingModel.innerHTML = "";
    for (const m of modelList) {
      const modelId = typeof m === "string" ? m : m.id || m.name;
      const opt = document.createElement("option");
      opt.value = modelId;
      opt.textContent = modelId;
      selectEmbeddingModel.appendChild(opt);
    }
    if (serverStatus && serverStatus.embeddingModel && modelList.includes(serverStatus.embeddingModel)) {
      selectEmbeddingModel.value = serverStatus.embeddingModel;
    }
  };

  if (!force && currentProvider === targetProvider && selectEmbeddingModel.options.length > 0) {
    if (serverStatus && serverStatus.embeddingModel) {
      selectEmbeddingModel.value = serverStatus.embeddingModel;
    }
    return;
  }

  selectEmbeddingModel.dataset.currentProvider = targetProvider;
  renderOptions(models);

  // Background live query to get any newly available live dynamic embedding models
  try {
    const res = await fetch(`/api/models?type=embedding&provider=${encodeURIComponent(targetProvider)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        if (selectEmbeddingModel.dataset.currentProvider === targetProvider) {
          renderOptions(data.models);
        }
      }
    }
  } catch {
    // Keep initial render
  }
}

selectProvider.addEventListener("change", () => {
  if (customModelInput) customModelInput.value = "";
  populateModelOptions(selectProvider.value, true);
});

if (selectModel) {
  selectModel.addEventListener("change", () => {
    if (customModelInput) customModelInput.value = "";
  });
}

if (selectEmbeddingProvider) {
  selectEmbeddingProvider.addEventListener("change", () => {
    if (customEmbeddingModelInput) customEmbeddingModelInput.value = "";
    populateEmbeddingModelOptions(selectEmbeddingProvider.value, true);
  });
}

if (selectEmbeddingModel) {
  selectEmbeddingModel.addEventListener("change", () => {
    if (customEmbeddingModelInput) customEmbeddingModelInput.value = "";
  });
}

const thinkingChips = document.querySelectorAll(".thinking-chip");
const thinkingLoopsBadge = document.getElementById("thinking-loops-badge");
const dockThinkingBar = document.getElementById("dock-thinking-bar");

const THINKING_LOOPS_MAP = {
  off: "10 loops",
  low: "15 loops",
  medium: "25 loops",
  high: "40 loops",
  max: "60 loops",
};

let currentThinkingLevel = "high";

async function setThinkingLevel(level, persist = true) {
  if (!level) return;
  currentThinkingLevel = level;

  // Update active chip state in Chat dock
  thinkingChips.forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.level === level);
  });

  if (thinkingLoopsBadge) {
    thinkingLoopsBadge.textContent = THINKING_LOOPS_MAP[level] || "40 loops";
  }

  if (dockThinkingBar) {
    dockThinkingBar.classList.add("updated");
    setTimeout(() => dockThinkingBar.classList.remove("updated"), 600);
  }

  if (persist) {
    try {
      if (footerEngineTag) footerEngineTag.textContent = `⚡ Thinking: ${level.toUpperCase()}`;
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thinkingLevel: level }),
      });
      setTimeout(() => {
        if (footerEngineTag && !isProcessing) footerEngineTag.textContent = "⚡ Ready";
      }, 1500);
    } catch (err) {
      console.warn("Failed to persist thinking level:", err);
    }
  }
}

thinkingChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const lvl = chip.dataset.level;
    if (lvl && lvl !== currentThinkingLevel) {
      setThinkingLevel(lvl, true);
    }
  });
});


// ─── Real-Time Context Token Tracking & Breakdown Popover ───────────
let currentSessionHistoryTokens = 0;
let currentSessionTurnsCount = 0;
let maxContextPromptTokens = 8192;
let currentTokensSaved = 0;

function estimateTokensClient(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

const thinkingTokensBadge = document.getElementById("thinking-tokens-badge");
const thinkingTokensValue = document.getElementById("thinking-tokens-value");
const contextTokensPopover = document.getElementById("context-tokens-popover");
const tokensPopoverPct = document.getElementById("tokens-popover-pct");
const tokensProgressBarFill = document.getElementById("tokens-progress-bar-fill");
const popoverHistoryTokens = document.getElementById("popover-history-tokens");
const popoverDraftTokens = document.getElementById("popover-draft-tokens");
const popoverMaxTokens = document.getElementById("popover-max-tokens");
const popoverSavedTokens = document.getElementById("popover-saved-tokens");
const popoverBtnLedger = document.getElementById("popover-btn-ledger");
const popoverBtnCompress = document.getElementById("popover-btn-compress");

function updateContextTokensUI() {
  const draftText = userInput ? userInput.value : "";
  const draftTokens = estimateTokensClient(draftText);
  const totalTokens = currentSessionHistoryTokens + draftTokens;
  const budget = maxContextPromptTokens || 8192;
  const pct = Math.min(100, Math.round((totalTokens / budget) * 100));

  if (thinkingTokensValue) {
    thinkingTokensValue.textContent = `${totalTokens.toLocaleString()} / ${budget.toLocaleString()} tok`;
  }

  if (thinkingTokensBadge) {
    thinkingTokensBadge.classList.toggle("warning", pct >= 70 && pct < 90);
    thinkingTokensBadge.classList.toggle("danger", pct >= 90);
    thinkingTokensBadge.title = `Live context: ${totalTokens.toLocaleString()} / ${budget.toLocaleString()} tokens (${pct}% of context window budget). Click for breakdown.`;
  }

  if (contextTokensPopover && !contextTokensPopover.classList.contains("hidden")) {
    if (tokensPopoverPct) tokensPopoverPct.textContent = `${pct}%`;
    if (tokensProgressBarFill) {
      tokensProgressBarFill.style.width = `${pct}%`;
      tokensProgressBarFill.style.background = pct >= 90
        ? "linear-gradient(90deg, #f59e0b, #ef4444)"
        : pct >= 70
        ? "linear-gradient(90deg, #6366f1, #f59e0b)"
        : "linear-gradient(90deg, #6366f1, #38bdf8)";
    }
    if (popoverHistoryTokens) {
      popoverHistoryTokens.textContent = `${currentSessionHistoryTokens.toLocaleString()} tok (${currentSessionTurnsCount} turn${currentSessionTurnsCount === 1 ? "" : "s"})`;
    }
    if (popoverDraftTokens) {
      popoverDraftTokens.textContent = `${draftTokens.toLocaleString()} tok`;
    }
    if (popoverMaxTokens) {
      popoverMaxTokens.textContent = `${budget.toLocaleString()} tok`;
    }
    if (popoverSavedTokens) {
      popoverSavedTokens.textContent = `${currentTokensSaved.toLocaleString()} tok`;
    }
  }
}

async function refreshSessionContextTokens(sessionId) {
  const sid = sessionId || currentSessionId;
  try {
    let data = null;
    if (window.electronAPI && window.electronAPI.compressor && typeof window.electronAPI.compressor.getContextTokens === "function") {
      data = await window.electronAPI.compressor.getContextTokens(sid, userInput ? userInput.value : "");
    } else {
      const res = await fetch(`/api/compressor/context-tokens?id=${encodeURIComponent(sid)}`);
      if (res.ok) data = await res.json();
    }

    if (data && data.success) {
      if (sid === currentSessionId) {
        currentSessionHistoryTokens = data.historyTokens || 0;
        currentSessionTurnsCount = data.turnsCount || 0;
        maxContextPromptTokens = data.maxPromptTokens || 8192;
        currentTokensSaved = data.tokensSaved || 0;
        updateContextTokensUI();
      }
    }
  } catch (err) {
    console.warn("Failed to fetch context tokens:", err);
  }
}

if (userInput) {
  userInput.addEventListener("input", updateContextTokensUI);
}

if (thinkingTokensBadge) {
  thinkingTokensBadge.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (contextTokensPopover) {
      const isHidden = contextTokensPopover.classList.contains("hidden");
      if (isHidden) {
        updateContextTokensUI();
        contextTokensPopover.classList.remove("hidden");
        await refreshSessionContextTokens(currentSessionId);
      } else {
        contextTokensPopover.classList.add("hidden");
      }
    }
  });
}

// Close popover when clicking anywhere else
document.addEventListener("click", (e) => {
  if (contextTokensPopover && !contextTokensPopover.classList.contains("hidden")) {
    if (!contextTokensPopover.contains(e.target) && !thinkingTokensBadge?.contains(e.target)) {
      contextTokensPopover.classList.add("hidden");
    }
  }
});

if (popoverBtnLedger) {
  popoverBtnLedger.addEventListener("click", () => {
    if (contextTokensPopover) contextTokensPopover.classList.add("hidden");
    if (typeof openTokenStatsModal === "function") {
      openTokenStatsModal();
    }
  });
}

if (popoverBtnCompress) {
  popoverBtnCompress.addEventListener("click", async () => {
    if (popoverBtnCompress.classList.contains("compressing")) return;

    const origHtml = popoverBtnCompress.innerHTML;
    popoverBtnCompress.classList.add("compressing");
    popoverBtnCompress.innerHTML = `⏳ Compacting...`;

    try {
      let result = null;
      if (window.electronAPI && window.electronAPI.compressor && typeof window.electronAPI.compressor.compressSession === "function") {
        result = await window.electronAPI.compressor.compressSession(currentSessionId);
      } else {
        const res = await fetch("/api/compressor/compress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: currentSessionId }),
        });
        result = await res.json();
      }

      if (result && result.tokensSaved > 0) {
        showPluginToast(`🗜️ Context compressed! Saved ~${result.tokensSaved} tokens across ${result.originalTurns} turns.`);
      } else {
        showPluginToast("🗜️ Context is already compact and within optimal token limits.");
      }
      if (typeof refreshSessionContextTokens === "function") {
        await refreshSessionContextTokens(currentSessionId);
      }
    } catch (err) {
      console.warn("Context compression error:", err);
      showPluginToast("Context compression failed: " + (err.message || "Unknown error"), true);
    } finally {
      setTimeout(() => {
        popoverBtnCompress.classList.remove("compressing");
        popoverBtnCompress.innerHTML = origHtml;
      }, 1000);
    }
  });
}

btnSaveSettings.addEventListener("click", async () => {
  const chosenProvider = selectProvider ? selectProvider.value : "gemini";
  const chosenModel = (customModelInput && customModelInput.value.trim()) || (selectModel && selectModel.value) || "";
  const chosenThinkingLevel = currentThinkingLevel;

  const chosenEmbeddingProvider = selectEmbeddingProvider ? selectEmbeddingProvider.value : undefined;
  const chosenEmbeddingModel =
    (customEmbeddingModelInput && customEmbeddingModelInput.value.trim()) ||
    (selectEmbeddingModel && selectEmbeddingModel.value) ||
    "liquid/lfm-2.5-embedding-350m:free";

  btnSaveSettings.disabled = true;
  settingsFeedback.textContent = "Applying...";

  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: chosenProvider,
        model: chosenModel,
        embeddingProvider: chosenEmbeddingProvider,
        embeddingModel: chosenEmbeddingModel,
        thinkingLevel: chosenThinkingLevel,
      }),
    });

    const data = await res.json();
    if (data.success) {
      if (providerNameBadge && data.provider) {
        providerNameBadge.textContent = data.provider.toUpperCase();
      }
      if (modelBadge && data.model) {
        modelBadge.textContent = data.model;
      }
      if (embeddingNameBadge && data.embeddingModel) {
        embeddingNameBadge.textContent = data.embeddingModel;
      }
      settingsFeedback.textContent = "✓ Settings applied successfully!";
      setTimeout(() => (settingsFeedback.textContent = ""), 3000);
      await loadStatus(false);
      populateSettings();
    } else {
      settingsFeedback.textContent = "❌ " + (data.error || "Failed to update");
    }
  } catch (err) {
    settingsFeedback.textContent = "❌ " + err.message;
  } finally {
    btnSaveSettings.disabled = false;
  }
});

function populateSettings() {
  if (serverStatus) {
    if (selectProvider) {
      selectProvider.value = serverStatus.provider || "gemini";
      populateModelOptions(selectProvider.value);
    }

    if (selectEmbeddingProvider) {
      const activeEmbProvider = (serverStatus.embeddingProvider || serverStatus.provider || "openrouter").toLowerCase();
      let exists = false;
      for (let i = 0; i < selectEmbeddingProvider.options.length; i++) {
        if (selectEmbeddingProvider.options[i].value.toLowerCase() === activeEmbProvider) {
          selectEmbeddingProvider.selectedIndex = i;
          exists = true;
          break;
        }
      }
      if (!exists && activeEmbProvider) {
        const opt = document.createElement("option");
        opt.value = activeEmbProvider;
        opt.textContent = activeEmbProvider.charAt(0).toUpperCase() + activeEmbProvider.slice(1);
        selectEmbeddingProvider.appendChild(opt);
        selectEmbeddingProvider.value = activeEmbProvider;
      }

      populateEmbeddingModelOptions(
        selectEmbeddingProvider.value || activeEmbProvider,
        true
      );
    }

    if (customEmbeddingModelInput && serverStatus.embeddingModel) {
      const inDropdown = selectEmbeddingModel && Array.from(selectEmbeddingModel.options).some(o => o.value === serverStatus.embeddingModel);
      if (!inDropdown) {
        customEmbeddingModelInput.value = serverStatus.embeddingModel;
      } else {
        customEmbeddingModelInput.value = "";
      }
    }
  }
}

// ─── Hot Plug & Play Tool Plugins Dashboard ─────────────────────────

const pluginsListContainer = document.getElementById("plugins-list");
const pluginsActiveCountBadge = document.getElementById("plugins-active-count");

let registeredPlugins = (() => {
  try {
    const cached = localStorage.getItem("ai_plate_plugins_cache");
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
})();

function escapeHtmlStr(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
const escapeHtml = escapeHtmlStr;

function renderPluginIcon(iconStr, size = 20) {
  if (!iconStr) return "🔌";
  const s = String(iconStr).trim();
  const sLower = s.toLowerCase();
  if (
    sLower.startsWith("http://") ||
    sLower.startsWith("https://") ||
    sLower.startsWith("data:") ||
    sLower.endsWith(".ico") ||
    sLower.endsWith(".png") ||
    sLower.endsWith(".svg") ||
    sLower.endsWith(".webp") ||
    sLower.endsWith(".jpg") ||
    sLower.endsWith(".jpeg") ||
    sLower.endsWith(".gif") ||
    sLower.endsWith(".bmp") ||
    sLower.includes(".ico?") ||
    sLower.includes(".png?") ||
    sLower.includes(".svg?") ||
    s.includes("/") ||
    s.includes("\\")
  ) {
    return `<img src="${escapeHtmlStr(s)}" alt="icon" style="width: ${size}px; height: ${size}px; object-fit: contain; vertical-align: middle; border-radius: 4px; display: inline-block;" onerror="this.onerror=null;this.replaceWith(document.createTextNode('🔌'))" />`;
  }
  return escapeHtmlStr(s);
}

function showPluginToast(message, isError = false) {
  let toast = document.getElementById("plugin-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "plugin-toast";
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    document.body.appendChild(toast);
  }

  toast.style.backgroundColor = isError ? "var(--bg-card)" : "var(--bg-card)";
  toast.style.color = isError ? "var(--danger)" : "var(--success)";
  toast.style.border = `1px solid ${isError ? "var(--danger)" : "var(--border-focus)"}`;
  toast.innerHTML = `${isError ? "⚠️" : "✨"} <span>${escapeHtmlStr(message)}</span>`;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 3500);
}

// ─── Word Definition Bubble (context menu "Define" action) ────────────
window.addEventListener("context-menu:word-definition", (e) => {
  const { word, phonetic, meanings, x, y, rect } = e.detail || {};
  if (!word) return;

  // Remove any existing definition bubble
  const existing = document.getElementById("word-definition-bubble");
  if (existing) existing.remove();

  const bubble = document.createElement("div");
  bubble.id = "word-definition-bubble";

  const safeWord = escapeHtmlStr(word);
  const safePhonetic = phonetic ? escapeHtmlStr(phonetic) : "";
  const meaningsList = (meanings || []).map(m =>
    `<div style="margin-bottom: 4px; line-height: 1.45; color: #e4e4e7; font-size: 11.5px;">${escapeHtmlStr(m)}</div>`
  ).join("");

  bubble.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.08);">
      <div style="display: flex; align-items: baseline; gap: 6px; overflow: hidden;">
        <span style="font-size: 13px; font-weight: 700; color: #818cf8; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${safeWord}</span>
        ${safePhonetic ? `<span style="font-size: 11px; color: #a1a1aa; font-style: italic; white-space: nowrap;">${safePhonetic}</span>` : ""}
      </div>
      <button id="word-def-bubble-close" type="button" style="
        background: transparent;
        border: none;
        color: #71717a;
        font-size: 12px;
        width: 18px;
        height: 18px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        transition: color 0.15s, background 0.15s;
      " title="Close">✕</button>
    </div>
    <div style="max-height: 160px; overflow-y: auto; padding-right: 2px;">
      ${meaningsList || `<div style="color: #a1a1aa; font-size: 11.5px;">No definition available.</div>`}
    </div>
  `;

  // Base styling for sleek floating bubble
  const bubbleWidth = Math.min(300, window.innerWidth - 28);
  bubble.style.cssText = `
    position: fixed;
    width: ${bubbleWidth}px;
    background: rgba(18, 18, 24, 0.96);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 10px;
    padding: 10px 12px;
    z-index: 100000;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(99, 102, 241, 0.15);
    opacity: 0;
    transform: scale(0.94);
    transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    font-family: var(--font-main, 'Inter', sans-serif);
    pointer-events: auto;
  `;

  document.body.appendChild(bubble);

  // Calculate coordinates: place right beside or above/below the word
  const bubbleHeight = bubble.offsetHeight || 90;
  let anchorX = typeof x === "number" ? x : window.innerWidth / 2;
  let anchorTop = typeof y === "number" ? y : window.innerHeight / 2;
  let anchorBottom = anchorTop;

  if (rect && typeof rect.left === "number") {
    anchorX = (rect.left + rect.right) / 2;
    anchorTop = rect.top;
    anchorBottom = rect.bottom;
  }

  // Horizontal alignment: center on word, clamp to viewport edges
  let leftPos = anchorX - (bubbleWidth / 2);
  leftPos = Math.max(14, Math.min(window.innerWidth - bubbleWidth - 14, leftPos));

  // Vertical alignment: prefer directly above the word; if not enough space, place directly below
  let topPos;
  if (anchorTop > bubbleHeight + 20) {
    topPos = anchorTop - bubbleHeight - 8;
  } else {
    topPos = anchorBottom + 8;
  }
  topPos = Math.max(10, Math.min(window.innerHeight - bubbleHeight - 10, topPos));

  bubble.style.left = `${Math.round(leftPos)}px`;
  bubble.style.top = `${Math.round(topPos)}px`;

  // Animate in
  requestAnimationFrame(() => {
    bubble.style.opacity = "1";
    bubble.style.transform = "scale(1)";
  });

  // Close handlers
  const dismiss = () => {
    bubble.style.opacity = "0";
    bubble.style.transform = "scale(0.95)";
    setTimeout(() => bubble.remove(), 150);
    document.removeEventListener("mousedown", outsideClick);
    document.removeEventListener("keydown", escKey);
    window.removeEventListener("scroll", dismiss, true);
  };

  const closeBtn = document.getElementById("word-def-bubble-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", dismiss);
    closeBtn.addEventListener("mouseenter", () => { closeBtn.style.color = "#e4e4e7"; closeBtn.style.background = "rgba(255,255,255,0.08)"; });
    closeBtn.addEventListener("mouseleave", () => { closeBtn.style.color = "#71717a"; closeBtn.style.background = "transparent"; });
  }

  const outsideClick = (ev) => {
    if (!bubble.contains(ev.target)) {
      dismiss();
    }
  };
  const escKey = (ev) => {
    if (ev.key === "Escape") dismiss();
  };

  setTimeout(() => {
    document.addEventListener("mousedown", outsideClick);
    document.addEventListener("keydown", escKey);
    window.addEventListener("scroll", dismiss, { capture: true, passive: true });
  }, 50);

  // Auto-dismiss after 9 seconds
  setTimeout(() => {
    if (document.getElementById("word-definition-bubble") === bubble) {
      dismiss();
    }
  }, 9000);
});

async function loadPlugins() {
  try {
    const res = await fetch("/api/plugins");
    if (res.ok) {
      const data = await res.json();
      registeredPlugins = data.plugins || [];
      localStorage.setItem("ai_plate_plugins_cache", JSON.stringify(registeredPlugins));
      renderPlugins(registeredPlugins);
      syncTTSUIState();
      syncSTTUIState();
    }
  } catch (err) {
    console.warn("Failed to load plugins:", err);
  }
}

// Initial bootstrap load of plugins
loadPlugins();
syncSTTUIState();

window.handlePluginImageBrowse = async function (fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  const container = fileInput.closest(".plugin-param-field");
  const textInput = container ? container.querySelector(".plugin-param-image-input") : null;
  if (!textInput) return;

  // 1. Display clean, friendly filename immediately in the text box (never raw base64)
  textInput.value = file.name;
  textInput.dataset.filename = file.name;
  textInput.dataset.mediaUrl = `/api/media?name=${encodeURIComponent(file.name)}`;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;

    // 2. Upload file to backend server so it is cleanly persisted in SQLite & disk
    try {
      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, data: dataUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.filename) {
          textInput.value = data.filename;
          textInput.dataset.filename = data.filename;
          textInput.dataset.mediaUrl = data.url || `/api/media?name=${encodeURIComponent(data.filename)}`;
        }
      }
    } catch (err) {
      console.warn("Background media upload:", err);
    }
    textInput.dispatchEvent(new Event("input", { bubbles: true }));
    textInput.dispatchEvent(new Event("change", { bubbles: true }));

    // Auto-trigger apply if in a theme/wallpaper tool form
    const form = textInput.closest(".plugin-tool-form");
    if (form) {
      const applyBtn = form.querySelector(".btn-exec-plugin-tool");
      if (applyBtn) {
        applyBtn.click();
      }
    }
  };
  reader.readAsDataURL(file);
};

window.handlePluginConfigExport = function (btn) {
  const form = btn.closest(".plugin-tool-form");
  if (!form) return;
  const toolName = form.getAttribute("data-tool-name") || "config";
  const pluginId = form.getAttribute("data-plugin-id") || "plugin";
  const config = {};

  form.querySelectorAll(".plugin-param-input").forEach((input) => {
    const paramKey = input.getAttribute("data-param");
    if (!paramKey) return;
    if (input.type === "checkbox") {
      config[paramKey] = input.checked;
    } else if (input.type === "number") {
      config[paramKey] = input.value ? Number(input.value) : 0;
    } else {
      config[paramKey] = input.value || "";
    }
  });

  const exportPayload = {
    $schema: "https://aiplate.dev/schemas/theme-config.json",
    pluginId,
    toolName,
    exportedAt: new Date().toISOString(),
    config,
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const filename = `${config.preset || pluginId || "theme"}_config.json`.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showPluginToast(`📥 Exported theme configuration (${filename})`);
};

window.handlePluginConfigImport = function (fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  const form = fileInput.closest(".plugin-tool-form");
  if (!form) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const values = parsed.config || parsed.parameters || parsed.params || parsed;

      if (typeof values !== "object" || values === null) {
        throw new Error("Invalid configuration format.");
      }

      Object.entries(values).forEach(([key, val]) => {
        const input = form.querySelector(`.plugin-param-input[data-param="${key}"]`);
        if (!input) return;

        if (input.type === "checkbox") {
          input.checked = Boolean(val);
        } else {
          input.value = String(val === "none" && input.classList.contains("plugin-param-image-input") ? "" : val);
          if (input.classList.contains("plugin-param-image-input")) {
            input.dataset.filename = String(val);
            if (String(val).startsWith("/api/media")) {
              input.dataset.mediaUrl = String(val);
            }
          }
          // Sync associated color picker if this is a color text input
          const field = input.closest(".plugin-param-field");
          if (field) {
            const picker = field.querySelector(".plugin-param-color-picker");
            if (picker && /^#[0-9A-Fa-f]{6}$/i.test(String(val).trim())) {
              picker.value = String(val).trim();
            }
          }
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Auto-trigger Run / Apply for instant application
      const applyBtn = form.querySelector(".btn-exec-plugin-tool");
      if (applyBtn) {
        applyBtn.click();
      }

      showPluginToast(`✅ Imported theme config: ${file.name}`);
    } catch (err) {
      showPluginToast(`❌ Import error: ${err.message}`, true);
    }
    fileInput.value = ""; // reset file input
  };
  reader.readAsText(file);
};

window.handleSaveCustomPreset = function (btn) {
  const form = btn.closest(".plugin-tool-form");
  if (!form) return;
  const name = prompt("Enter a name for your custom theme preset (e.g. 'Cyber Amber', 'Solarized Dark'):");
  if (!name || !name.trim()) return;
  const presetName = name.trim();

  // 1. Gather all current form input values
  const config = {};
  form.querySelectorAll(".plugin-param-input").forEach((input) => {
    const paramKey = input.getAttribute("data-param");
    if (!paramKey || paramKey === "save_as_preset") return;
    if (input.type === "checkbox") {
      config[paramKey] = input.checked;
    } else if (input.type === "number") {
      config[paramKey] = input.value ? Number(input.value) : 0;
    } else {
      config[paramKey] = input.value || "";
    }
  });

  config.preset = presetName;
  config.name = presetName;

  // 2. Save into localStorage
  let presets = {};
  try {
    presets = JSON.parse(localStorage.getItem("ai_plate_custom_presets") || "{}");
  } catch (e) {}
  presets[presetName] = config;
  localStorage.setItem("ai_plate_custom_presets", JSON.stringify(presets));

  // 3. Update preset select dropdown
  const select = form.querySelector('.plugin-param-preset-select[data-param="preset"]');
  if (select) {
    let customGroup = select.querySelector('optgroup[label="✨ User Custom Presets"]');
    if (!customGroup) {
      customGroup = document.createElement("optgroup");
      customGroup.label = "✨ User Custom Presets";
      select.appendChild(customGroup);
    }
    let existingOpt = customGroup.querySelector(`option[value="custom:${presetName}"]`);
    if (!existingOpt) {
      existingOpt = document.createElement("option");
      existingOpt.value = `custom:${presetName}`;
      existingOpt.textContent = `✨ ${presetName}`;
      customGroup.appendChild(existingOpt);
    }
    select.value = `custom:${presetName}`;
    const delBtn = form.querySelector(".btn-delete-custom-preset");
    if (delBtn) delBtn.style.display = "inline-block";
  }

  // 4. Trigger apply with save_as_preset parameter
  const applyBtn = form.querySelector(".btn-exec-plugin-tool");
  if (applyBtn) {
    applyBtn.click();
  }

  showPluginToast(`✨ Saved and applied custom preset: "${presetName}"`);
};

window.THEME_PALETTES = window.THEME_PALETTES || {
  "nordic-dark": { preset: "nordic-dark", font_family: "Plus Jakarta Sans", accent_color: "#6366f1", bg_app_color: "#0c0e14", bg_card_color: "#151924", text_main_color: "#f1f5f9", border_color: "#26262e", border_radius: "10px", bg_image: "none" },
  "tokyo-night": { preset: "tokyo-night", font_family: "Plus Jakarta Sans", accent_color: "#7aa2f7", bg_app_color: "#13141f", bg_card_color: "#1a1b2e", text_main_color: "#c0caf5", border_color: "#282b45", border_radius: "10px", bg_image: "none" },
  "cyberpunk": { preset: "cyberpunk", font_family: "Orbitron", accent_color: "#ec4899", bg_app_color: "#080811", bg_card_color: "#141428", text_main_color: "#00f2fe", border_color: "#2a2a52", border_radius: "6px", bg_image: "none" },
  "emerald-forest": { preset: "emerald-forest", font_family: "DM Sans", accent_color: "#10b981", bg_app_color: "#06130e", bg_card_color: "#0e2920", text_main_color: "#ecfdf5", border_color: "#164536", border_radius: "12px", bg_image: "none" },
  "sunset-rose": { preset: "sunset-rose", font_family: "Outfit", accent_color: "#f43f5e", bg_app_color: "#160b12", bg_card_color: "#2c1424", text_main_color: "#fff1f2", border_color: "#4d2440", border_radius: "14px", bg_image: "none" },
  "dracula": { preset: "dracula", font_family: "Fira Code", accent_color: "#bd93f9", bg_app_color: "#1e1f29", bg_card_color: "#282a36", text_main_color: "#f8f8f2", border_color: "#44475a", border_radius: "10px", bg_image: "none" },
  "pure-slate": { preset: "pure-slate", font_family: "Inter", accent_color: "#38bdf8", bg_app_color: "#090d16", bg_card_color: "#0f172a", text_main_color: "#f8fafc", border_color: "#334155", border_radius: "8px", bg_image: "none" },
  "monochrome-oled": { preset: "monochrome-oled", font_family: "JetBrains Mono", accent_color: "#ffffff", bg_app_color: "#000000", bg_card_color: "#0a0a0a", text_main_color: "#ffffff", border_color: "#262626", border_radius: "4px", bg_image: "none" },
  "paper-light": { preset: "paper-light", font_family: "Playfair Display", accent_color: "#111827", bg_app_color: "#fbfbfb", bg_card_color: "#ffffff", text_main_color: "#111827", border_color: "#e5e7eb", border_radius: "8px", bg_image: "none" }
};
const BUILTIN_THEME_PALETTES = window.THEME_PALETTES;

window.ICON_PRESET_PALETTES = {
  "modern-minimalist": {
    preset: "modern-minimalist",
    style: "outlined",
    icon_weight: "400",
    icon_fill: false,
    icon_size: "18px",
    history_glyph: "schedule",
    chat_glyph: "chat_bubble_outline",
    kb_glyph: "auto_stories",
    artifacts_glyph: "grid_view",
    settings_glyph: "tune",
    send_glyph: "arrow_upward",
    new_chat_glyph: "edit_square",
    tools_glyph: "auto_awesome",
    tokens_glyph: "monitoring",
    reasoning_glyph: "psychology",
    settings_models_glyph: "smart_toy",
    settings_plugins_glyph: "extension",
    settings_connectors_glyph: "hub",
    settings_security_glyph: "security",
    settings_config_glyph: "tune"
  },
  "creative-studio": {
    preset: "creative-studio",
    style: "rounded",
    icon_weight: "500",
    icon_fill: true,
    icon_size: "20px",
    history_glyph: "restore",
    chat_glyph: "forum",
    kb_glyph: "library_books",
    artifacts_glyph: "deployed_code",
    settings_glyph: "settings",
    send_glyph: "send",
    new_chat_glyph: "add_circle",
    tools_glyph: "extension",
    tokens_glyph: "analytics",
    reasoning_glyph: "psychology",
    settings_models_glyph: "smart_toy",
    settings_plugins_glyph: "extension",
    settings_connectors_glyph: "link",
    settings_security_glyph: "shield",
    settings_config_glyph: "settings"
  },
  "tech-cyber-sharp": {
    preset: "tech-cyber-sharp",
    style: "sharp",
    icon_weight: "600",
    icon_fill: false,
    icon_size: "18px",
    history_glyph: "manage_history",
    chat_glyph: "sms",
    kb_glyph: "folder_special",
    artifacts_glyph: "inventory_2",
    settings_glyph: "construction",
    send_glyph: "north",
    new_chat_glyph: "post_add",
    tools_glyph: "terminal",
    tokens_glyph: "query_stats",
    reasoning_glyph: "neurology",
    settings_models_glyph: "memory",
    settings_plugins_glyph: "handyman",
    settings_connectors_glyph: "cable",
    settings_security_glyph: "verified_user",
    settings_config_glyph: "construction"
  },
  "academic-researcher": {
    preset: "academic-researcher",
    style: "outlined",
    icon_weight: "400",
    icon_fill: false,
    icon_size: "18px",
    history_glyph: "bookmark",
    chat_glyph: "question_answer",
    kb_glyph: "school",
    artifacts_glyph: "workspaces",
    settings_glyph: "manage_accounts",
    send_glyph: "publish",
    new_chat_glyph: "create",
    tools_glyph: "psychology",
    tokens_glyph: "bar_chart",
    reasoning_glyph: "science",
    settings_models_glyph: "psychology",
    settings_plugins_glyph: "widgets",
    settings_connectors_glyph: "share",
    settings_security_glyph: "policy",
    settings_config_glyph: "build"
  },
  "bold-filled": {
    preset: "bold-filled",
    style: "rounded",
    icon_weight: "700",
    icon_fill: true,
    icon_size: "20px",
    history_glyph: "history",
    chat_glyph: "chat",
    kb_glyph: "menu_book",
    artifacts_glyph: "dashboard",
    settings_glyph: "settings",
    send_glyph: "near_me",
    new_chat_glyph: "add",
    tools_glyph: "auto_awesome",
    tokens_glyph: "equalizer",
    reasoning_glyph: "psychology",
    settings_models_glyph: "smart_toy",
    settings_plugins_glyph: "power",
    settings_connectors_glyph: "hub",
    settings_security_glyph: "shield",
    settings_config_glyph: "settings"
  }
};

window.handlePresetSelectChange = function (select) {
  const form = select.closest(".plugin-tool-form");
  if (!form) return;
  const card = select.closest(".plugin-card");
  const isCardDisabled = card && card.classList.contains("disabled");

  const val = select.value;
  const delBtn = form.querySelector(".btn-delete-custom-preset");

  let config = null;

  if (val.startsWith("custom:")) {
    const presetName = val.replace(/^custom:/, "");
    if (delBtn) delBtn.style.display = "inline-block";
    let presets = {};
    try {
      presets = JSON.parse(localStorage.getItem("ai_plate_custom_presets") || "{}");
    } catch (e) {}
    config = presets[presetName];
  } else {
    if (delBtn) delBtn.style.display = "none";
    config = (window.THEME_PALETTES && window.THEME_PALETTES[val]) ||
             (window.ICON_PRESET_PALETTES && window.ICON_PRESET_PALETTES[val]) ||
             (typeof BUILTIN_THEME_PALETTES !== "undefined" && BUILTIN_THEME_PALETTES[val]);
  }

  if (config) {
    Object.entries(config).forEach(([k, v]) => {
      if (k === "preset" || k === "name") return;
      const input = form.querySelector(`.plugin-param-input[data-param="${k}"]`);
      if (!input) return;
      if (input.type === "checkbox") {
        input.checked = Boolean(v);
      } else {
        if (input.classList.contains("plugin-param-image-input")) {
          // If preset specifies an image (not "none" and not empty), set it; otherwise keep user's wallpaper
          if (v && v !== "none") {
            input.value = String(v);
            input.dataset.filename = String(v);
          }
        } else {
          input.value = String(v);
        }

        const field = input.closest(".plugin-param-field");
        if (field) {
          const picker = field.querySelector(".plugin-param-color-picker");
          if (picker && /^#[0-9A-Fa-f]{6}$/i.test(String(v).trim())) {
            picker.value = String(v).trim();
          }
        }
      }
    });

    // Only auto-apply if the plugin is currently enabled
    if (!isCardDisabled) {
      const applyBtn = form.querySelector(".btn-exec-plugin-tool");
      if (applyBtn) applyBtn.click();
    }
  }
};

function getPluginsCollapsedState() {
  try {
    return JSON.parse(localStorage.getItem("ai_plate_plugins_collapsed_state") || "{}");
  } catch {
    return {};
  }
}

function setPluginCollapsedState(id, isCollapsed) {
  try {
    const state = getPluginsCollapsedState();
    if (isCollapsed) {
      state[id] = true;
    } else {
      delete state[id];
    }
    localStorage.setItem("ai_plate_plugins_collapsed_state", JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to persist plugin collapsed state:", e);
  }
}

function renderPlugins(plugins) {
  if (!pluginsListContainer) return;
  pluginsListContainer.innerHTML = "";

  const total = plugins.length;
  const activeCount = plugins.filter((p) => p.enabled).length;

  if (pluginsActiveCountBadge) {
    pluginsActiveCountBadge.textContent = `${activeCount}/${total}`;
    pluginsActiveCountBadge.style.color = activeCount === 0 ? "var(--danger)" : "var(--success)";
  }

  pluginsListContainer.innerHTML = "";

  const builtinPlugins = plugins.filter((p) => !p.isCustom && !p.canUninstall);
  const customPlugins = plugins.filter((p) => p.isCustom || p.canUninstall);
  const collapsedState = getPluginsCollapsedState();

  const buildGenericPluginControlsHtml = (plugin) => {
    if (!plugin.tools || !plugin.tools.length) return "";

    const configurableTools = plugin.tools.filter((t) => {
      const schema = t.parametersJsonSchema || t.parameters;
      const hasProps = schema && schema.properties && Object.keys(schema.properties).length > 0;
      const hasUiControls =
        t.ui_controls === true ||
        plugin.ui_controls === true ||
        plugin.isCustom === true ||
        plugin.category === "theme" ||
        plugin.category === "creative" ||
        Boolean(plugin.manifest && plugin.manifest.ui_extension) ||
        t.name.includes("theme") ||
        t.name.includes("icon");
      return hasProps && hasUiControls;
    });

    if (!configurableTools.length) return "";

    return configurableTools
      .map((tool) => {
        const schema = tool.parametersJsonSchema || tool.parameters || {};
        const properties = schema.properties || {};
        const propKeys = Object.keys(properties);
        const isThemeTool = tool.name.includes("theme") || tool.name.includes("style") || plugin.id.includes("theme");

        let savedParams = {};
        try {
          if (isThemeTool) {
            const savedTheme = localStorage.getItem("ai_plate_active_theme");
            if (savedTheme) {
              savedParams = JSON.parse(savedTheme);
            }
          }
          const savedToolParams = localStorage.getItem(`ai_plate_plugin_params_${plugin.id}_${tool.name}`);
          if (savedToolParams) {
            savedParams = Object.assign({}, savedParams, JSON.parse(savedToolParams));
          }
        } catch {}

        const fieldsHtml = propKeys
          .map((key) => {
            if (key === "save_as_preset") return "";
            const prop = properties[key] || {};
            const label = prop.title || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const desc = prop.description ? escapeHtmlStr(prop.description) : "";
            const defaultVal = prop.default !== undefined ? prop.default : "";

            // 1. Preset Dropdown with Custom Presets Support
            if (key === "preset" && Array.isArray(prop.enum)) {
              let customPresetsObj = {};
              try {
                customPresetsObj = JSON.parse(localStorage.getItem("ai_plate_custom_presets") || "{}");
              } catch (e) {}
              const customKeys = Object.keys(customPresetsObj);
              const activePreset = String(savedParams.preset || defaultVal || "nordic-dark");

              const customOptsHtml =
                customKeys.length > 0
                  ? `
                <optgroup label="✨ User Custom Presets">
                  ${customKeys.map((k) => {
                    const isSelected = activePreset === `custom:${k}` ? "selected" : "";
                    return `<option value="custom:${escapeHtmlStr(k)}" ${isSelected}>✨ ${escapeHtmlStr(k)}</option>`;
                  }).join("")}
                </optgroup>
              `
                  : "";

              const options = prop.enum
                .map((opt) => {
                  const isSelected = String(opt) === activePreset ? "selected" : "";
                  return `<option value="${escapeHtmlStr(String(opt))}" ${isSelected}>${escapeHtmlStr(String(opt))}</option>`;
                })
                .join("");

              return `
                <div class="plugin-param-field" style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                  <div style="display: flex; align-items: center; justify-content: space-between; min-width: 0;">
                    <label style="font-size: 11px; color: var(--text-dim); font-weight: 500;" title="${desc}">${escapeHtmlStr(label)}</label>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="window.handleSaveCustomPreset(this)" style="font-size: 10px; padding: 2px 7px; height: 20px; line-height: 1;" title="Save current settings as a reusable custom preset">
                      💾 Save Preset
                    </button>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0;">
                    <select class="custom-select plugin-param-input plugin-param-preset-select" data-param="${escapeHtmlStr(key)}" onchange="window.handlePresetSelectChange(this)" style="flex: 1; min-width: 0; font-size: 11.5px; padding: 6px 8px;">
                      <optgroup label="Built-in Presets">
                        ${options}
                      </optgroup>
                      ${customOptsHtml}
                    </select>
                    <button type="button" class="btn btn-secondary btn-xs btn-delete-custom-preset" onclick="window.handleDeleteCustomPreset(this)" title="Delete selected custom preset" style="${activePreset.startsWith('custom:') ? 'display: inline-block;' : 'display: none;'} font-size: 11px; padding: 5px 8px; color: var(--danger);">
                      🗑️
                    </button>
                  </div>
                </div>
              `;
            }

            // 2. Generic Enum dropdown
            if (Array.isArray(prop.enum) && prop.enum.length > 0) {
              const activeVal = String(savedParams[key] !== undefined ? savedParams[key] : (defaultVal !== undefined ? defaultVal : ""));
              const options = prop.enum
                .map((opt) => {
                  const isSelected = String(opt) === activeVal ? "selected" : "";
                  return `<option value="${escapeHtmlStr(String(opt))}" ${isSelected}>${escapeHtmlStr(String(opt))}</option>`;
                })
                .join("");
              return `
                <div class="plugin-param-field" style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                  <label style="font-size: 11px; color: var(--text-dim); font-weight: 500;" title="${desc}">${escapeHtmlStr(label)}</label>
                  <select class="custom-select plugin-param-input" data-param="${escapeHtmlStr(key)}" style="width: 100%; min-width: 0; font-size: 11.5px; padding: 6px 8px;">
                    ${options}
                  </select>
                </div>
              `;
            }

            // 3. Boolean checkbox
            if (prop.type === "boolean") {
              const isChecked = savedParams[key] !== undefined ? Boolean(savedParams[key]) : Boolean(defaultVal);
              return `
                <div class="plugin-param-field" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; min-width: 0;">
                  <input type="checkbox" class="plugin-param-input" data-param="${escapeHtmlStr(key)}" id="param-${plugin.id}-${key}" ${isChecked ? "checked" : ""} style="cursor: pointer;" />
                  <label for="param-${plugin.id}-${key}" style="font-size: 11.5px; color: var(--text-main); cursor: pointer;" title="${desc}">${escapeHtmlStr(label)}</label>
                </div>
              `;
            }

            // 4. Color picker (if property name has color/accent)
            if (key.includes("color") || key.includes("accent")) {
              const activeVal = String(savedParams[key] !== undefined ? savedParams[key] : (defaultVal || "#6366f1"));
              const hexVal = activeVal.startsWith("#") ? activeVal : "#6366f1";
              return `
                <div class="plugin-param-field" style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                  <label style="font-size: 11px; color: var(--text-dim); font-weight: 500;" title="${desc}">${escapeHtmlStr(label)}</label>
                  <div style="display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0;">
                    <input type="color" class="plugin-param-color-picker" value="${hexVal}" style="width: 32px; height: 30px; padding: 0; border: 1px solid var(--border-subtle); border-radius: 4px; background: transparent; cursor: pointer; flex-shrink: 0;" />
                    <input type="text" class="custom-input plugin-param-input plugin-param-color-text" data-param="${escapeHtmlStr(key)}" value="${escapeHtmlStr(activeVal)}" placeholder="#6366f1" style="flex: 1; min-width: 0; font-size: 11.5px; font-family: monospace; padding: 5px 8px;" />
                  </div>
                </div>
              `;
            }

            // 5. Browsable Image / Wallpaper / File Picker (Spans Full Width across grid)
            if (key.includes("image") || key.includes("wallpaper") || key.includes("bg_image") || key.includes("file_path")) {
              let imgVal = "";
              if (savedParams.wallpaper_name && savedParams.wallpaper_name !== "none") {
                imgVal = savedParams.wallpaper_name;
              } else if (savedParams.bg_image && savedParams.bg_image !== "none") {
                imgVal = savedParams.bg_image;
              } else if (savedParams[key] && savedParams[key] !== "none") {
                imgVal = String(savedParams[key]);
              } else if (defaultVal && defaultVal !== "none") {
                imgVal = String(defaultVal);
              }
              return `
                <div class="plugin-param-field full-width" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; min-width: 0; width: 100%;">
                  <label style="font-size: 11px; color: var(--text-dim); font-weight: 500;" title="${desc}">${escapeHtmlStr(label)}</label>
                  <div class="plugin-param-input-group" style="display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;">
                    <input type="text" class="custom-input plugin-param-input plugin-param-image-input" data-param="${escapeHtmlStr(key)}" value="${escapeHtmlStr(imgVal)}" data-filename="${escapeHtmlStr(imgVal)}" placeholder="${desc || 'Custom image path, URL, or click Browse'}" style="flex: 1; min-width: 0; font-size: 11.5px; padding: 6px 10px;" />
                    <input type="file" accept="image/*" class="plugin-param-image-file-hidden" style="display: none;" onchange="handlePluginImageBrowse(this)" />
                    <button type="button" class="btn btn-secondary btn-xs" onclick="this.previousElementSibling.click()" style="font-size: 11px; padding: 6px 12px; white-space: nowrap; flex-shrink: 0;">
                      📁 Browse
                    </button>
                  </div>
                </div>
              `;
            }

            // 6. Default string / number / text input
            const activeText = savedParams[key] !== undefined ? savedParams[key] : (defaultVal !== undefined ? defaultVal : "");
            return `
              <div class="plugin-param-field" style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                <label style="font-size: 11px; color: var(--text-dim); font-weight: 500;" title="${desc}">${escapeHtmlStr(label)}</label>
                <input type="${prop.type === "number" ? "number" : "text"}" class="custom-input plugin-param-input" data-param="${escapeHtmlStr(key)}" value="${escapeHtmlStr(String(activeText))}" placeholder="${desc || escapeHtmlStr(label)}" style="width: 100%; min-width: 0; font-size: 11.5px; padding: 6px 8px;" />
              </div>
            `;
          })
          .join("");

        return `
          <div class="plugin-tool-form" data-plugin-id="${escapeHtmlStr(plugin.id)}" data-tool-name="${escapeHtmlStr(tool.name)}" style="margin-top: 12px; padding: 14px 16px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-subtle); border-radius: 8px; display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--text-main);">
              <span style="display: flex; align-items: center; gap: 6px;">⚡ ${escapeHtmlStr(tool.name)}</span>
              <span style="font-size: 10.5px; color: var(--text-accent); background: rgba(99,102,241,0.15); padding: 1px 6px; border-radius: var(--radius-pill);">Live Controls</span>
            </div>

            <div class="plugin-tool-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; width: 100%; box-sizing: border-box;">
              ${fieldsHtml}
            </div>

            <div class="plugin-tool-actions" style="display: flex; align-items: center; gap: 8px; justify-content: space-between; flex-wrap: wrap; margin-top: 6px; padding-top: 8px; border-top: 1px solid rgba(255,255,0.06);">
              <div style="display: flex; align-items: center; gap: 6px;">
                <input type="file" accept=".json,application/json" class="plugin-import-config-hidden" style="display: none;" onchange="window.handlePluginConfigImport(this)" />
                <button type="button" class="btn btn-secondary btn-xs btn-import-plugin-config" onclick="this.previousElementSibling.click()" title="Import JSON configuration" style="font-size: 11px; padding: 5px 9px;">
                  📤 Import
                </button>
                <button type="button" class="btn btn-secondary btn-xs btn-export-plugin-config" onclick="window.handlePluginConfigExport(this)" title="Export JSON configuration" style="font-size: 11px; padding: 5px 9px;">
                  📥 Export
                </button>
              </div>

              <div style="display: flex; align-items: center; gap: 8px;">
                ${
                  isThemeTool
                    ? `
                  <button type="button" class="btn btn-secondary btn-xs btn-reset-dynamic-theme" style="font-size: 11.5px; padding: 5px 10px;">
                    🔄 Reset Default
                  </button>
                `
                    : ""
                }
                <button type="button" class="btn btn-primary btn-xs btn-exec-plugin-tool" data-plugin-id="${escapeHtmlStr(plugin.id)}" data-tool-name="${escapeHtmlStr(tool.name)}" style="font-size: 11.5px; padding: 5px 12px; font-weight: 600;">
                  ✨ Run / Apply
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  };

  const createPluginCardElement = (plugin) => {
    const isCardCollapsed = Boolean(collapsedState[plugin.id]);
    const card = document.createElement("div");
    card.className = `plugin-card ${plugin.enabled ? "" : "disabled"} ${isCardCollapsed ? "collapsed" : ""}`;
    card.id = `plugin-card-${plugin.id}`;

    const toolsChips = (plugin.tools || [])
      .map(
        (t) => `
        <span class="plugin-tool-chip" title="${escapeHtmlStr(t.description || "")}">
          ⚡ ${escapeHtmlStr(t.name)}
        </span>
      `
      )
      .join("");

    const isCustom = Boolean(plugin.isCustom || plugin.canUninstall);

    card.innerHTML = `
      <div class="plugin-card-header" title="Click to collapse / expand plugin details">
        <div class="plugin-title-group">
          <button class="btn-plugin-collapse" type="button" title="Collapse / Expand">▼</button>
          <span class="plugin-icon">${renderPluginIcon(plugin.icon || "🔌")}</span>
          <div class="plugin-title-text">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span class="plugin-name">${escapeHtmlStr(plugin.name)}</span>
              <span class="plugin-badge ${isCustom ? "plugin-badge-custom" : "plugin-badge-builtin"}">
                ${isCustom ? "📦 Custom" : "⚡ Built-in"}
              </span>
            </div>
            <span class="plugin-status-badge ${plugin.enabled ? "active" : "disabled"}" id="badge-${plugin.id}">
              ${plugin.enabled ? "Active" : "Disabled"}
            </span>
          </div>
        </div>

        <div class="plugin-card-toolbar">
          ${
            isCustom
              ? `
            <button class="btn-plugin-action" id="export-${plugin.id}" title="Export as .zip package" type="button">
              ⬇️
            </button>
            <button class="btn-plugin-action btn-plugin-uninstall" id="uninstall-${plugin.id}" title="Uninstall Plugin" type="button">
              🗑️
            </button>
          `
              : ""
          }
          <label class="plugin-toggle-switch" title="Toggle ${escapeHtmlStr(plugin.name)}">
            <input type="checkbox" id="toggle-${plugin.id}" ${plugin.enabled ? "checked" : ""}>
            <span class="plugin-toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="plugin-card-body">
        <div class="plugin-desc">${escapeHtmlStr(plugin.description || "")}</div>

        ${buildGenericPluginControlsHtml(plugin)}
        ${plugin.id === "tts" ? buildTTSPluginControlsHtml(plugin) : ""}
        ${plugin.id === "stt" ? buildSTTPluginControlsHtml(plugin) : ""}

        ${
          toolsChips
            ? `
          <div class="plugin-tools-section">
            <span class="plugin-tools-label">Tools (${plugin.tools.length}):</span>
            ${toolsChips}
          </div>
        `
            : ""
        }
      </div>
    `;

    // Wire collapsible card header click with state persistence
    const header = card.querySelector(".plugin-card-header");
    if (header) {
      header.addEventListener("click", (e) => {
        if (e.target.closest(".plugin-card-toolbar") || e.target.closest(".plugin-toggle-switch")) return;
        const nowCollapsed = card.classList.toggle("collapsed");
        setPluginCollapsedState(plugin.id, nowCollapsed);
      });
    }

    // Wire generic color picker sync for all tools in this card
    card.querySelectorAll(".plugin-tool-form").forEach((form) => {
      form.querySelectorAll(".plugin-param-field").forEach((field) => {
        const picker = field.querySelector(".plugin-param-color-picker");
        const text = field.querySelector(".plugin-param-color-text");
        if (picker && text) {
          picker.addEventListener("input", () => {
            text.value = picker.value;
          });
          text.addEventListener("input", () => {
            if (/^#[0-9A-Fa-f]{6}$/i.test(text.value.trim())) {
              picker.value = text.value.trim();
            }
          });
        }
      });
    });

    // Wire live tool execution buttons
    card.querySelectorAll(".btn-exec-plugin-tool").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const toolName = btn.getAttribute("data-tool-name");
        const form = btn.closest(".plugin-tool-form");
        const pluginId = btn.getAttribute("data-plugin-id") || (form ? form.getAttribute("data-plugin-id") : "plugin");
        const params = {};

        if (form) {
          form.querySelectorAll(".plugin-param-input").forEach((input) => {
            const paramKey = input.getAttribute("data-param");
            if (!paramKey) return;
            if (input.type === "checkbox") {
              params[paramKey] = input.checked;
            } else if (input.type === "number") {
              params[paramKey] = input.value ? Number(input.value) : undefined;
            } else if (input.classList.contains("plugin-param-image-input")) {
              const val = (input.value || "").trim();
              if (!val || val === "none") {
                params[paramKey] = "none";
              } else if (input.dataset.mediaUrl && val === input.dataset.filename) {
                params[paramKey] = input.dataset.mediaUrl;
              } else if (/^[a-zA-Z]:[\\/]|^file:\/\/\//i.test(val)) {
                params[paramKey] = `/api/media?name=${encodeURIComponent(val)}`;
              } else if (val.startsWith("/") || val.startsWith("http://") || val.startsWith("https://")) {
                params[paramKey] = val;
              } else {
                params[paramKey] = `/api/media?name=${encodeURIComponent(val)}`;
              }
            } else {
              params[paramKey] = input.value;
            }
          });
        }

        // Persist parameters in localStorage
        try {
          localStorage.setItem(`ai_plate_plugin_params_${pluginId}_${toolName}`, JSON.stringify(params));
        } catch {}

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span>⏳ Applying...</span>`;

        try {
          const res = await fetch("/api/tools/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: toolName, args: params }),
          });
          const data = await res.json();
          if (data.success && data.result) {
            const resData = data.result;
            if (resData.ui_type === "theme" || resData.css || resData.theme_css || resData.custom_css) {
              window.applyDynamicThemeDirect(resData, true);
            } else if (resData.message) {
              showPluginToast(`✅ ${escapeHtmlStr(resData.message)}`);
            } else if (resData.what_happened) {
              showPluginToast(`✅ ${escapeHtmlStr(resData.what_happened)}`);
            } else {
              showPluginToast(`✅ Tool "${toolName}" executed successfully.`);
            }
          } else {
            showPluginToast(`❌ Execution failed: ${data.error || "Unknown error"}`);
          }
        } catch (err) {
          showPluginToast(`❌ Error: ${err.message}`);
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    });

    // Wire reset theme button if present
    card.querySelectorAll(".btn-reset-dynamic-theme").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.resetDynamicTheme(true);
      });
    });

    // Wire toggle listener
    const checkbox = card.querySelector(`#toggle-${plugin.id}`);
    if (checkbox) {
      checkbox.addEventListener("change", async (e) => {
        const isChecked = e.target.checked;
        await togglePlugin(plugin.id, isChecked);
      });
    }

    // Wire export listener (only for custom plugins)
    const btnExport = card.querySelector(`#export-${plugin.id}`);
    if (btnExport) {
      btnExport.addEventListener("click", () => {
        window.open(`/api/plugins/export?id=${encodeURIComponent(plugin.id)}`, "_blank");
      });
    }

    // Wire uninstall listener (only for custom plugins)
    const btnUninstall = card.querySelector(`#uninstall-${plugin.id}`);
    if (btnUninstall) {
      btnUninstall.addEventListener("click", async () => {
        const confirmed = await showThemedConfirm({
          title: "Uninstall Plugin",
          message: `Are you sure you want to uninstall "${plugin.name}"? Custom tools and extensions provided by this plugin will be removed.`,
          confirmText: "Uninstall",
          icon: "🧩",
          danger: true,
        });
        if (confirmed) {
          await uninstallCustomPlugin(plugin.id);
        }
      });
    }

    if (plugin.id === "tts") {
      initTTSPluginControls(card);
    }
    if (plugin.id === "stt") {
      initSTTPluginControls(card);
    }

    return card;
  };

  // 1. Render Built-in Tools Group
  if (builtinPlugins.length > 0) {
    const isBuiltinCollapsed = Boolean(collapsedState["_section_builtin"]);
    const builtinGroup = document.createElement("div");
    builtinGroup.className = `plugins-section-group ${isBuiltinCollapsed ? "collapsed" : ""}`;
    builtinGroup.innerHTML = `
      <div class="plugins-section-header" title="Click to collapse / expand section">
        <div class="plugins-section-title-wrap">
          <span class="section-collapse-caret">▼</span>
          <h4 class="plugins-section-title">🏛️ Built-in Engine Tools</h4>
          <span class="plugins-section-desc">Core agent capabilities. Protected and non-exportable.</span>
        </div>
        <span class="plugins-section-count">${builtinPlugins.length} tools</span>
      </div>
      <div class="plugins-section-list"></div>
    `;
    const header = builtinGroup.querySelector(".plugins-section-header");
    if (header) {
      header.addEventListener("click", () => {
        const nowCollapsed = builtinGroup.classList.toggle("collapsed");
        setPluginCollapsedState("_section_builtin", nowCollapsed);
      });
    }
    const list = builtinGroup.querySelector(".plugins-section-list");
    builtinPlugins.forEach((p) => list.appendChild(createPluginCardElement(p)));
    pluginsListContainer.appendChild(builtinGroup);
  }

  // 2. Render Custom & Community Plugins Group
  const isCustomSectionCollapsed = Boolean(collapsedState["_section_custom"]);
  const customGroup = document.createElement("div");
  customGroup.className = `plugins-section-group ${isCustomSectionCollapsed ? "collapsed" : ""}`;
  customGroup.innerHTML = `
    <div class="plugins-section-header" title="Click to collapse / expand section">
      <div class="plugins-section-title-wrap">
        <span class="section-collapse-caret">▼</span>
        <h4 class="plugins-section-title">📦 Installed Plugin Bundles</h4>
        <span class="plugins-section-desc">Self-contained ZIP packages and modular bundles in plugins/installed/.</span>
      </div>
      <span class="plugins-section-count">${customPlugins.length} plugins</span>
    </div>
    <div class="plugins-section-list"></div>
  `;
  const customHeader = customGroup.querySelector(".plugins-section-header");
  if (customHeader) {
    customHeader.addEventListener("click", () => {
      const nowCollapsed = customGroup.classList.toggle("collapsed");
      setPluginCollapsedState("_section_custom", nowCollapsed);
    });
  }
  const customList = customGroup.querySelector(".plugins-section-list");

  if (customPlugins.length > 0) {
    customPlugins.forEach((p) => customList.appendChild(createPluginCardElement(p)));
  } else {
    customList.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 18px 12px; background: var(--bg-hover); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); font-size: 12.5px;">
        No plugins installed yet. Drop <code>.zip</code> packages above or click <strong>📂 Browse Package</strong> to add your own.
      </div>
    `;
  }
  pluginsListContainer.appendChild(customGroup);
}

async function installPluginPackage(manifestObj) {
  try {
    const res = await fetch("/api/plugins/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifestObj),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      registeredPlugins = data.plugins;
      localStorage.setItem("ai_plate_plugins_cache", JSON.stringify(registeredPlugins));
      renderPlugins(registeredPlugins);
      if (window.PluginUIHost) await window.PluginUIHost.refresh();
      showPluginToast(`Installed "${data.plugin?.name || 'Plugin'}" successfully!`);
    } else {
      showPluginToast(data.error || "Installation failed.", true);
    }
  } catch (err) {
    showPluginToast("Failed to install plugin: " + err.message, true);
  }
}

window.teardownPluginEffects = function (pluginId) {
  if (!pluginId) return;
  const pId = String(pluginId).toLowerCase();

  // 1. Remove all plugin-specific style tags and font links
  const targetStyleIds = [
    `plugin-ext-${pluginId}`,
    `plugin-ext-${pId}`,
    "ai-plate-dynamic-plugin-theme",
    "ai-plate-dynamic-plugin-font",
    "ai-plate-dynamic-icon-theme",
    "ai-plate-dynamic-icon-font",
  ];
  targetStyleIds.forEach((sId) => {
    const el = document.getElementById(sId);
    if (el) el.remove();
  });

  document.querySelectorAll(`style[data-plugin-id="${pluginId}"], link[data-plugin-id="${pluginId}"]`).forEach((el) => el.remove());

  // 2. Remove all external injected DOM containers, modals, sidebars, buttons, widgets
  document.querySelectorAll(
    `#plugin-modal-${pluginId}, #plugin-panel-${pluginId}, #plugin-widget-${pluginId}, .plugin-injected-${pluginId}`
  ).forEach((el) => el.remove());

  // Only remove extension elements outside the settings plugin list (do NOT destroy plugin card tools)
  document.querySelectorAll(`[data-plugin-id="${pluginId}"]`).forEach((el) => {
    if (!el.closest("#plugins-list") && !el.closest(".plugin-card") && !el.classList.contains("plugins-section-group")) {
      el.remove();
    }
  });

  // 3. Theme & UI Styling Reversion (Reset all CSS variables to pristine defaults)
  if (pId.includes("theme") || pId.includes("style") || pId.includes("minimalist") || pId.includes("custom") || pId.includes("nordic")) {
    document.documentElement.style.removeProperty("--accent-primary");
    document.documentElement.style.removeProperty("--accent-secondary");
    document.documentElement.style.removeProperty("--bg-app");
    document.documentElement.style.removeProperty("--bg-card");
    document.documentElement.style.removeProperty("--text-main");
    document.documentElement.style.removeProperty("--border-color");
    document.documentElement.style.removeProperty("--border-radius");
    document.documentElement.style.removeProperty("--font-sans");
    document.documentElement.style.removeProperty("--bg-image");

    localStorage.removeItem("ai_plate_active_theme");
    localStorage.removeItem("ai_plate_custom_theme");
    localStorage.removeItem("ai_plate_custom_presets");

    if (typeof window.resetDynamicTheme === "function") {
      window.resetDynamicTheme(false);
    }
  }

  // 4. Icon Pack Reversion
  if (pId.includes("icon") || pId.includes("material") || pId.includes("symbol")) {
    localStorage.removeItem("ai_plate_active_icon_pack");
    if (typeof window.resetDynamicIconPack === "function") {
      window.resetDynamicIconPack(false);
    }
  }

  // 5. Clean up tool inputs and localStorage params for this plugin
  document.querySelectorAll(`.plugin-tool-form[data-plugin-id="${pluginId}"] .plugin-param-input`).forEach((inp) => {
    if (inp.classList.contains("plugin-param-image-input")) {
      inp.value = "";
      delete inp.dataset.filename;
      delete inp.dataset.dataUrl;
      delete inp.dataset.mediaUrl;
    }
  });

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`ai_plate_plugin_params_${pluginId}_`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {}

  // 6. Generic Custom Chat Card & Action Handler Reversion
  if (window.__PLUGIN_CHAT_CARD_HANDLERS) {
    delete window.__PLUGIN_CHAT_CARD_HANDLERS[pluginId];
    delete window.__PLUGIN_CHAT_CARD_HANDLERS[pId];
  }
  if (window.__PLUGIN_ACTION_HANDLERS) {
    Object.keys(window.__PLUGIN_ACTION_HANDLERS).forEach((act) => {
      if (act.startsWith(`${pluginId}:`) || act.startsWith(`${pId}:`)) {
        delete window.__PLUGIN_ACTION_HANDLERS[act];
      }
    });
  }

  // Remove any custom card elements produced by this plugin
  const outcomeSelectors = (pId === "outcome_summary" || pluginId === "outcome_summary")
    ? ", .outcome-summary-card, .execution-outcome-card"
    : "";
  document.querySelectorAll(
    `[data-plugin-card="${pluginId}"], [data-plugin-card="${pId}"], .plugin-card-${pluginId}, .plugin-card-${pId}${outcomeSelectors}`
  ).forEach((el) => el.remove());
  if (pId === "outcome_summary") delete window.renderOutcomeSummaryCard;

  // 7. Titlebar & System Sync
  if (typeof syncTitleBarTheme === "function") {
    syncTitleBarTheme();
  }

  // 8. Dispatch custom window event
  window.dispatchEvent(new CustomEvent("plugin:teardown", { detail: { pluginId } }));
};

async function uninstallCustomPlugin(pluginId) {
  try {
    const res = await fetch("/api/plugins/uninstall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pluginId }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      // Clean up all DOM and storage effects created by this plugin immediately
      window.teardownPluginEffects(pluginId);

      registeredPlugins = data.plugins;
      localStorage.setItem("ai_plate_plugins_cache", JSON.stringify(registeredPlugins));
      renderPlugins(registeredPlugins);
      if (window.PluginUIHost) await window.PluginUIHost.refresh();
      showPluginToast(`Plugin uninstalled and effects reverted successfully.`);
    } else {
      showPluginToast(data.error || "Failed to uninstall plugin.", true);
    }
  } catch (err) {
    showPluginToast("Uninstall error: " + err.message, true);
  }
}

async function reloadAllPlugins() {
  try {
    showPluginToast("Reloading plugins from disk...");
    const res = await fetch("/api/plugins/reload", { method: "POST" });
    const data = await res.json();
    if (res.ok && data.success) {
      registeredPlugins = data.plugins;
      localStorage.setItem("ai_plate_plugins_cache", JSON.stringify(registeredPlugins));
      renderPlugins(registeredPlugins);
      if (window.PluginUIHost) await window.PluginUIHost.refresh();
      showPluginToast(`Reloaded ${data.count} plugins (${data.toolsCount} active tools)!`);
    } else {
      showPluginToast(data.error || "Failed to reload plugins.", true);
    }
  } catch (err) {
    showPluginToast("Reload error: " + err.message, true);
  }
}

// ─── Drag & Drop Package Installer Initialization ───────────────────

function setupPluginDropzone() {
  const dropzone = document.getElementById("plugin-dropzone");
  const fileInput = document.getElementById("plugin-file-input");
  const btnBrowse = document.getElementById("btn-browse-plugin");
  const btnReload = document.getElementById("btn-reload-plugins");

  if (btnReload) {
    btnReload.addEventListener("click", (e) => {
      e.stopPropagation();
      reloadAllPlugins();
    });
  }

  if (btnBrowse && fileInput) {
    btnBrowse.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await handlePluginFile(file);
        fileInput.value = "";
      }
    });
  }

  const tabPluginsPane = document.getElementById("tab-settings-plugins");
  const dropTargets = [dropzone, tabPluginsPane].filter(Boolean);

  dropTargets.forEach((target) => {
    ["dragenter", "dragover"].forEach((eventName) => {
      target.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropzone) dropzone.classList.add("dragover");
      });
    });

    ["dragleave"].forEach((eventName) => {
      target.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!target.contains(e.relatedTarget)) {
          if (dropzone) dropzone.classList.remove("dragover");
        }
      });
    });

    target.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropzone) dropzone.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        await handlePluginFile(file);
      }
    });
  });
}

async function handlePluginFile(file) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    showPluginToast("⚠️ Only .zip plugin packages are supported. Please provide a .zip file.", true);
    return;
  }

  try {
    showPluginToast(`📦 Installing ZIP package: ${file.name}...`);
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    const res = await fetch("/api/plugins/install-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, data: bytes, base64Data: bytes })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      registeredPlugins = data.plugins;
      localStorage.setItem("ai_plate_plugins_cache", JSON.stringify(registeredPlugins));
      renderPlugins(registeredPlugins);
      if (window.PluginUIHost) await window.PluginUIHost.refresh();
      showPluginToast(`✅ Installed "${data.plugin?.name || file.name}" from ZIP package!`);
    } else {
      showPluginToast(data.error || "ZIP installation failed.", true);
    }
  } catch (err) {
    showPluginToast("ZIP installation error: " + err.message, true);
  }
}

// Initialize Dropzone & Command Palette after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupPluginDropzone();
    setupChatCommandPalette();
  });
} else {
  setupPluginDropzone();
  setupChatCommandPalette();
}

// ─── Floating Plugin Command Palette & Quick Action Launcher ─────────

function setupChatCommandPalette() {
  const palette = document.getElementById("chat-command-palette");
  const paletteList = document.getElementById("palette-list");
  const paletteCount = document.getElementById("palette-plugin-count");
  const btnTools = document.getElementById("btn-chat-tools");
  const userInput = document.getElementById("user-input");

  if (!palette || !paletteList || !userInput) return;

  let activeIndex = 0;
  let currentFilteredItems = [];

  function getAllAvailableActions() {
    const actions = [];
    const activePlugins = (registeredPlugins || []).filter((p) => p.enabled);

    activePlugins.forEach((plugin) => {
      // 1. Explicit quick actions declared by plugin manifest
      if (Array.isArray(plugin.quick_actions) && plugin.quick_actions.length > 0) {
        plugin.quick_actions.forEach((qa) => {
          actions.push({
            command: qa.command,
            title: qa.title || qa.command,
            icon: qa.icon || plugin.icon || "🧩",
            description: qa.description || plugin.description || "",
            promptPrefix: qa.promptPrefix,
            action: qa.action,
            pluginName: plugin.name,
            pluginId: plugin.id,
          });
        });
      } else if (Array.isArray(plugin.tools) && plugin.tools.length > 0) {
        // 2. Generic tool fallback for any plugin
        plugin.tools.forEach((tool) => {
          actions.push({
            command: tool.name,
            title: tool.name.replace(/_/g, " "),
            icon: plugin.icon || "⚡",
            description: tool.description || `Execute ${tool.name}`,
            promptPrefix: `Use the ${tool.name} tool to `,
            action: null,
            pluginName: plugin.name,
            pluginId: plugin.id,
          });
        });
      }
    });

    return actions;
  }

  function showPalette(filterQuery = "") {
    const actions = getAllAvailableActions();
    const q = filterQuery.toLowerCase().trim();

    currentFilteredItems = actions.filter(
      (a) =>
        !q ||
        a.command.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.pluginName.toLowerCase().includes(q)
    );

    if (currentFilteredItems.length === 0) {
      paletteList.innerHTML = `
        <div style="padding: 18px 12px; text-align: center; color: var(--text-dim); font-size: 12px;">
          No matching plugin commands found. Type <code>/</code> to view all active tools.
        </div>
      `;
    } else {
      paletteList.innerHTML = "";
      currentFilteredItems.forEach((item, idx) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = `palette-item ${idx === activeIndex ? "active" : ""}`;
        el.innerHTML = `
          <span class="palette-item-icon">${escapeHtmlStr(item.icon)}</span>
          <div class="palette-item-content">
            <div class="palette-item-title-row">
              <span class="palette-item-title">${escapeHtmlStr(item.title)}</span>
              <span class="palette-item-cmd">/${escapeHtmlStr(item.command)}</span>
            </div>
            <div class="palette-item-desc">${escapeHtmlStr(item.description)}</div>
          </div>
        `;
        el.onmouseenter = () => {
          activeIndex = idx;
          updateActiveHighlight(false);
        };
        el.onmousemove = () => {
          if (activeIndex !== idx) {
            activeIndex = idx;
            updateActiveHighlight(false);
          }
        };
        el.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectAction(item);
        };
        el.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectAction(item);
        };
        paletteList.appendChild(el);
      });
    }

    if (paletteCount) {
      const activePluginsCount = (registeredPlugins || []).filter((p) => p.enabled).length;
      paletteCount.textContent = `${currentFilteredItems.length} actions (${activePluginsCount} active plugins)`;
    }

    if (activeIndex >= currentFilteredItems.length) {
      activeIndex = 0;
    }
    updateActiveHighlight(false);

    palette.classList.remove("hidden");
  }

  function hidePalette() {
    palette.classList.add("hidden");
  }

  function updateActiveHighlight(shouldScroll = false) {
    const items = paletteList.querySelectorAll(".palette-item");
    items.forEach((item, idx) => {
      item.classList.toggle("active", idx === activeIndex);
    });
    if (shouldScroll && items[activeIndex]) {
      items[activeIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function selectAction(item) {
    if (!item) return;
    hidePalette();

    // Check if item triggers a direct UI modal/view via PluginUIHost
    if (item.action && (item.action.startsWith("open_") || item.action.includes("studio"))) {
      if (typeof window.PluginUIHost !== "undefined") {
        window.PluginUIHost.triggerAction(item.pluginId || "", item.action, "", "");
        return;
      }
    }

    // Default: populate input with prefix template
    if (item.promptPrefix) {
      userInput.value = item.promptPrefix;
      userInput.focus();
      userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
      if (typeof autoResizeTextarea === "function") {
        autoResizeTextarea(userInput);
      }
    }
  }

  // 1. Toggle button listener
  if (btnTools) {
    btnTools.onclick = (e) => {
      e.stopPropagation();
      if (palette.classList.contains("hidden")) {
        showPalette("");
        userInput.focus();
      } else {
        hidePalette();
      }
    };
  }

  // 2. Real-time slash / trigger on typing
  userInput.addEventListener("input", () => {
    const val = userInput.value;
    if (val.startsWith("/")) {
      const query = val.slice(1);
      showPalette(query);
    } else if (!palette.classList.contains("hidden")) {
      hidePalette();
    }
  });

  // 3. Keyboard navigation inside input
  userInput.addEventListener("keydown", (e) => {
    if (palette.classList.contains("hidden")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentFilteredItems.length > 0) {
        activeIndex = (activeIndex + 1) % currentFilteredItems.length;
        updateActiveHighlight(true);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentFilteredItems.length > 0) {
        activeIndex = (activeIndex - 1 + currentFilteredItems.length) % currentFilteredItems.length;
        updateActiveHighlight(true);
      }
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (!e.shiftKey && currentFilteredItems.length > 0 && currentFilteredItems[activeIndex]) {
        e.preventDefault();
        selectAction(currentFilteredItems[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      hidePalette();
    }
  });

  // 4. Stop propagation on wheel & mousedown to keep palette interaction focused
  palette.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  paletteList.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: true });

  // 5. Click outside dismissal
  document.addEventListener("click", (e) => {
    if (!palette.contains(e.target) && e.target !== btnTools) {
      hidePalette();
    }
  });
}

async function togglePlugin(pluginId, enabled) {
  const card = document.getElementById(`plugin-card-${pluginId}`);
  const badge = document.getElementById(`badge-${pluginId}`);

  // Optimistic UI update
  if (card) card.classList.toggle("disabled", !enabled);
  if (badge) {
    badge.className = `plugin-status-badge ${enabled ? "active" : "disabled"}`;
    badge.textContent = enabled ? "Active" : "Disabled";
  }

  // If disabled, revert any active effects (themes/icons) from this plugin
  if (!enabled) {
    window.teardownPluginEffects(pluginId);
  }

  // If TTS plugin is toggled, sync TTS controls and stop active audio if disabled
  if (pluginId === "tts") {
    syncTTSUIState(enabled);
    if (!enabled) {
      stopTTSAudio();
    }
  }

  // If STT plugin is toggled, sync mic button visibility
  if (pluginId === "stt") {
    syncSTTUIState(enabled);
  }

  // Update in-memory and local cache
  const localTarget = registeredPlugins.find((p) => p.id === pluginId);
  if (localTarget) localTarget.enabled = enabled;
  localStorage.setItem("ai_plate_plugins_cache", JSON.stringify(registeredPlugins));

  try {
    const res = await fetch("/api/plugins/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pluginId, enabled }),
    });

    const data = await res.json();
    if (data.success && data.plugins) {
      registeredPlugins = data.plugins;
      localStorage.setItem("ai_plate_plugins_cache", JSON.stringify(registeredPlugins));
      const total = registeredPlugins.length;
      const activeCount = registeredPlugins.filter((p) => p.enabled).length;
      if (pluginsActiveCountBadge) {
        pluginsActiveCountBadge.textContent = `${activeCount}/${total}`;
        pluginsActiveCountBadge.style.color = activeCount === 0 ? "var(--danger)" : "var(--success)";
      }
      renderPlugins(registeredPlugins);
      syncTTSUIState();
      syncSTTUIState();
      if (window.PluginUIHost) await window.PluginUIHost.refresh();
      showPluginToast(`${enabled ? "Enabled" : "Disabled"} plugin.`);
    } else {
      await loadPlugins();
    }
  } catch (err) {
    console.error("Failed to toggle plugin:", err);
    await loadPlugins();
  }
}

// ─── Security & Permissions Client Manager ──────────────────────────

const securityModeBadge = document.getElementById("security-mode-badge");
const presetCards = document.querySelectorAll(".security-preset-card");
const secPermSelects = document.querySelectorAll(".sec-perm-select");
const sessionWhitelistCount = document.getElementById("session-whitelist-count");
const btnClearWhitelist = document.getElementById("btn-clear-whitelist");
const btnSaveSecurity = document.getElementById("btn-save-security");
const btnResetSecurity = document.getElementById("btn-reset-security");
const securityFeedback = document.getElementById("security-feedback");

const sessionCardHeader = document.getElementById("session-card-header");
const sessionCardToggle = document.getElementById("session-card-toggle");
const sessionWhitelistExpandedPane = document.getElementById("session-whitelist-expanded-pane");
const sessionWhitelistList = document.getElementById("session-whitelist-list");

let currentSecurityConfig = {
  mode: "balanced",
  capabilities: {
    shell: "ask",
    python: "ask",
    file_write: "allow",
    file_delete: "ask",
    network: "allow",
    storage: "allow",
    rag: "allow",
    reasoning: "allow",
    custom: "ask",
  },
};

let cachedSessionWhitelistDetails = [];

const SECURITY_PRESET_MAP = {
  strict: {
    shell: "ask",
    python: "ask",
    file_write: "ask",
    file_delete: "ask",
    network: "ask",
    storage: "ask",
    rag: "allow",
    reasoning: "allow",
    custom: "ask",
  },
  balanced: {
    shell: "ask",
    python: "ask",
    file_write: "allow",
    file_delete: "ask",
    network: "allow",
    storage: "allow",
    rag: "allow",
    reasoning: "allow",
    custom: "ask",
  },
  autonomous: {
    shell: "allow",
    python: "allow",
    file_write: "allow",
    file_delete: "allow",
    network: "allow",
    storage: "allow",
    rag: "allow",
    reasoning: "allow",
    custom: "allow",
  },
};

function getCapIcon(cap) {
  switch (cap) {
    case "shell": return "💻";
    case "python": return "🐍";
    case "file_write": return "📁";
    case "file_delete": return "🗑️";
    case "network": return "🌐";
    case "rag": return "📚";
    case "storage": return "💾";
    case "reasoning": return "🧠";
    case "custom": return "📦";
    default: return "⚡";
  }
}

function formatGrantedTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

async function loadSecuritySettings() {
  try {
    const res = await fetch("/api/security/settings");
    if (!res.ok) return;
    const data = await res.json();
    if (data.config) {
      currentSecurityConfig = data.config;
      cachedSessionWhitelistDetails = data.sessionWhitelistDetails || [];
      renderSecurityUI(data.config, data.sessionWhitelists, cachedSessionWhitelistDetails);
    }
  } catch (err) {
    console.warn("Failed to load security settings:", err);
  }
}

function renderSecurityUI(config, whitelists = [], whitelistDetails = []) {
  if (securityModeBadge) {
    securityModeBadge.textContent = "";
    securityModeBadge.className = `security-policy-dot dot-${config.mode || "balanced"}`;
    const modeLabel = config.mode ? config.mode.charAt(0).toUpperCase() + config.mode.slice(1) : "Balanced";
    securityModeBadge.title = `Security Mode: ${modeLabel}`;
  }

  // Highlight active preset card
  presetCards.forEach((card) => {
    const preset = card.dataset.preset;
    card.classList.toggle("active", preset === config.mode);
  });

  // Set selects
  secPermSelects.forEach((select) => {
    const cap = select.dataset.capability;
    if (config.capabilities && config.capabilities[cap]) {
      select.value = config.capabilities[cap];
    }
  });

  // Whitelist count (accurately count unique or session-scoped active whitelisted tools)
  let totalCount = 0;
  if (Array.isArray(whitelists) && whitelists.length > 0) {
    totalCount = whitelists.length;
  } else if (Array.isArray(whitelistDetails) && whitelistDetails.length > 0) {
    totalCount = whitelistDetails.reduce((sum, s) => sum + (Array.isArray(s.tools) ? s.tools.length : 0), 0);
  }
  if (sessionWhitelistCount) {
    sessionWhitelistCount.textContent = `${totalCount} tool${totalCount === 1 ? "" : "s"} active`;
  }

  // Render expanded details list
  renderSessionWhitelistDetails(whitelistDetails);
}

function renderSessionWhitelistDetails(details = []) {
  if (!sessionWhitelistList) return;

  const validSessions = details.filter((s) => s.tools && s.tools.length > 0);

  if (validSessions.length === 0) {
    sessionWhitelistList.innerHTML = `
      <div class="session-whitelist-empty">
        <span class="session-whitelist-empty-icon">🛡️</span>
        <div>No session-specific permissions granted yet.</div>
        <div style="color: var(--text-muted); font-size: 11px;">Tools will appear here when you click <em>"Always Allow this Session"</em> during chat conversations.</div>
      </div>
    `;
    return;
  }

  sessionWhitelistList.innerHTML = validSessions
    .map((sess) => {
      const toolCount = sess.tools.length;
      const toolsHtml = sess.tools
        .map((t) => {
          const capIcon = getCapIcon(t.capability);
          const riskClass = t.riskLevel === "high" ? "risk-high" : t.riskLevel === "medium" ? "risk-med" : "risk-low";
          const dotsCount = t.riskLevel === "high" ? 3 : t.riskLevel === "medium" ? 2 : 1;
          const riskTooltip = t.riskLevel === "high" ? "High Risk (3/3)" : t.riskLevel === "medium" ? "Medium Risk (2/3)" : "Low Risk (1/3)";
          const timeStr = formatGrantedTime(t.grantedAt);

          return `
            <div class="session-tool-row" id="tool-row-${escapeHtml(sess.sessionId)}-${escapeHtml(t.toolName)}">
              <div class="session-tool-left">
                <span>${capIcon}</span>
                <span class="session-tool-name">${escapeHtml(t.toolName)}</span>
                <span class="session-tool-cap-badge">${escapeHtml(t.capability)}</span>
                ${timeStr ? `<span class="session-tool-time" title="Granted at ${escapeHtml(t.grantedAt)}">Granted ${escapeHtml(timeStr)}</span>` : ""}
              </div>
              <div class="session-tool-right">
                <div class="risk-dots ${riskClass}" title="${riskTooltip}" aria-label="${riskTooltip}">
                  <span class="risk-dot ${dotsCount >= 1 ? "active" : ""}"></span>
                  <span class="risk-dot ${dotsCount >= 2 ? "active" : ""}"></span>
                  <span class="risk-dot ${dotsCount >= 3 ? "active" : ""}"></span>
                </div>
                <button type="button" class="btn-revoke-perm" data-session-id="${escapeHtml(sess.sessionId)}" data-tool-name="${escapeHtml(t.toolName)}" title="Revoke '${escapeHtml(t.toolName)}' for this session">✕ Revoke</button>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="session-whitelist-group" id="session-group-${escapeHtml(sess.sessionId)}">
          <div class="session-group-header">
            <div class="session-group-title-wrap">
              <span>💬 ${escapeHtml(sess.sessionTitle || "Chat Session")}</span>
              <span class="session-group-id-pill" title="Session ID">${escapeHtml(sess.sessionId.slice(0, 8))}...</span>
              <span class="whitelist-count-pill">${toolCount} tool${toolCount === 1 ? "" : "s"}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm btn-clear-session" data-session-id="${escapeHtml(sess.sessionId)}" style="font-size: 10.5px; padding: 2px 7px;">Clear Session</button>
          </div>
          <div class="session-group-items">
            ${toolsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  // Attach Revoke listeners
  sessionWhitelistList.querySelectorAll(".btn-revoke-perm").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.sessionId;
      const toolName = btn.dataset.toolName;
      btn.textContent = "⏳...";

      try {
        const res = await fetch("/api/security/revoke-permission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, toolName }),
        });

        if (res.ok) {
          await loadSecuritySettings();
        }
      } catch (err) {
        alert("Failed to revoke permission: " + err.message);
      }
    });
  });

  // Attach Clear Session listeners
  sessionWhitelistList.querySelectorAll(".btn-clear-session").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.sessionId;
      btn.textContent = "⏳...";

      try {
        const res = await fetch("/api/security/clear-whitelist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (res.ok) {
          await loadSecuritySettings();
        }
      } catch (err) {
        alert("Failed to clear session whitelist: " + err.message);
      }
    });
  });
}

// Expand/Collapse Session Whitelist Pane
if (sessionCardHeader) {
  sessionCardHeader.addEventListener("click", (e) => {
    // If clicked on Clear button, don't toggle
    if (e.target.closest("#btn-clear-whitelist")) return;

    if (sessionWhitelistExpandedPane) {
      const isHidden = sessionWhitelistExpandedPane.classList.contains("hidden");
      sessionWhitelistExpandedPane.classList.toggle("hidden", !isHidden);
      if (sessionCardToggle) {
        sessionCardToggle.textContent = isHidden ? "▴ Collapse" : "▾ Details";
      }
    }
  });
}

// Preset card clicks
presetCards.forEach((card) => {
  card.addEventListener("click", () => {
    const preset = card.dataset.preset;
    if (SECURITY_PRESET_MAP[preset]) {
      presetCards.forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      currentSecurityConfig.mode = preset;
      currentSecurityConfig.capabilities = { ...SECURITY_PRESET_MAP[preset] };

      secPermSelects.forEach((sel) => {
        const cap = sel.dataset.capability;
        if (currentSecurityConfig.capabilities[cap]) {
          sel.value = currentSecurityConfig.capabilities[cap];
        }
      });
    }
  });
});

// Dropdown changes detect custom
secPermSelects.forEach((sel) => {
  sel.addEventListener("change", () => {
    const cap = sel.dataset.capability;
    currentSecurityConfig.capabilities[cap] = sel.value;

    // Check if matches preset
    let matchedPreset = "custom";
    for (const [pName, pCaps] of Object.entries(SECURITY_PRESET_MAP)) {
      const match = Object.keys(pCaps).every((k) => currentSecurityConfig.capabilities[k] === pCaps[k]);
      if (match) {
        matchedPreset = pName;
        break;
      }
    }

    currentSecurityConfig.mode = matchedPreset;
    presetCards.forEach((card) => {
      card.classList.toggle("active", card.dataset.preset === matchedPreset);
    });
  });
});

// Save Security
if (btnSaveSecurity) {
  btnSaveSecurity.addEventListener("click", async () => {
    try {
      btnSaveSecurity.disabled = true;
      btnSaveSecurity.textContent = "⏳ Saving...";

      const res = await fetch("/api/security/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentSecurityConfig),
      });

      if (res.ok) {
        await loadSecuritySettings();
        if (securityFeedback) {
          securityFeedback.textContent = "✅ Security policy applied!";
          securityFeedback.style.color = "var(--success)";
          setTimeout(() => {
            securityFeedback.textContent = "";
          }, 3000);
        }
      } else {
        const err = await res.json();
        if (securityFeedback) {
          securityFeedback.textContent = "❌ " + (err.error || "Failed to save");
          securityFeedback.style.color = "var(--danger)";
        }
      }
    } catch (err) {
      if (securityFeedback) {
        securityFeedback.textContent = "❌ " + err.message;
        securityFeedback.style.color = "var(--danger)";
      }
    } finally {
      btnSaveSecurity.disabled = false;
      btnSaveSecurity.textContent = "💾 Apply Security Policy";
    }
  });
}

// Reset Security
if (btnResetSecurity) {
  btnResetSecurity.addEventListener("click", async () => {
    const confirmed = await showThemedConfirm({
      title: "Reset Security Settings",
      message: "Reset all security settings and capability permissions to standard Balanced defaults?",
      confirmText: "Reset Defaults",
      icon: "🛡️",
      danger: true,
    });
    if (!confirmed) return;
    try {
      const res = await fetch("/api/security/reset", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        currentSecurityConfig = data.config;
        cachedSessionWhitelistDetails = [];
        renderSecurityUI(data.config, [], []);
        if (securityFeedback) {
          securityFeedback.textContent = "🔄 Reset to standard defaults.";
          securityFeedback.style.color = "var(--text-dim)";
          setTimeout(() => {
            securityFeedback.textContent = "";
          }, 3000);
        }
      }
    } catch (err) {
      alert("Failed to reset security: " + err.message);
    }
  });
}

// Clear All Whitelists
if (btnClearWhitelist) {
  btnClearWhitelist.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/security/clear-whitelist", { method: "POST" });
      if (res.ok) {
        cachedSessionWhitelistDetails = [];
        if (sessionWhitelistCount) sessionWhitelistCount.textContent = "0 tools active";
        renderSessionWhitelistDetails([]);
      }
    } catch (err) {
      alert("Failed to clear session whitelist: " + err.message);
    }
  });
}

// ─── Python Code Formatting for Approvals ────────────────────────────

function formatPythonCodeForApproval(rawCode) {
  if (!rawCode || typeof rawCode !== "string") return "";

  // 1. Unescape string literals if code contains escaped newlines
  let code = rawCode;
  if (code.includes("\\n") && !code.includes("\n")) {
    code = code.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "    ");
  } else {
    code = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  // 2. Expand tabs to 4 spaces
  code = code.replace(/\t/g, "    ");

  // 3. Strip common leading indentation (dedent)
  const rawLines = code.split("\n");
  let minIndent = Infinity;
  for (const line of rawLines) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^[ ]*/);
    const indent = match ? match[0].length : 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (minIndent > 0 && minIndent !== Infinity) {
    code = rawLines
      .map((line) => (line.length >= minIndent ? line.slice(minIndent) : line.trimStart()))
      .join("\n");
  }

  // 4. Trim leading and trailing empty lines
  const lines = code.split("\n");
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;
  let end = lines.length - 1;
  while (end >= start && lines[end].trim() === "") end--;
  if (start > end) return "";

  const trimmedLines = lines.slice(start, end + 1);

  // 5. Check if indentation exists
  const hasExistingIndent = trimmedLines.some((l) => l.startsWith(" ") && l.trim().length > 0);

  if (hasExistingIndent) {
    // Detect base indent step (e.g. 2 spaces vs 4 spaces)
    const indents = trimmedLines
      .map((l) => (l.match(/^([ ]+)/) ? l.match(/^([ ]+)/)[1].length : 0))
      .filter((n) => n > 0);

    let indentStep = 4;
    if (indents.length > 0) {
      const allDiv4 = indents.every((n) => n % 4 === 0);
      if (!allDiv4 && indents.every((n) => n % 2 === 0)) {
        indentStep = 2;
      }
    }

    const normalized = trimmedLines.map((l) => {
      if (l.trim().length === 0) return "";
      const match = l.match(/^([ ]*)(.*)$/);
      if (!match) return l.trimEnd();
      const spaces = match[1].length;
      const content = match[2].trimEnd();
      const level = Math.round(spaces / indentStep);
      return "    ".repeat(level) + content;
    });

    return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  // 6. Infer compound statement indentation if completely flat
  let currentIndent = 0;
  const result = [];
  const dedentKeywords = /^(elif\b|else\s*:|except\b|finally\s*:|case\b)/;

  for (let i = 0; i < trimmedLines.length; i++) {
    const trimmed = trimmedLines[i].trim();
    if (trimmed.length === 0) {
      result.push("");
      continue;
    }

    if (dedentKeywords.test(trimmed)) {
      currentIndent = Math.max(0, currentIndent - 1);
    }

    result.push("    ".repeat(currentIndent) + trimmed);

    const withoutComment = trimmed.split("#")[0].trim();
    if (withoutComment.endsWith(":")) {
      currentIndent++;
    } else if (
      trimmed === "return" ||
      trimmed.startsWith("return ") ||
      trimmed === "pass" ||
      trimmed === "break" ||
      trimmed === "continue" ||
      trimmed === "raise" ||
      trimmed.startsWith("raise ")
    ) {
      if (i + 1 < trimmedLines.length) {
        const nextTrimmed = trimmedLines[i + 1].trim();
        if (nextTrimmed.length > 0 && !dedentKeywords.test(nextTrimmed) && !nextTrimmed.endsWith(":")) {
          if (currentIndent > 0 && !nextTrimmed.startsWith("print(") && !nextTrimmed.includes("=")) {
            currentIndent = Math.max(0, currentIndent - 1);
          }
        }
      }
    }
  }

  return result.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

// ─── Interactive In-Chat Tool Approval Renderer ──────────────────────

function renderApprovalCard(blockElement, req, thinkingCard) {
  if (!req || !req.id) return;

  // Prevent duplicate approval card if already mounted in the DOM
  if (document.getElementById(`approval-card-${req.id}`)) {
    return;
  }

  const card = document.createElement("div");
  card.className = "tool-approval-card";
  card.id = `approval-card-${req.id}`;

  const riskClass = req.riskLevel === "high" ? "risk-high" : req.riskLevel === "medium" ? "risk-med" : "risk-low";
  const dotsCount = req.riskLevel === "high" ? 3 : req.riskLevel === "medium" ? 2 : 1;
  const riskTooltip = req.riskLevel === "high" ? "High Risk (3/3)" : req.riskLevel === "medium" ? "Medium Risk (2/3)" : "Low Risk (1/3)";
  const argsFormatted = JSON.stringify(req.args || {}, null, 2);

  // Extract python code if present
  const rawCode =
    req.formattedCode ||
    (req.args && typeof req.args === "object"
      ? (req.args.code || req.args.script || req.args.command || "")
      : (typeof req.args === "string" ? req.args : ""));

  const formattedPythonCode = req.formattedCode || (rawCode ? formatPythonCodeForApproval(rawCode) : "");
  const lines = formattedPythonCode ? formattedPythonCode.split("\n") : [];
  const lineCount = lines.length;
  const hasCodeLines = lineCount > 0 && formattedPythonCode.trim().length > 0;

  // Only show the Python editor box if actual Python code is present (>0 lines)
  // and the tool is NOT an environment inspection utility like check_python_environment
  const isPythonScriptExecution =
    hasCodeLines &&
    req.tool !== "check_python_environment" &&
    req.tool !== "install_python_package" &&
    ((req.description && req.description.includes("Runs custom Python code inside the sandbox environment")) ||
     req.capability === "python" ||
     req.tool === "run_sandboxed_script" ||
     (req.args && (req.args.language === "python" || typeof req.args.code === "string")) ||
     Boolean(req.formattedCode));

  let codeOrParamsHtml = "";

  if (isPythonScriptExecution) {
    const scriptName = (req.args && req.args.script_name) ? req.args.script_name : "sandboxed_script.py";

    // Generate line numbers gutter
    const lineNumbersHtml = lines.map((_, idx) => idx + 1).join("<br>");

    // Apply syntax highlighting with fallback
    let highlightedCode = "";
    if (typeof hljs !== "undefined" && hljs.getLanguage && hljs.getLanguage("python")) {
      try {
        highlightedCode = hljs.highlight(formattedPythonCode, { language: "python" }).value;
      } catch {
        highlightedCode = escapeHtml(formattedPythonCode);
      }
    } else {
      highlightedCode = escapeHtml(formattedPythonCode);
    }

    codeOrParamsHtml = `
      <div class="approval-python-viewer" id="py-viewer-${req.id}">
        <div class="approval-code-toolbar">
          <div class="approval-code-meta">
            <span class="approval-code-lang-badge"><span>🐍</span> Python 3</span>
            <span class="approval-code-file-badge"><i>📄</i> <code>${escapeHtml(scriptName)}</code></span>
            <span class="approval-code-lines-badge">${lineCount} ${lineCount === 1 ? "line" : "lines"}</span>
          </div>
          <div class="approval-code-toolbar-actions">
            <button class="approval-code-btn btn-copy-code" type="button" title="Copy formatted Python code">
              📋 Copy Code
            </button>
            <button class="approval-code-btn btn-toggle-raw" type="button" title="Toggle between formatted Python code and raw JSON">
              🔀 Raw JSON
            </button>
          </div>
        </div>
        <div class="approval-code-viewport">
          <div class="approval-code-linenums" aria-hidden="true">${lineNumbersHtml}</div>
          <pre class="approval-code-pre"><code class="hljs language-python">${highlightedCode}</code></pre>
        </div>
        <div class="approval-raw-json-viewport" style="display: none;">
          <pre class="approval-raw-pre"><code>${escapeHtml(argsFormatted)}</code></pre>
        </div>
      </div>
    `;
  } else {
    // If check_python_environment with empty parameters, show clean environment note
    if (req.tool === "check_python_environment" && (!req.args || Object.keys(req.args).length === 0)) {
      codeOrParamsHtml = `<div class="approval-params-box"><span style="color: var(--text-dim); font-style: italic;">No parameters required (checks active Python runtime and installed packages).</span></div>`;
    } else {
      codeOrParamsHtml = `<div class="approval-params-box"><code>${escapeHtml(argsFormatted)}</code></div>`;
    }
  }

  card.innerHTML = `
    <div class="approval-header">
      <div class="approval-title-wrap">
        <span class="approval-icon">🛡️</span>
        <span class="approval-title">Approval Required: <code>${escapeHtml(req.tool)}</code></span>
      </div>
      <div class="risk-dots ${riskClass}" title="${riskTooltip}" aria-label="${riskTooltip}">
        <span class="risk-dot ${dotsCount >= 1 ? "active" : ""}"></span>
        <span class="risk-dot ${dotsCount >= 2 ? "active" : ""}"></span>
        <span class="risk-dot ${dotsCount >= 3 ? "active" : ""}"></span>
      </div>
    </div>
    <div class="approval-desc">${escapeHtml(req.description || "The automated agent wants to execute this action on your system.")}</div>
    ${codeOrParamsHtml}
    <div class="approval-actions" id="actions-${req.id}">
      <button class="btn btn-sm btn-approve" data-decision="approve">✅ Approve &amp; Run</button>
      <button class="btn btn-sm btn-session-allow" data-decision="session_allow">⚡ Always Allow this Session</button>
      <button class="btn btn-sm btn-deny" data-decision="deny">❌ Deny Action</button>
    </div>
  `;

  // Attach event handlers for copy and toggle in the Python code viewer
  if (isPythonScriptExecution) {
    const copyBtn = card.querySelector(".btn-copy-code");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const codeToCopy = formattedPythonCode;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(codeToCopy).catch(() => {});
        } else {
          const ta = document.createElement("textarea");
          ta.value = codeToCopy;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); } catch {}
          document.body.removeChild(ta);
        }
        const origText = copyBtn.innerHTML;
        copyBtn.innerHTML = "✅ Copied!";
        copyBtn.classList.add("active");
        setTimeout(() => {
          copyBtn.innerHTML = origText;
          copyBtn.classList.remove("active");
        }, 1500);
      });
    }

    const toggleRawBtn = card.querySelector(".btn-toggle-raw");
    if (toggleRawBtn) {
      toggleRawBtn.addEventListener("click", () => {
        const codeView = card.querySelector(".approval-code-viewport");
        const rawView = card.querySelector(".approval-raw-json-viewport");
        if (!codeView || !rawView) return;

        const isShowingRaw = rawView.style.display !== "none";
        if (isShowingRaw) {
          rawView.style.display = "none";
          codeView.style.display = "flex";
          toggleRawBtn.innerHTML = "🔀 Raw JSON";
          toggleRawBtn.classList.remove("active");
        } else {
          rawView.style.display = "block";
          codeView.style.display = "none";
          toggleRawBtn.innerHTML = "🐍 Formatted Code";
          toggleRawBtn.classList.add("active");
        }
      });
    }
  }

  // Hide the temporary processing spinner while waiting for user interaction
  const thinkingIndicator = blockElement ? blockElement.querySelector(".assistant-thinking-indicator") : null;
  if (thinkingIndicator) {
    thinkingIndicator.style.display = "none";
  }

  const messageBody = blockElement ? blockElement.querySelector(".message-body") : null;
  if (messageBody && messageBody.parentNode) {
    // Insert card directly before message-body so it's always at the top level, visible, and never collapsed
    messageBody.parentNode.insertBefore(card, messageBody);
  } else if (blockElement) {
    blockElement.appendChild(card);
  }

  const actionsRow = card.querySelector(`#actions-${req.id}`);
  if (actionsRow) {
    actionsRow.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const decision = btn.dataset.decision;
        actionsRow.innerHTML = `<span style="color: var(--text-dim); font-size: 11.5px;">⏳ Submitting decision...</span>`;

        try {
          const res = await fetch("/api/security/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approvalId: req.id, decision }),
          });

          if (res.ok) {
            // Restore thinking indicator so user knows execution has resumed
            if (thinkingIndicator) {
              thinkingIndicator.style.display = "flex";
            }

            if (decision === "approve") {
              card.classList.add("resolved-approved");
              actionsRow.innerHTML = `<div class="approval-resolved-banner approved">✅ Approved (Executing action...)</div>`;
            } else if (decision === "session_allow") {
              card.classList.add("resolved-approved");
              actionsRow.innerHTML = `<div class="approval-resolved-banner approved">⚡ Whitelisted for this chat session</div>`;
            } else {
              card.classList.add("resolved-denied");
              actionsRow.innerHTML = `<div class="approval-resolved-banner denied">❌ Action Denied by User</div>`;
            }
          }
        } catch (err) {
          actionsRow.innerHTML = `<span style="color: var(--danger); font-size: 11px;">Failed: ${escapeHtml(err.message)}</span>`;
        }
      });
    });
  }

  scrollToBottom(true);
}

// ─── Themed Confirmation Dialog ─────────────────────────────────────

function showThemedConfirm({
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Delete",
  cancelText = "Cancel",
  icon = "🗑️",
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const iconEl = document.getElementById("confirm-modal-icon");
    const iconWrap = document.getElementById("confirm-modal-icon-wrap");
    const titleEl = document.getElementById("confirm-modal-title");
    const descEl = document.getElementById("confirm-modal-desc");
    const btnCancel = document.getElementById("confirm-btn-cancel");
    const btnAction = document.getElementById("confirm-btn-action");

    if (!modal || !btnAction || !btnCancel) {
      return resolve(window.confirm(message));
    }

    if (iconEl) iconEl.textContent = icon;
    if (iconWrap) {
      iconWrap.className = "confirm-modal-icon-wrap" + (danger ? "" : " info");
    }
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;

    btnCancel.textContent = cancelText;
    btnAction.textContent = confirmText;
    btnAction.className = "btn confirm-btn-action " + (danger ? "btn-danger" : "btn-primary");

    let isResolved = false;
    const cleanup = (result) => {
      if (isResolved) return;
      isResolved = true;
      modal.classList.remove("visible");
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 180);
      document.removeEventListener("keydown", onKeyDown);
      btnCancel.onclick = null;
      btnAction.onclick = null;
      modal.onclick = null;
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Enter" && document.activeElement === btnAction) {
        e.preventDefault();
        cleanup(true);
      }
    };

    btnCancel.onclick = () => cleanup(false);
    btnAction.onclick = () => cleanup(true);
    modal.onclick = (e) => {
      if (e.target === modal) cleanup(false);
    };

    document.addEventListener("keydown", onKeyDown);

    modal.classList.remove("hidden");
    void modal.offsetWidth;
    modal.classList.add("visible");
    btnCancel.focus();
  });
}

// ─── Direct In-Chat Artifact Viewer ─────────────────────────────────

async function renderInChatArtifactCard(blockElement, artifactInfo) {
  if (!blockElement || !artifactInfo) return;

  const filename = artifactInfo.artifactName || artifactInfo.name || artifactInfo.filename || "generated_artifact";
  const cleanFilename = String(filename).replace(/^[\\/]+/, "").split(/[\\/]/).pop();

  // Check if this artifact is already rendered in the block to avoid redundancy
  const alreadyRendered =
    blockElement.querySelector(`.inchat-artifact-card[data-filename="${cleanFilename}"]`) ||
    blockElement.querySelector(`img[src*="${encodeURIComponent(cleanFilename)}"]`);
  if (alreadyRendered) return;

  const ext = "." + cleanFilename.split(".").pop().toLowerCase();
  const fileUrl = artifactInfo.url || (artifactInfo.isSandbox ? `/api/sandbox/file?name=${encodeURIComponent(cleanFilename)}` : `/api/artifacts/file?name=${encodeURIComponent(cleanFilename)}`);
  const sizeFormatted = artifactInfo.sizeBytes ? formatFileSize(artifactInfo.sizeBytes) : "";
  const desc = artifactInfo.description || "";

  const isImage = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico", ".bmp"].includes(ext);
  const isVideo = [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi", ".m4v"].includes(ext);
  const isAudio = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext);
  const isCsv = [".csv", ".tsv"].includes(ext);
  const isCode = [".py", ".js", ".ts", ".json", ".sql", ".html", ".css", ".sh", ".ps1", ".txt", ".md"].includes(ext);

  let icon = "📄";
  if (isImage) icon = "🖼️";
  else if (isVideo) icon = "🎬";
  else if (isAudio) icon = "🎵";
  else if (isCsv) icon = "📊";
  else if (ext === ".py") icon = "🐍";
  else if (ext === ".js" || ext === ".ts") icon = "⚡";
  else if (ext === ".json") icon = "📦";
  else if (ext === ".pdf") icon = "📕";

  const card = document.createElement("div");
  card.className = "inchat-artifact-card";
  card.setAttribute("data-filename", cleanFilename);

  // Build header
  const headerHtml = `
    <div class="inchat-artifact-header">
      <div class="inchat-artifact-info">
        <span class="inchat-artifact-icon">${icon}</span>
        <span class="inchat-artifact-title" title="${escapeHtmlStr(filename)}">${escapeHtmlStr(filename)}</span>
        ${sizeFormatted ? `<span class="inchat-artifact-meta">${sizeFormatted}</span>` : ""}
      </div>
      <div class="inchat-artifact-actions">
        <a href="${fileUrl}" download="${escapeHtmlStr(filename)}" class="inchat-artifact-btn" title="Download File">⬇ Download</a>
        <a href="${fileUrl}" target="_blank" class="inchat-artifact-btn" title="Open in New Tab">↗ Open</a>
        ${typeof PluginUIHost !== "undefined" && PluginUIHost.getButtonsForFile(fileUrl, filename, "inchat") ? PluginUIHost.getButtonsForFile(fileUrl, filename, "inchat") : ""}
        ${isVideo ? `<button type="button" class="inchat-artifact-btn primary" onclick="openVideoModal('${fileUrl}', '${escapeHtmlStr(cleanFilename)}', ${artifactInfo.isSandbox ? true : false})">▶ Play Video</button><button type="button" class="inchat-artifact-btn" onclick="if(window.electronAPI && window.electronAPI.artifacts.openExternal) window.electronAPI.artifacts.openExternal('${encodeURIComponent(cleanFilename)}', ${artifactInfo.isSandbox ? true : false}, 'play');" title="Open in default media player">🖥 External Player</button>` : ""}
        ${isAudio ? `<button type="button" class="inchat-artifact-btn primary" onclick="openAudioModal('${fileUrl}', '${escapeHtmlStr(cleanFilename)}', ${artifactInfo.isSandbox ? true : false})">▶ Play Audio</button>` : ""}
        ${(isCode || isCsv) ? `<button type="button" class="inchat-artifact-btn primary" onclick="viewArtifactCode('${encodeURIComponent(filename)}')">👁 View Full</button>` : ""}
      </div>
    </div>
  `;

  // Build body preview slot
  let bodyHtml = "";
  if (isImage) {
    const safeTitle = escapeHtmlStr(filename).replace(/'/g, "\\'");
    bodyHtml = `
      <div class="inchat-artifact-image-slot" onclick="openLightbox('${fileUrl}', '${safeTitle}')">
        <img src="${fileUrl}" alt="${escapeHtmlStr(filename)}" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\\'padding:16px;text-align:center;color:var(--text-dim);font-size:13px;\\\'>🖼️ Image deliverable ready (click Open or Download above)</div>';" />
      </div>
    `;
  } else if (isVideo) {
    const safeTitle = escapeHtmlStr(filename).replace(/'/g, "\\'");
    bodyHtml = `
      <div class="inchat-artifact-video-slot" style="position: relative;">
        <video src="${fileUrl}" preload="metadata" controls playsinline style="max-width: 100%; max-height: 380px; width: 100%; border-radius: var(--radius-sm); background: #000;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"></video>
        <div style="display: none; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; background: rgba(0,0,0,0.75); border-radius: var(--radius-sm); min-height: 120px;">
          <div style="font-size: 28px;">🎬</div>
          <div style="color: var(--text-dim); font-size: 12px;">Video preview unavailable — use Play Video or External Player above</div>
        </div>
      </div>
    `;
  } else if (isAudio) {
    bodyHtml = `
      <div style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: var(--radius-sm); margin-top: 8px;">
        <audio src="${fileUrl}" controls style="width: 100%; outline: none;"></audio>
      </div>
    `;
  } else if (isCsv) {
    bodyHtml = `<div class="inchat-artifact-table-slot"><div style="color: var(--text-dim); padding: 8px;">Loading table preview...</div></div>`;
  } else if (isCode) {
    bodyHtml = `<pre class="inchat-artifact-code-slot">Loading code preview...</pre>`;
  }

  card.innerHTML = headerHtml + bodyHtml;
  mountCardToSlot(blockElement, card, artifactInfo.position || "after-body");

  // Asynchronously populate code or CSV preview content
  if (isCsv) {
    const tableSlot = card.querySelector(".inchat-artifact-table-slot");
    if (tableSlot) {
      try {
        const res = await fetch(fileUrl);
        const text = await res.text();
        const lines = text.trim().split(/\r?\n/).slice(0, 15);
        if (lines.length > 0) {
          const headers = lines[0].split(",").map((h) => `<th>${escapeHtmlStr(h.trim())}</th>`).join("");
          const rows = lines.slice(1).map((l) => {
            const cells = l.split(",").map((c) => `<td>${escapeHtmlStr(c.trim())}</td>`).join("");
            return `<tr>${cells}</tr>`;
          }).join("");
          tableSlot.innerHTML = `<table class="data-table" style="width: 100%;"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
        }
      } catch {
        tableSlot.innerHTML = `<div style="color: var(--text-dim); padding: 6px;">Click 'View Full' to inspect CSV data.</div>`;
      }
    }
  } else if (isCode) {
    const codeSlot = card.querySelector(".inchat-artifact-code-slot");
    if (codeSlot) {
      try {
        const res = await fetch(fileUrl);
        const text = await res.text();
        const previewText = text.split("\n").slice(0, 20).join("\n");
        let highlighted = previewText;
        if (typeof hljs !== "undefined") {
          try {
            highlighted = hljs.highlightAuto(previewText).value;
          } catch {
            highlighted = escapeHtmlStr(previewText);
          }
        } else {
          highlighted = escapeHtmlStr(previewText);
        }
        codeSlot.innerHTML = `<code class="hljs">${highlighted}</code>`;
      } catch {
        codeSlot.innerHTML = `<span style="color: var(--text-dim);">Click 'View Full' to inspect code.</span>`;
      }
    }
  }
}

// ─── Universal Dynamic Plugin UI Extension Host ─────────────────────

window.PluginUIHost = {
  activeExtensions: [],

  async refresh() {
    try {
      const res = await fetch("/api/plugins/ui-extensions");
      if (!res.ok) return;
      const data = await res.json();
      this.activeExtensions = data.extensions || [];

      // 1. Teardown and revert all effects for inactive or uninstalled extensions
      const activeIds = new Set(this.activeExtensions.map((e) => e.pluginId));
      document.querySelectorAll("style[id^='plugin-ext-']").forEach((styleEl) => {
        const id = styleEl.id.replace("plugin-ext-", "");
        if (!activeIds.has(id)) {
          if (typeof window.teardownPluginEffects === "function") {
            window.teardownPluginEffects(id);
          } else {
            styleEl.remove();
          }
        }
      });

      this.activeExtensions.forEach((ext) => {
        if (ext.css) {
          let styleEl = document.getElementById(`plugin-ext-${ext.pluginId}`);
          if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = `plugin-ext-${ext.pluginId}`;
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = ext.css;
        }

        // Execute extension client script if provided
        if (ext.js) {
          try {
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            const fn = new AsyncFunction("api", "host", ext.js);
            fn(window, this);
          } catch (scriptErr) {
            console.warn(`[PluginUIHost] Failed to execute JS for extension '${ext.pluginId}':`, scriptErr.message);
          }
        }
      });
    } catch (err) {
      console.warn("[PluginUIHost] Failed to refresh UI extensions:", err.message);
    }
  },

  matchesFileType(fileTypes, filename) {
    if (!fileTypes || !fileTypes.length) return false;
    const lower = (filename || "").toLowerCase();
    const ext = "." + lower.split(".").pop();
    const isImg = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"].includes(ext);

    return fileTypes.some((pattern) => {
      if (pattern === "image/*" && isImg) return true;
      if (pattern.startsWith(".") && ext === pattern) return true;
      if (pattern.startsWith("*.") && ext === pattern.slice(1)) return true;
      return lower.endsWith(pattern);
    });
  },

  getButtonsForFile(fileUrl, filename, context = "card") {
    const buttons = [];
    for (const ext of this.activeExtensions) {
      if (this.matchesFileType(ext.fileTypes, filename)) {
        if (ext.actionButtons && ext.actionButtons.length) {
          for (const btn of ext.actionButtons) {
            const btnClass = btn.type === "primary" ? "btn-primary" : "btn-secondary";
            const btnSize = context === "inchat" ? "inchat-artifact-btn" : "btn-xs";
            const isPrimaryInChat = context === "inchat" && btn.type === "primary" ? "primary" : "";

            buttons.push(`
              <button type="button" class="${context === "inchat" ? `inchat-artifact-btn ${isPrimaryInChat}` : `btn ${btnClass} ${btnSize}`}"
                onclick="PluginUIHost.triggerAction('${escapeHtmlStr(ext.pluginId)}', '${escapeHtmlStr(btn.id)}', '${escapeHtmlStr(fileUrl)}', '${escapeHtmlStr(filename)}')">
                ${escapeHtmlStr(btn.label || "Action")}
              </button>
            `);
          }
        }
      }
    }
    return buttons.join("");
  },

  triggerAction(pluginId, actionId, fileUrl, filename) {
    const ext = this.activeExtensions.find((e) => e.pluginId === pluginId);
    if (!ext) {
      alert(`Plugin "${pluginId}" is not currently enabled.`);
      return;
    }

    if (window.__PLUGIN_ACTION_HANDLERS && typeof window.__PLUGIN_ACTION_HANDLERS[actionId] === "function") {
      window.__PLUGIN_ACTION_HANDLERS[actionId]({ pluginId, actionId, fileUrl, filename });
      return;
    }

    const fnName = `plugin_${pluginId}_${actionId}`;
    if (typeof window[fnName] === "function") {
      window[fnName](fileUrl, filename);
    } else if (typeof window[actionId] === "function") {
      window[actionId](fileUrl, filename);
    }
  },

  dispatchChatCard(blockElement, toolName, result) {
    if (window.__PLUGIN_CHAT_CARD_HANDLERS) {
      const activePluginIds = new Set((this.activeExtensions || []).map((e) => e.pluginId));
      for (const [pluginId, handler] of Object.entries(window.__PLUGIN_CHAT_CARD_HANDLERS)) {
        // Enforce strict independence: if plugin is not active, purge handler and never render
        if (pluginId !== "outcome_summary" && !activePluginIds.has(pluginId)) {
          delete window.__PLUGIN_CHAT_CARD_HANDLERS[pluginId];
          continue;
        }
        if (typeof handler === "function") {
          const handled = handler(blockElement, toolName, result);
          if (handled) return true;
        }
      }
    }
    return false;
  }
};

// ─── Universal Plugin Chat UI Dispatcher ────────────────────────────

function mountCardToSlot(blockElement, cardElement, position = "after-body") {
  if (!blockElement || !cardElement) return;

  const pos = String(position).toLowerCase().trim();
  const messageBody = blockElement.querySelector(".message-body");
  const metaFooter = blockElement.querySelector(".message-meta-footer");
  const toolContainer = blockElement.querySelector(".tool-container") || blockElement.querySelector(".thinking-steps-timeline");

  if (pos === "top" && messageBody && messageBody.parentNode) {
    messageBody.parentNode.insertBefore(cardElement, messageBody);
  } else if (pos === "inline" && toolContainer) {
    toolContainer.appendChild(cardElement);
  } else if (metaFooter && metaFooter.parentNode) {
    // Artifact card placed after LLM output and before bottom metrics footer
    metaFooter.parentNode.insertBefore(cardElement, metaFooter);
  } else if (messageBody && messageBody.parentNode) {
    if (messageBody.nextSibling) {
      messageBody.parentNode.insertBefore(cardElement, messageBody.nextSibling);
    } else {
      messageBody.parentNode.appendChild(cardElement);
    }
  } else {
    blockElement.appendChild(cardElement);
  }

  scrollToBottom();
}

function dispatchPluginChatUI(blockElement, toolName, result) {
  if (!blockElement || !result || typeof result !== "object") return;

  // 1. Delegate to active Plugin UI Extensions if registered
  if (typeof window.PluginUIHost !== "undefined" && typeof window.PluginUIHost.dispatchChatCard === "function") {
    const handled = window.PluginUIHost.dispatchChatCard(blockElement, toolName, result);
    if (handled) return;
  }

  // 2. Direct In-Chat Artifact Deliverable Viewer (Triggered when an artifact is created or explicitly targeted)
  if (result.ui_type === "artifact" || result.artifactName || (result.savedTo && result.url)) {
    renderInChatArtifactCard(blockElement, result);
    return;
  }

  // 3. Dynamic Theme & Style Injection Directive
  if (result.ui_type === "theme" || result.theme_css || result.custom_css || result.theme_name) {
    const themeName = result.theme_name || result.theme || "Custom Theme";
    const accent = result.accent_color || result.accent || "#6366f1";

    window.applyDynamicThemeDirect(result, false);

    // Mount visual theme notification card into chat
    const themeCard = document.createElement("div");
    themeCard.className = "plugin-custom-card";
    themeCard.style.borderLeft = `4px solid ${accent}`;
    themeCard.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🎨</span>
          <div>
            <div style="font-weight: 700; font-size: 13px; color: var(--text-main);">Theme Applied: ${escapeHtmlStr(themeName)}</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">Dynamic typography, styling, and accent (${escapeHtmlStr(accent)}) are now active.</div>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" onclick="window.resetDynamicTheme()">Reset Theme</button>
      </div>
    `;
    mountCardToSlot(blockElement, themeCard, result.position || "bottom");
    return;
  }

  // 5. Custom HTML / Card Directive
  if (result.html || result.ui_type === "card") {
    const card = document.createElement("div");
    card.className = "plugin-custom-card";
    card.innerHTML = result.html || escapeHtmlStr(JSON.stringify(result, null, 2));
    mountCardToSlot(blockElement, card, result.position || "bottom");
    return;
  }
}


// ─── Universal Dynamic Plugin Theme Engine ──────────────────────────

window.applyDynamicThemeDirect = function (themeData = {}, showToast = true) {
  const isIconPack =
    Boolean(themeData.icon_pack) ||
    (themeData.theme_name && themeData.theme_name.toLowerCase().includes("icon")) ||
    themeData.ui_type === "icon_pack" ||
    (themeData.css && themeData.css.includes("material-symbols"));

  const fontUrl =
    themeData.font_url ||
    themeData.fontUrl ||
    (themeData.font ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(themeData.font)}:wght@300;400;500;600;700&display=swap` : null);
  let css = themeData.css || themeData.theme_css || themeData.custom_css || "";
  const accent = themeData.accent_color || themeData.accent || "";
  const themeName = themeData.theme_name || themeData.theme || (isIconPack ? "Google Material Icons" : "Custom Dynamic Theme");

  if (fontUrl) {
    const fontId = isIconPack ? "ai-plate-dynamic-icon-font" : "ai-plate-dynamic-plugin-font";
    let link = document.getElementById(fontId);
    if (!link) {
      link = document.createElement("link");
      link.id = fontId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = fontUrl;
  }

  if (css) {
    const styleId = isIconPack ? "ai-plate-dynamic-icon-theme" : "ai-plate-dynamic-plugin-theme";
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = css;
  }

  if (accent && !isIconPack) {
    document.documentElement.style.setProperty("--accent-primary", accent);
  }

  const wallpaperName = themeData.wallpaper_name || (themeData.bg_image && themeData.bg_image !== "none" ? themeData.bg_image : "");

  // Persist active theme or icon pack in localStorage with all properties
  try {
    const storageKey = isIconPack ? "ai_plate_active_icon_pack" : "ai_plate_active_theme";
    const existing = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const safeCss = css || existing.css;
    const merged = Object.assign({}, existing, themeData, {
      active: true,
      font_url: fontUrl || existing.font_url,
      css: safeCss,
      accent_color: accent || existing.accent_color,
      theme_name: themeName || existing.theme_name,
      wallpaper_name: wallpaperName || (themeData.bg_image && themeData.bg_image !== "none" ? themeData.bg_image : "") || existing.wallpaper_name || "",
      bg_image: themeData.bg_image !== undefined ? themeData.bg_image : existing.bg_image,
      preset: themeData.preset || existing.preset || "nordic-dark",
      font_family: themeData.font_family || existing.font_family,
      border_radius: themeData.border_radius || existing.border_radius,
      compact_mode: themeData.compact_mode !== undefined ? themeData.compact_mode : existing.compact_mode,
      bg_app_color: themeData.bg_app_color || existing.bg_app_color,
      bg_card_color: themeData.bg_card_color || existing.bg_card_color,
      bg_sidebar_color: themeData.bg_sidebar_color || existing.bg_sidebar_color,
      text_main_color: themeData.text_main_color || existing.text_main_color,
      border_color: themeData.border_color || existing.border_color,
      icon_pack: themeData.icon_pack || null,
      tokens_glyph: themeData.tokens_glyph || themeData.tokensGlyph || (themeData.icon_pack && themeData.icon_pack.tokens) || existing.tokens_glyph || "monitoring",
      reasoning_glyph: themeData.reasoning_glyph || themeData.reasoningGlyph || (themeData.icon_pack && themeData.icon_pack.reasoning) || existing.reasoning_glyph || "psychology",
      settings_models_glyph: themeData.settings_models_glyph || themeData.settingsModelsGlyph || (themeData.icon_pack && themeData.icon_pack.settingsModels) || existing.settings_models_glyph || "smart_toy",
      settings_plugins_glyph: themeData.settings_plugins_glyph || themeData.settingsPluginsGlyph || (themeData.icon_pack && themeData.icon_pack.settingsPlugins) || existing.settings_plugins_glyph || "extension",
      settings_connectors_glyph: themeData.settings_connectors_glyph || themeData.settingsConnectorsGlyph || (themeData.icon_pack && themeData.icon_pack.settingsConnectors) || existing.settings_connectors_glyph || "hub",
      settings_security_glyph: themeData.settings_security_glyph || themeData.settingsSecurityGlyph || (themeData.icon_pack && themeData.icon_pack.settingsSecurity) || existing.settings_security_glyph || "security",
      settings_config_glyph: themeData.settings_config_glyph || themeData.settingsConfigGlyph || (themeData.icon_pack && themeData.icon_pack.settingsConfig) || existing.settings_config_glyph || "tune",
      appliedAt: new Date().toISOString(),
    });
    localStorage.setItem(storageKey, JSON.stringify(merged));
  } catch (e) {}

  syncTitleBarTheme();

  if (!isIconPack) {
    // Keep open wallpaper inputs cleanly synchronized with active image (never "none")
    document.querySelectorAll(".plugin-param-image-input").forEach((inp) => {
      if (wallpaperName && wallpaperName !== "none") {
        inp.value = wallpaperName;
        inp.dataset.filename = wallpaperName;
      } else if (!inp.value || inp.value === "none") {
        inp.value = "";
      }
    });

    // Synchronize preset select dropdowns
    if (themeData.preset) {
      document.querySelectorAll('.plugin-param-preset-select[data-param="preset"]').forEach((sel) => {
        sel.value = themeData.preset;
      });
    }

    // Synchronize font family select dropdowns
    if (themeData.font_family) {
      document.querySelectorAll('.plugin-param-input[data-param="font_family"]').forEach((sel) => {
        sel.value = themeData.font_family;
      });
    }

    // Synchronize color text inputs and pickers
    if (accent) {
      document.querySelectorAll('.plugin-param-input[data-param="accent_color"]').forEach((inp) => {
        inp.value = accent;
        const field = inp.closest(".plugin-param-field");
        if (field) {
          const picker = field.querySelector(".plugin-param-color-picker");
          if (picker && /^#[0-9A-Fa-f]{6}$/i.test(accent)) picker.value = accent;
        }
      });
    }
  }

  if (showToast) {
    showPluginToast(`${isIconPack ? "💎" : "🎨"} Applied: ${themeName}`);
  }
};

/**
 * Reset all dynamic icon pack styles back to defaults.
 */
window.resetDynamicIconPack = function (showToast = true) {
  const styleEl = document.getElementById("ai-plate-dynamic-icon-theme");
  if (styleEl) styleEl.remove();
  const fontEl = document.getElementById("ai-plate-dynamic-icon-font");
  if (fontEl) fontEl.remove();
  localStorage.removeItem("ai_plate_active_icon_pack");
  if (showToast) {
    showPluginToast("Restored default UI icons.");
  }
};

/**
 * Reset all dynamic theme styles back to defaults.
 */
window.resetDynamicTheme = function (showToast = true) {
  const styleEl = document.getElementById("ai-plate-dynamic-plugin-theme");
  if (styleEl) styleEl.remove();
  const fontEl = document.getElementById("ai-plate-dynamic-plugin-font");
  if (fontEl) fontEl.remove();
  document.documentElement.style.removeProperty("--accent-primary");
  localStorage.removeItem("ai_plate_active_theme");
  localStorage.removeItem("ai_plate_custom_theme"); // clean up legacy key if present

  const defConfig = (typeof BUILTIN_THEME_PALETTES !== "undefined" && BUILTIN_THEME_PALETTES["nordic-dark"]) || {
    preset: "nordic-dark",
    font_family: "Plus Jakarta Sans",
    accent_color: "#6366f1",
    bg_app_color: "#0c0e14",
    bg_card_color: "#151924",
    text_main_color: "#f1f5f9",
    border_color: "#26262e",
    border_radius: "10px",
    bg_image: "none"
  };

  // Reset all theme tool forms in UI
  document.querySelectorAll(".plugin-tool-form").forEach((form) => {
    const isTheme =
      form.getAttribute("data-tool-name")?.includes("theme") ||
      form.getAttribute("data-plugin-id")?.includes("theme");
    if (!isTheme) return;

    const presetSelect = form.querySelector('.plugin-param-preset-select[data-param="preset"]');
    if (presetSelect) {
      presetSelect.value = "nordic-dark";
    }

    const delBtn = form.querySelector(".btn-delete-custom-preset");
    if (delBtn) delBtn.style.display = "none";

    Object.entries(defConfig).forEach(([k, v]) => {
      const input = form.querySelector(`.plugin-param-input[data-param="${k}"]`);
      if (!input) return;
      if (input.type === "checkbox") {
        input.checked = false;
      } else {
        input.value = String(v === "none" && input.classList.contains("plugin-param-image-input") ? "" : v);
        if (input.classList.contains("plugin-param-image-input")) {
          delete input.dataset.filename;
          delete input.dataset.dataUrl;
          delete input.dataset.mediaUrl;
        }
        const field = input.closest(".plugin-param-field");
        if (field) {
          const picker = field.querySelector(".plugin-param-color-picker");
          if (picker && /^#[0-9A-Fa-f]{6}$/i.test(String(v).trim())) {
            picker.value = String(v).trim();
          }
        }
      }
    });
  });

  // Clear wallpaper inputs back to placeholder state
  document.querySelectorAll(".plugin-param-image-input").forEach((inp) => {
    inp.value = "";
    delete inp.dataset.filename;
    delete inp.dataset.dataUrl;
    delete inp.dataset.mediaUrl;
  });

  if (showToast) {
    showPluginToast("Restored default UI styling.");
  }
  syncTitleBarTheme();
};

// Backward-compatibility alias
window.resetDynamicPluginTheme = window.resetDynamicTheme;

// Rehydrate dynamic active theme & icon pack on startup
try {
  const savedTheme = localStorage.getItem("ai_plate_active_theme") || localStorage.getItem("ai_plate_custom_theme");
  if (savedTheme) {
    const parsed = JSON.parse(savedTheme);
    if (parsed && (parsed.active || parsed.css)) {
      window.applyDynamicThemeDirect(parsed, false);
    }
  }
  const savedIcons = localStorage.getItem("ai_plate_active_icon_pack");
  if (savedIcons) {
    const parsedIcons = JSON.parse(savedIcons);
    if (parsedIcons && (parsedIcons.active || parsedIcons.css)) {
      window.applyDynamicThemeDirect(parsedIcons, false);
    }
  }
  syncTitleBarTheme();
} catch (e) {}


// ─── LaTeX & Markdown Formatter ─────────────────────────────────────

function formatMath(text) {
  if (typeof katex === "undefined" || !text) return text;

  // Block math: $$ ... $$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math) => {
    try {
      return `<div class="math-block">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `$$${math}$$`;
    }
  });

  // Inline math: $ ... $
  text = text.replace(/\$([^\$\n]+?)\$/g, (_match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `$${math}$`;
    }
  });

  return text;
}

window.openModal = function (title, contentHtml) {
  if (!modalContainer || !modalBody || !modalTitle) return;
  modalTitle.textContent = title || "Preview";
  modalBody.innerHTML = contentHtml;
  modalContainer.classList.remove("hidden");
  void modalContainer.offsetWidth;
  modalContainer.classList.add("visible");
};

window.closeModal = function () {
  if (!modalContainer) return;
  // Safely pause and unload any playing video or audio
  const mediaElements = modalContainer.querySelectorAll("video, audio");
  mediaElements.forEach((el) => {
    try {
      el.pause();
      el.src = "";
      el.load();
    } catch {}
  });
  modalContainer.classList.remove("visible");
  setTimeout(() => {
    if (!modalContainer.classList.contains("visible")) {
      modalContainer.classList.add("hidden");
      if (modalBody) modalBody.innerHTML = "";
    }
  }, 280);
};

window.openLightbox = function (src, title = "Image Preview") {
  const contentHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: var(--radius-md); width: 100%;">
      <img src="${src}" alt="${escapeHtmlStr(title)}" style="max-width: 100%; max-height: 72vh; object-fit: contain; border-radius: var(--radius-sm); box-shadow: 0 8px 24px rgba(0,0,0,0.4);" />
      <div style="display: flex; gap: 10px; margin-top: 6px;">
        <a href="${src}" download="${escapeHtmlStr(title)}" class="btn btn-secondary btn-sm" style="text-decoration: none;">⬇ Download Image</a>
        <a href="${src}" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration: none;">↗ Open Full Size</a>
      </div>
    </div>
  `;
  window.openModal(`🖼️ ${title}`, contentHtml);
};

window.openVideoModal = function (src, title = "Video Preview", isSandbox = false) {
  const safeTitle = escapeHtmlStr(title);
  const ext = title.includes(".") ? title.split(".").pop().toLowerCase() : "mp4";
  const mime = ext === "webm" ? "video/webm" : ext === "ogg" ? "video/ogg" : ext === "mov" ? "video/quicktime" : "video/mp4";

  const contentHtml = `
    <div class="video-modal-container" style="display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 6px; width: 100%;">
      <div id="video-modal-player-wrap" style="width: 100%; max-height: 72vh; background: #000; border-radius: var(--radius-sm); overflow: hidden; display: flex; justify-content: center; align-items: center; box-shadow: 0 8px 32px rgba(0,0,0,0.6); position: relative;">
        <video id="active-modal-video" src="${src}" controls autoplay playsinline style="max-width: 100%; max-height: 72vh; width: 100%; outline: none;" preload="auto" type="${mime}"></video>
        <div id="video-error-fallback" style="display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.85); flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center;">
          <div style="font-size: 40px;">⚠️</div>
          <div style="color: #f59e0b; font-weight: 600; font-size: 14px;">Video cannot be played in the embedded player</div>
          <div style="color: var(--text-dim); font-size: 12px; max-width: 320px;">The codec or container may not be supported by Chromium. Use the buttons below to play in your OS default media player.</div>
          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button type="button" class="btn btn-primary btn-sm" onclick="if(window.electronAPI && window.electronAPI.artifacts.openExternal) window.electronAPI.artifacts.openExternal('${encodeURIComponent(title)}', ${isSandbox}, 'play'); else showPluginToast('External player not available in web mode');" title="Open in default OS media player">▶ Open in Default Player</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="if(window.electronAPI && window.electronAPI.artifacts.openExternal) window.electronAPI.artifacts.openExternal('${encodeURIComponent(title)}', ${isSandbox}, 'folder'); else showPluginToast('Folder view not available in web mode');" title="Show file in Explorer/Finder">📁 Show in Folder</button>
          </div>
        </div>
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; width: 100%; gap: 10px; margin-top: 4px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11.5px; color: var(--text-dim); font-weight: 500;">Speed:</span>
          <select class="form-input form-input-sm" style="width: auto; padding: 3px 8px; font-size: 11.5px;" onchange="const v=document.getElementById('active-modal-video'); if(v) v.playbackRate = parseFloat(this.value);">
            <option value="0.5">0.5x</option>
            <option value="1.0" selected>1.0x (Normal)</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2.0">2.0x</option>
          </select>
          <button type="button" class="btn btn-secondary btn-sm" onclick="const v=document.getElementById('active-modal-video'); if(v) { v.loop = !v.loop; this.classList.toggle('active', v.loop); showPluginToast(v.loop ? '🔁 Looping enabled' : '➡️ Looping disabled'); }" title="Toggle Repeat Loop">🔁 Loop</button>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="if(window.electronAPI && window.electronAPI.artifacts.openExternal) window.electronAPI.artifacts.openExternal('${encodeURIComponent(title)}', ${isSandbox}, 'play'); else showPluginToast('External player not available');" title="Open in default OS media player">▶ Open in Player</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="if(window.electronAPI && window.electronAPI.artifacts.openExternal) window.electronAPI.artifacts.openExternal('${encodeURIComponent(title)}', ${isSandbox}, 'folder');" title="Show in file explorer">📁 Folder</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="shareArtifactWeb('${encodeURIComponent(title)}', ${isSandbox}, this)" title="Share video to web">🌐 Share to Web</button>
          <a href="${src}" download="${safeTitle}" class="btn btn-secondary btn-sm" style="text-decoration: none;">⬇ Download Video</a>
        </div>
      </div>
    </div>
  `;
  window.openModal(`🎬 ${title}`, contentHtml);

  // Attach error handler after modal renders
  requestAnimationFrame(() => {
    const vid = document.getElementById("active-modal-video");
    const errFallback = document.getElementById("video-error-fallback");
    if (vid && errFallback) {
      vid.onerror = () => {
        errFallback.style.display = "flex";
        vid.style.opacity = "0.15";
        console.warn("[VideoModal] Video playback error for:", title, vid.error);
      };
      // Also handle stall/timeout — if video hasn't started playing in 5s, show fallback
      let playStarted = false;
      vid.addEventListener("playing", () => { playStarted = true; }, { once: true });
      setTimeout(() => {
        if (!playStarted && vid.readyState < 2) {
          errFallback.style.display = "flex";
          vid.style.opacity = "0.15";
        }
      }, 5000);
    }
  });
};

window.openAudioModal = function (src, title = "Audio Playback", isSandbox = false) {
  const safeTitle = escapeHtmlStr(title);
  const contentHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px; width: 100%; text-align: center;">
      <div style="font-size: 48px;">🎧</div>
      <div style="font-weight: 600; font-size: 15px; color: var(--text-main);">${safeTitle}</div>
      <audio id="active-modal-audio" controls autoplay style="width: 100%; max-width: 480px; outline: none;">
        <source src="${src}">
        Your browser does not support audio playback.
      </audio>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="shareArtifactWeb('${encodeURIComponent(title)}', ${isSandbox}, this)">🌐 Share to Web</button>
        <a href="${src}" download="${safeTitle}" class="btn btn-secondary btn-sm" style="text-decoration: none;">⬇ Download Audio</a>
      </div>
    </div>
  `;
  window.openModal(`🎵 ${title}`, contentHtml);
};

if (modalClose) {
  modalClose.addEventListener("click", () => window.closeModal());
}

if (modalContainer) {
  modalContainer.addEventListener("click", (e) => {
    if (e.target === modalContainer) {
      window.closeModal();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalContainer && modalContainer.classList.contains("visible")) {
    window.closeModal();
  }
});

function getCleanMediaUrl(rawUrl) {
  if (!rawUrl) return "";
  let clean = rawUrl.trim().replace(/^file:\/\/\/?/i, "").replace(/^["']|["']$/g, "");
  if (clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("data:")) {
    return clean;
  }
  // If already an API URL with name or file query:
  const match = clean.match(/[?&](?:name|file)=([^&]+)/);
  if (match) {
    const rawVal = decodeURIComponent(match[1]);
    const simpleName = rawVal.replace(/^[/\\]+/, "").split(/[/\\]/).pop();
    return `/api/media?name=${encodeURIComponent(simpleName || rawVal)}`;
  }
  const filename = clean.split(/[/\\]/).pop();
  return `/api/media?name=${encodeURIComponent(filename || clean)}`;
}

/**
 * Strict XSS Security Guard & HTML Sanitizer.
 * Purifies markdown and HTML before DOM injection.
 */
function sanitizeHtml(html, options = {}) {
  if (!html) return "";

  // 1. If DOMPurify is loaded via CDN, use it with a strict whitelist
  if (typeof DOMPurify !== "undefined") {
    const config = {
      ALLOWED_TAGS: [
        "h1", "h2", "h3", "h4", "h5", "h6",
        "p", "span", "div", "br", "hr",
        "strong", "b", "em", "i", "u", "s", "del", "mark",
        "pre", "code", "kbd", "blockquote",
        "ul", "ol", "li",
        "table", "thead", "tbody", "tr", "th", "td",
        "img", "a", "svg", "path", "circle", "line", "polygon", "polyline",
        "button", "details", "summary", "optgroup", "option", "select",
        "annotation", "semantics", "math", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "msqrt", "mtable", "mtr", "mtd"
      ],
      ALLOWED_ATTR: [
        "class", "id", "style", "title", "alt", "src", "href", "target",
        "rel", "download", "loading",
        "viewbox", "width", "height", "stroke", "stroke-width", "fill", "d",
        "type", "value", "selected", "disabled", "data-param", "data-tool-name", "data-plugin-id",
        "encoding", "aria-hidden", "aria-label", "tabindex"
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|\/|#|data:image\/)/i,
      ALLOW_DATA_ATTR: true,
      FORBID_TAGS: ["script", "iframe", "object", "embed", "applet", "meta", "link", "form", "base", "style"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onkeydown", "onkeyup", "onchange", "onsubmit"],
      ...options,
    };
    return DOMPurify.sanitize(html, config);
  }

  // 2. High-security offline fallback sanitizer
  let clean = String(html)
    .replace(/<\s*(script|iframe|object|embed|applet|meta|link|form|base|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|applet|meta|link|form|base|style)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^ >]+/gi, "")
    .replace(/href\s*=\s*(['"])javascript:.*?\1/gi, 'href="#"')
    .replace(/src\s*=\s*(['"])javascript:.*?\1/gi, 'src=""');

  return clean;
}

function sanitizeUrl(url) {
  if (!url) return "#";
  const trimmed = url.trim();
  if (/^(?:javascript|vbscript|data:text\/html)/i.test(trimmed)) {
    return "#";
  }
  return trimmed;
}

function renderMarkdown(raw) {
  if (!raw) return "";

  const codeBlocks = [];
  const mathBlocks = [];

  // Step 1: Extract & protect multi-line code blocks
  let text = raw.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const trimmedCode = code.trim();
    let highlighted = escapeHtmlStr(trimmedCode);

    if (typeof hljs !== "undefined") {
      try {
        if (lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(trimmedCode, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(trimmedCode).value;
        }
      } catch {
        highlighted = escapeHtmlStr(trimmedCode);
      }
    }

    const htmlBlock = `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span>${escapeHtmlStr(lang || "code")}</span>
          <button class="copy-btn" onclick="copyCode(this)">📋 Copy</button>
        </div>
        <pre><code class="hljs">${highlighted}</code></pre>
      </div>`;
    codeBlocks.push(htmlBlock);
    return placeholder;
  });

  // Step 2: Extract & format LaTeX equations
  if (typeof katex !== "undefined") {
    // Block math $$...$$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, math) => {
      const placeholder = `__MATH_BLOCK_${mathBlocks.length}__`;
      try {
        mathBlocks.push(`<div class="math-block">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`);
      } catch {
        mathBlocks.push(`$$${escapeHtmlStr(math)}$$`);
      }
      return placeholder;
    });

    // Inline math $...$
    text = text.replace(/\$([^\$\n]+?)\$/g, (_m, math) => {
      const placeholder = `__MATH_BLOCK_${mathBlocks.length}__`;
      try {
        mathBlocks.push(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }));
      } catch {
        mathBlocks.push(`$${escapeHtmlStr(math)}$`);
      }
      return placeholder;
    });
  }

  // Step 3: Escape ALL raw HTML tags in standard text to neutralize XSS injection
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Step 4: Inline Code `code`
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Step 5: Images & Videos: ![alt](url) -> Gallery Card
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const rawClean = url.replace(/&amp;/g, "&");
    const cleanUrl = sanitizeUrl(getCleanMediaUrl(rawClean));
    const cleanAlt = (alt || "Media deliverable").trim();
    const cleanExt = cleanUrl.split(/[#?]/)[0].split(".").pop().toLowerCase();
    const isVid = ["mp4", "webm", "ogg", "mov", "mkv", "m4v"].includes(cleanExt);

    if (isVid) {
      return `
        <div class="video-gallery-card">
          <div class="video-wrapper">
            <video src="${cleanUrl}" controls preload="metadata" style="max-width: 100%; max-height: 420px; width: 100%; border-radius: 6px; background: #000;"></video>
          </div>
          <div class="video-caption">
            <span>🎬 ${escapeHtmlStr(cleanAlt)}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="openVideoModal('${escapeHtmlStr(cleanUrl)}', '${escapeHtmlStr(cleanAlt)}')">⛶ Fullscreen</button>
              <a href="${cleanUrl}" download class="image-download-link">⬇ Download</a>
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="image-gallery-card">
        <div class="image-wrapper">
          <img src="${cleanUrl}" alt="${escapeHtmlStr(cleanAlt)}" loading="lazy" onclick="openLightbox('${escapeHtmlStr(cleanUrl)}', '${escapeHtmlStr(cleanAlt)}')" />
        </div>
        <div class="image-caption">
          <span>🖼️ ${escapeHtmlStr(cleanAlt)}</span>
          <a href="${cleanUrl}" download class="image-download-link">⬇ Download</a>
        </div>
      </div>`;
  });

  // Step 6: Markdown Links [title](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, title, url) => {
    const rawUrl = url.replace(/&amp;/g, "&");
    const cleanUrl = sanitizeUrl(rawUrl);
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${title}</a>`;
  });

  // Step 7: Bold & Italic
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Step 8: Headers
  text = text.replace(/^### (.*$)/gim, '<h3 style="margin: 14px 0 6px 0; font-size: 16px; font-weight: 600;">$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2 style="margin: 18px 0 8px 0; font-size: 18px; font-weight: 600;">$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1 style="margin: 22px 0 10px 0; font-size: 22px; font-weight: 700;">$1</h1>');

  // Step 9: Markdown Tables
  const tableRegex = /((?:^[ \t]*\|?[^\n\|]+\|[^\n]*(?:\r?\n|$))+)/gm;
  text = text.replace(tableRegex, (match) => {
    const rawLines = match.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (rawLines.length < 2) return match;

    const isDividerLine = (l) => /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(l) || (/^[|\s:-]+$/.test(l) && l.includes("-"));
    const hasDivider = rawLines.length >= 2 && isDividerLine(rawLines[1]);

    const parseRow = (line, tag) => {
      let cleaned = line.trim();
      if (cleaned.startsWith("|")) cleaned = cleaned.substring(1);
      if (cleaned.endsWith("|")) cleaned = cleaned.substring(0, cleaned.length - 1);
      const cells = cleaned.split("|");
      return `<tr>${cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("")}</tr>`;
    };

    const header = parseRow(rawLines[0], "th");
    const bodyStartIndex = hasDivider ? 2 : 1;
    const bodyRows = rawLines
      .slice(bodyStartIndex)
      .filter((l) => !isDividerLine(l))
      .map((l) => parseRow(l, "td"))
      .join("");

    return `\n\n<div class="table-container"><table class="data-table"><thead>${header}</thead><tbody>${bodyRows}</tbody></table></div>\n\n`;
  });

  // Step 10: Unordered lists
  text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left: 18px;">$1</li>');

  // Step 11: Paragraphs
  const paragraphs = text.split(/\n\n+/);
  let html = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (
        trimmed.startsWith("<div") ||
        trimmed.startsWith("<table") ||
        trimmed.startsWith("<h1") ||
        trimmed.startsWith("<h2") ||
        trimmed.startsWith("<h3") ||
        trimmed.startsWith("<li") ||
        trimmed.startsWith("__CODE_BLOCK_") ||
        trimmed.startsWith("__MATH_BLOCK_")
      ) {
        return p;
      }
      return `<p>${p.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  // Step 12: Restore code blocks and math blocks
  codeBlocks.forEach((block, idx) => {
    html = html.replace(`__CODE_BLOCK_${idx}__`, block);
  });
  mathBlocks.forEach((block, idx) => {
    html = html.replace(`__MATH_BLOCK_${idx}__`, block);
  });

  // Step 13: Final defense-in-depth sanitization pass
  return sanitizeHtml(html);
}

// ─── Real-Time Token Streaming Engine ───────────────────────────────

/**
 * Real-time token streaming engine with natural randomized character cadence.
 * Emulates authentic token arrival: reveals a few characters at a time randomly
 * (1 to 4 chars with subtle random variance and dynamic acceleration for large outputs),
 * maintaining live markdown rendering, code syntax highlighting, and auto-scrolling.
 */
function streamTextToElement(options) {
  const {
    targetElement,
    fullText,
    blockElement,
    sessionId,
    onComplete,
  } = options;

  if (!targetElement) return;

  const isStreamingEnabled = localStorage.getItem("ai_plate_token_streaming") !== "false";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Immediate render if user turned off streaming, prefers reduced motion, or message is tiny
  if (!isStreamingEnabled || prefersReducedMotion || !fullText || fullText.length < 5) {
    targetElement.innerHTML = renderMarkdown(fullText);
    if (typeof onComplete === "function") onComplete();
    return;
  }

  let currentIndex = 0;
  const totalLength = fullText.length;
  let isCancelled = false;
  let timerId = null;

  const caretHtml = `<span class="streaming-caret" aria-hidden="true"></span>`;

  const maybeScrollToBottom = () => {
    const autoScrollSetting = localStorage.getItem("ai_plate_auto_scroll") !== "false";
    if (autoScrollSetting && chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  };

  // Helper to balance unclosed code fences while actively streaming
  const balanceStreamingMarkdown = (str) => {
    const fences = (str.match(/```/g) || []).length;
    if (fences % 2 === 1) {
      return str + "\n```";
    }
    return str;
  };

  const streamHandle = {
    cancel: () => {
      if (isCancelled) return;
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      targetElement.innerHTML = renderMarkdown(fullText);
      maybeScrollToBottom();
      if (typeof onComplete === "function") onComplete();
    },
  };

  if (blockElement) {
    blockElement._activeStream = streamHandle;
  }
  if (sessionId && runningSessions.has(sessionId)) {
    const sInfo = runningSessions.get(sessionId);
    if (sInfo) sInfo.activeStream = streamHandle;
  }

  const tick = () => {
    if (isCancelled) return;

    // Adaptive chunk sizing:
    // Base: 1 to 4 characters with natural random variation.
    // If large buffer remaining, adaptively scales up so reading speed remains fluid.
    const remaining = totalLength - currentIndex;
    let charsToTake = 1;

    if (remaining > 2000) {
      charsToTake = Math.floor(Math.random() * 8) + 12; // 12-19 chars for massive outputs
    } else if (remaining > 800) {
      charsToTake = Math.floor(Math.random() * 5) + 6;  // 6-10 chars for long outputs
    } else if (remaining > 300) {
      charsToTake = Math.floor(Math.random() * 3) + 3;  // 3-5 chars
    } else {
      // 1 to 4 characters with random jitter (natural token simulation)
      charsToTake = Math.floor(Math.random() * 3) + 1;  // 1, 2, or 3 characters
    }

    currentIndex = Math.min(totalLength, currentIndex + charsToTake);
    const partialText = fullText.slice(0, currentIndex);

    if (currentIndex >= totalLength) {
      // Completed streaming!
      if (blockElement) delete blockElement._activeStream;
      if (sessionId && runningSessions.has(sessionId)) {
        const sInfo = runningSessions.get(sessionId);
        if (sInfo) delete sInfo.activeStream;
      }
      targetElement.innerHTML = renderMarkdown(fullText);
      maybeScrollToBottom();
      if (typeof onComplete === "function") {
        onComplete();
      }
      return;
    }

    // Live progressive render with balanced code fence and blinking caret
    targetElement.innerHTML = renderMarkdown(balanceStreamingMarkdown(partialText)) + caretHtml;
    maybeScrollToBottom();

    // Natural micro-delay cadence with punctuation pacing
    const lastChar = fullText[currentIndex - 1];
    let nextDelay = Math.floor(Math.random() * 14) + 12; // 12ms to 25ms base

    if (lastChar === "\n") {
      nextDelay += 18;
    } else if (lastChar === "." || lastChar === "!" || lastChar === "?") {
      nextDelay += 28;
    } else if (lastChar === "," || lastChar === ";" || lastChar === ":") {
      nextDelay += 12;
    }

    timerId = setTimeout(tick, nextDelay);
  };

  // Start initial tick
  tick();
}

// ─── Universal Robust Clipboard & Copy Engine ────────────────────────

window.universalCopyText = async function (text, btn, successMsg = "✓ Copied!", defaultMsg = "📋 Copy") {
  if (text === null || text === undefined) return false;
  const str = String(text);
  if (str.length === 0) return false;
  let copied = false;

  // 1. Electron Native Clipboard Bridge (Bypasses all browser sandbox/focus restrictions)
  if (window.electronAPI && window.electronAPI.clipboard && typeof window.electronAPI.clipboard.writeText === "function") {
    try {
      copied = Boolean(window.electronAPI.clipboard.writeText(str));
    } catch {}
  }

  // 2. Standard navigator.clipboard API
  if (!copied && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(str);
      copied = true;
    } catch {}
  }

  // 3. Fallback textarea + document.execCommand('copy')
  if (!copied) {
    try {
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      copied = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {}
  }

  if (btn) {
    const origHtml = btn.innerHTML;
    btn.innerHTML = copied ? successMsg : "❌ Failed";
    btn.classList.toggle("copied", copied);
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.classList.remove("copied");
    }, 2000);
  }

  return copied;
};

window.copyCode = function (btn, encodedCode) {
  let code = "";
  if (typeof encodedCode === "string" && encodedCode.length > 0) {
    try {
      code = decodeURIComponent(encodedCode);
    } catch {
      code = encodedCode;
    }
  }

  if (!code && btn) {
    // 1. Check parent wrapper / step drawer / code wrapper
    const wrapper = btn.closest(".code-block-wrapper, .step-io-block, .step-details-drawer, .approval-code-card, .plugin-custom-card, pre");
    if (wrapper) {
      const codeEl = wrapper.querySelector("code, pre, textarea");
      if (codeEl) {
        code = codeEl.innerText || codeEl.textContent || "";
      }
    }
    // 2. Check siblings or parent container pre/code
    if (!code) {
      const parentPre = btn.parentElement ? btn.parentElement.querySelector("pre code, pre, code") : null;
      if (parentPre) {
        code = parentPre.innerText || parentPre.textContent || "";
      }
    }
  }

  window.universalCopyText(code, btn, "✓ Copied!", "📋 Copy");
};

window.copyPromptText = function (btn) {
  const block = btn ? btn.closest(".message-block") : null;
  let text = (block && block._rawPrompt) || "";
  if (!text && block) {
    const bodyEl = block.querySelector(".message-body");
    if (bodyEl) {
      const clone = bodyEl.cloneNode(true);
      const attachments = clone.querySelector(".message-attachments");
      if (attachments) attachments.remove();
      text = (clone.innerText || clone.textContent || "").trim();
    }
  }
  if (!text) return;

  const label = btn.querySelector(".copy-prompt-label");
  const svg = btn.querySelector("svg");
  const origLabel = label ? label.textContent : "Copy";

  window.universalCopyText(text, null).then((ok) => {
    if (!ok) return;
    btn.classList.add("copied");
    if (label) label.textContent = "Copied!";
    if (svg) {
      svg.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
    }
    setTimeout(() => {
      btn.classList.remove("copied");
      if (label) label.textContent = origLabel;
      if (svg) {
        svg.innerHTML = `
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        `;
      }
    }, 2000);
  });
};

// ─── Knowledge Base Manager ─────────────────────────────────────────

async function loadKnowledgeBase() {
  try {
    const res = await fetch("/api/kb/documents");
    if (!res.ok) return;
    const data = await res.json();

    if (kbCountBadge) {
      kbCountBadge.textContent = (data.documents && data.documents.length) || 0;
    }

    if (!data.documents || data.documents.length === 0) {
      kbTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">
            No documents ingested yet. Upload a file above to enable RAG semantic search.
          </td>
        </tr>
      `;
      return;
    }

    kbTableBody.innerHTML = data.documents
      .map((doc) => {
        const date = new Date(doc.ingestedAt).toLocaleString();
        const escapedName = encodeURIComponent(doc.name);
        return `
        <tr>
          <td><strong>📄 ${doc.name}</strong></td>
          <td><span class="nav-badge" style="margin: 0;">${doc.chunkCount} chunks</span></td>
          <td>${(doc.totalCharacters || 0).toLocaleString()} chars</td>
          <td style="color: var(--text-dim); font-size: 12px;">${date}</td>
          <td style="text-align: right;">
            <button class="btn btn-danger btn-sm" onclick="deleteDocument('${escapedName}')">🗑 Delete</button>
          </td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    kbTableBody.innerHTML = `<tr><td colspan="5" style="color: var(--danger); padding: 16px;">Failed to load documents: ${err.message}</td></tr>`;
  }
}

window.deleteDocument = async function (encodedName) {
  const name = decodeURIComponent(encodedName);
  const confirmed = await showThemedConfirm({
    title: "Remove Document",
    message: `Remove document "${name}" and all its vector embeddings from the Knowledge Base?`,
    confirmText: "Remove Document",
    icon: "📚",
    danger: true,
  });
  if (confirmed) {
    try {
      const res = await fetch(`/api/kb/documents?filename=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadKnowledgeBase();
        loadStatus();
      }
    } catch (err) {
      alert("Failed to delete document: " + err.message);
    }
  }
};

// File Upload / Dropzone
btnBrowseKb.addEventListener("click", () => kbFileInput.click());

kbFileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    await handleFileUpload(f);
  }
  kbFileInput.value = "";
});

kbDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  kbDropzone.classList.add("dragover");
});

kbDropzone.addEventListener("dragleave", () => {
  kbDropzone.classList.remove("dragover");
});

kbDropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  kbDropzone.classList.remove("dragover");
  const files = Array.from(e.dataTransfer.files || []);
  for (const f of files) {
    await handleFileUpload(f);
  }
});

async function handleFileUpload(file) {
  const dropzoneTitle = kbDropzone.querySelector(".dropzone-title");
  const originalTitle = dropzoneTitle.textContent;
  dropzoneTitle.textContent = `⏳ Embedding & Ingesting "${file.name}"... (may take a few seconds)`;
  kbTableBody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; padding: 32px; color: var(--text-dim);">
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
          <div class="tool-spinner" style="width:16px;height:16px;border-width:2px;"></div>
          Embedding "${file.name}" into Vector Store — this may take 5–15 seconds...
        </div>
      </td>
    </tr>
  `;

  try {
    const { content, isBase64 } = await readFileData(file);
    const res = await fetch("/api/kb/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        content: content,
        isBase64: isBase64,
      }),
    });

    const data = await res.json();
    if (data.success) {
      dropzoneTitle.textContent = `✅ Ingested "${file.name}" — ${data.result?.chunkCount || 0} chunks embedded`;
      setTimeout(() => (dropzoneTitle.textContent = originalTitle), 4000);
      await loadKnowledgeBase();
      await loadStatus();
    } else {
      dropzoneTitle.textContent = originalTitle;
      kbTableBody.innerHTML = `<tr><td colspan="5" style="color: var(--danger); padding: 16px;">❌ Upload failed: ${data.error || "Unknown error"}</td></tr>`;
    }
  } catch (err) {
    dropzoneTitle.textContent = originalTitle;
    kbTableBody.innerHTML = `<tr><td colspan="5" style="color: var(--danger); padding: 16px;">❌ Network error: ${err.message}</td></tr>`;
  }
}

btnRefreshKb.addEventListener("click", loadKnowledgeBase);

// ─── Persistent Deliverable Artifacts Gallery ───────────────────────

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Asynchronously updates sidebar count badges (Artifacts, Knowledge Base, and Sessions)
 * in real-time across all views without requiring users to switch tabs.
 */
async function updateBadgeCounts() {
  try {
    const [artRes, kbRes, sessRes] = await Promise.allSettled([
      fetch("/api/artifacts/files"),
      fetch("/api/kb/documents"),
      fetch("/api/sessions"),
    ]);

    if (artRes.status === "fulfilled" && artRes.value.ok) {
      const artData = await artRes.value.json();
      const count = (artData.files && artData.files.length) || 0;
      if (artifactsCountBadge) artifactsCountBadge.textContent = count;
    }

    if (kbRes.status === "fulfilled" && kbRes.value.ok) {
      const kbData = await kbRes.value.json();
      const count = (kbData.documents && kbData.documents.length) || 0;
      if (kbCountBadge) kbCountBadge.textContent = count;
    }

    if (sessRes.status === "fulfilled" && sessRes.value.ok) {
      const sessData = await sessRes.value.json();
      const count = (sessData.sessions && sessData.sessions.length) || 0;
      if (sessionCountBadge) sessionCountBadge.textContent = count;
    }
  } catch {}
}

async function loadArtifacts() {
  if (!artifactsGrid) return;
  try {
    const res = await fetch("/api/artifacts/files");
    if (!res.ok) return;
    const data = await res.json();

    const files = data.files || [];
    if (artifactsCountBadge) {
      artifactsCountBadge.textContent = files.length;
    }

    if (files.length === 0) {
      artifactsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 42px 20px; background: var(--bg-card); border: 1px dashed var(--border-card); border-radius: var(--radius-md);">
          <div style="font-size: 32px; margin-bottom: 8px;">📦</div>
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: var(--text-main);">No persistent artifacts generated yet</div>
          <p style="font-size: 12.5px; color: var(--text-muted); max-width: 480px; margin: 0 auto;">
            When you ask AI Plate to produce charts, plots, dataset files, or reports, they are permanently stored in <code>artifacts/</code>.
          </p>
        </div>
      `;
      return;
    }

    artifactsGrid.innerHTML = files
      .map((file) => {
        const fileUrl = `/api/artifacts/file?name=${encodeURIComponent(file.name)}`;
        const sizeFormatted = formatFileSize(file.sizeBytes);
        const extUpper = file.ext ? file.ext.replace(".", "").toUpperCase() : "FILE";
        const extLower = (file.ext || "").toLowerCase();
        const safeName = escapeHtmlStr(file.name).replace(/'/g, "\\'");
        const isImage = file.isImage || [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".bmp"].includes(extLower);
        const isVideo = file.isVideo || [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi", ".m4v"].includes(extLower);
        const isAudio = file.isAudio || [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(extLower);

        let viewAction = `viewArtifactCode('${encodeURIComponent(file.name)}')`;
        if (isImage) {
          viewAction = `openLightbox('${fileUrl}', '${safeName}')`;
        } else if (isVideo) {
          viewAction = `openVideoModal('${fileUrl}', '${safeName}', false)`;
        } else if (isAudio) {
          viewAction = `openAudioModal('${fileUrl}', '${safeName}', false)`;
        }

        let previewHtml = `<div style="font-size: 32px;">📄</div>`;
        if (isImage) {
          previewHtml = `<img src="${fileUrl}" alt="${escapeHtmlStr(file.name)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\\'font-size:32px;\\\'>🖼️</div>';" />`;
        } else if (isVideo) {
          previewHtml = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
              <video src="${fileUrl}" preload="metadata" muted style="width: 100%; height: 100%; object-fit: cover; opacity: 0.85;"></video>
              <div class="artifact-video-play-overlay">▶</div>
            </div>
          `;
        } else if (isAudio) {
          previewHtml = `<div style="font-size: 32px;">🎵</div>`;
        } else if (file.ext === ".py") {
          previewHtml = `<div style="font-size: 32px;">🐍</div>`;
        } else if (file.ext === ".js" || file.ext === ".ts") {
          previewHtml = `<div style="font-size: 32px;">⚡</div>`;
        } else if (file.ext === ".csv") {
          previewHtml = `<div style="font-size: 32px;">📊</div>`;
        } else if (file.ext === ".md") {
          previewHtml = `<div style="font-size: 32px;">📝</div>`;
        } else if (file.ext === ".html") {
          previewHtml = `<div style="font-size: 32px;">🌐</div>`;
        }

        return `
          <div class="artifact-card">
            <div class="artifact-preview" onclick="${viewAction}" title="Click to view ${escapeHtmlStr(file.name)}">
              <span class="artifact-type-badge">${extUpper}</span>
              ${previewHtml}
            </div>
            <div class="artifact-card-info">
              <div class="artifact-card-name" title="${escapeHtmlStr(file.name)}">${escapeHtmlStr(file.name)}</div>
              <div class="artifact-card-meta">${sizeFormatted} • ${new Date(file.modifiedAt).toLocaleDateString()} ${new Date(file.modifiedAt).toLocaleTimeString()}</div>
              <div class="artifact-card-actions">
                ${isVideo ? `<button class="btn btn-secondary btn-sm btn-card-action" onclick="openVideoModal('${fileUrl}', '${safeName}', false)" title="Play video">▶ Play</button>` : ""}
                ${isAudio ? `<button class="btn btn-secondary btn-sm btn-card-action" onclick="openAudioModal('${fileUrl}', '${safeName}', false)" title="Play audio">▶ Play</button>` : ""}
                <button class="btn btn-secondary btn-sm btn-card-action btn-share-artifact" onclick="shareArtifactWeb('${encodeURIComponent(file.name)}', false, this)" title="Share artifact to the web">🌐 Share</button>
                <a href="${fileUrl}" download="${escapeHtmlStr(file.name)}" class="btn btn-secondary btn-sm btn-card-action btn-download-artifact" title="Download file">⬇ Download</a>
                <button class="btn btn-danger btn-sm btn-delete-artifact" onclick="deleteArtifact('${encodeURIComponent(file.name)}')" title="Delete artifact" aria-label="Delete artifact">🗑</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    artifactsGrid.innerHTML = `<div style="color: var(--danger); padding: 16px;">Failed to load artifacts: ${err.message}</div>`;
  }
}

if (btnRefreshArtifacts) {
  btnRefreshArtifacts.addEventListener("click", loadArtifacts);
}

window.viewArtifactCode = async function (encodedName) {
  const filename = decodeURIComponent(encodedName);
  try {
    const res = await fetch(`/api/artifacts/file?name=${encodeURIComponent(filename)}`);
    const code = await res.text();

    let highlighted = code;
    if (typeof hljs !== "undefined") {
      try {
        highlighted = hljs.highlightAuto(code).value;
      } catch {
        highlighted = escapeHtmlStr(code);
      }
    } else {
      highlighted = escapeHtmlStr(code);
    }

    const contentHtml = `
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 12px;">
        <button class="btn btn-secondary btn-sm btn-share-artifact" onclick="shareArtifactWeb('${encodeURIComponent(filename)}', false, this)">🌐 Share to Web</button>
      </div>
      <pre><code class="hljs">${highlighted}</code></pre>
    `;
    window.openModal(`📦 ${filename}`, contentHtml);
  } catch (err) {
    alert("Failed to read artifact: " + err.message);
  }
};

window.deleteArtifact = async function (encodedName) {
  const filename = decodeURIComponent(encodedName);
  const confirmed = await showThemedConfirm({
    title: "Delete Deliverable Artifact",
    message: `Permanently delete "${filename}" from the deliverables gallery?`,
    confirmText: "Delete Artifact",
    icon: "🗑️",
    danger: true,
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/artifacts/file?name=${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadArtifacts();
    }
  } catch (err) {
    alert("Failed to delete artifact: " + err.message);
  }
};

// ─── Sandbox Scratchpad File Inspector ──────────────────────────────

async function loadSandboxFiles() {
  try {
    const res = await fetch("/api/sandbox/files");
    if (!res.ok) return;
    const data = await res.json();

    const files = data.files || [];
    if (sandboxCountBadge) {
      sandboxCountBadge.textContent = files.length;
    }

    if (files.length === 0) {
      sandboxGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 36px;">
          No generated scripts or plot images in <code>.sandbox/</code> yet.
        </div>
      `;
      return;
    }

    sandboxGrid.innerHTML = files
      .map((file) => {
        const fileName = typeof file === "string" ? file : (file.name || "untitled");
        const fileSize = typeof file === "object" && typeof file.sizeBytes === "number" ? file.sizeBytes : 0;
        const fileExt = (typeof file === "object" && file.ext) ? file.ext : ("." + fileName.split(".").pop().toLowerCase());
        const modifiedDate = typeof file === "object" && file.modifiedAt ? new Date(file.modifiedAt) : new Date();
        const isImage = typeof file === "object" && file.isImage !== undefined ? file.isImage : [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".bmp"].includes(fileExt);
        const isVideo = typeof file === "object" && file.isVideo !== undefined ? file.isVideo : [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi", ".m4v"].includes(fileExt);
        const isAudio = typeof file === "object" && file.isAudio !== undefined ? file.isAudio : [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(fileExt);
        const isCode = typeof file === "object" && file.isCode !== undefined ? file.isCode : [".py", ".js", ".ts", ".json", ".csv", ".txt", ".md", ".html", ".sh", ".bat", ".yaml", ".yml"].includes(fileExt);

        const fileUrl = `/api/sandbox/file?name=${encodeURIComponent(fileName)}`;
        const sizeFormatted = formatFileSize(fileSize);
        const safeName = escapeHtmlStr(fileName).replace(/'/g, "\\'");
        const timeFormatted = isNaN(modifiedDate.getTime()) ? "" : modifiedDate.toLocaleTimeString();

        let previewHtml = `<div style="font-size: 28px;">📄</div>`;
        if (isImage) {
          previewHtml = `<img src="${fileUrl}" alt="${escapeHtmlStr(fileName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\\'font-size:28px;\\\'>🖼️</div>';" />`;
        } else if (isVideo) {
          previewHtml = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000;">
              <video src="${fileUrl}" preload="metadata" muted style="width: 100%; height: 100%; object-fit: cover; opacity: 0.85;"></video>
              <div class="artifact-video-play-overlay">▶</div>
            </div>
          `;
        } else if (isAudio) {
          previewHtml = `<div style="font-size: 28px;">🎵</div>`;
        } else if (fileExt === ".py") {
          previewHtml = `<div style="font-size: 28px;">🐍</div>`;
        } else if (fileExt === ".js" || fileExt === ".ts") {
          previewHtml = `<div style="font-size: 28px;">⚡</div>`;
        } else if (fileExt === ".csv") {
          previewHtml = `<div style="font-size: 28px;">📊</div>`;
        } else if (fileExt === ".html") {
          previewHtml = `<div style="font-size: 28px;">🌐</div>`;
        }

        let viewAction = `viewSandboxCode('${encodeURIComponent(fileName)}')`;
        if (isImage) {
          viewAction = `openLightbox('${fileUrl}', '${safeName}')`;
        } else if (isVideo) {
          viewAction = `openVideoModal('${fileUrl}', '${safeName}', true)`;
        } else if (isAudio) {
          viewAction = `openAudioModal('${fileUrl}', '${safeName}', true)`;
        }

        return `
          <div class="sandbox-card">
            <div class="sandbox-preview" onclick="${viewAction}" title="Click to view ${escapeHtmlStr(fileName)}">${previewHtml}</div>
            <div class="sandbox-card-info">
              <div class="sandbox-card-name" title="${escapeHtmlStr(fileName)}">${escapeHtmlStr(fileName)}</div>
              <div class="sandbox-card-meta">${sizeFormatted}${timeFormatted ? ` • ${timeFormatted}` : ""}</div>
              <div class="sandbox-card-actions">
                ${isVideo ? `<button class="btn btn-secondary btn-sm btn-card-action" onclick="openVideoModal('${fileUrl}', '${safeName}', true)" title="Play video">▶ Play</button>` : ""}
                ${isAudio ? `<button class="btn btn-secondary btn-sm btn-card-action" onclick="openAudioModal('${fileUrl}', '${safeName}', true)" title="Play audio">▶ Play</button>` : ""}
                <button class="btn btn-secondary btn-sm btn-card-action btn-share-artifact" onclick="shareArtifactWeb('${encodeURIComponent(fileName)}', true, this)" title="Share file to the web">🌐 Share</button>
                <a href="${fileUrl}" download="${escapeHtmlStr(fileName)}" class="btn btn-secondary btn-sm btn-card-action btn-download-artifact" title="Download file">⬇ Download</a>
                <button class="btn btn-danger btn-sm btn-delete-sandbox" onclick="deleteSandboxFile('${encodeURIComponent(fileName)}')" title="Delete from sandbox" aria-label="Delete file">🗑</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    sandboxGrid.innerHTML = `<div style="color: var(--danger); padding: 16px;">Failed to load sandbox files: ${err.message}</div>`;
  }
}

// ─── Share Artifact to Web Feature ───────────────────────────────────

let activeShareUrl = "";

window.shareArtifactWeb = async function (encodedName, isSandbox = false, btn = null) {
  const filename = decodeURIComponent(encodedName);
  const origText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "<span>⏳ Sharing...</span>";
  }

  try {
    const res = await fetch("/api/artifacts/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, isSandbox }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to publish artifact to web");
    }

    activeShareUrl = data.url;
    try {
      await navigator.clipboard.writeText(data.url);
      showPluginToast("✨ Public link copied to clipboard!");
    } catch {}

    showShareModal(data);
  } catch (err) {
    console.error("Share artifact error:", err);
    alert("Share failed: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }
};

function showShareModal(data) {
  const modal = document.getElementById("share-artifact-modal");
  if (!modal) return;

  const urlInput = document.getElementById("share-artifact-url-input");
  const filenameEl = document.getElementById("share-artifact-filename");
  const filesizeEl = document.getElementById("share-artifact-filesize");
  const iconEl = document.getElementById("share-artifact-icon");
  const btnCopy = document.getElementById("share-btn-copy");
  const btnOpen = document.getElementById("share-btn-open");
  const btnDone = document.getElementById("share-btn-done");
  const btnClose = document.getElementById("share-artifact-close");

  const ext = (data.filename || "").split(".").pop().toLowerCase();
  let icon = "📄";
  if (["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(ext)) icon = "🖼️";
  else if (ext === "html" || ext === "htm") icon = "🌐";
  else if (["py", "js", "ts"].includes(ext)) icon = "⚡";
  else if (ext === "csv") icon = "📊";
  else if (ext === "md") icon = "📝";

  if (iconEl) iconEl.textContent = icon;
  if (filenameEl) filenameEl.textContent = data.filename || "artifact";
  if (filesizeEl) {
    const sizeStr = typeof data.sizeBytes === "number" ? formatFileSize(data.sizeBytes) : "";
    filesizeEl.textContent = `${sizeStr ? sizeStr + " • " : ""}Public Web Link`;
  }
  if (urlInput) {
    urlInput.value = data.url;
    setTimeout(() => {
      urlInput.select();
    }, 100);
  }

  if (btnCopy) {
    btnCopy.textContent = "📋 Copy";
    btnCopy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(data.url);
        btnCopy.textContent = "✅ Copied!";
        showPluginToast("✨ Copied to clipboard!");
        setTimeout(() => {
          btnCopy.textContent = "📋 Copy";
        }, 2000);
      } catch {
        urlInput.select();
        document.execCommand("copy");
        btnCopy.textContent = "✅ Copied!";
      }
    };
  }

  if (btnOpen) {
    btnOpen.onclick = () => {
      if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(data.url);
      } else {
        window.open(data.url, "_blank");
      }
    };
  }

  const closeModal = () => {
    modal.classList.remove("visible");
    setTimeout(() => modal.classList.add("hidden"), 200);
  };

  if (btnDone) btnDone.onclick = closeModal;
  if (btnClose) btnClose.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  modal.classList.remove("hidden");
  void modal.offsetWidth;
  modal.classList.add("visible");
}

window.deleteSandboxFile = async function (encodedName) {
  const filename = decodeURIComponent(encodedName);
  const confirmed = await showThemedConfirm({
    title: "Delete Scratchpad File",
    message: `Delete "${filename}" from the sandbox scratchpad?`,
    confirmText: "Delete",
    icon: "🗑️",
    danger: true,
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/sandbox/file?name=${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadSandboxFiles();
    }
  } catch (err) {
    alert("Failed to delete file: " + err.message);
  }
};

window.viewSandboxCode = async function (encodedName) {
  const filename = decodeURIComponent(encodedName);
  try {
    const res = await fetch(`/api/sandbox/file?name=${encodeURIComponent(filename)}`);
    const code = await res.text();

    let highlighted = code;
    if (typeof hljs !== "undefined") {
      try {
        highlighted = hljs.highlightAuto(code).value;
      } catch {
        highlighted = escapeHtmlStr(code);
      }
    } else {
      highlighted = escapeHtmlStr(code);
    }

    const contentHtml = `
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 12px;">
        <button class="btn btn-secondary btn-sm btn-share-artifact" onclick="shareArtifactWeb('${encodeURIComponent(filename)}', true, this)">🌐 Share to Web</button>
      </div>
      <pre><code class="hljs">${highlighted}</code></pre>
    `;
    window.openModal(`📄 ${filename}`, contentHtml);
  } catch (err) {
    alert("Failed to read file: " + err.message);
  }
};

btnCleanSandbox.addEventListener("click", async () => {
  const confirmed = await showThemedConfirm({
    title: "Wipe Sandbox Files",
    message: "Permanently delete all temporary runtime files stored in .sandbox/?",
    confirmText: "Wipe Files",
    icon: "🧹",
    danger: true,
  });
  if (confirmed) {
    try {
      const res = await fetch("/api/sandbox/clean", { method: "POST" });
      if (res.ok) {
        loadSandboxFiles();
      }
    } catch (err) {
      alert("Failed to clean sandbox: " + err.message);
    }
  }
});

btnRefreshSandbox.addEventListener("click", loadSandboxFiles);

// ─── Chat Message Submission & Streaming ────────────────────────────

let resizeRaf = null;
function adjustTextareaHeight() {
  if (!userInput) return;
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    const chatView = document.getElementById("tab-chat") || document.querySelector(".chat-container");
    const availableHeight = chatView && chatView.clientHeight > 0 ? chatView.clientHeight : window.innerHeight;
    const maxAllowedHeight = Math.max(120, Math.floor(availableHeight * 0.5));

    // Avoid forced layout thrashing: only reset height when text is deleted
    if (userInput.value.length < (userInput._lastLen || 0)) {
      userInput.style.height = "auto";
    }
    userInput._lastLen = userInput.value.length;

    const scrollHeight = userInput.scrollHeight;
    if (scrollHeight > maxAllowedHeight) {
      userInput.style.height = maxAllowedHeight + "px";
      userInput.style.overflowY = "auto";
    } else {
      userInput.style.height = Math.max(24, scrollHeight) + "px";
      userInput.style.overflowY = "hidden";
    }
  });
}

userInput.addEventListener("input", adjustTextareaHeight);
window.addEventListener("resize", adjustTextareaHeight);

userInput.addEventListener("keydown", (e) => {
  const sendShortcut = localStorage.getItem("ai_plate_send_shortcut") || "enter";
  const shouldSend = sendShortcut === "ctrl_enter"
    ? (e.key === "Enter" && (e.ctrlKey || e.metaKey))
    : (e.key === "Enter" && !e.shiftKey);

  if (shouldSend) {
    e.preventDefault();
    if (!runningSessions.has(currentSessionId) && userInput.value.trim().length > 0) {
      sendMessage(userInput.value.trim());
    }
  }
});

document.addEventListener("click", (e) => {
  const chip = e.target.closest(".prompt-chip");
  if (chip && !runningSessions.has(currentSessionId)) {
    const prompt = chip.getAttribute("data-prompt");
    if (prompt) {
      userInput.value = prompt;
      adjustTextareaHeight();
      sendMessage(prompt);
    }
  }
});

btnReset.addEventListener("click", async () => {
  const confirmed = await showThemedConfirm({
    title: "Clear Memory Context",
    message: "Clear AI working memory context for this active chat? Visible messages will remain on screen, and subsequent prompts will start with fresh context.",
    confirmText: "Clear Memory Context",
    icon: "🧹",
    danger: false,
  });
  if (confirmed) {
    try {
      const res = await fetch("/api/sessions/clear-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });
      if (!res.ok) throw new Error("Failed to clear memory context");

      // Append in-chat non-destructive context separation card
      const divider = document.createElement("div");
      divider.className = "context-cleared-divider";
      divider.innerHTML = `<span class="context-cleared-pill">🧹 Memory context cleared — next prompt starts with fresh context</span>`;
      chatMessages.appendChild(divider);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      showToast("Memory context cleared for active session", "info");
      currentTokensSaved = 0;
      currentSessionHistoryTokens = 0;
      updateContextTokensUI();
      if (typeof refreshSessionContextTokens === "function") {
        refreshSessionContextTokens(currentSessionId);
      }
    } catch (err) {
      showToast("Failed to clear memory context: " + err.message, "error");
    }
  }
});

function isConnectionOrModelError(err, code) {
  if (
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT" ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "CONNECTION_ERROR"
  ) {
    return true;
  }
  if (!err) return false;
  const msg = (typeof err === "string" ? err : err.message || JSON.stringify(err)).toLowerCase();
  return (
    msg.includes("connection error") ||
    msg.includes("connection refused") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("err_network") ||
    msg.includes("err_connection") ||
    msg.includes("socket hang up") ||
    msg.includes("not reachable") ||
    msg.includes("offline") ||
    msg.includes("not running") ||
    msg.includes("bad gateway") ||
    msg.includes("service unavailable") ||
    msg.includes("model not getting connected") ||
    msg.includes("model not connected") ||
    msg.includes("model is unreachable") ||
    msg.includes("provider is unavailable") ||
    msg.includes("disconnected") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

function cleanAllSpinners(blockElement, isError = false) {
  if (blockElement) {
    blockElement.querySelectorAll(".thinking-step-item").forEach((el) => {
      const statusIcon = el.querySelector(".step-status-icon");
      if (statusIcon && statusIcon.querySelector(".tool-spinner")) {
        if (isError) {
          statusIcon.innerHTML = `<span style="color: var(--danger); font-weight: bold;">❌</span>`;
          el.classList.remove("running");
          el.classList.add("error");
        } else {
          statusIcon.innerHTML = `<span style="color: var(--success); font-weight: bold;">✓</span>`;
          el.classList.remove("running");
          el.classList.add("completed");
        }
      }
    });
    blockElement.querySelectorAll(".tool-spinner").forEach((s) => s.remove());
    blockElement.querySelectorAll(".tool-indicator.running").forEach((el) => {
      el.className = isError ? "tool-indicator stopped error" : "tool-indicator stopped";
      if (!el.querySelector(".stop-icon")) {
        const stopIcon = document.createElement("span");
        stopIcon.className = "stop-icon";
        stopIcon.textContent = isError ? "❌ " : "⏹️ ";
        el.prepend(stopIcon);
      }
    });
  } else {
    document.querySelectorAll(".thinking-step-item").forEach((el) => {
      const statusIcon = el.querySelector(".step-status-icon");
      if (statusIcon && statusIcon.querySelector(".tool-spinner")) {
        if (isError) {
          statusIcon.innerHTML = `<span style="color: var(--danger); font-weight: bold;">❌</span>`;
          el.classList.remove("running");
          el.classList.add("error");
        } else {
          statusIcon.innerHTML = `<span style="color: var(--success); font-weight: bold;">✓</span>`;
          el.classList.remove("running");
          el.classList.add("completed");
        }
      }
    });
    document.querySelectorAll(".tool-spinner").forEach((s) => s.remove());
    document.querySelectorAll(".tool-indicator.running").forEach((el) => {
      el.className = isError ? "tool-indicator stopped error" : "tool-indicator stopped";
      if (!el.querySelector(".stop-icon")) {
        const stopIcon = document.createElement("span");
        stopIcon.className = "stop-icon";
        stopIcon.textContent = isError ? "❌ " : "⏹️ ";
        el.prepend(stopIcon);
      }
    });
  }
}

async function stopExecution(targetSid = currentSessionId) {
  const sessionInfo = runningSessions.get(targetSid);
  if (sessionInfo) {
    if (sessionInfo.activeStream) {
      sessionInfo.activeStream.cancel();
    }
    if (sessionInfo.blockElement && sessionInfo.blockElement._activeStream) {
      sessionInfo.blockElement._activeStream.cancel();
    }
    if (sessionInfo.blockElement) {
      cleanAllSpinners(sessionInfo.blockElement);
    }
    if (sessionInfo.abortController) {
      sessionInfo.abortController.abort();
    }
    runningSessions.delete(targetSid);
  }

  updateDockControlsForSession(currentSessionId);
  updateGlobalRunningIndicators();

  try {
    await fetch("/api/chat/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: targetSid }),
    });
  } catch {
    // Ignore network errors on stop
  }

  loadSessions();
}

if (stopBtn) {
  stopBtn.addEventListener("click", () => stopExecution(currentSessionId));
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && runningSessions.has(currentSessionId)) {
    e.preventDefault();
    stopExecution(currentSessionId);
  }
});

async function sendMessage(text) {
  const thisSessionId = currentSessionId;
  const thisMode = sessionModes.get(thisSessionId) || "normal";
  let turnFailed = false;

  if (runningSessions.has(thisSessionId) || (!text && pendingAttachments.length === 0)) return;

  const userText = text || (pendingAttachments.length > 0 ? `Please analyze the attached ${pendingAttachments.length} document(s).` : "");

  // Hide the hero welcome on first message
  if (chatHero) {
    chatHero.classList.add("hidden");
  }

  const attachmentsToSend = [...pendingAttachments];
  pendingAttachments = [];
  renderPendingAttachments();

  userInput.value = "";
  adjustTextareaHeight();

  // Always append user prompt message FIRST so it displays on top
  appendMessage("user", userText, attachmentsToSend);

  // Optimistically update session title in sidebar immediately if currently a default title
  const sessionItemEl = sessionsList?.querySelector(`.session-item[data-session-id="${thisSessionId}"]`);
  const sessionTitleEl = sessionItemEl?.querySelector(".session-title-text");
  const currentTitle = sessionTitleEl?.textContent?.trim();
  let optimisticTitle = "";
  if (!currentTitle || currentTitle === "New Chat" || currentTitle === "Initial Chat" || currentTitle === "Chat Session") {
    optimisticTitle = userText
      .replace(/\[User attached and embedded[^\]]*\]\s*/g, "")
      .replace(/^#+\s*/, "")
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 36)
      .trim() || (attachmentsToSend[0] ? `File: ${attachmentsToSend[0].filename}`.slice(0, 36) : "Chat Session");
    if (sessionTitleEl && optimisticTitle) {
      sessionTitleEl.textContent = optimisticTitle;
      sessionTitleEl.title = optimisticTitle;
    }
    // Asynchronously update title in backend storage immediately
    fetch("/api/sessions/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: thisSessionId, title: optimisticTitle }),
    }).catch(() => {});
  }

  // Create the assistant response block directly underneath the user prompt
  const abortController = new AbortController();
  const { blockElement, thinkingCard, messageBody, toolContainer } = createAssistantMessageBlock();

  // Live thinking disclosure stays hidden until the model is connected and emits thinking/skills/tools
  if (thinkingCard) {
    thinkingCard.style.display = "none";
  }

  runningSessions.set(thisSessionId, {
    abortController,
    blockElement,
    thinkingCard,
    messageBody,
    toolContainer,
    startTime: Date.now(),
  });

  updateDockControlsForSession(thisSessionId);
  updateGlobalRunningIndicators();

  // Add the running indicator dot directly to this session item in the DOM without reloading/overwriting optimistic title
  if (sessionItemEl && !sessionItemEl.querySelector(".session-running-dot")) {
    const dot = document.createElement("span");
    dot.className = "session-running-dot";
    dot.title = "Connecting to model...";
    const titleSpan = sessionItemEl.querySelector(".session-title-text");
    if (titleSpan) {
      titleSpan.insertAdjacentElement("afterend", dot);
    } else {
      sessionItemEl.appendChild(dot);
    }
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        message: userText,
        attachments: attachmentsToSend,
        sessionId: thisSessionId,
        mode: thisMode,
      }),
    });

    if (!response.ok) {
      let errDetail = "";
      try {
        const errJson = await response.json();
        errDetail = errJson.error || JSON.stringify(errJson);
      } catch {
        try { errDetail = await response.text(); } catch {}
      }
      throw new Error(`Server returned ${response.status}: ${errDetail || response.statusText || "Internal Error"}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("ReadableStream not supported");

    const decoder = new TextDecoder();
    const processSSEBlock = (block) => {
      if (!block.trim()) return;

      const lines = block.split(/\r?\n/);
      let eventType = "message";
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) return;
      const rawData = dataLines.join("\n");

      let payload = {};
      try {
        payload = JSON.parse(rawData);
      } catch {
        payload = { text: rawData };
      }

      if (["error", "tool_error", "attachment_error"].includes(eventType)) {
        turnFailed = true;
        blockElement.querySelectorAll(".implement-plan-btn").forEach(button => button.remove());
      }

      if (eventType === "skills_triggered") {
        const indicatorLabel = blockElement.querySelector(".assistant-indicator-label");
        if (indicatorLabel) indicatorLabel.textContent = "Reasoning & processing...";
        if (sessionItemEl?.querySelector(".session-running-dot")) {
          sessionItemEl.querySelector(".session-running-dot").title = "Actively reasoning...";
        }
        if (payload.skills && Array.isArray(payload.skills) && payload.skills.length > 0) {
          renderMessageSkills(blockElement, payload.skills);
          addToolCallout(toolContainer, "cognitive_skills", {
            skills: payload.skills,
            count: payload.skills.length,
          }, "completed");
          updateToolCallout(toolContainer, "cognitive_skills", "completed", {
            directivesApplied: payload.skills.map((s) => s.name || s),
          });
          if (thinkingCard) thinkingCard.style.display = "";
        }
      } else if (eventType === "embedding_start") {
        const indicatorLabel = blockElement.querySelector(".assistant-indicator-label");
        if (indicatorLabel) indicatorLabel.textContent = `Embedding ${payload.filename}...`;
        addToolCallout(toolContainer, "vector_embedding", { file: payload.filename }, "running");
        updateThinkingHeader(thinkingCard, "Embedding attachment...", `Indexing ${payload.filename}`);
        if (thinkingCard) thinkingCard.style.display = "";
      } else if (eventType === "attachment_embedded") {
        updateToolCallout(toolContainer, "vector_embedding", "completed", { chunks: payload.chunks, embeddingModel: payload.embeddingModel });
        loadKnowledgeBase();
      } else if (eventType === "attachment_error") {
        updateToolCallout(toolContainer, "vector_embedding", "error", { error: payload.error });
      } else if (eventType === "tool_executing") {
        const indicatorLabel = blockElement.querySelector(".assistant-indicator-label");
        if (indicatorLabel) indicatorLabel.textContent = `Executing ${payload.tool}...`;
        addToolCallout(toolContainer, payload.tool, payload.args, "running");
        updateThinkingHeader(thinkingCard, `Executing ${payload.tool}...`, `Running tool: ${payload.tool} • Click to inspect`);
        if (thinkingCard) thinkingCard.style.display = "";
      } else if (eventType === "approval_required") {
        renderApprovalCard(blockElement, payload, thinkingCard);
        updateThinkingHeader(thinkingCard, "Approval Required", "Waiting for tool authorization...");
        if (thinkingCard) thinkingCard.style.display = "";
      } else if (eventType === "tool_completed") {
        updateToolCallout(toolContainer, payload.tool, "completed", payload.result);
        const indicatorLabel = blockElement.querySelector(".assistant-indicator-label");
        if (indicatorLabel) indicatorLabel.textContent = "Synthesizing response...";
        updateThinkingHeader(thinkingCard, "Reasoning & synthesizing...", "Processing tool results • Click to inspect");
        if (payload.tool === "run_sandboxed_script" || payload.tool === "clean_sandbox") {
          loadSandboxFiles();
        }
        if (
          payload.tool === "save_artifact" ||
          (payload.result && (payload.result.artifactName || payload.result.image_url || payload.result.url || payload.result.savedTo))
        ) {
          loadArtifacts();
          loadSandboxFiles();
        }
        if (payload.tool === "ingest_document" || payload.tool === "remove_document") {
          loadKnowledgeBase();
        }
        updateBadgeCounts();

        // Universal Plugin UI Dispatcher for all plugin chat card modifications
        dispatchPluginChatUI(blockElement, payload.tool, payload.result);
      } else if (eventType === "tool_error") {
        updateToolCallout(toolContainer, payload.tool, "error", payload.error);
        updateThinkingHeader(thinkingCard, `Error in ${payload.tool}`, payload.error?.message || "Tool execution error");
      } else if (eventType === "session_title_updated") {
        const sid = payload.sessionId || thisSessionId;
        const newTitle = payload.title;
        if (newTitle) {
          const item = sessionsList?.querySelector(`.session-item[data-session-id="${sid}"]`);
          const textEl = item?.querySelector(".session-title-text");
          if (textEl) {
            textEl.textContent = newTitle;
            textEl.title = newTitle;
          }
        }
      } else if (eventType === "response") {
        cleanAllSpinners(blockElement);
        if (toolContainer) {
          toolContainer.querySelectorAll(".thinking-step-item").forEach((el) => {
            const icon = el.querySelector(".step-status-icon");
            if (icon && icon.querySelector(".tool-spinner")) {
              icon.innerHTML = `<span style="color: var(--success); font-weight: bold;">✓</span>`;
              el.classList.remove("running");
              el.classList.add("completed");
            }
          });
        }
        finalizeThinkingDisclosure(thinkingCard, payload.elapsedMs, payload.usage);
        updateBadgeCounts();

        if (payload.sessionTitle) {
          const item = sessionsList?.querySelector(`.session-item[data-session-id="${thisSessionId}"]`);
          const textEl = item?.querySelector(".session-title-text");
          if (textEl && (textEl.textContent === "New Chat" || textEl.textContent === "Initial Chat" || textEl.textContent === "Chat Session")) {
            textEl.textContent = payload.sessionTitle;
            textEl.title = payload.sessionTitle;
          }
        }

        // If an in-chat plugin visual card or artifact card was already mounted for this tool execution,
        // clean any redundant markdown image tags from payload.text so it doesn't render twice.
        let responseText = payload.text || "";
        const hasPluginVisualCard = blockElement.querySelector(".plugin-custom-card, .inchat-artifact-card");
        if (hasPluginVisualCard) {
          responseText = responseText.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
        }
        blockElement._rawResponseText = responseText;
        if (thisMode === "plan" && !turnFailed && payload.canImplementPlan === true && responseText.trim() && !abortController.signal.aborted) {
          const implementButton = document.createElement("button");
          implementButton.type = "button";
          implementButton.className = "btn btn-secondary implement-plan-btn";
          implementButton.textContent = "Implement this plan";
          implementButton.addEventListener("click", async () => {
            if (runningSessions.has(thisSessionId)) return;
            if (currentSessionId !== thisSessionId) await switchSession(thisSessionId);
            if (currentSessionId !== thisSessionId) return;
            if (!await saveChatMode(thisSessionId, "code")) return;
            sendMessage(`Implement the following plan:\n\n${responseText}`);
          });
          blockElement.appendChild(implementButton);
        }

        if (payload.skills && Array.isArray(payload.skills) && payload.skills.length > 0) {
          renderMessageSkills(blockElement, payload.skills);
        } else {
          renderMessageSkills(blockElement, []);
        }

        const totalTokens = payload.usage?.totalTokens;
        const promptTokens = payload.usage?.promptTokens;
        const completionTokens = payload.usage?.completionTokens;
        const embeddingTokens = payload.usage?.embeddingTokens;
        const embeddingModel = payload.usage?.embeddingModel || (serverStatus && serverStatus.embeddingModel) || "Vector RAG";
        const elapsedSec = payload.elapsedMs ? (payload.elapsedMs / 1000).toFixed(1) : null;
        const modelName = payload.model || (serverStatus && serverStatus.model) || "LLM";

        if (totalTokens !== undefined || elapsedSec || (payload.skills && payload.skills.length > 0)) {
          // Record in persistent token ledger immediately
          recordTurnTokens({
            id: `turn_${Date.now()}`,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            model: modelName,
            embeddingModel: embeddingModel,
            promptTokens: promptTokens || 0,
            completionTokens: completionTokens || 0,
            embeddingTokens: embeddingTokens || 0,
            totalTokens: totalTokens || (promptTokens || 0) + (completionTokens || 0) + (embeddingTokens || 0),
            elapsedSec: elapsedSec,
            skills: payload.skills || [],
          });
        }

        if (footerEngineTag && totalTokens !== undefined) {
          const embedText = embeddingTokens && embeddingTokens > 0 ? ` (${(totalTokens - embeddingTokens).toLocaleString()} LLM + ${embeddingTokens.toLocaleString()} Embed)` : "";
          footerEngineTag.textContent = `⚡ Ready • ${(totalTokens).toLocaleString()} total tokens${embedText} • ${elapsedSec || 0}s`;
          footerEngineTag.style.cursor = "pointer";
          footerEngineTag.title = "Click to view full Token Analytics";
          footerEngineTag.onclick = openTokenStatsModal;
        }

        if (typeof refreshSessionContextTokens === "function") {
          refreshSessionContextTokens(thisSessionId);
        }

        const renderMetaFooter = () => {
          if ((totalTokens !== undefined || elapsedSec || (payload.skills && payload.skills.length > 0)) && !blockElement.querySelector(".message-meta-footer")) {
            const metaFooter = document.createElement("div");
            metaFooter.className = "message-meta-footer";
            metaFooter.style.cursor = "pointer";
            metaFooter.title = "Click to inspect full Token Analytics & Ledger";
            metaFooter.addEventListener("click", openTokenStatsModal);

            const llmTokens = (promptTokens || 0) + (completionTokens || 0);
            let tokensText = `${(llmTokens || totalTokens || 0).toLocaleString()} LLM tokens`;
            if (promptTokens !== undefined && completionTokens !== undefined) {
              tokensText += ` (${promptTokens.toLocaleString()} in / ${completionTokens.toLocaleString()} out)`;
            }

            let html = `
              <span class="meta-item" title="Active Reasoning Model">🤖 ${modelName}</span>
              <span class="meta-item meta-item-tokens" title="LLM Inference Tokens">📊 ${tokensText}</span>
            `;

            if (embeddingTokens && embeddingTokens > 0) {
              html += `
                <span class="meta-item meta-item-embed" title="Vector Embedding & RAG Tokens">📚 ${embeddingTokens.toLocaleString()} embed tokens (${embeddingModel})</span>
              `;
            }

            if (elapsedSec) {
              html += `<span class="meta-item" title="Response Latency">⚡ ${elapsedSec}s</span>`;
            }

            if (payload.skills && Array.isArray(payload.skills) && payload.skills.length > 0) {
              html += `<span class="meta-item meta-item-skills" style="color: #a5b4fc; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); padding: 1px 6px; border-radius: 4px;" title="Active Cognitive Skills applied to this turn">🧠 ${escapeHtmlStr(payload.skills.join(", "))}</span>`;
            }

            metaFooter.innerHTML = html;
            blockElement.appendChild(metaFooter);
          }
        };

        const onStreamComplete = () => {
          renderMetaFooter();

          const ttsBtn = blockElement.querySelector(".message-tts-btn");
          if (ttsBtn) {
            const ttsActive = isTTSPluginEnabled();
            ttsBtn.style.display = ttsActive ? "inline-flex" : "none";
            if (ttsActive && isAutoReadEnabled && responseText.trim()) {
              playTTS(responseText, ttsBtn);
            }
          }

          // If the user switched sessions and returned to this session while running, re-sync DOM immediately
          if (currentSessionId === thisSessionId) {
            if (!document.body.contains(blockElement)) {
              fetch(`/api/sessions/messages?id=${encodeURIComponent(thisSessionId)}`)
                .then((r) => r.json())
                .then((d) => {
                  if (currentSessionId === thisSessionId && d.messages) {
                    renderSessionMessages(d.messages);
                  }
                })
                .catch(() => {});
            }
            loadSessions();
          } else {
            unvisitedDoneSessions.add(thisSessionId);
            updateWorkspaceTabsUnvisitedDots();
            loadSessions();
          }

          // Auto-detect and render in-chat artifact cards if response mentions existing artifacts or user asked to show them
          (async () => {
            try {
              if (blockElement.querySelector(".plugin-custom-card, .inchat-artifact-card")) return;

              const artRes = await fetch("/api/artifacts/files");
              if (artRes.ok) {
                const artData = await artRes.json();
                const files = artData.files || [];
                const textLower = (payload.text || "").toLowerCase();
                const userTextLower = userText.toLowerCase();

                // 1. Check if the LLM's response specifically mentions any artifact filenames
                const mentionedFiles = files.filter((f) => {
                  const fnameLower = f.name.toLowerCase();
                  return textLower.includes(fnameLower) || textLower.includes(`artifacts/${fnameLower}`);
                });

                let filesToRender = [];
                if (mentionedFiles.length > 0) {
                  filesToRender = mentionedFiles;
                } else if (
                  userTextLower.includes("chart") ||
                  userTextLower.includes("plot") ||
                  userTextLower.includes("graph") ||
                  userTextLower.includes("timeline")
                ) {
                  filesToRender = files.filter((f) => {
                    const fn = f.name.toLowerCase();
                    return (
                      fn.includes("chart") ||
                      fn.includes("plot") ||
                      fn.includes("graph") ||
                      fn.includes("timeline") ||
                      /\.(png|jpg|jpeg|svg|webp)$/i.test(fn)
                    );
                  });
                } else if (
                  userTextLower.includes("show all artifacts") ||
                  userTextLower.includes("list all artifacts") ||
                  userTextLower.includes("all deliverables")
                ) {
                  filesToRender = files;
                }

                for (const f of filesToRender) {
                  await renderInChatArtifactCard(blockElement, {
                    artifactName: f.name,
                    sizeBytes: f.sizeBytes,
                    url: `/api/artifacts/file?name=${encodeURIComponent(f.name)}`,
                    description: "Persistent artifact deliverable",
                    position: "after-body",
                  });
                }
              }
            } catch {}
            scrollToBottom();
          })();

          scrollToBottom();
        };

        // Real-time token streaming with randomized character cadence
        streamTextToElement({
          targetElement: messageBody,
          fullText: responseText,
          blockElement,
          sessionId: thisSessionId,
          onComplete: onStreamComplete,
        });
      } else if (eventType === "error") {
        blockElement.querySelectorAll(".implement-plan-btn").forEach(button => button.remove());
        cleanAllSpinners(blockElement, true);
        if (thinkingCard) {
          thinkingCard.style.display = "none";
        }
        if (toolContainer) {
          toolContainer.innerHTML = "";
        }
        const isConn = isConnectionOrModelError(payload.error, payload.code);
        const errTitle = isConn ? "Connection Error" : "Error";
        const errMsg = typeof payload.error === "string"
          ? payload.error
          : (payload.error?.message || JSON.stringify(payload.error) || "An unexpected error occurred.");
        messageBody.innerHTML = `
          <div style="color: var(--danger); font-weight: 500; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-sm); padding: 10px 14px;">
            <div style="font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 6px;">
              <span>❌</span> <span>${errTitle}</span>
            </div>
            <div style="font-size: 12.5px; line-height: 1.4; color: var(--text-muted);">${escapeHtml(errMsg)}</div>
            ${isConn ? `<div style="font-size: 11px; margin-top: 6px; color: var(--text-dim); font-style: italic;">Could not connect to the model or runtime endpoint. Reasoning did not start. Please verify your provider or local server (e.g. Ollama, LM Studio) is running.</div>` : ""}
          </div>
        `;
        scrollToBottom();
      }
    };

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        processSSEBlock(block);
      }

      scrollToBottom();
    }

    if (buffer.trim()) {
      processSSEBlock(buffer);
    }
  } catch (err) {
    turnFailed = true;
    blockElement.querySelectorAll(".implement-plan-btn").forEach(button => button.remove());
    cleanAllSpinners(blockElement, true);
    if (thinkingCard) {
      thinkingCard.style.display = "none";
    }
    if (toolContainer) {
      toolContainer.innerHTML = "";
    }
    if (err.name === "AbortError") {
      const existingText = messageBody.innerText.trim();
      if (!existingText) {
        messageBody.innerHTML = `<div style="color: var(--text-dim); font-style: italic;">⏹️ Process stopped safely by user.</div>`;
      } else {
        messageBody.innerHTML += `<div style="color: var(--text-dim); margin-top: 8px; font-style: italic;">⏹️ Process stopped safely by user.</div>`;
      }
    } else {
      const isConn = isConnectionOrModelError(err.message, err.code);
      const errTitle = isConn ? "Connection Error" : "Network Error";
      messageBody.innerHTML = `
        <div style="color: var(--danger); font-weight: 500; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-sm); padding: 10px 14px;">
          <div style="font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 6px;">
            <span>❌</span> <span>${errTitle}</span>
          </div>
          <div style="font-size: 12.5px; line-height: 1.4; color: var(--text-muted);">${escapeHtml(String(err.message))}</div>
          ${isConn ? `<div style="font-size: 11px; margin-top: 6px; color: var(--text-dim); font-style: italic;">Could not connect to the model or runtime endpoint. Reasoning did not start. Please verify your provider or local server (e.g. Ollama, LM Studio) is running.</div>` : ""}
        </div>
      `;
    }
  } finally {
    cleanAllSpinners(blockElement, turnFailed);
    runningSessions.delete(thisSessionId);
    updateDockControlsForSession(currentSessionId);
    updateGlobalRunningIndicators();
    updateBadgeCounts();

    if (currentSessionId === thisSessionId) {
      if (!document.body.contains(blockElement)) {
        fetch(`/api/sessions/messages?id=${encodeURIComponent(thisSessionId)}`)
          .then((r) => r.json())
          .then((d) => {
            if (currentSessionId === thisSessionId && d.messages) {
              renderSessionMessages(d.messages);
            }
          })
          .catch(() => {});
      }
      userInput.focus();
    } else {
      unvisitedDoneSessions.add(thisSessionId);
      updateWorkspaceTabsUnvisitedDots();
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: "AI Plate — Task Completed",
          body: `Reasoning completed for prompt: "${userText.slice(0, 60)}"`,
        });
      }
    }
    loadSessions();
  }
}

// Native Desktop External Links Router
document.addEventListener("click", (e) => {
  const anchor = e.target.closest("a");
  if (anchor && anchor.href && (anchor.href.startsWith("http://") || anchor.href.startsWith("https://"))) {
    const url = anchor.href;
    const isLocal = url.includes("localhost:") || url.includes("127.0.0.1:");
    if (!isLocal && window.electronAPI?.openExternal) {
      e.preventDefault();
      window.electronAPI.openExternal(url);
    }
  }
});

// ─── Seamless Scroll & Reading Progress Indicators ──────────────────

const tabChat = document.getElementById("tab-chat");
const scrollProgressBar = document.getElementById("scroll-progress-bar");
const btnScrollBottom = document.getElementById("btn-scroll-bottom");
const scrollUnreadPulse = document.getElementById("scroll-unread-pulse");

let scrollIndicatorRaf = null;
function updateScrollIndicator() {
  if (scrollIndicatorRaf) return;
  scrollIndicatorRaf = requestAnimationFrame(() => {
    scrollIndicatorRaf = null;
    const currentTab = document.querySelector(".tab-view.active");
    if (!currentTab) return;

    const maxScroll = currentTab.scrollHeight - currentTab.clientHeight;
    if (maxScroll <= 0) {
      if (scrollProgressBar) scrollProgressBar.style.width = "0%";
      if (btnScrollBottom) btnScrollBottom.classList.add("hidden");
      return;
    }

    const currentScroll = currentTab.scrollTop;
    const pct = Math.min(100, Math.max(0, (currentScroll / maxScroll) * 100));
    if (scrollProgressBar) {
      scrollProgressBar.style.width = `${pct}%`;
    }

    // Distance from bottom
    const distFromBottom = maxScroll - currentScroll;
    if (distFromBottom > 140 && currentTab.id === "tab-chat") {
      if (btnScrollBottom) btnScrollBottom.classList.remove("hidden");
    } else {
      if (btnScrollBottom) btnScrollBottom.classList.add("hidden");
      if (scrollUnreadPulse) scrollUnreadPulse.classList.remove("active");
    }
  });
}

let scrollRafId = null;

function performScrollToBottom(smooth = false) {
  if (!tabChat) return;
  const maxScroll = tabChat.scrollHeight - tabChat.clientHeight;
  const isScrolledUp = maxScroll - tabChat.scrollTop > 180;

  if (isScrolledUp && isProcessing) {
    // If user explicitly scrolled up to read earlier messages, don't yank scroll position
    if (scrollUnreadPulse) scrollUnreadPulse.classList.add("active");
    if (btnScrollBottom) btnScrollBottom.classList.remove("hidden");
  } else {
    if (smooth) {
      tabChat.scrollTo({
        top: tabChat.scrollHeight,
        behavior: "smooth",
      });
    } else {
      tabChat.scrollTop = tabChat.scrollHeight;
    }
    if (scrollUnreadPulse) scrollUnreadPulse.classList.remove("active");
  }
  updateScrollIndicator();
}

function scrollToBottom(smooth = false) {
  if (!tabChat) return;
  if (smooth) {
    if (scrollRafId !== null) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
    performScrollToBottom(true);
    return;
  }
  if (scrollRafId !== null) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;
    performScrollToBottom(false);
  });
}

// Bind scroll listener on all scrollable tab views
tabViews.forEach((tab) => {
  tab.addEventListener("scroll", updateScrollIndicator, { passive: true });
});

if (btnScrollBottom) {
  btnScrollBottom.addEventListener("click", () => {
    if (tabChat) {
      tabChat.scrollTo({
        top: tabChat.scrollHeight,
        behavior: "smooth",
      });
      btnScrollBottom.classList.add("hidden");
      if (scrollUnreadPulse) scrollUnreadPulse.classList.remove("active");
    }
  });
}

sendBtn.addEventListener("click", () => {
  if (runningSessions.has(currentSessionId)) {
    stopExecution(currentSessionId);
  } else if (userInput.value.trim().length > 0 || pendingAttachments.length > 0) {
    sendMessage(userInput.value.trim());
  }
});

function appendMessage(role, content, attachments = []) {
  const block = document.createElement("div");
  block.className = `message-block message-author-${role}`;
  if (role === "user") {
    block._rawPrompt = content;
  }

  const avatar = role === "user" ? "👤" : `<img src="assets/logo.png" class="assistant-avatar-img" alt="AI Plate" onerror="this.onerror=null;this.outerHTML='⚡';" />`;
  const authorName = role === "user" ? "You" : "AI Plate";

  let attachmentsHtml = "";
  if (attachments && attachments.length > 0) {
    attachmentsHtml = `
      <div class="message-attachments">
        ${attachments
          .map(
            (att) => `
          <div class="message-attachment-badge">
            <span class="badge-icon">📎</span>
            <span><strong>${att.filename}</strong></span>
            <span class="badge-meta">🔮 Embedded Vector RAG</span>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  const copyPromptBtnHtml = role === "user" ? `
    <button class="message-copy-prompt-btn" title="Copy prompt to clipboard" onclick="copyPromptText(this)">
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span class="copy-prompt-label">Copy</span>
    </button>
  ` : "";

  block.innerHTML = `
    <div class="message-header">
      <div class="message-header-left">
        <div class="message-avatar">${avatar}</div>
        <span class="message-author">${authorName}</span>
      </div>
      ${copyPromptBtnHtml}
    </div>
    <div class="message-body">
      ${attachmentsHtml}
      ${role === "user" ? `<div class="user-prompt-text">${escapeHtml(String(content ?? ""))}</div>` : renderMarkdown(content)}
    </div>
  `;

  chatMessages.appendChild(block);
  scrollToBottom();
}

function isThinkingInspectorActive() {
  if (currentThinkingLevel === "off") return false;

  // Fully generic: match ANY active plugin that provides reasoning, scratchpad, CoT, or planning steps
  if (!registeredPlugins || registeredPlugins.length === 0) return true;

  return registeredPlugins.some((p) => {
    if (!p.enabled) return false;
    if (p.category === "reasoning" || p.category === "thinking" || p.category === "inspector") return true;
    if (p.id && (p.id.includes("thinking") || p.id.includes("reasoning") || p.id.includes("scratchpad"))) return true;
    if (p.tools && Array.isArray(p.tools)) {
      return p.tools.some((t) => {
        const name = (t.name || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        return (
          name.includes("reason") ||
          name.includes("thought") ||
          name.includes("scratchpad") ||
          name.includes("plan_step") ||
          name.includes("inspect_step") ||
          desc.includes("reasoning scratchpad") ||
          desc.includes("internal thought")
        );
      });
    }
    return false;
  });
}

function updateThinkingHeader(cardElement, title, subMeta) {
  if (!cardElement) return;
  const titleEl = cardElement.querySelector(".thinking-main-title");
  const metaEl = cardElement.querySelector(".thinking-sub-meta");
  const countBadge = cardElement.querySelector(".thinking-step-count-badge");
  const timeline = cardElement.querySelector(".thinking-steps-timeline");

  if (titleEl && title) titleEl.textContent = title;
  if (metaEl && subMeta) metaEl.textContent = subMeta;
  if (countBadge && timeline) {
    const allSteps = timeline.querySelectorAll(".thinking-step-item");
    countBadge.textContent = `${allSteps.length} step${allSteps.length === 1 ? "" : "s"}`;
  }
}

function createAssistantMessageBlock() {
  const block = document.createElement("div");
  block.className = "message-block message-author-assistant";
  const useThinkingTimeline = isThinkingInspectorActive();

  block.innerHTML = `
    <div class="message-header">
      <div class="message-header-left">
        <div class="message-avatar"><img src="assets/logo.png" class="assistant-avatar-img" alt="AI Plate" onerror="this.onerror=null;this.outerHTML='⚡';" /></div>
        <span class="message-author">AI Plate</span>
      </div>
      <button class="message-tts-btn" title="Read response aloud (Kokoro TTS)" type="button" style="display: none;">
        <span class="tts-icon">🔊</span>
        <span class="tts-btn-label">Read Aloud</span>
      </button>
    </div>

    <!-- Triggered Cognitive Skills & Directives Live Banner (populated ONLY when skills trigger) -->
    <div class="message-skills-indicator hidden" style="display: none;"></div>

    ${
      useThinkingTimeline
        ? `
      <!-- Collapsible / Expandable Thinking & Execution Steps Component -->
      <div class="thinking-disclosure-card running" style="display: none;">
        <div class="thinking-disclosure-header" title="Click to expand/collapse execution steps">
          <div class="thinking-header-left">
            <div class="thinking-icon-wrap">
              <span class="thinking-brain-icon">🧠</span>
            </div>
            <div class="thinking-title-group">
              <span class="thinking-main-title">Reasoning & processing...</span>
              <span class="thinking-sub-meta">Live Execution Trace • Click to inspect</span>
            </div>
          </div>
          <div class="thinking-header-right">
            <button type="button" class="btn btn-secondary btn-xs thinking-copy-trace-btn" style="display: none; padding: 2px 7px; font-size: 11px; margin-right: 4px;" title="Copy entire reasoning chain as Markdown">📋 Copy Trace</button>
            <span class="thinking-step-count-badge">Processing</span>
            <span class="thinking-chevron">▾</span>
          </div>
        </div>
        <div class="thinking-disclosure-body">
          <div class="thinking-steps-timeline"></div>
        </div>
      </div>
    `
        : `
      <!-- Minimal Classic Tool Callouts Container (Reverted when thinking is disabled) -->
      <div class="tool-callouts-container"></div>
    `
    }

    <div class="message-body">
      <div class="assistant-thinking-indicator" style="display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 13px; padding: 4px 0;">
        <div class="tool-spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
        <span class="assistant-indicator-label">Connecting to model...</span>
      </div>
    </div>
  `;

  chatMessages.appendChild(block);
  scrollToBottom();

  const thinkingCard = block.querySelector(".thinking-disclosure-card");
  const thinkingHeader = block.querySelector(".thinking-disclosure-header");
  const toolContainer = block.querySelector(".thinking-steps-timeline") || block.querySelector(".tool-callouts-container");
  const messageBody = block.querySelector(".message-body");

  if (thinkingHeader && thinkingCard) {
    thinkingHeader.addEventListener("click", () => {
      thinkingCard.classList.toggle("expanded");
    });
    const copyTraceBtn = thinkingHeader.querySelector(".thinking-copy-trace-btn");
    if (copyTraceBtn) {
      copyTraceBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyThinkingTrace(thinkingCard, copyTraceBtn);
      });
    }
  }

  const ttsBtn = block.querySelector(".message-tts-btn");
  if (ttsBtn) {
    ttsBtn.addEventListener("click", () => {
      const textToSpeak = block._rawResponseText || block.querySelector(".message-body")?.innerText || "";
      playTTS(textToSpeak, ttsBtn);
    });
  }

  return { blockElement: block, thinkingCard, toolContainer, messageBody };
}

function getToolDisplayMeta(toolName, args) {
  let icon = "⚡";
  let title = toolName
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  let summary = "";

  // 1. Dynamic lookup in registered plugins registry
  if (Array.isArray(registeredPlugins)) {
    for (const plugin of registeredPlugins) {
      if (plugin.tools && Array.isArray(plugin.tools)) {
        const found = plugin.tools.find((t) => t.name === toolName);
        if (found) {
          if (plugin.icon) icon = plugin.icon;
          if (found.description && !title) title = found.name;
          break;
        }
      }
    }
  }

  // 2. Dedicated Reasoning Scratchpad & Thinking Step Inspector
  if (toolName === "context_reasoning") {
    icon = "🔍";
    title = "Context & Memory Analysis";
    summary = args?.phase || "Analyzing prompt and recalling relevant session memory";
    return { icon, title, summary };
  }

  if (toolName === "llm_reasoning") {
    icon = "⚡";
    title = "Cognitive Reasoning & Plan";
    summary = args?.phase || "Model synthesizing hypothesis, plan, and solution";
    return { icon, title, summary };
  }

  if (toolName === "vector_embedding") {
    icon = "📥";
    title = "Vector Memory Ingestion";
    summary = args?.file ? `Embedding attachment: "${args.file}"` : "Indexing vector embeddings";
    return { icon, title, summary };
  }

  if (toolName === "cognitive_skills" || toolName === "skills_triggered") {
    icon = "🧠";
    title = "Cognitive Directives";
    const skillList = Array.isArray(args?.skills)
      ? args.skills.map((s) => (typeof s === "string" ? s : s.name)).join(", ")
      : (Array.isArray(args?.activeDirectives) ? args.activeDirectives.join(", ") : "Skills Applied");
    summary = `Directives active: ${skillList}`;
    if (summary.length > 85) summary = summary.slice(0, 85) + "...";
    return { icon, title, summary };
  }

  if (toolName === "record_thinking" || toolName === "record_reasoning_step") {
    icon = "🧠";
    const stage = args?.cognitive_stage;
    const stageMeta = getCognitiveStageMeta(stage);
    title = args?.step_number
      ? `Thinking Step ${args.step_number}${stageMeta ? ` (${stageMeta.label})` : ""}`
      : (stageMeta ? `Reasoning: ${stageMeta.label}` : "Internal Reasoning Step");
    summary = args?.thought ? String(args.thought) : (args?.action_plan ? String(args.action_plan) : "Analyzing & structuring plan...");
    if (summary.length > 85) summary = summary.slice(0, 85) + "...";
    return {
      icon: stageMeta ? stageMeta.icon : icon,
      title,
      summary,
      cognitiveStage: stage,
      confidence: args?.confidence,
      confidenceRationale: args?.confidence_rationale,
    };
  }

  // 3. Dynamic summary extraction from parameters
  if (args && typeof args === "object") {
    if (args.thought) {
      summary = String(args.thought);
    } else if (args.query) {
      summary = `Query: "${args.query}"`;
    } else if (args.command) {
      summary = `Command: ${args.command}`;
    } else if (args.url) {
      summary = `URL: ${args.url}`;
    } else if (args.city) {
      summary = `City: ${args.city}`;
    } else if (args.file || args.filename || args.name) {
      summary = `File: ${args.file || args.filename || args.name}`;
    } else if (args.title) {
      summary = `Title: ${args.title}`;
    } else if (args.action) {
      summary = `Action: ${args.action}${args.key ? ` (key: ${args.key})` : ""}`;
    } else if (args.prompt) {
      summary = `Prompt: "${args.prompt}"`;
    } else {
      const keys = Object.keys(args);
      if (keys.length === 1 && typeof args[keys[0]] === "string") {
        summary = `${keys[0]}: ${args[keys[0]]}`;
      } else {
        const raw = JSON.stringify(args);
        summary = raw.length > 60 ? raw.slice(0, 60) + "..." : raw;
      }
    }

    if (summary.length > 85) {
      summary = summary.slice(0, 85) + "...";
    }
  }

  return { icon, title, summary };
}

// ─── Cognitive Meta-Reasoning Traces Helpers ────────────────────────

function getCognitiveStageMeta(stage) {
  switch (stage) {
    case "hypothesis":
      return { label: "Hypothesis", icon: "💡", className: "cog-stage-hypothesis" };
    case "alternatives":
      return { label: "Alternatives", icon: "⚖️", className: "cog-stage-alternatives" };
    case "assumption":
      return { label: "Premise", icon: "📌", className: "cog-stage-assumption" };
    case "self_correction":
      return { label: "Pivot", icon: "🔄", className: "cog-stage-self_correction" };
    case "verification":
      return { label: "Verification", icon: "🎯", className: "cog-stage-verification" };
    case "action_plan":
      return { label: "Action Plan", icon: "⚡", className: "cog-stage-action_plan" };
    case "analysis":
      return { label: "Analysis", icon: "🔍", className: "cog-stage-analysis" };
    default:
      return null;
  }
}

function renderCognitiveTraceDrawer(data, prettyArgs) {
  const thought = data.thought || data.analysis || "";
  const confidence = data.confidence;
  const confidenceRationale = data.confidence_rationale;
  const assumptions = Array.isArray(data.assumptions) ? data.assumptions : [];
  const alternatives = Array.isArray(data.alternatives_considered) ? data.alternatives_considered : [];
  const selfCorrection = data.self_correction;
  const expectedOutcome = data.expected_outcome;
  const actionPlan = data.action_plan;

  let html = `<div class="cognitive-trace-view">`;

  // 1. Cognitive Monologue & Thought
  if (thought) {
    html += `
      <div class="cog-panel-block">
        <div class="cog-panel-title">
          <span>🧠 Cognitive Analysis</span>
          ${confidence ? `<span class="cog-confidence-badge cog-conf-${confidence}">${confidence === "high" ? "● High Confidence" : confidence === "medium" ? "◐ Medium Confidence" : "○ Low Confidence"}</span>` : ""}
        </div>
        <div class="cog-thought-body">${escapeHtmlStr(thought)}</div>
        ${confidenceRationale ? `<div style="font-size: 11px; color: var(--text-dim); margin-top: 5px; font-style: italic;">Rationale: ${escapeHtmlStr(confidenceRationale)}</div>` : ""}
      </div>
    `;
  }

  // 2. Alternatives Considered & Trade-offs
  if (alternatives.length > 0) {
    html += `
      <div class="cog-panel-block">
        <div class="cog-panel-title">
          <span>⚖️ Evaluated Alternatives & Trade-offs</span>
        </div>
        <div class="cog-alternatives-grid">
    `;
    for (const alt of alternatives) {
      if (typeof alt === "string") {
        html += `
          <div class="cog-alt-card">
            <div class="cog-alt-header"><span>${escapeHtmlStr(alt)}</span></div>
          </div>
        `;
      } else if (alt && typeof alt === "object") {
        const isSelected = Boolean(alt.selected);
        html += `
          <div class="cog-alt-card ${isSelected ? "selected" : ""}">
            <div class="cog-alt-header">
              <span>${escapeHtmlStr(alt.option || "Option")}</span>
              <span class="cog-alt-pill ${isSelected ? "selected" : "discarded"}">${isSelected ? "Chosen Approach" : "Discarded"}</span>
            </div>
            ${alt.evaluated_tradeoff ? `<div class="cog-alt-body"><strong>Trade-off:</strong> ${escapeHtmlStr(alt.evaluated_tradeoff)}</div>` : ""}
            ${alt.discarded_reason ? `<div class="cog-alt-body" style="color: #f87171;"><strong>Discard Rationale:</strong> ${escapeHtmlStr(alt.discarded_reason)}</div>` : ""}
          </div>
        `;
      }
    }
    html += `</div></div>`;
  }

  // 3. Assumptions & Premises Tracker
  if (assumptions.length > 0) {
    html += `
      <div class="cog-panel-block">
        <div class="cog-panel-title">
          <span>📌 Preconditions & Assumptions Tracked</span>
        </div>
        <ul class="cog-assumptions-list">
    `;
    for (const asm of assumptions) {
      html += `<li class="cog-assumption-chip"><span>✓</span> <span>${escapeHtmlStr(asm)}</span></li>`;
    }
    html += `</ul></div>`;
  }

  // 4. Self-Correction & Pivot Callout
  if (selfCorrection) {
    const trigger = typeof selfCorrection === "object" ? selfCorrection.trigger : null;
    const prevHyp = typeof selfCorrection === "object" ? selfCorrection.previous_hypothesis : null;
    const strategy = typeof selfCorrection === "object" ? selfCorrection.pivot_strategy : String(selfCorrection);

    html += `
      <div class="cog-panel-block cog-self-correction-callout">
        <div class="cog-panel-title" style="color: #fbbf24;">
          <span>🔄 Cognitive Pivot & Self-Correction</span>
        </div>
        ${trigger ? `<div style="font-size: 11px; margin-bottom: 3px;"><strong>Trigger / Failure:</strong> ${escapeHtmlStr(trigger)}</div>` : ""}
        ${prevHyp ? `<div style="font-size: 11px; margin-bottom: 3px; color: var(--text-dim);"><strong>Previous Belief:</strong> ${escapeHtmlStr(prevHyp)}</div>` : ""}
        ${strategy ? `<div style="font-size: 11.5px; color: var(--text-main); font-weight: 500;"><strong>Revised Strategy:</strong> ${escapeHtmlStr(strategy)}</div>` : ""}
      </div>
    `;
  }

  // 5. Expected Outcome & Next Action Plan
  if (expectedOutcome || actionPlan) {
    html += `
      <div class="cog-panel-block">
        ${expectedOutcome ? `
          <div style="margin-bottom: ${actionPlan ? "6px" : "0"};">
            <div class="cog-panel-title">🎯 Anticipated Outcome</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtmlStr(expectedOutcome)}</div>
          </div>
        ` : ""}
        ${actionPlan ? `
          <div>
            <div class="cog-panel-title">⚡ Action Plan / Target Tool</div>
            <div style="font-size: 11.5px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${escapeHtmlStr(actionPlan)}</div>
          </div>
        ` : ""}
      </div>
    `;
  }

  // Raw Diagnostic Block
  html += `
    <details class="cog-raw-toggle">
      <summary>View Raw JSON Telemetry</summary>
      <pre class="step-code-box"><code>${escapeHtmlStr(prettyArgs)}</code></pre>
    </details>
  </div>`;

  return html;
}

function copyThinkingTrace(cardElement, btn) {
  if (!cardElement) return;
  const steps = cardElement.querySelectorAll(".thinking-step-item");
  if (!steps.length) return;

  let md = `### AI Reasoning & Execution Trace\n\n`;
  steps.forEach((step, idx) => {
    const title = step.querySelector(".step-tool-name")?.textContent?.trim() || `Step ${idx + 1}`;
    const status = step.classList.contains("completed") ? "✓ Succeeded" : step.classList.contains("error") ? "❌ Failed" : "Finished";
    const stageBadge = step.querySelector(".cog-stage-badge")?.textContent?.trim() || "";
    const confBadge = step.querySelector(".cog-confidence-badge")?.textContent?.trim() || "";

    md += `#### ${idx + 1}. ${title} [${status}]\n`;
    if (stageBadge) md += `- **Cognitive Stage:** ${stageBadge}\n`;
    if (confBadge) md += `- **Confidence:** ${confBadge}\n`;

    const args = step._stepArgs;
    if (args) {
      if (args.thought) md += `- **Analysis:** ${args.thought}\n`;
      if (args.assumptions && args.assumptions.length) md += `- **Assumptions:** ${args.assumptions.join(", ")}\n`;
      if (args.alternatives_considered && args.alternatives_considered.length) {
        md += `- **Alternatives Considered:**\n`;
        args.alternatives_considered.forEach((alt) => {
          if (typeof alt === "string") md += `  - ${alt}\n`;
          else md += `  - ${alt.option}${alt.selected ? " (Chosen)" : " (Discarded)"}: ${alt.evaluated_tradeoff || ""}\n`;
        });
      }
      if (args.self_correction) {
        const sc = typeof args.self_correction === "object" ? args.self_correction.pivot_strategy || JSON.stringify(args.self_correction) : args.self_correction;
        md += `- **Pivot / Self-Correction:** ${sc}\n`;
      }
      if (args.expected_outcome) md += `- **Anticipated Outcome:** ${args.expected_outcome}\n`;
      if (args.action_plan) md += `- **Action Plan:** ${args.action_plan}\n`;
    }
    md += `\n`;
  });

  navigator.clipboard.writeText(md.trim()).then(() => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `✓ Copied!`;
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    }
    if (typeof showToast === "function") {
      showToast("Reasoning trace copied to clipboard", "info");
    }
  }).catch(() => {
    if (typeof showToast === "function") {
      showToast("Failed to copy trace to clipboard", "error");
    }
  });
}

function addToolCallout(container, toolName, args, status) {
  if (!container) return;
  const isTimeline = container.classList.contains("thinking-steps-timeline");

  if (isTimeline) {
    const stepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const item = document.createElement("div");
    item.className = "thinking-step-item";
    item.id = stepId;
    item.dataset.tool = toolName;
    item._stepArgs = args;
    item._stepTool = toolName;

    const toolMeta = getToolDisplayMeta(toolName, args);
    const prettyArgs = args ? JSON.stringify(args, null, 2) : "None";

    const stageMeta = toolMeta.cognitiveStage ? getCognitiveStageMeta(toolMeta.cognitiveStage) : null;
    const stageHtml = stageMeta
      ? `<span class="cog-stage-badge ${stageMeta.className}">${stageMeta.icon} ${escapeHtmlStr(stageMeta.label)}</span>`
      : "";
    const confHtml = toolMeta.confidence
      ? `<span class="cog-confidence-badge cog-conf-${toolMeta.confidence}" title="${escapeHtmlStr(toolMeta.confidenceRationale || `Confidence: ${toolMeta.confidence}`)}">${toolMeta.confidence === "high" ? "● High" : toolMeta.confidence === "medium" ? "◐ Med" : "○ Low"}</span>`
      : "";

    const isCognitive = toolName === "record_thinking" || toolName === "record_reasoning_step";
    const initialDrawerHtml = isCognitive && args
      ? renderCognitiveTraceDrawer(args, prettyArgs)
      : `
        <div class="step-io-block">
          <div class="step-io-title">
            <span>Input Parameters</span>
            <button type="button" class="copy-btn step-copy-btn" onclick="copyCode(this)" title="Copy parameters">📋 Copy</button>
          </div>
          <pre class="step-code-box"><code>${escapeHtmlStr(prettyArgs)}</code></pre>
        </div>
        <div class="step-io-block step-output-block" style="display: none;">
          <div class="step-io-title">
            <span>Execution Result</span>
            <button type="button" class="copy-btn step-copy-btn" onclick="copyCode(this)" title="Copy execution result">📋 Copy</button>
          </div>
          <pre class="step-code-box"><code class="step-output-code"></code></pre>
        </div>
      `;

    item.innerHTML = `
      <div class="thinking-step-row" title="Click to expand step details">
        <div class="step-info-left">
          <span class="step-status-icon"><span class="tool-spinner"></span></span>
          <span class="step-tool-name">${renderPluginIcon(toolMeta.icon, 16)} ${escapeHtmlStr(toolMeta.title)}</span>
          ${stageHtml}
          ${confHtml}
          <span class="step-summary-text">${escapeHtmlStr(toolMeta.summary)}</span>
        </div>
        <span class="step-expand-hint">Inspect ▾</span>
      </div>
      <div class="step-details-drawer">
        ${initialDrawerHtml}
      </div>
    `;

    const row = item.querySelector(".thinking-step-row");
    if (row) {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        item.classList.toggle("details-open");
      });
    }

    container.appendChild(item);

    const card = container.closest(".thinking-disclosure-card");
    if (card) {
      card.style.display = "";
      const allSteps = container.querySelectorAll(".thinking-step-item");
      const countBadge = card.querySelector(".thinking-step-count-badge");
      if (countBadge) {
        countBadge.textContent = `${allSteps.length} step${allSteps.length === 1 ? "" : "s"}`;
      }
    }
  } else {
    // Classic fallback tool indicator pill
    const item = document.createElement("div");
    item.className = `tool-indicator ${status}`;
    item.dataset.tool = toolName;

    let labelHtml = `<strong>${escapeHtmlStr(toolName)}</strong>`;
    if (toolName === "vector_embedding") {
      labelHtml = `<strong>📥 Ingesting & Embedding</strong> ${args?.file ? `"${escapeHtmlStr(args.file)}"` : ""}`;
    } else if (toolName === "run_sandboxed_script") {
      labelHtml = `<strong>🧪 Running Sandboxed Script</strong> ${args?.script_name ? `(${escapeHtmlStr(args.script_name)})` : ""}`;
    } else if (toolName === "execute_command") {
      labelHtml = `<strong>💻 Executing Command</strong> ${args?.command ? `(${escapeHtmlStr(args.command)})` : ""}`;
    } else if (toolName === "save_artifact") {
      labelHtml = `<strong>📦 Saving Artifact</strong> ${args?.name ? `("${escapeHtmlStr(args.name)}")` : ""}`;
    } else {
      const prettyArgs = args && Object.keys(args).length > 0 ? JSON.stringify(args) : "";
      const displayArgs = prettyArgs.length > 50 ? prettyArgs.slice(0, 50) + "..." : prettyArgs;
      labelHtml = `<strong>${escapeHtmlStr(toolName)}</strong> ${displayArgs ? `(${escapeHtmlStr(displayArgs)})` : ""}`;
    }

    item.innerHTML = `
      <span class="tool-spinner"></span>
      <span>${labelHtml}</span>
    `;

    container.appendChild(item);
  }

  scrollToBottom();
}

function updateToolCallout(container, toolName, status, resultOrError) {
  if (!container) return;
  const isTimeline = container.classList.contains("thinking-steps-timeline");

  if (isTimeline) {
    const elements = container.querySelectorAll(`.thinking-step-item[data-tool="${toolName}"]`);
    const element = elements[elements.length - 1];
    if (!element) return;

    element._stepResult = resultOrError;

    const statusIcon = element.querySelector(".step-status-icon");
    if (statusIcon) {
      if (status === "completed") {
        element.classList.remove("running");
        element.classList.add("completed");
        statusIcon.innerHTML = `<span style="color: var(--success); font-weight: bold;">✓</span>`;
      } else if (status === "error") {
        element.classList.remove("running");
        element.classList.add("error");
        statusIcon.innerHTML = `<span style="color: var(--danger); font-weight: bold;">❌</span>`;
      } else {
        statusIcon.innerHTML = `<span style="color: var(--text-dim);">⏹️</span>`;
      }
    }

    if (resultOrError !== undefined) {
      const isCognitive = toolName === "record_thinking" || toolName === "record_reasoning_step" || (resultOrError && resultOrError.ui_type === "reasoning_step");
      const drawer = element.querySelector(".step-details-drawer");

      if (isCognitive && drawer) {
        const mergedData = Object.assign({}, element._stepArgs || {}, typeof resultOrError === "object" ? resultOrError : {});
        const prettyArgs = element._stepArgs ? JSON.stringify(element._stepArgs, null, 2) : "None";
        drawer.innerHTML = renderCognitiveTraceDrawer(mergedData, prettyArgs);

        // Update stage & confidence badges if newly returned
        const leftInfo = element.querySelector(".step-info-left");
        if (leftInfo && mergedData.cognitive_stage && !leftInfo.querySelector(".cog-stage-badge")) {
          const stageMeta = getCognitiveStageMeta(mergedData.cognitive_stage);
          if (stageMeta) {
            const badgeSpan = document.createElement("span");
            badgeSpan.className = `cog-stage-badge ${stageMeta.className}`;
            badgeSpan.innerHTML = `${stageMeta.icon} ${escapeHtmlStr(stageMeta.label)}`;
            const toolNameEl = leftInfo.querySelector(".step-tool-name");
            if (toolNameEl && toolNameEl.nextSibling) {
              leftInfo.insertBefore(badgeSpan, toolNameEl.nextSibling);
            } else {
              leftInfo.appendChild(badgeSpan);
            }
          }
        }
      } else {
        const outputBlock = element.querySelector(".step-output-block");
        const outputCode = element.querySelector(".step-output-code");
        if (outputBlock && outputCode) {
          outputBlock.style.display = "block";
          const formatted = typeof resultOrError === "object"
            ? JSON.stringify(resultOrError, null, 2)
            : String(resultOrError);
          outputCode.textContent = formatted;
        }
      }
    }
  } else {
    // Classic fallback tool indicator update
    const elements = container.querySelectorAll(`.tool-indicator[data-tool="${toolName}"]`);
    const element = elements[elements.length - 1];
    if (element) {
      element.className = `tool-indicator ${status}`;
      const spinner = element.querySelector(".tool-spinner");
      if (spinner) spinner.remove();
      const checkmark = document.createElement("span");
      checkmark.textContent = status === "completed" ? "✓ " : "⏹️ ";
      checkmark.style.color = status === "completed" ? "var(--success)" : "var(--danger)";
      element.prepend(checkmark);
    }
  }
}

function finalizeThinkingDisclosure(cardElement, elapsedMs, usage) {
  if (!cardElement) return;
  cardElement.classList.remove("running");

  const timeline = cardElement.querySelector(".thinking-steps-timeline");
  const stepCount = timeline ? timeline.querySelectorAll(".thinking-step-item").length : 0;
  if (stepCount === 0) {
    cardElement.style.display = "none";
    return;
  }
  cardElement.style.display = "";
  const elapsedSec = elapsedMs ? (elapsedMs / 1000).toFixed(1) : null;

  const titleEl = cardElement.querySelector(".thinking-main-title");
  const metaEl = cardElement.querySelector(".thinking-sub-meta");
  const brainIcon = cardElement.querySelector(".thinking-brain-icon");
  const countBadge = cardElement.querySelector(".thinking-step-count-badge");
  const copyTraceBtn = cardElement.querySelector(".thinking-copy-trace-btn");

  if (brainIcon) brainIcon.textContent = "⚡";

  if (titleEl) {
    titleEl.textContent = stepCount > 0 ? "Reasoning & Execution Trace" : "Direct AI Reasoning";
  }

  if (countBadge) {
    countBadge.textContent = `${stepCount} step${stepCount === 1 ? "" : "s"}`;
    countBadge.style.color = "var(--success)";
  }

  if (copyTraceBtn && stepCount > 0) {
    copyTraceBtn.style.display = "inline-flex";
  }

  if (metaEl) {
    let metaText = "";
    if (elapsedSec) metaText += `${elapsedSec}s elapsed`;
    if (stepCount > 0) metaText += ` • ${stepCount} execution step${stepCount === 1 ? "" : "s"}`;
    metaText += " (Click to expand)";
    metaEl.textContent = metaText;
  }
}

// ─── Session Management ─────────────────────────────────────────────

let chatSortOrder = localStorage.getItem("ai_plate_chat_sort_order") || "desc";
const btnSortSessions = document.getElementById("btn-sort-sessions");

function updateSortIcon() {
  if (!btnSortSessions) return;
  if (chatSortOrder === "asc") {
    btnSortSessions.title = "Sort: Oldest First (Click for Recent First)";
    btnSortSessions.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none">
        <path d="M9 6h6M6 12h12M3 18h18"></path>
      </svg>
    `;
  } else {
    btnSortSessions.title = "Sort: Recent First (Click for Oldest First)";
    btnSortSessions.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none">
        <path d="M3 6h18M6 12h12M9 18h6"></path>
      </svg>
    `;
  }
}

if (btnSortSessions) {
  updateSortIcon();
  btnSortSessions.addEventListener("click", (e) => {
    e.stopPropagation();
    chatSortOrder = chatSortOrder === "desc" ? "asc" : "desc";
    localStorage.setItem("ai_plate_chat_sort_order", chatSortOrder);
    updateSortIcon();
    loadSessions();
  });
}

async function loadSessions() {
  try {
    const res = await fetch("/api/sessions");
    const data = await res.json();
    let sessions = data.sessions || [];
    for (const session of sessions) {
      if (!dirtySessionModes.has(session.id)) sessionModes.set(session.id, session.mode || "normal");
    }

    if (chatSortOrder === "asc") {
      sessions = [...sessions].reverse();
    }

    // Always trust the server's active session ID
    if (data.activeSessionId) {
      currentSessionId = data.activeSessionId;
      localStorage.setItem("ai_plate_active_session", currentSessionId);
    } else if (sessions.length > 0) {
      // If stored ID no longer exists in server sessions, fallback to first
      const storedId = localStorage.getItem("ai_plate_active_session");
      const valid = sessions.find((s) => s.id === storedId);
      currentSessionId = valid ? storedId : sessions[0].id;
      localStorage.setItem("ai_plate_active_session", currentSessionId);
    }

    syncChatModeSelector();

    if (sessionCountBadge) {
      sessionCountBadge.textContent = sessions.length;
    }

    if (sessionsList) {
      if (!sessionsList._delegatedBound) {
        sessionsList._delegatedBound = true;
        sessionsList.addEventListener("click", (e) => {
          if (e.target.closest(".session-delete-btn")) return;
          const item = e.target.closest(".session-item");
          if (item && item.dataset.sessionId) {
            switchTab("tab-chat");
            switchSession(item.dataset.sessionId, true);
          }
        });
      }

      if (sessions.length === 0) {
        sessionsList.innerHTML = `<div style="color: var(--text-dim); font-size: 11.5px; padding: 6px 10px;">No saved chats</div>`;
      } else {
        const emptyNotice = sessionsList.querySelector("div:not(.session-item)");
        if (emptyNotice) emptyNotice.remove();

        const existingItems = new Map();
        sessionsList.querySelectorAll(".session-item").forEach((el) => {
          if (el.dataset.sessionId) {
            existingItems.set(el.dataset.sessionId, el);
          }
        });

        const activeIds = new Set(sessions.map((s) => s.id));
        existingItems.forEach((el, id) => {
          if (!activeIds.has(id)) {
            el.remove();
          }
        });

        sessions.forEach((s, idx) => {
          const isActive = s.id === currentSessionId;
          const isRunning = runningSessions.has(s.id);
          const isUnvisited = unvisitedDoneSessions.has(s.id) && !isActive && !isRunning;

          let el = existingItems.get(s.id);
          const rawTitle = s.title || "Chat Session";
          let title = rawTitle.slice(0, 36);

          if (el) {
            const existingTitle = el.querySelector(".session-title-text")?.textContent?.trim();
            if (
              (rawTitle === "New Chat" || rawTitle === "Initial Chat" || rawTitle === "Chat Session") &&
              existingTitle &&
              existingTitle !== "New Chat" &&
              existingTitle !== "Initial Chat" &&
              existingTitle !== "Chat Session"
            ) {
              title = existingTitle;
            }

            el.classList.toggle("active", isActive);
            const titleSpan = el.querySelector(".session-title-text");
            if (titleSpan) {
              if (titleSpan.textContent !== title) {
                titleSpan.textContent = title;
              }
              titleSpan.title = title;
            }

            let runningDot = el.querySelector(".session-running-dot");
            if (isRunning && !runningDot) {
              runningDot = document.createElement("span");
              runningDot.className = "session-running-dot";
              runningDot.title = "Actively reasoning in background...";
              const deleteBtn = el.querySelector(".session-delete-btn");
              el.insertBefore(runningDot, deleteBtn);
            } else if (!isRunning && runningDot) {
              runningDot.remove();
            }

            let unvisitedDot = el.querySelector(".session-unvisited-dot");
            if (isUnvisited && !unvisitedDot) {
              unvisitedDot = document.createElement("span");
              unvisitedDot.className = "session-unvisited-dot";
              unvisitedDot.title = "Response ready • Unvisited";
              const deleteBtn = el.querySelector(".session-delete-btn");
              el.insertBefore(unvisitedDot, deleteBtn);
            } else if (!isUnvisited && unvisitedDot) {
              unvisitedDot.remove();
            }

            const currentChild = sessionsList.children[idx];
            if (currentChild !== el) {
              sessionsList.insertBefore(el, currentChild || null);
            }
          } else {
            el = document.createElement("div");
            el.className = `session-item ${isActive ? "active" : ""}`;
            el.dataset.sessionId = s.id;
            el.innerHTML = `
              <span class="nav-icon session-item-icon" style="font-size: 12px;">💬</span>
              <span class="session-title-text" title="${title}">${title}</span>
              ${isRunning ? `<span class="session-running-dot" title="Actively reasoning in background..."></span>` : ""}
              ${isUnvisited ? `<span class="session-unvisited-dot" title="Response ready • Unvisited"></span>` : ""}
              <button class="session-delete-btn" title="Delete chat" onclick="deleteSession('${s.id}', event)">✕</button>
            `;
            const currentChild = sessionsList.children[idx];
            sessionsList.insertBefore(el, currentChild || null);
          }
        });
      }
    }
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

async function switchSession(sessionId, force = false) {
  unvisitedDoneSessions.delete(sessionId);
  updateWorkspaceTabsUnvisitedDots();

  if (sessionId === currentSessionId && !force) {
    try {
      const msgRes = await fetch(`/api/sessions/messages?id=${encodeURIComponent(sessionId)}`);
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        if (msgData.messages) {
          await renderSessionMessages(msgData.messages);
        }
      }
    } catch {}

    if (runningSessions.has(sessionId)) {
      const runInfo = runningSessions.get(sessionId);
      if (runInfo && runInfo.blockElement && !chatMessages.contains(runInfo.blockElement)) {
        chatMessages.appendChild(runInfo.blockElement);
        scrollToBottom(true);
      }
    }

    updateDockControlsForSession(sessionId);
    return;
  }

  try {
    switchTab("tab-chat");
    const res = await fetch("/api/sessions/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    if (data.success) {
      currentSessionId = sessionId;
      syncChatModeSelector();
      localStorage.setItem("ai_plate_active_session", sessionId);
      currentSessionHistoryTokens = 0;
      currentTokensSaved = 0;
      updateContextTokensUI();

      await renderSessionMessages(data.messages || []);

      // If this session is actively running in the background, attach its live running element!
      if (runningSessions.has(sessionId)) {
        const runInfo = runningSessions.get(sessionId);
        if (runInfo && runInfo.blockElement && !chatMessages.contains(runInfo.blockElement)) {
          chatMessages.appendChild(runInfo.blockElement);
          scrollToBottom(true);
        }
      }

      updateDockControlsForSession(sessionId);
      loadSessions();
    }
  } catch (err) {
    console.error("Failed to switch session:", err);
  }
}

async function renderSessionMessages(messages) {
  chatMessages.innerHTML = "";
  if (!messages || messages.length === 0) {
    if (chatHero) chatHero.classList.remove("hidden");
    currentSessionHistoryTokens = 0;
    currentSessionTurnsCount = 0;
    currentTokensSaved = 0;
    updateContextTokensUI();
    refreshSessionContextTokens(currentSessionId);
    return;
  }

  if (chatHero) chatHero.classList.add("hidden");

  let histTokens = 0;
  for (const m of messages) {
    histTokens += estimateTokensClient(m.content || "");
  }
  currentSessionHistoryTokens = histTokens;
  currentSessionTurnsCount = messages.length;
  currentTokensSaved = 0;
  updateContextTokensUI();
  refreshSessionContextTokens(currentSessionId);

  // Fetch current artifacts to restore in-chat cards
  let existingArtifacts = [];
  try {
    const artRes = await fetch("/api/artifacts/files");
    if (artRes.ok) {
      const artData = await artRes.json();
      existingArtifacts = artData.files || [];
    }
  } catch {}

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user") {
      appendMessage("user", msg.content, []);
    } else {
      const content = msg.content || "";
      const contentLower = content.toLowerCase();

      // Find any artifacts explicitly produced or mentioned in THIS specific message
      const referencedArtifacts = existingArtifacts.filter((art) => {
        const artNameLower = art.name.toLowerCase();
        return contentLower.includes(artNameLower) || contentLower.includes(`artifacts/${artNameLower}`);
      });

      // If this message has visual artifact cards, strip duplicate markdown image links from body text
      let displayContent = content;
      if (referencedArtifacts.length > 0) {
        displayContent = displayContent.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
      }

      const isTtsActive = isTTSPluginEnabled();
      const block = document.createElement("div");
      block.className = "message-block message-author-assistant";
      block._rawResponseText = displayContent;
      block.innerHTML = `
        <div class="message-header">
          <div class="message-header-left">
            <div class="message-avatar"><img src="assets/logo.png" class="assistant-avatar-img" alt="AI Plate" onerror="this.onerror=null;this.outerHTML='⚡';" /></div>
            <span class="message-author">AI Plate</span>
          </div>
          <button class="message-tts-btn" title="Read response aloud (Kokoro TTS)" type="button" style="display: ${isTtsActive ? "inline-flex" : "none"};">
            <span class="tts-icon">🔊</span>
            <span class="tts-btn-label">Read Aloud</span>
          </button>
        </div>
        <div class="message-skills-indicator hidden" style="display: none;"></div>
        <div class="message-body">${renderMarkdown(displayContent)}</div>
      `;

      if (i > 0 && messages[i - 1].role === "user") {
        const userPrompt = messages[i - 1].content || "";
        const matchedSkills = getApplicableSkillsLocally(userPrompt);
        if (matchedSkills && matchedSkills.length > 0) {
          renderMessageSkills(block, matchedSkills);
        } else {
          renderMessageSkills(block, []);
        }
      } else {
        renderMessageSkills(block, []);
      }

      const ttsBtn = block.querySelector(".message-tts-btn");
      if (ttsBtn) {
        ttsBtn.addEventListener("click", () => {
          const textToSpeak = block._rawResponseText || block.querySelector(".message-body")?.innerText || "";
          playTTS(textToSpeak, ttsBtn);
        });
      }
      chatMessages.appendChild(block);

      // Render cards only for artifacts actually referenced in this message
      for (const art of referencedArtifacts) {
        renderInChatArtifactCard(block, {
          artifactName: art.name,
          url: art.url,
          description: "Generated Deliverable Artifact",
          position: "after-body",
        });
      }
    }
  }

  // Restore any persisted outcome summary cards for this session across tab/session switches
  try {
    const sid = currentSessionId || localStorage.getItem("ai_plate_active_session") || "default";
    const storeKey = `ai_plate_session_outcomes_${sid}`;
    const stored = JSON.parse(localStorage.getItem(storeKey) || "[]");
    if (Array.isArray(stored) && stored.length > 0 && typeof window.renderOutcomeSummaryCard === "function") {
      const assistantBlocks = chatMessages.querySelectorAll(".message-author-assistant");
      if (assistantBlocks.length > 0) {
        const lastBlock = assistantBlocks[assistantBlocks.length - 1];
        const latestOutcome = stored[stored.length - 1];
        window.renderOutcomeSummaryCard(lastBlock, latestOutcome);
      }
    }
  } catch (err) {}

  scrollToBottom(true);
}

async function createNewSession() {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Chat" }),
    });
    const data = await res.json();
    if (data.success && data.session) {
      currentSessionId = data.session.id;
      syncChatModeSelector();
      localStorage.setItem("ai_plate_active_session", currentSessionId);

      // Tell the server to make this the active session
      await fetch("/api/sessions/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });

      chatMessages.innerHTML = "";
      if (chatHero) chatHero.classList.remove("hidden");

      currentSessionHistoryTokens = 0;
      currentSessionTurnsCount = 0;
      currentTokensSaved = 0;
      updateContextTokensUI();
      refreshSessionContextTokens(currentSessionId);

      // Switch view to chat tab
      switchTab("tab-chat");
      userInput.value = "";
      adjustTextareaHeight();
      updateDockControlsForSession(currentSessionId);
      userInput.focus();
      await loadSessions();
    }
  } catch (err) {
    alert("Failed to create new session: " + err.message);
  }
}

window.deleteSession = async function (sessionId, e) {
  if (e) e.stopPropagation();
  const confirmed = await showThemedConfirm({
    title: "Delete Chat Session",
    message: "Are you sure you want to permanently delete this chat history? All conversation memory will be erased.",
    confirmText: "Delete Chat",
    icon: "🗑️",
    danger: true,
  });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.success) {
      if (currentSessionId === sessionId) {
        if (data.activeSessionId) {
          switchSession(data.activeSessionId);
        } else {
          createNewSession();
        }
      } else {
        loadSessions();
      }
    }
  } catch (err) {
    alert("Failed to delete session: " + err.message);
  }
};

// ─── Token Analytics Ledger & Window ────────────────────────────────

let tokenLedger = [];
try {
  const savedLedger = localStorage.getItem("ai_plate_token_ledger");
  if (savedLedger) {
    tokenLedger = JSON.parse(savedLedger);
  }
} catch {
  tokenLedger = [];
}

function recordTurnTokens(record) {
  tokenLedger.unshift(record); // newest first
  if (tokenLedger.length > 200) tokenLedger.pop();
  try {
    localStorage.setItem("ai_plate_token_ledger", JSON.stringify(tokenLedger));
  } catch {}
}

const tokenStatsModal = document.getElementById("token-stats-modal");
const btnTokenStats = document.getElementById("btn-token-stats");
const btnCloseTokenStats = document.getElementById("token-stats-close");
const btnClearTokenLedger = document.getElementById("btn-clear-token-ledger");

const statsTotalTokensEl = document.getElementById("stats-total-tokens");
const statsPromptTokensEl = document.getElementById("stats-prompt-tokens");
const statsCompletionTokensEl = document.getElementById("stats-completion-tokens");
const statsEmbedTokensEl = document.getElementById("stats-embed-tokens");

const ratioPromptEl = document.getElementById("ratio-prompt");
const ratioCompletionEl = document.getElementById("ratio-completion");
const ratioEmbedEl = document.getElementById("ratio-embed");

const pctPromptEl = document.getElementById("pct-prompt");
const pctCompletionEl = document.getElementById("pct-completion");
const pctEmbedEl = document.getElementById("pct-embed");

const tokenLedgerTbody = document.getElementById("token-ledger-tbody");

function renderTokenStats() {
  let sumPrompt = 0;
  let sumCompletion = 0;
  let sumEmbed = 0;
  let sumTotal = 0;

  for (const item of tokenLedger) {
    sumPrompt += item.promptTokens || 0;
    sumCompletion += item.completionTokens || 0;
    sumEmbed += item.embeddingTokens || 0;
    sumTotal += item.totalTokens || 0;
  }

  if (statsTotalTokensEl) statsTotalTokensEl.textContent = sumTotal.toLocaleString();
  if (statsPromptTokensEl) statsPromptTokensEl.textContent = sumPrompt.toLocaleString();
  if (statsCompletionTokensEl) statsCompletionTokensEl.textContent = sumCompletion.toLocaleString();
  if (statsEmbedTokensEl) statsEmbedTokensEl.textContent = sumEmbed.toLocaleString();

  // Calculate percentages
  const effectiveTotal = sumTotal || 1;
  const pctPrompt = Math.round((sumPrompt / effectiveTotal) * 100);
  const pctCompletion = Math.round((sumCompletion / effectiveTotal) * 100);
  const pctEmbed = Math.max(0, 100 - pctPrompt - pctCompletion);

  if (ratioPromptEl) ratioPromptEl.style.width = `${pctPrompt}%`;
  if (ratioCompletionEl) ratioCompletionEl.style.width = `${pctCompletion}%`;
  if (ratioEmbedEl) ratioEmbedEl.style.width = `${pctEmbed}%`;

  if (pctPromptEl) pctPromptEl.textContent = `${pctPrompt}%`;
  if (pctCompletionEl) pctCompletionEl.textContent = `${pctCompletion}%`;
  if (pctEmbedEl) pctEmbedEl.textContent = `${pctEmbed}%`;

  // Render Table
  if (tokenLedgerTbody) {
    if (tokenLedger.length === 0) {
      tokenLedgerTbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-table">No interaction tokens recorded yet in this session.</td>
        </tr>
      `;
      return;
    }

    tokenLedgerTbody.innerHTML = tokenLedger
      .map(
        (t, idx) => {
          const skillsList = Array.isArray(t.skills) ? t.skills : [];
          const skillsHtml = skillsList.length > 0
            ? `<div class="ledger-skills-wrap">${skillsList.map((s) => `<span class="ledger-skill-pill" title="Triggered Directive: ${escapeHtmlStr(s)}">⚡ ${escapeHtmlStr(s)}</span>`).join("")}</div>`
            : `<span style="color: var(--text-dim);">-</span>`;
          return `
        <tr>
          <td class="col-turn">#${tokenLedger.length - idx}</td>
          <td class="col-time">${t.time}</td>
          <td class="col-model" title="${escapeHtmlStr(t.model || "")}">
            <span style="color: var(--text-main); font-weight: 500;">${escapeHtmlStr(t.model || "")}</span>
          </td>
          <td class="col-num" style="color: var(--text-accent);">${(t.promptTokens || 0).toLocaleString()}</td>
          <td class="col-num" style="color: var(--success);">${(t.completionTokens || 0).toLocaleString()}</td>
          <td class="col-num" style="color: #38bdf8;">${(t.embeddingTokens || 0).toLocaleString()}</td>
          <td class="col-num" style="font-weight: 600; color: var(--text-main);">${(t.totalTokens || 0).toLocaleString()}</td>
          <td class="col-latency">${t.elapsedSec ? `${t.elapsedSec}s` : "-"}</td>
          <td class="col-skills">${skillsHtml}</td>
        </tr>
      `;
        }
      )
      .join("");
  }
}

function openTokenStatsModal() {
  renderTokenStats();
  if (tokenStatsModal) {
    tokenStatsModal.classList.remove("hidden");
    void tokenStatsModal.offsetWidth;
    tokenStatsModal.classList.add("visible");
  }
}

function closeTokenStatsModal() {
  if (tokenStatsModal) {
    tokenStatsModal.classList.remove("visible");
    setTimeout(() => {
      if (!tokenStatsModal.classList.contains("visible")) {
        tokenStatsModal.classList.add("hidden");
      }
    }, 280);
  }
}

if (btnTokenStats) btnTokenStats.addEventListener("click", openTokenStatsModal);
if (btnCloseTokenStats) btnCloseTokenStats.addEventListener("click", closeTokenStatsModal);

if (tokenStatsModal) {
  tokenStatsModal.addEventListener("click", (e) => {
    if (e.target === tokenStatsModal) closeTokenStatsModal();
  });
}

if (btnClearTokenLedger) {
  btnClearTokenLedger.addEventListener("click", async () => {
    const confirmed = await showThemedConfirm({
      title: "Reset Token Analytics",
      message: "Clear all turn-by-turn interaction tokens and ledger history?",
      confirmText: "Reset History",
      icon: "📊",
      danger: true,
    });
    if (confirmed) {
      tokenLedger = [];
      localStorage.removeItem("ai_plate_token_ledger");
      renderTokenStats();
    }
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && tokenStatsModal && !tokenStatsModal.classList.contains("hidden")) {
    closeTokenStatsModal();
  }
});

// ─── Universal Dynamic Scroll Fade Engine ───────────────────────────

function updateElementScrollFade(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return;

  // Vertical scroll calculation
  const hasVerticalScroll = el.scrollHeight > el.clientHeight + 2;
  if (hasVerticalScroll) {
    const scrollTop = el.scrollTop;
    const scrollBottom = el.scrollHeight - el.clientHeight - scrollTop;
    const canScrollUp = scrollTop > 6;
    const canScrollDown = scrollBottom > 6;

    if (canScrollUp && canScrollDown) {
      el.setAttribute("data-scroll-fade", "both");
    } else if (canScrollUp) {
      el.setAttribute("data-scroll-fade", "top");
    } else if (canScrollDown) {
      el.setAttribute("data-scroll-fade", "bottom");
    } else {
      el.removeAttribute("data-scroll-fade");
    }
  } else {
    el.removeAttribute("data-scroll-fade");
  }

  // Horizontal scroll calculation
  const hasHorizontalScroll = el.scrollWidth > el.clientWidth + 2;
  if (hasHorizontalScroll) {
    const scrollLeft = el.scrollLeft;
    const scrollRight = el.scrollWidth - el.clientWidth - scrollLeft;
    const canScrollLeft = scrollLeft > 6;
    const canScrollRight = scrollRight > 6;

    if (canScrollLeft && canScrollRight) {
      el.setAttribute("data-scroll-fade-x", "both");
    } else if (canScrollLeft) {
      el.setAttribute("data-scroll-fade-x", "left");
    } else if (canScrollRight) {
      el.setAttribute("data-scroll-fade-x", "right");
    } else {
      el.removeAttribute("data-scroll-fade-x");
    }
  } else {
    el.removeAttribute("data-scroll-fade-x");
  }
}

function initScrollFadeEngine() {
  // Lightweight native passive scroll listeners without full-DOM mutation observers
  const scrollSelector = "pre, .code-block-wrapper pre";

  let scrollFadeRaf = null;
  document.addEventListener(
    "scroll",
    (e) => {
      const target = e.target;
      if (target && target.nodeName === "PRE") {
        if (!scrollFadeRaf) {
          scrollFadeRaf = requestAnimationFrame(() => {
            scrollFadeRaf = null;
            updateElementScrollFade(target);
          });
        }
      }
    },
    { passive: true, capture: true }
  );
}

// ═════════════════════════════════════════════════════════════════════
// ─── APP CONNECTORS & EXTERNAL APP BRIDGES (BLENDER, OBS, COMFYUI) ───
// ═════════════════════════════════════════════════════════════════════

const connectorsGrid = document.getElementById("connectors-grid");
const connectorsActiveCountBadge = document.getElementById("connectors-active-count");
const btnRefreshConnectors = document.getElementById("btn-refresh-connectors");
const btnAddCustomConnector = document.getElementById("btn-add-custom-connector");

const connectorSetupModal = document.getElementById("connector-setup-modal");
const connectorSetupClose = document.getElementById("connector-setup-close");
const setupModalTitle = document.getElementById("setup-modal-title");
const setupModalSub = document.getElementById("setup-modal-sub");
const setupModalIcon = document.getElementById("setup-modal-icon");
const setupModalBody = document.getElementById("setup-modal-body");

const customConnectorModal = document.getElementById("custom-connector-modal");
const customConnectorClose = document.getElementById("custom-connector-close");
const customConnectorForm = document.getElementById("custom-connector-form");
const btnCancelCustomConnector = document.getElementById("btn-cancel-custom-connector");
const btnTestCustomConnectorForm = document.getElementById("btn-test-custom-connector-form");
const customConnFeedback = document.getElementById("custom-conn-feedback");

let cachedConnectorsList = [];

async function loadConnectors() {
  if (!connectorsGrid) return;
  
  try {
    const res = await fetch("/api/connectors");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    cachedConnectorsList = data.connectors || [];
    renderConnectorsGrid(cachedConnectorsList);
    
    const activeCount = cachedConnectorsList.filter((c) => c.enabled).length;
    if (connectorsActiveCountBadge) {
      connectorsActiveCountBadge.textContent = `${activeCount}/${cachedConnectorsList.length}`;
      connectorsActiveCountBadge.className = `connectors-active-badge ${activeCount > 0 ? "active" : ""}`;
    }
  } catch (err) {
    console.error("Failed to load connectors:", err);
    connectorsGrid.innerHTML = `
      <div class="connectors-empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h4>Failed to Load Connectors</h4>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary btn-sm" onclick="loadConnectors()">🔄 Retry</button>
      </div>
    `;
  }
}

function renderConnectorsGrid(connectors) {
  if (!connectorsGrid) return;
  
  if (!connectors || connectors.length === 0) {
    connectorsGrid.innerHTML = `
      <div class="connectors-empty-state">
        <div class="empty-state-icon">🔌</div>
        <h4>No App Connectors Found</h4>
        <p>Click "Add Custom App" to connect local software or cloud APIs.</p>
      </div>
    `;
    return;
  }

  connectorsGrid.innerHTML = connectors.map((conn) => renderConnectorCard(conn)).join("");
  attachConnectorCardEventListeners();
}

function renderConnectorCard(conn) {
  const isCustom = conn.type === "custom_rest" || conn.type === "custom_ws";
  const typeLabelMap = {
    blender: "Blender 3D Bridge",
    obs: "OBS WebSocket v5",
    comfyui: "ComfyUI REST API",
    godot: "Godot RPC Bridge",
    custom_rest: "REST API Endpoint",
    custom_ws: "WebSocket Endpoint",
  };

  let statusBadge = `<span class="conn-status-pill status-offline">🔴 Offline</span>`;
  if (conn.lastStatus === "connected") {
    const lat = conn.lastLatencyMs !== undefined ? `${conn.lastLatencyMs}ms` : "online";
    statusBadge = `<span class="conn-status-pill status-online" title="${conn.lastTestedAt ? new Date(conn.lastTestedAt).toLocaleTimeString() : ''}">🟢 Online (${lat})</span>`;
  } else if (conn.lastStatus === "offline" && conn.lastErrorMessage) {
    statusBadge = `<span class="conn-status-pill status-offline" title="${escapeHtml(conn.lastErrorMessage)}">🔴 Offline</span>`;
  }

  const hasGuide = ["blender", "obs", "comfyui", "godot"].includes(conn.type);

  return `
    <div class="connector-card ${conn.enabled ? 'is-enabled' : 'is-disabled'}" id="card-conn-${conn.id}" data-connector-id="${conn.id}">
      <div class="connector-card-head">
        <div class="conn-head-left">
          <span class="conn-icon">${conn.icon || '🔌'}</span>
          <div class="conn-title-group">
            <div class="conn-title-row">
              <h4 class="conn-name">${escapeHtml(conn.name)}</h4>
              <span class="conn-type-badge">${typeLabelMap[conn.type] || conn.type}</span>
            </div>
            <div class="conn-status-row">${statusBadge}</div>
          </div>
        </div>
        <div class="conn-head-right">
          <label class="switch" title="Toggle connector tools on/off for AI reasoning agent">
            <input type="checkbox" class="conn-enable-toggle" data-id="${conn.id}" ${conn.enabled ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>
      </div>

      <p class="conn-desc">${escapeHtml(conn.description || '')}</p>

      <!-- Connection endpoint details & edit inputs -->
      <div class="conn-config-section">
        <div class="conn-form-grid">
          <div class="form-group">
            <label>Host / IP</label>
            <input type="text" class="custom-input custom-input-sm conn-input-host" data-id="${conn.id}" value="${escapeHtml(conn.host || 'localhost')}">
          </div>
          <div class="form-group" style="max-width: 100px;">
            <label>Port</label>
            <input type="number" class="custom-input custom-input-sm conn-input-port" data-id="${conn.id}" value="${conn.port || 80}">
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="conn-card-footer">
        <div class="conn-footer-left">
          <button type="button" class="btn btn-secondary btn-sm btn-test-conn" data-id="${conn.id}">
            <span class="btn-test-icon">⚡</span>
            <span>Test Ping</span>
          </button>
          ${hasGuide ? `
            <button type="button" class="btn btn-secondary btn-sm btn-guide-conn" data-id="${conn.id}">
              <span>📖 Setup Guide</span>
            </button>
          ` : ''}
        </div>
        <div class="conn-footer-right">
          <button type="button" class="btn btn-secondary btn-sm btn-export-conn" data-id="${conn.id}" title="Export connector package (.connector.zip)">
            <span>📤</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-save-conn" data-id="${conn.id}" title="Save modified host/port">
            <span>💾 Save</span>
          </button>
          ${isCustom || conn.isModular ? `
            <button type="button" class="btn btn-danger btn-sm btn-delete-conn" data-id="${conn.id}" title="Delete connector">
              <span>🗑️</span>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="conn-card-feedback" id="feedback-conn-${conn.id}"></div>
    </div>
  `;
}

function attachConnectorCardEventListeners() {
  // Toggle switches
  document.querySelectorAll(".conn-enable-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const enabled = e.target.checked;
      const card = document.getElementById(`card-conn-${id}`);
      if (card) {
        card.classList.toggle("is-enabled", enabled);
        card.classList.toggle("is-disabled", !enabled);
      }

      try {
        const res = await fetch("/api/connectors/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, enabled }),
        });
        const data = await res.json();
        if (data.success) {
          showPluginToast(`${enabled ? "✅ Enabled" : "⚪ Disabled"} connector "${id}"`);
          loadConnectors();
        } else {
          showPluginToast(`❌ ${data.error || "Failed to toggle connector"}`);
        }
      } catch (err) {
        showPluginToast(`❌ Toggle error: ${err.message}`);
      }
    });
  });

  // Test Ping buttons
  document.querySelectorAll(".btn-test-conn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const card = document.getElementById(`card-conn-${id}`);
      const hostInput = card ? card.querySelector(".conn-input-host") : null;
      const portInput = card ? card.querySelector(".conn-input-port") : null;

      const overrideConfig = {
        host: hostInput ? hostInput.value.trim() : undefined,
        port: portInput ? Number(portInput.value) : undefined,
      };

      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<span class="btn-spinner"></span> <span>Testing...</span>`;
      btn.disabled = true;

      try {
        const res = await fetch("/api/connectors/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, config: overrideConfig }),
        });
        const data = await res.json();

        if (data.success) {
          showPluginToast(`🟢 ${data.result.message} (${data.result.latencyMs}ms)`);
        } else {
          showPluginToast(`🔴 ${data.result?.message || data.error || "Connection failed"}`);
        }
        loadConnectors();
      } catch (err) {
        showPluginToast(`❌ Ping error: ${err.message}`);
      } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    });
  });

  // Save buttons
  document.querySelectorAll(".btn-save-conn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const card = document.getElementById(`card-conn-${id}`);
      if (!card) return;

      const hostInput = card.querySelector(".conn-input-host");
      const portInput = card.querySelector(".conn-input-port");
      const existing = cachedConnectorsList.find((c) => c.id === id);
      if (!existing) return;

      const updated = {
        ...existing,
        host: hostInput ? hostInput.value.trim() : existing.host,
        port: portInput ? Number(portInput.value) : existing.port,
      };

      try {
        const res = await fetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });
        const data = await res.json();
        if (data.success) {
          showPluginToast(`💾 Saved settings for "${existing.name}"`);
          loadConnectors();
        } else {
          showPluginToast(`❌ ${data.error || "Failed to save"}`);
        }
      } catch (err) {
        showPluginToast(`❌ Save error: ${err.message}`);
      }
    });
  });

  // Delete buttons (Custom connectors)
  document.querySelectorAll(".btn-delete-conn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const confirmed = await showThemedConfirm({
        title: "Delete Connector",
        message: `Are you sure you want to delete custom connector "${id}"?`,
        confirmText: "Delete",
        icon: "🔌",
        danger: true,
      });
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/connectors?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
          showPluginToast(`🗑️ Connector deleted`);
          loadConnectors();
        } else {
          showPluginToast(`❌ ${data.error || "Failed to delete"}`);
        }
      } catch (err) {
        showPluginToast(`❌ Delete error: ${err.message}`);
      }
    });
  });

  // Export buttons (.zip package)
  document.querySelectorAll(".btn-export-conn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        const res = await fetch(`/api/connectors/export-package?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.bufferBase64) {
          const byteCharacters = atob(data.bufferBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: "application/zip" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || `${id}.connector.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showPluginToast(`📤 Exported package "${data.filename}"`);
        } else if (data.content) {
          const blob = new Blob([data.content], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || `${id}.connector.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showPluginToast(`📤 Exported "${data.filename}"`);
        }
      } catch (err) {
        showPluginToast(`❌ Export failed: ${err.message}`);
      }
    });
  });

  // Setup Guide buttons
  document.querySelectorAll(".btn-guide-conn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      openConnectorSetupModal(id);
    });
  });
}

// ─── Setup Guide Modal ───────────────────────────────────────────────

async function openConnectorSetupModal(connectorId) {
  if (!connectorSetupModal) return;

  if (connectorId === "blender") {
    setupModalIcon.textContent = "🎨";
    setupModalTitle.textContent = "Blender 3D Companion Bridge Setup";
    setupModalSub.textContent = "Run this lightweight script inside Blender to allow AI Plate to create objects, materials, and render 3D scenes.";

    setupModalBody.innerHTML = `
      <div class="setup-guide-content">
        <div class="setup-step">
          <div class="step-num">1</div>
          <div class="step-desc">
            <strong>Open Blender 3D</strong> and click the <strong>Scripting</strong> workspace tab at the top.
          </div>
        </div>
        <div class="setup-step">
          <div class="step-num">2</div>
          <div class="step-desc">
            Click <strong>+ New</strong> to create a new script file, then paste the bridge script below.
          </div>
        </div>
        <div class="setup-step">
          <div class="step-num">3</div>
          <div class="step-desc">
            Click <strong>▶ Run Script</strong> (or press <code>Alt + P</code>). The bridge will start listening on port <code>8198</code>.
          </div>
        </div>

        <div class="script-code-header">
          <span>📜 Blender Companion Bridge Script</span>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-copy-blender-script">📋 Copy Script</button>
        </div>
        <pre class="script-code-block"><code id="blender-script-code">Loading bridge script from server...</code></pre>
      </div>
    `;

    connectorSetupModal.classList.remove("hidden");
    void connectorSetupModal.offsetWidth;
    connectorSetupModal.classList.add("visible");

    // Fetch script content
    try {
      const res = await fetch("/api/connectors/blender-script");
      if (res.ok) {
        const text = await res.text();
        const codeEl = document.getElementById("blender-script-code");
        if (codeEl) {
          codeEl.textContent = text;
          if (window.hljs) hljs.highlightElement(codeEl);
        }

        const copyBtn = document.getElementById("btn-copy-blender-script");
        if (copyBtn) {
          copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(text);
            copyBtn.textContent = "✅ Copied!";
            setTimeout(() => { copyBtn.textContent = "📋 Copy Script"; }, 2000);
            showPluginToast("📋 Blender bridge script copied to clipboard!");
          });
        }
      }
    } catch (e) {
      const codeEl = document.getElementById("blender-script-code");
      if (codeEl) codeEl.textContent = "# Failed to fetch script from server.";
    }
  } else if (connectorId === "obs") {
    setupModalIcon.textContent = "📹";
    setupModalTitle.textContent = "OBS Studio WebSocket Setup";
    setupModalSub.textContent = "Enable the built-in OBS WebSocket server to control streams, recordings, and scenes.";

    setupModalBody.innerHTML = `
      <div class="setup-guide-content">
        <div class="setup-step">
          <div class="step-num">1</div>
          <div class="step-desc">Open <strong>OBS Studio</strong> (v28.0+ includes native WebSocket support).</div>
        </div>
        <div class="setup-step">
          <div class="step-num">2</div>
          <div class="step-desc">Click <strong>Tools</strong> in the top menu &rarr; select <strong>WebSocket Server Settings</strong>.</div>
        </div>
        <div class="setup-step">
          <div class="step-num">3</div>
          <div class="step-desc">Check <strong>Enable WebSocket server</strong> and confirm the Server Port is <code>4455</code>.</div>
        </div>
        <div class="setup-step">
          <div class="step-num">4</div>
          <div class="step-desc">Click <strong>Apply</strong>, then return to AI Plate and click <strong>⚡ Test Ping</strong>!</div>
        </div>
      </div>
    `;

    connectorSetupModal.classList.remove("hidden");
    void connectorSetupModal.offsetWidth;
    connectorSetupModal.classList.add("visible");
  } else if (connectorId === "comfyui") {
    setupModalIcon.textContent = "🔮";
    setupModalTitle.textContent = "ComfyUI Setup & Connection";
    setupModalSub.textContent = "Connect to your local ComfyUI instance to queue image and video workflows.";

    setupModalBody.innerHTML = `
      <div class="setup-guide-content">
        <div class="setup-step">
          <div class="step-num">1</div>
          <div class="step-desc">Start your local ComfyUI installation (usually running on <code>http://localhost:8188</code>).</div>
        </div>
        <div class="setup-step">
          <div class="step-num">2</div>
          <div class="step-desc">Verify in your browser that <code>http://localhost:8188</code> loads successfully.</div>
        </div>
        <div class="setup-step">
          <div class="step-num">3</div>
          <div class="step-desc">Toggle the ComfyUI connector switch <strong>ON</strong> in AI Plate. The AI agent can now queue prompt workflows and query checkpoint models!</div>
        </div>
      </div>
    `;

    connectorSetupModal.classList.remove("hidden");
    void connectorSetupModal.offsetWidth;
    connectorSetupModal.classList.add("visible");
  } else if (connectorId === "godot") {
    setupModalIcon.textContent = "🎮";
    setupModalTitle.textContent = "Godot Engine RPC Connection";
    setupModalSub.textContent = "Interact with Godot scenes, inspect trees, and trigger game commands.";

    setupModalBody.innerHTML = `
      <div class="setup-guide-content">
        <div class="setup-step">
          <div class="step-num">1</div>
          <div class="step-desc">Open your project in <strong>Godot Engine</strong> (Godot 4.x recommended).</div>
        </div>
        <div class="setup-step">
          <div class="step-num">2</div>
          <div class="step-desc">Ensure an HTTP / RPC listener addon or script is active on port <code>6006</code>.</div>
        </div>
        <div class="setup-step">
          <div class="step-num">3</div>
          <div class="step-desc">Enable the Godot connector to dispatch AI commands to your game editor!</div>
        </div>
      </div>
    `;

    connectorSetupModal.classList.remove("hidden");
    void connectorSetupModal.offsetWidth;
    connectorSetupModal.classList.add("visible");
  }
}

function closeConnectorSetupModal() {
  if (!connectorSetupModal) return;
  connectorSetupModal.classList.remove("visible");
  setTimeout(() => {
    if (!connectorSetupModal.classList.contains("visible")) {
      connectorSetupModal.classList.add("hidden");
    }
  }, 250);
}

if (connectorSetupClose) {
  connectorSetupClose.addEventListener("click", closeConnectorSetupModal);
}
if (connectorSetupModal) {
  connectorSetupModal.addEventListener("click", (e) => {
    if (e.target === connectorSetupModal) closeConnectorSetupModal();
  });
}

// ─── Custom Connector Modal Handlers ─────────────────────────────────

function openCustomConnectorModal() {
  if (!customConnectorModal) return;
  if (customConnectorForm) customConnectorForm.reset();
  if (customConnFeedback) customConnFeedback.textContent = "";
  
  customConnectorModal.classList.remove("hidden");
  void customConnectorModal.offsetWidth;
  customConnectorModal.classList.add("visible");
}

function closeCustomConnectorModal() {
  if (!customConnectorModal) return;
  customConnectorModal.classList.remove("visible");
  setTimeout(() => {
    if (!customConnectorModal.classList.contains("visible")) {
      customConnectorModal.classList.add("hidden");
    }
  }, 250);
}

if (btnAddCustomConnector) {
  btnAddCustomConnector.addEventListener("click", openCustomConnectorModal);
}
if (btnRefreshConnectors) {
  btnRefreshConnectors.addEventListener("click", () => {
    loadConnectors();
    showPluginToast("🔄 Connectors refreshed");
  });
}
if (customConnectorClose) {
  customConnectorClose.addEventListener("click", closeCustomConnectorModal);
}
if (btnCancelCustomConnector) {
  btnCancelCustomConnector.addEventListener("click", closeCustomConnectorModal);
}
if (customConnectorModal) {
  customConnectorModal.addEventListener("click", (e) => {
    if (e.target === customConnectorModal) closeCustomConnectorModal();
  });
}

if (btnTestCustomConnectorForm) {
  btnTestCustomConnectorForm.addEventListener("click", async () => {
    const host = document.getElementById("custom-conn-host")?.value.trim() || "localhost";
    const port = Number(document.getElementById("custom-conn-port")?.value) || 8080;
    const proto = document.getElementById("custom-conn-proto")?.value || "http";
    const authType = document.getElementById("custom-conn-auth-type")?.value || "none";
    const authToken = document.getElementById("custom-conn-auth-token")?.value.trim() || "";

    btnTestCustomConnectorForm.disabled = true;
    btnTestCustomConnectorForm.textContent = "⚡ Testing...";
    if (customConnFeedback) customConnFeedback.textContent = "Testing connection...";

    try {
      const res = await fetch("/api/connectors/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "temp_test",
          config: { host, port, protocol: proto, authType, authToken, type: proto.startsWith("ws") ? "custom_ws" : "custom_rest" },
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (customConnFeedback) {
          customConnFeedback.className = "custom-conn-feedback success";
          customConnFeedback.textContent = `🟢 Success: ${data.result.message} (${data.result.latencyMs}ms)`;
        }
      } else {
        if (customConnFeedback) {
          customConnFeedback.className = "custom-conn-feedback error";
          customConnFeedback.textContent = `🔴 Failed: ${data.result?.message || data.error || "Connection failed"}`;
        }
      }
    } catch (err) {
      if (customConnFeedback) {
        customConnFeedback.className = "custom-conn-feedback error";
        customConnFeedback.textContent = `❌ Error: ${err.message}`;
      }
    } finally {
      btnTestCustomConnectorForm.disabled = false;
      btnTestCustomConnectorForm.textContent = "⚡ Test Ping";
    }
  });
}

if (customConnectorForm) {
  customConnectorForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("custom-conn-name")?.value.trim();
    if (!name) return;

    const icon = document.getElementById("custom-conn-icon")?.value.trim() || "🔌";
    const desc = document.getElementById("custom-conn-desc")?.value.trim() || "";
    const proto = document.getElementById("custom-conn-proto")?.value || "http";
    const host = document.getElementById("custom-conn-host")?.value.trim() || "localhost";
    const port = Number(document.getElementById("custom-conn-port")?.value) || 8080;
    const authType = document.getElementById("custom-conn-auth-type")?.value || "none";
    const authToken = document.getElementById("custom-conn-auth-token")?.value.trim() || "";

    const id = `custom_${name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || Date.now()}`;
    const type = proto.startsWith("ws") ? "custom_ws" : "custom_rest";

    const payload = {
      id,
      name,
      icon,
      description: desc,
      type,
      protocol: proto,
      host,
      port,
      authType,
      authToken,
      enabled: true,
      options: {},
    };

    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showPluginToast(`✅ Added custom connector "${name}"`);
        closeCustomConnectorModal();
        loadConnectors();
      } else {
        if (customConnFeedback) {
          customConnFeedback.className = "custom-conn-feedback error";
          customConnFeedback.textContent = `❌ ${data.error || "Failed to save connector"}`;
        }
      }
    } catch (err) {
      if (customConnFeedback) {
        customConnFeedback.className = "custom-conn-feedback error";
        customConnFeedback.textContent = `❌ Error: ${err.message}`;
      }
    }
  });
}

// ─── Plug-and-Play Connector Package File Upload & Drag & Drop ────────

const btnImportConnectorPkg = document.getElementById("btn-import-connector-pkg");
const connectorPackageFileInput = document.getElementById("connector-package-file-input");

if (btnImportConnectorPkg && connectorPackageFileInput) {
  btnImportConnectorPkg.addEventListener("click", () => {
    connectorPackageFileInput.value = "";
    connectorPackageFileInput.click();
  });

  connectorPackageFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleConnectorPackageUpload(file);
  });
}

async function handleConnectorPackageUpload(file) {
  try {
    const isZip = file.name.toLowerCase().endsWith(".zip");
    if (!isZip) {
      showPluginToast("❌ Validation Error: Only .zip connector packages are accepted. Standalone JSON files are not allowed.");
      return;
    }

    showPluginToast(`📦 Installing connector package "${file.name}"...`);
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    const res = await fetch("/api/connectors/install-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buffer: bytes, filename: file.name }),
    });
    const data = await res.json();
    if (data.success) {
      showPluginToast(`✅ Installed connector "${data.connector?.name || file.name}"`);
      loadConnectors();
    } else {
      showPluginToast(`❌ ${data.error || "Installation failed"}`);
    }
  } catch (err) {
    showPluginToast(`❌ Package upload error: ${err.message}`);
  }
}

const tabConnectorsPane = document.getElementById("tab-settings-connectors");
if (tabConnectorsPane) {
  tabConnectorsPane.addEventListener("dragover", (e) => {
    e.preventDefault();
    tabConnectorsPane.classList.add("dragover-active");
  });
  tabConnectorsPane.addEventListener("dragleave", (e) => {
    if (!tabConnectorsPane.contains(e.relatedTarget)) {
      tabConnectorsPane.classList.remove("dragover-active");
    }
  });
  tabConnectorsPane.addEventListener("drop", async (e) => {
    e.preventDefault();
    tabConnectorsPane.classList.remove("dragover-active");
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await handleConnectorPackageUpload(file);
    }
  });
}

initScrollFadeEngine();
if (window.PluginUIHost) window.PluginUIHost.refresh();

// ─── Real-Time Sidebar Badge Auto-Refresher ─────────────────────────
window.addEventListener("focus", () => updateBadgeCounts());
setInterval(updateBadgeCounts, 10000);

// ─── Interactive Onboarding Experience Controller ───────────────────

let currentOnboardingStep = 1;
let selectedOnboardingTone = "butler";
let selectedOnboardingEngine = "openrouter";
let confettiAnimId = null;

const onboardingModal = document.getElementById("onboarding-modal");
const btnOnboardingSkip = document.getElementById("btn-onboarding-skip");
const btnOnboardingPrev = document.getElementById("btn-onboarding-prev");
const btnOnboardingNext = document.getElementById("btn-onboarding-next");
const btnOnboardingLaunch = document.getElementById("btn-onboarding-launch");
const btnLaunchOnboardingTour = document.getElementById("btn-launch-onboarding-tour");
const inputOnboardingUserName = document.getElementById("onboarding-user-name");

function openOnboardingModal(force = false) {
  if (!onboardingModal) return;
  if (!force && localStorage.getItem("ai_plate_onboarding_completed") === "true") {
    return;
  }

  // Pre-fill user name if known
  if (inputOnboardingUserName) {
    inputOnboardingUserName.value =
      (currentDossierData?.settings?.user_name) ||
      localStorage.getItem("ai_plate_user_name") ||
      "";
  }

  // Pre-select engine based on serverStatus
  if (serverStatus?.provider) {
    selectedOnboardingEngine = serverStatus.provider;
    document.querySelectorAll(".onboarding-engine-card").forEach((card) => {
      card.classList.toggle("active", card.dataset.provider === selectedOnboardingEngine);
    });
  }

  // Pre-select tone
  const savedTone = currentDossierData?.settings?.butler_tone || localStorage.getItem("ai_plate_butler_tone") || "butler";
  selectedOnboardingTone = savedTone;
  document.querySelectorAll(".onboarding-persona-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.tone === selectedOnboardingTone);
  });

  goToOnboardingStep(1);
  onboardingModal.classList.remove("hidden");
  void onboardingModal.offsetWidth;
  onboardingModal.classList.add("visible");
}

function closeOnboardingModal() {
  if (!onboardingModal) return;
  onboardingModal.classList.remove("visible");
  if (confettiAnimId) {
    cancelAnimationFrame(confettiAnimId);
    confettiAnimId = null;
  }
  setTimeout(() => {
    if (!onboardingModal.classList.contains("visible")) {
      onboardingModal.classList.add("hidden");
    }
  }, 350);
}

function goToOnboardingStep(step) {
  currentOnboardingStep = Math.max(1, Math.min(5, step));

  // 1. Panes
  for (let i = 1; i <= 5; i++) {
    const pane = document.getElementById(`onboarding-step-${i}`);
    if (pane) {
      pane.classList.toggle("active", i === currentOnboardingStep);
    }
  }

  // 2. Step dots
  const dots = document.querySelectorAll(".onboarding-step-dot");
  dots.forEach((dot) => {
    const s = parseInt(dot.dataset.step, 10);
    dot.classList.remove("active", "completed");
    if (s === currentOnboardingStep) {
      dot.classList.add("active");
      dot.textContent = String(s);
    } else if (s < currentOnboardingStep) {
      dot.classList.add("completed");
      dot.textContent = "✓";
    } else {
      dot.textContent = String(s);
    }
  });

  // 3. Step lines
  const lines = document.querySelectorAll(".onboarding-step-line");
  lines.forEach((line, idx) => {
    line.classList.toggle("active", idx + 1 < currentOnboardingStep);
  });

  // 4. Footer pills
  const pills = document.querySelectorAll(".onboarding-step-pills .step-pill");
  pills.forEach((pill, idx) => {
    pill.classList.toggle("active", idx + 1 === currentOnboardingStep);
  });

  // 5. Controls
  if (btnOnboardingPrev) {
    btnOnboardingPrev.style.visibility = currentOnboardingStep === 1 ? "hidden" : "visible";
  }

  if (btnOnboardingNext) {
    if (currentOnboardingStep === 5) {
      btnOnboardingNext.style.display = "none";
    } else {
      btnOnboardingNext.style.display = "inline-flex";
      btnOnboardingNext.textContent = currentOnboardingStep === 4 ? "Review & Launch →" : "Continue →";
    }
  }
}

// Interactive Persona Selection
document.querySelectorAll(".onboarding-persona-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".onboarding-persona-card").forEach((c) => c.classList.remove("active"));
    card.classList.add("active");
    selectedOnboardingTone = card.dataset.tone || "butler";
  });
});

// Interactive Engine Selection
document.querySelectorAll(".onboarding-engine-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".onboarding-engine-card").forEach((c) => c.classList.remove("active"));
    card.classList.add("active");
    selectedOnboardingEngine = card.dataset.provider || "openrouter";
  });
});

// Navigation buttons
if (btnOnboardingNext) {
  btnOnboardingNext.addEventListener("click", () => {
    if (currentOnboardingStep < 5) {
      goToOnboardingStep(currentOnboardingStep + 1);
    } else {
      finishOnboarding();
    }
  });
}

if (btnOnboardingPrev) {
  btnOnboardingPrev.addEventListener("click", () => {
    if (currentOnboardingStep > 1) {
      goToOnboardingStep(currentOnboardingStep - 1);
    }
  });
}

if (btnOnboardingSkip) {
  btnOnboardingSkip.addEventListener("click", () => {
    localStorage.setItem("ai_plate_onboarding_completed", "true");
    closeOnboardingModal();
  });
}

if (btnOnboardingLaunch) {
  btnOnboardingLaunch.addEventListener("click", () => {
    finishOnboarding();
  });
}

if (btnLaunchOnboardingTour) {
  btnLaunchOnboardingTour.addEventListener("click", () => {
    closeSettingsModal();
    setTimeout(() => openOnboardingModal(true), 60);
  });
}

window.openOnboardingModal = openOnboardingModal;
window.closeOnboardingModal = closeOnboardingModal;

async function finishOnboarding() {
  localStorage.setItem("ai_plate_onboarding_completed", "true");

  // Save User Name
  const nameVal = inputOnboardingUserName ? inputOnboardingUserName.value.trim() : "";
  if (nameVal) {
    await saveGeneralSetting("user_name", nameVal);
    const elUserName = document.getElementById("general-user-name");
    if (elUserName) elUserName.value = nameVal;
  }

  // Save Butler Demeanor
  if (selectedOnboardingTone) {
    await saveGeneralSetting("butler_tone", selectedOnboardingTone);
    const elButlerTone = document.getElementById("general-butler-tone");
    if (elButlerTone) elButlerTone.value = selectedOnboardingTone;
  }

  // Save Engine Provider if chosen
  if (selectedOnboardingEngine) {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedOnboardingEngine }),
      });
      await loadStatus(false);
    } catch {}
  }

  // Trigger celebration confetti animation
  launchOnboardingConfetti();

  // Switch to chat tab to welcome user
  switchTab("tab-chat");

  setTimeout(() => {
    closeOnboardingModal();
  }, 1600);
}

// Confetti Particle Explosion Engine
function launchOnboardingConfetti() {
  const canvas = document.getElementById("onboarding-confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const colors = ["#6366f1", "#a855f7", "#ec4899", "#38bdf8", "#10b981", "#f59e0b", "#ffffff"];
  const particles = [];
  const count = 90;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.9) * 15,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      alpha: 1,
      gravity: 0.35,
    });
  }

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.vRot;
      p.alpha -= 0.008;

      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
    }

    if (alive) {
      confettiAnimId = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      confettiAnimId = null;
    }
  }

  frame();
}

// Auto-trigger on first boot after initial status hydration
setTimeout(() => {
  openOnboardingModal(false);
}, 600);

