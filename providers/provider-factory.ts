/**
 * Universal AI Provider Factory.
 *
 * Automatically detects and instantiates the correct AI Provider based on:
 *   1. Explicit `AI_PROVIDER` configuration or environment variable.
 *   2. Model name heuristics (e.g. `gpt-4o` -> OpenAI, `claude-*` -> Anthropic, `llama*` -> Ollama).
 *   3. Available API keys in `.env`.
 */

import type { AIProvider, ProviderConfig, ProviderType } from "../core/ai-provider.js";
import { ProviderRegistry } from "./provider-registry.js";
import { CONFIG } from "../core/config.js";

/** Check if a provider has its required credentials / endpoint available */
export function isProviderAvailable(providerType: ProviderType): boolean {
  return ProviderRegistry.getInstance().isAvailable(providerType);
}

/** Get list of all available providers based on active environment credentials */
export function getAvailableProviders(): ProviderType[] {
  return ProviderRegistry.getInstance().getAvailableProviders() as ProviderType[];
}

/** Detect the provider type based on priority list, explicit config, and availability */
export function detectProviderType(config?: ProviderConfig): ProviderType {
  // 1. Explicit direct override (highest priority)
  if (config?.provider && (config.apiKey || isProviderAvailable(config.provider))) return config.provider;

  // 2. Active provider configured in config.yaml
  if (CONFIG.DEFAULT_PROVIDER && isProviderAvailable(CONFIG.DEFAULT_PROVIDER)) {
    return CONFIG.DEFAULT_PROVIDER;
  }

  // 3. Model name heuristics (e.g. "claude-*" -> anthropic, "gpt-*" -> openai)
  const model = (config?.model || "").toLowerCase();

  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3") || model.startsWith("text-embedding")) {
    if (isProviderAvailable("openai")) return "openai";
  }
  if (model.startsWith("claude-")) {
    if (isProviderAvailable("anthropic")) return "anthropic";
  }
  if (model.startsWith("openrouter/") || (model.includes("/") && isProviderAvailable("openrouter"))) {
    return "openrouter";
  }
  if (model.includes("groq") || (model.startsWith("llama") && isProviderAvailable("groq"))) {
    return "groq";
  }
  if (model.startsWith("deepseek")) {
    if (isProviderAvailable("deepseek")) return "deepseek";
  }
  if (
    model.startsWith("mistral") ||
    model.startsWith("codestral") ||
    model.startsWith("ministral") ||
    model.startsWith("open-mistral") ||
    model.startsWith("open-mixtral")
  ) {
    if (isProviderAvailable("mistral")) return "mistral";
  }
  if (model.startsWith("llama") || model.startsWith("mistral") || model.startsWith("qwen")) {
    if (process.env.OLLAMA_BASE_URL || (!isProviderAvailable("groq") && !isProviderAvailable("deepseek") && !isProviderAvailable("mistral"))) {
      return "ollama";
    }
  }

  // 4. Configurable Priority Chain from config.yaml
  for (const provider of CONFIG.DEFAULT_PROVIDER_PRIORITY) {
    if (isProviderAvailable(provider)) {
      return provider;
    }
  }

  // Default fallback
  return "gemini";
}

/** Detect which Provider should handle the given embedding model */
export function detectEmbeddingProviderType(embeddingModel?: string, explicitProvider?: ProviderType): ProviderType {
  // 1. Explicit direct override
  if (explicitProvider) return explicitProvider;

  // 2. Active embedding provider configured in config.yaml
  if (CONFIG.EMBEDDING.DEFAULT_PROVIDER && isProviderAvailable(CONFIG.EMBEDDING.DEFAULT_PROVIDER)) {
    return CONFIG.EMBEDDING.DEFAULT_PROVIDER;
  }

  const model = (embeddingModel || CONFIG.EMBEDDING.DEFAULT_MODEL || "").toLowerCase();

  // 3. Model name heuristics
  if (model.includes("liquid/") || model.startsWith("openrouter/") || (model.includes("/") && isProviderAvailable("openrouter"))) {
    if (isProviderAvailable("openrouter")) return "openrouter";
  }
  if ((model.startsWith("gemini-") || model.startsWith("text-embedding-004")) && isProviderAvailable("gemini")) {
    return "gemini";
  }
  if ((model.startsWith("mistral-embed") || model.includes("mistral-embed")) && isProviderAvailable("mistral")) {
    return "mistral";
  }
  if ((model.startsWith("nomic-") || model.startsWith("all-minilm") || model.startsWith("bge-") || model.startsWith("mxbai-")) && isProviderAvailable("ollama")) {
    return "ollama";
  }
  if ((model.startsWith("text-embedding-3") || model.startsWith("text-embedding-ada")) && isProviderAvailable("openai")) {
    return "openai";
  }

  // 4. Check OpenRouter first if key is present
  if (isProviderAvailable("openrouter")) {
    return "openrouter";
  }

  // 5. Check Gemini if key is present
  if (isProviderAvailable("gemini")) {
    return "gemini";
  }

  // 6. Fall back to standard provider detection
  return detectProviderType({ model, provider: explicitProvider });
}

/** Create an AI Provider instance based on configuration */
export function createAIProvider(config: ProviderConfig = {}): AIProvider {
  const providerType = detectProviderType(config);
  return ProviderRegistry.getInstance().createProvider({
    provider: providerType,
    model: config.model,
    embeddingModel: config.embeddingModel,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
}

/** Create a dedicated Embedding Provider instance */
export function createEmbeddingProvider(config: {
  provider?: ProviderType;
  embeddingModel?: string;
  apiKey?: string;
  baseUrl?: string;
} = {}): AIProvider {
  const embeddingModel = config.embeddingModel || process.env.EMBEDDING_MODEL || "liquid/lfm-2.5-embedding-350m:free";
  const providerType = detectEmbeddingProviderType(embeddingModel, config.provider);

  return createAIProvider({
    provider: providerType,
    embeddingModel,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
}
