/**
 * Intelligent Context Compressor — Token Optimizer & Working Context Compactor.
 *
 * Designed for AI Plate to manage LLM token budgets dynamically and non-invasively:
 *   1. Token Estimation & Budgeting (fast heuristic without external API dependencies).
 *   2. Tool Output Compression (head-tail truncation & structural JSON compacting).
 *   3. Prompt & Retrieved Context Optimization (RAG + session memory relevance filtering).
 *   4. Multi-Turn History Compaction (anchor preservation + sliding window with summarization).
 *
 * Core Guarantee: Fully backward-compatible. When context is below threshold or when
 * compression is disabled, inputs pass through completely untouched.
 */

import { CONFIG } from "./config.js";
import type { FunctionExecutionResponse } from "./ai-provider.js";

// ─── Types & Configuration ──────────────────────────────────────────

export type CompressionMode = "smart" | "extractive" | "sliding_window";

export interface ContextCompressorConfig {
  /** Whether intelligent context compression is active */
  enabled: boolean;
  /** Compression strategy mode */
  mode: CompressionMode;
  /** Maximum token budget for injected RAG + session memory prompt context */
  maxPromptTokens: number;
  /** Number of conversation turns before older history is condensed */
  maxHistoryTurns: number;
  /** Maximum character length per tool execution response before compacting */
  maxToolOutputChars: number;
  /** Number of recent turns to always keep verbatim in conversation history */
  preserveRecentTurns: number;
  /** Whether to compress oversized tool outputs in the reasoning loop */
  enableToolCompression: boolean;
  /** Whether to deduplicate and density-prune retrieved RAG chunks */
  enableRagCompression: boolean;
}

export interface CompressionStats {
  totalCompressions: number;
  estimatedTokensSaved: number;
  promptCompressions: number;
  toolCompressions: number;
  historyCompressions: number;
  lastCompressionTimestamp?: string;
}

export interface ConversationTurn {
  role: "user" | "model";
  content: string;
}

// ─── Default Stop Words for Fast Query Salience ─────────────────────

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were",
  "will", "with", "this", "but", "they", "have", "had", "what", "when", "where",
  "who", "which", "why", "how", "all", "any", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "can", "just", "should", "now", "please"
]);

// ─── Intelligent Context Compressor ─────────────────────────────────

export class ContextCompressor {
  private static instance: ContextCompressor | null = null;
  private config: ContextCompressorConfig;
  private stats: CompressionStats = {
    totalCompressions: 0,
    estimatedTokensSaved: 0,
    promptCompressions: 0,
    toolCompressions: 0,
    historyCompressions: 0,
  };
  private sessionTokensSaved = new Map<string, number>();

  constructor(customConfig?: Partial<ContextCompressorConfig>) {
    const yamlConf = (CONFIG as any).CONTEXT_COMPRESSOR || {};
    this.config = {
      enabled: customConfig?.enabled ?? yamlConf.ENABLED ?? true,
      mode: customConfig?.mode ?? yamlConf.MODE ?? "smart",
      maxPromptTokens: customConfig?.maxPromptTokens ?? yamlConf.MAX_PROMPT_TOKENS ?? 8192,
      maxHistoryTurns: customConfig?.maxHistoryTurns ?? yamlConf.MAX_HISTORY_TURNS ?? 20,
      maxToolOutputChars: customConfig?.maxToolOutputChars ?? yamlConf.MAX_TOOL_OUTPUT_CHARS ?? 4000,
      preserveRecentTurns: customConfig?.preserveRecentTurns ?? yamlConf.PRESERVE_RECENT_TURNS ?? 6,
      enableToolCompression: customConfig?.enableToolCompression ?? yamlConf.ENABLE_TOOL_COMPRESSION ?? true,
      enableRagCompression: customConfig?.enableRagCompression ?? yamlConf.ENABLE_RAG_COMPRESSION ?? true,
    };
  }

  public static getInstance(): ContextCompressor {
    if (!ContextCompressor.instance) {
      ContextCompressor.instance = new ContextCompressor();
    }
    return ContextCompressor.instance;
  }

  // ─── Token Estimation ─────────────────────────────────────────────

