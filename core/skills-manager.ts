/**
 * Skills & Cognitive Directives Manager — AI Plate (Open Power)
 *
 * Manages modular thinking scripts inspired by:
 *   - blader/humanizer (Anti-AI Writing Style & 2-pass verification)
 *   - obra/superpowers (TDD, Systematic Debugging, Spec-First, Code Review, CoVE)
 *
 * Skills are modular scripts and instruction sets that are considered by
 * the LLM or dynamically injected after intent filtering to modify how it
 * reasons, formulates hypotheses, executes code, and drafts responses.
 */

import { EventEmitter } from "node:events";
import { AgentDatabase } from "./database.js";
import { logVerbose } from "./config.js";

// ─── Interfaces ──────────────────────────────────────────────────────────

export type SkillCategory =
  | "writing_voice"
  | "engineering_discipline"
  | "architecture_planning"
  | "quality_security"
  | "reasoning_verification"
  | "custom";

export type SkillFilterMode = "smart_filter" | "always_active";

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  icon: string;
  enabled: boolean;
  isBuiltin: boolean;
  author?: string;
  referenceUrl?: string;
  triggers: string[];
  alwaysActive?: boolean;
  promptInstructions: string;
  createdAt?: string;
  updatedAt?: string;
}

const SKILLS_META_KEY = "ai_plate_skills_config";
const SKILLS_FILTER_MODE_KEY = "ai_plate_skills_filter_mode";

// ─── Built-in Default Skills ─────────────────────────────────────────────

