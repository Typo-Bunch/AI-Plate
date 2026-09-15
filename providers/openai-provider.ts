/**
 * OpenAI & OpenAI-Compatible Provider Implementation.
 *
 * Supports:
 *   - Official OpenAI (GPT-4o, GPT-4o-mini, o1, o3-mini)
 *   - Groq (llama-3.3-70b-versatile, mixtral-8x7b-32768)
 *   - DeepSeek (deepseek-chat, deepseek-reasoner)
 *   - Ollama (Local LLMs via http://localhost:11434/v1)
 *   - OpenRouter (openrouter/auto or any model)
 *   - Any standard OpenAI-compatible REST server
 */

import OpenAI from "openai";
import type {
  AIProvider,
  FunctionCallRequest,
  FunctionExecutionResponse,
  LLMTurnResult,
  ProviderType,
} from "../core/ai-provider.js";
import type { ToolSchema } from "../core/types.js";
import { CONFIG } from "../core/config.js";

export class OpenAIProvider implements AIProvider {
  public readonly providerType: ProviderType;
  public readonly model: string;
  public readonly embeddingModel: string;
  private readonly client: OpenAI;
  private systemPrompt: string = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private openAiTools: OpenAI.Chat.ChatCompletionTool[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private messageHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  constructor(options: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    embeddingModel?: string;
    providerType?: ProviderType;
  }) {
    const rawApiKey = options.apiKey || process.env.OPENAI_API_KEY || "ollama";
    const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim().replace(/^["']|["']$/g, "").trim() : rawApiKey;
    this.providerType = options.providerType || "openai";

    // Auto-resolve defaults based on provider type
    if (this.providerType === "ollama") {
      this.model = options.model || process.env.OLLAMA_MODEL || "llama3.3";
      this.embeddingModel = options.embeddingModel || process.env.OLLAMA_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "nomic-embed-text";
    } else if (this.providerType === "openrouter") {
      this.model = options.model || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
      this.embeddingModel = options.embeddingModel || process.env.OPENROUTER_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "liquid/lfm-2.5-embedding-350m:free";
    } else if (this.providerType === "groq") {
      this.model = options.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      this.embeddingModel = options.embeddingModel || process.env.GROQ_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "liquid/lfm-2.5-embedding-350m:free";
    } else if (this.providerType === "deepseek") {
      this.model = options.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
      this.embeddingModel = options.embeddingModel || process.env.DEEPSEEK_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "liquid/lfm-2.5-embedding-350m:free";
    } else {
      this.model = options.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
      this.embeddingModel = options.embeddingModel || process.env.OPENAI_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "text-embedding-3-small";
    }

    const defaultHeaders: Record<string, string> = {};
    if (this.providerType === "openrouter") {
      defaultHeaders["HTTP-Referer"] = "https://github.com/universal-agent-harness";
      defaultHeaders["X-Title"] = "Universal Agent Harness";
    }

    const isLocal =
      this.providerType === "ollama" ||
      this.providerType === "lmstudio" ||
      (options.baseUrl && (options.baseUrl.includes("localhost") || options.baseUrl.includes("127.0.0.1")));
    const clientTimeout = isLocal ? 300_000 : 120_000;

    this.client = new OpenAI({
      apiKey,
      baseURL: options.baseUrl,
      defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
      timeout: clientTimeout,
      maxRetries: 0, // We handle retries ourselves in withRetry()
    });
  }

  createChat(systemPrompt: string, tools: ToolSchema[]): void {
    this.systemPrompt = systemPrompt;
    this.messageHistory = [{ role: "system", content: systemPrompt }];

    this.openAiTools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parametersJsonSchema as unknown as OpenAI.FunctionParameters,
      },
    }));
  }

  loadConversationHistory(
    messages: ReadonlyArray<{ role: "user" | "model"; content: string }>
  ): void {
    this.messageHistory = [{ role: "system", content: this.systemPrompt }];
    for (const m of messages) {
      this.messageHistory.push({
        role: m.role === "model" ? "assistant" : "user",
        content: m.content,
      });
    }
  }

  async sendMessage(userMessage: string): Promise<LLMTurnResult> {
    this.messageHistory.push({ role: "user", content: userMessage });

    const payload: any = {
      model: this.model,
      messages: this.messageHistory,
      tools: this.openAiTools.length > 0 ? this.openAiTools : undefined,
      tool_choice: this.openAiTools.length > 0 ? "auto" : undefined,
    };

    if (this.model.startsWith("o1") || this.model.startsWith("o3")) {
      payload.reasoning_effort = "high";
    }

    if (this.providerType === "openrouter") {
      payload.extra_body = { include_reasoning: true };
    }

    const completion = await this.withRetry(() =>
      this.client.chat.completions.create(payload)
    );

    const choice = completion.choices[0];
    const message = choice.message;

    // Append assistant's response to history
    this.messageHistory.push(message);

    const usage = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined;

    return this.parseOpenAiResponse(message, usage);
  }

  async sendFunctionResponses(
    responses: FunctionExecutionResponse[]
  ): Promise<LLMTurnResult> {
    for (const res of responses) {
      this.messageHistory.push({
        role: "tool",
        tool_call_id: res.id || `call_${res.name}_${Date.now()}`,
        content: JSON.stringify(res.response),
      });
    }

    const payload: any = {
      model: this.model,
      messages: this.messageHistory,
      tools: this.openAiTools.length > 0 ? this.openAiTools : undefined,
    };

    if (this.model.startsWith("o1") || this.model.startsWith("o3")) {
      payload.reasoning_effort = "high";
    }

    if (this.providerType === "openrouter") {
      payload.extra_body = { include_reasoning: true };
    }

    const completion = await this.withRetry(() =>
      this.client.chat.completions.create(payload)
    );

    const choice = completion.choices[0];
    const message = choice.message;

    this.messageHistory.push(message);

    const usage = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined;

    return this.parseOpenAiResponse(message, usage);
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = CONFIG.RETRY.MAX_RETRIES,
    delayMs = CONFIG.RETRY.OPENAI_INITIAL_DELAY_MS
  ): Promise<T> {
    let lastErr: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const isRateLimit =
          err?.status === 429 ||
          err?.code === 429 ||
          (err?.status === 400 && String(err?.message || "").includes("rate limit")) ||
          String(err?.message || "").includes("Rate limit");

        if (isRateLimit && attempt < maxRetries) {
          const wait = Math.min(CONFIG.RETRY.MAX_DELAY_MS, delayMs * Math.pow(2, attempt));
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async embed(text: string): Promise<Float32Array> {
    // Liquid LFM embedding model maximum is 512 tokens (~1400 chars). Truncate safely using CONFIG knob.
    const maxChars = this.embeddingModel.includes("liquid")
      ? CONFIG.EMBEDDING.LIQUID_MAX_CHARS
      : CONFIG.EMBEDDING.DEFAULT_MAX_CHARS;
    const safeText = text.slice(0, maxChars);

    try {
      const res = await this.withRetry(
        () =>
          this.client.embeddings.create({
            model: this.embeddingModel,
            input: safeText,
          }),
        1,
        CONFIG.RETRY.OPENAI_INITIAL_DELAY_MS
      );
      const values = res.data[0].embedding;
      return new Float32Array(values);
    } catch {
      // Graceful fallback: generate normalized feature hash vector
      const dim = 1024;
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
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const maxChars = this.embeddingModel.includes("liquid")
      ? CONFIG.EMBEDDING.LIQUID_MAX_CHARS
      : CONFIG.EMBEDDING.DEFAULT_MAX_CHARS;
    const safeTexts = texts.map((t) => t.slice(0, maxChars));

    const batchSize = 32; // Optimal batch size accepted by OpenRouter / OpenAI
    const concurrency = 4; // Number of parallel batch requests
    const results: Float32Array[] = new Array(safeTexts.length);

    // Split texts into manageable batches
    const batches: { startIndex: number; items: string[] }[] = [];
    for (let i = 0; i < safeTexts.length; i += batchSize) {
      batches.push({
        startIndex: i,
        items: safeTexts.slice(i, i + batchSize),
      });
    }

    // Process batches with controlled concurrency
    for (let i = 0; i < batches.length; i += concurrency) {
      const slice = batches.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async (batch) => {
          try {
            const res = await this.withRetry(
              () =>
                this.client.embeddings.create({
                  model: this.embeddingModel,
                  input: batch.items,
                }),
              2,
              CONFIG.RETRY.OPENAI_INITIAL_DELAY_MS
            );
            res.data.forEach((d, idx) => {
              results[batch.startIndex + idx] = new Float32Array(d.embedding);
            });
          } catch {
            // Fallback for this individual sub-batch: embed sequentially with fallback hash
            for (let j = 0; j < batch.items.length; j++) {
              results[batch.startIndex + j] = await this.embed(batch.items[j]);
            }
          }
        })
      );
    }

    return results;
  }

  private parseOpenAiResponse(
    message: OpenAI.Chat.ChatCompletionMessage,
    usage?: import("../core/ai-provider.js").TokenUsage
  ): LLMTurnResult {
    const text = message.content ? message.content.trim() : null;
    const functionCalls: FunctionCallRequest[] = [];

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        if (call.type === "function") {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(call.function.arguments || "{}");
          } catch {
            parsedArgs = {};
          }

          functionCalls.push({
            id: call.id,
            name: call.function.name,
            args: parsedArgs,
          });
        }
      }
    }

    return { text, functionCalls, usage };
  }
}
