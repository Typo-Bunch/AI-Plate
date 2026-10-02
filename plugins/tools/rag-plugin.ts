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
import { OkfStore, type OkfNode, type OkfAuthority } from "../../core/okf-store.js";
import { HybridKnowledgeRouter, type KnowledgeMode } from "../../core/hybrid-knowledge-router.js";
import type { ToolHandler, ToolPlugin, ToolSchema } from "../../core/types.js";

// Shared store instances — same instances the Orchestrator uses
let sharedStore: VectorStore | null = null;
let sharedOkfStore: OkfStore | null = null;
let sharedHybridRouter: HybridKnowledgeRouter | null = null;

/** Set the shared vector store instance (called by Orchestrator). */
export function setSharedVectorStore(store: VectorStore): void {
  sharedStore = store;
}

/** Set the shared OKF store instance (called by Orchestrator). */
export function setSharedOkfStore(store: OkfStore): void {
  sharedOkfStore = store;
}

/** Set the shared hybrid knowledge router instance (called by Orchestrator). */
export function setSharedHybridRouter(router: HybridKnowledgeRouter): void {
  sharedHybridRouter = router;
}

/** Get or create the vector store instance. */
function getStore(): VectorStore {
  if (!sharedStore) {
    sharedStore = new VectorStore();
  }
  return sharedStore;
}

/** Get or create the OKF store instance. */
function getOkfStore(): OkfStore {
  if (!sharedOkfStore) {
    sharedOkfStore = new OkfStore();
  }
  return sharedOkfStore;
}

/** Get or create the Hybrid router instance. */
function getHybridRouter(): HybridKnowledgeRouter {
  if (!sharedHybridRouter) {
    sharedHybridRouter = new HybridKnowledgeRouter(getOkfStore(), getStore());
  }
  return sharedHybridRouter;
}

// ─── Tool: ingest_document ──────────────────────────────────────────

const ingestHandler: ToolHandler = async (args) => {
  const filePath = ((args.file_path || args.filePath || args.path) as string)?.trim();
  const rawText = ((args.raw_text || args.rawText || args.text || args.content) as string)?.trim();
  const docName = ((args.document_name || args.documentName || args.name) as string)?.trim();
  const chunkSize = typeof args.chunk_size === "number" ? args.chunk_size : typeof args.chunkSize === "number" ? args.chunkSize : undefined;
  const chunkOverlap = typeof args.chunk_overlap === "number" ? args.chunk_overlap : typeof args.chunkOverlap === "number" ? args.chunkOverlap : undefined;

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

// ─── Tool: ingest_okf_document ──────────────────────────────────────

const ingestOkfHandler: ToolHandler = async (args) => {
  const filePath = ((args.file_path || args.filePath || args.path) as string)?.trim();
  const rawMarkdown = ((args.raw_markdown || args.rawMarkdown || args.markdown || args.content) as string)?.trim();
  const generateEmbedding = Boolean(args.generate_embedding || args.generateEmbedding);

  if (!filePath && !rawMarkdown) {
    return { error: "Provide either 'file_path' or 'raw_markdown' containing OKF YAML frontmatter." };
  }

  const okf = getOkfStore();
  try {
    let node: OkfNode;
    if (filePath) {
      node = await okf.ingestFile(filePath, { generateEmbedding });
    } else {
      node = await okf.ingestText(rawMarkdown!, undefined, { generateEmbedding });
    }

    return {
      success: true,
      message: `OKF node "${node.id}" successfully ingested into the knowledge graph.`,
      node: {
        id: node.id,
        title: node.title,
        domain: node.domain,
        authority: node.authority,
        tags: node.tags,
        linksCount: node.links.length,
        version: node.version,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `OKF document ingestion failed: ${msg}` };
  }
};

const ingestOkfSchema: ToolSchema = {
  name: "ingest_okf_document",
  description:
    "Ingest an Open Knowledge Format (OKF) markdown file or markdown text with YAML frontmatter. " +
    "Extracts canonical entities, domain, tags, and explicit graph links for deterministic retrieval.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the .md file formatted with OKF YAML frontmatter.",
      },
      raw_markdown: {
        type: "string",
        description: "Direct markdown string with YAML frontmatter and [[wiki-links]].",
      },
      generate_embedding: {
        type: "boolean",
        description: "Whether to generate a semantic embedding for hybrid search (default: false).",
      },
    },
  },
};

// ─── Tool: query_okf_node ───────────────────────────────────────────

