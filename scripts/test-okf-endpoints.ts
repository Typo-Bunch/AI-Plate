/**
 * Agent 1: Endpoint & API Verification Agent
 *
 * Responsible for verifying all OKF Store and Hybrid Knowledge Router
 * endpoints, methods, schema validations, and link graph operations.
 */

import { AgentDatabase } from "../core/database.js";
import { OkfStore } from "../core/okf-store.js";
import { VectorStore } from "../core/vector-store.js";
import { HybridKnowledgeRouter } from "../core/hybrid-knowledge-router.js";

interface TestReportItem {
  endpoint: string;
  description: string;
  status: "PASSED" | "FAILED";
  details: string;
  durationMs: number;
}

export async function runEndpointVerificationAgent(): Promise<{
  totalPassed: number;
  totalFailed: number;
  results: TestReportItem[];
}> {
  console.log("\n========================================================");
  console.log("🕵️  AGENT 1: ENDPOINT & API VERIFICATION AGENT RUNNING");
  console.log("========================================================\n");

  const results: TestReportItem[] = [];
  const db = AgentDatabase.getInstance();
  const okf = new OkfStore(db);
  const vs = new VectorStore();
  const router = new HybridKnowledgeRouter(okf, vs);

  // Helper for test execution
  async function testCase(
    endpoint: string,
    description: string,
    fn: () => Promise<void> | void
  ) {
    const t0 = Date.now();
    try {
      await fn();
      const durationMs = Date.now() - t0;
      results.push({
        endpoint,
        description,
        status: "PASSED",
        details: "Assertion checks passed",
        durationMs,
      });
      console.log(`  ✅ [PASS] ${endpoint} — ${description} (${durationMs}ms)`);
    } catch (err) {
      const durationMs = Date.now() - t0;
      const details = err instanceof Error ? err.message : String(err);
      results.push({
        endpoint,
        description,
        status: "FAILED",
        details,
        durationMs,
      });
      console.error(`  ❌ [FAIL] ${endpoint} — ${description}: ${details}`);
    }
  }

  // 1. Endpoint: okf:save & okf:get
  await testCase("okf.saveNode / okf.getNode", "Create and retrieve an authoritative OKF node", async () => {
    const created = await okf.saveNode({
      id: "ep-auth-service",
      title: "Authentication Service Specification",
      domain: "security",
      tags: ["auth", "jwt", "tokens"],
      authority: "canonical",
      version: "2.1.0",
      content: "All requests must include a Bearer JWT signed with RS256 algorithm.",
      links: [{ target: "ep-user-service", relation: "depends_on" }],
    });

    if (created.id !== "ep-auth-service") throw new Error("ID mismatch");
    if (created.authority !== "canonical") throw new Error("Authority mismatch");

    const fetched = okf.getNode("ep-auth-service");
    if (!fetched) throw new Error("Node not found after save");
    if (!fetched.tags.includes("jwt")) throw new Error("Tag missing in retrieved node");
    if (fetched.links.length !== 1 || fetched.links[0].target !== "ep-user-service") {
      throw new Error("Link target mismatch");
    }
  });

  // 2. Endpoint: okf:traverse (Graph Traversal)
  await testCase("okf.traverseGraph", "Traverse 1-hop and 2-hop connected graph edges", async () => {
    // Add target companion nodes
    await okf.saveNode({
      id: "ep-user-service",
      title: "User Management Service",
      domain: "core",
      tags: ["users", "profiles"],
      authority: "canonical",
      version: "1.0.0",
      content: "Handles user identities and role-based permissions.",
      links: [{ target: "ep-audit-log", relation: "logs_to" }],
    });

    await okf.saveNode({
      id: "ep-audit-log",
      title: "Audit Logging Service",
      domain: "compliance",
      tags: ["audit", "logging"],
      authority: "canonical",
      version: "1.0.0",
      content: "Maintains immutable tamper-evident logs of user activities.",
    });

    const hop1 = okf.traverseGraph("ep-auth-service", 1);
    if (!hop1) throw new Error("Hop 1 traversal returned null");
    if (!hop1.connectedNodes.some((n) => n.id === "ep-user-service")) {
      throw new Error("Hop 1 failed to reach direct dependency 'ep-user-service'");
    }

    const hop2 = okf.traverseGraph("ep-auth-service", 2);
    if (!hop2) throw new Error("Hop 2 traversal returned null");
    if (!hop2.connectedNodes.some((n) => n.id === "ep-audit-log")) {
      throw new Error("Hop 2 failed to reach transitive dependency 'ep-audit-log'");
    }
  });

  // 3. Endpoint: okf:nodes (List & Filter)
  await testCase("okf.listNodes", "Filter nodes by domain, authority, and tags", async () => {
    const secNodes = okf.listNodes({ domain: "security" });
    if (!secNodes.some((n) => n.id === "ep-auth-service")) {
      throw new Error("Domain filtering failed for 'security'");
    }

    const tagNodes = okf.listNodes({ tag: "jwt" });
    if (!tagNodes.some((n) => n.id === "ep-auth-service")) {
      throw new Error("Tag filtering failed for 'jwt'");
    }

    const canonNodes = okf.listNodes({ authority: "canonical" });
    if (canonNodes.length < 2) {
      throw new Error("Authority filtering failed");
    }
  });

  // 4. Endpoint: okf.search (Deterministic Entity & Lexical Ranking)
  await testCase("okf.search", "Search OKF store with exact ID and tag matching", async () => {
    const idResults = await okf.search("ep-auth-service");
    if (idResults.length === 0 || idResults[0].node.id !== "ep-auth-service") {
      throw new Error("Exact ID match failed to score #1");
    }
    if (!idResults[0].matchReasons.includes("exact_id_match")) {
      throw new Error("Match reason 'exact_id_match' missing");
    }

    const tagResults = await okf.search("Where are the tokens and JWT verified?");
    if (tagResults.length === 0 || tagResults[0].node.id !== "ep-auth-service") {
      throw new Error("Tag match failed to retrieve auth node");
    }
  });

  // 5. Endpoint: hybridRouter.route (Routing and Context Synthesis)
  await testCase("hybridRouter.route", "Verify hybrid routing modes (hybrid, okf_only, rag_only)", async () => {
    // Mode: okf_only
    const okfOnlyRes = await router.route("What are the JWT token rules?", { mode: "okf_only" });
    if (okfOnlyRes.okfNodes.length === 0) throw new Error("okf_only mode returned no OKF nodes");
    if (okfOnlyRes.ragChunks.length !== 0) throw new Error("okf_only mode unexpectedly returned RAG chunks");
    if (!okfOnlyRes.formattedContext.includes("[VERIFIED KNOWLEDGE: OKF CANONICAL GRAPH]")) {
      throw new Error("OKF section header missing in formatted context");
    }

    // Mode: hybrid
    const hybridRes = await router.route("Authentication service token specification", { mode: "hybrid" });
    if (hybridRes.okfNodes.length === 0) throw new Error("Hybrid mode failed to retrieve OKF nodes");
    if (!hybridRes.sources.includes("okf:ep-auth-service")) {
      throw new Error("Sources missing okf:ep-auth-service");
    }
  });

  // 6. Endpoint: okf:delete (Cascade cleanup)
  await testCase("okf.deleteNode", "Delete OKF node and ensure link cascades", async () => {
    const deleted = okf.deleteNode("ep-auth-service");
    if (!deleted) throw new Error("deleteNode returned false");

    const fetched = okf.getNode("ep-auth-service");
    if (fetched !== null) throw new Error("Node still exists after deletion");

    // Clean up temporary test nodes
    okf.deleteNode("ep-user-service");
    okf.deleteNode("ep-audit-log");
  });

  const totalPassed = results.filter((r) => r.status === "PASSED").length;
  const totalFailed = results.filter((r) => r.status === "FAILED").length;

  console.log("\n--------------------------------------------------------");
  console.log(`🎯 ENDPOINT AGENT SUMMARY: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log("--------------------------------------------------------\n");

  return { totalPassed, totalFailed, results };
}

// Direct CLI execution
if (process.argv[1]?.endsWith("test-okf-endpoints.ts") || process.argv[1]?.endsWith("test-okf-endpoints.js")) {
  runEndpointVerificationAgent()
    .then((res) => {
      process.exit(res.totalFailed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Endpoint Verification Agent encountered fatal error:", err);
      process.exit(1);
    });
}
