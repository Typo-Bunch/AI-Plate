/**
 * Personal Memory & Sovereign Dossier Engine.
 *
 * 3-Tier Hybrid Architecture:
 *   1. Tier 1: Dynamic Fact Capture with Conflict Resolution (ADD, UPDATE, INVALIDATE, NOOP)
 *   2. Tier 2: Generative Reflection & Importance Scoring (1-10)
 *   3. Tier 3: Sovereign Living Dossier (USER_PROFILE.md) synced locally on disk
 */

import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AgentDatabase } from "./database.js";

// ─── Interfaces ────────────────────────────────────────────────────────

export interface UserFact {
  id: number;
  category: "identity" | "preference" | "project" | "lifestyle" | "instruction";
  fact_key: string;
  fact_value: string;
  confidence: number;
  importance: number;
  source_session_id?: string;
  status: "active" | "invalidated" | "archived";
  created_at: string;
  updated_at: string;
}

export interface UserReflection {
  id: number;
  title: string;
  insight: string;
  evidence_count: number;
  importance: number;
  confidence: number;
  status: "active" | "dismissed";
  created_at: string;
  updated_at: string;
}

export interface GeneralSettings {
  ui_language: string;
  response_language: string;
  user_name: string;
  butler_tone: string;
  send_shortcut: "enter" | "ctrl_enter";
  auto_scroll: boolean;
  audio_cues: boolean;
  auto_learn: boolean;
  close_action: "tray" | "quit" | "ask";
  confirm_quit: boolean;
  launch_startup: boolean;
  start_minimized: boolean;
  restore_session: boolean;
  token_streaming?: boolean;
}

export type ConflictResolutionAction = "ADD" | "UPDATE" | "INVALIDATE" | "NOOP";

export interface ConflictResolutionResult {
  action: ConflictResolutionAction;
  factId?: number;
  previousValue?: string;
  newValue: string;
  factKey: string;
}

// ─── Personal Memory Manager Singleton ─────────────────────────────────

export class PersonalMemoryManager {
  private static instance: PersonalMemoryManager | null = null;
  private readonly agentDb: AgentDatabase;
  private readonly profilePath: string;

  constructor(customDbPath?: string) {
    this.agentDb = AgentDatabase.getInstance(customDbPath);
    const baseDir = process.env.AIPLATE_USERDATA || process.cwd();
    this.profilePath = resolve(baseDir, "USER_PROFILE.md");
    this.ensureInitialDossier();
  }

  public static getInstance(customDbPath?: string): PersonalMemoryManager {
    if (!PersonalMemoryManager.instance) {
      PersonalMemoryManager.instance = new PersonalMemoryManager(customDbPath);
    }
    return PersonalMemoryManager.instance;
  }

  public getProfilePath(): string {
    return this.profilePath;
  }

  // ─── Tier 1: Conflict-Resolving Fact Operations ──────────────────────

  /**
   * Save or update a user fact using atomic conflict resolution.
   */
  public commitFact(
    category: UserFact["category"],
    factKey: string,
    factValue: string,
    confidence: number = 1.0,
    importance: number = 5,
    sessionId?: string
  ): ConflictResolutionResult {
    const cleanKey = factKey.toLowerCase().trim().replace(/\s+/g, "_");
    const cleanValue = factValue.trim();
    const now = new Date().toISOString();

    // Check for existing active fact with the same key
    const existing = this.agentDb.db
      .prepare(
        "SELECT * FROM user_facts WHERE fact_key = ? AND status = 'active' ORDER BY id DESC LIMIT 1"
      )
      .get(cleanKey) as UserFact | undefined;

    if (!existing) {
      // ADD novel fact
      const result = this.agentDb.db
        .prepare(`
          INSERT INTO user_facts (category, fact_key, fact_value, confidence, importance, source_session_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `)
        .run(category, cleanKey, cleanValue, confidence, importance, sessionId || null, now, now);

      this.syncLivingDossier();
      return {
        action: "ADD",
        factId: Number(result.lastInsertRowid),
        newValue: cleanValue,
        factKey: cleanKey,
      };
    }

    // Check if the value is essentially identical (NOOP)
    if (existing.fact_value.toLowerCase().trim() === cleanValue.toLowerCase()) {
      this.agentDb.db
        .prepare("UPDATE user_facts SET confidence = ?, updated_at = ? WHERE id = ?")
        .run(Math.max(existing.confidence, confidence), now, existing.id);
      return {
        action: "NOOP",
        factId: existing.id,
        newValue: cleanValue,
        factKey: cleanKey,
      };
    }

    // Conflict detected: UPDATE / Invalidate previous and insert new active record
    this.agentDb.db.transaction(() => {
      this.agentDb.db
        .prepare("UPDATE user_facts SET status = 'invalidated', updated_at = ? WHERE id = ?")
        .run(now, existing.id);

      this.agentDb.db
        .prepare(`
          INSERT INTO user_facts (category, fact_key, fact_value, confidence, importance, source_session_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `)
        .run(category, cleanKey, cleanValue, confidence, Math.max(existing.importance, importance), sessionId || null, now, now);
    })();

    this.syncLivingDossier();
    return {
      action: "UPDATE",
      factId: existing.id,
      previousValue: existing.fact_value,
      newValue: cleanValue,
      factKey: cleanKey,
    };
  }

