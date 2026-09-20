import type { ChatMode } from "./types.js";

export function isChatMode(value: unknown): value is ChatMode {
  return value === "normal" || value === "plan" || value === "code" || value === "agent";
}

const normalTools = new Set([
  "web_search",
  "fetch_web_page",
  "query_knowledge_base",
  "list_knowledge_base",
  "speak_text",
  "list_tts_voices",
  "transcribe_audio",
  "get_stt_status",
  "record_thinking",
  "record_reasoning_step",
  "record_outcome_summary",
]);
const planTools = new Set([...normalTools, "read_file", "list_sandbox_files", "list_artifacts"]);

/** Unknown tools are excluded from read-only modes, including connector tools. */
export function isToolAllowedInMode(mode: ChatMode, name: string): boolean {
  return mode === "code" || mode === "agent" || (mode === "plan" ? planTools : normalTools).has(name);
}

export const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  normal: "Normal mode (Chat Only): Answer conversationally and help with explanations and general questions. Use search and knowledge retrieval when helpful. Do not execute commands or modify files. Suggest Agent mode when action tools are needed.",
  plan: "Plan mode: Inspect available project files and research as needed, then produce a concrete implementation plan with steps, relevant files, assumptions, and validation. Ask focused questions when needed. Do not implement changes, execute commands, or modify files. The user can switch to Agent mode to implement the plan.",
  code: "Code mode (Unified Agent): You are a unified, autonomous assistant with full capabilities. For conversational, brainstorming, or conceptual questions, answer naturally, directly, and conversationally without invoking unnecessary tools. When the user asks you to inspect files, execute code, run calculations, analyze data, create media, or make changes, proactively use your available tools to fulfill their request thoroughly and verify the results.",
  agent: "Agent mode (Unified Agent): You are a unified, autonomous assistant with full capabilities. For conversational, brainstorming, or conceptual questions, answer naturally, directly, and conversationally without invoking unnecessary tools. When the user asks you to inspect files, execute code, run calculations, analyze data, create media, or make changes, proactively use your available tools to fulfill their request thoroughly and verify the results.",
};
