import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../../core/orchestrator.js";
import { MockAIProvider } from "./mock-provider.js";
import { SessionVectorMemory } from "../../core/session-memory.js";
import { AgentDatabase } from "../../core/database.js";

test("mode defaults and persistence are isolated per session", () => {
  const directory = mkdtempSync(join(tmpdir(), "aiplate-mode-test-"));
  const db = new AgentDatabase(join(directory, "test.db"));
  const memory = new SessionVectorMemory(undefined, undefined, db);
  const a = memory.createSession();
  const b = memory.createSession();
  assert.equal(memory.getSessionMode(a.id), "normal");
  memory.setSessionMode(a.id, "plan");
  const restored = new SessionVectorMemory(undefined, undefined, db);
  assert.equal(restored.getSessionMode(a.id), "plan");
  assert.equal(restored.getSessionMode(b.id), "normal");
  assert.throws(() => memory.setSessionMode(a.id, "invalid" as any));
  memory.deleteSession(a.id);
  assert.equal(db.getMeta(`chat_mode:${a.id}`), undefined);
  db.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("mode filters declarations and blocks a whitelisted tool, then permits it in Code", async () => {
  const provider = new MockAIProvider();
  const orchestrator = new Orchestrator({ verbose: false }, undefined, provider);
  orchestrator.setProvider(provider);
  const session = orchestrator.createSession("Mode enforcement test");
  let executions = 0;
  const toolName = "mode_test_write";
  orchestrator.registerPlugin({
    id: "mode_test", name: "Mode test", description: "Test execution enforcement",
    register(register) {
      register({ name: toolName, description: "Writes", parametersJsonSchema: { type: "object", properties: {} } }, async () => {
        executions++;
        return { success: true };
      });
    },
  }, true);
  orchestrator.getSecurityManager().addSessionWhitelist(session.id, toolName);
  try {
    for (const mode of ["normal", "plan", "code"] as const) {
      provider.nextTurnResponses = [{ text: "", functionCalls: [{ name: toolName, args: {} }], finishReason: "tool_calls" }];
      await orchestrator.processPrompt("hello", undefined, session.id, mode);
      assert.equal(provider.registeredTools.some(t => t.name === toolName), mode === "code");
      assert.ok(provider.systemPrompt.includes(`${mode[0].toUpperCase()}${mode.slice(1)} mode:`));
      const observation = provider.functionResponsesReceived.at(-1)![0].response;
      if (mode !== "code") assert.match(String(observation.error), /unavailable/);
      else assert.equal(observation.success, true);
    }
    assert.equal(executions, 1);
    // Changing the session preference during a turn must not change that turn's permissions.
    provider.sendMessage = async () => {
      orchestrator.getSessionMemory().setSessionMode(session.id, "code");
      return { text: "", functionCalls: [{ name: toolName, args: {} }], finishReason: "tool_calls" };
    };
    await orchestrator.processPrompt("hello", undefined, session.id, "plan");
    assert.equal(executions, 1);
    await assert.rejects(orchestrator.processPrompt("hello", undefined, session.id, "invalid" as any), /Invalid chat mode/);
  } finally {
    orchestrator.deleteSession(session.id);
  }
});

test("failed, cancelled, and incomplete plans cannot be implemented; a later success can", async () => {
  const provider = new MockAIProvider();
  const orchestrator = new Orchestrator({ verbose: false }, undefined, provider);
  orchestrator.setProvider(provider);
  const session = orchestrator.createSession("Plan error handling");
  const sendMessage = provider.sendMessage.bind(provider);
  try {
    await orchestrator.processPrompt("hello", undefined, session.id, "plan");
    assert.equal(orchestrator.getLastExecutionMeta(session.id)?.canImplementPlan, true);
    for (const message of ["Connection failed", "429 rate limit exceeded", "Quota exceeded", "401 invalid API key", "Unexpected provider failure"]) {
      provider.sendMessage = async () => { throw new Error(message); };
      await assert.rejects(orchestrator.processPrompt("hello", undefined, session.id, "plan"), { message });
      assert.notEqual(orchestrator.getLastExecutionMeta(session.id)?.canImplementPlan, true);
    }
    provider.sendMessage = sendMessage;
    for (const response of [
      { text: "Partial plan", functionCalls: [], finishReason: "length" },
      { text: "", functionCalls: [], finishReason: "stop" },
    ]) {
      provider.nextTurnResponses = [response];
      await orchestrator.processPrompt("hello", undefined, session.id, "plan");
      assert.equal(orchestrator.getLastExecutionMeta(session.id)?.canImplementPlan, false);
    }
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(orchestrator.processPrompt("hello", abort.signal, session.id, "plan"), /stopped/);
    assert.notEqual(orchestrator.getLastExecutionMeta(session.id)?.canImplementPlan, true);
    await orchestrator.processPrompt("hello", undefined, session.id, "plan");
    assert.equal(orchestrator.getLastExecutionMeta(session.id)?.canImplementPlan, true);
  } finally {
    orchestrator.deleteSession(session.id);
  }
});