  /**
   * Delete a fact by ID.
   */
  public deleteFact(factId: number): boolean {
    const result = this.agentDb.db
      .prepare("DELETE FROM user_facts WHERE id = ?")
      .run(factId);
    if (result.changes > 0) {
      this.syncLivingDossier();
      return true;
    }
    return false;
  }

  /**
   * Get all active user facts.
   */
  public listActiveFacts(): UserFact[] {
    return this.agentDb.db
      .prepare("SELECT * FROM user_facts WHERE status = 'active' ORDER BY importance DESC, updated_at DESC")
      .all() as UserFact[];
  }

  // ─── Tier 2: Generative Reflection & Insights ────────────────────────

  /**
   * Record or update a high-level behavioral reflection with importance score.
   */
  public commitReflection(
    title: string,
    insight: string,
    importance: number = 7,
    confidence: number = 0.85
  ): UserReflection {
    const now = new Date().toISOString();
    const existing = this.agentDb.db
      .prepare("SELECT * FROM user_reflections WHERE title = ? AND status = 'active' LIMIT 1")
      .get(title) as UserReflection | undefined;

    if (existing) {
      const updatedEvidence = existing.evidence_count + 1;
      const updatedConfidence = Math.min(1.0, existing.confidence + 0.05);
      this.agentDb.db
        .prepare(`
          UPDATE user_reflections 
          SET insight = ?, evidence_count = ?, confidence = ?, importance = ?, updated_at = ? 
          WHERE id = ?
        `)
        .run(insight, updatedEvidence, updatedConfidence, Math.max(existing.importance, importance), now, existing.id);

      this.syncLivingDossier();
      return {
        ...existing,
        insight,
        evidence_count: updatedEvidence,
        confidence: updatedConfidence,
        importance: Math.max(existing.importance, importance),
        updated_at: now,
      };
    }

    const res = this.agentDb.db
      .prepare(`
        INSERT INTO user_reflections (title, insight, evidence_count, importance, confidence, status, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?, 'active', ?, ?)
      `)
      .run(title, insight, importance, confidence, now, now);

    this.syncLivingDossier();
    return {
      id: Number(res.lastInsertRowid),
      title,
      insight,
      evidence_count: 1,
      importance,
      confidence,
      status: "active",
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * List all active reflections.
   */
  public listActiveReflections(): UserReflection[] {
    return this.agentDb.db
      .prepare("SELECT * FROM user_reflections WHERE status = 'active' ORDER BY importance DESC, evidence_count DESC")
      .all() as UserReflection[];
  }

  /**
   * Delete or dismiss a reflection.
   */
  public deleteReflection(id: number): boolean {
    const res = this.agentDb.db
      .prepare("DELETE FROM user_reflections WHERE id = ?")
      .run(id);
    if (res.changes > 0) {
      this.syncLivingDossier();
      return true;
    }
    return false;
  }

  /**
   * Wipe all active facts and reflections, resetting to a clean slate.
   */
  public wipePersonalMemory(): void {
    this.agentDb.db.prepare("DELETE FROM user_facts").run();
    this.agentDb.db.prepare("DELETE FROM user_reflections").run();
    this.syncLivingDossier();
  }

  // ─── Turn Observer & Heuristic Extractor ──────────────────────────────

  /**
   * Observe a conversation turn and automatically extract facts and update reflections.
   */
  public observeTurn(userInput: string, assistantResponse: string, sessionId?: string): void {
    const autoLearn = this.getGeneralSetting("auto_learn", "true") === "true";
    if (!autoLearn) return;

    const trimmedInput = userInput.trim();

    // 1. Identity & Name Extraction
    const nameMatch = trimmedInput.match(
      /(?:my name is|call me|refer to me as)\s+([A-Za-z0-9\.\-']+)(?:\s+([A-Za-z0-9\.\-']+))?/i
    );
    if (nameMatch && nameMatch[1]) {
      const stopWords = ["and", "i", "the", "a", "an", "please", "here", "now", "today", "ready", "sorry"];
      let first = nameMatch[1].replace(/[\,!;:?]+$/, "");
      if (first.endsWith(".") && !/^(dr|mr|mrs|ms|prof)\.$/i.test(first)) first = first.slice(0, -1);
      let second = nameMatch[2] ? nameMatch[2].replace(/[\,!;:?]+$/, "") : "";
      if (second.endsWith(".")) second = second.slice(0, -1);
      if (second && stopWords.includes(second.toLowerCase())) second = "";
      const detectedName = (first + (second ? " " + second : "")).trim();
      if (detectedName && !stopWords.includes(detectedName.toLowerCase())) {
        this.commitFact("identity", "user_name", detectedName, 1.0, 10, sessionId);
        this.setGeneralSetting("user_name", detectedName);
      }
    } else {
      const iamMatch = trimmedInput.match(
        /(?:^|[,\.\?!]\s*)(?:i am|i'm)\s+([A-Z][a-zA-Z0-9\-']+)(?:\s+([A-Z][a-zA-Z0-9\-']+))?(?:[,\.\?!]|$)/
      );
      if (iamMatch && iamMatch[1]) {
        const notNames = ["working", "building", "looking", "trying", "going", "happy", "excited", "ready", "here", "sure", "sorry", "glad", "tired", "using", "testing"];
        if (!notNames.includes(iamMatch[1].toLowerCase())) {
          let first = iamMatch[1];
          let second = iamMatch[2] || "";
          if (second && notNames.includes(second.toLowerCase())) second = "";
          const detectedName = (first + (second ? " " + second : "")).trim();
          if (detectedName) {
            this.commitFact("identity", "user_name", detectedName, 1.0, 10, sessionId);
            this.setGeneralSetting("user_name", detectedName);
          }
        }
      }
    }

    // 2. Current Project / Focus Extraction
    const projectMatch = trimmedInput.match(
      /(?:i am working on|i'm working on|i'm building|i am building|my project is|launching a|launching an)\s+([^\.,!;\n]{4,80})/i
    );
    if (projectMatch && projectMatch[1]) {
      const proj = projectMatch[1].trim();
      this.commitFact("project", "active_project", proj, 0.9, 8, sessionId);
    }

    // 3. Explicit Preference / Instruction Extraction
    const prefMatch = trimmedInput.match(
      /(?:i prefer|i like|i always want|format as|make sure to)\s+([^\.,!;\n]{4,80})/i
    );
    if (prefMatch && prefMatch[1]) {
      const pref = prefMatch[1].trim();
      this.commitFact("preference", "preferred_style", pref, 0.85, 7, sessionId);
    }

    // 4. Synthesize Behavioral Reflection Patterns
    if (
      trimmedInput.toLowerCase().includes("bullet") ||
      trimmedInput.toLowerCase().includes("concise") ||
      trimmedInput.toLowerCase().includes("skip the intro") ||
      trimmedInput.toLowerCase().includes("no fluff")
    ) {
      this.commitReflection(
        "Executive Brevity",
        "Prefers high-density structured tables, concise bullet points, and zero conversational fluff.",
        9,
        0.9
      );
    }

    if (
      trimmedInput.toLowerCase().includes("code") ||
      trimmedInput.toLowerCase().includes("script") ||
      trimmedInput.toLowerCase().includes("typescript") ||
      trimmedInput.toLowerCase().includes("python")
    ) {
      this.commitReflection(
        "Complete Production Code",
        "Values full drop-in runnable code implementations rather than fragmentary placeholders.",
        8,
        0.85
      );
    }
  }

  // ─── Tier 3: Sovereign Living Dossier (USER_PROFILE.md) ────────────────

  /**
   * Synchronize active facts and reflections to USER_PROFILE.md on disk.
   */
  public syncLivingDossier(): void {
    try {
      const facts = this.listActiveFacts();
      const reflections = this.listActiveReflections();
      const settings = this.getAllGeneralSettings();

      const identityFacts = facts.filter((f) => f.category === "identity");
      const projectFacts = facts.filter((f) => f.category === "project");
      const prefFacts = facts.filter((f) => f.category === "preference" || f.category === "instruction");
      const otherFacts = facts.filter((f) => !["identity", "project", "preference", "instruction"].includes(f.category));

      let md = `# 👤 Sovereign Personal Dossier\n`;
      md += `*Maintained automatically by AI Plate Butler • Stored on-device in your sanctuary*\n`;
      md += `*Last synchronized: ${new Date().toLocaleString()}*\n\n`;

      md += `## 🪪 Identity & Addressing\n`;
      if (settings.user_name || identityFacts.length > 0) {
        const nameToDisplay = settings.user_name || identityFacts[0]?.fact_value || "Esteemed User";
        md += `- **Preferred Name / Title**: ${nameToDisplay} [Importance: 10/10]\n`;
        md += `- **Butler Demeanor**: ${settings.butler_tone === "concise" ? "Concise & Direct" : settings.butler_tone === "friendly" ? "Warm & Supportive" : "Courteous Genius Butler"}\n`;
        for (const f of identityFacts) {
          if (f.fact_key !== "user_name") {
            md += `- **${this.formatKey(f.fact_key)}**: ${f.fact_value} [Importance: ${f.importance}/10]\n`;
          }
        }
      } else {
        md += `*No identity facts recorded yet. Simply tell your butler your name in chat.*\n`;
      }
      md += `\n`;

      md += `## 🎯 Active Projects & Endeavors\n`;
      if (projectFacts.length > 0) {
        for (const f of projectFacts) {
          md += `- **${this.formatKey(f.fact_key)}**: ${f.fact_value} [Importance: ${f.importance}/10]\n`;
        }
      } else {
        md += `*No ongoing projects recorded yet.*\n`;
      }
      md += `\n`;

      md += `## 💡 Working Style & Preferences\n`;
      if (prefFacts.length > 0) {
        for (const f of prefFacts) {
          md += `- **${this.formatKey(f.fact_key)}**: ${f.fact_value} [Importance: ${f.importance}/10]\n`;
        }
      } else {
        md += `*No explicit preferences stated yet.*\n`;
      }
      md += `\n`;

      if (otherFacts.length > 0) {
        md += `## 📌 Additional Memoranda\n`;
        for (const f of otherFacts) {
          md += `- **${this.formatKey(f.fact_key)}**: ${f.fact_value} [Importance: ${f.importance}/10]\n`;
        }
        md += `\n`;
      }

      md += `## 🧠 Behavioral Reflections & Learned Habits\n`;
      if (reflections.length > 0) {
        for (const r of reflections) {
          md += `- **${r.title}**: ${r.insight} [Confidence: ${Math.round(r.confidence * 100)}% • Evidence: ${r.evidence_count}x]\n`;
        }
      } else {
        md += `*The reflection engine will synthesize habits here as you interact with AI Plate.*\n`;
      }

      writeFileSync(this.profilePath, md, "utf-8");
    } catch (err) {
      console.error("[PersonalMemory] Failed to sync USER_PROFILE.md:", err);
    }
  }

  /**
   * Ensure an initial clean USER_PROFILE.md exists on disk.
   */
  private ensureInitialDossier(): void {
    if (!existsSync(this.profilePath)) {
      this.syncLivingDossier();
    }
  }

  /**
   * Build an augmented prompt context block containing permanent user facts and reflections.
   */
  public buildMemoryPromptContext(query?: string): string {
    const facts = this.listActiveFacts();
    const reflections = this.listActiveReflections();
    const settings = this.getAllGeneralSettings();

    if (facts.length === 0 && reflections.length === 0 && !settings.user_name) {
      return "";
    }

    // When a query is provided, check if personal profile or facts are relevant
    let filteredFacts = facts;
    let filteredReflections = reflections;
    let includeProfileContext = true;

    if (query && typeof query === "string") {
      const qLower = query.toLowerCase();
      const isPersonalQuery = /\b(i|me|my|mine|myself|who am i|call me|remember|profile|preference|preferences|habit|habits|project|projects|about me)\b/i.test(query);

      if (!isPersonalQuery) {
        // Only include facts or reflections whose keywords actually appear in the query
        filteredFacts = facts.filter((f) => {
          const keyWords = f.fact_key.toLowerCase().split(/[_\s]+/);
          const valWords = f.fact_value.toLowerCase().split(/[_\s]+/).filter((w) => w.length > 3);
          return keyWords.some((w) => qLower.includes(w)) || valWords.some((w) => qLower.includes(w));
        });

        filteredReflections = reflections.filter((r) => {
          const titleWords = r.title.toLowerCase().split(/[_\s]+/);
          return titleWords.some((w) => qLower.includes(w));
        });

        // If no facts or reflections match the query and it's not a personal query, don't force personal profile
        if (filteredFacts.length === 0 && filteredReflections.length === 0) {
          includeProfileContext = false;
        }
      }
    }

    if (!includeProfileContext) {
      return "";
    }

    const lines: string[] = [
      "─── Household & User Memory Sanctuary (Permanent On-Device Profile) ───",
      "Background context about the user (use for reference only; do NOT greet with salutations, do NOT address by name on every message, and do NOT force preferences onto unrelated tasks):",
    ];

    if (settings.user_name) {
      lines.push(`- User's Name: "${settings.user_name}" (Do NOT greet or address the user by name repeatedly in every prompt; jump straight to the task).`);
    }

    if (settings.butler_tone) {
      lines.push(`- Demeanor Style: ${settings.butler_tone} (Adopt concise, direct communication without servile greetings or theatrical persona pleasantries).`);
    }

    if (settings.response_language && settings.response_language !== "match_ui") {
      lines.push(`- Preferred Response Language: ${settings.response_language}`);
    }

    for (const f of filteredFacts.slice(0, 20)) {
      lines.push(`- [Fact] ${this.formatKey(f.fact_key)}: ${f.fact_value}`);
    }

    for (const r of filteredReflections.slice(0, 4)) {
      lines.push(`- [Learned Habit] ${r.title}: ${r.insight}`);
    }

    lines.push("──────────────────────────────────────────────────────────────────────");
    return lines.join("\n");
  }

  // ─── General Settings KV Storage ──────────────────────────────────────

  public getGeneralSetting(key: string, defaultValue: string = ""): string {
    const row = this.agentDb.db
      .prepare("SELECT value FROM general_settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  }

  public setGeneralSetting(key: string, value: string): void {
    const now = new Date().toISOString();
    this.agentDb.db
      .prepare(`
        INSERT INTO general_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `)
      .run(key, value, now);

    if (key === "user_name" && value.trim()) {
      this.commitFact("identity", "user_name", value.trim(), 1.0, 10);
    }
  }

  public getAllGeneralSettings(): GeneralSettings {
    const settings: GeneralSettings = {
      ui_language: this.getGeneralSetting("ui_language", "en"),
      response_language: this.getGeneralSetting("response_language", "match_ui"),
      user_name: this.getGeneralSetting("user_name", ""),
      butler_tone: this.getGeneralSetting("butler_tone", "butler"),
      send_shortcut: (this.getGeneralSetting("send_shortcut", "enter") as any) || "enter",
      auto_scroll: this.getGeneralSetting("auto_scroll", "true") === "true",
      audio_cues: this.getGeneralSetting("audio_cues", "true") === "true",
      auto_learn: this.getGeneralSetting("auto_learn", "true") === "true",
      close_action: (this.getGeneralSetting("close_action", "tray") as any) || "tray",
      confirm_quit: this.getGeneralSetting("confirm_quit", "false") === "true",
      launch_startup: this.getGeneralSetting("launch_startup", "false") === "true",
      start_minimized: this.getGeneralSetting("start_minimized", "false") === "true",
      restore_session: this.getGeneralSetting("restore_session", "true") === "true",
      token_streaming: this.getGeneralSetting("token_streaming", "true") === "true",
    };
    return settings;
  }

  private formatKey(key: string): string {
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
