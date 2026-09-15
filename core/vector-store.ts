/**
 * Vector Store — High-Performance SQLite-Backed RAG Vector Database.
 *
 * Backed by `better-sqlite3`:
 *   - Stored in a single local `agent_data.db` SQLite file with WAL mode.
 *   - Vectors are stored as direct binary IEEE 754 Float32 BLOBs (zero string conversion).
 *   - Atomic batch transactions for ingestion.
 *   - Cascading foreign keys & indexed lookups.
 *   - Automated shelf-life pruning via native SQL transactions.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { CONFIG, logVerbose } from "./config.js";
import { UniversalEmbedder } from "./embedder.js";
import { parseDocumentContent } from "./document-parser.js";
import {
  AgentDatabase,
  vectorToBlob,
  blobToVector,
  cosineSimilarityF32,
} from "./database.js";

// ─── Types ──────────────────────────────────────────────────────────

/** A single chunk stored in the vector database. */
export interface VectorChunk {
  id: string;
  sourceDocument: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  startChar: number;
  endChar: number;
  embedding: Float32Array | Buffer;
  ingestedAt: string;
  lastAccessedAt: string;
}

/** Metadata about an ingested document. */
export interface IngestedDocument {
  name: string;
  totalCharacters: number;
  chunkCount: number;
  ingestedAt: string;
  lastAccessedAt: string;
}

/** A query result with similarity score. */
export interface QueryResult {
  chunk: VectorChunk;
  similarity: number;
  similarityPercent: string;
}

/** Paged/batched progressive query response with confidence metrics. */
export interface PagedQueryResult {
  results: QueryResult[];
  batchIndex: number;
  batchSize: number;
  totalMatches: number;
  hasMore: boolean;
  nextBatchIndex: number | null;
  averageConfidence: string;
  confidenceTier: "High" | "Medium" | "Low";
}

// ─── Text Chunker ───────────────────────────────────────────────────

interface RawChunk {
  index: number;
  text: string;
  startChar: number;
  endChar: number;
}

/**
 * Splits text into overlapping chunks, respecting paragraph/sentence boundaries.
 */
export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number
): RawChunk[] {
  if (!text || text.trim().length === 0) return [];
  if (text.length <= chunkSize) {
    return [{ index: 0, text: text.trim(), startChar: 0, endChar: text.length }];
  }

  const chunks: RawChunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex >= text.length) {
      endIndex = text.length;
    } else {
      const lookbackStart = startIndex + Math.floor(chunkSize * 0.7);
      const lookbackZone = text.slice(lookbackStart, endIndex);

      const lastDoubleNewline = lookbackZone.lastIndexOf("\n\n");
      const lastNewline = lookbackZone.lastIndexOf("\n");
      const lastPeriod = lookbackZone.lastIndexOf(". ");
      const lastSpace = lookbackZone.lastIndexOf(" ");

      if (lastDoubleNewline !== -1) {
        endIndex = lookbackStart + lastDoubleNewline + 2;
      } else if (lastNewline !== -1) {
        endIndex = lookbackStart + lastNewline + 1;
      } else if (lastPeriod !== -1) {
        endIndex = lookbackStart + lastPeriod + 2;
      } else if (lastSpace !== -1) {
        endIndex = lookbackStart + lastSpace + 1;
      }
    }

    const chunkContent = text.slice(startIndex, endIndex).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        index: chunkIndex++,
        text: chunkContent,
        startChar: startIndex,
        endChar: endIndex,
      });
    }

    if (endIndex >= text.length) break;
    startIndex = endIndex - overlap;
  }

  return chunks;
}

// ─── Vector Store (SQLite Powered) ─────────────────────────────────

export class VectorStore {
  private readonly agentDb: AgentDatabase;
  private readonly embedder: UniversalEmbedder;

  constructor(customDbPath?: string) {
    this.agentDb = AgentDatabase.getInstance(customDbPath);
    this.embedder = UniversalEmbedder.getInstance();
  }

  // ─── Ingestion ────────────────────────────────────────────────