const queryOkfHandler: ToolHandler = async (args) => {
  const nodeId = (args.node_id as string)?.trim();
  if (!nodeId) return { error: "Missing required parameter 'node_id'." };

  const okf = getOkfStore();
  const node = okf.getNode(nodeId);
  if (!node) {
    return {
      success: false,
      message: `OKF node '${nodeId}' not found. Use 'list_okf_nodes' to inspect available nodes.`,
    };
  }

  return {
    success: true,
    node,
  };
};

const queryOkfSchema: ToolSchema = {
  name: "query_okf_node",
  description:
    "Directly retrieve an authoritative OKF (Open Knowledge Format) node by ID, including its metadata, tags, and connected links.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      node_id: {
        type: "string",
        description: "The unique ID of the OKF knowledge node (e.g. 'payment-gateway-spec').",
      },
    },
    required: ["node_id"],
  },
};

// ─── Tool: traverse_okf_graph ───────────────────────────────────────

const traverseOkfHandler: ToolHandler = async (args) => {
  const rootId = (args.root_node_id as string)?.trim();
  const maxDepth = typeof args.max_depth === "number" ? Math.min(Math.max(args.max_depth, 1), 3) : 1;

  if (!rootId) return { error: "Missing required parameter 'root_node_id'." };

  const okf = getOkfStore();
  const traversal = okf.traverseGraph(rootId, maxDepth);
  if (!traversal) {
    return {
      success: false,
      message: `Root node '${rootId}' not found in the OKF knowledge graph.`,
    };
  }

  return {
    success: true,
    root: {
      id: traversal.root.id,
      title: traversal.root.title,
      domain: traversal.root.domain,
      authority: traversal.root.authority,
    },
    connectedNodes: traversal.connectedNodes.map((n) => ({
      id: n.id,
      title: n.title,
      domain: n.domain,
      authority: n.authority,
      tags: n.tags,
    })),
    edges: traversal.edges,
    totalConnections: traversal.connectedNodes.length,
  };
};

const traverseOkfSchema: ToolSchema = {
  name: "traverse_okf_graph",
  description:
    "Traverse the OKF knowledge graph outwards from a specified root node to discover linked dependencies, policies, and related concepts.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      root_node_id: {
        type: "string",
        description: "The node ID to start graph traversal from.",
      },
      max_depth: {
        type: "number",
        description: "Max traversal hops (default: 1, max: 3).",
      },
    },
    required: ["root_node_id"],
  },
};

// ─── Tool: list_okf_nodes ───────────────────────────────────────────

const listOkfHandler: ToolHandler = async (args) => {
  const domain = (args.domain as string)?.trim();
  const authority = (args.authority as string)?.trim();
  const tag = (args.tag as string)?.trim();

  const okf = getOkfStore();
  const nodes = okf.listNodes({ domain, authority, tag });

  return {
    totalNodes: nodes.length,
    nodes,
  };
};

const listOkfSchema: ToolSchema = {
  name: "list_okf_nodes",
  description: "List all curated OKF knowledge nodes with domain, authority tier, tags, and link counts.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      domain: { type: "string", description: "Filter by domain (e.g. 'finance', 'backend', 'core')." },
      authority: { type: "string", description: "Filter by authority ('canonical', 'experimental', etc.)." },
      tag: { type: "string", description: "Filter by specific keyword tag." },
    },
  },
};

// ─── Tool: create_okf_node ──────────────────────────────────────────

const createOkfHandler: ToolHandler = async (args) => {
  const id = (args.id as string)?.trim();
  const title = (args.title as string)?.trim();
  const content = (args.content as string)?.trim();
  const domain = (args.domain as string)?.trim() || "general";
  const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
  const authority = (args.authority as OkfAuthority) || "canonical";
  const version = (args.version as string)?.trim() || "1.0.0";
  const links = Array.isArray(args.links) ? args.links : [];

  if (!id || !title || !content) {
    return { error: "Fields 'id', 'title', and 'content' are required to create an OKF node." };
  }

  const okf = getOkfStore();
  const node = await okf.saveNode({
    id,
    title,
    content,
    domain,
    tags,
    authority,
    version,
    links,
  });

  return {
    success: true,
    message: `OKF node '${node.id}' successfully created.`,
    node: {
      id: node.id,
      title: node.title,
      domain: node.domain,
      authority: node.authority,
      tags: node.tags,
      links: node.links,
    },
  };
};

