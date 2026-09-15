/**
 * Session Vector Memory — SQLite-Backed Context-Aware Conversation Memory.
 *
 * Backed by `better-sqlite3`:
 *   - Stored in the unified `agent_data.db` database.
 *   - Vectors stored as binary IEEE 754 Float32 BLOBs (zero string conversion).
 *   - Fast SQL index on timestamps for instant shelf-life pruning.
 */

import { isChatMode } from "./chat-mode.js";
import type { ChatMode } from "./types.js";
import type Database from "better-sqlite3";
import { CONFIG } from "./config.js";
import { UniversalEmbedder } from "./embedder.js";
import {
  AgentDatabase,
  vectorToBlob,
  blobToVector,
  cosineSimilarityF32,
} from "./database.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  turnCount: number;
  mode: ChatMode;
}

export interface SessionMessage {
  id: number;
  role: "user" | "model";
  content: string;
  timestamp: string;
}

interface MemoryEntry {
  id: number;
  sessionId: string;
  role: "user" | "model";
  content: string;
  embedding: Float32Array;
  timestamp: string;
}

const ACTIVE_SESSION_META_KEY = "active_session";

// ─── Session Vector Memory ─────────────────────────────────────────

export class SessionVectorMemory {
  private readonly embedder: UniversalEmbedder;
  private readonly agentDb: AgentDatabase;
  private readonly topK: number;
  private currentSessionId: string = "default";

  // Pre-compiled SQLite statements for low latency and zero repeated compilation
  private readonly stmtCheckSessionExists: Database.Statement;
  private readonly stmtInsertSession: Database.Statement;
  private readonly stmtUpdateSessionTitle: Database.Statement;
  private readonly stmtUpdateSessionActive: Database.Statement;
  private readonly stmtListSessions: Database.Statement;
  private readonly stmtGetSessionMessages: Database.Statement;
  private readonly stmtDeleteTurns: Database.Statement;
  private readonly stmtDeleteSession: Database.Statement;
  private readonly stmtRecallTurns: Database.Statement;
  private readonly stmtInsertTurn: Database.Statement;
  private readonly stmtUpdateTurnEmbedding: Database.Statement;
  private readonly stmtCountTurns: Database.Statement;