export const DEFAULT_BUILTIN_SKILLS: Skill[] = [
  {
    id: "humanizer",
    name: "Humanizer (Anti-AI Writing Style)",
    category: "writing_voice",
    description:
      "Strips away robotic AI tells, corporate fluff, em dash overuse, and hyperbolic adjectives based on Wikipedia's catalog of AI writing signs. Enforces a 2-pass cognitive verification.",
    icon: "✍️",
    enabled: true,
    isBuiltin: true,
    author: "blader/humanizer",
    referenceUrl: "https://github.com/blader/humanizer",
    triggers: [
      "write",
      "rewrite",
      "humanize",
      "blog",
      "draft",
      "article",
      "email",
      "essay",
      "post",
      "copywriting",
      "tone",
      "content",
      "letter",
      "speech",
    ],
    alwaysActive: false,
    promptInstructions: `### Skill: Humanizer (Anti-AI Writing Style & 2-Pass Verification)
Reference: blader/humanizer (based on Wikipedia's "Signs of AI writing")

You MUST strip away common AI writing patterns, corporate buzzwords, and stylistic tropes to produce authentic, crisp human prose.

#### 1. Banned Vocabulary & Fluff (Never Use These):
- Banned AI Clichés: "delve", "tapestry", "beacon", "testament to", "game-changer", "pivotal", "fostering", "crucial", "paramount", "nestled", "vibrant", "revolutionize", "unleash", "elevate", "harnessing".
- Banned Empty Transitions: "Moreover,", "Furthermore,", "In conclusion,", "It is important to note that", "At its core,", "Needless to say,", "In today's fast-paced world".
- Banned Hollow Praise: Do not flatter the reader or topic with unearned superlatives ("a testament to innovation", "rich history", "breathtaking journey").

#### 2. Structural Tells to Eliminate:
- Em Dash Overuse: Stop using "—" to insert parenthetical thoughts in every paragraph. Use commas, parentheses, or separate sentences.
- Forced Rule of Three: Do not force ideas, adjectives, or bullet points into triplets just for symmetry.
- Symmetric Paragraphs: Vary sentence lengths naturally. Mix punchy 4-word sentences with longer explanatory ones.
- Rhetorical Question Framing: Do not ask rhetorical questions to transition between topics ("So, what does this mean?"). State the point directly.

#### 3. Two-Pass Cognitive Execution Protocol:
- **Pass 1 (Drafting)**: Draft the response using direct, plainspoken language. Express strong, clear verbs over nominalizations. Write with the cadence of an experienced human practitioner.
- **Pass 2 (Verification Audit)**: Before finalizing, verify that NO facts, specifications, code references, or nuance were altered or omitted in the pursuit of style.`,
  },
  {
    id: "superpowers-tdd",
    name: "Superpowers: Test-Driven Development (TDD)",
    category: "engineering_discipline",
    description:
      "Strict Red-Green-Refactor discipline from obra/superpowers. Mandates creating or verifying failing tests before writing any implementation code.",
    icon: "🧪",
    enabled: true,
    isBuiltin: true,
    author: "obra/superpowers",
    referenceUrl: "https://github.com/obra/superpowers",
    triggers: [
      "test",
      "tdd",
      "unit test",
      "integration test",
      "spec",
      "implement",
      "code",
      "feature",
      "refactor",
      "failing test",
      "coverage",
    ],
    alwaysActive: false,
    promptInstructions: `### Skill: Superpowers: Test-Driven Development (TDD)
Reference: obra/superpowers

You must adhere to strict Test-Driven Development (TDD) engineering discipline. Never write implementation code before establishing how it will be verified.

#### Core Rules:
1. **Red Phase (Write Failing Test First)**:
   - Identify the exact behavior or edge case required.
   - Write a minimal, focused test that asserts this behavior.
   - Verify that the test fails for the expected reason (not due to syntax error or import failure).
2. **Green Phase (Minimal Implementation)**:
   - Write ONLY the minimum amount of code necessary to make the failing test pass.
   - Do NOT prematurely add speculative features, premature abstractions, or unrelated helpers.
3. **Refactor Phase (Clean Architecture)**:
   - Clean up code duplication, improve naming, and refine structure while keeping tests green.
   - Never alter test assertions during refactoring unless requirements changed.
4. **Anti-Pattern Guardrail**:
   - If asked to write a new feature or fix a bug, structure your answer by first demonstrating the test or verification command before writing the solution.`,
  },
  {
    id: "superpowers-debugging",
    name: "Superpowers: Systematic Debugging",
    category: "engineering_discipline",
    description:
      "4-phase root cause isolation methodology from obra/superpowers. Eliminates trial-and-error guesswork in favor of minimal repros and single-variable fixes.",
    icon: "🔍",
    enabled: true,
    isBuiltin: true,
    author: "obra/superpowers",
    referenceUrl: "https://github.com/obra/superpowers",
    triggers: [
      "debug",
      "bug",
      "error",
      "fix",
      "crash",
      "exception",
      "failed",
      "traceback",
      "troubleshoot",
      "broken",
      "why does",
      "stack trace",
      "undefined",
      "null pointer",
    ],
    alwaysActive: false,
    promptInstructions: `### Skill: Superpowers: Systematic Debugging
Reference: obra/superpowers

You must follow a rigorous, 4-phase investigative debugging methodology. Never make speculative or random code changes hoping something works.

#### The 4-Phase Protocol:
1. **Phase 1: Root Cause Investigation**:
   - Read the exact error message, error code, and stack trace line by line.
   - Trace backwards from the failure point to inspect inputs, state transitions, and variable types.
   - Do not guess or suggest a fix until the exact trigger mechanism is identified and proven.
2. **Phase 2: Minimal Reproduction**:
   - Isolate the smallest possible input, test case, or command that reproduces the failure deterministically.
3. **Phase 3: Single-Variable Hypothesis & Surgical Fix**:
   - Formulate an explicit hypothesis: "If we change X, error Y will be resolved because Z."
   - Change exactly ONE variable or code block at a time.
   - Avoid sprawling multi-file changes when fixing a specific bug.
4. **Phase 4: Regression & Blast Radius Verification**:
   - Verify that the fix resolves the reproduction case.
   - Check adjacent components, tests, and dependencies to guarantee no regressions were introduced.`,
  },
  {
    id: "superpowers-spec-plan",
    name: "Superpowers: Spec & Plan First",
    category: "architecture_planning",
    description:
      "Anti-vibe-coding guardrail from obra/superpowers. Forces deliberate engineering: Clarify Requirements → Interface Spec → Phased Milestones before writing code.",
    icon: "📐",
    enabled: true,
    isBuiltin: true,
    author: "obra/superpowers",
    referenceUrl: "https://github.com/obra/superpowers",
    triggers: [
      "plan",
      "spec",
      "design",
      "architect",
      "architecture",
      "build",
      "create app",
      "new feature",
      "refactor",
      "system design",
      "roadmap",
    ],
    alwaysActive: false,
    promptInstructions: `### Skill: Superpowers: Spec & Plan First
Reference: obra/superpowers

Prevent chaotic or premature implementation by enforcing a disciplined specification and planning lifecycle.

#### Methodology:
1. **Requirements & Scope Clarification**:
   - Uncover unstated assumptions, boundary constraints, and error scenarios upfront.
   - If requirements are ambiguous, clarify them before diving into deep code edits.
2. **Interface Specification**:
   - Define exact function signatures, data contracts, REST/IPC endpoints, and database schemas first.
   - Document error states and failure modes before happy paths.
3. **Phased Execution Plan**:
   - Break down implementation into self-contained, sequentially testable milestones.
   - Each milestone must have an explicit verification step (command, test, or visual check).
4. **Execution Discipline**:
   - Execute strictly against the approved plan. If unforeseen complexity arises, adjust the plan explicitly rather than wandering off-spec.`,
  },
  {
    id: "superpowers-code-review",
    name: "Superpowers: Code Review & Critique",
    category: "quality_security",
    description:
      "Adversarial self-audit from obra/superpowers. Scrutinizes code for security vulnerabilities, resource leaks, edge cases, and architectural regressions.",
    icon: "🛡️",
    enabled: true,
    isBuiltin: true,
    author: "obra/superpowers",
    referenceUrl: "https://github.com/obra/superpowers",
    triggers: [
      "review",
      "critique",
      "audit",
      "security",
      "check",
      "verify",
      "diff",
      "pr",
      "pull request",
      "inspect",
      "vulnerability",
    ],
    alwaysActive: false,
    promptInstructions: `### Skill: Superpowers: Code Review & Critique
Reference: obra/superpowers

Perform a rigorous, senior-engineer-level review on any code under discussion or being produced.

#### Review Dimensions:
1. **Security & Governance**:
   - Check for unvalidated inputs, SQL/command injection, path traversal, and unsafe deserialization.
   - Check for unhandled exceptions, unhandled Promise rejections, and missing bounds checks.
   - Ensure secrets, tokens, and credentials are never hardcoded.
2. **Correctness & Edge Conditions**:
   - Inspect edge boundaries (empty arrays, null/undefined, off-by-one indices, zero lengths).
   - Watch out for race conditions, memory leaks, unclosed file descriptors, and lingering timers.
3. **Maintainability & Architectural Consistency**:
   - Check that changes adhere to the existing codebase patterns and formatting.
   - Reject dead code, confusing abstractions, and misleading comments.
4. **Actionable Feedback**:
   - Group findings by severity (Critical / High / Medium / Polish).
   - Provide concrete diffs or replacement snippets for all flagged concerns.`,
  },
  {
    id: "superpowers-verification",
    name: "Superpowers: Chain of Verification (CoVE)",
    category: "reasoning_verification",
    description:
      "Cross-examination reasoning technique from obra/superpowers. Formulates baseline thoughts, generates independent verification questions, and synthesizes a verified answer.",
    icon: "🎯",
    enabled: true,
    isBuiltin: true,
    author: "obra/superpowers",
    referenceUrl: "https://github.com/obra/superpowers",
    triggers: [
      "verify",
      "fact",
      "accuracy",
      "research",
      "proof",
      "validate",
      "calculate",
      "analyze",
      "true or false",
      "explain why",
    ],
    alwaysActive: false,
    promptInstructions: `### Skill: Superpowers: Chain of Verification (CoVE)
Reference: obra/superpowers

When solving complex analytical, logical, or factual problems, apply an adversarial verification loop before producing the final conclusion.

#### 4-Step Verification Loop:
1. **Step 1: Baseline Formulation**:
   - Draft the initial answer or hypothesis quickly and directly.
2. **Step 2: Verification Query Generation**:
   - Formulate 2 to 4 independent verification questions specifically designed to test the premises, facts, or edge cases of the baseline.
3. **Step 3: Unbiased Execution**:
   - Answer each verification question objectively without forcing agreement with the baseline.
4. **Step 4: Final Synthesis**:
   - If verification questions expose errors, misconceptions, or discrepancies, revise the final output accordingly. State the verified conclusion with high fidelity.`,
  },
];

