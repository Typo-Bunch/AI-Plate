import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AgentDatabase, vectorToBlob, blobToVector, cosineSimilarityF32 } from "../core/database.js";
import { SessionVectorMemory } from "../core/session-memory.js";

describe("Database & Session Storage Subsystem", () => {
  const db = AgentDatabase.getInstance();
  const sessionMemory = new SessionVectorMemory();

  test("AgentDatabase singleton should initialize with open connection", () => {
    assert.ok(db);
    assert.ok(db.db);
    assert.equal(db.db.open, true);
  });

  test("Vector conversion and Cosine Similarity math", () => {
    const v1 = new Float32Array([1.0, 0.0, 0.0]);
    const v2 = new Float32Array([1.0, 0.0, 0.0]);
    const v3 = new Float32Array([0.0, 1.0, 0.0]);

    const blob1 = vectorToBlob(v1);
    const reconstituted = blobToVector(blob1);
    assert.equal(reconstituted[0], 1.0);
    assert.equal(reconstituted[1], 0.0);

    const simIdentical = cosineSimilarityF32(v1, v2);
    assert.ok(Math.abs(simIdentical - 1.0) < 1e-5);

    const simOrthogonal = cosineSimilarityF32(v1, v3);
    assert.ok(Math.abs(simOrthogonal - 0.0) < 1e-5);
  });

  test("Session lifecycle via SessionVectorMemory: create, list, and delete", () => {
    const testTitle = `Unit Test Session ${Date.now()}`;
    const session = sessionMemory.createSession(testTitle);
    assert.ok(session.id);
    assert.equal(session.title, testTitle);

    const sessions = sessionMemory.listSessions();
    assert.ok(sessions.some((s) => s.id === session.id));

    // Get messages for new session
    const messages = sessionMemory.getSessionMessages(session.id);
    assert.ok(Array.isArray(messages));

    // Cleanup session
    const deleted = sessionMemory.deleteSession(session.id);
    assert.equal(deleted, true);

    const sessionsAfter = sessionMemory.listSessions();
    assert.ok(!sessionsAfter.some((s) => s.id === session.id));
  });

  test("SessionVectorMemory clearAll resets session turns and restores default session", async () => {
    const isolatedMem = new SessionVectorMemory("test_isolated_clear.db");
    try {
      const s1 = isolatedMem.createSession("Purge Test Session 1");
      const s2 = isolatedMem.createSession("Purge Test Session 2");

      await isolatedMem.memorize("user", "Hello temporary memory turn", s1.id);
      await isolatedMem.memorize("model", "Temporary response turn", s1.id);

      const msgsBefore = isolatedMem.getSessionMessages(s1.id);
      assert.ok(msgsBefore.length >= 2);

      isolatedMem.clearAll();

      // Default session should exist and be active
      assert.equal(isolatedMem.activeSessionId, "default");
      const allSessions = isolatedMem.listSessions();
      assert.equal(allSessions.length, 1);
      assert.equal(allSessions[0].id, "default");

      // All previous turns should be completely purged from SQLite
      const msgsAfter = isolatedMem.getSessionMessages("default");
      assert.equal(msgsAfter.length, 0);
    } finally {
      try {
        isolatedMem.close();
        const fs = await import("node:fs");
        if (fs.existsSync("test_isolated_clear.db")) fs.unlinkSync("test_isolated_clear.db");
      } catch {}
    }
  });

  test("Plugin Key-Value Storage: set, get, and clear", () => {
    const pluginId = "unit_test_plugin";
    const testKey = "diagnostic_key";
    const testValue = { score: 99, status: "optimal" };

    db.setPluginData(pluginId, testKey, testValue);
    const retrieved = db.getPluginData(pluginId, testKey);
    assert.deepEqual(retrieved, testValue);

    db.clearPluginData(pluginId);
    const afterClear = db.getPluginData(pluginId, testKey, null);
    assert.equal(afterClear, null);
  });

  test("System Meta: set and get", () => {
    const metaKey = "unit_test_meta";
    db.setMeta(metaKey, "test_value_123");
    assert.equal(db.getMeta(metaKey), "test_value_123");
    // Clean up test meta record
    db.db.prepare("DELETE FROM meta WHERE key = ?").run(metaKey);
    assert.equal(db.getMeta(metaKey), undefined);
  });
});
