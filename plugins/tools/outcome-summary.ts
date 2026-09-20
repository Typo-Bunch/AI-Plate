/**
 * Outcome Summary & Audit Trace Plugin (Inbuilt Core Tool).
 *
 * Captures, structures, and displays execution outcomes and audit traces:
 *   - User Prompt Intent vs Actual Execution Results
 *   - Key Milestones & Actions Taken
 *   - Produced Deliverables & Artifacts
 *   - Execution Status Badges (Completed, Partial, Blocked, Failed)
 *   - Configurable View Positioning (bottom, top, inline)
 *
 * Fully standalone and independent:
 *   - When enabled, renders rich, responsive, glassmorphic audit cards in the chat window.
 *   - When disabled or toggled off, completely detaches and leaves zero skeletons, empty cards, or layout artifacts.
 */

import type { ToolHandler, ToolPlugin, ToolSchema, UIExtensionManifest } from "../../core/types.js";

// ─── In-Memory Audit Trail Buffer ───────────────────────────────────

export interface AuditRecord {
  id: string;
  timestamp: string;
  user_intent: string;
  what_happened: string;
  position: "bottom" | "top" | "inline";
  status: "completed" | "partial" | "failed" | "blocked";
  key_actions: string[];
  deliverables: Array<string | Record<string, unknown>>;
}

const auditTrail: AuditRecord[] = [];
const MAX_AUDIT_RECORDS = 100;

export function recordAuditEntry(entry: Omit<AuditRecord, "id" | "timestamp">): AuditRecord {
  const record: AuditRecord = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  auditTrail.push(record);
  if (auditTrail.length > MAX_AUDIT_RECORDS) {
    auditTrail.shift();
  }
  return record;
}

export function getAuditTrail(limit = 20): AuditRecord[] {
  return auditTrail.slice(-limit);
}

export function clearAuditTrail(): void {
  auditTrail.length = 0;
}

// ─── Tool Schemas ───────────────────────────────────────────────────

const recordOutcomeSchema: ToolSchema = {
  name: "record_outcome_summary",
  description:
    "Records the overall execution outcome and audit trace: user prompt intent vs what actually happened, actions taken, deliverables, and final status with optional placement ('bottom', 'top', 'inline'). Standalone tool — invoke only when specifically requested to produce an execution audit log or outcome card, not as an automatic dependency after standard tool calls.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      user_intent: {
        type: "string",
        description: "What the user originally requested or prompted.",
      },
      what_happened: {
        type: "string",
        description: "What the AI agent actually accomplished, tools executed, and final outputs.",
      },
      position: {
        type: "string",
        enum: ["bottom", "top", "inline"],
        description: "Placement position in the chat response: 'bottom' (default), 'top', or 'inline'.",
      },
      status: {
        type: "string",
        enum: ["completed", "partial", "failed", "blocked"],
        description: "Execution outcome status.",
      },
      key_actions: {
        type: "array",
        items: { type: "string" },
        description: "Chronological list of key actions or milestones taken.",
      },
      deliverables: {
        type: "array",
        items: { type: "string" },
        description: "Deliverables, files, or answers produced during execution.",
      },
    },
    required: ["user_intent", "what_happened"],
  },
};

const getAuditHistorySchema: ToolSchema = {
  name: "get_audit_history",
  description: "Retrieve recent execution audit trail history records.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of recent audit records to retrieve (default: 10).",
      },
    },
    required: [],
  },
};

// ─── Tool Handlers ──────────────────────────────────────────────────

const recordOutcomeHandler: ToolHandler = async (params) => {
  const user_intent = String(params.user_intent || "").trim();
  const what_happened = String(params.what_happened || "").trim();
  const position = (["bottom", "top", "inline"].includes(String(params.position))
    ? String(params.position)
    : "bottom") as "bottom" | "top" | "inline";
  const status = (["completed", "partial", "failed", "blocked"].includes(String(params.status))
    ? String(params.status)
    : "completed") as "completed" | "partial" | "failed" | "blocked";

  const key_actions = Array.isArray(params.key_actions)
    ? params.key_actions.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    : [];

  const deliverables = Array.isArray(params.deliverables) ? params.deliverables : [];

  const record = recordAuditEntry({
    user_intent,
    what_happened,
    position,
    status,
    key_actions,
    deliverables,
  });

  return {
    ui_type: "outcome_summary",
    recorded: true,
    id: record.id,
    timestamp: record.timestamp,
    user_intent: record.user_intent,
    what_happened: record.what_happened,
    position: record.position,
    status: record.status,
    key_actions: record.key_actions,
    deliverables: record.deliverables,
  };
};

const getAuditHistoryHandler: ToolHandler = async (params) => {
  const limit = Math.max(1, Math.min(50, Number(params.limit) || 10));
  const history = getAuditTrail(limit);
  return {
    totalRecords: auditTrail.length,
    retrievedCount: history.length,
    history,
  };
};

