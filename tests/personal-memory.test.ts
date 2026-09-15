/**
 * Personal Memory & Sovereign Dossier Subsystem Tests.
 *
 * Validates 3-Tier Hybrid Personal Memory:
 *   - Tier 1: Conflict Resolution (ADD, UPDATE, INVALIDATE, NOOP)
 *   - Tier 2: Generative Reflection & Importance Scoring
 *   - Tier 3: Sovereign Living Dossier (USER_PROFILE.md) serialization
 *   - Prompt Context augmentation & turn observation
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PersonalMemoryManager } from "../core/personal-memory.js";

describe("3-Tier Hybrid Personal Memory & Living Dossier Subsystem", () => {
  let memoryManager: PersonalMemoryManager;

  before(() => {
    memoryManager = PersonalMemoryManager.getInstance();
  });

  test("PersonalMemoryManager initializes and ensures USER_PROFILE.md", () => {
    assert.ok(memoryManager, "PersonalMemoryManager should instantiate singleton");
    const pPath = memoryManager.getProfilePath();
    assert.ok(existsSync(pPath), "USER_PROFILE.md should exist on disk");
    const content = readFileSync(pPath, "utf-8");
    assert.ok(content.includes("Sovereign Personal Dossier"), "Dossier should contain title header");
  });

  test("Tier 1: Conflict Resolution - ADD novel fact", () => {
    const res = memoryManager.commitFact("identity", "test_user_title", "Lord Sterling", 1.0, 10);
    assert.equal(res.action, "ADD");
    assert.equal(res.newValue, "Lord Sterling");

    const facts = memoryManager.listActiveFacts();
    const found = facts.find((f) => f.fact_key === "test_user_title");
    assert.ok(found, "Newly added fact should be listed in active facts");
    assert.equal(found.fact_value, "Lord Sterling");
    assert.equal(found.importance, 10);
  });

  test("Tier 1: Conflict Resolution - NOOP on duplicate fact", () => {
    const res = memoryManager.commitFact("identity", "test_user_title", "Lord Sterling", 1.0, 10);
    assert.equal(res.action, "NOOP");
    assert.equal(res.newValue, "Lord Sterling");
  });

  test("Tier 1: Conflict Resolution - UPDATE / INVALIDATE on changed fact", () => {
    const res = memoryManager.commitFact("identity", "test_user_title", "Dr. Sterling", 1.0, 10);
    assert.equal(res.action, "UPDATE");
    assert.equal(res.previousValue, "Lord Sterling");
    assert.equal(res.newValue, "Dr. Sterling");

    const facts = memoryManager.listActiveFacts();
    const activeVersions = facts.filter((f) => f.fact_key === "test_user_title");
    assert.equal(activeVersions.length, 1, "Only one active version of fact should exist");
    assert.equal(activeVersions[0].fact_value, "Dr. Sterling");
  });

  test("Tier 2: Generative Reflection & Importance Scoring", () => {
    const r1 = memoryManager.commitReflection(
      "Test Executive Style",
      "Prefers structured bullet tables and concise prose.",
      9,
      0.85
    );
    assert.ok(r1.id, "Reflection should be created with an ID");
    assert.equal(r1.evidence_count, 1);
    assert.equal(r1.importance, 9);

    // Reinforce with second observation
    const r2 = memoryManager.commitReflection(
      "Test Executive Style",
      "Prefers structured bullet tables and concise prose with zero preamble.",
      9,
      0.85
    );
    assert.equal(r2.id, r1.id, "Should update the same reflection");
    assert.equal(r2.evidence_count, 2, "Evidence count should increment");
    assert.ok(r2.confidence >= 0.85, "Confidence should strengthen with evidence");
  });

  test("Tier 3: Sovereign Living Dossier (USER_PROFILE.md) contains updated facts & reflections", () => {
    memoryManager.syncLivingDossier();
    const pPath = memoryManager.getProfilePath();
    const content = readFileSync(pPath, "utf-8");

    assert.ok(content.includes("Dr. Sterling"), "Dossier markdown should include updated identity fact");
    assert.ok(content.includes("Test Executive Style"), "Dossier markdown should include synthesized reflection");
  });

  test("Turn Observer automatically extracts identity and project facts", () => {
    memoryManager.observeTurn(
      "Hello, my name is Alex and I am working on an animated explainer video.",
      "Greetings Alex, I am at your service."
    );

    const facts = memoryManager.listActiveFacts();
    const nameFact = facts.find((f) => f.fact_key === "user_name");
    assert.ok(nameFact, "Observer should capture user_name fact");
    assert.equal(nameFact.fact_value, "Alex");

    const projectFact = facts.find((f) => f.fact_key === "active_project");
    assert.ok(projectFact, "Observer should capture active_project fact");
    assert.ok(projectFact.fact_value.includes("animated explainer video"));
  });

  test("Context Builder compiles permanent facts into prompt context block", () => {
    const promptContext = memoryManager.buildMemoryPromptContext();
    assert.ok(promptContext.includes("Household & User Memory Sanctuary"), "Should generate sanctuary header");
    assert.ok(promptContext.includes("Alex"), "Should include user's name");
    assert.ok(promptContext.includes("animated explainer video"), "Should include active project");
  });

  test("General Settings CRUD and persistence", () => {
    memoryManager.setGeneralSetting("ui_language", "es");
    memoryManager.setGeneralSetting("send_shortcut", "ctrl_enter");
    memoryManager.setGeneralSetting("close_action", "quit");
    memoryManager.setGeneralSetting("confirm_quit", "true");
    memoryManager.setGeneralSetting("launch_startup", "true");
    memoryManager.setGeneralSetting("start_minimized", "true");

    assert.equal(memoryManager.getGeneralSetting("ui_language"), "es");
    assert.equal(memoryManager.getGeneralSetting("send_shortcut"), "ctrl_enter");
    assert.equal(memoryManager.getGeneralSetting("close_action"), "quit");
    assert.equal(memoryManager.getGeneralSetting("confirm_quit"), "true");

    const all = memoryManager.getAllGeneralSettings();
    assert.equal(all.ui_language, "es");
    assert.equal(all.send_shortcut, "ctrl_enter");
    assert.equal(all.close_action, "quit");
    assert.equal(all.confirm_quit, true);
    assert.equal(all.launch_startup, true);
    assert.equal(all.start_minimized, true);

    // Restore defaults
    memoryManager.setGeneralSetting("ui_language", "en");
    memoryManager.setGeneralSetting("send_shortcut", "enter");
    memoryManager.setGeneralSetting("close_action", "tray");
    memoryManager.setGeneralSetting("confirm_quit", "false");
    memoryManager.setGeneralSetting("launch_startup", "false");
    memoryManager.setGeneralSetting("start_minimized", "false");
  });

  test("Fact and Reflection deletion", () => {
    const facts = memoryManager.listActiveFacts();
    const testFact = facts.find((f) => f.fact_key === "test_user_title");
    if (testFact) {
      const deleted = memoryManager.deleteFact(testFact.id);
      assert.ok(deleted, "Should delete fact by ID");
      const afterFacts = memoryManager.listActiveFacts();
      assert.ok(!afterFacts.some((f) => f.id === testFact.id), "Deleted fact should no longer be listed");
    }

    const reflections = memoryManager.listActiveReflections();
    const testRefl = reflections.find((r) => r.title === "Test Executive Style");
    if (testRefl) {
      const deleted = memoryManager.deleteReflection(testRefl.id);
      assert.ok(deleted, "Should delete reflection by ID");
    }
  });
});
