import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { AgentDatabase } from "../core/database.js";
import { OkfStore } from "../core/okf-store.js";
import { PluginManager } from "../core/plugin-manager.js";
import { ragPlugin, setSharedOkfStore } from "../plugins/tools/rag-plugin.js";

describe("OKF Scope Expansion — Auto-Distillation, Code Grounding & Visual Graph", () => {
  let db: AgentDatabase;
  let okf: OkfStore;
  const testDir = resolve(process.cwd(), "scratch", "test-okf-expansion");
  const samplePdfDoc = join(testDir, "auth-token-spec.txt");

  before(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    db = AgentDatabase.getInstance();
    okf = new OkfStore(db);
    setSharedOkfStore(okf);

    writeFileSync(
      samplePdfDoc,
      `
# Authentication & JWT Token Policy Specification

All API requests must supply an Authorization header with Bearer JWT token.

## Invariant Rules
- Tokens expire strictly in 3600 seconds (1 hour).
- Refresh tokens must be rotated on every renewal request.
- Invalid tokens must return HTTP 401 with error code AUTH_INVALID_TOKEN.
- Tokens must be verified using public key in \`core/database.ts\`.

## Linked Dependencies
- Depends on [[order-processing-spec]] for checkout auth.
- Implemented by \`core/config.ts\`.
- Tested by \`tests/non-existent-test-file.ts\`.
`,
      "utf-8"
    );
  });

  after(() => {
    if (existsSync(samplePdfDoc)) {
      unlinkSync(samplePdfDoc);
    }
  });

  it("should auto-distill unstructured document text into a canonical OKF node with extracted invariants", async () => {
    const result = await okf.distillDocumentToOkf({
      filePath: samplePdfDoc,
      authority: "canonical",
    });

    assert.ok(result.node, "Distilled node must be returned");
    assert.ok(result.node.id.includes("authentication"), `Node ID should be slugified: ${result.node.id}`);
    assert.strictEqual(result.node.authority, "canonical");
    assert.strictEqual(result.node.domain, "security");
    assert.ok(result.extractedStats.invariantsCount >= 3, `Expected at least 3 invariants, got ${result.extractedStats.invariantsCount}`);
    assert.ok(result.node.links.some((l) => l.target === "order-processing-spec"), "Must extract wiki link to order-processing-spec");
    assert.ok(result.node.links.some((l) => l.target === "core/config.ts"), "Must extract code link to core/config.ts");
  });

  it("should verify code grounding links and report valid vs broken workspace files", () => {
    const report = okf.verifyCodeLinks();
    assert.ok(report.totalLinksChecked > 0, "Must check links");
    assert.ok(report.codeLinksFound > 0, "Must detect code file links");
    assert.ok(report.validCodeLinks >= 1, "Must detect valid existing workspace file core/config.ts or core/database.ts");
    assert.ok(report.brokenCodeLinks >= 1, "Must flag non-existent test file as broken");

    const broken = report.details.find((d) => d.target.includes("non-existent-test-file.ts"));
    assert.ok(broken, "Broken link detail must be reported");
    assert.strictEqual(broken?.exists, false);
  });

  it("should execute distill_to_okf tool via PluginManager seamlessly", async () => {
    const pm = PluginManager.getInstance();
    pm.registerPlugin(ragPlugin);

    const execResult = await pm.executeTool("distill_to_okf", {
      raw_text: `
# Distributed Lock Manager Spec
- Invariant: Locks auto-release after 30 seconds TTL.
- Invariant: Redlock consensus requires quorum of 3 redis nodes.
- References [[order-processing-spec]].
`,
      authority: "experimental",
      domain: "backend",
    });

    assert.ok(!execResult.error, "No execution error");
    assert.ok(execResult.response.success, "Tool execution must succeed");
    assert.strictEqual(execResult.response.node.authority, "experimental");
    assert.strictEqual(execResult.response.node.domain, "backend");
    assert.ok(execResult.response.node.invariantsExtracted >= 2);
  });

  it("should execute verify_okf_invariants tool and return structured health summary", async () => {
    const pm = PluginManager.getInstance();
    const execResult = await pm.executeTool("verify_okf_invariants", {});
    assert.ok(!execResult.error, "No execution error");
    assert.ok(execResult.response.success, "Tool execution must succeed");
    assert.ok(typeof execResult.response.summary === "string", "Summary must be provided");
    assert.ok(execResult.response.report.totalLinksChecked >= 1);
  });

  it("should cleanly delete an OKF node and cascade delete its graph links", async () => {
    // 1. Create a node to delete
    const tempNode = await okf.saveNode({
      id: "temporary-node-to-delete",
      title: "Temporary Node",
      domain: "testing",
      content: "This node will be deleted.",
      links: [{ target: "order-processing-spec", relation: "tests" }],
    });
    assert.ok(okf.getNode("temporary-node-to-delete"), "Node should exist before delete");

    // 2. Delete the node
    const deleted = okf.deleteNode("temporary-node-to-delete");
    assert.strictEqual(deleted, true, "deleteNode must return true");

    // 3. Verify node is gone
    assert.strictEqual(okf.getNode("temporary-node-to-delete"), null, "Node must no longer exist");
    const allNodes = okf.listNodes();
    assert.ok(!allNodes.some((n) => n.id === "temporary-node-to-delete"), "Node must not be in listNodes()");

    // 4. Verify links referencing this node are also removed
    const remainingLinks = db.db.prepare("SELECT * FROM okf_links WHERE source_id = ? OR target_id = ?").all("temporary-node-to-delete", "temporary-node-to-delete");
    assert.strictEqual(remainingLinks.length, 0, "All associated graph link edges must be purged");
  });
});
