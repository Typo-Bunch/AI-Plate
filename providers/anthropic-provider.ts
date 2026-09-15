/**
 * Anthropic Claude Provider Implementation.
 *
 * Implements the Universal AIProvider interface using `@anthropic-ai/sdk`.
 * Supports Claude 3.7 Sonnet, Claude 3.5 Haiku, Claude 3.5 Sonnet, and Claude 3 Opus
 * with native tool use.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  FunctionCallRequest,
  FunctionExecutionResponse,
  LLMTurnResult,
  ProviderType,
} from "../core/ai-provider.js";
import type { ToolSchema } from "../core/types.js";

export class AnthropicProvider implements AIProvider {
  public readonly providerType: ProviderType = "anthropic";
  public readonly model: string;
  public readonly embeddingModel: string;
  private readonly client: Anthropic;
  private systemPrompt: string = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private anthropicTools: Anthropic.Tool[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private messageHistory: Anthropic.MessageParam[] = [];

  constructor(options: {
    apiKey?: string;
    model?: string;
    embeddingModel?: string;
  }) {
    const rawApiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    const cleanApiKey = typeof rawApiKey === "string" ? rawApiKey.trim().replace(/^["']|["']$/g, "").trim() : "";
    if (!cleanApiKey) {
      throw new Error("Anthropic API key is required for AnthropicProvider.");
    }

    this.client = new Anthropic({ apiKey: cleanApiKey });
    this.model = options.model || "claude-3-7-sonnet-20250219";
    this.embeddingModel = options.embeddingModel || "fallback-embed";
  }

  createChat(systemPrompt: string, tools: ToolSchema[]): void {
    this.systemPrompt = systemPrompt;
    this.messageHistory = [];

    this.anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object",
        properties: (t.parametersJsonSchema.properties as Record<string, unknown>) || {},
        required: (t.parametersJsonSchema.required as string[]) || [],
      },
    }));
  }

  loadConversationHistory(
    messages: ReadonlyArray<{ role: "user" | "model"; content: string }>
  ): void {
    this.messageHistory = [];
    for (const m of messages) {
      this.messageHistory.push({
        role: m.role === "model" ? "assistant" : "user",
        content: m.content,
      });
    }
  }

  async sendMessage(userMessage: string): Promise<LLMTurnResult> {
    this.messageHistory.push({
      role: "user",
      content: userMessage,
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: this.systemPrompt,
      tools: this.anthropicTools.length > 0 ? this.anthropicTools : undefined,
      messages: this.messageHistory,
    });

    return this.parseAnthropicResponse(response);
  }

  async sendFunctionResponses(
    responses: FunctionExecutionResponse[]
  ): Promise<LLMTurnResult> {
    // Anthropic tool result format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResultBlocks: any[] = responses.map((r) => ({
      type: "tool_result",
      tool_use_id: r.id || `tool_${r.name}`,
      content: JSON.stringify(r.response),
    }));

    this.messageHistory.push({
      role: "user",
      content: toolResultBlocks,
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: this.systemPrompt,
      tools: this.anthropicTools.length > 0 ? this.anthropicTools : undefined,
      messages: this.messageHistory,
    });

    return this.parseAnthropicResponse(response);
  }

  async embed(text: string): Promise<Float32Array> {
    // Anthropic doesn't have an embeddings API; generate normalized feature hash
    const dim = 1536;
    const vec = new Float32Array(dim);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[(i * 31 + code) % dim] += Math.sin(code * (i + 1));
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) vec[i] /= norm;
    }
    return vec;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseAnthropicResponse(response: any): LLMTurnResult {
    let text: string | null = null;
    const functionCalls: FunctionCallRequest[] = [];

    // Save assistant message to history
    this.messageHistory.push({
      role: "assistant",
      content: response.content,
    });

    for (const block of response.content) {
      if (block.type === "text") {
        text = (text ? text + "\n" : "") + block.text;
      } else if (block.type === "tool_use") {
        functionCalls.push({
          id: block.id,
          name: block.name,
          args: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    const usage = response.usage
      ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        }
      : undefined;

    return { text, functionCalls, usage };
  }
}