// ─── Standalone Encapsulated CSS & JS Extensions ─────────────────────

const OUTCOME_CSS = `
/* Outcome Summary & Audit Trace — Encapsulated Inbuilt Styles */

.outcome-summary-card,
.execution-outcome-card {
  margin: 14px 0 6px 0;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(24, 24, 37, 0.95) 0%, rgba(15, 18, 30, 0.98) 100%);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), 0 0 20px rgba(99, 102, 241, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: outcomeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  color: var(--text-main, #f4f4f6);
}

@keyframes outcomeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.outcome-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.outcome-card-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.outcome-icon {
  font-size: 16px;
  line-height: 1;
}

.outcome-card-title {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: var(--text-main, #f8fafc);
  text-transform: uppercase;
}

.outcome-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.outcome-status-badge.outcome-status-completed,
.outcome-status-badge.status-completed {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.outcome-status-badge.outcome-status-partial,
.outcome-status-badge.status-partial {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.outcome-status-badge.outcome-status-blocked,
.outcome-status-badge.status-blocked {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.outcome-status-badge.outcome-status-failed,
.outcome-status-badge.status-failed {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.outcome-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 768px) {
  .outcome-grid {
    grid-template-columns: 1fr;
  }
}

.outcome-col {
  padding: 10px 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.outcome-intent-col {
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.outcome-happened-col {
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.outcome-col-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.outcome-intent-col .outcome-col-label {
  color: #818cf8;
}

.outcome-happened-col .outcome-col-label {
  color: #34d399;
}

.outcome-col-icon {
  font-size: 13px;
}

.outcome-col-body {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-main, #f8fafc);
  word-break: break-word;
}

.outcome-chips-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11.5px;
  padding-top: 4px;
}

.outcome-chips-label {
  color: var(--text-muted, #94a3b8);
  font-size: 11px;
  font-weight: 600;
}

.outcome-action-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-dim, #cbd5e1);
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
}

.outcome-deliverable-chip {
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #c7d2fe;
  padding: 2px 9px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
}
`;

