/**
 * OKF Store — Open Knowledge Format Engine & Graph Store for AI Plate.
 *
 * Implements the Open Knowledge Format (OKF) specification:
 *   - File-based + SQLite persistent storage for curated, authoritative knowledge.
 *   - Structured Markdown documents with YAML frontmatter.
 *   - Deterministic entity identifiers, authority tiers, domains, and tags.
 *   - Traversable knowledge graph: supports explicit links and wiki-style [[node-id]] links.
 *   - Zero-hallucination deterministic matching with optional hybrid vector enhancement.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, basename, extname, isAbsolute } from "node:path";
import yaml from "yaml";
import { AgentDatabase, vectorToBlob, blobToVector, cosineSimilarityF32 } from "./database.js";
import { UniversalEmbedder } from "./embedder.js";
import { logVerbose, resolveWorkspacePath } from "./config.js";
import { parseDocumentContent } from "./document-parser.js";

// ─── Interfaces ──────────────────────────────────────────────────────────

export type OkfAuthority = "canonical" | "experimental" | "deprecated" | "informational";

export interface OkfLink {
  target: string;
  relation: string; // e.g. "depends_on", "implements", "relates_to", "references", "supersedes", "wiki_link", "implemented_by", "tested_by", "validates"
}

export interface OkfFrontmatter {
  id?: string;
  title?: string;
  domain?: string;
  tags?: string[] | string;
  authority?: OkfAuthority;
  version?: string;
  updated?: string;
  links?: Array<{ target: string; relation?: string }>;
  [key: string]: any;
}

export interface OkfNode {
  id: string;
  title: string;
  domain: string;
  tags: string[];
  authority: OkfAuthority;
  version: string;
  content: string; // Clean markdown body
  rawMarkdown: string; // Full markdown with frontmatter
  links: OkfLink[];
  createdAt: string;
  updatedAt: string;
  score?: number;
  matchReasons?: string[];
}

export interface OkfNodeSummary {
  id: string;
  title: string;
  domain: string;
  tags: string[];
  authority: OkfAuthority;
  version: string;
  linkCount: number;
  updatedAt: string;
}

export interface OkfGraphEdge {
  sourceId: string;
  targetId: string;
  relation: string;
}

export interface OkfGraphTraversalResult {
  root: OkfNode;
  connectedNodes: OkfNode[];
  edges: OkfGraphEdge[];
}

export interface OkfSearchResult {
  node: OkfNode;
  score: number;
  matchReasons: string[];
}

export interface OkfDistillOptions {
  id?: string;
  title?: string;
  domain?: string;
  authority?: OkfAuthority;
  tags?: string[];
  links?: OkfLink[];
  filePath?: string;
  rawText?: string;
  saveToStore?: boolean;
  generateEmbedding?: boolean;
}

export interface OkfDistillResult {
  node: OkfNode;
  saved: boolean;
  extractedStats: {
    invariantsCount: number;
    wikiLinksFound: string[];
    suggestedDomain: string;
    suggestedTags: string[];
  };
}

export interface OkfCodeLinkVerification {
  nodeId: string;
  target: string;
  relation: string;
  resolvedPath: string | null;
  exists: boolean;
  fileType: string;
  error?: string;
}

export interface OkfCodeVerificationReport {
  totalLinksChecked: number;
  codeLinksFound: number;
  validCodeLinks: number;
  brokenCodeLinks: number;
  details: OkfCodeLinkVerification[];
}

// ─── Helper Functions ────────────────────────────────────────────────────

/**
 * Parses raw Markdown text and extracts YAML frontmatter + clean body.
 */
