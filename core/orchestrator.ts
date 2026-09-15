/**
 * Orchestrator — Central Agent Reasoning Loop with RAG Vector Database.
 *
 * Implements the Plan → Execute → Observe cycle with automatic
 * knowledge base context injection:
 *
 *   1. Receive prompt from Interface
 *   2. **[AUTO-RAG] Query the Vector Store for relevant chunks**
 *   3. **[AUTO-RAG] Inject relevant context into an augmented prompt**
 *   4. Send augmented prompt + tool schemas to Gemini Adapter
 *   5. If text response → memorize → return to Interface
 *   6. If function call → execute via Plugin Manager → send result back → loop
 *
 * Also maintains session vector memory for conversation recall.
 */

import { isChatMode, isToolAllowedInMode, MODE_INSTRUCTIONS } from "./chat-mode.js";
import type { ChatMode } from "./types.js";
import { CONFIG, THINKING_PRESETS, type ThinkingLevel } from "./config.js";
import { PluginManager } from "./plugin-manager.js";
import { SessionVectorMemory } from "./session-memory.js";
import { StateManager } from "./state-manager.js";
import { VectorStore } from "./vector-store.js";
import { UniversalEmbedder } from "./embedder.js";
import { SecurityManager } from "./security-manager.js";
import { ContextCompressor } from "./context-compressor.js";
import { SkillsManager } from "./skills-manager.js";
import { PersonalMemoryManager } from "./personal-memory.js";
import type { LogLevel, OrchestratorConfig, ToolPlugin } from "./types.js";
import type {
  AIProvider,
  FunctionExecutionResponse,
} from "./ai-provider.js";
import { createAIProvider } from "../providers/provider-factory.js";

export interface ChatSessionInstance {
  sessionId: string;
  provider: AIProvider;
  stateManager: StateManager;
  abortController: AbortController | null;
  isExecuting: boolean;
  lastExecutionMeta: {
    usage?: import("./ai-provider.js").TokenUsage;
    elapsedMs: number;
    iterations: number;
    skills?: string[];
    canImplementPlan?: boolean;
  } | null;
  turnEmbeddingTokens: number;
  lastToolSignature?: string;
}

export class Orchestrator {
  private readonly config: OrchestratorConfig;
  private readonly pluginManager: PluginManager;
  private readonly stateManager: StateManager;
  private readonly sessionMemory: SessionVectorMemory;
  private readonly vectorStore: VectorStore;
  private readonly securityManager: SecurityManager;
  private readonly contextCompressor: ContextCompressor;
  private readonly skillsManager: SkillsManager;
  private readonly personalMemory: PersonalMemoryManager;
  private readonly provider: AIProvider;
  private readonly logCallback: (level: LogLevel, message: string) => void;
  private currentAbortController: AbortController | null = null;
  private turnEmbeddingTokens: number = 0;
  private sessionInstances = new Map<string, ChatSessionInstance>();
  private lastExecutionMeta: {
    usage?: import("./ai-provider.js").TokenUsage;
    elapsedMs: number;
    iterations: number;
    skills?: string[];
    canImplementPlan?: boolean;
  } | null = null;

  public getLastExecutionMeta(sessionId?: string) {
    if (sessionId) {
      return this.sessionInstances.get(sessionId)?.lastExecutionMeta ?? this.lastExecutionMeta;
    }
    return this.sessionInstances.get(this.sessionMemory.activeSessionId)?.lastExecutionMeta ?? this.lastExecutionMeta;
  }

  public getSecurityManager(): SecurityManager {
    return this.securityManager;
  }

  public getContextCompressor(): ContextCompressor {
    return this.contextCompressor;
  }

  public getSkillsManager(): SkillsManager {
    return this.skillsManager;
  }

  public getPersonalMemory(): PersonalMemoryManager {
    return this.personalMemory;
  }

  public addEmbeddingTokens(tokens: number) {
    this.turnEmbeddingTokens += tokens;
  }

