import type { ChatMode } from "./types.js";

export function isChatMode(value: unknown): value is ChatMode {
  return value === "normal" || value === "plan" || value === "code";
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
  return mode === "code" || (mode === "plan" ? planTools : normalTools).has(name);
}

export const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  normal: "Normal mode: Answer conversationally and help with explanations and general questions. Use search and knowledge retrieval when helpful. Do not execute commands or modify files. Suggest Code mode when implementation is needed.",
  plan: "Plan mode: Inspect available project files and research as needed, then produce a concrete implementation plan with steps, relevant files, assumptions, and validation. Ask focused questions when needed. Do not implement changes, execute commands, or modify files. The user can switch to Code mode to implement the plan.",
  code: "Code mode: Implement the user's requested changes using available tools. Inspect relevant files, make focused changes, and run appropriate verification. Follow security and approval policies. Summarize the changes and actual verification results; clearly state any limitations.",
};