const createOkfSchema: ToolSchema = {
  name: "create_okf_node",
  description:
    "Create or update a canonical, structured OKF knowledge node with explicit tags, authority level, and graph links.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Unique machine slug identifier (e.g. 'auth-jwt-spec')." },
      title: { type: "string", description: "Human-readable title for the node." },
      content: { type: "string", description: "Authoritative markdown body content." },
      domain: { type: "string", description: "Domain or subsystem category (default: 'general')." },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "List of searchable keyword tags.",
      },
      authority: {
        type: "string",
        enum: ["canonical", "experimental", "deprecated", "informational"],
        description: "Authority tier (canonical takes priority). Default: 'canonical'.",
      },
      version: { type: "string", description: "Semantic version string (default: '1.0.0')." },
      links: {
        type: "array",
        items: {
          type: "object",
          properties: {
            target: { type: "string" },
            relation: { type: "string" },
          },
          required: ["target"],
        },
        description: "Explicit graph links to other nodes.",
      },
    },
    required: ["id", "title", "content"],
  },
};

// ─── Tool: search_hybrid_knowledge ──────────────────────────────────

const searchHybridHandler: ToolHandler = async (args) => {
  const query = (args.query as string)?.trim();
  const mode = (args.mode as KnowledgeMode) || "hybrid";
  const maxOkf = typeof args.max_okf_nodes === "number" ? args.max_okf_nodes : 2;
  const maxRag = typeof args.max_rag_chunks === "number" ? args.max_rag_chunks : 3;

  if (!query) return { error: "Missing required parameter 'query'." };

  const router = getHybridRouter();
  const result = await router.route(query, {
    mode,
    maxOkfNodes: maxOkf,
    maxRagChunks: maxRag,
  });

  return {
    query,
    mode: result.mode,
    hasContext: result.hasContext,
    sources: result.sources,
    stats: result.stats,
    okfResults: result.okfNodes.map((n) => ({
      id: n.id,
      title: n.title,
      domain: n.domain,
      authority: n.authority,
      tags: n.tags,
      summarySnippet: n.content.slice(0, 200) + (n.content.length > 200 ? "..." : ""),
    })),
    ragResults: result.ragChunks.map((c) => ({
      source: c.chunk.sourceDocument,
      relevance: c.similarityPercent,
      snippet: c.chunk.text.slice(0, 200) + (c.chunk.text.length > 200 ? "..." : ""),
    })),
    formattedContext: result.formattedContext,
  };
};

const searchHybridSchema: ToolSchema = {
  name: "search_hybrid_knowledge",
  description:
    "Unified hybrid search querying both the deterministic OKF knowledge graph (Tier 1) " +
    "and unstructured Vector RAG database (Tier 2). Synthesizes authoritative rules and background context.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The question or search topic." },
      mode: {
        type: "string",
        enum: ["hybrid", "okf_only", "rag_only"],
        description: "Search mode: 'hybrid' (default), 'okf_only' (curated wiki only), or 'rag_only' (vector chunks only).",
      },
      max_okf_nodes: { type: "number", description: "Max OKF nodes to retrieve (default: 2)." },
      max_rag_chunks: { type: "number", description: "Max RAG chunks to retrieve (default: 3)." },
    },
    required: ["query"],
  },
};

// ─── Tool: distill_to_okf ──────────────────────────────────────────

const distillOkfHandler: ToolHandler = async (args) => {
  const filePath = ((args.file_path || args.filePath || args.path) as string)?.trim();
  const rawText = ((args.raw_text || args.rawText || args.text || args.content) as string)?.trim();
  const id = (args.id as string)?.trim();
  const title = (args.title as string)?.trim();
  const domain = (args.domain as string)?.trim();
  const authority = (args.authority as OkfAuthority) || "canonical";
  const tags = Array.isArray(args.tags) ? (args.tags as string[]) : undefined;
  const generateEmbedding = Boolean(args.generate_embedding || args.generateEmbedding);
  const saveToStore = args.save_to_store !== false && args.saveToStore !== false;

  if (!filePath && !rawText) {
    return { error: "Provide either 'file_path' (e.g. PDF, Markdown, TXT) or 'raw_text' to distill into an OKF node." };
  }

  const okf = getOkfStore();
  try {
    const result = await okf.distillDocumentToOkf({
      filePath,
      rawText,
      id,
      title,
      domain,
      authority,
      tags,
      generateEmbedding,
      saveToStore,
    });

    return {
      success: true,
      message: `Successfully distilled ${filePath ? `file '${filePath}'` : 'provided text'} into OKF node '${result.node.id}' (${result.node.authority.toUpperCase()}).`,
      node: {
        id: result.node.id,
        title: result.node.title,
        domain: result.node.domain,
        authority: result.node.authority,
        tags: result.node.tags,
        linksCount: result.node.links.length,
        links: result.node.links,
        invariantsExtracted: result.extractedStats.invariantsCount,
      },
      previewMarkdown: result.node.content.slice(0, 500) + (result.node.content.length > 500 ? "..." : ""),
      saved: result.saved,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `OKF distillation failed: ${msg}` };
  }
};

