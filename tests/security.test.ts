import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SecurityManager, formatPythonIndentation } from "../core/security-manager.js";

describe("Security Governance Subsystem", () => {
  const security = SecurityManager.getInstance();

  test("SecurityManager should initialize with active policy config", () => {
    const config = security.getConfig();
    assert.ok(config);
    assert.ok(typeof config.mode === "string");
  });

  test("Tool classification into capabilities", () => {
    const shellClass = security.classifyTool("execute_command");
    assert.ok(shellClass);
    assert.equal(shellClass.capability, "shell");

    const readClass = security.classifyTool("read_file");
    assert.ok(readClass);

    // Destructive file deletion tools must be classified as file_delete with high risk
    const deleteArtifactClass = security.classifyTool("delete_artifact");
    assert.equal(deleteArtifactClass.capability, "file_delete");
    assert.equal(deleteArtifactClass.riskLevel, "high");

    const clearArtifactsClass = security.classifyTool("clear_artifacts");
    assert.equal(clearArtifactsClass.capability, "file_delete");
    assert.equal(clearArtifactsClass.riskLevel, "high");

    const cleanSandboxClass = security.classifyTool("clean_sandbox");
    assert.equal(cleanSandboxClass.capability, "file_delete");
    assert.equal(cleanSandboxClass.riskLevel, "high");

    // Evaluation in Balanced mode must guard file deletion with 'ask'
    const evalResult = security.evaluateToolExecution("delete_artifact");
    assert.equal(evalResult.action, "ask");
    assert.equal(evalResult.riskLevel, "high");
  });

  test("Session Whitelisting: add, check, revoke, and clear", () => {
    const testSession = `sec_session_${Date.now()}`;
    const testTool = "write_file";

    // Initially not whitelisted
    const initialList = security.getSessionWhitelists(testSession);
    assert.ok(!initialList.includes(testTool));

    // Add to whitelist
    security.addSessionWhitelist(testSession, testTool);
    const updatedList = security.getSessionWhitelists(testSession);
    assert.ok(updatedList.includes(testTool));

    // Revoke permission
    security.revokeSessionPermission(testSession, testTool);
    const afterRevoke = security.getSessionWhitelists(testSession);
    assert.ok(!afterRevoke.includes(testTool));

    // Re-add and clear all
    security.addSessionWhitelist(testSession, testTool);
    security.clearSessionWhitelist(testSession);
    assert.equal(security.getSessionWhitelists(testSession).length, 0);
  });

  test("Approval Request Resolution workflow", async () => {
    const testSession = `approval_session_${Date.now()}`;
    
    // Start approval request promise
    const approvalPromise = security.requestApproval(
      "execute_dangerous_command",
      { command: "rm -rf /" },
      testSession
    );

    const pending = security.getPendingApprovals();
    assert.ok(pending.length >= 1);
    const targetApproval = pending.find((p) => p.sessionId === testSession);
    assert.ok(targetApproval);

    // Resolve approval with DENY
    const resolved = security.resolveApproval(targetApproval.id, "DENY");
    assert.equal(resolved, true);

    const decision = await approvalPromise;
    assert.equal(decision, "DENY");
  });

  test("formatPythonIndentation should format Python code with human readable indentation", () => {
    // 1. Unescaping literal \n and 2-space to 4-space normalization
    const codeWithTwoSpaces = "def calculate(x):\n  if x > 0:\n    return x * 2\n  else:\n    return 0";
    const formatted1 = formatPythonIndentation(codeWithTwoSpaces);
    assert.ok(formatted1.includes("    if x > 0:"), "Should normalize to 4 spaces");
    assert.ok(formatted1.includes("        return x * 2"), "Should normalize nested block to 8 spaces");

    // 2. Dedenting common leading spaces
    const indentedBlock = "        import math\n        def square_root(n):\n            return math.sqrt(n)";
    const formatted2 = formatPythonIndentation(indentedBlock);
    assert.ok(formatted2.startsWith("import math"), "Should dedent common leading indent to col 0");
    assert.ok(formatted2.includes("    return math.sqrt(n)"), "Should preserve internal 4-space indent");

    // 3. Flat unindented block after compound ':' statements
    const flatCode = "for i in range(5):\nprint(i)";
    const formatted3 = formatPythonIndentation(flatCode);
    assert.ok(formatted3.includes("for i in range(5):\n    print(i)"), "Should indent statements following ':'");
  });

  test("requestApproval should attach formattedCode when Python Sandbox Execution is evaluated", async () => {
    const testSession = `python_approval_session_${Date.now()}`;
    const rawCode = "def test_func():\n  x = 42\n  return x";

    const approvalPromise = security.requestApproval(
      "run_sandboxed_script",
      { language: "python", code: rawCode, script_name: "test.py" },
      testSession
    );

    const pending = security.getPendingApprovals();
    const targetApproval = pending.find((p) => p.sessionId === testSession);
    assert.ok(targetApproval, "Target approval request should exist in pending list");
    assert.equal(targetApproval.description, "Runs custom Python code inside the sandbox environment.");
    assert.ok(targetApproval.formattedCode, "formattedCode must be present on approval request");
    assert.ok(targetApproval.formattedCode.includes("    return x"), "formattedCode must have 4-space indentation");

    security.resolveApproval(targetApproval.id, "approve");
    const decision = await approvalPromise;
    assert.equal(decision, "approve");
  });

  test("check_python_environment should NOT attach formattedCode and should have accurate description", async () => {
    const testSession = `py_env_check_${Date.now()}`;
    const approvalPromise = security.requestApproval(
      "check_python_environment",
      {},
      testSession
    );

    const pending = security.getPendingApprovals();
    const targetApproval = pending.find((p) => p.sessionId === testSession);
    assert.ok(targetApproval, "Target approval request should exist in pending list");
    assert.equal(
      targetApproval.description,
      "Inspects the bundled Python environment version and installed packages."
    );
    assert.equal(targetApproval.formattedCode, undefined, "formattedCode should NOT be set when there is 0 code");

    security.resolveApproval(targetApproval.id, "approve");
    const decision = await approvalPromise;
    assert.equal(decision, "approve");
  });
});
