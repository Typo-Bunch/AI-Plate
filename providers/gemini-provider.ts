/**
 * Google Gemini Provider Implementation.
 *
 * Implements the Universal AIProvider interface using `@google/genai`.
 * Supports function calling and native Gemini embeddings (`gemini-embedding-2`).
 */

import { GoogleGenAI } from "@google/genai";
import type {
  AIProvider,
  FunctionCallRequest,
  FunctionExecutionResponse,
  LLMTurnResult,
  ProviderType,
} from "../core/ai-provider.js";
import type { ToolSchema } from "../core/types.js";
import { CONFIG } from "../core/config.js";

function sanitizeSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map(sanitizeSchemaForGemini);
  }

  const copy: Record<string, any> = { ...schema };

  // Gemini strictly requires "items" schema for any array type
  if (copy.type === "array") {
    if (!copy.items || typeof copy.items !== "object") {
      copy.items = { type: "string" };
    } else {
      copy.items = sanitizeSchemaForGemini(copy.items);
    }
  }

  // Recursively sanitize nested properties
  if (copy.properties && typeof copy.properties === "object") {
    const sanitizedProps: Record<string, any> = {};
    for (const [key, val] of Object.entries(copy.properties)) {
      sanitizedProps[key] = sanitizeSchemaForGemini(val);
    }
    copy.properties = sanitizedProps;
  }

  // Recursively sanitize items if defined
  if (copy.items && typeof copy.items === "object" && copy.type !== "array") {
    copy.items = sanitizeSchemaForGemini(copy.items);
  }

  return copy;
}

export class GeminiProvider implements AIProvider {
  public readonly providerType: ProviderType = "gemini";
  public readonly model: string;
  public readonly embeddingModel: string;
  private readonly client: GoogleGenAI;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private chatSession: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private chatConfig: Record<string, unknown> = {};

  constructor(options: {
    apiKey: string;
    model?: string;
    embeddingModel?: string;
  }) {
    const cleanApiKey = (options.apiKey || "").trim().replace(/^["']|["']$/g, "").trim();
    if (!cleanApiKey) {
      throw new Error("Google API key is required for GeminiProvider.");
    }
    this.client = new GoogleGenAI({ apiKey: cleanApiKey });
    this.model = options.model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    this.embeddingModel = options.embeddingModel || process.env.GEMINI_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "gemini-embedding-2";
  }

  createChat(systemPrompt: string, tools: ToolSchema[]): void {
    const functionDeclarations = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: sanitizeSchemaForGemini(t.parametersJsonSchema),
    }));

    const config: Record<string, unknown> = {
      systemInstruction: systemPrompt,
    };

    if (this.model.includes("thinking") || this.model.includes("2.5")) {
      config.thinkingConfig = {
        thinkingBudget: 8192,
      };
    }

    if (functionDeclarations.length > 0) {
      config.tools = [{ functionDeclarations }];
    }

    this.chatConfig = config;
    this.chatSession = this.client.chats.create({
      model: this.model,
      config,
    });
  }

  loadConversationHistory(
    messages: ReadonlyArray<{ role: "user" | "model"; content: string }>
  ): void {
    const history = messages.map((m) => ({
      role: m.role === "model" ? "model" : "user",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parts: [{ text: m.content }] as any,
    }));

    // Gemini requires history to begin with a user turn.
    while (history.length > 0 && history[0].role !== "user") {
      history.shift();
    }

    this.chatSession = this.client.chats.create({
      model: this.model,
      config: this.chatConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: history as any,
    });
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = CONFIG.RETRY.MAX_RETRIES,
    delayMs = CONFIG.RETRY.GEMINI_INITIAL_DELAY_MS
  ): Promise<T> {
    let lastErr: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || "");
        const isRateLimit =
          err?.status === "RESOURCE_EXHAUSTED" ||
          err?.code === 429 ||
          err?.status === 429 ||
          msg.includes("429") ||
          msg.includes("quota") ||
          msg.includes("RESOURCE_EXHAUSTED");

        if (isRateLimit && attempt < maxRetries) {
          // Check if retry delay was suggested in error message
          let wait = Math.min(CONFIG.RETRY.MAX_DELAY_MS, delayMs * Math.pow(2, attempt));
          const match = msg.match(/retry in ([0-9.]+)s/i);
          if (match && match[1]) {
            const sec = Math.min(CONFIG.RETRY.MAX_DELAY_MS / 1000, Math.ceil(parseFloat(match[1])));
            if (sec > 0) wait = sec * 1000;
          }
          console.warn(`[GEMINI] Rate limit reached. Retrying in ${(wait / 1000).toFixed(0)}s (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async sendMessage(userMessage: string): Promise<LLMTurnResult> {
    if (!this.chatSession) {
      throw new Error("Chat session not initialized. Call createChat() first.");
    }

    const response = await this.withRetry(() =>
      this.chatSession.sendMessage({
        message: userMessage,
      })
    );

    return this.parseGeminiResponse(response);
  }

  async sendFunctionResponses(
    responses: FunctionExecutionResponse[]
  ): Promise<LLMTurnResult> {
    if (!this.chatSession) {
      throw new Error("Chat session not initialized. Call createChat() first.");
    }

    const functionResponseParts = responses.map((r) => ({
      functionResponse: {
        name: r.name,
        response: r.response,
      },
    }));

    const response = await this.withRetry(() =>
      this.chatSession.sendMessage({
        message: functionResponseParts,
      })
    );
    return this.parseGeminiResponse(response);
  }

  async embed(text: string): Promise<Float32Array> {
    const safeText = text.slice(0, 2048);
    try {
      const res = await this.client.models.embedContent({
        model: this.embeddingModel,
        contents: safeText,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = res as any;
      const values =
        data.embedding?.values ||
        (data.embeddings && data.embeddings[0]?.values);

      if (values && values.length > 0) {
        return new Float32Array(values);
      }
    } catch {
      // Gracefully fall back to deterministic feature hash vector
    }

    // Resilient fallback: generate normalized feature hash vector (768-dim)
    const dim = 768;
    const vec = new Float32Array(dim);
    for (let i = 0; i < safeText.length; i++) {
      const code = safeText.charCodeAt(i);
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

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    const batchSize = 10;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...batchResults);
    }

    return results;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseGeminiResponse(response: any): LLMTurnResult {
    const candidates = response.candidates;
    const parts = candidates?.[0]?.content?.parts ?? [];

    const textParts = parts
      .filter((p: any) => typeof p.text === "string" && p.text.trim().length > 0)
      .map((p: any) => p.text.trim());
    const text = textParts.length > 0 ? textParts.join("\n") : null;

    const functionCalls: FunctionCallRequest[] = [];

    if (response.functionCalls && response.functionCalls.length > 0) {
      for (const call of response.functionCalls) {
        functionCalls.push({
          id: call.id,
          name: call.name,
          args: (call.args as Record<string, unknown>) ?? {},
        });
      }
    }

    const usageMetadata = response.usageMetadata;
    const usage = usageMetadata
      ? {
          promptTokens: usageMetadata.promptTokenCount,
          completionTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount,
        }
      : undefined;

    return { text, functionCalls, usage };
  }
}
