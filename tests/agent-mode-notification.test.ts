import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

describe("Agent Mode Notification & Confirmation Flow", () => {
  // Extract and evaluate the intent detector from ui/app.js
  const appJsPath = path.resolve(process.cwd(), "ui/app.js");
  const appJsContent = fs.readFileSync(appJsPath, "utf8");

  // Create isolated context with mock DOM
  const sandbox: Record<string, any> = {
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    window: {
      addEventListener: () => {},
      electronAPI: {
        sessions: {
          setMode: async () => ({ success: true }),
        },
      },
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    console,
  };
  vm.createContext(sandbox);

  // Extract detectImplementationOrExecutionIntent function definition
  const match = appJsContent.match(/function detectImplementationOrExecutionIntent\([\s\S]*?\n\}/);
  assert.ok(match, "detectImplementationOrExecutionIntent function must exist in ui/app.js");
  vm.runInContext(match[0], sandbox);
  const detectImplementationOrExecutionIntent = sandbox.detectImplementationOrExecutionIntent;

  describe("detectImplementationOrExecutionIntent", () => {
    it("should detect implementation requests", () => {
      const positiveImplementations = [
        "implement user authentication",
        "can you implement a login page",
        "please write a python script to parse csv",
        "create a new component for the header",
        "build an express api with routes",
        "fix the bug in server.ts",
        "edit style.css to change the background to black",
        "add a dark mode toggle button",
        "update package.json with the new version",
        "refactor the user service",
        "scaffold a new React dashboard",
        "debug the crash on line 42",
        "patch the security issue in auth router",
        "implement the plan",
        "write code to calculate prime numbers",
        "create a new git branch named feature-xyz",
      ];

      for (const prompt of positiveImplementations) {
        assert.equal(
          detectImplementationOrExecutionIntent(prompt),
          true,
          `Expected "${prompt}" to be detected as implementation intent`
        );
      }
    });

    it("should detect execution and command requests", () => {
      const positiveExecutions = [
        "run npm test",
        "execute this python script",
        "run the dev server",
        "npm install axios",
        'git commit -m "update"',
        "python script.py",
        "run this code",
        "execute the following command",
        "npm start",
        "pnpm test",
        "yarn build",
        "npx tsc --noEmit",
        "run in terminal",
        "execute query",
      ];

      for (const prompt of positiveExecutions) {
        assert.equal(
          detectImplementationOrExecutionIntent(prompt),
          true,
          `Expected "${prompt}" to be detected as execution intent`
        );
      }
    });

    it("should NOT trigger for pure conversational questions and explanations", () => {
      const pureInformational = [
        "Hello, how are you?",
        "What is a closure in JavaScript?",
        "Can you explain how Dijkstra algorithm works?",
        "Why does Python use GIL?",
        "What does the word implement mean?",
        "Tell me about React hooks",
        "Summarize this document",
        "What is the difference between npm and yarn?",
        "What are the best practices for clean code?",
      ];

      for (const prompt of pureInformational) {
        assert.equal(
          detectImplementationOrExecutionIntent(prompt),
          false,
          `Expected "${prompt}" to NOT be detected as implementation/execution intent`
        );
      }
    });

    it("should handle empty, null, or invalid inputs safely", () => {
      assert.equal(detectImplementationOrExecutionIntent(""), false);
      assert.equal(detectImplementationOrExecutionIntent("   "), false);
      assert.equal(detectImplementationOrExecutionIntent(null), false);
      assert.equal(detectImplementationOrExecutionIntent(undefined), false);
      assert.equal(detectImplementationOrExecutionIntent(123), false);
    });
  });

  describe("UI Elements and Markup", () => {
    it("ui/index.html includes mode suggestion pill and confirm secondary button", () => {
      const indexHtml = fs.readFileSync(path.resolve(process.cwd(), "ui/index.html"), "utf8");
      assert.ok(indexHtml.includes('id="mode-suggestion-pill"'), "mode-suggestion-pill must exist");
      assert.ok(indexHtml.includes('id="btn-switch-agent-suggestion"'), "btn-switch-agent-suggestion must exist");
      assert.ok(indexHtml.includes('id="btn-dismiss-agent-suggestion"'), "btn-dismiss-agent-suggestion must exist");
      assert.ok(indexHtml.includes('id="confirm-btn-secondary"'), "confirm-btn-secondary must exist");
    });

    it("ui/style.css includes styles for mode suggestion pill and secondary confirm button", () => {
      const styleCss = fs.readFileSync(path.resolve(process.cwd(), "ui/style.css"), "utf8");
      assert.ok(styleCss.includes(".mode-suggestion-pill"), ".mode-suggestion-pill CSS must exist");
      assert.ok(styleCss.includes(".confirm-btn-secondary"), ".confirm-btn-secondary CSS must exist");
    });

    it("ui/app.js handles mode confirmation before message submission", () => {
      assert.ok(
        appJsContent.includes("detectImplementationOrExecutionIntent(userText)"),
        "sendMessage must invoke intent detection"
      );
      assert.ok(
        appJsContent.includes('await saveChatMode(thisSessionId, "code")'),
        "Confirmation must switch session mode to code/agent"
      );
      assert.ok(
        appJsContent.includes("showToast"),
        "Must notify user when switching to agent mode"
      );
    });

    it("ui/app.js opens Models & Reasoning settings tab when clicking active provider & embedding", () => {
      assert.ok(
        appJsContent.includes('openSettingsModal("tab-settings-models")'),
        "Must open tab-settings-models directly on provider pill or model badge click"
      );
      assert.ok(
        appJsContent.includes('sidebarProviderPill.addEventListener("click"'),
        "sidebarProviderPill must have a click listener"
      );
      assert.ok(
        appJsContent.includes('modelBadge.addEventListener("click"'),
        "modelBadge must have a click listener"
      );
    });
  });
});