const OUTCOME_JS = `
(function (window) {
  if (!window.__PLUGIN_CHAT_CARD_HANDLERS) {
    window.__PLUGIN_CHAT_CARD_HANDLERS = {};
  }

  // Register chat card dispatcher for outcome_summary plugin
  window.__PLUGIN_CHAT_CARD_HANDLERS["outcome_summary"] = function (blockElement, toolName, result) {
    if (!blockElement || !result || typeof result !== "object") return false;

    // Standalone Independence Check:
    // Verify if outcome_summary is enabled via activeExtensions, registeredPlugins, or localStorage cache
    let isEnabled = false;
    if (window.PluginUIHost && Array.isArray(window.PluginUIHost.activeExtensions) && window.PluginUIHost.activeExtensions.length > 0) {
      isEnabled = window.PluginUIHost.activeExtensions.some(function (e) {
        return e.pluginId === "outcome_summary";
      });
    } else if (Array.isArray(window.registeredPlugins) && window.registeredPlugins.length > 0) {
      isEnabled = window.registeredPlugins.some(function (p) {
        return p.id === "outcome_summary" && p.enabled;
      });
    } else {
      try {
        const cached = JSON.parse(localStorage.getItem("ai_plate_plugins_cache") || "[]");
        isEnabled = cached.some(function (p) { return p.id === "outcome_summary" && p.enabled; });
      } catch (e) {
        isEnabled = true;
      }
    }
    if (!isEnabled) return false;

    if (
      toolName === "record_outcome_summary" ||
      result.ui_type === "outcome_summary" ||
      result.ui_type === "outcome" ||
      (result.user_intent && result.what_happened) ||
      result.outcome
    ) {
      const outcomeData = result.outcome || result;
      return renderOutcomeSummaryCard(blockElement, outcomeData);
    }
    return false;
  };

  function renderOutcomeSummaryCard(blockElement, outcome) {
    if (!blockElement || !outcome) return false;

    // Avoid duplicate outcome cards in the same message block
    const existing = blockElement.querySelector(".execution-outcome-card, .outcome-summary-card");
    if (existing) existing.remove();

    const card = document.createElement("div");
    card.className = "outcome-summary-card";

    const status = String(outcome.status || "completed").toLowerCase();
    let statusBadge = '<span class="outcome-status-badge outcome-status-completed">✓ Completed</span>';
    if (status === "partial") {
      statusBadge = '<span class="outcome-status-badge outcome-status-partial">⏳ Partial</span>';
    } else if (status === "failed") {
      statusBadge = '<span class="outcome-status-badge outcome-status-failed">✕ Failed</span>';
    } else if (status === "blocked") {
      statusBadge = '<span class="outcome-status-badge outcome-status-blocked">⊘ Blocked</span>';
    }

    const actions = Array.isArray(outcome.key_actions)
      ? outcome.key_actions
      : Array.isArray(outcome.actions)
      ? outcome.actions
      : [];

    const deliverables = Array.isArray(outcome.deliverables)
      ? outcome.deliverables
      : Array.isArray(outcome.outputs)
      ? outcome.outputs
      : [];

    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    const actionsHtml =
      actions.length > 0
        ? '<div class="outcome-chips-row">' +
          '<span class="outcome-chips-label">Actions Taken:</span>' +
          actions
            .map(function (a) {
              return '<span class="outcome-action-chip">⚡ ' + escapeHtml(typeof a === "object" ? a.description || JSON.stringify(a) : a) + "</span>";
            })
            .join("") +
          "</div>"
        : "";

    const deliverablesHtml =
      deliverables.length > 0
        ? '<div class="outcome-chips-row">' +
          '<span class="outcome-chips-label">Deliverables:</span>' +
          deliverables
            .map(function (d) {
              return '<span class="outcome-deliverable-chip">📦 ' + escapeHtml(typeof d === "object" ? d.title || d.name || JSON.stringify(d) : d) + "</span>";
            })
            .join("") +
          "</div>"
        : "";

    card.innerHTML =
      '<div class="outcome-card-header">' +
        '<div class="outcome-card-title-group">' +
          '<span class="outcome-icon">📋</span>' +
          '<span class="outcome-card-title">Overall Execution Outcome</span>' +
        '</div>' +
        statusBadge +
      '</div>' +
      '<div class="outcome-grid">' +
        '<div class="outcome-col outcome-intent-col">' +
          '<div class="outcome-col-label">' +
            '<span class="outcome-col-icon">👤</span>' +
            '<span>What You Prompted</span>' +
          '</div>' +
          '<div class="outcome-col-body">' + escapeHtml(outcome.user_intent || outcome.intent || "User prompt request") + '</div>' +
        '</div>' +
        '<div class="outcome-col outcome-happened-col">' +
          '<div class="outcome-col-label">' +
            '<span class="outcome-col-icon">⚡</span>' +
            '<span>What Actually Happened</span>' +
          '</div>' +
          '<div class="outcome-col-body">' + escapeHtml(outcome.what_happened || "Execution completed successfully.") + '</div>' +
        '</div>' +
      '</div>' +
      actionsHtml +
      deliverablesHtml;

    const position = String(outcome.position || "bottom").toLowerCase().trim();
    const messageBody = blockElement.querySelector(".message-body");
    const metaFooter = blockElement.querySelector(".message-meta-footer");
    const toolContainer = blockElement.querySelector(".tool-container") || blockElement.querySelector(".thinking-steps-timeline");

    if (position === "top" && messageBody && messageBody.parentNode) {
      messageBody.parentNode.insertBefore(card, messageBody);
    } else if (position === "inline" && toolContainer) {
      toolContainer.appendChild(card);
    } else if (metaFooter && metaFooter.parentNode) {
      metaFooter.parentNode.insertBefore(card, metaFooter);
    } else if (messageBody && messageBody.parentNode) {
      if (messageBody.nextSibling) {
        messageBody.parentNode.insertBefore(card, messageBody.nextSibling);
      } else {
        messageBody.parentNode.appendChild(card);
      }
    } else {
      blockElement.appendChild(card);
    }

    // Persist outcome summary per session to preserve across tab and session switches
    try {
      var sid = window.currentSessionId || localStorage.getItem("ai_plate_active_session") || "default";
      var storeKey = "ai_plate_session_outcomes_" + sid;
      var list = JSON.parse(localStorage.getItem(storeKey) || "[]");
      var exists = list.some(function (item) {
        return item && (item.id === outcome.id || (item.user_intent === outcome.user_intent && item.what_happened === outcome.what_happened));
      });
      if (!exists) {
        list.push(outcome);
        localStorage.setItem(storeKey, JSON.stringify(list.slice(-20)));
      }
    } catch (e) {}

    return true;
  }

  window.renderOutcomeSummaryCard = renderOutcomeSummaryCard;
})(typeof window !== "undefined" ? window : globalThis);
`;

const outcomeUIExtension: UIExtensionManifest = {
  pluginId: "outcome_summary",
  name: "Outcome Summary & Audit Trace",
  icon: "📋",
  css: OUTCOME_CSS,
  js: OUTCOME_JS,
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const outcomeSummaryPlugin: ToolPlugin = {
  id: "outcome_summary",
  name: "Outcome Summary & Audit Trace",
  description:
    "Records and displays structured execution outcomes and audit traces (user prompt intent vs what actually happened, actions, and deliverables).",
  icon: "📋",
  category: "audit",
  ui_extension: outcomeUIExtension,

  register(registerTool) {
    registerTool(recordOutcomeSchema, recordOutcomeHandler);
    registerTool(getAuditHistorySchema, getAuditHistoryHandler);
  },
};