// ─── Skills Manager Class ────────────────────────────────────────────────

export class SkillsManager extends EventEmitter {
  private static instance: SkillsManager | null = null;
  private skills: Map<string, Skill> = new Map();
  private filterMode: SkillFilterMode = "smart_filter";

  private constructor() {
    super();
    this.loadPersistedSkills();
  }

  public static getInstance(): SkillsManager {
    if (!SkillsManager.instance) {
      SkillsManager.instance = new SkillsManager();
    }
    return SkillsManager.instance;
  }

  /**
   * Load skills from SQLite or initialize with built-in defaults.
   */
  private loadPersistedSkills(): void {
    try {
      const db = AgentDatabase.getInstance();

      // 1. Filter Mode
      const storedMode = db.getMeta(SKILLS_FILTER_MODE_KEY) as SkillFilterMode | undefined;
      if (storedMode === "smart_filter" || storedMode === "always_active") {
        this.filterMode = storedMode;
      }

      // 2. Skills Store
      const raw = db.getMeta(SKILLS_META_KEY);
      if (raw) {
        try {
          const list: Skill[] = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 0) {
            for (const item of list) {
              this.skills.set(item.id, item);
            }
          }
        } catch (parseErr) {
          logVerbose("warn", `[SkillsManager] Failed to parse stored skills: ${parseErr}`);
        }
      }

      // 3. Ensure all built-in skills exist (merge newly added defaults if missing)
      for (const builtin of DEFAULT_BUILTIN_SKILLS) {
        if (!this.skills.has(builtin.id)) {
          this.skills.set(builtin.id, { ...builtin });
        } else {
          // Keep user's enabled/disabled flag, but update built-in instructions/metadata
          const existing = this.skills.get(builtin.id)!;
          this.skills.set(builtin.id, {
            ...builtin,
            enabled: existing.enabled,
            alwaysActive: existing.alwaysActive ?? builtin.alwaysActive,
            triggers: existing.triggers && existing.triggers.length > 0 ? existing.triggers : builtin.triggers,
          });
        }
      }

      this.persist();
    } catch (err: any) {
      logVerbose("error", `[SkillsManager] Initialization error: ${err?.message}`);
      // Fallback in-memory defaults
      for (const builtin of DEFAULT_BUILTIN_SKILLS) {
        this.skills.set(builtin.id, { ...builtin });
      }
    }
  }

  /**
   * Persist current skills map to SQLite.
   */
  private persist(): void {
    try {
      const db = AgentDatabase.getInstance();
      const list = Array.from(this.skills.values());
      db.setMeta(SKILLS_META_KEY, JSON.stringify(list));
      db.setMeta(SKILLS_FILTER_MODE_KEY, this.filterMode);
    } catch (err: any) {
      logVerbose("error", `[SkillsManager] Failed to persist skills: ${err?.message}`);
    }
  }

  /** Get all skills */
  public getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /** Get a single skill by ID */
  public getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /** Get current filter mode */
  public getFilterMode(): SkillFilterMode {
    return this.filterMode;
  }

  /** Set current filter mode */
  public setFilterMode(mode: SkillFilterMode): void {
    if (mode === "smart_filter" || mode === "always_active") {
      this.filterMode = mode;
      this.persist();
      this.emit("mode:changed", mode);
    }
  }

  /** Toggle skill enabled state */
  public toggleSkill(id: string, enabled: boolean): boolean {
    const skill = this.skills.get(id);
    if (!skill) return false;
    skill.enabled = enabled;
    skill.updatedAt = new Date().toISOString();
    this.persist();
    this.emit("skill:toggled", skill);
    return true;
  }

  /** Save or update a skill */
  public saveSkill(skillData: Partial<Skill> & { name: string }): Skill {
    const id = (skillData.id || skillData.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-")).trim();
    if (!id) throw new Error("Skill id or name is required.");

    const existing = this.skills.get(id);
    const now = new Date().toISOString();

    const cleanTriggers = Array.isArray(skillData.triggers)
      ? skillData.triggers
          .map((t) => String(t).trim().toLowerCase())
          .filter((t) => t.length > 0)
      : [];

    const skill: Skill = {
      id,
      name: skillData.name.trim(),
      category: skillData.category || (existing?.category ?? "custom"),
      description: (skillData.description || "").trim(),
      icon: (skillData.icon || (existing?.icon ?? "🧠")).trim(),
      enabled: skillData.enabled !== undefined ? Boolean(skillData.enabled) : (existing?.enabled ?? true),
      isBuiltin: existing ? existing.isBuiltin : false,
      author: skillData.author || existing?.author || "User",
      referenceUrl: skillData.referenceUrl || existing?.referenceUrl,
      triggers: cleanTriggers.length > 0 ? cleanTriggers : (existing?.triggers ?? []),
      alwaysActive: skillData.alwaysActive !== undefined ? Boolean(skillData.alwaysActive) : Boolean(existing?.alwaysActive),
      promptInstructions: (skillData.promptInstructions || existing?.promptInstructions || "").trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.skills.set(id, skill);
    this.persist();
    this.emit("skill:saved", skill);
    return skill;
  }

  /** Delete a custom skill (built-in skills cannot be deleted, only disabled) */
  public deleteSkill(id: string): boolean {
    const skill = this.skills.get(id);
    if (!skill) return false;
    if (skill.isBuiltin) {
      throw new Error("Built-in engine skills cannot be deleted. You can disable them instead.");
    }
    const deleted = this.skills.delete(id);
    if (deleted) {
      this.persist();
      this.emit("skill:deleted", id);
    }
    return deleted;
  }

  /** Reset all skills to built-in factory defaults */
  public resetToDefaults(): Skill[] {
    this.skills.clear();
    for (const s of DEFAULT_BUILTIN_SKILLS) {
      this.skills.set(s.id, { ...s });
    }
    this.filterMode = "smart_filter";
    this.persist();
    this.emit("skills:reset");
    return this.getSkills();
  }

  /**
   * Evaluates a user prompt and returns skills that should be applied.
   * In "always_active" mode, all enabled skills are returned.
   * In "smart_filter" mode, enabled skills with alwaysActive=true OR matching triggers are returned.
   */
  public getApplicableSkills(prompt: string): Skill[] {
    const enabledSkills = Array.from(this.skills.values()).filter((s) => s.enabled);
    if (enabledSkills.length === 0) return [];

    if (this.filterMode === "always_active") {
      return enabledSkills;
    }

    const cleanPrompt = ` ${prompt.toLowerCase().replace(/[^a-z0-9_\-\s]/g, " ")} `;

    return enabledSkills.filter((skill) => {
      if (skill.alwaysActive) return true;
      if (!skill.triggers || skill.triggers.length === 0) return false;

      return skill.triggers.some((tr) => {
        const cleanTr = tr.trim().toLowerCase();
        if (!cleanTr) return false;

        // If trigger contains multiple words (e.g. "unit test", "code review")
        if (cleanTr.includes(" ")) {
          return cleanPrompt.includes(` ${cleanTr} `) || cleanPrompt.includes(cleanTr);
        }

        // Single word word-boundary match
        const regex = new RegExp(`\\b${cleanTr}\\b`, "i");
        return regex.test(cleanPrompt);
      });
    });
  }

  /**
   * Build the formatted prompt instructions block for the LLM reasoning context.
   */
  public buildSkillsPromptSection(prompt: string): {
    promptSection: string;
    activeSkills: Skill[];
  } {
    const activeSkills = this.getApplicableSkills(prompt);
    if (activeSkills.length === 0) {
      return { promptSection: "", activeSkills: [] };
    }

    const skillBlocks = activeSkills
      .map((s) => {
        return `─── Cognitive Skill: ${s.name.toUpperCase()} ───\n${s.promptInstructions}`;
      })
      .join("\n\n");

    const promptSection = `\n\n═══════════════════════════════════════════════════════════════════
COGNITIVE REASONING SKILLS & DIRECTIVES (${activeSkills.length} active)
The user has configured the following cognitive thinking skills to govern your thoughts, verification loops, and output formatting. You MUST strictly adhere to these principles:
═══════════════════════════════════════════════════════════════════\n\n${skillBlocks}`;

    return { promptSection, activeSkills };
  }

  /**
   * Import a skill from Markdown (supports YAML frontmatter or standard Markdown format like SKILL.md).
   */
  public importSkillFromMarkdown(content: string, filename = "imported-skill.md"): Skill {
    let name = filename.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]/g, " ");
    let id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    let description = "";
    let triggers: string[] = [];
    let category: SkillCategory = "custom";
    let body = content;

    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (frontmatterMatch) {
      const yamlStr = frontmatterMatch[1];
      body = frontmatterMatch[2].trim();

      const lines = yamlStr.split("\n");
      for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");

          if (key === "name" || key === "title") name = val;
          else if (key === "id") id = val.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
          else if (key === "description" || key === "desc") description = val;
          else if (key === "category") {
            const cat = val.toLowerCase().replace(/[\s-]/g, "_") as SkillCategory;
            category = cat;
          } else if (key === "triggers" || key === "keywords" || key === "tags") {
            triggers = val
              .split(/[,;]/)
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean);
          }
        }
      }
    } else {
      // Parse markdown headers
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        name = titleMatch[1].trim();
        id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      }
      const descMatch = content.match(/^>\s*(.+)$/m);
      if (descMatch) {
        description = descMatch[1].trim();
      }
    }

    if (!description && body) {
      const firstPara = body.split("\n\n")[0] || "";
      description = firstPara.slice(0, 160).replace(/[#>*_`]/g, "").trim();
    }

    return this.saveSkill({
      id,
      name,
      category,
      description: description || "Imported agent skill script.",
      icon: "🧠",
      enabled: true,
      triggers: triggers.length > 0 ? triggers : [id.replace(/-/g, " ")],
      promptInstructions: body,
    });
  }

  /**
   * Export a skill as Markdown (compatible with SKILL.md format) and JSON.
   */
  public exportSkill(id: string): { markdown: string; json: Skill } | null {
    const skill = this.skills.get(id);
    if (!skill) return null;

    const frontmatter = [
      "---",
      `name: "${skill.name.replace(/"/g, '\\"')}"`,
      `id: "${skill.id}"`,
      `category: "${skill.category}"`,
      `description: "${skill.description.replace(/"/g, '\\"')}"`,
      `triggers: "${skill.triggers.join(", ")}"`,
      `always_active: ${Boolean(skill.alwaysActive)}`,
      skill.referenceUrl ? `reference: "${skill.referenceUrl}"` : null,
      "---",
      "",
      `# ${skill.name}`,
      "",
      `> ${skill.description}`,
      "",
      skill.promptInstructions,
    ]
      .filter((line) => line !== null)
      .join("\n");

    return {
      markdown: frontmatter,
      json: { ...skill },
    };
  }
}
