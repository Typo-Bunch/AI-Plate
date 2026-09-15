import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TTSService } from "../core/tts-service.js";
import { ttsPlugin } from "../plugins/tools/tts-plugin.js";
import { PluginManager } from "../core/plugin-manager.js";

describe("Kokoro TTS Local Service & Plugin", () => {
  const tts = TTSService.getInstance();
  const pm = PluginManager.getInstance();
  const testAudioFiles: string[] = [];

  after(async () => {
    await tts.shutdown();
    for (const file of testAudioFiles) {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch {}
      }
    }
  });

  test("TTSService should detect availability of Kokoro ONNX model and voices", () => {
    const isAvail = tts.isAvailable();
    const status = tts.getModelStatus();
    assert.equal(isAvail, status.downloaded, "isAvailable should match status.downloaded state");
  });

  test("sanitizeTextForSpeech should clean markdown formatting and replace code blocks", () => {
    const rawMarkdown = `
# System Analysis

Here is the result: **Success** and *optimal performance*.

\`\`\`python
def calculate():
    return 42
\`\`\`

Check the [documentation link](https://example.com/docs).
| Col 1 | Col 2 |
|-------|-------|
| Val 1 | Val 2 |

- Point 1
- Point 2
Use \`config.json\` for settings.
`;

    const cleaned = tts.sanitizeTextForSpeech(rawMarkdown);

    // Should NOT contain raw markdown markers
    assert.ok(!cleaned.includes("```python"), "Fenced code syntax should be stripped");
    assert.ok(cleaned.includes("Code snippet provided in chat"), "Should include friendly code notice");
    assert.ok(!cleaned.includes("# System Analysis"), "Header hash should be stripped");
    assert.ok(!cleaned.includes("**Success**"), "Bold markdown asterisks should be stripped");
    assert.ok(cleaned.includes("Success"), "Inner bold text should be preserved");
    assert.ok(!cleaned.includes("[documentation link]"), "Markdown link syntax should be stripped");
    assert.ok(cleaned.includes("documentation link"), "Link label should be retained");
    assert.ok(!cleaned.includes("| Col 1 |"), "Tables should be stripped");
    assert.ok(!cleaned.includes("`config.json`"), "Inline code backticks should be stripped");
    assert.ok(cleaned.includes("config.json"), "Inline code content should be retained");
  });

  test("sanitizeTextForSpeech should translate mathematical LaTeX formulas into human-readable spoken phrases", () => {
    const rawWithLatex = "Einstein's famous formula $E = mc^2$ and Euler's formula $e^{i\\pi} + 1 = 0$, plus fraction $\\frac{1}{2}$ and roots $\\sqrt{x}$.";
    const cleaned = tts.sanitizeTextForSpeech(rawWithLatex);

    assert.ok(cleaned.includes("equals"), "Should pronounce equals");
    assert.ok(cleaned.includes("squared"), "Should pronounce squared");
    assert.ok(cleaned.includes("one half"), "Should pronounce one half");
    assert.ok(cleaned.includes("square root of x"), "Should pronounce square root of x");
    assert.ok(!cleaned.includes("\\frac"), "LaTeX commands should not remain");
    assert.ok(!cleaned.includes("\\sqrt"), "LaTeX commands should not remain");
  });

  test("getVoices should return available Kokoro voice profiles", async () => {
    const voices = await tts.getVoices();
    assert.ok(Array.isArray(voices), "Voices should be an array");
    assert.ok(voices.length > 5, "Should have multiple voice profiles");

    const voiceIds = voices.map((v) => v.id);
    assert.ok(voiceIds.includes("af_heart"), "af_heart (American Female) should be available");
    assert.ok(voiceIds.includes("am_adam"), "am_adam (American Male) should be available");

    const heart = voices.find((v) => v.id === "af_heart");
    assert.ok(heart, "Heart profile should exist");
    assert.equal(heart?.gender, "female");
    assert.equal(heart?.accent, "American");
  });

  test("synthesize should generate audio if models downloaded or return clear missing model error", async () => {
    const isAvail = tts.isAvailable();
    const text = "Testing Kokoro local neural text to speech in AI Plate.";
    const result = await tts.synthesize(text, {
      voice: "af_heart",
      speed: 1.0,
      returnBase64: true,
    });

    if (isAvail) {
      assert.equal(result.success, true, `Synthesis failed: ${result.error}`);
      assert.ok(result.audioPath, "audioPath should be returned");
      if (result.audioPath) testAudioFiles.push(result.audioPath);
      assert.ok(fs.existsSync(result.audioPath!), "WAV audio file must exist on disk");
      assert.ok(result.duration! > 0.5, `Duration should be > 0.5s, got ${result.duration}`);
      assert.equal(result.sampleRate, 24000, "Kokoro native sample rate should be 24000Hz");
      assert.ok(result.audioBase64 && result.audioBase64.length > 1000, "audioBase64 payload should be populated");
    } else {
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("not found") || result.error?.includes("Download"), "Should return helpful download message");
    }
  });

  test("PluginManager should register ttsPlugin and execute tools", async () => {
    pm.registerPlugin(ttsPlugin);

    // 1. List voices tool
    const voicesResult = await pm.executeTool("list_tts_voices", {});
    const voicesObj: any = voicesResult.response;
    assert.equal(voicesObj.success, true);
    assert.equal(voicesObj.defaultVoice, "af_heart");
    assert.ok(voicesObj.totalVoices > 0);

    // 2. Speak text tool
    const isAvail = tts.isAvailable();
    const speakResult = await pm.executeTool("speak_text", {
      text: "Hello from AI Plate Kokoro built-in plugin!",
      voice: "af_heart",
      speed: 1.0,
    });
    const speakObj: any = speakResult.response;
    if (isAvail) {
      assert.equal(speakObj.success, true);
      assert.ok(speakObj.audioFile, "Should return audioFile path");
      if (speakObj.audioFile) testAudioFiles.push(speakObj.audioFile);
      assert.ok(fs.existsSync(speakObj.audioFile), "Generated audio file must exist");
      assert.ok(speakObj.durationSeconds > 0, "Duration should be positive");
    } else {
      assert.ok(speakObj.error, "Should return error when model is not available");
    }
  });

  test("TTSService getModelStatus should return valid model file information", () => {
    const status = tts.getModelStatus();
    assert.equal(typeof status.downloaded, "boolean");
    assert.equal(typeof status.available, "boolean");
    assert.equal(typeof status.isDownloading, "boolean");
    if (status.downloaded) {
      assert.ok(status.modelPath, "Model path should be set if downloaded");
      assert.ok(status.voicesPath, "Voices path should be set if downloaded");
      assert.ok(status.totalSizeBytes > 0, "Total size should be greater than 0");
    }
  });

  test("Disabling TTS plugin should block tool execution", async () => {
    pm.setPluginEnabled("tts", false);
    assert.equal(pm.isPluginEnabled("tts"), false, "TTS plugin should be disabled");

    const result = await pm.executeTool("speak_text", { text: "This should fail" });
    const resObj: any = result.response;
    assert.ok(resObj.error, "Execution should return an error when plugin is disabled");
    assert.ok(resObj.error.includes("DISABLED"), "Error message should mention plugin is disabled");

    // Re-enable for subsequent usage
    pm.setPluginEnabled("tts", true);
    assert.equal(pm.isPluginEnabled("tts"), true, "TTS plugin should be re-enabled");
  });

  test("TTSService unload should shut down the worker", async () => {
    await tts.unload();
    assert.equal(tts.isWorkerRunning, false, "Worker should not be running after unload");
  });
});