const distillOkfSchema: ToolSchema = {
  name: "distill_to_okf",
  description:
    "Automatically distill any document (PDF, TXT, CSV, source code, whitepaper) or loose text into a structured, authoritative OKF Knowledge Node. " +
    "Extracts core invariant rules, suggested domain, searchable tags, and graph dependencies/wiki-links.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the unstructured file to distill (e.g. 'docs/proposal.pdf', 'README.md', 'spec.txt').",
      },
      raw_text: {
        type: "string",
        description: "Direct raw text or excerpt to distill into an OKF node.",
      },
      id: {
        type: "string",
        description: "Optional custom slug identifier for the node (e.g. 'payment-retry-runbook'). Auto-generated if omitted.",
      },
      title: {
        type: "string",
        description: "Optional human-readable title for the node. Auto-extracted if omitted.",
      },
      domain: {
        type: "string",
        description: "Domain/category (e.g. 'payments', 'security', 'ecommerce', 'backend', 'operations'). Auto-detected if omitted.",
      },
      authority: {
        type: "string",
        enum: ["canonical", "experimental", "deprecated", "informational"],
        description: "Authority tier. Defaults to 'canonical'.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Searchable keyword tags.",
      },
      save_to_store: {
        type: "boolean",
        description: "Whether to immediately save the distilled node into the persistent SQLite OKF store (default: true).",
      },
      generate_embedding: {
        type: "boolean",
        description: "Whether to compute vector embeddings for hybrid retrieval (default: false).",
      },
    },
  },
};

// ─── Tool: verify_okf_invariants ────────────────────────────────────

const verifyInvariantsHandler: ToolHandler = async (args) => {
  const nodeId = (args.node_id as string)?.trim();
  const okf = getOkfStore();

  try {
    const report = okf.verifyCodeLinks(nodeId || undefined);
    return {
      success: true,
      report: {
        totalLinksChecked: report.totalLinksChecked,
        codeLinksFound: report.codeLinksFound,
        validCodeLinks: report.validCodeLinks,
        brokenCodeLinks: report.brokenCodeLinks,
        allCodeLinksValid: report.brokenCodeLinks === 0,
        details: report.details,
      },
      summary:
        report.brokenCodeLinks === 0
          ? `All ${report.validCodeLinks} code-grounded links verified successfully.`
          : `Found ${report.brokenCodeLinks} broken/missing code references out of ${report.codeLinksFound} code links.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Invariant code verification failed: ${msg}` };
  }
};

const verifyInvariantsSchema: ToolSchema = {
  name: "verify_okf_invariants",
  description:
    "Verify code-grounding links in OKF knowledge nodes. Checks if referenced source files exist in the workspace " +
    "to detect code drift, missing implementation modules, or broken architectural contracts.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      node_id: {
        type: "string",
        description: "Optional node ID to verify. If omitted, checks code links across all OKF nodes in the graph.",
      },
    },
  },
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const ragPlugin: ToolPlugin = {
  id: "rag",
  name: "Hybrid Knowledge Base (OKF + RAG)",
  description: "Ingest, distill, and search both curated Open Knowledge Format (OKF) graph nodes and unstructured Vector Store chunks.",
  icon: "📚",

  register(registerTool) {
    // Vector RAG tools
    registerTool(ingestSchema, ingestHandler);
    registerTool(querySchema, queryHandler);
    registerTool(listSchema, listHandler);
    registerTool(removeSchema, removeHandler);

    // OKF & Hybrid tools
    registerTool(ingestOkfSchema, ingestOkfHandler);
    registerTool(queryOkfSchema, queryOkfHandler);
    registerTool(traverseOkfSchema, traverseOkfHandler);
    registerTool(listOkfSchema, listOkfHandler);
    registerTool(createOkfSchema, createOkfHandler);
    registerTool(searchHybridSchema, searchHybridHandler);
    registerTool(distillOkfSchema, distillOkfHandler);
    registerTool(verifyInvariantsSchema, verifyInvariantsHandler);
  },
};
