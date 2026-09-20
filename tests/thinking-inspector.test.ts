import { test } from "node:test";
import assert from "node:assert/strict";
import {
  thinkingInspectorPlugin,
  recordReasoningEntry,
  getReasoningHistory,
  clearReasoningHistory,
} from "../plugins/tools/thinking-inspector.js";
import { PluginManager } from "../core/plugin-manager.js";

test("Thinking Inspector Plugin: Full Cognitive & Meta-Reasoning Trace", async () => {
  clearReasoningHistory();
  const pm = PluginManager.getInstance();
  pm.registerPlugin(thinkingInspectorPlugin, true);

  // 1. Advanced Cognitive Trace with hypothesis, alternatives, assumptions, self-correction
  const richResult = await pm.executeTool("record_reasoning_step", {
    thought: "Analyzing audio format compatibility between Kokoro ONNX and browser HTML5 audio element.",
    cognitive_stage: "alternatives",
    confidence: "high",
    confidence_rationale: "WAV with PCM 24kHz is natively supported in Chromium and Web Audio API.",
    step_number: 1,
    assumptions: [
      "Kokoro output is 24000Hz mono PCM",
      "Chromium audio element can stream local file endpoints",
    ],
    alternatives_considered: [
      {
        option: "Convert WAV to MP3 using ffmpeg",
        evaluated_tradeoff: "Smaller file size but requires ffmpeg binary in PATH",
        discarded_reason: "Avoid external binary dependency on host system",
        selected: false,
      },
      {
        option: "Direct 24kHz WAV streaming from artifacts",
        evaluated_tradeoff: "Slightly larger deliverable but 100% zero-dependency execution",
        selected: true,
      },
    ],
    expected_outcome: "Playable audio player renders in chat with immediate playback",
    action_plan: "invoke speak_text with chosen voice af_heart",
  });

  assert.equal(richResult.response.status, "recorded");
  assert.equal(richResult.response.ui_type, "reasoning_step");
  assert.equal(richResult.response.step, 1);
  assert.equal(richResult.response.cognitive_stage, "alternatives");
  assert.equal(richResult.response.confidence, "high");
  assert.equal(richResult.response.confidence_rationale, "WAV with PCM 24kHz is natively supported in Chromium and Web Audio API.");
  assert.equal(Array.isArray(richResult.response.assumptions), true);
  assert.equal(richResult.response.assumptions.length, 2);
  assert.equal(richResult.response.alternatives_considered.length, 2);
  assert.equal(richResult.response.expected_outcome, "Playable audio player renders in chat with immediate playback");
  assert.equal(richResult.response.action_plan, "invoke speak_text with chosen voice af_heart");

  // 2. Self-Correction Trace
  const selfCorrectionResult = await pm.executeTool("record_thinking", {
    thought: "Previous import of soundfile failed because module was not present.",
    cognitive_stage: "self_correction",
    confidence: "high",
    step_number: 2,
    self_correction: {
      trigger: "ModuleNotFoundError: No module named 'soundfile'",
      previous_hypothesis: "Assumed soundfile was installed in python site-packages",
      pivot_strategy: "Implement dual-layer fallback using Python's standard wave and struct libraries",
    },
    action_plan: "Update kokoro-worker.py with write_audio fallback",
  });

  assert.equal(selfCorrectionResult.response.status, "recorded");
  assert.equal(selfCorrectionResult.response.cognitive_stage, "self_correction");
  assert.equal(typeof selfCorrectionResult.response.self_correction, "object");
  assert.equal(selfCorrectionResult.response.self_correction.trigger, "ModuleNotFoundError: No module named 'soundfile'");

  // 3. Backward compatibility with minimal thought
  const legacyResult = await pm.executeTool("record_reasoning_step", {
    thought: "Simple single-line plan",
  });
  assert.equal(legacyResult.response.status, "recorded");
  assert.equal(legacyResult.response.thought, "Simple single-line plan");
  assert.equal(legacyResult.response.confidence, "high");

  // 4. Verify in-memory reasoning history buffer
  const history = getReasoningHistory();
  assert.equal(history.length >= 3, true);
  const latest = history[history.length - 1];
  assert.equal(latest.thought, "Simple single-line plan");

  clearReasoningHistory();
  assert.equal(getReasoningHistory().length, 0);
});
