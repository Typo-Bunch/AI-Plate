/**
 * Universal Plug-and-Play AI Provider Plugin Registry.
 *
 * Provides a dynamic, extensible provider architecture where:
 * 1. Over 90% of industry LLMs (OpenRouter, Groq, DeepSeek, Ollama, Together, Mistral, LM Studio)
 *    plug in seamlessly as OpenAI-compatible wire drivers with zero custom boilerplate.
 * 2. Native SDK drivers (Google Gemini, Anthropic Claude) register as first-class plugins.
 * 3. Any custom cloud or self-hosted LLM endpoint can be declared directly in `config.yaml`.
 */

import { AIProvider, ProviderType } from "../core/ai-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";

export type ProviderDriverType = "openai-compatible" | "gemini" | "anthropic";

export interface ProviderDescriptor {
  readonly name: string;
  readonly displayName?: string;
  readonly driver: ProviderDriverType;
  readonly baseUrl?: string;
  readonly envKey?: string;
  readonly defaultModel: string;
  readonly defaultEmbeddingModel?: string;
  readonly availableModels?: string[];
  readonly availableEmbeddingModels?: string[];
  readonly customHeaders?: Record<string, string>;
}

export interface ProviderCreationOptions {
  provider?: string;
  model?: string;
  embeddingModel?: string;
  apiKey?: string;
  baseUrl?: string;
}

