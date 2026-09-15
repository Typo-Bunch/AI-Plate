import type {
  AIProvider,
  FunctionCallRequest,
  FunctionExecutionResponse,
  LLMTurnResult,
  ProviderType,
} from "../../core/ai-provider.js";
import type { ToolSchema } from "../../core/types.js";

export class MockAIProvider implements AIProvider {
  public readonly providerType: ProviderType = "custom";
  public readonly model: string = "mock-agent-v1";
  public readonly embeddingModel: string = "mock-embed-v1";

  public conversationHistory: Array<{ role: "user" | "model"; content: string }> = [];
  public registeredTools: ToolSchema[] = [];
  public systemPrompt: string = "";

  public nextTurnResponses: LLMTurnResult[] = [];
  public functionResponsesReceived: FunctionExecutionResponse[][] = [];

  createChat(systemPrompt: string, tools: ToolSchema[]): void {
    this.systemPrompt = systemPrompt;
    this.registeredTools = tools;
  }

  loadConversationHistory(
    messages: ReadonlyArray<{ role: "user" | "model"; content: string }>
  ): void {
    this.conversationHistory = [...messages];
  }

  async sendMessage(userMessage: string): Promise<LLMTurnResult> {
    this.conversationHistory.push({ role: "user", content: userMessage });

    if (this.nextTurnResponses.length > 0) {
      return this.nextTurnResponses.shift()!;
    }

    // Default conversational response
    return {
      text: `Mock response to: "${userMessage}"`,
      functionCalls: [],
      finishReason: "stop",
      usage: {
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      },
    };
  }

  async sendFunctionResponses(
    responses: FunctionExecutionResponse[]
  ): Promise<LLMTurnResult> {
    this.functionResponsesReceived.push(responses);

    if (this.nextTurnResponses.length > 0) {
      return this.nextTurnResponses.shift()!;
    }

    const toolSummary = responses.map((r) => `${r.name}: ${JSON.stringify(r.response)}`).join("; ");
    return {
      text: `Observation processed successfully: ${toolSummary}`,
      functionCalls: [],
      finishReason: "stop",
      usage: {
        promptTokens: 25,
        completionTokens: 12,
        totalTokens: 37,
      },
    };
  }

  async embed(text: string): Promise<Float32Array> {
    const vec = new Float32Array(64);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < 64; i++) {
      vec[i] = Math.sin(hash + i);
    }
    // Normalize vector
    let norm = 0;
    for (let i = 0; i < 64; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < 64; i++) vec[i] /= norm;
    }
    return vec;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