  /**
   * Ingest a file from disk into the SQLite vector database.
   */
  async ingestFile(
    filePath: string,
    options?: { chunkSize?: number; chunkOverlap?: number }
  ): Promise<IngestedDocument> {
    const resolvedPath = resolve(process.cwd(), filePath);

    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: "${filePath}" (resolved: "${resolvedPath}")`);
    }

    const rawBuffer = readFileSync(resolvedPath);
    const docName = basename(resolvedPath);
    const parsed = await parseDocumentContent(docName, rawBuffer);

    return this.ingestText(docName, parsed.text, options);
  }

  /**
   * Ingest raw text content into SQLite using an atomic transaction.
   */
  async ingestText(
    documentName: string,
    content: string,
    options?: { chunkSize?: number; chunkOverlap?: number }
  ): Promise<IngestedDocument> {
    if (!content || content.trim().length === 0) {
      throw new Error("Cannot ingest empty content.");
    }

    // Adaptive chunk sizing for large documents to reduce network overhead
    let defaultChunkSize = CONFIG.RAG.DEFAULT_CHUNK_SIZE;
    if (content.length > 500_000) {
      defaultChunkSize = 2800;
    } else if (content.length > 150_000) {
      defaultChunkSize = 1800;
    }

    const chunkSize = options?.chunkSize ?? defaultChunkSize;
    const chunkOverlap = options?.chunkOverlap ?? CONFIG.RAG.DEFAULT_CHUNK_OVERLAP;

    // Chunk the content
    const rawChunks = chunkText(content, chunkSize, chunkOverlap);
    logVerbose(
      "vector",
      `📥 Ingesting "${documentName}" (${content.length.toLocaleString()} chars) -> ${rawChunks.length} chunk(s) | Embedding with: ${this.embedder.embeddingModel}`
    );

    // Generate Float32 embeddings
    const embeddings = await this.embedder.embedBatch(
      rawChunks.map((c) => c.text)
    );

    const now = new Date().toISOString();
    const docMeta: IngestedDocument = {
      name: documentName,
      totalCharacters: content.length,
      chunkCount: rawChunks.length,
      ingestedAt: now,
      lastAccessedAt: now,
    };

    // Execute atomic SQL transaction to upsert document and its chunks
    const insertDocStmt = this.agentDb.db.prepare(`
      INSERT INTO documents (name, total_characters, chunk_count, ingested_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        total_characters = excluded.total_characters,
        chunk_count = excluded.chunk_count,
        ingested_at = excluded.ingested_at,
        last_accessed_at = excluded.last_accessed_at
    `);

    const deleteOldChunksStmt = this.agentDb.db.prepare(
      "DELETE FROM chunks WHERE source_document = ?"
    );

    const insertChunkStmt = this.agentDb.db.prepare(`
      INSERT INTO chunks (
        id, source_document, chunk_index, total_chunks,
        text, start_char, end_char, embedding, ingested_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const runTransaction = this.agentDb.db.transaction(() => {
      insertDocStmt.run(
        docMeta.name,
        docMeta.totalCharacters,
        docMeta.chunkCount,
        docMeta.ingestedAt,
        docMeta.lastAccessedAt
      );

      deleteOldChunksStmt.run(documentName);

      for (let idx = 0; idx < rawChunks.length; idx++) {
        const chunk = rawChunks[idx];
        const chunkId = `${documentName}_chunk_${chunk.index}_${Date.now()}`;
        const blob = vectorToBlob(embeddings[idx]);

        insertChunkStmt.run(
          chunkId,
          documentName,
          chunk.index,
          rawChunks.length,
          chunk.text,
          chunk.startChar,
          chunk.endChar,
          blob,
          now,
          now
        );
      }
    });

    runTransaction();

    logVerbose(
      "vector",
      `✨ Successfully indexed ${rawChunks.length} chunk(s) for "${documentName}" into SQLite vector database.`
    );

    return docMeta;
  }

  // ─── Querying ─────────────────────────────────────────────────

  /**
   * Progressive / Paginated query supporting multi-batch retrieval
   * when confidence is low or initial batch does not have the answer.
   */
  async queryPaged(
    query: string,
    batchIndex: number = 0,
    batchSize: number = 3,
    minSimilarity: number = CONFIG.RAG.MIN_SIMILARITY,
    sourceFilter?: string
  ): Promise<PagedQueryResult> {
    const selectQuery = sourceFilter
      ? "SELECT id, source_document, chunk_index, total_chunks, text, start_char, end_char, embedding, ingested_at, last_accessed_at FROM chunks WHERE source_document = ?"
      : "SELECT id, source_document, chunk_index, total_chunks, text, start_char, end_char, embedding, ingested_at, last_accessed_at FROM chunks";

    const stmt = this.agentDb.db.prepare(selectQuery);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (sourceFilter ? stmt.all(sourceFilter) : stmt.all()) as any[];

    if (rows.length === 0) {
      return {
        results: [],
        batchIndex,
        batchSize,
        totalMatches: 0,
        hasMore: false,
        nextBatchIndex: null,
        averageConfidence: "0.0%",
        confidenceTier: "Low",
      };
    }

    // Embed the query
    const queryEmbedding = await this.embedder.embed(query);

    // Score all chunks using Float32 BLOB math
    const scored: QueryResult[] = rows.map((row) => {
      const chunkVector = blobToVector(row.embedding);
      const similarity = cosineSimilarityF32(queryEmbedding, chunkVector);
      return {
        chunk: {
          id: row.id,
          sourceDocument: row.source_document,
          chunkIndex: row.chunk_index,
          totalChunks: row.total_chunks,
          text: row.text,
          startChar: row.start_char,
          endChar: row.end_char,
          embedding: chunkVector,
          ingestedAt: row.ingested_at,
          lastAccessedAt: row.last_accessed_at,
        },
        similarity,
        similarityPercent: `${(similarity * 100).toFixed(1)}%`,
      };
    });

    const matchingResults = scored
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity);

    const totalMatches = matchingResults.length;
    const offset = Math.max(0, batchIndex * batchSize);
    const batchResults = matchingResults.slice(offset, offset + batchSize);

    const hasMore = offset + batchSize < totalMatches;
    const nextBatchIndex = hasMore ? batchIndex + 1 : null;

    const avgSim =
      batchResults.length > 0
        ? (batchResults.reduce((s, r) => s + r.similarity, 0) / batchResults.length) * 100
        : 0;

    const confidenceTier: "High" | "Medium" | "Low" =
      avgSim >= 75 ? "High" : avgSim >= 50 ? "Medium" : "Low";

    // Refresh last_accessed_at timestamp in SQLite for matched documents
    if (batchResults.length > 0) {
      const now = new Date().toISOString();
      const accessedDocs = [...new Set(batchResults.map((r) => r.chunk.sourceDocument))];
      const updateDocStmt = this.agentDb.db.prepare(
        "UPDATE documents SET last_accessed_at = ? WHERE name = ?"
      );
      const updateChunkStmt = this.agentDb.db.prepare(
        "UPDATE chunks SET last_accessed_at = ? WHERE source_document = ?"
      );

      const updateTx = this.agentDb.db.transaction(() => {
        for (const docName of accessedDocs) {
          updateDocStmt.run(now, docName);
          updateChunkStmt.run(now, docName);
        }
      });
      updateTx();
    }

    return {
      results: batchResults,
      batchIndex,
      batchSize,
      totalMatches,
      hasMore,
      nextBatchIndex,
      averageConfidence: `${avgSim.toFixed(1)}%`,
      confidenceTier,
    };
  }

  /**
   * Query the SQLite vector store for the top-K most relevant chunks matching a prompt.
   */
  async query(
    query: string,
    topK?: number,
    minSimilarity: number = CONFIG.RAG.MIN_SIMILARITY,
    sourceFilter?: string
  ): Promise<QueryResult[]> {
    const k = topK ?? CONFIG.RAG.DEFAULT_TOP_K;
    const paged = await this.queryPaged(query, 0, k, minSimilarity, sourceFilter);
    return paged.results;
  }

  /**
   * Format context for prompt injection.
   */
  formatContextForPrompt(results: QueryResult[]): string {
    if (results.length === 0) return "";

    const lines = results.map((r) => {
      return (
        `[Source: ${r.chunk.sourceDocument} | Chunk ${r.chunk.chunkIndex + 1}/${r.chunk.totalChunks} | Relevance: ${r.similarityPercent}]\n` +
        r.chunk.text
      );
    });

    return (
      "═══ Relevant Knowledge Base Context ═══\n\n" +
      lines.join("\n\n---\n\n") +
      "\n\n═══ End Knowledge Base Context ═══"
    );
  }

  // ─── Management ───────────────────────────────────────────────

  /** Remove a document and its chunks from SQLite (cascading foreign keys). */
  removeDocument(documentName: string): boolean {
    const stmt = this.agentDb.db.prepare("DELETE FROM documents WHERE name = ?");
    const result = stmt.run(documentName);
    return result.changes > 0;
  }

  /** List all ingested documents. */
  listDocuments(): IngestedDocument[] {
    const stmt = this.agentDb.db.prepare(`
      SELECT name, total_characters AS totalCharacters, chunk_count AS chunkCount,
             ingested_at AS ingestedAt, last_accessed_at AS lastAccessedAt
      FROM documents
      ORDER BY ingested_at DESC
    `);
    return stmt.all() as IngestedDocument[];
  }

  /** Get total chunks count. */
  get totalChunks(): number {
    const row = this.agentDb.db.prepare("SELECT COUNT(*) AS c FROM chunks").get() as { c: number };
    return row?.c ?? 0;
  }

  /** Get total documents count. */
  get totalDocuments(): number {
    const row = this.agentDb.db.prepare("SELECT COUNT(*) AS c FROM documents").get() as { c: number };
    return row?.c ?? 0;
  }

  /** Check if a document is present. */
  hasDocument(documentName: string): boolean {
    const row = this.agentDb.db.prepare("SELECT 1 FROM documents WHERE name = ?").get(documentName);
    return Boolean(row);
  }

  /** Clear all documents and chunks. */
  clear(): void {
    this.agentDb.db.exec("DELETE FROM documents; DELETE FROM chunks;");
  }

  /** Get database statistics. */
  getStats(): {
    totalDocuments: number;
    totalChunks: number;
    shelfLifeDays: number;
    persistPath: string;
    lastModified: string;
    documents: IngestedDocument[];
  } {
    const docs = this.listDocuments();
    return {
      totalDocuments: this.totalDocuments,
      totalChunks: this.totalChunks,
      shelfLifeDays: CONFIG.RAG.SHELF_LIFE_DAYS,
      persistPath: this.agentDb.dbPath,
      lastModified: docs[0]?.lastAccessedAt || new Date().toISOString(),
      documents: docs,
    };
  }
}
