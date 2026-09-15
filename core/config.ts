/**
 * Centralized Configuration & Constants for AI Plate (Universal Agent Harness).
 *
 * Single Source of Truth for all defaults across the entire system.
 * Supports config.yaml file loading with environment variable overrides (.env).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "yaml";
import dotenv from "dotenv";
import type { ProviderType } from "./ai-provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Find the active config.yaml path */
export function getResolvedConfigYamlPath(): string {
  const possiblePaths = [
    resolve(process.cwd(), "config.yaml"),
    resolve(process.cwd(), "config.yml"),
    (process as any).resourcesPath ? resolve((process as any).resourcesPath, "config.yaml") : "",
    (process as any).resourcesPath ? resolve((process as any).resourcesPath, "config.yml") : "",
    resolve(__dirname, "../../config.yaml"),
    resolve(__dirname, "../../config.yml"),
    resolve(__dirname, "../config.yaml"),
    resolve(__dirname, "../config.yml"),
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (existsSync(p)) return p;
  }
  return resolve(process.cwd(), "config.yaml");
}

/** Find the active .env path */
export function getResolvedEnvPath(): string {
  const possiblePaths = [
    resolve(process.cwd(), ".env"),
    (process as any).resourcesPath ? resolve((process as any).resourcesPath, ".env") : "",
    resolve(__dirname, "../../.env"),
    resolve(__dirname, "../.env"),
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (existsSync(p)) return p;
  }
  return resolve(process.cwd(), ".env");
}

// Hydrate environment variables from the resolved .env file immediately
dotenv.config({ path: getResolvedEnvPath() });

