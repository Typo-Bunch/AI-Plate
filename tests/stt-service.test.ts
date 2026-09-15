import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { STTService } from "../core/stt-service.js";

describe("Moonshine STT Local Service Subsystem", () => {
  const stt = STTService.getInstance();

  after(async () => {
    await stt.shutdown();
  });

  test("STTService should initialize and locate Moonshine worker script", () => {
    stt.resolvePaths();
    const status = stt.getModelStatus();
    assert.ok(status);
    assert.equal(typeof status.downloaded, "boolean");
    assert.equal(typeof status.available, "boolean");
    assert.equal(typeof status.totalSizeBytes, "number");
  });

  test("STTService isAvailable returns boolean reflecting readiness", () => {
    const isAvail = stt.isAvailable();
    assert.equal(typeof isAvail, "boolean");
  });

  test("STTService transcribe processes audio buffer and returns transcription result", async () => {
    // Generate a minimal 1.0 second 16kHz 16-bit mono WAV buffer (silence/beep)
    const sampleRate = 16000;
    const duration = 1.0;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = Buffer.alloc(44 + numSamples * 2);

    // RIFF Header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32); // Block align
    buffer.writeUInt16LE(16, 34); // Bits per sample
    buffer.write("data", 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.1;
      buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
    }

    const result = await stt.transcribe(buffer, { model: "moonshine/tiny" });
    assert.equal(result.success, true, `Transcription failed: ${result.error}`);
    assert.equal(typeof result.text, "string");
    assert.ok(result.duration! >= 0.9, `Duration should be ~1.0s, got ${result.duration}`);
    assert.ok(typeof result.elapsedMs === "number");
    assert.ok(result.elapsedMs! > 0);
  });

  test("STTService unload frees model from memory", async () => {
    const res = await stt.unload();
    assert.equal(res.success, true);
  });

  test("PluginManager should register sttPlugin and execute get_stt_status tool", async () => {
    const { PluginManager } = await import("../core/plugin-manager.js");
    const { sttPlugin } = await import("../plugins/tools/stt-plugin.js");
    const pm = new PluginManager();
    pm.registerPlugin(sttPlugin);

    const statusResult = await pm.executeTool("get_stt_status", {});
    const statusObj: any = statusResult.response || statusResult;
    assert.equal(Boolean(statusObj.success || !statusObj.error), true);
    assert.equal(statusObj.engine, "useful-moonshine-onnx");
    assert.equal(typeof statusObj.available, "boolean");
  });

  test("Disabling STT plugin should block tool execution", async () => {
    const { PluginManager } = await import("../core/plugin-manager.js");
    const { sttPlugin } = await import("../plugins/tools/stt-plugin.js");
    const pm = new PluginManager();
    pm.registerPlugin(sttPlugin);
    pm.setPluginEnabled("stt", false);
    assert.equal(pm.isPluginEnabled("stt"), false);

    const result = await pm.executeTool("get_stt_status", {});
    const resObj: any = result.response;
    assert.ok(resObj.error, "Execution should return an error when plugin is disabled");
    assert.ok(resObj.error.includes("DISABLED"), "Error message should mention plugin is disabled");

    pm.setPluginEnabled("stt", true);
  });
});

