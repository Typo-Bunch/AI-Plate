/**
 * SQLite Database Manager — Powered by `better-sqlite3`.
 *
 * Provides a high-performance, embedded ACID SQL database for:
 *   1. Persistent Knowledge Base Documents & Semantic Chunks (BLOB Vectors)
 *   2. Session Conversation Memory (BLOB Vectors)
 *   3. Automated Shelf-Life Pruning via fast native SQL transactions
 *
 * Performance features:
 *   - WAL Mode (Write-Ahead Logging) for concurrent reads/writes
 *   - Direct IEEE 754 Float32 binary BLOB storage (12.2 KB per vector, zero string overhead)
 *   - Cascading foreign keys & indexed lookups
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";
import { CONFIG } from "./config.js";

// ─── Binary Float32 Helpers ─────────────────────────────────────────

/** Convert a Float32Array or number[] to a raw SQLite BLOB Buffer. */
export function vectorToBlob(values: number[] | Float32Array): Buffer {
  const f32 = values instanceof Float32Array ? values : new Float32Array(values);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/** Convert a SQLite BLOB Buffer to a high-speed Float32Array. */
export function blobToVector(blob: Buffer): Float32Array {
  return new Float32Array(
    blob.buffer,
    blob.byteOffset,
    blob.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
}

/** Fast dimension-safe cosine similarity between two Float32Arrays. */
export function cosineSimilarityF32(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  for (let i = len; i < a.length; i++) normA += a[i] * a[i];
  for (let i = len; i < b.length; i++) normB += b[i] * b[i];

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Database Class ─────────────────────────────────────────────────

export class AgentDatabase {
  private static instance: AgentDatabase | null = null;
  public readonly db: Database.Database;
  public readonly dbPath: string;

  constructor(customPath?: string) {
    const base = process.env.AIPLATE_USERDATA || process.cwd();
    this.dbPath = resolve(
      base,
      customPath ?? CONFIG.RAG.DATABASE_PATH
    );

    this.db = new Database(this.dbPath);

    // Performance & safety pragmas
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");

    this.initializeSchema();
    this.pruneExpiredData();
  }

  /** Singleton accessor */
  public static getInstance(customPath?: string): AgentDatabase {
    if (!AgentDatabase.instance) {
      AgentDatabase.instance = new AgentDatabase(customPath);
    }
    return AgentDatabase.instance;
  }

  /** Initialize SQL tables and indexes */
  private initializeSchema(): void {
    this.db.exec(`
      -- Ingested documents metadata
      CREATE TABLE IF NOT EXISTS documents (
        name TEXT PRIMARY KEY,
        total_characters INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        ingested_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL
      );

      -- Semantic vector chunks
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        source_document TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        text TEXT NOT NULL,
        start_char INTEGER NOT NULL,
        end_char INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        ingested_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL,
        FOREIGN KEY (source_document) REFERENCES documents(name) ON DELETE CASCADE
      );

      -- Chat sessions metadata
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL
      );

      -- Conversation session turns
      CREATE TABLE IF NOT EXISTS session_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL DEFAULT 'default',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        timestamp TEXT NOT NULL
      );

      -- Lightweight key/value metadata (e.g. active session id)
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Plugin persistent key-value store (for user custom plugins)
      CREATE TABLE IF NOT EXISTS plugin_storage (
        plugin_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (plugin_id, key)
      );

      -- Installed custom dynamic plugins (.aiplugin packages)
      CREATE TABLE IF NOT EXISTS custom_plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Base64 Media Storage in SQLite (Zero Disk Clutter)
      CREATE TABLE IF NOT EXISTS media_storage (
        name TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL,
        base64_data TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Permanent User Facts (Tier 1 Conflict Resolution)
      CREATE TABLE IF NOT EXISTS user_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        importance INTEGER NOT NULL DEFAULT 5,
        source_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Generative Behavioral Reflections (Tier 2 Stanford Reflection)
      CREATE TABLE IF NOT EXISTS user_reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        insight TEXT NOT NULL,
        evidence_count INTEGER NOT NULL DEFAULT 1,
        importance INTEGER NOT NULL DEFAULT 7,
        confidence REAL NOT NULL DEFAULT 0.85,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- General User & Application Settings
      CREATE TABLE IF NOT EXISTS general_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Safe migration: Add session_id column if upgrading existing database
    try {
      this.db.exec("ALTER TABLE session_turns ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default';");
    } catch {
      // Column already exists or table was just created with it
    }

    // Create indexes after ensuring all columns exist
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_document);
      CREATE INDEX IF NOT EXISTS idx_chunks_accessed ON chunks(last_accessed_at);
      CREATE INDEX IF NOT EXISTS idx_session_timestamp ON session_turns(timestamp);
      CREATE INDEX IF NOT EXISTS idx_session_sid ON session_turns(session_id);
      CREATE INDEX IF NOT EXISTS idx_user_facts_key ON user_facts(fact_key);
      CREATE INDEX IF NOT EXISTS idx_user_facts_status ON user_facts(status);
      CREATE INDEX IF NOT EXISTS idx_user_reflections_status ON user_reflections(status);
    `);
  }

  /**
   * Automatically prune documents and session turns older than `SHELF_LIFE_DAYS`.
   */
  public pruneExpiredData(
    shelfLifeDays: number = CONFIG.RAG.SHELF_LIFE_DAYS
  ): { prunedDocs: number; prunedTurns: number } {
    if (shelfLifeDays <= 0) {
      return { prunedDocs: 0, prunedTurns: 0 };
    }

    const cutoffIso = new Date(
      Date.now() - shelfLifeDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const deleteDocsStmt = this.db.prepare(
      "DELETE FROM documents WHERE last_accessed_at < ?"
    );
    const deleteTurnsStmt = this.db.prepare(
      "DELETE FROM session_turns WHERE timestamp < ?"
    );

    const docResult = deleteDocsStmt.run(cutoffIso);
    const turnResult = deleteTurnsStmt.run(cutoffIso);

    return {
      prunedDocs: docResult.changes,
      prunedTurns: turnResult.changes,
    };
  }

  /** Read a metadata value (or undefined if not set). */
  public getMeta(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  /** Write (or overwrite) a metadata value. */
  public setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  /** Save or update an installed custom plugin manifest. */
  public saveCustomPlugin(id: string, name: string, manifestJson: string): void {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO custom_plugins (id, name, manifest_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, manifest_json = excluded.manifest_json"
      )
      .run(id, name, manifestJson, createdAt);
  }

  /** Delete an installed custom plugin. */
  public deleteCustomPlugin(id: string): boolean {
    const result = this.db.prepare("DELETE FROM custom_plugins WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /** List all stored custom plugin packages. */
  public listCustomPlugins(): Array<{ id: string; name: string; manifest_json: string; created_at: string }> {
    return this.db
      .prepare("SELECT id, name, manifest_json, created_at FROM custom_plugins ORDER BY created_at ASC")
      .all() as Array<{ id: string; name: string; manifest_json: string; created_at: string }>;
  }

  /** Retrieve a single custom plugin package. */
  public getCustomPlugin(id: string): { id: string; name: string; manifest_json: string; created_at: string } | undefined {
    return this.db
      .prepare("SELECT id, name, manifest_json, created_at FROM custom_plugins WHERE id = ?")
      .get(id) as { id: string; name: string; manifest_json: string; created_at: string } | undefined;
  }

  // ─── Plugin Storage (Key-Value persistence for custom plugins) ─────

  /** Set key-value data for a plugin. */
  public setPluginData(pluginId: string, key: string, value: unknown): void {
    const updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(value);
    this.db
      .prepare(
        "INSERT INTO plugin_storage (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .run(pluginId, key, serialized, updatedAt);
  }

  /** Get key-value data for a plugin. */
  public getPluginData<T = unknown>(pluginId: string, key: string, defaultValue: T | null = null): T | null {
    const row = this.db
      .prepare("SELECT value FROM plugin_storage WHERE plugin_id = ? AND key = ?")
      .get(pluginId, key) as { value: string } | undefined;
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as unknown as T;
    }
  }

  /** Delete key-value data for a plugin. */
  public deletePluginData(pluginId: string, key: string): boolean {
    const result = this.db
      .prepare("DELETE FROM plugin_storage WHERE plugin_id = ? AND key = ?")
      .run(pluginId, key);
    return result.changes > 0;
  }

  /** List all key-value entries stored by a plugin. */
  public listPluginData(pluginId: string): Record<string, unknown> {
    const rows = this.db
      .prepare("SELECT key, value FROM plugin_storage WHERE plugin_id = ?")
      .all(pluginId) as Array<{ key: string; value: string }>;
    const result: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        result[r.key] = JSON.parse(r.value);
      } catch {
        result[r.key] = r.value;
      }
    }
    return result;
  }

  /** Clear all key-value data stored by a plugin. */
  public clearPluginData(pluginId: string): void {
    this.db.prepare("DELETE FROM plugin_storage WHERE plugin_id = ?").run(pluginId);
  }

  /** Close the SQLite database connection safely with a WAL checkpoint. */
  public close(): void {
    if (this.db.open) {
      try {
        this.db.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        // Non-fatal if checkpoint is busy
      }
      try {
        this.db.close();
      } catch {
        // Ignore if already closed
      }
    }
  }
}