  /**
   * Fast, deterministic token count estimation.
   * On average in English and programming code: ~3.8 characters per token.
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    const len = text.length;
    if (len === 0) return 0;
    return Math.max(1, Math.ceil(len / 3.8));
  }

  // ─── Tool Output Compression ──────────────────────────────────────

  /**
   * Intelligently compresses a single tool output (string or JSON object)
   * if its size exceeds `maxToolOutputChars`.
   */
  public compressToolOutput(
    toolName: string,
    output: Record<string, unknown> | string,
    customMaxChars?: number,
    sessionId?: string
  ): {
    compressed: Record<string, unknown> | string;
    wasCompressed: boolean;
    originalTokens: number;
    compressedTokens: number;
  } {
    const maxChars = customMaxChars ?? this.config.maxToolOutputChars;

    if (!this.config.enabled || !this.config.enableToolCompression) {
      const origTok = this.estimateTokens(typeof output === "string" ? output : JSON.stringify(output));
      return { compressed: output, wasCompressed: false, originalTokens: origTok, compressedTokens: origTok };
    }

    if (typeof output === "string") {
      const origTokens = this.estimateTokens(output);
      if (output.length <= maxChars) {
        return { compressed: output, wasCompressed: false, originalTokens: origTokens, compressedTokens: origTokens };
      }

      const compressedText = this.headTailCompressString(output, maxChars, toolName);
      const compTokens = this.estimateTokens(compressedText);
      const tokensSaved = Math.max(0, origTokens - compTokens);

      this.recordCompression("tool", tokensSaved, sessionId);
      return { compressed: compressedText, wasCompressed: true, originalTokens: origTokens, compressedTokens: compTokens };
    }

    // Handle structured JSON/Record output
    const jsonStr = JSON.stringify(output);
    const origTokens = this.estimateTokens(jsonStr);

    if (jsonStr.length <= maxChars) {
      return { compressed: output, wasCompressed: false, originalTokens: origTokens, compressedTokens: origTokens };
    }

    const compressedObj = this.compressJsonObject(output, maxChars, toolName);
    const compJsonStr = JSON.stringify(compressedObj);
    const compTokens = this.estimateTokens(compJsonStr);
    const tokensSaved = Math.max(0, origTokens - compTokens);

    this.recordCompression("tool", tokensSaved, sessionId);
    return { compressed: compressedObj, wasCompressed: true, originalTokens: origTokens, compressedTokens: compTokens };
  }

  /**
   * Compress an array of tool execution responses before passing back to LLM.
   */
  public compressFunctionResponses(
    responses: FunctionExecutionResponse[],
    customMaxChars?: number,
    sessionId?: string
  ): FunctionExecutionResponse[] {
    if (!this.config.enabled || !this.config.enableToolCompression || responses.length === 0) {
      return responses;
    }

    let modified = false;
    const result: FunctionExecutionResponse[] = [];

    for (const res of responses) {
      const { compressed, wasCompressed } = this.compressToolOutput(
        res.name,
        res.response,
        customMaxChars,
        sessionId
      );
      if (wasCompressed) modified = true;
      result.push({
        id: res.id,
        name: res.name,
        response: typeof compressed === "object" && compressed !== null
          ? (compressed as Record<string, unknown>)
          : { output: compressed },
      });
    }

    return modified ? result : responses;
  }

  // ─── Prompt & Retrieved Context Optimization ──────────────────────

  /**
   * Compresses injected prompt context (RAG chunks + Session Memory) against a token budget.
   * Guarantees that the `userPrompt` is 100% preserved as the primary anchor.
   */
  public compressPromptContext(
    contextParts: string[],
    userPrompt: string,
    customMaxTokens?: number,
    sessionId?: string
  ): string {
    if (contextParts.length === 0) {
      return userPrompt;
    }

    const rawJoined = contextParts.join("\n\n");
    const fullPromptRaw = `${rawJoined}\n\n─── Current User Message ───\n${userPrompt}`;

    if (!this.config.enabled || !this.config.enableRagCompression) {
      return fullPromptRaw;
    }

    const maxTokens = customMaxTokens ?? this.config.maxPromptTokens;
    const totalTokens = this.estimateTokens(fullPromptRaw);

    if (totalTokens <= maxTokens) {
      return fullPromptRaw;
    }

    const userPromptTokens = this.estimateTokens(userPrompt);
    // Reserve tokens for user prompt + demarcation wrapper + 100 token safety margin
    const allowedContextTokens = Math.max(200, maxTokens - userPromptTokens - 100);

    // Deduplicate and prune context parts
    const processedParts = this.optimizeContextParts(contextParts, userPrompt, allowedContextTokens);
    const compressedAugmentedPrompt = `${processedParts}\n\n─── Current User Message ───\n${userPrompt}`;

    const newTokens = this.estimateTokens(compressedAugmentedPrompt);
    const tokensSaved = Math.max(0, totalTokens - newTokens);
    this.recordCompression("prompt", tokensSaved, sessionId);

    return compressedAugmentedPrompt;
  }