export function parseOkfMarkdown(rawText: string, fallbackId?: string): {
  frontmatter: OkfFrontmatter;
  body: string;
  wikiLinks: string[];
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = frontmatterRegex.exec(rawText);

  let frontmatter: OkfFrontmatter = {};
  let body = rawText;

  if (match) {
    try {
      frontmatter = (yaml.parse(match[1]) as OkfFrontmatter) || {};
      body = rawText.slice(match[0].length).trim();
    } catch (err) {
      logVerbose("OKF", `Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Extract [[wiki-links]] from the markdown body: [[target]] or [[target|label]]
  const wikiLinks: string[] = [];
  const wikiRegex = /\[\[([a-zA-Z0-9_\-\.]+)(?:\|([^\]]+))?\]\]/g;
  let wikiMatch: RegExpExecArray | null;
  while ((wikiMatch = wikiRegex.exec(body)) !== null) {
    const target = wikiMatch[1].trim();
    if (target && !wikiLinks.includes(target)) {
      wikiLinks.push(target);
    }
  }

  // Normalize ID and Title if missing
  if (!frontmatter.id) {
    if (fallbackId) {
      frontmatter.id = fallbackId.replace(/\.md$/i, "").toLowerCase();
    } else {
      // Try to find first H1 heading
      const h1Match = /^#\s+(.+)$/m.exec(body);
      if (h1Match) {
        frontmatter.id = h1Match[1]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      } else {
        frontmatter.id = `okf_${Date.now()}`;
      }
    }
  }

  if (!frontmatter.title) {
    const h1Match = /^#\s+(.+)$/m.exec(body);
    frontmatter.title = h1Match ? h1Match[1].trim() : frontmatter.id;
  }

  return { frontmatter, body, wikiLinks };
}

// ─── Store Implementation ────────────────────────────────────────────────

export class OkfStore {
  private readonly db: AgentDatabase;
  private readonly embedder: UniversalEmbedder;

  constructor(customDb?: AgentDatabase) {
    this.db = customDb ?? AgentDatabase.getInstance();
    this.embedder = UniversalEmbedder.getInstance();
  }

  /**
   * Save or update an OKF node and its graph links into the database.
   */
  public async saveNode(
    nodeData: {
      id: string;
      title: string;
      domain?: string;
      tags?: string[];
      authority?: OkfAuthority;
      version?: string;
      content: string;
      rawMarkdown?: string;
      links?: OkfLink[];
    },
    options?: { generateEmbedding?: boolean }
  ): Promise<OkfNode> {
    const id = nodeData.id.trim().toLowerCase();
    const title = nodeData.title.trim() || id;
    const domain = (nodeData.domain || "general").trim().toLowerCase();
    const tags = (nodeData.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const authority: OkfAuthority = nodeData.authority || "canonical";
    const version = nodeData.version || "1.0.0";
    const content = nodeData.content.trim();
    const rawMarkdown = nodeData.rawMarkdown || this.buildRawMarkdown({ id, title, domain, tags, authority, version, content, links: nodeData.links });
    const nowIso = new Date().toISOString();

    // Deduplicate and assemble all links (explicit + wiki-links)
    const links: OkfLink[] = [];
    const seenTargets = new Set<string>();

    if (nodeData.links && Array.isArray(nodeData.links)) {
      for (const l of nodeData.links) {
        const target = l.target?.trim().toLowerCase();
        if (target && !seenTargets.has(target) && target !== id) {
          seenTargets.add(target);
          links.push({ target, relation: l.relation || "relates_to" });
        }
      }
    }

    // Also extract wiki-links from content if not already present
    const wikiRegex = /\[\[([a-zA-Z0-9_\-\.]+)(?:\|([^\]]+))?\]\]/g;
    let wm: RegExpExecArray | null;
    while ((wm = wikiRegex.exec(content)) !== null) {
      const target = wm[1].trim().toLowerCase();
      if (target && !seenTargets.has(target) && target !== id) {
        seenTargets.add(target);
        links.push({ target, relation: "wiki_link" });
      }
    }

    // Optional vector embedding
    let embeddingBlob: Buffer | null = null;
    if (options?.generateEmbedding) {
      try {
        const textToEmbed = `${title}\n${domain}\n${tags.join(" ")}\n${content.slice(0, 1500)}`;
        const vec = await this.embedder.embed(textToEmbed);
        if (vec && vec.length > 0) {
          embeddingBlob = vectorToBlob(vec);
        }
      } catch (err) {
        logVerbose("OKF", `Embedding generation skipped for ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Execute atomic transaction
    const insertNode = this.db.db.prepare(`
      INSERT INTO okf_nodes (id, title, domain, tags_json, authority, version, content, raw_markdown, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        domain = excluded.domain,
        tags_json = excluded.tags_json,
        authority = excluded.authority,
        version = excluded.version,
        content = excluded.content,
        raw_markdown = excluded.raw_markdown,
        embedding = COALESCE(excluded.embedding, okf_nodes.embedding),
        updated_at = excluded.updated_at
    `);

    const deleteLinks = this.db.db.prepare(`DELETE FROM okf_links WHERE source_id = ?`);
    const insertLink = this.db.db.prepare(`
      INSERT INTO okf_links (source_id, target_id, relation, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const tx = this.db.db.transaction(() => {
      insertNode.run(
        id,
        title,
        domain,
        JSON.stringify(tags),
        authority,
        version,
        content,
        rawMarkdown,
        embeddingBlob,
        nowIso,
        nowIso
      );

      deleteLinks.run(id);

      for (const link of links) {
        insertLink.run(id, link.target, link.relation, nowIso);
      }
    });

    tx();

    return {
      id,
      title,
      domain,
      tags,
      authority,
      version,
      content,
      rawMarkdown,
      links,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  /**
   * Retrieve a single OKF node by ID.
   */
  public getNode(id: string): OkfNode | null {
    const cleanId = id.trim().toLowerCase();
    const row = this.db.db
      .prepare(`SELECT * FROM okf_nodes WHERE id = ?`)
      .get(cleanId) as any;

    if (!row) return null;

    const linkRows = this.db.db
      .prepare(`SELECT target_id, relation FROM okf_links WHERE source_id = ?`)
      .all(cleanId) as any[];

    const links: OkfLink[] = linkRows.map((r) => ({
      target: r.target_id,
      relation: r.relation,
    }));

    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags_json || "[]");
    } catch {}

    return {
      id: row.id,
      title: row.title,
      domain: row.domain,
      tags,
      authority: row.authority as OkfAuthority,
      version: row.version,
      content: row.content,
      rawMarkdown: row.raw_markdown,
      links,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete an OKF node and cascade delete its link edges.
   */
  public deleteNode(id: string): boolean {
    const cleanId = id.trim();
    const cleanIdLower = cleanId.toLowerCase();
    this.db.db
      .prepare(`DELETE FROM okf_links WHERE LOWER(source_id) = ? OR LOWER(target_id) = ? OR source_id = ? OR target_id = ?`)
      .run(cleanIdLower, cleanIdLower, cleanId, cleanId);
    this.db.db
      .prepare(`DELETE FROM okf_nodes WHERE LOWER(id) = ? OR id = ?`)
      .run(cleanIdLower, cleanId);
    return true;
  }

  /**
   * List all OKF nodes with optional filtering.
   */
  public listNodes(filter?: { domain?: string; authority?: string; tag?: string }): OkfNodeSummary[] {
    let sql = `
      SELECT n.id, n.title, n.domain, n.tags_json, n.authority, n.version, n.updated_at,
             COUNT(l.id) as link_count
      FROM okf_nodes n
      LEFT JOIN okf_links l ON n.id = l.source_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.domain) {
      sql += ` AND n.domain = ?`;
      params.push(filter.domain.toLowerCase().trim());
    }

    if (filter?.authority) {
      sql += ` AND n.authority = ?`;
      params.push(filter.authority.toLowerCase().trim());
    }

    sql += ` GROUP BY n.id ORDER BY n.title ASC`;

    const rows = this.db.db.prepare(sql).all(...params) as any[];

    const summaries: OkfNodeSummary[] = [];
    for (const r of rows) {
      let tags: string[] = [];
      try {
        tags = JSON.parse(r.tags_json || "[]");
      } catch {}

      if (filter?.tag && !tags.includes(filter.tag.toLowerCase().trim())) {
        continue;
      }

      summaries.push({
        id: r.id,
        title: r.title,
        domain: r.domain,
        tags,
        authority: r.authority as OkfAuthority,
        version: r.version,
        linkCount: Number(r.link_count || 0),
        updatedAt: r.updated_at,
      });
    }

    return summaries;
  }

  /**
   * Traverse the OKF knowledge graph starting from a root node up to a specified depth.
   */
  public traverseGraph(rootId: string, maxDepth: number = 1): OkfGraphTraversalResult | null {
    const root = this.getNode(rootId);
    if (!root) return null;

    const visited = new Set<string>([root.id]);
    const connectedNodes: OkfNode[] = [];
    const edges: OkfGraphEdge[] = [];

    let currentLevel = [root.id];
    let depth = 0;

    while (currentLevel.length > 0 && depth < maxDepth) {
      const nextLevel: string[] = [];

      for (const currId of currentLevel) {
        // Find outgoing links
        const outgoing = this.db.db
          .prepare(`SELECT target_id, relation FROM okf_links WHERE source_id = ?`)
          .all(currId) as any[];

        for (const out of outgoing) {
          edges.push({
            sourceId: currId,
            targetId: out.target_id,
            relation: out.relation,
          });

          if (!visited.has(out.target_id)) {
            visited.add(out.target_id);
            const targetNode = this.getNode(out.target_id);
            if (targetNode) {
              connectedNodes.push(targetNode);
              nextLevel.push(out.target_id);
            }
          }
        }

        // Find incoming links (bidirectional graph awareness)
        const incoming = this.db.db
          .prepare(`SELECT source_id, relation FROM okf_links WHERE target_id = ?`)
          .all(currId) as any[];

        for (const inc of incoming) {
          edges.push({
            sourceId: inc.source_id,
            targetId: currId,
            relation: inc.relation,
          });

          if (!visited.has(inc.source_id)) {
            visited.add(inc.source_id);
            const sourceNode = this.getNode(inc.source_id);
            if (sourceNode) {
              connectedNodes.push(sourceNode);
              nextLevel.push(inc.source_id);
            }
          }
        }
      }

      currentLevel = nextLevel;
      depth++;
    }

    return { root, connectedNodes, edges };
  }

  /**
   * Ingest a single OKF Markdown file.
   */
  public async ingestFile(filePath: string, options?: { generateEmbedding?: boolean }): Promise<OkfNode> {
    const resolvedPath = resolveWorkspacePath(filePath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`OKF file not found: ${resolvedPath}`);
    }

    const rawContent = readFileSync(resolvedPath, "utf-8");
    const fallbackId = basename(resolvedPath, extname(resolvedPath));
    const { frontmatter, body, wikiLinks } = parseOkfMarkdown(rawContent, fallbackId);

    const explicitLinks: OkfLink[] = [];
    if (frontmatter.links && Array.isArray(frontmatter.links)) {
      for (const l of frontmatter.links) {
        if (l.target) explicitLinks.push({ target: l.target, relation: l.relation || "relates_to" });
      }
    }
    for (const w of wikiLinks) {
      if (!explicitLinks.some((l) => l.target.toLowerCase() === w.toLowerCase())) {
        explicitLinks.push({ target: w, relation: "wiki_link" });
      }
    }

    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : typeof frontmatter.tags === "string"
      ? (frontmatter.tags as string).split(",").map((s) => s.trim())
      : [];

    return this.saveNode(
      {
        id: frontmatter.id || fallbackId,
        title: frontmatter.title || fallbackId,
        domain: frontmatter.domain || "general",
        tags,
        authority: frontmatter.authority || "canonical",
        version: frontmatter.version || "1.0.0",
        content: body,
        rawMarkdown: rawContent,
        links: explicitLinks,
      },
      options
    );
  }

  /**
   * Ingest an entire directory of OKF Markdown files.
   */
  public async ingestDirectory(dirPath: string, options?: { generateEmbedding?: boolean }): Promise<OkfNode[]> {
    const resolved = resolveWorkspacePath(dirPath);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error(`Directory not found: ${resolved}`);
    }

    const results: OkfNode[] = [];
    const files = readdirSync(resolved);
    for (const file of files) {
      if (file.toLowerCase().endsWith(".md") || file.toLowerCase().endsWith(".markdown")) {
        try {
          const node = await this.ingestFile(resolve(resolved, file), options);
          results.push(node);
        } catch (err) {
          logVerbose("OKF", `Failed to ingest file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return results;
  }

  /**
   * Ingest raw markdown text directly with frontmatter.
   */
  public async ingestText(
    rawText: string,
    fallbackId?: string,
    options?: { generateEmbedding?: boolean }
  ): Promise<OkfNode> {
    const { frontmatter, body, wikiLinks } = parseOkfMarkdown(rawText, fallbackId);
    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : typeof frontmatter.tags === "string"
      ? (frontmatter.tags as string).split(",").map((s) => s.trim())
      : [];

    const explicitLinks: OkfLink[] = [];
    if (frontmatter.links && Array.isArray(frontmatter.links)) {
      for (const l of frontmatter.links) {
        if (l.target) explicitLinks.push({ target: l.target, relation: l.relation || "relates_to" });
      }
    }
    for (const w of wikiLinks) {
      if (!explicitLinks.some((l) => l.target.toLowerCase() === w.toLowerCase())) {
        explicitLinks.push({ target: w, relation: "wiki_link" });
      }
    }

    return this.saveNode(
      {
        id: frontmatter.id || fallbackId || `okf_${Date.now()}`,
        title: frontmatter.title || fallbackId || "Untitled Knowledge",
        domain: frontmatter.domain || "general",
        tags,
        authority: frontmatter.authority || "canonical",
        version: frontmatter.version || "1.0.0",
        content: body,
        rawMarkdown: rawText,
        links: explicitLinks,
      },
      options
    );
  }

  /**
   * Search OKF nodes using deterministic scoring + entity matching + optional vector similarity.
   */
  public async search(
    query: string,
    options?: {
      topK?: number;
      domain?: string;
      minScore?: number;
    }
  ): Promise<OkfSearchResult[]> {
    const topK = options?.topK ?? 5;
    const minScore = options?.minScore ?? 1.5;
    const cleanQuery = query.toLowerCase().trim();
    const STOP_WORDS = new Set([
      "what", "was", "the", "root", "cause", "of", "incident", "on", "at", "is", "for",
      "in", "and", "or", "to", "a", "an", "with", "from", "by", "how", "why", "are",
      "do", "does", "did", "can", "could", "should", "would", "be", "been", "being",
      "have", "has", "had", "this", "that", "these", "those", "when", "where", "which"
    ]);

    const tokens = cleanQuery
      .split(/[^a-z0-9_\-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    const meaningfulTokens = tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 2);

    // Fetch all nodes in domain or all nodes
    let sql = `SELECT * FROM okf_nodes`;
    const params: any[] = [];
    if (options?.domain) {
      sql += ` WHERE domain = ?`;
      params.push(options.domain.toLowerCase().trim());
    }
    const allRows = this.db.db.prepare(sql).all(...params) as any[];

    const scored: OkfSearchResult[] = [];

    // Optional query embedding for semantic check
    let queryEmbedding: Float32Array | null = null;
    try {
      const vec = await this.embedder.embed(query);
      if (vec && vec.length > 0) {
        queryEmbedding = vec instanceof Float32Array ? vec : new Float32Array(vec);
      }
    } catch {
      // Embedding optional; lexical & graph search work 100% deterministically
    }

    for (const row of allRows) {
      const id = row.id.toLowerCase();
      const title = row.title.toLowerCase();
      const content = row.content.toLowerCase();
      const domain = row.domain.toLowerCase();
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags_json || "[]").map((t: string) => t.toLowerCase());
      } catch {}

      let score = 0;
      const matchReasons: string[] = [];

      // 1. Direct ID Match
      if (id === cleanQuery) {
        score += 15.0;
        matchReasons.push("exact_id_match");
      } else if (cleanQuery.includes(id) || id.includes(cleanQuery)) {
        score += 8.0;
        matchReasons.push("id_substring_match");
      }

      // 2. Exact Title Match
      if (title === cleanQuery) {
        score += 12.0;
        matchReasons.push("exact_title_match");
      } else if (cleanQuery.includes(title)) {
        score += 7.0;
        matchReasons.push("title_match");
      }

      // 3. Tag Matches
      for (const tag of tags) {
        if (cleanQuery.includes(tag) || meaningfulTokens.includes(tag)) {
          score += 5.0;
          matchReasons.push(`tag_match:${tag}`);
        }
      }

      // 4. Meaningful Token Hits across Title and Content
      let tokenHits = 0;
      for (const token of meaningfulTokens) {
        if (id.includes(token)) {
          score += 3.0;
          tokenHits++;
        }
        if (title.includes(token)) {
          score += 2.5;
          tokenHits++;
        }
        if (domain.includes(token)) {
          score += 1.5;
        }
        if (content.includes(token)) {
          score += 0.8;
          tokenHits++;
        }
      }
      if (tokenHits > 0) {
        matchReasons.push(`token_hits:${tokenHits}`);
      }

      // 5. Semantic Vector Cosine Similarity (if present)
      if (queryEmbedding && row.embedding) {
        try {
          const docVec = blobToVector(row.embedding);
          const sim = cosineSimilarityF32(queryEmbedding, docVec);
          if (sim > 0.4) {
            const semanticScore = sim * 6.0;
            score += semanticScore;
            matchReasons.push(`semantic_similarity:${(sim * 100).toFixed(0)}%`);
          }
        } catch {}
      }

      // 6. Authority Weighting
      const authority = (row.authority || "canonical") as OkfAuthority;
      if (authority === "canonical") {
        score *= 1.3; // Canonical facts get prime boost
      } else if (authority === "deprecated") {
        score *= 0.4; // Deprecated nodes penalized
      }

      if (score >= minScore) {
        // Fetch links
        const linkRows = this.db.db
          .prepare(`SELECT target_id, relation FROM okf_links WHERE source_id = ?`)
          .all(row.id) as any[];
        const links: OkfLink[] = linkRows.map((r) => ({
          target: r.target_id,
          relation: r.relation,
        }));

        scored.push({
          node: {
            id: row.id,
            title: row.title,
            domain: row.domain,
            tags,
            authority,
            version: row.version,
            content: row.content,
            rawMarkdown: row.raw_markdown,
            links,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            score: Math.round(score * 10) / 10,
            matchReasons,
          },
          score,
          matchReasons,
        });
      }
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Formats retrieved OKF nodes and companion graph links into structured prompt context.
   */
  public formatContextForPrompt(nodes: OkfNode[], edges?: OkfGraphEdge[]): string {
    if (!nodes || nodes.length === 0) return "";

    const parts: string[] = [
      "### 🏛️ [VERIFIED KNOWLEDGE: OKF CANONICAL GRAPH]",
      "The following structured, curated knowledge is authoritative truth. Adhere strictly to these definitions, rules, and relationships:",
      "",
    ];

    for (const node of nodes) {
      parts.push(`#### 📌 [Node: ${node.id}] ${node.title}`);
      parts.push(
        `*Authority: ${node.authority.toUpperCase()}* | *Domain: ${node.domain}* | *Version: ${node.version}*`
      );
      if (node.tags && node.tags.length > 0) {
        parts.push(`*Tags:* \`${node.tags.join("`, `")}\``);
      }
      parts.push("");
      parts.push(node.content);
      parts.push("");

      if (node.links && node.links.length > 0) {
        parts.push("*Connected Knowledge Graph:*");
        for (const l of node.links) {
          parts.push(`  - **${l.relation}** ➔ [[${l.target}]]`);
        }
        parts.push("");
      }
    }

    if (edges && edges.length > 0) {
      parts.push("*Active Graph Relationships:*");
      const uniqueEdges = new Set<string>();
      for (const e of edges) {
        const key = `${e.sourceId}->${e.relation}->${e.targetId}`;
        if (!uniqueEdges.has(key)) {
          uniqueEdges.add(key);
          parts.push(`  - [[${e.sourceId}]] --(${e.relation})--> [[${e.targetId}]]`);
        }
      }
      parts.push("");
    }

    return parts.join("\n").trim();
  }

  /**
   * Automatically distills raw text, documents (PDF, Markdown, TXT, CSV, Code), or specs
   * into a structured OKF knowledge node with extracted invariants, relations, and tags.
   */
  public async distillDocumentToOkf(options: OkfDistillOptions): Promise<OkfDistillResult> {
    let sourceText = options.rawText || "";
    let sourceName = options.filePath ? basename(options.filePath) : "distilled-document";

    if (options.filePath) {
      const resolved = resolveWorkspacePath(options.filePath);
      if (!existsSync(resolved)) {
        throw new Error(`File not found at path: ${options.filePath}`);
      }
      const rawBuffer = readFileSync(resolved);
      const parsed = await parseDocumentContent(sourceName, rawBuffer);
      sourceText = parsed.text || rawBuffer.toString("utf-8");
    }

    if (!sourceText.trim()) {
      throw new Error("No text content provided or extractable for OKF distillation.");
    }

    // 1. Heuristic Title Extraction
    let extractedTitle = options.title;
    if (!extractedTitle) {
      const h1Match = /^#\s+(.+)$/m.exec(sourceText);
      if (h1Match) {
        extractedTitle = h1Match[1].trim();
      } else {
        const firstLine = sourceText.split(/\r?\n/).find((l) => l.trim().length > 3 && !l.startsWith("---"));
        if (firstLine) {
          extractedTitle = firstLine.replace(/^[#*>\s\-0-9\.\:]+/, "").slice(0, 80).trim();
        } else {
          extractedTitle = sourceName.replace(/\.[^/.]+$/, "").replace(/[_\-]+/g, " ");
        }
      }
    }

    // 2. Deterministic Slug ID
    let extractedId = options.id;
    if (!extractedId) {
      extractedId = extractedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);
      if (!extractedId || extractedId.length < 3) {
        extractedId = `okf-${Date.now().toString(36)}`;
      }
    }

    // 3. Extract Invariant Rules & Core Definitions
    const lines = sourceText.split(/\r?\n/);
    const invariants: string[] = [];
    const wikiLinksFound: string[] = [];
    const codeRefsFound: string[] = [];

    const wikiRegex = /\[\[([a-zA-Z0-9_\-\.\/]+)(?:\|([^\]]+))?\]\]/g;
    let wMatch: RegExpExecArray | null;
    while ((wMatch = wikiRegex.exec(sourceText)) !== null) {
      if (!wikiLinksFound.includes(wMatch[1])) {
        wikiLinksFound.push(wMatch[1]);
      }
    }

    // Scan for code references (e.g. `core/database.ts`, `server.py`, etc.)
    const codeFileRegex = /`([a-zA-Z0-9_\-\.\/]+\.(?:ts|js|py|json|css|html|go|rs|md|yaml|yml))`|(?:\b([a-zA-Z0-9_\-\.\/]+\.(?:ts|js|py|json|css|html|go|rs|md|yaml|yml))\b)/g;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = codeFileRegex.exec(sourceText)) !== null) {
      const target = (cMatch[1] || cMatch[2]).trim();
      if (target && !codeRefsFound.includes(target) && target !== sourceName) {
        codeRefsFound.push(target);
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(?:[-*]|\d+\.|\b(?:Rule|Invariant|Constraint|Policy|Requirement|SLA|Spec|Algorithm|Standard|Note)\b\s*[:\-])/i.test(trimmed)) {
        if (trimmed.length > 8 && trimmed.length < 300) {
          invariants.push(trimmed);
        }
      }
    }

    // 4. Domain & Tags Heuristics
    let suggestedDomain = options.domain || "general";
    const lowerText = sourceText.toLowerCase();
    const titleLower = (extractedTitle || "").toLowerCase();

    if (!options.domain) {
      const domainScores: Record<string, number> = {
        security:
          (lowerText.match(/\b(auth|jwt|token|oauth|permission|security|encryption|credentials|bearer)\b/g) || []).length * 2 +
          (titleLower.match(/\b(auth|jwt|token|security)\b/g) || []).length * 5,
        payments:
          (lowerText.match(/\b(payment|stripe|billing|invoice|credit\s*card|refund)\b/g) || []).length * 2 +
          (titleLower.match(/\b(payment|billing|stripe)\b/g) || []).length * 5,
        ecommerce:
          (lowerText.match(/\b(order|cart|ecommerce|inventory|shipping|checkout)\b/g) || []).length * 2 +
          (titleLower.match(/\b(order|cart|ecommerce|checkout)\b/g) || []).length * 5,
        database:
          (lowerText.match(/\b(database|sql|postgres|sqlite|redis|schema|migration|table)\b/g) || []).length * 2 +
          (titleLower.match(/\b(database|sql|sqlite|schema)\b/g) || []).length * 5,
        backend:
          (lowerText.match(/\b(api|endpoint|http|rest|grpc|router|server|microservice)\b/g) || []).length * 2 +
          (titleLower.match(/\b(api|backend|endpoint)\b/g) || []).length * 5,
        frontend:
          (lowerText.match(/\b(ui|component|css|html|react|frontend|view|layout)\b/g) || []).length * 2 +
          (titleLower.match(/\b(ui|frontend|component)\b/g) || []).length * 5,
        operations:
          (lowerText.match(/\b(incident|alert|crash|latency|sre|ops|devops|cluster|cpu)\b/g) || []).length * 2 +
          (titleLower.match(/\b(incident|runbook|ops|sre)\b/g) || []).length * 5,
      };

      let bestDomain = "general";
      let highestScore = 0;
      for (const [dom, score] of Object.entries(domainScores)) {
        if (score > highestScore) {
          highestScore = score;
          bestDomain = dom;
        }
      }
      suggestedDomain = bestDomain;
    }

    const suggestedTags = options.tags && options.tags.length > 0 ? options.tags : [];
    if (suggestedTags.length === 0) {
      if (suggestedDomain !== "general") suggestedTags.push(suggestedDomain);
      const candidates = ["rules", "architecture", "spec", "runbook", "sla", "security", "api", "database", "orders", "config"];
      for (const c of candidates) {
        if (lowerText.includes(c) && !suggestedTags.includes(c)) {
          suggestedTags.push(c);
        }
      }
      if (suggestedTags.length === 0) suggestedTags.push("distilled", "knowledge");
    }

    // 5. Build Synthesized Structured Content
    const contentSections: string[] = [];
    contentSections.push(`# ${extractedTitle}\n`);

    // Summary
    const summaryLines = lines.filter((l) => l.trim().length > 20 && !l.startsWith("#") && !l.startsWith("---")).slice(0, 3);
    if (summaryLines.length > 0) {
      contentSections.push(`## Summary\n${summaryLines.join(" ")}\n`);
    }

    // Invariants / Rules
    if (invariants.length > 0) {
      contentSections.push(
        `## Core Invariants & Rules\n` +
          invariants
            .slice(0, 10)
            .map((inv) => (inv.startsWith("-") || inv.startsWith("*") || /^\d+\./.test(inv) ? inv : `- ${inv}`))
            .join("\n") +
          "\n"
      );
    } else {
      contentSections.push(`## Key Specifications\n` + sourceText.slice(0, 1000) + "\n");
    }

    // Build Links
    const links: OkfLink[] = options.links ? [...options.links] : [];
    for (const wl of wikiLinksFound) {
      if (!links.some((l) => l.target === wl)) {
        links.push({ target: wl, relation: "references" });
      }
    }
    for (const cr of codeRefsFound.slice(0, 5)) {
      if (!links.some((l) => l.target === cr)) {
        links.push({ target: cr, relation: "implemented_by" });
      }
    }

    const authority: OkfAuthority = options.authority || "canonical";
    const version = "1.0.0";
    const bodyContent = contentSections.join("\n").trim();

    let node: OkfNode;
    if (options.saveToStore !== false) {
      node = await this.saveNode(
        {
          id: extractedId,
          title: extractedTitle,
          content: bodyContent,
          domain: suggestedDomain,
          tags: suggestedTags,
          authority,
          version,
          links,
        },
        { generateEmbedding: options.generateEmbedding }
      );
    } else {
      const nowIso = new Date().toISOString();
      const rawMarkdown = this.buildRawMarkdown({
        id: extractedId,
        title: extractedTitle,
        domain: suggestedDomain,
        tags: suggestedTags,
        authority,
        version,
        content: bodyContent,
        links,
      });
      node = {
        id: extractedId,
        title: extractedTitle,
        domain: suggestedDomain,
        tags: suggestedTags,
        authority,
        version,
        content: bodyContent,
        rawMarkdown,
        links,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    return {
      node,
      saved: options.saveToStore !== false,
      extractedStats: {
        invariantsCount: invariants.length,
        wikiLinksFound,
        suggestedDomain,
        suggestedTags,
      },
    };
  }

  /**
   * Verifies code grounding links in OKF nodes to detect missing code files or broken implementations.
   */
  public verifyCodeLinks(nodeId?: string, workspaceRoot?: string): OkfCodeVerificationReport {
    const root = workspaceRoot || process.cwd();
    let query = `SELECT source_id, target_id, relation FROM okf_links`;
    const params: any[] = [];
    if (nodeId) {
      query += ` WHERE source_id = ?`;
      params.push(nodeId);
    }
    const rows = this.db.db.prepare(query).all(...params) as Array<{ source_id: string; target_id: string; relation: string }>;

    const details: OkfCodeLinkVerification[] = [];
    let validCount = 0;
    let brokenCount = 0;

    const codeExts = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".json", ".css", ".html", ".go", ".rs", ".md", ".yaml", ".yml"]);
    const codeRelations = new Set(["implemented_by", "tested_by", "validates", "defined_in", "code_reference"]);

    for (const r of rows) {
      const ext = extname(r.target_id).toLowerCase();
      const isCodeLink = codeExts.has(ext) || codeRelations.has(r.relation) || r.target_id.includes("/") || r.target_id.includes("\\");
      if (!isCodeLink) continue;

      let resolved: string | null = null;
      let exists = false;
      let err: string | undefined;

      try {
        resolved = isAbsolute(r.target_id) ? r.target_id : resolve(root, r.target_id);
        exists = existsSync(resolved);
      } catch (e: any) {
        err = e.message;
      }

      if (exists) {
        validCount++;
      } else {
        brokenCount++;
      }

      details.push({
        nodeId: r.source_id,
        target: r.target_id,
        relation: r.relation,
        resolvedPath: resolved,
        exists,
        fileType: ext || "unknown",
        error: exists ? undefined : err || `Referenced code file '${r.target_id}' does not exist in workspace`,
      });
    }

    return {
      totalLinksChecked: rows.length,
      codeLinksFound: details.length,
      validCodeLinks: validCount,
      brokenCodeLinks: brokenCount,
      details,
    };
  }

  /**
   * Helper to build clean raw markdown with YAML frontmatter.
   */
  private buildRawMarkdown(data: {
    id: string;
    title: string;
    domain: string;
    tags: string[];
    authority: string;
    version: string;
    content: string;
    links?: OkfLink[];
  }): string {
    const fmObj: any = {
      id: data.id,
      title: data.title,
      domain: data.domain,
      tags: data.tags,
      authority: data.authority,
      version: data.version,
    };
    if (data.links && data.links.length > 0) {
      fmObj.links = data.links;
    }
    const yamlStr = yaml.stringify(fmObj).trim();
    return `---\n${yamlStr}\n---\n\n${data.content}`;
  }
}
