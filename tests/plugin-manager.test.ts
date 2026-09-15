import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PluginManager } from "../core/plugin-manager.js";
import { AgentDatabase } from "../core/database.js";

describe("Plugin Manager Subsystem", () => {
  const pm = PluginManager.getInstance();

  test("Manifest Validation for valid manifest", () => {
    const validManifest = {
      id: "test_manifest_plugin",
      name: "Test Manifest Plugin",
      version: "1.0.0",
      description: "A test plugin manifest",
      tools: [
        {
          name: "calculate_sum",
          description: "Calculates the sum of two numbers",
          parameters: {
            type: "object",
            properties: {
              a: { type: "number" },
              b: { type: "number" },
            },
            required: ["a", "b"],
          },
          handler: {
            type: "javascript",
            code: "return { sum: args.a + args.b };",
          },
        },
      ],
    };

    const validation = PluginManager.validateManifest(validManifest);
    assert.equal(validation.valid, true);
    assert.ok(validation.manifest);
  });

  test("Manifest Validation rejects missing required fields", () => {
    const invalidManifest = {
      name: "Missing ID plugin",
    };
    const validation = PluginManager.validateManifest(invalidManifest);
    assert.equal(validation.valid, false);
    assert.ok(validation.error);
  });

  test("Programmatic plugin registration, execution, and toggling", async () => {
    const pluginId = `prog_plugin_${Date.now()}`;
    const toolName = `${pluginId}_multiply`;

    pm.registerPlugin(
      {
        id: pluginId,
        name: "Unit Test Math Plugin",
        description: "Plugin for testing tool registration",
        register: (registerTool) => {
          registerTool(
            {
              name: toolName,
              description: "Multiplies two numbers",
              parameters: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                },
                required: ["x", "y"],
              },
            },
            async (args: any) => {
              return { result: args.x * args.y };
            }
          );
        },
      },
      true
    );

    // Execute tool while enabled
    const resEnabled = await pm.executeTool(toolName, { x: 6, y: 7 });
    assert.equal(resEnabled.error, undefined);
    assert.equal(resEnabled.response.result, 42);

    // Disable plugin
    const disabled = pm.setPluginEnabled(pluginId, false);
    assert.equal(disabled, true);
    assert.equal(pm.isPluginEnabled(pluginId), false);

    // Execute tool while disabled should reject
    const resDisabled = await pm.executeTool(toolName, { x: 6, y: 7 });
    assert.ok(resDisabled.response && resDisabled.response.error);
    assert.ok(resDisabled.response.error.includes("DISABLED"));

    // Re-enable plugin
    pm.setPluginEnabled(pluginId, true);
    const resReenabled = await pm.executeTool(toolName, { x: 3, y: 3 });
    assert.equal(resReenabled.response.result, 9);

    // Teardown: disable and unregister test plugin to prevent state pollution
    pm.setPluginEnabled(pluginId, false);
    const db = AgentDatabase.getInstance();
    const raw = db.getMeta("plugins_enabled_state");
    if (raw) {
      try {
        const state = JSON.parse(raw);
        delete state[pluginId];
        db.setMeta("plugins_enabled_state", JSON.stringify(state));
      } catch {}
    }
  });

  test("Listing plugins and UI extensions", () => {
    const plugins = pm.getPluginsInfo();
    assert.ok(Array.isArray(plugins));
    assert.ok(plugins.length > 0);

    const extensions = pm.getActiveUIExtensions();
    assert.ok(Array.isArray(extensions));
  });

  test("Google Material Icons plugin manifest declares configurable icon categories (including reasoning depth and settings tabs)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const manifestPath = path.resolve(process.cwd(), "plugins", "installed", "google_material_icons.aiplugin.json");
    assert.ok(fs.existsSync(manifestPath), "google_material_icons.aiplugin.json must exist");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const tool = manifest.tools.find((t: any) => t.name === "apply_icon_pack");
    assert.ok(tool, "apply_icon_pack tool must exist");

    const props = tool.parameters.properties;
    const glyphParams = Object.keys(props).filter((k) => k.endsWith("_glyph"));

    // Declared icon categories in parameters (TTS icons are decoupled from icon pack)
    const expectedGlyphs = [
      "history_glyph",
      "chat_glyph",
      "kb_glyph",
      "artifacts_glyph",
      "settings_glyph",
      "send_glyph",
      "new_chat_glyph",
      "tools_glyph",
      "tokens_glyph",
      "reasoning_glyph",
      "settings_models_glyph",
      "settings_plugins_glyph",
      "settings_connectors_glyph",
      "settings_security_glyph",
      "settings_config_glyph",
    ];
    assert.deepEqual(glyphParams.sort(), expectedGlyphs.sort());

    const code = tool.handler.code;

    // Verify handler code styles reasoning depth bar and settings tab icons
    assert.ok(code.includes(".thinking-brain-pulse"), "Handler should style thinking brain pulse");
    assert.ok(code.includes(".thinking-chip"), "Handler should style thinking chips");
    assert.ok(code.includes(".settings-tab-btn"), "Handler should style settings tab buttons");

    // Verify local font caching is implemented and does not override Kokoro TTS
    assert.ok(code.includes("assets/fonts/material-symbols-outlined.woff2"), "Handler should declare local cached woff2 font");
    assert.ok(code.includes("@font-face"), "Handler should declare local @font-face");
    assert.ok(!code.includes(".message-tts-btn"), "TTS icons must not be controlled by google-icon plugin");
  });
});