  constructor(
    customDbPath?: string,
    topK: number = CONFIG.RAG.DEFAULT_TOP_K,
    customDb?: AgentDatabase
  ) {
    this.embedder = UniversalEmbedder.getInstance();
    this.agentDb = customDb ?? (customDbPath ? new AgentDatabase(customDbPath) : AgentDatabase.getInstance());
    this.topK = topK;

    // Pre-compile frequent SQLite statements for high performance
    this.stmtCheckSessionExists = this.agentDb.db.prepare(
      "SELECT id FROM sessions WHERE id = ?"
    );
    this.stmtInsertSession = this.agentDb.db.prepare(
      "INSERT INTO sessions (id, title, created_at, last_active_at) VALUES (?, ?, ?, ?)"
    );
    this.stmtUpdateSessionTitle = this.agentDb.db.prepare(
      "UPDATE sessions SET title = ?, last_active_at = ? WHERE id = ?"
    );
    this.stmtUpdateSessionActive = this.agentDb.db.prepare(
      "UPDATE sessions SET last_active_at = ? WHERE id = ?"
    );
    this.stmtListSessions = this.agentDb.db.prepare(`
      SELECT s.id, s.title, s.created_at AS createdAt, s.last_active_at AS lastActiveAt,
             COUNT(t.id) AS turnCount
      FROM sessions s
      LEFT JOIN session_turns t ON s.id = t.session_id
      GROUP BY s.id
      ORDER BY s.rowid DESC
    `);
    this.stmtGetSessionMessages = this.agentDb.db.prepare(
      "SELECT id, role, content, timestamp FROM session_turns WHERE session_id = ? ORDER BY id ASC"
    );
    this.stmtDeleteTurns = this.agentDb.db.prepare(
      "DELETE FROM session_turns WHERE session_id = ?"
    );
    this.stmtDeleteSession = this.agentDb.db.prepare(
      "DELETE FROM sessions WHERE id = ?"
    );
    this.stmtRecallTurns = this.agentDb.db.prepare(
      "SELECT id, session_id, role, content, embedding, timestamp FROM session_turns WHERE session_id = ? ORDER BY id DESC LIMIT 100"
    );
    this.stmtInsertTurn = this.agentDb.db.prepare(`
      INSERT INTO session_turns (session_id, role, content, embedding, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.stmtUpdateTurnEmbedding = this.agentDb.db.prepare(
      "UPDATE session_turns SET embedding = ? WHERE id = ?"
    );
    this.stmtCountTurns = this.agentDb.db.prepare(
      "SELECT COUNT(*) AS c FROM session_turns WHERE session_id = ?"
    );

    this.ensureDefaultSession();
    this.restoreActiveSession();
  }

  /** Ensure default session exists in SQLite */
  private ensureDefaultSession(): void {
    if (!this.stmtCheckSessionExists.get("default")) {
      const now = new Date().toISOString();
      this.stmtInsertSession.run("default", "Initial Chat", now, now);
    }
  }

  /** Restore the last active session from persisted metadata. */
  private restoreActiveSession(): void {
    const persisted = this.agentDb.getMeta(ACTIVE_SESSION_META_KEY);
    if (persisted) {
      const exists = this.stmtCheckSessionExists.get(persisted);
      if (exists) {
        this.currentSessionId = persisted;
        return;
      }
    }
    this.persistActiveSession();
  }

  /** Persist the current session id so it survives restarts. */
  private persistActiveSession(): void {
    this.agentDb.setMeta(ACTIVE_SESSION_META_KEY, this.currentSessionId);
  }

  // ─── Session Management API ─────────────────────────────────────

  public get activeSessionId(): string {
    return this.currentSessionId;
  }

  /** Create a new isolated chat session */
  createSession(title?: string): { id: string; title: string; createdAt: string } {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sessionTitle = title || "New Chat";
    const now = new Date().toISOString();

    this.stmtInsertSession.run(id, sessionTitle, now, now);
    this.currentSessionId = id;
    this.persistActiveSession();

    return { id, title: sessionTitle, createdAt: now };
  }

  /** Switch active session */
  switchSession(sessionId: string): boolean {
    const exists = this.stmtCheckSessionExists.get(sessionId);
    if (!exists) {
      // Auto-create if not exists
      const now = new Date().toISOString();
      this.stmtInsertSession.run(sessionId, "Chat Session", now, now);
    }
    this.currentSessionId = sessionId;
    this.persistActiveSession();
    return true;
  }

  /** Update session title */
  updateSessionTitle(sessionId: string, title: string): void {
    const now = new Date().toISOString();
    this.stmtUpdateSessionTitle.run(title, now, sessionId);
  }

  getSessionMode(sessionId: string): ChatMode {
    const mode = this.agentDb.getMeta(`chat_mode:${sessionId}`);
    return isChatMode(mode) ? mode : "normal";
  }

  setSessionMode(sessionId: string, mode: ChatMode): void {
    if (!isChatMode(mode)) throw new Error("Invalid chat mode");
    if (!this.stmtCheckSessionExists.get(sessionId)) throw new Error("Session does not exist");
    this.agentDb.setMeta(`chat_mode:${sessionId}`, mode);
  }

  /** List all stored chat sessions */
  listSessions(): SessionInfo[] {
    return (this.stmtListSessions.all() as SessionInfo[]).map(session => ({ ...session, mode: this.getSessionMode(session.id) }));
  }

  /** Get all past messages for a specific session */
  getSessionMessages(sessionId: string | { id: string }): SessionMessage[] {
    const sid = typeof sessionId === "string" ? sessionId : (sessionId as any)?.id || this.currentSessionId;
    return this.stmtGetSessionMessages.all(sid) as SessionMessage[];
  }

  /** Delete a session and all its stored memory turns */
  deleteSession(sessionId: string): boolean {
    this.agentDb.db.prepare("DELETE FROM meta WHERE key = ?").run(`chat_mode:${sessionId}`);
    this.stmtDeleteTurns.run(sessionId);
    const res = this.stmtDeleteSession.run(sessionId);

    if (this.currentSessionId === sessionId) {
      const remaining = this.listSessions();
      if (remaining.length > 0) {
        this.currentSessionId = remaining[0].id;
      } else {
        this.createSession("New Chat");
      }
      this.persistActiveSession();
    }
    return res.changes > 0;
  }

  // ─── Public Context Recall & Memorize API ────────────────────────

  /**
   * Recall the most relevant past conversation turns for the given query within the session.
   */
  async recall(
    query: string,
    sessionId?: string,
    maxResults?: number
  ): Promise<{ context: string; turnCount: number }> {
    const sid = sessionId || this.currentSessionId;
    const trimmed = query.trim().toLowerCase();

    // Skip trivial greetings and single-word conversational prompts
    const GREETINGS = new Set(["hi", "hello", "hey", "hola", "yo", "thanks", "thank you", "ok", "okay", "bye", "resume"]);
    if (trimmed.length < 8 || GREETINGS.has(trimmed)) {
      return { context: "", turnCount: 0 };
    }

    const k = maxResults ?? this.topK;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = this.stmtRecallTurns.all(sid) as any[];

    if (rows.length === 0) {
      return { context: "", turnCount: 0 };
    }

    // Embed the query
    const queryEmbedding = await this.embed(query);

    // Score past turns using Float32 BLOB math
    const scored = rows.map((row) => {
      const entryVector = blobToVector(row.embedding);
      return {
        entry: {
          id: row.id,
          sessionId: row.session_id,
          role: row.role as "user" | "model",
          content: row.content,
          embedding: entryVector,
          timestamp: row.timestamp,
        },
        similarity: cosineSimilarityF32(queryEmbedding, entryVector),
      };
    });

    // Sort by similarity descending
    scored.sort((a, b) => b.similarity - a.similarity);

    // Take top-K with similarity threshold
    const minSim = CONFIG.SESSION_MEMORY.MIN_SIMILARITY;
    const relevant = scored
      .filter((s) => s.similarity >= minSim)
      .slice(0, k);

    if (relevant.length === 0) {
      return { context: "", turnCount: 0 };
    }

    // Format as context block
    const contextLines = relevant.map((s) => {
      const roleLabel = s.entry.role === "user" ? "User" : "Assistant";
      const sim = (s.similarity * 100).toFixed(0);
      return `[${roleLabel} | ${sim}% relevant | ${s.entry.timestamp}]\n${s.entry.content}`;
    });

    const context =
      "─── Recalled Context from Session Memory (For Background Reference Only) ───\n" +
      contextLines.join("\n\n") +
      "\n─── End Recalled Context (Focus strictly on the Current User Message) ───";

    return { context, turnCount: relevant.length };
  }

  /**
   * Store a new conversation turn (user or model) into SQLite vector memory.
   * The message text is ALWAYS persisted even if embedding generation fails,
   * ensuring conversation history is never lost.
   */
  async memorize(
    role: "user" | "model",
    content: string,
    sessionId?: string
  ): Promise<void> {
    if (!content || content.trim().length === 0) return;

    const sid = sessionId || this.currentSessionId;
    const textToEmbed = content.slice(0, CONFIG.SESSION_MEMORY.MAX_MEMORIZE_CHARS);
    const now = new Date().toISOString();

    // 1. Immediately insert turn text into SQLite so it is instantly retrievable on session switch!
    const fallbackDim = 768;
    const initialBlob = vectorToBlob(new Float32Array(fallbackDim));

    const info = this.stmtInsertTurn.run(
      sid,
      role,
      content.slice(0, CONFIG.SESSION_MEMORY.MAX_STORE_CHARS),
      initialBlob,
      now
    );
    const turnId = info.lastInsertRowid;

    // Update session last active time immediately
    this.stmtUpdateSessionActive.run(now, sid);

    // 2. Generate vector embedding asynchronously and update row
    try {
      const embedding = await this.embed(textToEmbed);
      const blob = vectorToBlob(embedding);
      this.stmtUpdateTurnEmbedding.run(blob, turnId);
    } catch {
      // Embedding failure is non-fatal; text is already safely stored
    }
  }

  /** Get the total number of memorized turns for current session. */
  get size(): number {
    const row = this.stmtCountTurns.get(this.currentSessionId) as { c: number };
    return row?.c ?? 0;
  }

  /** Get session metadata. */
  getSessionInfo(): {
    sessionId: string;
    totalTurns: number;
    persistPath: string;
  } {
    return {
      sessionId: this.currentSessionId,
      totalTurns: this.size,
      persistPath: this.agentDb.dbPath,
    };
  }

  /** Clear conversation memory turns for a session (or current). */
  clear(sessionId?: string): void {
    const sid = sessionId || this.currentSessionId;
    this.stmtDeleteTurns.run(sid);
  }

  /** Clear all conversation memory turns across all sessions and reset to clean default session. */
  clearAll(): void {
    this.agentDb.db.prepare("DELETE FROM session_turns").run();
    this.agentDb.db.prepare("DELETE FROM sessions WHERE id != 'default'").run();
    this.ensureDefaultSession();
    this.currentSessionId = "default";
    this.persistActiveSession();
  }

  /** Close the underlying SQLite database connection cleanly. */
  close(): void {
    this.agentDb.close();
  }

  // ─── Private Helpers ────────────────────────────────────────────

  /** Generate a vector embedding for text using the active provider. */
  private async embed(text: string): Promise<Float32Array> {
    return this.embedder.embed(text);
  }
}
