import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SkillsManager, DEFAULT_BUILTIN_SKILLS } from "../core/skills-manager.js";

describe("Skills & Cognitive Directives Subsystem", () => {
  const sm = SkillsManager.getInstance();

  test("SkillsManager initializes with all built-in reference skills", () => {
    const skills = sm.getSkills();
    assert.ok(skills.length >= 6, "Expected at least 6 built-in skills");

    const ids = skills.map((s) => s.id);
    assert.ok(ids.includes("humanizer"), "Humanizer skill must be present");
    assert.ok(ids.includes("superpowers-tdd"), "Superpowers TDD skill must be present");
    assert.ok(ids.includes("superpowers-debugging"), "Superpowers Debugging skill must be present");
    assert.ok(ids.includes("superpowers-spec-plan"), "Superpowers Spec & Plan skill must be present");
    assert.ok(ids.includes("superpowers-code-review"), "Superpowers Code Review skill must be present");
    assert.ok(ids.includes("superpowers-verification"), "Superpowers Verification skill must be present");

    const humanizer = sm.getSkill("humanizer");
    assert.ok(humanizer);
    assert.equal(humanizer.isBuiltin, true);
    assert.ok(humanizer.promptInstructions.includes("Signs of AI writing"));
    assert.ok(humanizer.promptInstructions.includes("Two-Pass Cognitive Execution Protocol"));

    const tdd = sm.getSkill("superpowers-tdd");
    assert.ok(tdd);
    assert.equal(tdd.isBuiltin, true);
    assert.ok(tdd.promptInstructions.includes("Red Phase"));
    assert.ok(tdd.promptInstructions.includes("Green Phase"));
  });

  test("Toggle skill activation state", () => {
    const origState = sm.getSkill("humanizer")?.enabled ?? true;
    const toggled = sm.toggleSkill("humanizer", !origState);
    assert.equal(toggled, true);
    assert.equal(sm.getSkill("humanizer")?.enabled, !origState);

    // Revert back
    sm.toggleSkill("humanizer", origState);
    assert.equal(sm.getSkill("humanizer")?.enabled, origState);
  });

  test("Filter mode switching", () => {
    sm.setFilterMode("always_active");
    assert.equal(sm.getFilterMode(), "always_active");

    sm.setFilterMode("smart_filter");
    assert.equal(sm.getFilterMode(), "smart_filter");
  });

  test("Smart Intent Filtering accurately detects trigger keywords", () => {
    sm.setFilterMode("smart_filter");

    // Ensure built-in skills are enabled for this test
    sm.toggleSkill("humanizer", true);
    sm.toggleSkill("superpowers-tdd", true);
    sm.toggleSkill("superpowers-debugging", true);

    // 1. Writing prompt should trigger Humanizer
    const writingMatches = sm.getApplicableSkills("Can you rewrite this blog post draft to sound more natural?");
    const writingIds = writingMatches.map((s) => s.id);
    assert.ok(writingIds.includes("humanizer"), "Writing prompt must trigger humanizer");
    assert.ok(!writingIds.includes("superpowers-debugging"), "Writing prompt should not trigger debugging");

    // 2. Debugging prompt should trigger Systematic Debugging
    const debugMatches = sm.getApplicableSkills("I have an error in my code: stack trace shows TypeError cannot read property of undefined, please debug and fix this crash");
    const debugIds = debugMatches.map((s) => s.id);
    assert.ok(debugIds.includes("superpowers-debugging"), "Error prompt must trigger systematic debugging");

    // 3. Testing prompt should trigger TDD
    const testMatches = sm.getApplicableSkills("Please write a unit test and implement the spec for this new feature");
    const testIds = testMatches.map((s) => s.id);
    assert.ok(testIds.includes("superpowers-tdd"), "Unit test prompt must trigger TDD");

    // 4. Unrelated general query should not trigger specific coding or writing skills
    const generalMatches = sm.getApplicableSkills("What is the distance between Earth and Mars?");
    assert.equal(generalMatches.length, 0, "Unrelated prompt should not trigger filtered skills");
  });

  test("Always Active mode returns all enabled skills regardless of prompt", () => {
    sm.setFilterMode("always_active");

    const matches = sm.getApplicableSkills("What is the distance between Earth and Mars?");
    assert.ok(matches.length >= 6, "In always_active mode, all enabled skills should be considered");

    // Switch back to smart_filter
    sm.setFilterMode("smart_filter");
  });

  test("BuildSkillsPromptSection formats cognitive directives block", () => {
    sm.setFilterMode("smart_filter");
    sm.toggleSkill("humanizer", true);

    const { promptSection, activeSkills } = sm.buildSkillsPromptSection("Rewrite this text to be authentic human writing");
    assert.ok(activeSkills.length > 0);
    assert.ok(promptSection.includes("COGNITIVE REASONING SKILLS & DIRECTIVES"));
    assert.ok(promptSection.includes("HUMANIZER"));
    assert.ok(promptSection.includes("Banned AI Clichés"));

    const emptyRes = sm.buildSkillsPromptSection("What is the distance to the moon?");
    assert.equal(emptyRes.promptSection, "");
    assert.equal(emptyRes.activeSkills.length, 0);
  });

  test("Custom Skill creation, persistence, and deletion", () => {
    const custom = sm.saveSkill({
      name: "Concise Explainer",
      category: "writing_voice",
      description: "Forces short, bulleted explanations with zero filler.",
      triggers: ["explain", "simplify", "teach"],
      promptInstructions: "Always answer in 3 concise bullet points with no intro or conclusion.",
    });

    assert.ok(custom);
    assert.equal(custom.name, "Concise Explainer");
    assert.equal(custom.isBuiltin, false);
    assert.ok(sm.getSkill(custom.id));

    // Test that the custom skill triggers
    const matches = sm.getApplicableSkills("Can you explain how async/await works?");
    const matchIds = matches.map((s) => s.id);
    assert.ok(matchIds.includes(custom.id), "Custom skill should trigger on 'explain'");

    // Delete custom skill
    const deleted = sm.deleteSkill(custom.id);
    assert.equal(deleted, true);
    assert.equal(sm.getSkill(custom.id), undefined);
  });

  test("Cannot delete built-in skills", () => {
    assert.throws(
      () => {
        sm.deleteSkill("humanizer");
      },
      /Built-in engine skills cannot be deleted/,
      "Deleting built-in skill must throw error"
    );
  });

  test("Import and Export SKILL.md format", () => {
    const sampleSkillMd = `---
name: "API Spec Designer"
id: "api-spec-designer"
category: "architecture_planning"
description: "Generates strict OpenAPI 3.1 REST contracts"
triggers: "api, endpoint, openapi, rest, schema"
always_active: false
---

# API Spec Designer

> Generates strict OpenAPI 3.1 REST contracts

### Directives:
1. Always specify HTTP status codes 200, 400, 401, 404, 500.
2. Provide JSON schema for request and response payloads.
3. Document authentication headers explicitly.
`;

    const imported = sm.importSkillFromMarkdown(sampleSkillMd, "api-spec.skill.md");
    assert.ok(imported);
    assert.equal(imported.id, "api-spec-designer");
    assert.equal(imported.name, "API Spec Designer");
    assert.ok(imported.triggers.includes("api"));
    assert.ok(imported.promptInstructions.includes("OpenAPI 3.1"));

    // Export test
    const exported = sm.exportSkill("api-spec-designer");
    assert.ok(exported);
    assert.ok(exported.markdown.includes('name: "API Spec Designer"'));
    assert.ok(exported.markdown.includes("OpenAPI 3.1"));

    // Clean up
    sm.deleteSkill("api-spec-designer");
  });

  test("Triggered skills extraction for Chat & Ledger display", () => {
    const sm = SkillsManager.getInstance();
    sm.setFilterMode("smart_filter");

    // Writing trigger
    const writingSkills = sm.getApplicableSkills("Please write and humanize this blog post draft");
    assert.ok(writingSkills.some((s) => s.id === "humanizer"));

    // Debugging trigger
    const debugSkills = sm.getApplicableSkills("Fix this crash error: stack trace null pointer exception");
    assert.ok(debugSkills.some((s) => s.id === "superpowers-debugging"));

    // Multi-skill trigger
    const multiSkills = sm.getApplicableSkills("Write unit tests and verify facts for this code review");
    assert.ok(multiSkills.length >= 2);
    const names = multiSkills.map((s) => s.name);
    assert.ok(names.some((n) => n.includes("Test-Driven") || n.includes("Verification") || n.includes("Code Review")));
  });
});