export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;
  private readonly descriptors: Map<string, ProviderDescriptor> = new Map();

  private constructor() {
    this.registerBuiltInProviders();
  }

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Register standard built-in AI Provider drivers.
   */
  private registerBuiltInProviders(): void {
    // 1. OpenRouter (Universal Gateway with 300+ models & free endpoints)
    this.register({
      name: "openrouter",
      displayName: "OpenRouter",
      driver: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      envKey: "OPENROUTER_API_KEY",
      defaultModel: "openrouter/auto",
      defaultEmbeddingModel: "liquid/lfm-2.5-embedding-350m:free",
      availableModels: [
        "openrouter/auto",
        "nvidia/nemotron-3.5-lightning:free",
        "deepseek/deepseek-r1:free",
        "deepseek/deepseek-chat:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "meta-llama/llama-3.1-8b-instruct:free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "meta-llama/llama-3.2-1b-instruct:free",
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-2.0-flash-thinking-exp:free",
        "google/gemma-2-9b-it:free",
        "google/gemma-2-27b-it:free",
        "qwen/qwen-2.5-coder-32b-instruct:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "qwen/qwq-32b-preview:free",
        "mistralai/mistral-7b-instruct:free",
        "mistralai/mistral-nemo:free",
        "microsoft/phi-3-medium-128k-instruct:free",
        "microsoft/phi-3.5-mini-128k-instruct:free",
        "cognitivecomputations/dolphin3.0-r1-mistral-24b:free",
      ],
      availableEmbeddingModels: [
        "liquid/lfm-2.5-embedding-350m:free",
        "openai/text-embedding-3-small",
        "openai/text-embedding-3-large",
        "baai/bge-large-en-v1.5",
        "baai/bge-base-en-v1.5",
        "baai/bge-small-en-v1.5",
      ],
    });

    // 2. Google Gemini Native Driver (Free Tier Flash & Reasoning)
    this.register({
      name: "gemini",
      displayName: "Google Gemini",
      driver: "gemini",
      envKey: "GOOGLE_API_KEY",
      defaultModel: "gemini-3.5-flash-lite",
      defaultEmbeddingModel: "gemini-embedding-2",
      availableModels: [
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
      ],
      availableEmbeddingModels: [
        "gemini-embedding-2",
        "text-embedding-004",
      ],
    });

    // 3. OpenAI Official Driver
    this.register({
      name: "openai",
      displayName: "OpenAI",
      driver: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      envKey: "OPENAI_API_KEY",
      defaultModel: "gpt-4o-mini",
      defaultEmbeddingModel: "text-embedding-3-small",
      availableModels: [
        "gpt-4o-mini",
        "gpt-4o",
        "o1-mini",
        "o3-mini",
      ],
      availableEmbeddingModels: [
        "text-embedding-3-small",
        "text-embedding-3-large",
      ],
    });

    // 4. Anthropic Claude Native Driver
    this.register({
      name: "anthropic",
      displayName: "Anthropic Claude",
      driver: "anthropic",
      envKey: "ANTHROPIC_API_KEY",
      defaultModel: "claude-3-7-sonnet-20250219",
      availableModels: [
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
      ],
    });

    // 5. Groq LPU Ultra-Fast Inference (Free Tier Open Models)
    this.register({
      name: "groq",
      displayName: "Groq",
      driver: "openai-compatible",
      baseUrl: "https://api.groq.com/openai/v1",
      envKey: "GROQ_API_KEY",
      defaultModel: "llama-3.3-70b-versatile",
      defaultEmbeddingModel: "liquid/lfm-2.5-embedding-350m:free",
      availableModels: [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama-3.2-3b-preview",
        "llama-3.2-1b-preview",
        "deepseek-r1-distill-llama-70b",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
      ],
      availableEmbeddingModels: [
        "liquid/lfm-2.5-embedding-350m:free",
      ],
    });

    // 6. DeepSeek Official
    this.register({
      name: "deepseek",
      displayName: "DeepSeek",
      driver: "openai-compatible",
      baseUrl: "https://api.deepseek.com",
      envKey: "DEEPSEEK_API_KEY",
      defaultModel: "deepseek-chat",
      defaultEmbeddingModel: "liquid/lfm-2.5-embedding-350m:free",
      availableModels: [
        "deepseek-chat",
        "deepseek-reasoner",
      ],
      availableEmbeddingModels: [
        "liquid/lfm-2.5-embedding-350m:free",
      ],
    });

    // 7. Ollama Local Self-Hosted Inference (100% Free Local Open-Source)
    this.register({
      name: "ollama",
      displayName: "Ollama (Local)",
      driver: "openai-compatible",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
      defaultModel: "llama3.3",
      defaultEmbeddingModel: "nomic-embed-text",
      availableModels: [
        "llama3.3",
        "llama3.2",
        "llama3.1",
        "deepseek-r1",
        "qwen2.5-coder",
        "mistral",
        "phi4",
        "gemma2",
      ],
      availableEmbeddingModels: [
        "nomic-embed-text",
        "all-minilm",
        "bge-m3",
        "mxbai-embed-large",
      ],
    });

    // 8. LM Studio Local Self-Hosted Inference (Port 1234)
    this.register({
      name: "lmstudio",
      displayName: "LM Studio (Local)",
      driver: "openai-compatible",
      baseUrl: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
      defaultModel: "local-model",
      defaultEmbeddingModel: "text-embedding-nomic-embed-text-v1.5",
      availableModels: [
        "local-model",
      ],
      availableEmbeddingModels: [
        "text-embedding-nomic-embed-text-v1.5",
        "bge-small-en-v1.5",
        "all-MiniLM-L6-v2",
        "liquid/lfm-2.5-embedding-350m:free",
      ],
    });

    // 9. Mistral AI Official Driver (OpenAI-compatible)
    this.register({
      name: "mistral",
      displayName: "Mistral AI",
      driver: "openai-compatible",
      baseUrl: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
      envKey: "MISTRAL_API_KEY",
      defaultModel: "mistral-large-latest",
      defaultEmbeddingModel: "mistral-embed",
      availableModels: [
        "mistral-large-latest",
        "mistral-small-latest",
        "codestral-latest",
        "open-mistral-nemo",
        "ministral-8b-latest",
        "ministral-3b-latest",
        "open-mixtral-8x22b",
        "open-mixtral-8x7b",
      ],
      availableEmbeddingModels: [
        "mistral-embed",
        "liquid/lfm-2.5-embedding-350m:free",
      ],
    });
  }

  /**
   * Register a new or custom provider descriptor.
   */
  public register(descriptor: ProviderDescriptor): void {
    this.descriptors.set(descriptor.name.toLowerCase(), descriptor);
  }

  /**
   * Register custom providers declared in YAML configuration.
   */
  public loadFromYamlConfig(customProviders?: Record<string, any>): void {
    if (!customProviders || typeof customProviders !== "object") return;

    for (const [name, config] of Object.entries(customProviders)) {
      if (!config || typeof config !== "object") continue;
      const lower = name.toLowerCase();

      this.register({
        name: lower,
        displayName: config.display_name || config.name || name,
        driver: config.driver || "openai-compatible",
        baseUrl: config.base_url || config.baseUrl,
        envKey: config.env_key || config.envKey,
        defaultModel: config.default_model || config.model || "default",
        defaultEmbeddingModel: config.default_embedding_model || config.embedding_model,
        availableModels: Array.isArray(config.available_models) ? config.available_models : [config.default_model || "default"],
        availableEmbeddingModels: Array.isArray(config.available_embedding_models) ? config.available_embedding_models : undefined,
        customHeaders: config.headers,
      });
    }
  }

  public getDescriptor(name: string): ProviderDescriptor | undefined {
    return this.descriptors.get(name.toLowerCase());
  }

  public listDescriptors(): ProviderDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /** Check if a provider has active credentials */
  public isAvailable(name: string): boolean {
    const desc = this.getDescriptor(name);
    if (!desc) return false;

    if (desc.name === "ollama" || desc.name === "lmstudio") return true; // Local inference needs no API key
    if (!desc.envKey) return true; // Custom local endpoints without keys

    const key = process.env[desc.envKey];
    if (desc.name === "gemini") {
      return Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
    }
    return Boolean(key);
  }

  public getAvailableProviders(): string[] {
    return Array.from(this.descriptors.keys()).filter((name) => this.isAvailable(name));
  }

  /**
   * Dynamic Factory: Create an AIProvider instance for any registered provider.
   */
  public createProvider(options: ProviderCreationOptions = {}): AIProvider {
    const requestedName = (options.provider || "").toLowerCase();
    const descriptor = this.getDescriptor(requestedName) || this.getDescriptor("openrouter") || this.descriptors.values().next().value;

    if (!descriptor) {
      throw new Error(`No provider descriptor found for "${requestedName}".`);
    }

    let apiKey =
      options.apiKey ||
      (descriptor.envKey ? process.env[descriptor.envKey] : "") ||
      (descriptor.name === "gemini" ? process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY : "") ||
      (descriptor.name === "ollama" || descriptor.name === "lmstudio" ? "local" : "");

    if (typeof apiKey === "string") {
      apiKey = apiKey.trim().replace(/^["']|["']$/g, "").trim();
    }

    const model = options.model || descriptor.defaultModel;
    const embeddingModel = options.embeddingModel || descriptor.defaultEmbeddingModel || "liquid/lfm-2.5-embedding-350m:free";

    switch (descriptor.driver) {
      case "gemini": {
        return new GeminiProvider({
          apiKey,
          model,
          embeddingModel,
        });
      }

      case "anthropic": {
        return new AnthropicProvider({
          apiKey,
          model,
          embeddingModel,
        });
      }

      case "openai-compatible":
      default: {
        return new OpenAIProvider({
          apiKey,
          baseUrl: options.baseUrl || descriptor.baseUrl,
          model,
          embeddingModel,
          providerType: descriptor.name as ProviderType,
        });
      }
    }
  }

  private dynamicModelsCache: Map<string, { models: string[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

  /**
   * Invalidate dynamic model cache across all providers.
   */
  public clearCaches(): void {
    this.dynamicModelsCache.clear();
  }

  /**
   * Dynamically fetch live available models from the provider's API.
   */
  public async fetchDynamicModels(providerName: string): Promise<string[]> {
    const name = providerName.toLowerCase();
    const cached = this.dynamicModelsCache.get(name);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.models;
    }

    const desc = this.getDescriptor(name);
    const fallback = desc?.availableModels || [desc?.defaultModel || "default"];

    try {
      let fetched: string[] = [];

      if (name === "gemini") {
        const rawKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        const apiKey = typeof rawKey === "string" ? rawKey.trim().replace(/^["']|["']$/g, "").trim() : rawKey;
        if (apiKey) {
          const { GoogleGenAI } = await import("@google/genai");
          const client = new GoogleGenAI({ apiKey });
          const pager = await client.models.list();
          const list: string[] = [];
          for await (const m of pager) {
            const id = (m.name || "").replace("models/", "");
            if (
              id &&
              id.startsWith("gemini-") &&
              !id.includes("preview-tts") &&
              !id.includes("tts-preview") &&
              !id.includes("embedding") &&
              !id.includes("audio-preview")
            ) {
              list.push(id);
            }
          }
          if (list.length > 0) fetched = list;
        }
      } else if (name === "openrouter") {
        const res = await fetch("https://openrouter.ai/api/v1/models");
        if (res.ok) {
          const json = (await res.json()) as any;
          const free = (json.data || [])
            .filter((m: any) => m.id?.endsWith(":free") || m.pricing?.prompt === "0" || m.pricing?.prompt === 0)
            .map((m: any) => m.id);
          if (free.length > 0) fetched = free;
        }
      } else if (name === "ollama") {
        const baseUrl = desc?.baseUrl || "http://localhost:11434/v1";
        const rootUrl = baseUrl.replace(/\/v1\/?$/, "");
        const res = await fetch(`${rootUrl}/api/tags`).catch(() => null);
        if (res && res.ok) {
          const json = (await res.json()) as any;
          const models = (json.models || []).map((m: any) => m.name);
          if (models.length > 0) fetched = models;
        }
      } else if (name === "lmstudio") {
        const baseUrl = desc?.baseUrl || "http://localhost:1234/v1";
        const rootUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
        const res = await fetch(`${rootUrl}/models`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
        if (res && res.ok) {
          const json = (await res.json()) as any;
          const models = (json.data || []).map((m: any) => m.id);
          if (models.length > 0) fetched = models;
        }
      } else if (desc?.driver === "openai-compatible") {
        const apiKey = (desc.envKey ? process.env[desc.envKey] : "") || "key";
        if (desc.baseUrl && apiKey && apiKey !== "key") {
          const OpenAI = (await import("openai")).default;
          const client = new OpenAI({ apiKey, baseURL: desc.baseUrl });
          const res = await client.models.list();
          let list = res.data.map((m) => m.id);
          if (name === "groq") {
            // Filter out specialized audio/TTS models or models requiring special console terms
            list = list.filter((id) => !id.startsWith("canopylabs/") && !id.includes("whisper") && !id.includes("orpheus"));
          }
          if (list.length > 0) fetched = list;
        }
      }

      if (fetched.length > 0) {
        // Merge with descriptor defaults to ensure curated favorites remain visible
        const combined = Array.from(new Set([...fetched, ...fallback]));
        this.dynamicModelsCache.set(name, { models: combined, timestamp: Date.now() });
        return combined;
      }
    } catch {
      // Fallback silently to static list on network/API failure
    }

    return fallback;
  }

  /**
   * Get all provider models dynamically with background live refresh.
   */
  public async getAllProviderModelsAsync(): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    const providers = Array.from(this.descriptors.keys());

    await Promise.all(
      providers.map(async (p) => {
        try {
          result[p] = await this.fetchDynamicModels(p);
        } catch {
          const desc = this.getDescriptor(p);
          result[p] = desc?.availableModels || [desc?.defaultModel || "default"];
        }
      })
    );

    return result;
  }

  /**
   * Get all registered models mapped by provider for UI dropdowns.
   */
  public getAllProviderModels(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [name, desc] of this.descriptors.entries()) {
      const cached = this.dynamicModelsCache.get(name);
      if (cached) {
        result[name] = cached.models;
      } else {
        result[name] = desc.availableModels && desc.availableModels.length > 0
          ? [...desc.availableModels]
          : [desc.defaultModel];
      }
    }
    return result;
  }

  private dynamicEmbeddingModelsCache: Map<string, { models: string[]; timestamp: number }> = new Map();

  /**
   * Dynamically fetch live available vector embedding models from the provider's API.
   */
  public async fetchDynamicEmbeddingModels(providerName: string): Promise<string[]> {
    const name = providerName.toLowerCase();
    const cached = this.dynamicEmbeddingModelsCache.get(name);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.models;
    }

    const desc = this.getDescriptor(name);
    const fallback = desc?.availableEmbeddingModels || (desc?.defaultEmbeddingModel ? [desc.defaultEmbeddingModel] : ["liquid/lfm-2.5-embedding-350m:free"]);

    try {
      let fetched: string[] = [];

      if (name === "gemini") {
        const rawKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        const apiKey = typeof rawKey === "string" ? rawKey.trim().replace(/^["']|["']$/g, "").trim() : rawKey;
        if (apiKey) {
          const { GoogleGenAI } = await import("@google/genai");
          const client = new GoogleGenAI({ apiKey });
          const pager = await client.models.list();
          const list: string[] = [];
          for await (const m of pager) {
            const id = (m.name || "").replace("models/", "");
            if (id && (id.includes("embedding") || id.includes("embed"))) {
              list.push(id);
            }
          }
          if (list.length > 0) fetched = list;
        }
      } else if (name === "openrouter") {
        const res = await fetch("https://openrouter.ai/api/v1/models");
        if (res.ok) {
          const json = (await res.json()) as any;
          const embeddingModels = (json.data || [])
            .filter((m: any) => m.id?.includes("embed") || m.id?.includes("bge") || m.id?.includes("lfm-2.5-embedding"))
            .map((m: any) => m.id);
          if (embeddingModels.length > 0) fetched = embeddingModels;
        }
      } else if (name === "ollama") {
        const baseUrl = desc?.baseUrl || "http://localhost:11434/v1";
        const rootUrl = baseUrl.replace(/\/v1\/?$/, "");
        const res = await fetch(`${rootUrl}/api/tags`).catch(() => null);
        if (res && res.ok) {
          const json = (await res.json()) as any;
          const models = (json.models || [])
            .map((m: any) => m.name)
            .filter((m: string) => m.includes("embed") || m.includes("nomic") || m.includes("bge") || m.includes("minilm") || m.includes("mxbai"));
          if (models.length > 0) fetched = models;
        }
      } else if (name === "openai") {
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey) {
          const OpenAI = (await import("openai")).default;
          const client = new OpenAI({ apiKey });
          const res = await client.models.list();
          const list = res.data.map((m) => m.id).filter((id) => id.includes("embedding") || id.startsWith("text-embedding"));
          if (list.length > 0) fetched = list;
        }
      } else if (name === "mistral") {
        const rawKey = process.env.MISTRAL_API_KEY;
        const apiKey = typeof rawKey === "string" ? rawKey.trim().replace(/^["']|["']$/g, "").trim() : rawKey;
        if (apiKey) {
          const OpenAI = (await import("openai")).default;
          const client = new OpenAI({ apiKey, baseURL: desc?.baseUrl || "https://api.mistral.ai/v1" });
          const res = await client.models.list();
          const list = res.data.map((m) => m.id).filter((id) => id.includes("embed"));
          if (list.length > 0) fetched = list;
        }
      } else if (name === "lmstudio") {
        const baseUrl = desc?.baseUrl || "http://localhost:1234/v1";
        const rootUrl = baseUrl.replace(/\/v1\/?$/, "");
        const res = await fetch(`${rootUrl}/v1/models`).catch(() => null);
        if (res && res.ok) {
          const json = (await res.json()) as any;
          const models = (json.data || [])
            .map((m: any) => m.id)
            .filter((id: string) => id.includes("embed") || id.includes("nomic") || id.includes("bge") || id.includes("minilm"));
          if (models.length > 0) fetched = models;
        }
      }

      if (fetched.length > 0) {
        const combined = Array.from(new Set([...fallback, ...fetched]));
        this.dynamicEmbeddingModelsCache.set(name, { models: combined, timestamp: Date.now() });
        return combined;
      }
    } catch {
      // Fallback silently
    }

    return fallback;
  }

  /**
   * Get all provider embedding models dynamically with background live refresh.
   */
  public async getAllProviderEmbeddingModelsAsync(): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    const providers = Array.from(this.descriptors.keys());

    await Promise.all(
      providers.map(async (p) => {
        try {
          result[p] = await this.fetchDynamicEmbeddingModels(p);
        } catch {
          const desc = this.getDescriptor(p);
          result[p] = desc?.availableEmbeddingModels || (desc?.defaultEmbeddingModel ? [desc.defaultEmbeddingModel] : ["liquid/lfm-2.5-embedding-350m:free"]);
        }
      })
    );

    return result;
  }

  /**
   * Get all registered embedding models mapped by provider for UI dropdowns.
   */
  public getAllProviderEmbeddingModels(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [name, desc] of this.descriptors.entries()) {
      const cached = this.dynamicEmbeddingModelsCache.get(name);
      if (cached) {
        result[name] = cached.models;
      } else if (desc.availableEmbeddingModels && desc.availableEmbeddingModels.length > 0) {
        result[name] = [...desc.availableEmbeddingModels];
      } else if (desc.defaultEmbeddingModel) {
        result[name] = [desc.defaultEmbeddingModel];
      }
    }
    return result;
  }
}
