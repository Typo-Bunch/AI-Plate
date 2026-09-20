/**
 * Central type definitions for the Agent Harness.
 *
 * All event payloads, tool schemas, and shared interfaces are defined here
 * to ensure strict typing across the entire plugin architecture.
 */

// ─── Tool System ────────────────────────────────────────────────────

/** JSON Schema definition for a tool's parameters. */
export interface ToolParametersSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    items?: Record<string, any> | { type: string };
    properties?: Record<string, any>;
    required?: string[];
  }>;
  required?: string[];
}

/** A tool declaration that can be passed to Gemini's function calling API. */
export interface ToolSchema {
  name: string;
  description: string;
  parametersJsonSchema: ToolParametersSchema;
  parameters?: ToolParametersSchema;
}

/** The handler function a plugin provides to execute a tool. */
export type ToolHandler = (
  args: Record<string, unknown>,
  context?: { sessionId?: string }
) => Promise<Record<string, unknown>>;

/** A registered tool combining its schema with its executable handler. */
export interface RegisteredTool {
  schema: ToolSchema;
  handler: ToolHandler;
}

/** The result of a tool execution, ready to be sent back to Gemini. */
export interface ToolExecutionResult {
  name: string;
  response: Record<string, unknown>;
}

// ─── Conversation State ─────────────────────────────────────────────

/** Roles in a conversation turn. */
export type ChatMode = "normal" | "plan" | "code" | "agent";

export type MessageRole = "user" | "model";

/** A single message in the conversation history. */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

// ─── Plugin System ──────────────────────────────────────────────────

/** Interface that all tool plugins must implement. */
export interface ToolPlugin {
  /** Unique machine identifier (e.g. 'shell', 'web_search', 'rag'). */
  readonly id?: string;

  /** Human-readable name of the plugin. */
  readonly name: string;

  /** Short description of plugin capabilities. */
  readonly description?: string;

  /** Icon emoji or visual representation. */
  readonly icon?: string;

  /** Category tag. */
  readonly category?: string;

  /** Optional UI extension bundle for rich client workbenches. */
  readonly ui_extension?: UIExtensionManifest;

  /** Register the plugin's tools with the Plugin Manager. */
  register(registerTool: (schema: ToolSchema, handler: ToolHandler) => void): void;
}

/** Declarative Tool Handler definition within a .aiplugin.json manifest. */
export interface ManifestHandler {
  type: "javascript" | "http" | "echo";
  code?: string;
  url?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  bodyTemplate?: string;
}

/** Declarative Tool Definition in a .aiplugin.json manifest. */
export interface ManifestTool {
  name: string;
  description: string;
  parameters?: ToolParametersSchema | Record<string, unknown>;
  parametersJsonSchema?: ToolParametersSchema;
  handler: ManifestHandler;
}

/** Declarative UI action button definition for an extension. */
export interface UIExtensionActionButton {
  id: string;
  label: string;
  type?: "primary" | "secondary" | "danger";
  modalTitle?: string;
  action?: string;
}

/** UI Extension definition bundled with a plugin. */
export interface UIExtensionManifest {
  pluginId: string;
  name: string;
  icon?: string;
  type?: "media_editor" | "panel_view" | "modal_tool" | "custom";
  fileTypes?: string[]; // e.g. ["image/*", ".jpg", ".png", ".webp"]
  actionButtons?: UIExtensionActionButton[];
  html?: string;
  css?: string;
  js?: string;
}

/** Quick Action or Slash Command declared by a plugin for the interactive chat bar. */
export interface PluginQuickAction {
  command: string;
  title: string;
  icon?: string;
  description?: string;
  promptPrefix?: string;
  action?: string;
}

/** File structure of a distributable .aiplugin.json package. */
export interface PluginManifest {
  $schema?: string;
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  icon?: string;
  category?: string;
  homepage?: string;
  enabled?: boolean;
  type?: "custom" | "builtin" | "extension";
  tools: ManifestTool[];
  ui_extension?: UIExtensionManifest;
  quick_actions?: PluginQuickAction[];
  permissions?: string[];
  lifecycle?: {
    on_install?: ManifestHandler;
    on_uninstall?: ManifestHandler;
  };
}

/** Detailed runtime representation of a registered plugin. */
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  isCustom: boolean;
  version?: string;
  author?: string;
  category?: string;
  canUninstall?: boolean;
  toolCount: number;
  tools: Array<{ name: string; description: string }>;
  ui_extension?: UIExtensionManifest;
  quick_actions?: PluginQuickAction[];
}

// ─── Universal Plugin Execution Context ─────────────────────────────

