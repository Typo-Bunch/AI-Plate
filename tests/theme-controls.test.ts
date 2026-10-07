import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../ui/app.js", import.meta.url), "utf8");
const formSource = source.slice(
  source.indexOf("  const buildGenericPluginControlsHtml ="),
  source.indexOf("  const createPluginCardElement ="),
);
const paletteSource = source.slice(
  source.indexOf("window.THEME_PALETTES ="),
  source.indexOf("window.ICON_PRESET_PALETTES ="),
);
const storageKey = "ai_plate_plugin_params_minimalist_ui_theme_apply_theme";

function render(saved: Record<string, unknown> = {}, custom: Record<string, unknown> = {}) {
  const storage = new Map([
    [storageKey, JSON.stringify(saved)],
    ["ai_plate_custom_presets", JSON.stringify(custom)],
  ]);
  const context = vm.createContext({
    window: {},
    localStorage: { getItem: (key: string) => storage.get(key) || null },
    escapeHtmlStr: (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
  });
  // Execute the actual renderer and palette definitions, without starting the app.
  vm.runInContext(paletteSource + formSource, context);
  const plugin = {
    id: "minimalist_ui_theme", category: "theme", tools: [{
      name: "apply_theme", parameters: {
        properties: {
          preset: { type: "string", enum: ["nordic-dark", "paper-light", "plugin-only"], default: "nordic-dark" },
          font_family: { type: "string", enum: ["Plus Jakarta Sans", "Playfair Display"] },
          bg_image: { type: "string", default: "none" },
          accent_color: { type: "string" },
          bg_app_color: { type: "string" },
          bg_card_color: { type: "string" },
          text_main_color: { type: "string" },
          border_color: { type: "string" },
          extra_color: { type: "string" },
        }, required: [],
      },
    }],
  };
  context.plugin = plugin;
  const html: string = vm.runInContext("buildGenericPluginControlsHtml(plugin)", context);
  return { html, context, storage };
}

function inputValue(html: string, key: string) {
  return html.match(new RegExp(`<input[^>]*data-param="${key}"[^>]*value="([^"]*)"`))?.[1];
}

test("fresh theme controls inherit distinct preset colors before choosing a wallpaper", () => {
  const { html } = render();
  assert.equal(inputValue(html, "accent_color"), "#6366f1");
  assert.equal(inputValue(html, "bg_app_color"), "#0c0e14");
  assert.equal(inputValue(html, "bg_card_color"), "#151924");
  assert.equal(inputValue(html, "text_main_color"), "#f1f5f9");
  assert.equal(inputValue(html, "border_color"), "#26262e");
  assert.equal(inputValue(html, "extra_color"), "");
});

test("saved edits win while missing fields inherit the selected light preset", () => {
  const { html } = render({ preset: "paper-light", accent_color: "#123456", border_color: "" });
  assert.equal(inputValue(html, "accent_color"), "#123456");
  assert.equal(inputValue(html, "bg_app_color"), "#fbfbfb");
  assert.equal(inputValue(html, "text_main_color"), "#111827");
  assert.equal(inputValue(html, "border_color"), "");
  assert.match(html, /value="Playfair Display" selected/);
});

test("custom presets provide initial colors and preserve saved overrides", () => {
  const { html } = render({ preset: "custom:Warm", accent_color: "#abcdef" }, {
    Warm: { bg_app_color: "#302010", accent_color: "#ff9900" },
  });
  assert.equal(inputValue(html, "bg_app_color"), "#302010");
  assert.equal(inputValue(html, "accent_color"), "#abcdef");
  assert.equal(inputValue(html, "text_main_color"), "");
});

test("unknown plugin palettes leave colors and typography to the plugin", () => {
  const { html } = render({ preset: "plugin-only" });
  assert.equal(inputValue(html, "bg_app_color"), "");
  assert.equal(inputValue(html, "text_main_color"), "");
  assert.match(html, /data-param="font_family"[^>]*>\s*<option value="" selected>Use default/);
});

test("applying a wallpaper sends preset colors and omits blank color overrides", async () => {
  const { html } = render();
  const inputs = [...html.matchAll(/<input\b[^>]*data-param="([^"]+)"[^>]*>/g)].map(([tag, key]) => ({
    type: "text",
    value: key === "bg_image" ? "C:\\Pictures\\wallpaper.jpg" : inputValue(html, key) || "",
    dataset: { omitEmpty: tag.match(/data-omit-empty="([^"]+)"/)?.[1] },
    classList: { contains: (name: string) => key === "bg_image" && name === "plugin-param-image-input" },
    getAttribute: () => key,
  }));
  const form = { querySelectorAll: () => inputs };
  let click: (event: unknown) => Promise<void>;
  let submitted: Record<string, unknown> = {};
  const btn = {
    innerHTML: "Apply", disabled: false,
    getAttribute: (key: string) => key === "data-tool-name" ? "apply_theme" : "minimalist_ui_theme",
    closest: () => form,
    addEventListener: (_event: string, callback: typeof click) => { click = callback; },
  };
  const context = vm.createContext({
    card: { querySelectorAll: () => [btn] },
    localStorage: { setItem: () => {} },
    fetch: async (_url: string, options: { body: string }) => {
      submitted = JSON.parse(options.body).args;
      return { json: async () => ({ success: true, result: {} }) };
    },
    showPluginToast: () => {},
  });
  vm.runInContext(source.slice(
    source.indexOf("    // Wire live tool execution buttons"),
    source.indexOf("    // Wire reset theme button if present"),
  ), context);
  await click!({ stopPropagation() {} });
  assert.equal(submitted.bg_app_color, "#0c0e14");
  assert.equal(submitted.text_main_color, "#f1f5f9");
  assert.equal(submitted.bg_image, "/api/media?name=C%3A%5CPictures%5Cwallpaper.jpg");
  assert.equal(Object.hasOwn(submitted, "extra_color"), false);
});

test("reset removes saved blue overrides so reopening restores preset colors", () => {
  const { context, storage } = render({ bg_app_color: "#6366f1", text_main_color: "#6366f1" });
  const form = {
    getAttribute: (key: string) => key === "data-tool-name" ? "apply_theme" : "minimalist_ui_theme",
    querySelector: () => null,
  };
  context.document = {
    getElementById: () => null,
    documentElement: { style: { removeProperty() {} } },
    querySelectorAll: (selector: string) => selector === ".plugin-tool-form" ? [form] : [],
  };
  context.localStorage.removeItem = (key: string) => storage.delete(key);
  context.syncTitleBarTheme = () => {};
  vm.runInContext(source.slice(
    source.indexOf("window.resetDynamicTheme = function"),
    source.indexOf("// Backward-compatibility alias"),
  ), context);
  vm.runInContext("window.resetDynamicTheme(false)", context);
  assert.equal(storage.has(storageKey), false);
  const reopened: string = vm.runInContext("buildGenericPluginControlsHtml(plugin)", context);
  assert.equal(inputValue(reopened, "bg_app_color"), "#0c0e14");
  assert.equal(inputValue(reopened, "text_main_color"), "#f1f5f9");
});
