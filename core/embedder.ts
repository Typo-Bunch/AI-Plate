/**
 * Universal Embedder — Provider-Agnostic Vector Embedding Service.
 *
 * Supports Liquid LFM 2.5 Embed (liquid/lfm-2.5-embedding-350m:free),
 * Gemini Embeddings, OpenAI, Ollama, and any custom embedding provider.
 * Used for SQLite RAG and Session Memory vector storage and similarity search.
 */

import type { AIProvider, ProviderType } from "./ai-provider.js";
import { createAIProvider, createEmbeddingProvider, detectEmbeddingProviderType } from "../providers/provider-factory.js";
import { CONFIG } from "./config.js";

export class UniversalEmbedder {
  private static instance: UniversalEmbedder | null = null;
  private provider: AIProvider | null = null;
  private dedicatedEmbedder: AIProvider | null = null;
  private configuredModel: string;
  private configuredProvider?: ProviderType;

  private constructor(provider?: AIProvider) {
    if (provider) {
      this.provider = provider;
    }
    this.configuredModel = CONFIG.EMBEDDING.DEFAULT_MODEL;
    this.configuredProvider = CONFIG.EMBEDDING.DEFAULT_PROVIDER;
  }

  public static getInstance(provider?: AIProvider): UniversalEmbedder {
    if (!UniversalEmbedder.instance) {
      UniversalEmbedder.instance = new UniversalEmbedder(provider);
    } else if (provider) {
      UniversalEmbedder.instance.provider = provider;
    }
    return UniversalEmbedder.instance;
  }

  /**
   * Dynamically update the active embedding model and optional provider at runtime.
   */
  public setEmbeddingModel(model: string, provider?: ProviderType): void {
    const trimmed = model.trim();
    if (!trimmed) return;

    this.configuredModel = trimmed;
    this.configuredProvider = provider || detectEmbeddingProviderType(trimmed);
    this.dedicatedEmbedder = null; // Recreate on next call
  }

  /**
   * Update the fallback primary AI Provider.
   */
  public setProvider(provider: AIProvider): void {
    this.provider = provider;
    // Note: Do not overwrite this.dedicatedEmbedder with the LLM provider.
    // The vector embedding model/provider are configured independently from the reasoning LLM.
  }

  private getEmbedder(): AIProvider {
    if (this.dedicatedEmbedder) return this.dedicatedEmbedder;

    try {
      this.dedicatedEmbedder = createEmbeddingProvider({
        embeddingModel: this.configuredModel,
        provider: this.configuredProvider,
      });
      return this.dedicatedEmbedder;
    } catch (err) {
      console.warn(`[UniversalEmbedder] Dedicated embedder initialization failed for model "${this.configuredModel}": ${err}. Falling back to primary provider.`);
    }

    if (this.provider) {
      return this.provider;
    }

    this.provider = createAIProvider();
    return this.provider;
  }

  public get embeddingModel(): string {
    return this.configuredModel || this.provider?.embeddingModel || CONFIG.EMBEDDING.DEFAULT_MODEL;
  }

  public get embeddingProvider(): string {
    return this.configuredProvider || this.dedicatedEmbedder?.providerType || detectEmbeddingProviderType(this.configuredModel, this.configuredProvider);
  }

  public async embed(text: string): Promise<Float32Array> {
    try {
      return await this.getEmbedder().embed(text);
    } catch (err) {
      console.warn(`[UniversalEmbedder] Primary embedding failed: ${err}. Using fallback vector.`);
      return this.fallbackVector(text);
    }
  }

  public async embedBatch(texts: string[]): Promise<Float32Array[]> {
    try {
      return await this.getEmbedder().embedBatch(texts);
    } catch (err) {
      console.warn(`[UniversalEmbedder] Batch embedding failed: ${err}. Using sequential fallback.`);
      const results: Float32Array[] = [];
      for (const t of texts) {
        results.push(await this.embed(t));
      }
      return results;
    }
  }

  private fallbackVector(text: string): Float32Array {
    const dim = 1024;
    const vec = new Float32Array(dim);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[(i * 31 + code) % dim] += Math.sin(code * (i + 1));
    }
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) vec[i] /= norm;
    }
    return vec;
  }
}