/** Complete execution context provided to custom plugin handlers. */
export interface PluginContext {
  /** The unique ID of the executing plugin */
  readonly pluginId: string;
  /** The input arguments passed from the LLM or caller */
  readonly params: Record<string, unknown>;
  /** File operations inside sandbox and artifacts */
  readonly fs: {
    readFile(relativePath: string, encoding?: BufferEncoding): string;
    readBuffer(relativePath: string): Buffer;
    writeFile(relativePath: string, content: string | Buffer): string;
    saveArtifact(filename: string, content: string | Buffer): string;
    listSandboxFiles(): string[];
    listArtifactFiles(): string[];
    exists(relativePath: string): boolean;
    deleteFile(relativePath: string): boolean;
    getSandboxDir(): string;
    getArtifactsDir(): string;
  };
  /** Sandboxed shell and python execution */
  readonly shell: {
    exec(command: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number; error?: string }>;
    runPython(codeOrScriptPath: string, args?: string[], timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number; error?: string }>;
  };
  /** Persistent key-value storage dedicated to this plugin */
  readonly storage: {
    get<T = unknown>(key: string, defaultValue?: T): T | null;
    set(key: string, value: unknown): void;
    delete(key: string): boolean;
    list(): Record<string, unknown>;
    clear(): void;
  };
  /** Vector RAG Knowledge Base queries and ingestion */
  readonly rag: {
    search(query: string, topK?: number): Promise<Array<{ document: string; text: string; similarity: number }>>;
    ingest(documentName: string, text: string): Promise<{ chunksIngested: number }>;
    listDocuments(): Array<{ name: string; chunkCount: number }>;
  };
  /** Node crypto utilities */
  readonly crypto: typeof import("node:crypto");
  /** Node Buffer constructor */
  readonly Buffer: typeof Buffer;
  /** Environment configuration */
  readonly env: Record<string, string | undefined>;
  /** Structured logger */
  log(message: string, ...args: unknown[]): void;
}

/** Standalone tool definition for programmatic code plugins. */
export interface ProgrammaticTool {
  name: string;
  description: string;
  parameters?: ToolParametersSchema | Record<string, unknown>;
  parametersJsonSchema?: ToolParametersSchema;
  handler: (params: Record<string, any>, context: PluginContext) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

/** Standard definition for writing plugins in JS/TS without changing core files. */
export interface CustomPluginDefinition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  version?: string;
  author?: string;
  enabled?: boolean;
  ui_extension?: UIExtensionManifest;
  tools: ProgrammaticTool[];
}

/** Helper to define and type-check a custom plugin. */
export function definePlugin(def: CustomPluginDefinition): CustomPluginDefinition {
  return def;
}

// ─── Orchestrator ───────────────────────────────────────────────────

/** Configuration for the Orchestrator. */
export interface OrchestratorConfig {
  apiKey?: string;
  provider?: string;
  model: string;
  systemPrompt: string;
  maxToolIterations: number;
  verbose: boolean;
}

/** Log levels for structured output. */
export type LogLevel = "info" | "tool" | "error" | "success";

// ─── Security & Permissions System ──────────────────────────────────

/** Global security autonomy presets. */
export type SecurityAutonomyMode = "strict" | "balanced" | "autonomous" | "custom";

/** Permission action decisions. */
export type PermissionAction = "ask" | "allow" | "deny";

/** Capability categories for fine-grained permission control. */
export type CapabilityCategory =
  | "shell"
  | "python"
  | "file_write"
  | "file_delete"
  | "network"
  | "storage"
  | "rag"
  | "reasoning"
  | "custom";

/** Risk level ratings. */
export type RiskLevel = "high" | "medium" | "low";

/** Granular capability permissions configuration. */
export interface CapabilityPermissions {
  shell: PermissionAction;
  python: PermissionAction;
  file_write: PermissionAction;
  file_delete: PermissionAction;
  network: PermissionAction;
  storage: PermissionAction;
  rag: PermissionAction;
  reasoning: PermissionAction;
  custom: PermissionAction;
}

/** Complete security policy configuration. */
export interface SecurityPolicyConfig {
  mode: SecurityAutonomyMode;
  capabilities: CapabilityPermissions;
  autoPruneAuditDays?: number;
  enableAuditLog?: boolean;
}

/** Real-time pending approval request for a tool call. */
export interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: RiskLevel;
  capability: CapabilityCategory;
  description: string;
  timestamp: string;
  sessionId?: string;
  formattedCode?: string;
}

/** User approval decision. */
export type ApprovalDecision = "approve" | "deny" | "session_allow";

