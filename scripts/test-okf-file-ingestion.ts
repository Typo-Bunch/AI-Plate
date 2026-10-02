/**
 * Agent 2: File Ingestion & E2E Verification Agent
 *
 * Responsible for:
 *   1. Generating realistic OKF markdown documents with YAML frontmatter & graph links.
 *   2. Ingesting OKF files into the OkfStore.
 *   3. Ingesting an unstructured incident text document into the VectorStore (RAG).
 *   4. Executing simulated LLM queries across Canonical, Unstructured, and Hybrid scenarios.
 *   5. Validating prompt hierarchy: Tier 1 OKF (Authoritative) vs Tier 2 RAG (Supplementary).
 *   6. Generating a comprehensive verification report for the Builder Agent.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { AgentDatabase } from "../core/database.js";
import { OkfStore } from "../core/okf-store.js";
import { VectorStore } from "../core/vector-store.js";
import { HybridKnowledgeRouter } from "../core/hybrid-knowledge-router.js";

export interface E2EVerificationReport {
  timestamp: string;
  filesIngested: {
    okfFiles: Array<{ id: string; title: string; authority: string; links: number }>;
    ragFiles: Array<{ filename: string; chunks: number; characters: number }>;
  };
  queryEvaluations: Array<{
    scenario: string;
    query: string;
    mode: string;
    okfFound: number;
    ragFound: number;
    traversedLinks: number;
    topSource: string;
    contextPreview: string;
    tier1Verified: boolean;
    tier2Verified: boolean;
    pass: boolean;
  }>;
  overallStatus: "SUCCESS" | "FAILURE";
}

export async function runFileIngestionAndVerificationAgent(): Promise<E2EVerificationReport> {
  console.log("\n========================================================");
  console.log("📑 AGENT 2: FILE INGESTION & E2E VERIFICATION AGENT RUNNING");
  console.log("========================================================\n");

  const testDir = resolve(process.cwd(), "scratch", "test-okf-docs");
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  // ─── Step 1: Create Real OKF Markdown Files ──────────────────────────
  console.log("📁 Step 1: Creating sample OKF markdown documents and RAG corpus...");

  const file1Path = join(testDir, "order-processing-spec.md");
  const file1Content = `---
id: "order-processing-spec"
title: "Order Processing Architecture & SLA"
domain: "ecommerce"
version: "2.4.0"
authority: "canonical"
tags: ["orders", "checkout", "sla", "inventory"]
links:
  - target: "payment-retry-runbook"
    relation: "references"
  - target: "inventory-reservation-spec"
    relation: "depends_on"
---

# Order Processing Architecture & SLA

All incoming checkout orders must be validated within 250ms SLA.

## Invariant Rules
1. Orders with total > $10,000 require manual fraud review hold.
2. Orders must reserve inventory in [[inventory-reservation-spec]] before charging credit card.
3. For card processing failures, adhere strictly to the rules in [[payment-retry-runbook]].
`;
  writeFileSync(file1Path, file1Content, "utf-8");

  const file2Path = join(testDir, "payment-retry-runbook.md");
  const file2Content = `---
id: "payment-retry-runbook"
title: "Payment Gateway Failure & Exponential Backoff Runbook"
domain: "payments"
version: "1.3.0"
authority: "canonical"
tags: ["payments", "retries", "stripe", "backoff", "errors"]
links:
  - target: "order-processing-spec"
    relation: "implements"
---

# Payment Gateway Failure & Exponential Backoff Runbook

When third-party payment gateways return transient HTTP 500 or 504 errors:

## Retry Algorithm
- Base backoff delay: 1000ms.
- Multiplier: 2.0x with +/- 20% jitter.
- Maximum attempts: Exactly 3 retries before marking transaction FAILED.
- Immediate failure conditions: \`ERR_CARD_DECLINED\` and \`ERR_INSUFFICIENT_FUNDS\` must NEVER be retried.
`;
  writeFileSync(file2Path, file2Content, "utf-8");

  // Create an unstructured incident report for Vector RAG
  const ragFilePath = join(testDir, "incident_alpha_crash.txt");
  const ragContent = `
INCIDENT REPORT #2026-09-A
Date: 2026-09-24
Severity: High
System: Server Cluster Alpha (Nodes 01-04)

Summary of events:
At 03:14 AM UTC, Server Cluster Alpha experienced an unexpected connection pool exhaustion.
Engineers on call observed Postgres connection spike up to 1,200 active connections.
Root cause was identified as a rogue cron script that opened unpooled direct socket connections.
Mitigation: Node 02 was rebooted at 03:45 AM UTC, pool limit capped at 300, and cron script disabled.
Follow-up actions: Deploy PgBouncer proxy on all nodes by Q4.
`;
  writeFileSync(ragFilePath, ragContent, "utf-8");

  console.log(`  ✔ Created ${file1Path}`);
  console.log(`  ✔ Created ${file2Path}`);
  console.log(`  ✔ Created ${ragFilePath}`);

  // ─── Step 2: Ingest into OKF Store and VectorStore ──────────────────
  console.log("\n📥 Step 2: Ingesting OKF files into OkfStore and text into VectorStore...");

  const db = AgentDatabase.getInstance();
  const okf = new OkfStore(db);
  const vs = new VectorStore();
  const router = new HybridKnowledgeRouter(okf, vs);

  // Ingest OKF files
  const node1 = await okf.ingestFile(file1Path);
  const node2 = await okf.ingestFile(file2Path);
  console.log(`  ✔ Ingested OKF Node '${node1.id}' (links: ${node1.links.length}, tags: ${node1.tags.join(",")})`);
  console.log(`  ✔ Ingested OKF Node '${node2.id}' (links: ${node2.links.length}, tags: ${node2.tags.join(",")})`);

  // Ingest into Vector RAG
  const ragResult = await vs.ingestText("incident_alpha_crash.txt", ragContent);
  console.log(`  ✔ Ingested into RAG '${ragResult.name}' (${ragResult.chunkCount} chunk(s), ${ragResult.totalCharacters} chars)`);

  // ─── Step 3: Execute Scenario Queries ────────────────────────────────
  console.log("\n🔍 Step 3: Executing simulated agent queries across scenarios...\n");

  const evaluations: E2EVerificationReport["queryEvaluations"] = [];

  // Scenario 1: Authoritative / Canonical Knowledge Query
  {
    const query = "What is the maximum retry limit and exponential backoff rule for payment gateway failures?";
    console.log(`  [Scenario 1 - Authoritative Canonical]`);
    console.log(`  Query: "${query}"`);

    const result = await router.route(query, { mode: "hybrid", traverseGraphDepth: 1 });

    const okfMatch = result.okfNodes.some((n) => n.id === "payment-retry-runbook");
    const hasBackoffRule = result.formattedContext.includes("Maximum attempts: Exactly 3 retries");
    const tier1Tag = result.formattedContext.includes("[VERIFIED KNOWLEDGE: OKF CANONICAL GRAPH]");

    const passed = okfMatch && hasBackoffRule && tier1Tag;

    evaluations.push({
      scenario: "Scenario 1: Canonical OKF Rule Retrieval",
      query,
      mode: result.mode,
      okfFound: result.okfNodes.length,
      ragFound: result.ragChunks.length,
      traversedLinks: result.stats.okfTraversedCount,
      topSource: result.sources[0] || "none",
      contextPreview: result.formattedContext.slice(0, 180) + "...",
      tier1Verified: tier1Tag,
      tier2Verified: false,
      pass: passed,
    });

    console.log(`  Result: ${passed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`  OKF Nodes Found: ${result.okfNodes.length} (Traversed: ${result.stats.okfTraversedCount})`);
    console.log(`  Top Source: ${result.sources[0]}`);
  }

  // Scenario 2: Unstructured Long-Tail RAG Query
  {
    const query = "What was the root cause of the incident on server cluster alpha at 03:14 AM?";
    console.log(`\n  [Scenario 2 - Unstructured Vector RAG Query]`);
    console.log(`  Query: "${query}"`);

    const result = await router.route(query, { mode: "hybrid" });

    const ragMatch = result.ragChunks.some((c) => c.chunk.sourceDocument.includes("incident_alpha"));
    const hasRootCause = result.formattedContext.includes("rogue cron script");
    const tier2Tag = result.formattedContext.includes("[SUPPLEMENTARY CONTEXT: VECTOR RAG]");

    const passed = ragMatch && hasRootCause && tier2Tag;

    evaluations.push({
      scenario: "Scenario 2: Unstructured RAG Fallback",
      query,
      mode: result.mode,
      okfFound: result.okfNodes.length,
      ragFound: result.ragChunks.length,
      traversedLinks: result.stats.okfTraversedCount,
      topSource: result.sources.find((s) => s.startsWith("rag:")) || "none",
      contextPreview: result.formattedContext.slice(0, 180) + "...",
      tier1Verified: false,
      tier2Verified: tier2Tag,
      pass: passed,
    });

    console.log(`  Result: ${passed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`  RAG Chunks Found: ${result.ragChunks.length}`);
    console.log(`  Sources: ${result.sources.join(", ")}`);
  }

  // Scenario 3: Multi-Layer Hybrid Query
  {
    const query = "Check order processing rules and the server cluster alpha incident";
    console.log(`\n  [Scenario 3 - Multi-Layer Hybrid Query]`);
    console.log(`  Query: "${query}"`);

    const result = await router.route(query, { mode: "hybrid" });

    const okfPresent = result.okfNodes.some((n) => n.id === "order-processing-spec");
    const ragPresent = result.ragChunks.some((c) => c.chunk.sourceDocument.includes("incident_alpha"));
    const okfBeforeRag =
      result.formattedContext.indexOf("[VERIFIED KNOWLEDGE: OKF CANONICAL GRAPH]") <
      result.formattedContext.indexOf("[SUPPLEMENTARY CONTEXT: VECTOR RAG]");

    const passed = okfPresent && ragPresent && okfBeforeRag;

    evaluations.push({
      scenario: "Scenario 3: Hybrid Co-Retrieval with Hierarchy Ordering",
      query,
      mode: result.mode,
      okfFound: result.okfNodes.length,
      ragFound: result.ragChunks.length,
      traversedLinks: result.stats.okfTraversedCount,
      topSource: result.sources[0] || "none",
      contextPreview: result.formattedContext.slice(0, 180) + "...",
      tier1Verified: result.formattedContext.includes("[VERIFIED KNOWLEDGE: OKF CANONICAL GRAPH]"),
      tier2Verified: result.formattedContext.includes("[SUPPLEMENTARY CONTEXT: VECTOR RAG]"),
      pass: passed,
    });

    console.log(`  Result: ${passed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log(`  OKF Nodes: ${result.okfNodes.length}, RAG Chunks: ${result.ragChunks.length}`);
    console.log(`  Hierarchy Check: OKF precedes RAG = ${okfBeforeRag}`);
  }

  // ─── Step 4: Cleanup Test Documents ─────────────────────────────────
  okf.deleteNode("order-processing-spec");
  okf.deleteNode("payment-retry-runbook");
  vs.removeDocument("incident_alpha_crash.txt");

  const allPassed = evaluations.every((e) => e.pass);

  const report: E2EVerificationReport = {
    timestamp: new Date().toISOString(),
    filesIngested: {
      okfFiles: [
        { id: node1.id, title: node1.title, authority: node1.authority, links: node1.links.length },
        { id: node2.id, title: node2.title, authority: node2.authority, links: node2.links.length },
      ],
      ragFiles: [
        { filename: ragResult.name, chunks: ragResult.chunkCount, characters: ragResult.totalCharacters },
      ],
    },
    queryEvaluations: evaluations,
    overallStatus: allPassed ? "SUCCESS" : "FAILURE",
  };

  console.log("\n========================================================");
  console.log(`📋 AGENT 2 E2E VERIFICATION COMPLETED: ${report.overallStatus}`);
  console.log(`   ${evaluations.filter((e) => e.pass).length} of ${evaluations.length} scenarios PASSED.`);
  console.log("========================================================\n");

  return report;
}

// Direct CLI execution
if (process.argv[1]?.endsWith("test-okf-file-ingestion.ts") || process.argv[1]?.endsWith("test-okf-file-ingestion.js")) {
  runFileIngestionAndVerificationAgent()
    .then((report) => {
      process.exit(report.overallStatus === "SUCCESS" ? 0 : 1);
    })
    .catch((err) => {
      console.error("File Ingestion Verification Agent encountered fatal error:", err);
      process.exit(1);
    });
}