  // ─── Multi-Turn History Compaction ────────────────────────────────

  /**
   * Condenses a long conversation history to fit within `maxHistoryTurns`.
   * Preserves:
   *   - The initial turn (task anchor)
   *   - The most recent `preserveRecentTurns` (immediate context)
   * Older intermediate turns are consolidated into an executive context summary.
   */
  public compressHistory(
    messages: ReadonlyArray<ConversationTurn>,
    customMaxTurns?: number,
    customPreserveRecent?: number,
    sessionId?: string
  ): ConversationTurn[] {
    if (!this.config.enabled || messages.length === 0) {
      return [...messages];
    }

    const maxTurns = customMaxTurns ?? this.config.maxHistoryTurns;
    const preserveRecent = customPreserveRecent ?? this.config.preserveRecentTurns;

    if (messages.length <= maxTurns) {
      return [...messages];
    }

    // Anchor: First user message (initial problem statement / goal)
    const initialTurn = messages[0];
    const recentTurns = messages.slice(-preserveRecent);
    const middleTurns = messages.slice(1, messages.length - preserveRecent);

    if (middleTurns.length === 0) {
      return [...messages];
    }

    // Build concise executive summary of middle turns
    const middleSummary = this.summarizeMiddleTurns(middleTurns);

    const origTokens = messages.reduce((acc, m) => acc + this.estimateTokens(m.content), 0);
    const compressedHistory: ConversationTurn[] = [
      initialTurn,
      {
        role: "model",
        content: `[Context Compressor: Summarized ${middleTurns.length} earlier turns to optimize context budget]\n${middleSummary}`,
      },
      ...recentTurns,
    ];

    const newTokens = compressedHistory.reduce((acc, m) => acc + this.estimateTokens(m.content), 0);
    const tokensSaved = Math.max(0, origTokens - newTokens);
    this.recordCompression("history", tokensSaved, sessionId);

    return compressedHistory;
  }

  // ─── Private Compression Helpers ──────────────────────────────────

  /**
   * Head-Tail string compression: keeps first 40% and last 40% with a summary notice.
   */
  private headTailCompressString(text: string, maxChars: number, label: string): string {
    const lines = text.split(/\r?\n/);
    const halfBudgetChars = Math.floor((maxChars - 200) / 2);

    let head = "";
    let headLineCount = 0;
    for (const line of lines) {
      if ((head + line).length > halfBudgetChars) break;
      head += (head ? "\n" : "") + line;
      headLineCount++;
    }

    let tail = "";
    let tailLineCount = 0;
    for (let i = lines.length - 1; i >= headLineCount; i--) {
      const line = lines[i];
      if ((tail + line).length > halfBudgetChars) break;
      tail = line + (tail ? "\n" : "") + tail;
      tailLineCount++;
    }

    const omittedLines = Math.max(0, lines.length - headLineCount - tailLineCount);
    const omittedChars = Math.max(0, text.length - head.length - tail.length);

    return (
      `${head}\n\n` +
      `[... Context Compressor (${label}): ${omittedLines} lines (~${omittedChars} characters) omitted for token optimization ...]\n\n` +
      `${tail}`
    );
  }

