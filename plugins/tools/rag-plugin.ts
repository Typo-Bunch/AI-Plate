/**
 * RAG Knowledge Base Plugin — Ingest, Query & Manage the Vector Store.
 *
 * Tools:
 *   1. `ingest_document`      — Chunk + embed a large file into the persistent vector DB.
 *   2. `query_knowledge_base` — Explicitly search the knowledge base for relevant chunks.
 *   3. `list_knowledge_base`  — List all ingested documents and store statistics.
 *   4. `remove_document`      — Remove a document from the knowledge base.
 *
 * The Orchestrator also auto-queries on every prompt (see orchestrator.ts).
 */

import { VectorStore } from "../../core/vector-store.js";
import type { ToolHandler, ToolPlugin, ToolSchema } from "../../core/types.js";

// Shared vector store instance — same instance the Orchestrator uses
let sharedStore: VectorStore | null = null;

/** Set the shared vector store instance (called by Orchestrator). */
export function setSharedVectorStore(store: VectorStore): void {
  sharedStore = store;
}

/** Get or create the vector store instance. */
function getStore(): VectorStore {
  if (!sharedStore) {
    sharedStore = new VectorStore();
  }
  return sharedStore;
}

// ─── Tool: ingest_document ──────────────────────────────────────────

const ingestHandler: ToolHandler = async (args) => {
  const filePath = (args.file_path as string)?.trim();
  const rawText = (args.raw_text as string)?.trim();
  const docName = (args.document_name as string)?.trim();
  const chunkSize = typeof args.chunk_size === "number" ? args.chunk_size : undefined;
  const chunkOverlap = typeof args.chunk_overlap === "number" ? args.chunk_overlap : undefined;

  if (!filePath && !rawText) {
    return {
      error: "Provide 'file_path' to ingest a file, or 'raw_text' to ingest text directly.",
    };
  }

  const store = getStore();

  try {
    let result;

    if (filePath) {
      result = await store.ingestFile(filePath, { chunkSize, chunkOverlap });
    } else if (rawText) {
      const name = docName || `text_${Date.now()}`;
      result = await store.ingestText(name, rawText, { chunkSize, chunkOverlap });
    }

    if (!result) {
      return { error: "Ingestion produced no result." };
    }

    return {
      success: true,
      message: `Document "${result.name}" has been chunked, embedded, and stored in the knowledge base.`,
      document: result.name,
      totalCharacters: result.totalCharacters,
      chunksCreated: result.chunkCount,
      totalDocumentsInStore: store.totalDocuments,
      totalChunksInStore: store.totalChunks,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Ingestion failed: ${msg}` };
  }
};

const ingestSchema: ToolSchema = {
  name: "ingest_document",
  description:
    "Ingest a large file or text into the persistent RAG vector knowledge base. " +
    "The document is split into semantic chunks, each chunk is embedded using Gemini embeddings, " +
    "and stored permanently. This is a one-time operation per document — after ingestion, " +
    "the knowledge base is automatically queried on every prompt.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description:
          "Path to the file to ingest (e.g., 'docs/manual.md', 'README.md', 'large_log.txt').",
      },
      raw_text: {
        type: "string",
        description: "Direct raw text to ingest instead of reading from a file.",
      },
      document_name: {
        type: "string",
        description:
          "Optional name for the document when using raw_text (default: auto-generated).",
      },
      chunk_size: {
        type: "number",
        description: "Characters per chunk (default: 1200).",
      },
      chunk_overlap: {
        type: "number",
        description: "Overlap between chunks in characters (default: 200).",
      },
    },
    required: [],
  },
};

// ─── Tool: query_knowledge_base ─────────────────────────────────────

const queryHandler: ToolHandler = async (args) => {
  const query = (args.query as string)?.trim();
  const batchIndex = typeof args.batch_index === "number" ? Math.max(0, args.batch_index) : 0;
  const batchSize = typeof args.batch_size === "number" ? Math.min(5, Math.max(1, args.batch_size)) : 3;
  const sourceFilter = (args.source_document as string)?.trim() || undefined;
  const minSimilarity = typeof args.min_similarity === "number" ? args.min_similarity : undefined;

  if (!query) {
    return { error: "The 'query' argument is required." };
  }

  const store = getStore();

  if (store.totalChunks === 0) {
    return {
      query,
      count: 0,
      message:
        "The knowledge base is empty. Use 'ingest_document' to add files first.",
    };
  }

  try {
    const paged = await store.queryPaged(query, batchIndex, batchSize, minSimilarity, sourceFilter);

    if (paged.results.length === 0) {
      return {
        query,
        count: 0,
        batchIndex: paged.batchIndex,
        totalMatches: paged.totalMatches,
        hasMoreBatches: false,
        message:
          batchIndex > 0
            ? "No more batches available for this query."
            : "No relevant chunks found matching the query in the knowledge base.",
      };
    }

    const totalChars = paged.results.reduce((s, r) => s + r.chunk.text.length, 0);
    const totalBatches = Math.ceil(paged.totalMatches / paged.batchSize);

    return {
      query,
      batchInfo: `Batch ${paged.batchIndex + 1} of ${totalBatches} (${paged.results.length} chunks returned, ${paged.totalMatches} total matches)`,
      batchIndex: paged.batchIndex,
      batchSize: paged.batchSize,
      totalMatches: paged.totalMatches,
      batchConfidence: `${paged.averageConfidence} (${paged.confidenceTier} confidence)`,
      confidenceTier: paged.confidenceTier,
      hasMoreBatches: paged.hasMore,
      nextBatchIndex: paged.nextBatchIndex,
      progressiveGuidance: paged.hasMore
        ? `If these chunks do not contain the complete answer or confidence is low, call 'query_knowledge_base' again with 'batch_index: ${paged.nextBatchIndex}' to retrieve the next batch.`
        : "All relevant chunks have been retrieved for this query.",
      totalCharactersReturned: totalChars,
      results: paged.results.map((r, idx) => ({
        rank: paged.batchIndex * paged.batchSize + idx + 1,
        relevance: r.similarityPercent,
        source: r.chunk.sourceDocument,
        chunkPosition: `${r.chunk.chunkIndex + 1}/${r.chunk.totalChunks}`,
        content: r.chunk.text,
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Knowledge base query failed: ${msg}` };
  }
};

