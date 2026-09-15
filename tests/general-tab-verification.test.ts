/**
 * Comprehensive General Settings & Personal Memory Subsystem Verification Test.
 *
 * Verifies all features exposed in the General tab:
 *  1. Butler Identity & Addressing (user_name, butler_tone)
 *  2. Language & Regional Settings (ui_language, response_language)
 *  3. Chat & Keyboard Interaction (send_shortcut, auto_scroll, audio_cues)
 *  4. App Closing Mechanism (close_action, confirm_quit)
 *  5. Startup & Boot Lifecycle (launch_startup, start_minimized, restore_session)
 *  6. 3-Tier Living Dossier & Data Sanctuary (Fact CRUD, Reflection Synthesis, USER_PROFILE.md sync, Wipe Memory)
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PersonalMemoryManager } from "../core/personal-memory.js";

describe("General Settings Tab & Personal Memory Full Verification", () => {
  let memoryManager: PersonalMemoryManager;

  before(() => {
    memoryManager = PersonalMemoryManager.getInstance();
  });

  after(() => {
    // Restore clean default settings after tests
    memoryManager.setGeneralSetting("ui_language", "en");
    memoryManager.setGeneralSetting("response_language", "match_ui");
    memoryManager.setGeneralSetting("user_name", "");
    memoryManager.setGeneralSetting("butler_tone", "butler");
    memoryManager.setGeneralSetting("send_shortcut", "enter");
    memoryManager.setGeneralSetting("auto_scroll", "true");
    memoryManager.setGeneralSetting("audio_cues", "true");
    memoryManager.setGeneralSetting("auto_learn", "true");
    memoryManager.setGeneralSetting("close_action", "tray");
    memoryManager.setGeneralSetting("confirm_quit", "false");
    memoryManager.setGeneralSetting("launch_startup", "false");
    memoryManager.setGeneralSetting("start_minimized", "false");
    memoryManager.setGeneralSetting("restore_session", "true");
  });

  test("1. Butler Identity & Addressing: Name & Demeanor", () => {
    memoryManager.setGeneralSetting("user_name", "Captain Sterling");
    memoryManager.setGeneralSetting("butler_tone", "concise");

    assert.equal(memoryManager.getGeneralSetting("user_name"), "Captain Sterling");
    assert.equal(memoryManager.getGeneralSetting("butler_tone"), "concise");

    // Setting user_name should automatically commit an identity fact
    const facts = memoryManager.listActiveFacts();
    const nameFact = facts.find((f) => f.fact_key === "user_name");
    assert.ok(nameFact, "Setting user_name must commit active identity fact");
    assert.equal(nameFact.fact_value, "Captain Sterling");

    // Verify prompt context includes identity and tone
    const promptCtx = memoryManager.buildMemoryPromptContext();
    assert.ok(promptCtx.includes("Captain Sterling"), "Prompt context must include user's name");
    assert.ok(promptCtx.includes("concise"), "Prompt context must include demeanor");
  });

  test("2. Language & Regional Preferences", () => {
    memoryManager.setGeneralSetting("ui_language", "fr");
    memoryManager.setGeneralSetting("response_language", "French Haute");

    assert.equal(memoryManager.getGeneralSetting("ui_language"), "fr");
    assert.equal(memoryManager.getGeneralSetting("response_language"), "French Haute");

    const all = memoryManager.getAllGeneralSettings();
    assert.equal(all.ui_language, "fr");
    assert.equal(all.response_language, "French Haute");

    const promptCtx = memoryManager.buildMemoryPromptContext();
    assert.ok(promptCtx.includes("French Haute"), "Prompt context must reflect preferred response language");
  });

  test("3. Chat & Keyboard Interaction Options", () => {
    memoryManager.setGeneralSetting("send_shortcut", "ctrl_enter");
    memoryManager.setGeneralSetting("auto_scroll", "false");
    memoryManager.setGeneralSetting("audio_cues", "false");

    assert.equal(memoryManager.getGeneralSetting("send_shortcut"), "ctrl_enter");
    assert.equal(memoryManager.getGeneralSetting("auto_scroll"), "false");
    assert.equal(memoryManager.getGeneralSetting("audio_cues"), "false");

    const all = memoryManager.getAllGeneralSettings();
    assert.equal(all.send_shortcut, "ctrl_enter");
    assert.equal(all.auto_scroll, false);
    assert.equal(all.audio_cues, false);
  });

  test("4. App Closing Mechanism Settings", () => {
    // Test 'quit' action
    memoryManager.setGeneralSetting("close_action", "quit");
    memoryManager.setGeneralSetting("confirm_quit", "true");
    assert.equal(memoryManager.getGeneralSetting("close_action"), "quit");
    assert.equal(memoryManager.getGeneralSetting("confirm_quit"), "true");

    let all = memoryManager.getAllGeneralSettings();
    assert.equal(all.close_action, "quit");
    assert.equal(all.confirm_quit, true);

    // Test 'ask' action
    memoryManager.setGeneralSetting("close_action", "ask");
    all = memoryManager.getAllGeneralSettings();
    assert.equal(all.close_action, "ask");

    // Test 'tray' action (default)
    memoryManager.setGeneralSetting("close_action", "tray");
    all = memoryManager.getAllGeneralSettings();
    assert.equal(all.close_action, "tray");
  });

  test("5. System Startup & Boot Options", () => {
    memoryManager.setGeneralSetting("launch_startup", "true");
    memoryManager.setGeneralSetting("start_minimized", "true");
    memoryManager.setGeneralSetting("restore_session", "false");

    const all = memoryManager.getAllGeneralSettings();
    assert.equal(all.launch_startup, true);
    assert.equal(all.start_minimized, true);
    assert.equal(all.restore_session, false);
  });

  test("6. Living Dossier & Data Sanctuary: Markdown Sync & Wipe", () => {
    // Add facts across different categories
    memoryManager.commitFact("project", "mission_apollo", "Lunar exploration script", 0.9, 8);
    memoryManager.commitFact("preference", "code_syntax", "Strict TypeScript with full typing", 0.95, 9);
    memoryManager.commitReflection("Precision Architecture", "User requires complete runnable scripts", 9, 0.9);

    memoryManager.syncLivingDossier();
    const pPath = memoryManager.getProfilePath();
    assert.ok(existsSync(pPath), "USER_PROFILE.md must exist on disk");

    const content = readFileSync(pPath, "utf-8");
    assert.ok(content.includes("Lunar exploration script"), "Dossier must serialize mission project");
    assert.ok(content.includes("Strict TypeScript"), "Dossier must serialize preference");
    assert.ok(content.includes("Precision Architecture"), "Dossier must serialize reflection");

    // Test wipePersonalMemory()
    memoryManager.wipePersonalMemory();
    const wipedFacts = memoryManager.listActiveFacts();
    const wipedReflections = memoryManager.listActiveReflections();
    assert.equal(wipedFacts.length, 0, "All facts must be cleared on wipe");
    assert.equal(wipedReflections.length, 0, "All reflections must be cleared on wipe");

    // Verify dossier markdown was re-synchronized to clean slate
    const wipedContent = readFileSync(pPath, "utf-8");
    assert.ok(!wipedContent.includes("Lunar exploration script"), "Wiped dossier must not contain cleared facts");
    assert.ok(wipedContent.includes("Sovereign Personal Dossier"), "Dossier header remains intact");
  });
});
