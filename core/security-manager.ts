import { EventEmitter } from "events";
import { AgentDatabase } from "./database.js";
import type {
  SecurityAutonomyMode,
  PermissionAction,
  CapabilityCategory,
  RiskLevel,
  CapabilityPermissions,
  SecurityPolicyConfig,
  ApprovalRequest,
  ApprovalDecision,
} from "./types.js";

const SECURITY_POLICY_META_KEY = "security_policy_config";

/**
 * Pre-defined Security Autonomy Presets
 */
export const SECURITY_PRESETS: Record<Exclude<SecurityAutonomyMode, "custom">, CapabilityPermissions> = {
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

export const DEFAULT_SECURITY_CONFIG: SecurityPolicyConfig = {
  mode: "balanced",
  capabilities: { ...SECURITY_PRESETS.balanced },
  enableAuditLog: true,
};

/**
 * Security & Permissions Manager
 *
 * Centralized governance system that evaluates automated tool execution,
 * manages autonomy modes, handles interactive user approval requests,
 * and maintains active session whitelists.
 */
export class SecurityManager extends EventEmitter {
  private static instance: SecurityManager | null = null;
  private config: SecurityPolicyConfig = { ...DEFAULT_SECURITY_CONFIG };

  /** In-memory session tool whitelists: sessionId -> (toolName -> entry metadata) */
  private sessionWhitelists: Map<
    string,
    Map<
      string,
      {
        toolName: string;
        grantedAt: string;
        capability: CapabilityCategory;
        riskLevel: RiskLevel;
        description: string;
      }
    >
  > = new Map();

  /** Pending approval requests awaiting user response: approvalId -> resolution handler */
  private pendingApprovals: Map<
    string,
    {
      request: ApprovalRequest;
      resolve: (decision: ApprovalDecision) => void;
      timer: NodeJS.Timeout;
    }
  > = new Map();

  private constructor() {
    super();
    this.loadPolicyFromStorage();
  }

  public static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  /**
   * Load persisted security policy from SQLite.
   */
  private loadPolicyFromStorage(): void {
    try {
      const db = AgentDatabase.getInstance();
      const raw = db.getMeta(SECURITY_POLICY_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this.config = {
            mode: parsed.mode || "balanced",
            capabilities: {
              ...DEFAULT_SECURITY_CONFIG.capabilities,
              ...(parsed.capabilities || {}),
            },
            enableAuditLog: parsed.enableAuditLog !== false,
          };
        }
      }
    } catch (err: any) {
      console.warn("[SecurityManager] Failed to load persisted security policy:", err.message);
    }
  }

  /**
   * Persist current security policy into SQLite.
   */
  private persistPolicyToStorage(): void {
    try {
      const db = AgentDatabase.getInstance();
      db.setMeta(SECURITY_POLICY_META_KEY, JSON.stringify(this.config));
    } catch (err: any) {
      console.warn("[SecurityManager] Failed to persist security policy:", err.message);
    }
  }

  /**
   * Get current security configuration.
   */
  public getConfig(): SecurityPolicyConfig {
    return {
      mode: this.config.mode,
      capabilities: { ...this.config.capabilities },
      enableAuditLog: this.config.enableAuditLog,
    };
  }

  /**
   * Update security autonomy mode or fine-grained capabilities.
   */
  public updateConfig(newConfig: Partial<SecurityPolicyConfig>): SecurityPolicyConfig {
    if (newConfig.mode && newConfig.mode !== "custom" && SECURITY_PRESETS[newConfig.mode]) {
      this.config.mode = newConfig.mode;
      this.config.capabilities = { ...SECURITY_PRESETS[newConfig.mode] };
    } else {
      if (newConfig.mode === "custom") {
        this.config.mode = "custom";
      }
      if (newConfig.capabilities) {
        this.config.capabilities = {
          ...this.config.capabilities,
          ...newConfig.capabilities,
        };
        // Auto-detect custom if capabilities deviate from standard presets
        this.config.mode = this.detectPresetMode(this.config.capabilities);
      }
    }

    if (typeof newConfig.enableAuditLog === "boolean") {
      this.config.enableAuditLog = newConfig.enableAuditLog;
    }

    this.persistPolicyToStorage();
    this.emit("policy:updated", this.config);
    return this.getConfig();
  }

  /**
   * Detect whether given capabilities match a known preset or custom.
   */
  private detectPresetMode(caps: CapabilityPermissions): SecurityAutonomyMode {
    for (const [presetKey, presetCaps] of Object.entries(SECURITY_PRESETS)) {
      const isMatch = Object.keys(presetCaps).every(
        (k) => caps[k as CapabilityCategory] === presetCaps[k as CapabilityCategory]
      );
      if (isMatch) return presetKey as SecurityAutonomyMode;
    }
    return "custom";
  }

  /**
   * Reset security policy to default (Balanced).
   */
  public resetToDefaults(): SecurityPolicyConfig {
    this.config = {
      mode: "balanced",
      capabilities: { ...SECURITY_PRESETS.balanced },
      enableAuditLog: true,
    };
    this.sessionWhitelists.clear();
    this.persistPolicyToStorage();
    this.emit("policy:updated", this.config);
    return this.getConfig();
  }

  /**
   * Classify any tool by capability category and determine its risk level.
   */
  public classifyTool(toolName: string): { capability: CapabilityCategory; riskLevel: RiskLevel; description: string } {
    const lower = toolName.toLowerCase();

    // 1. Shell / Command Execution
    if (lower === "execute_command" || lower.includes("shell") || lower.includes("bash") || lower.includes("cmd")) {
      return {
        capability: "shell",
        riskLevel: "high",
        description: "Executes native system commands inside the terminal.",
      };
    }

    // Specific Python Environment & Package Management
    if (lower === "check_python_environment") {
      return {
        capability: "python",
        riskLevel: "low",
        description: "Inspects the bundled Python environment version and installed packages.",
      };
    }

    if (lower === "install_python_package") {
      return {
        capability: "python",
        riskLevel: "medium",
        description: "Installs or upgrades Python packages into the isolated bundled runtime.",
      };
    }

    // 2. Python Script Execution
    if (lower === "run_sandboxed_script" || lower.includes("python") || lower.includes("py_exec")) {
      return {
        capability: "python",
        riskLevel: "high",
        description: "Runs custom Python code inside the sandbox environment.",
      };
    }

    // 3. Destructive Deletion of Files & Artifacts (Guarded by default)
    if (
      lower === "delete_artifact" ||
      lower === "clear_artifacts" ||
      lower === "clean_sandbox" ||
      lower.includes("delete_file") ||
      lower.includes("remove_file") ||
      lower.includes("delete_artifact") ||
      lower.includes("clear_artifacts") ||
      lower.includes("clean_sandbox")
    ) {
      return {
        capability: "file_delete",
        riskLevel: "high",
        description: "Permanently deletes user artifacts or wipes sandbox workspace files.",
      };
    }

    // 4. Safe File System & Artifact Creation
    if (
      lower === "save_artifact" ||
      lower.includes("file_write") ||
      lower.includes("write_file")
    ) {
      return {
        capability: "file_write",
        riskLevel: "medium",
        description: "Creates or updates files and deliverable artifacts.",
      };
    }

    // 4. Web Search & Outbound Network
    if (lower === "web_search" || lower.includes("search") || lower.includes("fetch") || lower.includes("http")) {
      return {
        capability: "network",
        riskLevel: "low",
        description: "Queries external search engines or fetches online web pages.",
      };
    }

    // 5. Vector Knowledge Base & RAG
    if (lower === "query_knowledge_base" || lower === "ingest_document" || lower === "remove_document") {
      return {
        capability: "rag",
        riskLevel: "low",
        description: "Searches or indexes local vector database knowledge.",
      };
    }

    // 6. Reasoning Scratchpad
    if (lower === "record_reasoning_step" || lower === "record_thinking") {
      return {
        capability: "reasoning",
        riskLevel: "low",
        description: "Records structured internal thoughts, plans, and evaluation steps.",
      };
    }

    // 7. Persistent Storage
    if (lower.includes("storage") || lower.includes("db")) {
      return {
        capability: "storage",
        riskLevel: "low",
        description: "Reads or writes to persistent plugin SQLite storage.",
      };
    }

    // 8. Custom Extension Tools
    return {
      capability: "custom",
      riskLevel: "medium",
      description: `Custom extension tool '${toolName}'.`,
    };
  }

  /**
   * Check whether a specific tool execution is allowed, blocked, or requires interactive user approval.
   */
  public evaluateToolExecution(
    toolName: string,
    sessionId?: string
  ): { action: PermissionAction; riskLevel: RiskLevel; capability: CapabilityCategory; description: string } {
    const meta = this.classifyTool(toolName);
    const configuredAction: PermissionAction = this.config.capabilities[meta.capability] || "ask";

    // Read-only environment diagnostic inspection is inherently safe and non-destructive
    if (toolName === "check_python_environment") {
      return {
        action: "allow",
        riskLevel: "low",
        capability: meta.capability,
        description: meta.description,
      };
    }

    // If configured to ask approval, check if the tool is whitelisted for the current session
    if (configuredAction === "ask" && sessionId) {
      const whitelist = this.sessionWhitelists.get(sessionId);
      if (whitelist && whitelist.has(toolName)) {
        return { action: "allow", riskLevel: meta.riskLevel, capability: meta.capability, description: meta.description };
      }
    }

    return {
      action: configuredAction,
      riskLevel: meta.riskLevel,
      capability: meta.capability,
      description: meta.description,
    };
  }

  /**
   * Request interactive user approval for a tool execution.
   * Emits an 'approval:requested' event and returns a Promise that settles when the user decides.
   */
  public async requestApproval(
    toolName: string,
    args: Record<string, unknown>,
    sessionId?: string,
    timeoutMs: number = 180000 // 3 minutes timeout
  ): Promise<ApprovalDecision> {
    const meta = this.classifyTool(toolName);
    const approvalId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let formattedCode: string | undefined;
    if (
      toolName !== "check_python_environment" &&
      toolName !== "install_python_package" &&
      (meta.capability === "python" ||
        meta.description.includes("Runs custom Python code inside the sandbox environment") ||
        toolName === "run_sandboxed_script" ||
        args?.language === "python")
    ) {
      const rawCode = (args?.code as string) || (args?.script as string) || (args?.command as string) || "";
      if (rawCode && rawCode.trim().length > 0) {
        formattedCode = formatPythonIndentation(rawCode);
      }
    }

    const request: ApprovalRequest = {
      id: approvalId,
      toolName,
      args,
      riskLevel: meta.riskLevel,
      capability: meta.capability,
      description: meta.description,
      timestamp: new Date().toISOString(),
      sessionId,
      formattedCode,
    };

    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingApprovals.has(approvalId)) {
          this.pendingApprovals.delete(approvalId);
          this.emit("approval:timeout", request);
          resolve("deny");
        }
      }, timeoutMs);

      this.pendingApprovals.set(approvalId, { request, resolve, timer });
      this.emit("approval:requested", request);
    });
  }

  /**
   * Resolve a pending approval request with the user's decision.
   */
  public resolveApproval(approvalId: string, decision: ApprovalDecision): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(approvalId);

    if (decision === "session_allow" && pending.request.sessionId) {
      this.addSessionWhitelist(pending.request.sessionId, pending.request.toolName);
    }

    pending.resolve(decision);
    this.emit("approval:resolved", { id: approvalId, decision, request: pending.request });
    return true;
  }

  /**
   * Add a tool to the session whitelist so it won't prompt again for this session.
   */
  public addSessionWhitelist(sessionId: string, toolName: string): void {
    if (!this.sessionWhitelists.has(sessionId)) {
      this.sessionWhitelists.set(sessionId, new Map());
    }
    const meta = this.classifyTool(toolName);
    this.sessionWhitelists.get(sessionId)!.set(toolName, {
      toolName,
      grantedAt: new Date().toISOString(),
      capability: meta.capability,
      riskLevel: meta.riskLevel,
      description: meta.description,
    });
    this.emit("whitelist:updated", {
      sessionId,
      tools: Array.from(this.sessionWhitelists.get(sessionId)!.keys()),
    });
  }

  /**
   * Revoke an individual tool permission from a specific session whitelist.
   */
  public revokeSessionPermission(sessionId: string, toolName: string): boolean {
    const map = this.sessionWhitelists.get(sessionId);
    if (!map) return false;
    const deleted = map.delete(toolName);
    if (map.size === 0) {
      this.sessionWhitelists.delete(sessionId);
    }
    this.emit("whitelist:updated", { sessionId, tools: this.getSessionWhitelists(sessionId) });
    return deleted;
  }

  /**
   * Clear all whitelisted tools for a session, or all sessions.
   */
  public clearSessionWhitelist(sessionId?: string): void {
    if (sessionId) {
      this.sessionWhitelists.delete(sessionId);
    } else {
      this.sessionWhitelists.clear();
    }
    this.emit("whitelist:updated", { sessionId, tools: [] });
  }

  /**
   * Get active session whitelists (tool names).
   */
  public getSessionWhitelists(sessionId?: string): string[] {
    if (sessionId) {
      const map = this.sessionWhitelists.get(sessionId);
      return map ? Array.from(map.keys()) : [];
    }
    const all = new Set<string>();
    for (const map of this.sessionWhitelists.values()) {
      for (const t of map.keys()) all.add(t);
    }
    return Array.from(all);
  }

  /**
   * Get full structured session whitelist details with timestamp and risk metadata.
   */
  public getSessionWhitelistDetails(): Array<{
    sessionId: string;
    tools: Array<{
      toolName: string;
      grantedAt: string;
      capability: CapabilityCategory;
      riskLevel: RiskLevel;
      description: string;
    }>;
  }> {
    const result: Array<{
      sessionId: string;
      tools: Array<{
        toolName: string;
        grantedAt: string;
        capability: CapabilityCategory;
        riskLevel: RiskLevel;
        description: string;
      }>;
    }> = [];

    for (const [sessionId, map] of this.sessionWhitelists.entries()) {
      result.push({
        sessionId,
        tools: Array.from(map.values()),
      });
    }

    return result;
  }

  /**
   * List all currently pending approval requests.
   */
  public getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).map((p) => p.request);
  }
}

/**
 * Format raw Python code with clean, human-readable 4-space indentation.
 * Handles escaped newlines, tab expansion, dedenting, normalizing 2/4 space indents,
 * and smart block indentation after compound statement lines ending with ':'.
 */
export function formatPythonIndentation(rawCode: string): string {
  if (!rawCode || typeof rawCode !== "string") return "";

  // 1. Unescape escaped newlines if there are no real newlines
  let code = rawCode;
  if (code.includes("\\n") && !code.includes("\n")) {
    code = code.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "    ");
  } else {
    code = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  // 2. Expand tabs to 4 spaces
  code = code.replace(/\t/g, "    ");

  // 3. Dedent common indentation
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

  // 5. Check if indentation already exists
  const hasExistingIndent = trimmedLines.some((l) => l.startsWith(" ") && l.trim().length > 0);

  if (hasExistingIndent) {
    // Detect base indent step (e.g. 2 spaces vs 4 spaces)
    const indents = trimmedLines
      .map((l) => (l.match(/^([ ]+)/) ? l.match(/^([ ]+)/)![1].length : 0))
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

  // 6. If completely unindented, infer compound statement indentation
  let currentIndent = 0;
  const result: string[] = [];
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
