/**
 * Hybrid Knowledge Router — AI Plate (Open Power)
 *
 * Coordinates between:
 *   1. OKF Store (Curated, Deterministic, Authoritative Graph Tier)
 *   2. Vector Store (Probabilistic, Semantic, Unstructured RAG Tier)
 *
 * Ensures deterministic canonical rules & contracts take priority over
 * exploratory vector chunks, eliminating hallucination while preserving broad recall.
 */

import { OkfStore, OkfNode, OkfGraphEdge } from "./okf-store.js";
import { VectorStore, QueryResult } from "./vector-store.js";
import { CONFIG, logVerbose } from "./config.js";

export type KnowledgeMode = "hybrid" | "okf_only" | "rag_only";

export interface HybridRouteOptions {
  mode?: KnowledgeMode;
  maxOkfNodes?: number;
  maxRagChunks?: number;
  traverseGraphDepth?: number;
  minOkfScore?: number;
  minRagSimilarity?: number;
}

export interface HybridRouteResult {
  mode: KnowledgeMode;
  okfNodes: OkfNode[];
  okfEdges: OkfGraphEdge[];
  ragChunks: QueryResult[];
  formattedContext: string;
  sources: string[];
  hasContext: boolean;
  stats: {
    okfNodeCount: number;
    okfTraversedCount: number;
    ragChunkCount: number;
    durationMs: number;
  };
}

export class HybridKnowledgeRouter {
  private readonly okfStore: OkfStore;
  private readonly vectorStore: VectorStore;

  constructor(okfStore?: OkfStore, vectorStore?: VectorStore) {
    this.okfStore = okfStore ?? new OkfStore();
    this.vectorStore = vectorStore ?? new VectorStore();
  }

  public getOkfStore(): OkfStore {
    return this.okfStore;
  }

  public getVectorStore(): VectorStore {
    return this.vectorStore;
  }

  /**
   * Route user query across OKF and Vector RAG based on intent, exact matches, and mode.
   */
  public async route(
    query: string,
    options?: HybridRouteOptions
  ): Promise<HybridRouteResult> {
    const startTime = Date.now();
    const mode: KnowledgeMode = options?.mode || "hybrid";
    const maxOkf = options?.maxOkfNodes ?? 2;
    const maxRag = options?.maxRagChunks ?? CONFIG.RAG.DEFAULT_TOP_K;
    const minOkfScore = options?.minOkfScore ?? 2.0;
    const minRagSim = options?.minRagSimilarity ?? CONFIG.RAG.MIN_SIMILARITY;
    const traverseDepth = options?.traverseGraphDepth ?? 1;

    const okfNodes: OkfNode[] = [];
    const okfEdges: OkfGraphEdge[] = [];
    let ragChunks: QueryResult[] = [];
    const sourcesSet = new Set<string>();

    let traversedCount = 0;

    // ─── 1. Query OKF Graph Store (Deterministic Tier) ───────────────────
    if (mode === "hybrid" || mode === "okf_only") {
      try {
        const okfMatches = await this.okfStore.search(query, {
          topK: maxOkf,
          minScore: minOkfScore,
        });

        for (const match of okfMatches) {
          okfNodes.push(match.node);
          sourcesSet.add(`okf:${match.node.id}`);

          // Traverse graph links for high-confidence matches
          if (traverseDepth > 0 && match.score >= 3.0) {
            const traversal = this.okfStore.traverseGraph(match.node.id, traverseDepth);
            if (traversal) {
              for (const edge of traversal.edges) {
                okfEdges.push(edge);
              }
              for (const connected of traversal.connectedNodes) {
                if (!okfNodes.some((n) => n.id === connected.id)) {
                  okfNodes.push(connected);
                  sourcesSet.add(`okf:${connected.id}`);
                  traversedCount++;
                }
              }
            }
          }
        }
      } catch (err) {
        logVerbose("HYBRID-ROUTER", `OKF search error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ─── 2. Query Vector Store RAG (Probabilistic Tier) ─────────────────
    if (mode === "hybrid" || mode === "rag_only") {
      try {
        if (this.vectorStore.totalChunks > 0) {
          ragChunks = await this.vectorStore.query(query, maxRag, minRagSim);
          for (const chunk of ragChunks) {
            sourcesSet.add(`rag:${chunk.chunk.sourceDocument}`);
          }
        }
      } catch (err) {
        logVerbose("HYBRID-ROUTER", `Vector RAG query error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ─── 3. Synthesize & Rank Formatted Context ─────────────────────────
    const contextSections: string[] = [];

    // Tier 1: Canonical OKF context takes priority
    if (okfNodes.length > 0) {
      const okfFormatted = this.okfStore.formatContextForPrompt(okfNodes, okfEdges);
      if (okfFormatted) {
        contextSections.push(okfFormatted);
      }
    }

    // Tier 2: Supplementary Vector RAG context
    if (ragChunks.length > 0) {
      const ragFormatted = this.vectorStore.formatContextForPrompt(ragChunks);
      if (ragFormatted) {
        contextSections.push(
          `### 📚 [SUPPLEMENTARY CONTEXT: VECTOR RAG]\nThe following unstructured corpus chunks were retrieved via vector similarity search:\n\n${ragFormatted}`
        );
      }
    }

    const formattedContext = contextSections.join("\n\n---\n\n").trim();
    const durationMs = Date.now() - startTime;

    return {
      mode,
      okfNodes,
      okfEdges,
      ragChunks,
      formattedContext,
      sources: Array.from(sourcesSet),
      hasContext: formattedContext.length > 0,
      stats: {
        okfNodeCount: okfNodes.length - traversedCount,
        okfTraversedCount: traversedCount,
        ragChunkCount: ragChunks.length,
        durationMs,
      },
    };
  }
}