  /**
   * Compresses large JSON payloads by truncating deep arrays or huge text properties.
   */
  private compressJsonObject(
    obj: Record<string, unknown>,
    maxChars: number,
    label: string
  ): Record<string, unknown> {
    const copy: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.length > 800) {
        copy[k] = this.headTailCompressString(v, 800, `${label}.${k}`);
      } else if (Array.isArray(v)) {
        if (v.length > 8) {
          const head = v.slice(0, 4);
          const tail = v.slice(-2);
          copy[k] = [
            ...head,
            `[... Context Compressor: ${v.length - 6} items omitted ...]`,
            ...tail,
          ];
        } else {
          copy[k] = v;
        }
      } else if (v && typeof v === "object") {
        copy[k] = v;
      } else {
        copy[k] = v;
      }
    }

    const serialized = JSON.stringify(copy);
    if (serialized.length > maxChars) {
      return {
        _context_compressed: true,
        summary: `Result payload compacted by Context Compressor (${label})`,
        data_preview: serialized.slice(0, maxChars - 150) + " ... [TRUNCATED]",
      };
    }

    return copy;
  }

  /**
   * Extract key query terms for relevance ranking.
   */
  private extractQueryKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }

  /**
   * Optimize retrieved RAG chunks & past context parts against token budget.
   */
  private optimizeContextParts(
    parts: string[],
    query: string,
    allowedTokens: number
  ): string {
    const keywords = this.extractQueryKeywords(query);

    // Break context into logical blocks (separated by double newlines)
    const blocks: Array<{ text: string; score: number; tokens: number }> = [];
    const seen = new Set<string>();

    for (const part of parts) {
      const subBlocks = part.split(/\n\s*\n/);
      for (const sb of subBlocks) {
        const trimmed = sb.trim();
        if (!trimmed || trimmed.length < 15) continue;

        // Deduplicate identical blocks
        const fingerprint = trimmed.slice(0, 80).toLowerCase();
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);

        // Score based on query keyword matches
        let score = 1;
        const lower = trimmed.toLowerCase();
        for (const kw of keywords) {
          if (lower.includes(kw)) score += 3;
        }

        blocks.push({
          text: trimmed,
          score,
          tokens: this.estimateTokens(trimmed),
        });
      }
    }

    // Sort by relevance score descending
    blocks.sort((a, b) => b.score - a.score);

    // Accumulate within token budget
    let currentTokens = 0;
    const selected: string[] = [];

    for (const b of blocks) {
      if (currentTokens + b.tokens <= allowedTokens) {
        selected.push(b.text);
        currentTokens += b.tokens;
      } else if (currentTokens === 0) {
        // Truncate first block to fit
        const charBudget = Math.floor(allowedTokens * 3.5);
        selected.push(b.text.slice(0, charBudget) + " ... [Context Compressed]");
        break;
      }
    }

    if (selected.length === 0 && parts.length > 0) {
      return parts[0].slice(0, Math.floor(allowedTokens * 3.5));
    }

    return selected.join("\n\n");
  }

  /**
   * Summarize middle conversation turns for sliding-window compression.
   */
  private summarizeMiddleTurns(turns: ConversationTurn[]): string {
    const lines: string[] = [];
    let turnIndex = 1;

    for (const turn of turns) {
      const roleName = turn.role === "user" ? "User asked" : "Assistant";
      let snippet = turn.content.replace(/\r?\n/g, " ").trim();
      if (snippet.length > 120) {
        snippet = snippet.slice(0, 117) + "...";
      }
      lines.push(`- Turn ${turnIndex} (${roleName}): ${snippet}`);
      turnIndex++;
      if (lines.length >= 10) {
        lines.push(`- (... ${turns.length - lines.length} additional intermediate turns omitted)`);
        break;
      }
    }

    return lines.join("\n");
  }

  private recordCompression(type: "prompt" | "tool" | "history", tokensSaved: number, sessionId?: string): void {
    this.stats.totalCompressions++;
    this.stats.estimatedTokensSaved += Math.max(0, tokensSaved);
    if (type === "prompt") this.stats.promptCompressions++;
    else if (type === "tool") this.stats.toolCompressions++;
    else if (type === "history") this.stats.historyCompressions++;
    this.stats.lastCompressionTimestamp = new Date().toISOString();
    if (sessionId && tokensSaved > 0) {
      this.recordSessionTokensSaved(sessionId, tokensSaved);
    }
  }

  public recordSessionTokensSaved(sessionId: string, tokensSaved: number): void {
    if (!sessionId) return;
    const current = this.sessionTokensSaved.get(sessionId) || 0;
    this.sessionTokensSaved.set(sessionId, current + Math.max(0, tokensSaved));
  }

  public getSessionTokensSaved(sessionId: string): number {
    if (!sessionId) return 0;
    return this.sessionTokensSaved.get(sessionId) || 0;
  }

  public clearSessionTokensSaved(sessionId: string): void {
    if (!sessionId) return;
    this.sessionTokensSaved.delete(sessionId);
  }

  // ─── Public Inspection & Configuration API ────────────────────────

  public getStats(): CompressionStats {
    return { ...this.stats };
  }

  public resetStats(): void {
    this.stats = {
      totalCompressions: 0,
      estimatedTokensSaved: 0,
      promptCompressions: 0,
      toolCompressions: 0,
      historyCompressions: 0,
    };
    this.sessionTokensSaved.clear();
  }

  public getConfig(): ContextCompressorConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<ContextCompressorConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}
