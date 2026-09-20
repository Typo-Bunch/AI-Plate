/**
 * Reasoning Scratchpad & Step Inspector Plugin (Inbuilt Core Tool).
 *
 * Equips the AI with an active reasoning scratchpad to brainstorm plans,
 * evaluate alternatives, track assumptions, self-correct errors, and
 * structure multi-step tasks with live chat timeline tracing.
 */

import type { ToolHandler, ToolParametersSchema, ToolPlugin, ToolSchema } from "../../core/types.js";

// ─── Cognitive Meta-Reasoning Types ─────────────────────────────────

export type CognitiveStage =
  | "hypothesis"
  | "analysis"
  | "alternatives"
  | "assumption"
  | "self_correction"
  | "verification"
  | "action_plan";

export interface AlternativeOption {
  option: string;
  evaluated_tradeoff?: string;
  discarded_reason?: string;
  selected?: boolean;
}

export interface SelfCorrectionDetail {
  trigger?: string;
  previous_hypothesis?: string;
  pivot_strategy?: string;
}

export interface ReasoningEntry {
  id: string;
  step_number?: number;
  cognitive_stage?: CognitiveStage;
  thought: string;
  action_plan?: string;
  confidence: "high" | "medium" | "low";
  confidence_rationale?: string;
  assumptions?: string[];
  alternatives_considered?: (string | AlternativeOption)[];
  self_correction?: string | SelfCorrectionDetail;
  expected_outcome?: string;
  timestamp: string;
}

// ─── In-Memory Reasoning Trace Buffer ───────────────────────────────

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

const cognitiveParametersJsonSchema: ToolParametersSchema = {
  type: "object",
  properties: {
    thought: {
      type: "string",
      description: "Your detailed thinking, analysis, reasoning chain, or breakdown of the current step.",
    },
    cognitive_stage: {
      type: "string",
      enum: [
        "hypothesis",
        "analysis",
        "alternatives",
        "assumption",
        "self_correction",
        "verification",
        "action_plan",
      ],
      description:
        "The cognitive purpose of this thinking step: 'hypothesis' (proposing an idea/solution), 'alternatives' (comparing options/trade-offs), 'assumption' (identifying premises), 'self_correction' (pivoting after unexpected result or error), 'verification' (evaluating evidence), 'analysis' (examining problem structure), or 'action_plan' (operational plan).",
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
    confidence_rationale: {
      type: "string",
      description: "Brief rationale explaining why confidence is high, medium, or low (e.g. assumptions verified, edge case risk).",
    },
    alternatives_considered: {
      type: "array",
      items: {
        type: "object",
        properties: {
          option: { type: "string", description: "Alternative approach or path considered." },
          evaluated_tradeoff: { type: "string", description: "Trade-offs or pros/cons of this option." },
          discarded_reason: { type: "string", description: "Why this alternative was not selected." },
          selected: { type: "boolean", description: "Whether this alternative was selected as primary." },
        },
        required: ["option"],
      },
      description: "List of alternative options evaluated and why certain approaches were selected or discarded.",
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description: "Preconditions or assumptions made about the environment, user intent, or data (e.g. 'Node.js 18+ present').",
    },
    self_correction: {
      type: "object",
      properties: {
        trigger: { type: "string", description: "What failed or what unexpected outcome occurred." },
        previous_hypothesis: { type: "string", description: "What was previously believed." },
        pivot_strategy: { type: "string", description: "The revised hypothesis or new strategy adopted." },
      },
      description: "Self-correction details when recovering from an error or revising strategy.",
    },
    expected_outcome: {
      type: "string",
      description: "What outcome, file, or signal is expected before invoking the subsequent tool.",
    },
    step_number: {
      type: "number",
      description: "Optional current step number in multi-step task execution (e.g. 1, 2, 3).",
    },
  },
  required: ["thought"],
};

const recordReasoningStepSchema: ToolSchema = {
  name: "record_reasoning_step",
  description:
    "Record an internal reasoning thought, hypothesis, alternatives, assumptions, or error self-correction for complex multi-step reasoning tasks. Standalone scratchpad tool — invoke when breaking down complex problems, comparing solutions, or revising plans.",
  parametersJsonSchema: cognitiveParametersJsonSchema,
};

const recordThinkingSchema: ToolSchema = {
  name: "record_thinking",
  description:
    "Record internal thoughts, analysis, meta-reasoning traces, or step-by-step plans for complex multi-stage tasks.",
  parametersJsonSchema: cognitiveParametersJsonSchema,
};

// ─── Tool Handlers ──────────────────────────────────────────────────

const recordReasoningStepHandler: ToolHandler = async (params) => {
  const thought = String(params.thought || "").trim();
  const cognitiveStage = params.cognitive_stage as CognitiveStage | undefined;
  const actionPlan = params.action_plan ? String(params.action_plan).trim() : undefined;
  const confidence = (params.confidence as "high" | "medium" | "low") || "high";
  const confidenceRationale = params.confidence_rationale ? String(params.confidence_rationale).trim() : undefined;
  const stepNumber = typeof params.step_number === "number" ? params.step_number : undefined;
  const expectedOutcome = params.expected_outcome ? String(params.expected_outcome).trim() : undefined;

  let assumptions: string[] | undefined;
  if (Array.isArray(params.assumptions)) {
    assumptions = params.assumptions.map((a: any) => String(a).trim()).filter(Boolean);
  }

  let alternativesConsidered: (string | AlternativeOption)[] | undefined;
  if (Array.isArray(params.alternatives_considered)) {
    alternativesConsidered = params.alternatives_considered;
  }

  let selfCorrection: string | SelfCorrectionDetail | undefined;
  if (params.self_correction) {
    if (typeof params.self_correction === "string") {
      selfCorrection = params.self_correction.trim();
    } else if (typeof params.self_correction === "object") {
      selfCorrection = params.self_correction;
    }
  }

  const record = recordReasoningEntry({
    step_number: stepNumber,
    cognitive_stage: cognitiveStage,
    thought,
    action_plan: actionPlan,
    confidence,
    confidence_rationale: confidenceRationale,
    assumptions,
    alternatives_considered: alternativesConsidered,
    self_correction: selfCorrection,
    expected_outcome: expectedOutcome,
  });

  return {
    status: "recorded",
    id: record.id,
    step: stepNumber,
    cognitive_stage: cognitiveStage,
    thought,
    action_plan: actionPlan,
    confidence,
    confidence_rationale: confidenceRationale,
    assumptions,
    alternatives_considered: alternativesConsidered,
    self_correction: selfCorrection,
    expected_outcome: expectedOutcome,
    timestamp: record.timestamp,
    ui_type: "reasoning_step",
  };
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const thinkingInspectorPlugin: ToolPlugin = {
  id: "thinking_inspector",
  name: "Reasoning Scratchpad & Step Inspector",
  description:
    "Equips the AI with an active cognitive reasoning scratchpad (record_reasoning_step) to brainstorm plans, evaluate alternatives, track assumptions, self-correct errors, and structure multi-step tasks with live chat timeline tracing.",
  icon: "🧠",
  category: "reasoning",

  register(registerTool) {
    registerTool(recordReasoningStepSchema, recordReasoningStepHandler);
    registerTool(recordThinkingSchema, recordReasoningStepHandler);
  },
};