  constructor(
    config: Partial<OrchestratorConfig> & { apiKey?: string } = {},
    logCallback?: (level: LogLevel, message: string) => void,
    customProvider?: AIProvider
  ) {
    this.provider =
      customProvider ||
      createAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        provider: config.provider as any,
      });

    this.config = {
      apiKey: config.apiKey,
      model: this.provider.model,
      provider: this.provider.providerType,
      systemPrompt: config.systemPrompt ?? CONFIG.DEFAULT_SYSTEM_PROMPT,
      maxToolIterations:
        config.maxToolIterations ?? CONFIG.DEFAULT_MAX_TOOL_ITERATIONS,
      verbose: config.verbose ?? true,
    };

    this.pluginManager = PluginManager.getInstance();
    this.securityManager = SecurityManager.getInstance();
    this.contextCompressor = ContextCompressor.getInstance();
    this.skillsManager = SkillsManager.getInstance();
    this.personalMemory = PersonalMemoryManager.getInstance();
    this.stateManager = new StateManager();
    this.sessionMemory = new SessionVectorMemory();
    this.vectorStore = new VectorStore();
    this.pluginManager.setSharedVectorStore(this.vectorStore);

    this.logCallback = logCallback ?? (() => {});

    // Wire up Plugin Manager events for observability
    this.pluginManager.on("tool:registered", (name: string) => {
      this.log("info", `🔧 Tool registered: ${name}`);
    });
    this.pluginManager.on(
      "tool:executing",
      (name: string, args: Record<string, unknown>) => {
        this.log("tool", `⚙️  Executing tool: ${name}(${JSON.stringify(args)})`);
      }
    );
    this.pluginManager.on(
      "tool:completed",
      (name: string, _result: Record<string, unknown>) => {
        this.log("success", `✅ Tool completed: ${name}`);
      }
    );
    this.pluginManager.on(
      "tool:error",
      (name: string, error: Record<string, unknown>) => {
        this.log("error", `❌ Tool error: ${name} — ${JSON.stringify(error)}`);
      }
    );
  }

  /** Get the Plugin Manager for external tool registration. */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /** Get the shared Vector Store instance (for plugin sharing). */
  getVectorStore(): VectorStore {
    return this.vectorStore;
  }

  /** Get the Session Vector Memory instance. */
  getSessionMemory(): SessionVectorMemory {
    return this.sessionMemory;
  }

  public get activeSessionId(): string {
    return this.sessionMemory.activeSessionId;
  }

  public getOrCreateSessionInstance(sessionId: string, mode: ChatMode = this.sessionMemory.getSessionMode(sessionId)): ChatSessionInstance {
    let instance = this.sessionInstances.get(sessionId);
    if (instance?.isExecuting) return instance;
    const preset = this.thinkingPreset;
    const augmentedSystemPrompt = `${this.config.systemPrompt}\n\n${MODE_INSTRUCTIONS[mode]}\n\n─── Cognitive Reasoning Mode: ${preset.name.toUpperCase()} ───\n${preset.cotPrompt}`;
    const toolSchemas = this.pluginManager.getToolSchemas().filter(tool => isToolAllowedInMode(mode, tool.name));
    const currentToolSignature = this.pluginManager.getToolNames().sort().join(",") + ":" + preset.name + ":" + mode;

    if (!instance) {
      const provider =
        this.provider && this.provider.providerType === "custom"
          ? this.provider
          : createAIProvider({
              apiKey: this.config.apiKey,
              model: this.config.model,
              provider: this.config.provider as any,
            });

      instance = {
        sessionId,
        provider,
        stateManager: new StateManager(),
        abortController: null,
        isExecuting: false,
        lastExecutionMeta: null,
        turnEmbeddingTokens: 0,
        lastToolSignature: currentToolSignature,
      };

      // Load past turns from SQLite session memory into this instance
      const past = this.sessionMemory.getSessionMessages(sessionId);
      for (const msg of past) {
        if (msg.role === "user") instance.stateManager.appendUserMessage(msg.content);
        else instance.stateManager.appendModelMessage(msg.content);
      }

      instance.provider.createChat(augmentedSystemPrompt, toolSchemas);
      const historyToLoad = this.contextCompressor.compressHistory(
        past.map((m) => ({ role: m.role, content: m.content }))
      );
      instance.provider.loadConversationHistory(historyToLoad);

      this.sessionInstances.set(sessionId, instance);
    } else if (instance.lastToolSignature !== currentToolSignature) {
      // Hot-synchronize newly enabled or registered tools into existing session
      const past = this.sessionMemory.getSessionMessages(sessionId);
      instance.provider.createChat(augmentedSystemPrompt, toolSchemas);
      const historyToLoad = this.contextCompressor.compressHistory(
        past.map((m) => ({ role: m.role, content: m.content }))
      );
      instance.provider.loadConversationHistory(historyToLoad);
      instance.lastToolSignature = currentToolSignature;
      this.log("info", `🔄 Hot-synchronized tool declarations (${toolSchemas.length} tools) for session instance [${sessionId}].`);
    }
    return instance;
  }

  public createSession(title?: string) {
    const session = this.sessionMemory.createSession(title);
    this.getOrCreateSessionInstance(session.id);
    this.log("info", `💬 Created new independent chat session instance: "${session.title}" (${session.id})`);
    return session;
  }

  public switchSession(newSessionId: string) {
    this.sessionMemory.switchSession(newSessionId);
    this.getOrCreateSessionInstance(newSessionId);
    this.log("info", `💬 Switched active chat session to: ${newSessionId}`);
    return true;
  }

  /**
   * Rebuild the provider's internal conversation history (and the local
   * StateManager) from the persisted session turns so that past context
   * is restored without re-calling the model.
   */
  private rehydrateSession(sessionId: string): void {
    const instance = this.getOrCreateSessionInstance(sessionId);
    const past = this.sessionMemory.getSessionMessages(sessionId);
    instance.stateManager.clear();
    for (const msg of past) {
      if (msg.role === "user") instance.stateManager.appendUserMessage(msg.content);
      else instance.stateManager.appendModelMessage(msg.content);
    }
    const historyToLoad = this.contextCompressor.compressHistory(
      past.map((m) => ({ role: m.role, content: m.content }))
    );
    instance.provider.loadConversationHistory(historyToLoad);
  }

  /**
   * Explicitly compact/compress the context history for a given session.
   * Compresses intermediate turns and updates the active AI provider's conversation history.
   */
  public compressSessionContext(sessionId?: string): {
    success: boolean;
    sessionId?: string;
    originalTurns: number;
    compressedTurns: number;
    originalTokensEstimate: number;
    compressedTokensEstimate: number;
    tokensSaved: number;
    summaryGenerated: boolean;
  } {
    const sid = sessionId || this.sessionMemory.activeSessionId;
    if (!sid) {
      return {
        success: false,
        originalTurns: 0,
        compressedTurns: 0,
        originalTokensEstimate: 0,
        compressedTokensEstimate: 0,
        tokensSaved: 0,
        summaryGenerated: false,
      };
    }

    const instance = this.getOrCreateSessionInstance(sid);
    const past = this.sessionMemory.getSessionMessages(sid);
    const rawHistory = past.map((m) => ({ role: m.role as "user" | "model", content: m.content }));

    let originalTokens = 0;
    for (const msg of rawHistory) {
      originalTokens += this.contextCompressor.estimateTokens(msg.content);
    }

    // For manual triggers, compact if history is longer than 3 turns or exceeds maxHistoryTurns
    const maxTurns = rawHistory.length > 3 ? Math.min(rawHistory.length - 1, this.contextCompressor.getConfig().maxHistoryTurns) : undefined;
    const preserveRecent = rawHistory.length > 3 ? Math.min(2, this.contextCompressor.getConfig().preserveRecentTurns) : undefined;

    const compressed = this.contextCompressor.compressHistory(rawHistory, maxTurns, preserveRecent, sid);

    let compressedTokens = 0;
    for (const msg of compressed) {
      compressedTokens += this.contextCompressor.estimateTokens(msg.content);
    }

    // Load newly compressed history into provider
    instance.provider.loadConversationHistory(compressed);

    const tokensSaved = Math.max(0, originalTokens - compressedTokens);
    const summaryGenerated = compressed.length < rawHistory.length;

    this.log("info", `🗜️ Context Compressor compacted session [${sid}]: ${rawHistory.length} -> ${compressed.length} turns, saved ~${tokensSaved} tokens.`);

    return {
      success: true,
      sessionId: sid,
      originalTurns: rawHistory.length,
      compressedTurns: compressed.length,
      originalTokensEstimate: originalTokens,
      compressedTokensEstimate: compressedTokens,
      tokensSaved,
      summaryGenerated,
    };
  }

  /**
   * Get the real-time context token usage for a session, including past history turns,
   * any active draft prompt text, token limit budget, and percentage used.
   */
  public getSessionContextTokens(sessionId?: string, draftText?: string): {
    success: boolean;
    sessionId: string;
    historyTokens: number;
    draftTokens: number;
    totalTokens: number;
    maxPromptTokens: number;
    percentUsed: number;
    turnsCount: number;
    tokensSaved: number;
  } {
    const sid = sessionId || this.sessionMemory.activeSessionId || "default";
    const past = this.sessionMemory.getSessionMessages(sid);
    let historyTokens = 0;
    for (const msg of past) {
      historyTokens += this.contextCompressor.estimateTokens(msg.content);
    }
    const draftTokens = draftText ? this.contextCompressor.estimateTokens(draftText) : 0;
    const maxPromptTokens = this.contextCompressor.getConfig().maxPromptTokens || 8192;
    const totalTokens = historyTokens + draftTokens;
    const percentUsed = Math.min(100, Math.round((totalTokens / maxPromptTokens) * 100));

    return {
      success: true,
      sessionId: sid,
      historyTokens,
      draftTokens,
      totalTokens,
      maxPromptTokens,
      percentUsed,
      turnsCount: past.length,
      tokensSaved: this.contextCompressor.getSessionTokensSaved(sid),
    };
  }

  public listSessions() {
    return this.sessionMemory.listSessions();
  }

  public updateSessionTitle(sessionId: string, title: string): boolean {
    this.sessionMemory.updateSessionTitle(sessionId, title);
    this.log("info", `🏷️ Updated chat session title [${sessionId}]: "${title}"`);
    return true;
  }

  public getSessionMessages(sessionId: string) {
    return this.sessionMemory.getSessionMessages(sessionId);
  }

  public deleteSession(sessionId: string) {
    const instance = this.sessionInstances.get(sessionId);
    if (instance?.abortController) {
      instance.abortController.abort();
    }
    this.sessionInstances.delete(sessionId);
    this.contextCompressor.clearSessionTokensSaved(sessionId);
    const deleted = this.sessionMemory.deleteSession(sessionId);
    if (deleted) {
      this.rehydrateSession(this.sessionMemory.activeSessionId);
    }
    this.log("info", `🗑️ Deleted chat session: ${sessionId}`);
    return deleted;
  }

  public get activeProvider(): string {
    return this.provider.providerType;
  }

  public get activeModel(): string {
    return this.provider.model;
  }

  public get activeEmbeddingModel(): string {
    return UniversalEmbedder.getInstance().embeddingModel || this.provider.embeddingModel;
  }

  public get activeEmbeddingProvider(): string {
    return UniversalEmbedder.getInstance().embeddingProvider || this.provider.providerType;
  }

  public setEmbeddingModel(embeddingModel: string, provider?: any): void {
    UniversalEmbedder.getInstance().setEmbeddingModel(embeddingModel, provider);
    this.log(
      "info",
      `🔮 Embedding model switched to: ${this.activeEmbeddingModel} (${this.activeEmbeddingProvider.toUpperCase()})`
    );
  }

  public setProvider(provider: AIProvider): void {
    (this as any).provider = provider;
    this.config.apiKey = undefined;
    this.config.model = provider.model;
    this.config.provider = provider.providerType;
    this.sessionInstances.clear();
    UniversalEmbedder.getInstance().setProvider(provider);
    this.initialize();
  }

  /** Invalidate all active session chat instances so fresh providers are constructed. */
  public clearSessionInstances(): void {
    this.sessionInstances.clear();
  }

  private currentThinkingLevel: ThinkingLevel = CONFIG.THINKING.DEFAULT_LEVEL;

  public get thinkingLevel(): ThinkingLevel {
    return this.currentThinkingLevel;
  }

  public get thinkingPreset() {
    return THINKING_PRESETS[this.currentThinkingLevel] || THINKING_PRESETS.high;
  }

  public setThinkingLevel(level: ThinkingLevel): void {
    if (THINKING_PRESETS[level]) {
      this.currentThinkingLevel = level;
      this.sessionInstances.clear();
      this.initialize();
      this.log(
        "info",
        `🧠 Cognitive Thinking Mode set to: ${this.thinkingPreset.name} (Max Tool Iterations: ${this.thinkingPreset.maxToolIterations})`
      );
    }
  }

  /** Safely abort the currently running prompt execution for a specific session (or all). */
  abortCurrentExecution(sessionId?: string): boolean {
    if (sessionId) {
      const instance = this.sessionInstances.get(sessionId);
      if (instance && instance.abortController) {
        instance.abortController.abort();
        instance.abortController = null;
        instance.isExecuting = false;
        this.log("info", `🛑 Execution for session [${sessionId}] stopped safely by user.`);
        return true;
      }
      return false;
    }

    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    let stoppedAny = false;
    for (const [sid, inst] of this.sessionInstances.entries()) {
      if (inst.isExecuting) continue;
      if (inst.abortController) {
        inst.abortController.abort();
        inst.abortController = null;
        inst.isExecuting = false;
        stoppedAny = true;
        this.log("info", `🛑 Execution for session [${sid}] stopped safely by user.`);
      }
    }
    return stoppedAny;
  }

  /** Register a tool plugin with the Plugin Manager. */
  registerPlugin(plugin: ToolPlugin, enabled = true): void {
    this.pluginManager.registerPlugin(plugin, enabled);
  }

  /**
   * Hot plug/unplug a plugin at runtime.
   * Immediately reinitializes the AI model's chat session with updated tool declarations.
   */
  setPluginEnabled(pluginId: string, enabled: boolean): boolean {
    const success = this.pluginManager.setPluginEnabled(pluginId, enabled);
    if (success) {
      this.initialize();
      this.log(
        "info",
        `🔌 Plugin "${pluginId}" was ${enabled ? "HOT PLUGGED (Enabled)" : "UNPLUGGED (Disabled)"} in real-time. Active tool count: ${this.pluginManager.getToolSchemas().length}`
      );
    }
    return success;
  }

  /** Get structured info for all registered tool plugins. */
  getPluginsInfo(): import("./types.js").PluginInfo[] {
    return this.pluginManager.getPluginsInfo();
  }

  /** Get active UI extensions for all enabled plugins. */
  getActiveUIExtensions(): import("./types.js").UIExtensionManifest[] {
    return this.pluginManager.getActiveUIExtensions();
  }

  /** Load a modular directory plugin bundle. */
  loadPluginFromDirectory(dirPath: string, persist = false): { success: boolean; plugin?: import("./types.js").PluginInfo; error?: string } {
    const result = this.pluginManager.loadPluginFromDirectory(dirPath, persist);
    if (result.success) {
      this.initialize();
      this.log("info", `📦 Loaded directory plugin bundle: "${result.plugin?.name}" (${result.plugin?.id})`);
    }
    return result;
  }

  /**
   * Install a custom plugin from a .zip package buffer or file path.
   */
  installPluginFromZip(
    zipInput: Buffer | string,
    persist = true
  ): { success: boolean; plugin?: import("./types.js").PluginInfo; error?: string } {
    const result = this.pluginManager.installPluginFromZip(zipInput, persist);
    if (result.success) {
      this.initialize();
      this.log("info", `📦 Installed plugin from ZIP package: "${result.plugin?.name}" (${result.plugin?.id})`);
    }
    return result;
  }

  /**
   * Install a custom plugin from a .aiplugin / .plugin.json manifest.
   * Immediately reinitializes the active LLM session with new tool definitions.
   */
  installPluginFromManifest(
    manifestInput: any,
    persist = true
  ): { success: boolean; plugin?: import("./types.js").PluginInfo; error?: string } {
    const result = this.pluginManager.installPluginFromManifest(manifestInput, persist);
    if (result.success) {
      this.initialize();
      this.log("info", `📦 Installed and activated custom plugin: "${result.plugin?.name}" (${result.plugin?.id})`);
    }
    return result;
  }

  /**
   * Completely uninstall a custom plugin and refresh active tools.
   */
  async uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.pluginManager.uninstallPlugin(pluginId);
    if (result.success) {
      this.initialize();
      this.log("info", `🗑️ Uninstalled custom plugin: "${pluginId}"`);
    }
    return result;
  }

  /** Export plugin as a downloadable ZIP package. */
  exportPluginZip(pluginId: string): Buffer | null {
    return this.pluginManager.exportPluginZip(pluginId);
  }

  /** Export plugin manifest for downloading. */
  exportPluginManifest(pluginId: string): import("./types.js").PluginManifest | null {
    return this.pluginManager.exportPluginManifest(pluginId);
  }

  public getTools(): Array<{ name: string; description: string }> {
    return this.pluginManager.getToolSchemas().map((s) => ({
      name: s.name,
      description: s.description,
    }));
  }

  /**
   * Initialize the AI chat session with registered plugins and active thinking mode.
   * Must be called after all plugins are registered.
   */
  initialize(): void {
    const toolSchemas = this.pluginManager.getToolSchemas();
    const preset = this.thinkingPreset;

    // Dynamically adjust loop iterations based on thinking depth
    this.config.maxToolIterations = preset.maxToolIterations;

    // Inject universal cognitive CoT framework
    const augmentedSystemPrompt = `${this.config.systemPrompt}\n\n─── Cognitive Reasoning Mode: ${preset.name.toUpperCase()} ───\n${preset.cotPrompt}`;

    this.provider.createChat(augmentedSystemPrompt, toolSchemas);

    // Sync active session instances so newly added or toggled tools are immediately accessible
    const currentToolSignature = this.pluginManager.getToolNames().sort().join(",") + ":" + preset.name;
    for (const [sid, inst] of this.sessionInstances.entries()) {
      const past = this.sessionMemory.getSessionMessages(sid);
      inst.provider.createChat(augmentedSystemPrompt, toolSchemas);
      const historyToLoad = this.contextCompressor.compressHistory(
        past.map((m) => ({ role: m.role, content: m.content }))
      );
      inst.provider.loadConversationHistory(historyToLoad);
      inst.lastToolSignature = currentToolSignature;
    }

    // Restore past conversation context for the now-active session.
    this.rehydrateSession(this.sessionMemory.activeSessionId);

    const memInfo = this.sessionMemory.getSessionInfo();
    const storeStats = this.vectorStore.getStats();

    this.log(
      "info",
      `🚀 Orchestrator initialized [${this.provider.providerType.toUpperCase()}] Model: ${this.provider.model} (Embedding: ${this.provider.embeddingModel}) [Thinking: ${preset.badge}]`
    );
    this.log(
      "info",
      `📦 ${toolSchemas.length} tool(s) available: ${this.pluginManager.getToolNames().join(", ") || "(none)"}`
    );
    this.log(
      "info",
      `🧠 Session memory: ${memInfo.totalTurns} turn(s) from ${memInfo.persistPath}`
    );
    this.log(
      "info",
      `📚 Knowledge base: ${storeStats.totalDocuments} document(s), ${storeStats.totalChunks} chunk(s) in ${storeStats.persistPath}`
    );
  }

  /**
   * Process a user prompt through the full reasoning loop.
   */
  async processPrompt(
    userInput: string,
    externalSignal?: AbortSignal,
    sessionId?: string,
    requestedMode?: ChatMode
  ): Promise<string> {
    const startTime = Date.now();
    const sid = sessionId || this.sessionMemory.activeSessionId;
    if (requestedMode !== undefined && !isChatMode(requestedMode)) throw new Error("Invalid chat mode");
    if (this.sessionInstances.get(sid)?.isExecuting) throw new Error("Session is already running");
    const mode = requestedMode ?? this.sessionMemory.getSessionMode(sid);
    this.sessionMemory.setSessionMode(sid, mode);
    const instance = this.getOrCreateSessionInstance(sid, mode);

    instance.isExecuting = true;
    instance.lastExecutionMeta = null;
    this.lastExecutionMeta = null;
    let turnHadError = false;
    instance.turnEmbeddingTokens = 0;
    instance.abortController = new AbortController();
    const abortSignal = externalSignal || instance.abortController.signal;

    instance.stateManager.appendUserMessage(userInput);
    this.log("info", `💬 Prompt received [${sid}]: "${userInput.slice(0, 160)}${userInput.length > 160 ? "..." : ""}"`);

    // Auto-update session title from first prompt
    const sessions = this.sessionMemory.listSessions();
    const currentSes = sessions.find((s) => s.id === sid);
    if (currentSes && (currentSes.title === "New Chat" || currentSes.title === "Initial Chat" || currentSes.title === "Chat Session")) {
      const cleanTitle = userInput
        .replace(/\[User attached and embedded[^\]]*\]\s*/g, "")
        .replace(/^#+\s*/, "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 36)
        .trim() || "Chat Session";
      this.sessionMemory.updateSessionTitle(sid, cleanTitle);
    }

    try {
      if (abortSignal.aborted) {
        throw new Error("Generation stopped by user.");
      }

      const contextParts: string[] = [];

      // ─── AUTO-RAG: Query the Vector Store ─────────────────────
      if (
        CONFIG.RAG.AUTO_QUERY_ENABLED &&
        this.pluginManager.isPluginEnabled("rag") &&
        this.vectorStore.totalChunks > 0
      ) {
        try {
          instance.turnEmbeddingTokens += Math.ceil(userInput.length / 4);
          this.turnEmbeddingTokens += Math.ceil(userInput.length / 4);
          const kbResults = await this.vectorStore.query(userInput);

          if (kbResults.length > 0) {
            const kbContext = this.vectorStore.formatContextForPrompt(kbResults);
            contextParts.push(kbContext);

            const sources = [
              ...new Set(kbResults.map((r) => r.chunk.sourceDocument)),
            ];
            this.log(
              "info",
              `📚 Auto-RAG: ${kbResults.length} relevant chunk(s) retrieved from [${sources.join(", ")}]`
            );
          }
        } catch (kbErr) {
          turnHadError = true;
          this.log(
            "error",
            `⚠️ Knowledge base auto-query failed: ${kbErr instanceof Error ? kbErr.message : String(kbErr)}`
          );
        }
      }

      if (abortSignal.aborted) {
        throw new Error("Generation stopped by user.");
      }

      // ─── Session Memory: Recall past conversation context ─────
      try {
        instance.turnEmbeddingTokens += Math.ceil(userInput.length / 4);
        this.turnEmbeddingTokens += Math.ceil(userInput.length / 4);
        const { context, turnCount } =
          await this.sessionMemory.recall(userInput, sid);
        if (turnCount > 0) {
          contextParts.push(context);
          this.log(
            "info",
            `🧠 Session Memory: Recalled ${turnCount} relevant turn(s) for session ${sid}`
          );
        }
      } catch (recallErr) {
          turnHadError = true;
        this.log(
          "error",
          `⚠️ Session memory recall failed: ${recallErr instanceof Error ? recallErr.message : String(recallErr)}`
        );
      }

      // ─── Build the augmented prompt ───────────────────────────
      let augmentedInput: string;

      if (contextParts.length > 0) {
        augmentedInput = this.contextCompressor.compressPromptContext(
          contextParts,
          userInput,
          undefined,
          sid
        );
      } else {
        augmentedInput = userInput;
      }

      // ─── Cognitive Skills & Directives (Filtered or Always Active) ───
      const { promptSection: skillsSection, activeSkills } =
        this.skillsManager.buildSkillsPromptSection(userInput);
      const appliedSkillNames = activeSkills.map((s) => s.name);
      if (activeSkills.length > 0) {
        this.log(
          "info",
          `🧠 Applied Cognitive Skills (${activeSkills.length}): ${appliedSkillNames.join(", ")}`
        );
        augmentedInput = `${augmentedInput}\n\n${skillsSection}`;
      }

      // ─── Sovereign Personal Memory Sanctuary Context ─────────
      const memoryContext = this.personalMemory.buildMemoryPromptContext(userInput);
      if (memoryContext) {
        augmentedInput = `${augmentedInput}\n\n${memoryContext}`;
      }

      // ─── Memorize the user's input (fire-and-forget) ──────────
      this.sessionMemory.memorize("user", userInput, sid).catch((err) => {
        turnHadError = true;
        this.log("error", `⚠️ Failed to memorize user message: ${err instanceof Error ? err.message : String(err)}`);
      });

      if (abortSignal.aborted) {
        throw new Error("Generation stopped by user.");
      }

      // ─── Send to AI Provider (Session Instance) ───────────────
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalTokens = 0;

      const trackUsage = (u?: import("./ai-provider.js").TokenUsage) => {
        if (u) {
          if (u.promptTokens) totalPromptTokens += u.promptTokens;
          if (u.completionTokens) totalCompletionTokens += u.completionTokens;
          if (u.totalTokens) totalTokens += u.totalTokens;
        }
      };

      this.log("info", `🤖 Calling ${instance.provider.providerType.toUpperCase()} (${instance.provider.model}) for session [${sid}]...`);
      let result = await instance.provider.sendMessage(augmentedInput);
      trackUsage(result.usage);
      let iterations = 0;

      // Tool-calling loop
      let lastFunctionResponses: FunctionExecutionResponse[] = [];

      while (
        result.functionCalls.length > 0 &&
        iterations < this.config.maxToolIterations
      ) {
        if (abortSignal.aborted) {
          this.log("info", "🛑 Loop aborted safely before next tool execution.");
          break;
        }

        iterations++;
        this.log(
          "info",
          `🔄 Tool loop iteration ${iterations}/${this.config.maxToolIterations}: ${result.functionCalls.length} tool call(s) requested`
        );

        // Execute all requested tool calls
        const functionResponses: FunctionExecutionResponse[] = [];

        for (const call of result.functionCalls) {
          if (abortSignal.aborted) break;

          // Enforce the captured turn mode even if the model requests a hidden tool.
          if (!isToolAllowedInMode(mode, call.name)) {
            turnHadError = true;
            functionResponses.push({ id: call.id, name: call.name, response: {
              error: `Tool "${call.name}" is unavailable in ${mode} mode. Switch to Code mode to execute it.`,
            } });
            continue;
          }

          // 1. Evaluate Security & Governance Policy
          const secEval = this.securityManager.evaluateToolExecution(call.name, sid);

          if (secEval.action === "deny") {
            turnHadError = true;
            this.log("error", `🛡️ Blocked: ${call.name} (Security policy denied ${secEval.capability.toUpperCase()})`);
            functionResponses.push({
              id: call.id,
              name: call.name,
              response: {
                error: `Tool "${call.name}" execution is BLOCKED by security policy (${secEval.capability.toUpperCase()} capability is disabled in Settings > Security).`,
              },
            });
            continue;
          }

          if (secEval.action === "ask") {
            this.log("tool", `🛡️ Approval required for: ${call.name} [Risk: ${secEval.riskLevel.toUpperCase()}]`);
            const decision = await this.securityManager.requestApproval(call.name, call.args, sid);
            if (abortSignal.aborted || decision === "deny") {
              turnHadError = true;
              this.log("error", `❌ Denied: User rejected execution of "${call.name}"`);
              functionResponses.push({
                id: call.id,
                name: call.name,
                response: {
                  error: `User REJECTED execution of tool "${call.name}". Please formulate your response without invoking this tool or ask the user for guidance.`,
                },
              });
              continue;
            }
            this.log("success", `✅ Approved: User permitted execution of "${call.name}"`);
          }

          this.log("tool", `⚙️  Executing: ${call.name}(${JSON.stringify(call.args)})`);
          const execResult = await this.pluginManager.executeTool(
            call.name,
            call.args,
            { sessionId: sid }
          );
          if (execResult.response.error || execResult.response.success === false) turnHadError = true;
          const preview = typeof execResult.response === "string" ? execResult.response : JSON.stringify(execResult.response);
          this.log("success", `✅ Completed: ${call.name} -> Output: ${preview.slice(0, 120)}${preview.length > 120 ? "..." : ""}`);

          functionResponses.push({
            id: call.id,
            name: execResult.name,
            response: execResult.response,
          });
        }

        lastFunctionResponses = functionResponses;

        if (abortSignal.aborted) {
          this.log("info", "🛑 Loop aborted safely before tool response synthesis.");
          break;
        }

        // Send results back to AI Provider for the next cycle
        const responsesToSend = this.contextCompressor.compressFunctionResponses(functionResponses, undefined, sid);
        this.log("info", `🔄 Sending ${responsesToSend.length} function response(s) back to model for [${sid}]...`);
        result = await instance.provider.sendFunctionResponses(responsesToSend);
        trackUsage(result.usage);

        // If the model executed tools (e.g. record_reasoning_step, record_thinking) but returned no text, request final response
        if (!result.text && result.functionCalls.length === 0 && functionResponses.length > 0) {
          try {
            this.log("info", `📝 Requesting conversational synthesis following tool execution for [${sid}]...`);
            const synthResult = await instance.provider.sendMessage(
              "Please provide your complete answer or follow-up response to the user based on the tool results and reasoning above."
            );
            if (synthResult.text) {
              result = synthResult;
              trackUsage(synthResult.usage);
            }
          } catch {
            // Non-fatal
          }
        }

        // Forced final answer on iteration cap
        if (
          iterations >= this.config.maxToolIterations &&
          result.functionCalls.length > 0
        ) {
          this.log(
            "info",
            `⚠️ Iteration limit reached (${this.config.maxToolIterations}). Forcing final answer...`
          );
          try {
            const forcedResult = await instance.provider.sendMessage(
              "Please provide your final, comprehensive answer to the user based on all information and tool execution results collected above. Do not invoke any further tools."
            );
            if (forcedResult.text) {
              result = forcedResult;
              trackUsage(result.usage);
            }
          } catch {
            turnHadError = true;
            // Keep partial output available, but never offer to implement it.
          }
        }
      }

      if (abortSignal.aborted) throw new Error("Generation stopped by user.");
      if (result.functionCalls.length > 0 || /length|max_tokens|content_filter|safety|recitation/i.test(result.finishReason || "")) {
        turnHadError = true;
      }
      let finalText = result.text;
      if (!finalText?.trim()) turnHadError = true;
      if (!finalText) {
        const thinkingResp = lastFunctionResponses.find((r: FunctionExecutionResponse) => r.name === "record_reasoning_step" || r.name === "record_thinking");
        if (thinkingResp && typeof thinkingResp.response === "object") {
          const tResp = thinkingResp.response as any;
          if (tResp.thought) {
            finalText = `🧠 **Reasoning Recorded:**\n${tResp.thought}${tResp.action_plan ? `\n\n**Next Action Plan:** ${tResp.action_plan}` : ""}`;
          }
        }
      }
      if (!finalText) {
        finalText = "(No response text — the model may need more context.)";
      }
      const elapsedMs = Date.now() - startTime;

      const llmTokens = totalTokens || totalPromptTokens + totalCompletionTokens;
      const combinedTotalTokens = llmTokens + instance.turnEmbeddingTokens;

      const executionMeta = {
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: combinedTotalTokens,
          embeddingTokens: instance.turnEmbeddingTokens,
          embeddingModel: instance.provider.embeddingModel || "embedding",
        },
        elapsedMs,
        iterations,
        skills: appliedSkillNames,
        canImplementPlan: mode === "plan" && !turnHadError,
      };

      instance.lastExecutionMeta = executionMeta;
      this.lastExecutionMeta = executionMeta;

      this.log("info", `⚡ [${sid}] Response completed in ${elapsedMs}ms (${finalText.length} chars, ~${llmTokens} LLM tokens + ${instance.turnEmbeddingTokens} embedding tokens)`);

      instance.stateManager.appendModelMessage(finalText);

      // ─── Memorize the model's response ──────
      await this.sessionMemory.memorize("model", finalText, sid).catch((err) => {
        turnHadError = true;
        this.log("error", `⚠️ Failed to memorize model response: ${err instanceof Error ? err.message : String(err)}`);
      });

      // ─── Observe turn for Personal Memory (Tier 1 & Tier 2) ───
      try {
        this.personalMemory.observeTurn(userInput, finalText, sid);
      } catch (memErr) {
          turnHadError = true;
        this.log("error", `⚠️ Personal memory observation failed: ${memErr instanceof Error ? memErr.message : String(memErr)}`);
      }

      executionMeta.canImplementPlan = executionMeta.canImplementPlan && !turnHadError;
      return finalText;
    } catch (err) {
      if (abortSignal.aborted) {
        this.log("info", `🛑 Process for session [${sid}] aborted safely.`);
        throw new Error("Generation stopped by user.");
      }
      let errorMsg = err instanceof Error ? err.message : String(err);
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed?.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // Not JSON
      }
      this.log("error", `❌ Orchestrator error [${sid}]: ${errorMsg}`);
      if (
        errorMsg.includes("API key not valid") ||
        errorMsg.includes("API_KEY_INVALID") ||
        errorMsg.includes("401") ||
        errorMsg.includes("403") ||
        errorMsg.includes("not found") ||
        errorMsg.includes("no longer available")
      ) {
        this.sessionInstances.delete(sid);
      }
      throw err instanceof Error ? err : new Error(errorMsg);
    } finally {
      instance.isExecuting = false;
      instance.abortController = null;
      this.currentAbortController = null;
    }
  }

  /** Clear conversation state, session memory, and reinitialize the chat. */
  reset(): void {
    this.sessionInstances.clear();
    this.stateManager.clear();
    this.sessionMemory.clear();
    this.initialize();
    this.log(
      "info",
      "🔄 Orchestrator reset — conversation and session memory cleared. Knowledge base preserved."
    );
  }

  /** Clear all temporary conversation memory turns across all sessions and reset to a fresh state. */
  clearAllSessionCache(): void {
    this.sessionInstances.clear();
    this.stateManager.clear();
    this.sessionMemory.clearAll();
    this.contextCompressor.resetStats();
    try {
      const toolSchemas = this.pluginManager.getToolSchemas();
      const preset = this.thinkingPreset;
      const augmentedSystemPrompt = `${this.config.systemPrompt}\n\n─── Cognitive Reasoning Mode: ${preset.name.toUpperCase()} ───\n${preset.cotPrompt}`;
      this.provider.createChat(augmentedSystemPrompt, toolSchemas);
    } catch {}
    this.log(
      "info",
      "🧹 Cleared all temporary conversation turns and session cache across all sessions. Knowledge base & Sovereign Memory preserved."
    );
  }

  /**
   * Clear active working memory context for a specific session only.
   * Reinitializes LLM chat session and clears turn memory for this session,
   * preserving global state and other session contexts.
   */
  resetSessionContext(sessionId?: string): void {
    const sid = sessionId || this.activeSessionId;
    const inst = this.sessionInstances.get(sid);
    if (inst) {
      inst.stateManager.clear();
      const preset = THINKING_PRESETS[this.currentThinkingLevel] || THINKING_PRESETS.high;
      const augmentedSystemPrompt = `${this.config.systemPrompt}\n\n─── Cognitive Reasoning Mode: ${preset.name.toUpperCase()} ───\n${preset.cotPrompt}`;
      const toolSchemas = this.pluginManager.getToolSchemas();
      inst.provider.createChat(augmentedSystemPrompt, toolSchemas);
      inst.lastToolSignature = ""; // Reapply the selected mode before the next turn.
      inst.turnEmbeddingTokens = 0;
    }
    this.sessionMemory.clear(sid);
    this.contextCompressor.clearSessionTokensSaved(sid);
    this.log(
      "info",
      `🧹 Cleared active LLM working memory context for session [${sid}]. Visual history preserved.`
    );
  }

  /** Hot reload all custom plugins from disk and DB. */
  public async reloadPlugins() {
    return this.pluginManager.reloadCustomPlugins();
  }

  /** Test a custom tool in sandbox execution without installing. */
  public async testCustomTool(toolDef: any, params: any) {
    return this.pluginManager.testCustomTool(toolDef, params);
  }

  /** Internal logging helper. */
  private log(level: LogLevel, message: string): void {
    if (this.config.verbose) {
      this.logCallback(level, message);
    }
  }
}
