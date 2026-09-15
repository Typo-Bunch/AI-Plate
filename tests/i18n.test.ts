/**
 * Client-side i18n Localization Engine Tests.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

describe("Client-side i18n Engine", () => {
  const i18nPath = resolve(process.cwd(), "ui/i18n.js");
  const i18nCode = readFileSync(i18nPath, "utf-8");

  test("ui/i18n.js parses and executes without syntax errors", () => {
    assert.ok(i18nCode.length > 500, "i18n.js should contain translation definitions");
    assert.doesNotThrow(() => {
      new vm.Script(i18nCode);
    }, "Script should be syntactically valid JavaScript");
  });

  test("Provides all 10 supported languages with complete keys", () => {
    // Mock minimal DOM environment for vm
    const mockStorage: Record<string, string> = {};
    const mockElements: Record<string, any> = {};

    const mockDocument = {
      documentElement: { lang: "en", setAttribute: (k: string, v: string) => {} },
      querySelectorAll: (sel: string) => [],
      querySelector: (sel: string) => null,
      getElementById: (id: string) => null,
      addEventListener: (ev: string, cb: Function) => {},
    };

    const mockWindow: any = {
      localStorage: {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
      },
      document: mockDocument,
      dispatchEvent: () => {},
      CustomEvent: class { constructor(public name: string, public opts: any) {} },
    };

    const context = vm.createContext({
      window: mockWindow,
      document: mockDocument,
      localStorage: mockWindow.localStorage,
    });

    const script = new vm.Script(i18nCode);
    script.runInContext(context);

    assert.ok(context.window.AIPlateI18n, "window.AIPlateI18n should be exposed");
    const supportedLangs = context.window.AIPlateI18n.getSupportedLanguages();
    const expectedLangs = ["en", "es", "fr", "de", "hi", "ja", "zh", "pt", "ru", "ar"];

    for (const el of expectedLangs) {
      assert.ok(supportedLangs.includes(el), `Supported languages must include '${el}'`);
    }

    // Verify key translations exist for each language
    for (const el of expectedLangs) {
      const chatNav = context.window.AIPlateI18n.t("nav.chat", el);
      assert.ok(chatNav, `nav.chat translation must exist for '${el}'`);

      const generalTitle = context.window.AIPlateI18n.t("general.card_butler", el);
      assert.ok(generalTitle, `general.card_butler translation must exist for '${el}'`);
    }
  });
});
