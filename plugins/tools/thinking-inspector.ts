/**
 * Reasoning Scratchpad & Step Inspector Plugin (Inbuilt Core Tool).
 *
 * Equips the AI with an active reasoning scratchpad to brainstorm plans,
 * evaluate alternatives, and structure multi-step tasks with live chat timeline tracing.
 */

import type { ToolHandler, ToolPlugin, ToolSchema } from "../../core/types.js";

// ─── In-Memory Reasoning Trace Buffer ───────────────────────────────

export interface ReasoningEntry {
  id: string;
  step_number?: number;
  thought: string;
  action_plan?: string;
  confidence: "high" | "medium" | "low";
  timestamp: string;
}

const reasoningHistory: ReasoningEntry[] = [];
const MAX_REASONING_ENTRIES = 100;

export function recordReasoningEntry(entry: Omit<ReasoningEntry, "id" | "timestamp">): ReasoningEntry {
  const record: ReasoningEntry = {
    id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  reasoningHistory.push(record);
  if (reasoningHistory.length > MAX_REASONING_ENTRIES) {
    reasoningHistory.shift();
  }
  return record;
}

export function getReasoningHistory(limit = 20): ReasoningEntry[] {
  return reasoningHistory.slice(-limit);
}

export function clearReasoningHistory(): void {
  reasoningHistory.length = 0;
}

// ─── Tool Schemas ───────────────────────────────────────────────────

const recordReasoningStepSchema: ToolSchema = {
  name: "record_reasoning_step",
  description:
    "Record an internal reasoning thought, hypothesis, or plan for complex multi-step reasoning tasks. Standalone scratchpad tool — invoke when breaking down a complex multi-step problem or planning execution steps.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your detailed thinking, analysis, reasoning chain, or breakdown of the current step.",
      },
      action_plan: {
        type: "string",
        description: "The specific next action or tool you plan to invoke and why.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Your confidence level in this reasoning path.",
      },
      step_number: {
        type: "number",
        description: "Optional current step number in multi-step task execution (e.g. 1, 2, 3).",
      },
    },
    required: ["thought"],
  },
};

const recordThinkingSchema: ToolSchema = {
  name: "record_thinking",
  description:
    "Record internal thoughts, analysis, or step-by-step plans for complex multi-stage tasks.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your detailed thinking, analysis, reasoning chain, or breakdown of the current step.",
      },
      action_plan: {
        type: "string",
        description: "The specific next action or tool you plan to invoke and why.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Your confidence level in this reasoning path.",
      },
      step_number: {
        type: "number",
        description: "Optional current step number in multi-step task execution (e.g. 1, 2, 3).",
      },
    },
    required: ["thought"],
  },
};

// ─── Tool Handlers ──────────────────────────────────────────────────

const recordReasoningStepHandler: ToolHandler = async (params) => {
  const thought = String(params.thought || "").trim();
  const actionPlan = params.action_plan ? String(params.action_plan).trim() : undefined;
  const confidence = (params.confidence as "high" | "medium" | "low") || "high";
  const stepNumber = typeof params.step_number === "number" ? params.step_number : undefined;

  const record = recordReasoningEntry({
    step_number: stepNumber,
    thought,
    action_plan: actionPlan,
    confidence,
  });

  return {
    status: "recorded",
    id: record.id,
    step: stepNumber,
    thought,
    action_plan: actionPlan,
    confidence,
    timestamp: record.timestamp,
    ui_type: "reasoning_step",
  };
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const thinkingInspectorPlugin: ToolPlugin = {
  id: "thinking_inspector",
  name: "Reasoning Scratchpad & Step Inspector",
  description:
    "Equips the AI with an active reasoning scratchpad (record_reasoning_step) to brainstorm plans, evaluate alternatives, and structure multi-step tasks with live chat timeline tracing.",
  icon: "🧠",
  category: "reasoning",

  register(registerTool) {
    registerTool(recordReasoningStepSchema, recordReasoningStepHandler);
    registerTool(recordThinkingSchema, recordReasoningStepHandler);
  },
};
