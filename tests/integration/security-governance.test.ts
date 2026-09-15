import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SecurityManager } from "../../core/security-manager.js";

describe("Integration: Security & Governance Governance", () => {
  const security = SecurityManager.getInstance();

  test("Security policy evaluates capability and risk level", () => {
    const shellEval = security.evaluateToolExecution("shell_exec", "session_test");
    assert.equal(shellEval.capability, "shell");
    assert.ok(["high", "critical", "medium"].includes(shellEval.riskLevel.toLowerCase()));

    const webEval = security.evaluateToolExecution("web_search", "session_test");
    assert.equal(webEval.capability, "network");
  });

  test("Approval Request Resolution workflow: ALLOW", async () => {
    const testSession = `allow_session_${Date.now()}`;
    let eventReceived = false;

    security.once("approval:requested", (req) => {
      eventReceived = true;
      assert.equal(req.sessionId, testSession);
      assert.equal(req.toolName, "execute_bash");
      // Simulate user clicking "ALLOW" in UI
      security.resolveApproval(req.id, "ALLOW");
    });

    const decision = await security.requestApproval(
      "execute_bash",
      { command: "ls -la" },
      testSession
    );

    assert.equal(eventReceived, true);
    assert.equal(decision, "ALLOW");
  });

  test("Approval Request Resolution workflow: DENY", async () => {
    const testSession = `deny_session_${Date.now()}`;

    security.once("approval:requested", (req) => {
      // Simulate user clicking "DENY" in UI
      security.resolveApproval(req.id, "DENY");
    });

    const decision = await security.requestApproval(
      "format_c_drive",
      { target: "C:" },
      testSession
    );

    assert.equal(decision, "DENY");
  });

  test("Session Whitelist Isolation between sessions", () => {
    const sessionA = `session_a_${Date.now()}`;
    const sessionB = `session_b_${Date.now()}`;
    const tool = "custom_automation_script";

    // Whitelist in Session A
    security.addSessionWhitelist(sessionA, tool);

    // Verify Session A has tool
    assert.ok(security.getSessionWhitelists(sessionA).includes(tool));

    // Verify Session B does NOT have tool (strict isolation)
    assert.equal(security.getSessionWhitelists(sessionB).includes(tool), false);

    // Revoke from Session A
    security.revokeSessionPermission(sessionA, tool);
    assert.equal(security.getSessionWhitelists(sessionA).includes(tool), false);
  });
});
