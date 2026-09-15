const { contextBridge, ipcRenderer } = require("electron");

// Forward IPC stream chunks directly to the window DOM event bus (zero contextBridge callback cloning)
ipcRenderer.on("chat:stream-chunk", (_event, chunk) => {
  try {
    window.dispatchEvent(new CustomEvent("chat:stream-chunk", { detail: chunk }));
  } catch (err) {
    console.error("[Preload] Error dispatching chat:stream-chunk:", err);
  }
});

ipcRenderer.on("action:new-chat", () => {
  window.dispatchEvent(new CustomEvent("action:new-chat"));
});

ipcRenderer.on("action:open-settings", () => {
  window.dispatchEvent(new CustomEvent("action:open-settings"));
});

ipcRenderer.on("tts:download-progress", (_event, data) => {
  try {
    window.dispatchEvent(new CustomEvent("tts:download-progress", { detail: data }));
  } catch (err) {
    console.error("[Preload] Error dispatching tts:download-progress:", err);
  }
});

ipcRenderer.on("stt:download-progress", (_event, data) => {
  try {
    window.dispatchEvent(new CustomEvent("stt:download-progress", { detail: data }));
  } catch (err) {
    console.error("[Preload] Error dispatching stt:download-progress:", err);
  }
});


const api = {
  isDesktop: true,
  platform: process.platform,

  // Window Controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  onMaximizeChange: (callback) => {
    ipcRenderer.on("window-maximized-state", (_e, isMax) => callback(isMax));
  },
  setTitleBarTheme: (theme) => ipcRenderer.send("set-title-bar-theme", theme),
  openExternal: (url) => {
    if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
      ipcRenderer.send("open-external", url);
    }
  },
  showNotification: (options) => {
    if (options && typeof options.title === "string") {
      ipcRenderer.send("show-notification", options);
    }
  },
  openPathExternal: (targetPath) => ipcRenderer.invoke("system-config:open-external", { fileType: "yaml", action: "file", targetPath }),
  showItemInFolder: (targetPath) => ipcRenderer.invoke("system-config:open-external", { fileType: "yaml", action: "folder", targetPath }),
  selectFile: (options) => ipcRenderer.invoke("dialog:select-file", options),

  // Chat Streaming & Turn Execution (Pure serializable payloads)
  chat: {
    send: (payload) => ipcRenderer.invoke("chat:send", payload),
    stop: (sessionId) => ipcRenderer.invoke("chat:stop", { sessionId }),
    reset: (sessionId) => ipcRenderer.invoke("chat:reset", { sessionId }),
    clearCache: (payload) => ipcRenderer.invoke("chat:clear-session-cache", payload),
  },

  // Models & AI Providers & Config
  models: {
    getState: () => ipcRenderer.invoke("models:get-state"),
    setActive: (payload) => ipcRenderer.invoke("models:set-active", payload),
  },

  // Intelligent Context Compressor
  compressor: {
    getStats: () => ipcRenderer.invoke("compressor:get-stats"),
    updateConfig: (payload) => ipcRenderer.invoke("compressor:update-config", payload),
    resetStats: () => ipcRenderer.invoke("compressor:reset-stats"),
    compressSession: (sessionId) => ipcRenderer.invoke("compressor:compress-session", { sessionId }),
    getContextTokens: (sessionId, draftText) => ipcRenderer.invoke("compressor:get-context-tokens", { sessionId, draftText }),
  },

  // Plugins & Tools
  plugins: {
    list: () => ipcRenderer.invoke("plugins:list"),
    toggle: (id, enabled) => ipcRenderer.invoke("plugins:toggle", { id, enabled }),
    installZip: (base64Data, filename) => ipcRenderer.invoke("plugins:install-zip", { base64Data, filename }),
    uninstall: (id) => ipcRenderer.invoke("plugins:uninstall", { id }),
    getUIExtensions: () => ipcRenderer.invoke("plugins:get-ui-extensions"),
    reload: () => ipcRenderer.invoke("plugins:reload"),
    export: (id) => ipcRenderer.invoke("plugins:export", { id }),
  },

  // Skills & Cognitive Directives
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    toggle: (id, enabled) => ipcRenderer.invoke("skills:toggle", { id, enabled }),
    save: (payload) => ipcRenderer.invoke("skills:save", payload),
    delete: (id) => ipcRenderer.invoke("skills:delete", { id }),
    setFilterMode: (mode) => ipcRenderer.invoke("skills:set-filter-mode", { mode }),
    testFilter: (prompt) => ipcRenderer.invoke("skills:test-filter", { prompt }),
    import: (content, filename) => ipcRenderer.invoke("skills:import", { content, filename }),
    export: (id) => ipcRenderer.invoke("skills:export", { id }),
    reset: () => ipcRenderer.invoke("skills:reset"),
  },

  // App Connectors (Blender, OBS, ComfyUI, etc.)
  connectors: {
    list: () => ipcRenderer.invoke("connectors:list"),
    readDocs: (id) => ipcRenderer.invoke("connectors:read-docs", { id }),
    save: (payload) => ipcRenderer.invoke("connectors:save", payload),
    toggle: (id, enabled) => ipcRenderer.invoke("connectors:toggle", { id, enabled }),
    test: (id, config) => ipcRenderer.invoke("connectors:test", { id, config }),
    delete: (id) => ipcRenderer.invoke("connectors:delete", { id }),
    installPackage: (payload) => ipcRenderer.invoke("connectors:install-package", payload),
    exportPackage: (id) => ipcRenderer.invoke("connectors:export-package", { id }),
    startCompanion: (id) => ipcRenderer.invoke("connectors:start-companion", { id }),
    stopCompanion: (id) => ipcRenderer.invoke("connectors:stop-companion", { id }),
    restartCompanion: (id) => ipcRenderer.invoke("connectors:restart-companion", { id }),
    getCompanionStatus: (id) => ipcRenderer.invoke("connectors:companion-status", { id }),
    blenderScript: () => ipcRenderer.invoke("connectors:blender-script"),
  },

  // Security Governance & Approvals
  security: {
    getSettings: () => ipcRenderer.invoke("security:get-settings"),
    updateSettings: (payload) => ipcRenderer.invoke("security:update-settings", payload),
    resolveApproval: (approvalId, decision) => ipcRenderer.invoke("security:resolve-approval", { approvalId, decision }),
    reset: () => ipcRenderer.invoke("security:reset"),
    clearWhitelist: (sessionId) => ipcRenderer.invoke("security:clear-whitelist", { sessionId }),
    revokePermission: (payload) => ipcRenderer.invoke("security:revoke-permission", payload),
  },

  // Session History Management
  sessions: {
    list: () => ipcRenderer.invoke("sessions:list"),
    create: (title) => ipcRenderer.invoke("sessions:create", { title }),
    setMode: (sessionId, mode) => ipcRenderer.invoke("sessions:set-mode", { sessionId, mode }),
    switch: (sessionId) => ipcRenderer.invoke("sessions:switch", { sessionId }),
    getMessages: (sessionId) => ipcRenderer.invoke("sessions:get-messages", { sessionId }),
    delete: (sessionId) => ipcRenderer.invoke("sessions:delete", { sessionId }),
    updateTitle: (sessionId, title) => ipcRenderer.invoke("sessions:update-title", { sessionId, title }),
  },

  // System Configuration (.env & config.yaml)
  systemConfig: {
    read: () => ipcRenderer.invoke("system-config:read"),
    save: (payload) => ipcRenderer.invoke("system-config:save", payload),
    openExternal: (payload) => ipcRenderer.invoke("system-config:open-external", payload),
  },

  // Artifacts & Media Storage
  artifacts: {
    list: () => ipcRenderer.invoke("artifacts:list"),
    getFile: (name) => ipcRenderer.invoke("artifacts:get-file", { name }),
    upload: (payload) => ipcRenderer.invoke("artifacts:upload", payload),
    delete: (name) => ipcRenderer.invoke("artifacts:delete", { name }),
    shareWeb: (name, isSandbox = false) => ipcRenderer.invoke("artifacts:share-web", { name, isSandbox }),
  },

  // Knowledge Base RAG
  kb: {
    documents: () => ipcRenderer.invoke("kb:documents"),
    upload: (payload) => ipcRenderer.invoke("kb:upload", payload),
  },

  // Sandbox Management
  sandbox: {
    files: () => ipcRenderer.invoke("sandbox:files"),
    getFile: (name) => ipcRenderer.invoke("sandbox:get-file", { name }),
    deleteFile: (name) => ipcRenderer.invoke("sandbox:delete-file", { name }),
    clean: () => ipcRenderer.invoke("sandbox:clean"),
  },

  // Generic Tool Execution
  tools: {
    execute: (payload) => ipcRenderer.invoke("tools:execute", payload),
  },

  // Text-to-Speech (Kokoro TTS)
  tts: {
    speak: (payload) => ipcRenderer.invoke("tts:speak", payload),
    getVoices: () => ipcRenderer.invoke("tts:get-voices"),
    getStatus: () => ipcRenderer.invoke("tts:get-status"),
    unload: () => ipcRenderer.invoke("tts:unload"),
    getModelStatus: () => ipcRenderer.invoke("tts:model-status"),
    downloadModel: () => ipcRenderer.invoke("tts:download-model"),
    deleteModel: () => ipcRenderer.invoke("tts:delete-model"),
  },

  // Speech-to-Text (Moonshine STT)
  stt: {
    transcribe: (payload) => ipcRenderer.invoke("stt:transcribe", payload),
    getStatus: () => ipcRenderer.invoke("stt:get-status"),
    getModelStatus: () => ipcRenderer.invoke("stt:model-status"),
    downloadModel: (payload) => ipcRenderer.invoke("stt:download-model", payload),
    deleteModel: () => ipcRenderer.invoke("stt:delete-model"),
    unload: () => ipcRenderer.invoke("stt:unload"),
  },

  // Personal Memory (3-Tier Sovereign Dossier)
  personalMemory: {
    getProfile: () => ipcRenderer.invoke("personal-memory:get-profile"),
    commitFact: (payload) => ipcRenderer.invoke("personal-memory:commit-fact", payload),
    deleteFact: (factId) => ipcRenderer.invoke("personal-memory:delete-fact", { factId }),
    deleteReflection: (reflectionId) => ipcRenderer.invoke("personal-memory:delete-reflection", { reflectionId }),
    revealFile: () => ipcRenderer.invoke("personal-memory:reveal-file"),
    wipe: () => ipcRenderer.invoke("personal-memory:wipe"),
  },

  // General Application Settings & Lifecycle
  general: {
    get: () => ipcRenderer.invoke("general-settings:get"),
    update: (key, value) => ipcRenderer.invoke("general-settings:update", { key, value }),
    quitApp: (force) => ipcRenderer.invoke("app:quit", { force }),
    getStartupSettings: () => ipcRenderer.invoke("system:get-startup-settings"),
    setStartupSettings: (payload) => ipcRenderer.invoke("system:set-startup-settings", payload),
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