const querySchema: ToolSchema = {
  name: "query_knowledge_base",
  description:
    "Progressively search the persistent RAG knowledge base for information in compact batches. " +
    "Returns top chunks (default 3) with confidence scores. " +
    "PROGRESSIVE STRATEGY: Inspect the first batch. If the confidence is low or specific facts are missing, " +
    "call this tool again with batch_index: 1 (or nextBatchIndex) to get the next batch without overloading token limits.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The specific question or topic to search for in the knowledge base.",
      },
      batch_index: {
        type: "number",
        description: "Batch index to retrieve (0 = top 3 chunks, 1 = next 3 chunks, 2 = next 3 chunks). Default: 0.",
      },
      batch_size: {
        type: "number",
        description: "Number of chunks per batch (default: 3, max: 5). Keep small to prevent quota exhaustion.",
      },
      source_document: {
        type: "string",
        description: "Optional: filter results to a specific ingested document name.",
      },
      min_similarity: {
        type: "number",
        description: "Optional: minimum similarity threshold between 0.0 and 1.0 (default: 0.3).",
      },
    },
    required: ["query"],
  },
};

// ─── Tool: list_knowledge_base ──────────────────────────────────────

const listHandler: ToolHandler = async () => {
  const store = getStore();
  const stats = store.getStats();

  return {
    totalDocuments: stats.totalDocuments,
    totalChunks: stats.totalChunks,
    shelfLifeDays: stats.shelfLifeDays > 0 ? `${stats.shelfLifeDays} days` : "Disabled (never expires)",
    lastModified: stats.lastModified,
    persistPath: stats.persistPath,
    documents: stats.documents.map((d) => ({
      name: d.name,
      totalCharacters: d.totalCharacters,
      chunks: d.chunkCount,
      ingestedAt: d.ingestedAt,
      lastAccessedAt: d.lastAccessedAt || d.ingestedAt,
    })),
  };
};

const listSchema: ToolSchema = {
  name: "list_knowledge_base",
  description:
    "List all documents currently stored in the RAG knowledge base, " +
    "with statistics on chunk counts and ingestion timestamps.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

// ─── Tool: remove_document ──────────────────────────────────────────

const removeHandler: ToolHandler = async (args) => {
  const docName = (args.document_name as string)?.trim();

  if (!docName) {
    return { error: "The 'document_name' argument is required." };
  }

  const store = getStore();
  const removed = store.removeDocument(docName);

  if (removed) {
    return {
      success: true,
      message: `Document "${docName}" and all its chunks have been removed from the knowledge base.`,
      remainingDocuments: store.totalDocuments,
      remainingChunks: store.totalChunks,
    };
  } else {
    return {
      success: false,
      message: `Document "${docName}" was not found in the knowledge base.`,
    };
  }
};

const removeSchema: ToolSchema = {
  name: "remove_document",
  description:
    "Remove a previously ingested document and all its chunks from the knowledge base.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      document_name: {
        type: "string",
        description: "The name of the document to remove (as shown in list_knowledge_base).",
      },
    },
    required: ["document_name"],
  },
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const ragPlugin: ToolPlugin = {
  id: "rag",
  name: "RAG & Vector Knowledge Base",
  description: "Ingest documents, generate embeddings, and semantically search SQLite vector store memory.",
  icon: "📚",

  register(registerTool) {
    registerTool(ingestSchema, ingestHandler);
    registerTool(querySchema, queryHandler);
    registerTool(listSchema, listHandler);
    registerTool(removeSchema, removeHandler);
  },
};