/** Load and parse optional config.yaml file from project root or workspace */
function loadYamlConfig(): Record<string, any> {
  const p = getResolvedConfigYamlPath();
  if (existsSync(p)) {
    try {
      const raw = readFileSync(p, "utf-8");
      const parsed = yaml.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (err) {
      console.warn(`[CONFIG] Failed to parse YAML config at ${p}:`, err);
    }
  }
  return {};
}

const YAML_CONF = loadYamlConfig();

export const CONFIG = {
  /** Application Branding */
  NAME: process.env.APP_NAME || YAML_CONF.app?.name || "AI Plate",
  TAGLINE: process.env.APP_TAGLINE || YAML_CONF.app?.tagline || "Open Power",

  /** Verbosity knob: true if --verbose or -v is passed, or VERBOSE=true in .env/config.yaml */
  VERBOSE:
    process.argv.includes("--verbose") ||
    process.argv.includes("-v") ||
    process.env.VERBOSE === "true" ||
    YAML_CONF.verbose === true ||
    false,

  /** Default active provider from config.yaml */
  DEFAULT_PROVIDER: (YAML_CONF.provider?.active?.toLowerCase() as ProviderType) || "gemini",

  /** Default model identifier */
  DEFAULT_MODEL:
    process.env.MODEL ||
    YAML_CONF.provider?.models?.[YAML_CONF.provider?.active || "gemini"] ||
    "gemini-3.5-flash",

  /** Default Provider Priority Chain: checked in order when selecting active LLM */
  DEFAULT_PROVIDER_PRIORITY: (YAML_CONF.provider?.priority as readonly ProviderType[]) || [
    "openrouter",
    "gemini",
    "openai",
    "anthropic",
    "groq",
    "deepseek",
    "ollama",
  ],

  /** Default maximum tool execution iterations per prompt */
  DEFAULT_MAX_TOOL_ITERATIONS:
    Number(process.env.MAX_TOOL_ITERATIONS) ||
    YAML_CONF.agent?.max_tool_iterations ||
    20,

  /** Retry & Rate Limit Resilience Knobs */
  RETRY: {
    /** Maximum retry attempts on rate limit / quota exhaustion errors */
    MAX_RETRIES:
      Number(process.env.AI_MAX_RETRIES) ||
      YAML_CONF.retry?.max_retries ||
      2,

    /** Base backoff delay in ms for retrying API requests */
    INITIAL_DELAY_MS:
      Number(process.env.AI_RETRY_DELAY_MS) ||
      YAML_CONF.retry?.initial_delay_ms ||
      2000,

    /** Maximum backoff delay cap in ms */
    MAX_DELAY_MS:
      Number(process.env.AI_MAX_RETRY_DELAY_MS) ||
      YAML_CONF.retry?.max_delay_ms ||
      15000,

    /** Initial backoff delay for Google Gemini API retries */
    GEMINI_INITIAL_DELAY_MS:
      Number(process.env.GEMINI_RETRY_DELAY_MS) ||
      YAML_CONF.retry?.gemini_initial_delay_ms ||
      3000,

    /** Initial backoff delay for OpenAI / OpenRouter API retries */
    OPENAI_INITIAL_DELAY_MS:
      Number(process.env.OPENAI_RETRY_DELAY_MS) ||
      YAML_CONF.retry?.openai_initial_delay_ms ||
      1500,
  },

  /** Embedding Model & Token-Safe Clamping Knobs */
  EMBEDDING: {
    /** Default active embedding model */
    DEFAULT_MODEL:
      process.env.EMBEDDING_MODEL ||
      YAML_CONF.embedding?.model ||
      "liquid/lfm-2.5-embedding-350m:free",

    /** Default active embedding provider */
    DEFAULT_PROVIDER:
      (process.env.EMBEDDING_PROVIDER?.toLowerCase() as any) ||
      YAML_CONF.embedding?.provider ||
      "openrouter",

    /** Maximum character length for 512-token context models (Liquid LFM) */
    LIQUID_MAX_CHARS:
      Number(process.env.EMBEDDING_LIQUID_MAX_CHARS) ||
      YAML_CONF.embedding?.liquid_max_chars ||
      1400,

    /** Maximum character length for general embedding models (OpenAI, Gemini) */
    DEFAULT_MAX_CHARS:
      Number(process.env.EMBEDDING_DEFAULT_MAX_CHARS) ||
      YAML_CONF.embedding?.default_max_chars ||
      4000,

    /** Batch size for chunk embedding requests */
    BATCH_SIZE:
      Number(process.env.EMBEDDING_BATCH_SIZE) ||
      YAML_CONF.embedding?.batch_size ||
      5,
  },

  /** Session Memory Vector Knobs */
  SESSION_MEMORY: {
    /** Max character length to embed for conversation recall */
    MAX_MEMORIZE_CHARS:
      Number(process.env.SESSION_MEMORIZE_MAX_CHARS) ||
      YAML_CONF.session_memory?.max_memorize_chars ||
      1500,

    /** Max character length stored in SQLite text column */
    MAX_STORE_CHARS:
      Number(process.env.SESSION_STORE_MAX_CHARS) ||
      YAML_CONF.session_memory?.max_store_chars ||
      4000,

    /** Number of past turns to recall */
    RECALL_TOP_K:
      Number(process.env.SESSION_RECALL_TOP_K) ||
      YAML_CONF.session_memory?.recall_top_k ||
      3,

    /** Minimum cosine similarity score (0.0 - 1.0) to qualify as relevant turn */
    MIN_SIMILARITY:
      Number(process.env.SESSION_MIN_SIMILARITY) ||
      YAML_CONF.session_memory?.min_similarity ||
      0.65,

    /** Minimum user prompt length to trigger session memory recall */
    QUERY_MIN_CHARS:
      Number(process.env.SESSION_QUERY_MIN_CHARS) ||
      YAML_CONF.session_memory?.query_min_chars ||
      8,
  },

  /** Default system prompt describing the agent's behavior and constraints */
  DEFAULT_SYSTEM_PROMPT: `You are **AI Plate** — a modular, plugin-powered AI agent workbench.
You operate as a precise, autonomous assistant equipped with a dynamically loaded set of tools (plugins). Your available capabilities change as plugins are installed, enabled, or removed — never assume a fixed tool set.

Your runtime environment is **${process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux"}**.

---

### Core Principles

1. **Tool-First Execution.** When a user's request can be fulfilled by an available tool, invoke the tool rather than speculating. Choose the most direct tool for the task.
2. **Dynamic Plugin Awareness.** Your tool set is modular. The available tools shown in your context are the *only* capabilities you have right now. Do not reference or assume tools that are not listed. If a required capability is missing, tell the user which plugin or tool would be needed.
3. **Progressive Information Retrieval.** When querying knowledge bases or search results, inspect the first batch. If confidence is low (<75%) or key facts are missing, request the next batch before drawing conclusions. Never dump or cat large files in raw form — use the appropriate retrieval tool with batching.
4. **Workspace & Deliverables.**
   - Use the **sandbox** directory for temporary scripts, calculations, and intermediate processing.
   - Use the **artifacts** directory for meaningful, persistent outputs the user wants to keep (charts, reports, images, datasets).
   - When the user asks to view, list, or browse deliverables, invoke the appropriate listing tool so results render as interactive cards in the chat UI.
5. **Multi-Step Planning.** For complex requests requiring multiple tools, outline your plan briefly, then execute steps sequentially. Confirm outcomes at each stage before proceeding.
6. **Error Recovery.** If a tool call fails or returns an unexpected result:
   - Log the error clearly to the user.
   - Attempt a reasonable alternative approach if one exists.
   - If no alternative is available, explain what went wrong and suggest what the user can do (e.g., install a plugin, check permissions, adjust input).
7. **Plugin Independence & Standalone Execution.** Every plugin is completely modular, decoupled, and independent.
   - Never treat one plugin as a required prerequisite or wrapper for another plugin.
   - When the 'thinking_inspector' plugin is active (providing 'record_reasoning_step' or 'record_thinking'), feel free to record structured reasoning steps and action plans for complex multi-stage tasks.
   - When the 'outcome_summary' plugin is active (providing 'record_outcome_summary'), feel free to record the execution outcome summary with key actions and deliverables at the conclusion of multi-step tasks.
   - For simple single-action requests, invoke the target domain tool directly without unnecessary chaining.

---

### Output & Communication Standards

- **Format responses in clean Markdown.** Use headings, bullet points, code blocks, and tables where they improve clarity.
- **Be concise, direct, and thorough.** Don't pad responses with filler — get straight to the point without unnecessary preamble.
- **No Repetitive Greetings or Salutations:** Do NOT greet the user (e.g. "Hello", "Hi", "Good day", "Greetings [Name]") at the start of responses unless the user explicitly greeted you first in their prompt. Dive immediately into the answer, explanation, or tool execution.
- **No Repetitive Addressing by Name:** Do NOT repeatedly address the user by name or title on routine prompts.
- **Preference & Context Discretion:** Background user profile facts, past projects, or preferences are passive context. Do NOT force or inject background preferences or past projects into answers unless the user's prompt specifically requests or concerns them.
- **Cite sources.** When presenting information from web searches or knowledge base queries, include source links and confidence assessments.
- **Explain actions taken.** After executing tools, briefly confirm what was done and the result.
- **Adapt tone to context.** Technical questions get technical answers. Creative requests get creative responses. Casual questions get friendly replies.

---

### Shell & Script Execution

- **Determine capabilities from the current tool definitions.** Earlier assistant claims about unavailable tools may be wrong or outdated. A general execution tool can perform local filesystem tasks even when no dedicated file-listing plugin exists.
- **Working directory is not a filesystem boundary.** The '.sandbox/' directory is where temporary scripts are stored and execution starts; it does not by itself prevent access to absolute local paths. For user-requested local reads or directory listings, use an available file tool or execution tool with the requested absolute path, subject to OS permissions and security policy.
- **Try the authorized operation before claiming access is impossible.** In Code mode, use the relevant available tool for an actionable request rather than only showing code for the user to run. If execution is unavailable in Normal or Plan mode, explain the mode restriction and suggest switching to Code. Never bypass a denied permission or mode restriction.
- **Use local tools for local facts.** Do not web-search for the user's files or folders. For a directory listing, inspect only immediate children unless recursion is requested, limit large output, and report actual tool results. A temporary script can read the requested directory while remaining stored in '.sandbox/'.
- **Report evidence, not assumed limitations.** On failure, report the actual tool error with secrets redacted. Distinguish an unavailable tool, a security denial, a missing path, and a runtime error. Never claim a task was executed without a successful tool result.

- Use platform-appropriate shell commands for the current OS (${process.platform === "win32" ? "e.g. 'dir' instead of 'ls', 'type' instead of 'cat'" : process.platform === "darwin" ? "standard Unix commands" : "standard Linux commands"}).
- Always prefer sandboxed script execution for complex calculations or data processing over inline reasoning.
- **Bundled Python Runtime & Package Management:**
  - AI Plate includes an isolated, self-contained bundled Python compiler & runtime. The user does not need to install Python or configure system PATH.
  - When executing Python code via 'run_sandboxed_script', the bundled Python engine is used automatically.
  - If a task requires external Python libraries (e.g. 'pandas', 'matplotlib', 'requests', 'scipy', etc.) that are not yet installed, you can autonomously install them into the dedicated bundled runtime using the 'install_python_package' tool.
  - You can inspect the Python engine status and installed packages at any time using the 'check_python_environment' tool.
  - All installed packages are isolated within the app's bundled runtime and will not pollute or conflict with host system software.
- Save generated visualizations (charts, plots, diagrams) to the artifacts directory so they persist in the user's gallery.

---

### Creative & Media Tasks

- When creating or editing images, manga panels, collages, or visual content, use the appropriate media tool and always save results as artifacts.
- For image generation prompts, write vivid, detailed descriptions that produce high-quality results.
- When the user requests edits to existing media, reference the specific file and describe modifications precisely.

---

### Knowledge Base & RAG

- When relevant context from previously ingested documents is automatically provided, use it to ground your answers with factual accuracy.
- For large files or codebases, use the document ingestion tool once, then query the knowledge base — never attempt to read entire large files in a single command.
- Use progressive retrieval: start with a small batch, evaluate confidence, and fetch more only if needed.

---

### Project Integrity & Self-Preservation (STRICT RULE)

- **Never Modify or Delete Project Files:** Under NO circumstances should you delete, overwrite, tamper with, or remove the core codebase, configuration files, system source code, UI files, or project directory structure of this application ('core/', 'ui/', 'plugins/', 'dist/', 'providers/', 'package.json', 'tsconfig.json', 'config.yaml', etc.).
- **Temporary Script Location:** Store ad-hoc scripts and intermediate outputs in '.sandbox/'. User-requested reads of absolute local paths are permitted through available tools, subject to OS permissions and security policy; the script's location does not confine its input paths.
- **Artifacts Isolation:** All user-facing persistent deliverables (charts, plots, images, exported reports, datasets) MUST be saved exclusively to the 'artifacts/' directory.
- **No Destructive Self-Targeting Commands:** Never execute destructive file operations ('rm', 'rmdir', 'del', 'Remove-Item', 'truncate', etc.) against this project's own repository, source code, or application assets.

---

### What NOT To Do

- **Never delete, modify, or remove this project's own files or folders.**
- **Never hallucinate tool names.** Only invoke tools that appear in your current tool definitions.
- **Never fabricate data.** If you don't have the information and no tool can retrieve it, say so.
- **Never expose raw API keys, tokens, or sensitive configuration** in responses.
- If no tool is needed, respond with helpful, accurate text directly.`,

  /** Shell & Sandboxed Execution settings */
  SHELL: {
    TIMEOUT_MS:
      Number(process.env.SHELL_TIMEOUT_MS) ||
      YAML_CONF.shell?.timeout_ms ||
      30_000,
    MAX_BUFFER_BYTES:
      Number(process.env.SHELL_MAX_BUFFER_BYTES) ||
      YAML_CONF.shell?.max_buffer_bytes ||
      1024 * 1024,
    SANDBOX_DIR:
      process.env.SANDBOX_DIR ||
      YAML_CONF.workspace?.sandbox_dir ||
      YAML_CONF.shell?.sandbox_dir ||
      ".sandbox",
    ARTIFACTS_DIR:
      process.env.ARTIFACTS_DIR ||
      YAML_CONF.workspace?.artifacts_dir ||
      "artifacts",
    CLEAN_SANDBOX_ON_EXIT:
      YAML_CONF.workspace?.clean_sandbox_on_exit === true,
    MAX_OUTPUT_CHARS:
      Number(process.env.SHELL_MAX_OUTPUT_CHARS) ||
      YAML_CONF.shell?.max_output_chars ||
      4000,
  },

  /** Web Search & Fact Verification settings */
  WEB_SEARCH: {
    /** Minimum accuracy / relevance percentage threshold (default: 75%) */
    DEFAULT_MIN_ACCURACY:
      Number(process.env.WEB_SEARCH_MIN_ACCURACY) ||
      YAML_CONF.web_search?.min_accuracy ||
      75,

    /** Default maximum search results to return */
    DEFAULT_MAX_RESULTS:
      Number(process.env.WEB_SEARCH_MAX_RESULTS) ||
      YAML_CONF.web_search?.max_results ||
      5,

    /** Maximum characters to extract when reading a full webpage */
    DEFAULT_MAX_PAGE_LENGTH:
      Number(process.env.WEB_SEARCH_MAX_PAGE_LENGTH) ||
      YAML_CONF.web_search?.max_page_length ||
      6000,

    /** User-Agent for search and web scraping requests */
    USER_AGENT:
      YAML_CONF.web_search?.user_agent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },

  /** RAG Vector Database & Knowledge Base settings */
  RAG: {
    /** Embedding model identifier */
    EMBEDDING_MODEL:
      process.env.EMBEDDING_MODEL ||
      YAML_CONF.embedding?.model ||
      "liquid/lfm-2.5-embedding-350m:free",

    /** Default character chunk size for splitting heavy files */
    DEFAULT_CHUNK_SIZE:
      Number(process.env.RAG_CHUNK_SIZE) ||
      YAML_CONF.rag?.chunk_size ||
      1200,

    /** Overlap between consecutive chunks */
    DEFAULT_CHUNK_OVERLAP:
      Number(process.env.RAG_CHUNK_OVERLAP) ||
      YAML_CONF.rag?.chunk_overlap ||
      200,

    /** Number of top most relevant chunks to retrieve */
    DEFAULT_TOP_K:
      Number(process.env.RAG_TOP_K) ||
      YAML_CONF.rag?.top_k ||
      4,

    /** Minimum cosine similarity threshold (0-1) for query results */
    MIN_SIMILARITY:
      Number(process.env.RAG_MIN_SIMILARITY) ||
      YAML_CONF.rag?.min_similarity ||
      0.3,

    /** Path to the persistent SQLite database file */
    DATABASE_PATH:
      process.env.DATABASE_PATH ||
      YAML_CONF.rag?.database_path ||
      "agent_data.db",
    VECTOR_STORE_PATH:
      process.env.DATABASE_PATH ||
      YAML_CONF.rag?.database_path ||
      "agent_data.db",

    /** Whether to automatically query the knowledge base on every prompt */
    AUTO_QUERY_ENABLED:
      process.env.RAG_AUTO_QUERY_ENABLED !== undefined
        ? process.env.RAG_AUTO_QUERY_ENABLED !== "false"
        : (YAML_CONF.rag?.auto_query_enabled ?? true),

    /**
     * Shelf life (TTL) in days for ingested documents and conversation history.
     */
    SHELF_LIFE_DAYS:
      Number(process.env.RAG_SHELF_LIFE_DAYS) ||
      YAML_CONF.rag?.shelf_life_days ||
      7,
  },

  /** Universal Cognitive Thinking & Reasoning Modes */
  THINKING: {
    DEFAULT_LEVEL:
      (process.env.THINKING_LEVEL?.toLowerCase() as ThinkingLevel) ||
      (YAML_CONF.thinking?.level?.toLowerCase() as ThinkingLevel) ||
      "high",
  },

  /** Intelligent Context Compression & Token Optimization */
  CONTEXT_COMPRESSOR: {
    ENABLED:
      process.env.CONTEXT_COMPRESSOR_ENABLED !== undefined
        ? process.env.CONTEXT_COMPRESSOR_ENABLED !== "false"
        : (YAML_CONF.context_compressor?.enabled ?? true),
    MODE:
      (process.env.CONTEXT_COMPRESSOR_MODE?.toLowerCase() as any) ||
      YAML_CONF.context_compressor?.mode ||
      "smart",
    MAX_PROMPT_TOKENS:
      Number(process.env.CONTEXT_MAX_PROMPT_TOKENS) ||
      YAML_CONF.context_compressor?.max_prompt_tokens ||
      8192,
    MAX_HISTORY_TURNS:
      Number(process.env.CONTEXT_MAX_HISTORY_TURNS) ||
      YAML_CONF.context_compressor?.max_history_turns ||
      20,
    MAX_TOOL_OUTPUT_CHARS:
      Number(process.env.CONTEXT_MAX_TOOL_OUTPUT_CHARS) ||
      YAML_CONF.context_compressor?.max_tool_output_chars ||
      4000,
    PRESERVE_RECENT_TURNS:
      Number(process.env.CONTEXT_PRESERVE_RECENT_TURNS) ||
      YAML_CONF.context_compressor?.preserve_recent_turns ||
      6,
    ENABLE_TOOL_COMPRESSION:
      process.env.CONTEXT_ENABLE_TOOL_COMPRESSION !== undefined
        ? process.env.CONTEXT_ENABLE_TOOL_COMPRESSION !== "false"
        : (YAML_CONF.context_compressor?.enable_tool_compression ?? true),
    ENABLE_RAG_COMPRESSION:
      process.env.CONTEXT_ENABLE_RAG_COMPRESSION !== undefined
        ? process.env.CONTEXT_ENABLE_RAG_COMPRESSION !== "false"
        : (YAML_CONF.context_compressor?.enable_rag_compression ?? true),
  },
} as const;

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "max";

export interface ThinkingPreset {
  level: ThinkingLevel;
  name: string;
  badge: string;
  budgetTokens: number;
  maxToolIterations: number;
  cotPrompt: string;
}

export const THINKING_PRESETS: Record<ThinkingLevel, ThinkingPreset> = {
  off: {
    level: "off",
    name: "Off (Fast / Direct)",
    badge: "⚡ Fast",
    budgetTokens: 0,
    maxToolIterations: 10,
    cotPrompt: "Provide direct, concise, and immediate answers without internal reasoning commentary.",
  },
  low: {
    level: "low",
    name: "Low (Quick Thought)",
    badge: "💡 Quick",
    budgetTokens: 1024,
    maxToolIterations: 15,
    cotPrompt: "Quickly consider key constraints, edge cases, and facts before formulating your response.",
  },
  medium: {
    level: "medium",
    name: "Medium (Balanced)",
    badge: "⚖️ Balanced",
    budgetTokens: 4096,
    maxToolIterations: 25,
    cotPrompt: "Think step-by-step. Break down the user prompt, plan your approach, execute tools as needed, and verify accuracy before replying.",
  },
  high: {
    level: "high",
    name: "High (Deep Reasoning)",
    badge: "🧠 Deep",
    budgetTokens: 12288,
    maxToolIterations: 40,
    cotPrompt: "ENGAGE RIGOROUS DEEP REASONING:\n1. Deconstruct the user request into atomic sub-goals.\n2. Formulate explicit hypotheses and identify edge cases.\n3. Execute tools sequentially, inspecting and validating intermediate outputs.\n4. Critically self-critique potential pitfalls before finalizing output.",
  },
  max: {
    level: "max",
    name: "Max (Exhaustive Deep Work)",
    badge: "🚀 Max",
    budgetTokens: 32768,
    maxToolIterations: 60,
    cotPrompt: "ENGAGE MAXIMUM COGNITIVE REASONING & EXHAUSTIVE DEEP WORK:\n- Fully map out the problem space, potential edge cases, and failure modes.\n- Perform rigorous tool execution, testing, and multi-step verification.\n- Scrutinize every assumption and conduct self-correction cycles.\n- Deliver comprehensive, robust, and empirically verified results.",
  },
};

/** Default curated popular chat models organized by provider */
const DEFAULT_PROVIDER_MODELS: Record<string, string[]> = {
  openrouter: [
    "nvidia/nemotron-3.5-lightning:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.5-flash",
    "anthropic/claude-3.7-sonnet",
    "deepseek/deepseek-r1",
    "openai/gpt-4o-mini",
    "openrouter/auto",
  ],
  gemini: [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
  ],
  openai: [
    "gpt-4o-mini",
    "gpt-4o",
    "o3-mini",
  ],
  anthropic: [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-haiku-20241022",
  ],
  ollama: [
    "llama3.3",
    "mistral",
    "deepseek-r1",
    "qwen2.5-coder",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
  ],
  deepseek: [
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  lmstudio: [
    "local-model",
  ],
};

/** Default curated popular embedding models organized by provider */
const DEFAULT_PROVIDER_EMBEDDING_MODELS: Record<string, string[]> = {
  openrouter: [
    "liquid/lfm-2.5-embedding-350m:free",
    "openai/text-embedding-3-small",
    "openai/text-embedding-3-large",
    "baai/bge-large-en-v1.5",
    "baai/bge-base-en-v1.5",
  ],
  gemini: [
    "text-embedding-004",
    "gemini-embedding-2",
  ],
  openai: [
    "text-embedding-3-small",
    "text-embedding-3-large",
    "text-embedding-ada-002",
  ],
  ollama: [
    "nomic-embed-text",
    "all-minilm",
    "bge-m3",
    "mxbai-embed-large",
  ],
  lmstudio: [
    "text-embedding-nomic-embed-text-v1.5",
    "bge-small-en-v1.5",
    "all-MiniLM-L6-v2",
    "liquid/lfm-2.5-embedding-350m:free",
  ],
  groq: [
    "liquid/lfm-2.5-embedding-350m:free",
    "text-embedding-3-small",
  ],
  deepseek: [
    "liquid/lfm-2.5-embedding-350m:free",
    "text-embedding-3-small",
  ],
  anthropic: [
    "liquid/lfm-2.5-embedding-350m:free",
    "text-embedding-3-small",
  ],
};

/**
 * Merge user-defined models from config.yaml into defaults
 */
function resolveConfiguredModels(
  defaults: Record<string, string[]>,
  userConfigured?: Record<string, any>
): Record<string, string[]> {
  if (!userConfigured || typeof userConfigured !== "object") {
    return { ...defaults };
  }

  const result: Record<string, string[]> = { ...defaults };
  for (const [providerKey, models] of Object.entries(userConfigured)) {
    const key = providerKey.toLowerCase();
    if (Array.isArray(models)) {
      // If user specified an array in YAML, use it directly (or prepend to defaults)
      result[key] = models.map((m) => String(m).trim()).filter(Boolean);
    }
  }
  return result;
}

/** Provider chat models (configured in config.yaml under provider.available_models or defaults) */
export const PROVIDER_MODELS: Record<string, string[]> = resolveConfiguredModels(
  DEFAULT_PROVIDER_MODELS,
  YAML_CONF.provider?.available_models || YAML_CONF.provider?.provider_models
);

/** Embedding models (configured in config.yaml under embedding.available_models or defaults) */
export const PROVIDER_EMBEDDING_MODELS: Record<string, string[]> = resolveConfiguredModels(
  DEFAULT_PROVIDER_EMBEDDING_MODELS,
  YAML_CONF.embedding?.available_models ||
    YAML_CONF.embedding?.provider_models ||
    YAML_CONF.embedding_models
);

/**
 * Resolves the active model to use specifically for the selected AI provider.
 */
export function resolveModel(providerType?: ProviderType, overrideModel?: string): string {
  if (overrideModel) return overrideModel;
  if (process.env.MODEL) return process.env.MODEL;

  const target =
    providerType ||
    (process.env.AI_PROVIDER?.toLowerCase() as ProviderType) ||
    (YAML_CONF.provider?.active as ProviderType) ||
    "gemini";

  switch (target) {
    case "openrouter":
      return process.env.OPENROUTER_MODEL || YAML_CONF.provider?.models?.openrouter || "nvidia/nemotron-3.5-lightning:free";
    case "gemini":
      return process.env.GEMINI_MODEL || YAML_CONF.provider?.models?.gemini || CONFIG.DEFAULT_MODEL;
    case "openai":
      return process.env.OPENAI_MODEL || YAML_CONF.provider?.models?.openai || "gpt-4o-mini";
    case "anthropic":
      return process.env.ANTHROPIC_MODEL || YAML_CONF.provider?.models?.anthropic || "claude-3-7-sonnet-20250219";
    case "groq":
      return process.env.GROQ_MODEL || YAML_CONF.provider?.models?.groq || "llama-3.3-70b-versatile";
    case "deepseek":
      return process.env.DEEPSEEK_MODEL || YAML_CONF.provider?.models?.deepseek || "deepseek-chat";
    case "ollama":
      return process.env.OLLAMA_MODEL || YAML_CONF.provider?.models?.ollama || "llama3.3";
    case "lmstudio":
      return process.env.LMSTUDIO_MODEL || YAML_CONF.provider?.models?.lmstudio || "local-model";
    default:
      return CONFIG.DEFAULT_MODEL;
  }
}

/**
 * Resolves the active embedding model to use based on override, env variables, YAML config, or provider defaults.
 */
export function resolveEmbeddingModel(providerType?: ProviderType, overrideModel?: string): string {
  if (overrideModel) return overrideModel;
  if (process.env.EMBEDDING_MODEL) return process.env.EMBEDDING_MODEL;
  if (YAML_CONF.embedding?.model) return YAML_CONF.embedding.model;

  const target =
    providerType ||
    (process.env.AI_PROVIDER?.toLowerCase() as ProviderType) ||
    (YAML_CONF.embedding?.provider as ProviderType) ||
    "openrouter";

  switch (target) {
    case "openrouter":
      return process.env.OPENROUTER_EMBEDDING_MODEL || "liquid/lfm-2.5-embedding-350m:free";
    case "gemini":
      return process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
    case "openai":
      return process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    case "ollama":
      return process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
    default:
      return "liquid/lfm-2.5-embedding-350m:free";
  }
}

/**
 * Log message to console only if VERBOSE mode is active.
 */
export function logVerbose(category: string, message: string): void {
  if (CONFIG.VERBOSE) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${category.toUpperCase()}] ${message}`);
  }
}
