/**
 * State Manager — Conversation History & Memory.
 *
 * Tracks short-term conversational context as an array of ChatMessages.
 * Provides sliding-window trimming to keep token usage manageable.
 */

import type { ChatMessage, MessageRole } from "./types.js";

export class StateManager {
  private history: ChatMessage[] = [];
  private readonly maxMessages: number;

  constructor(maxMessages: number = 50) {
    this.maxMessages = maxMessages;
  }

  /** Append a message to the conversation history. */
  appendMessage(role: MessageRole, content: string): void {
    this.history.push({ role, content });
    this.enforceLimit();
  }

  /** Shorthand to append a user message. */
  appendUserMessage(content: string): void {
    this.appendMessage("user", content);
  }

  /** Shorthand to append a model/assistant message. */
  appendModelMessage(content: string): void {
    this.appendMessage("model", content);
  }

  /** Get the full conversation history. */
  getHistory(): ReadonlyArray<ChatMessage> {
    return this.history;
  }

  /** Get the last N messages. */
  getRecentHistory(n: number): ChatMessage[] {
    return this.history.slice(-n);
  }

  /** Trim history to keep only the most recent messages. */
  trimHistory(maxMessages?: number): void {
    const limit = maxMessages ?? this.maxMessages;
    if (this.history.length > limit) {
      this.history = this.history.slice(-limit);
    }
  }

  /** Clear all conversation history. */
  clear(): void {
    this.history = [];
  }

  /** Get the number of messages in history. */
  get length(): number {
    return this.history.length;
  }

  /** Enforce the maximum message limit via sliding window. */
  private enforceLimit(): void {
    if (this.history.length > this.maxMessages) {
      this.history = this.history.slice(-this.maxMessages);
    }
  }
}
