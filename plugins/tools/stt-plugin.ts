/**
 * Moonshine Speech-to-Text (STT) Plugin — Local Neural Speech Recognition.
 *
 * Tools:
 *   1. `transcribe_audio`  — Convert spoken speech audio (file or base64 WAV) into text using local Moonshine ONNX.
 *   2. `get_stt_status`    — Inspect Moonshine STT model status, active variant, and latency profile.
 */

import { STTService } from "../../core/stt-service.js";
import type { ToolHandler, ToolPlugin, ToolSchema } from "../../core/types.js";

// ─── Tool: transcribe_audio ──────────────────────────────────────────

const transcribeHandler: ToolHandler = async (args) => {
  const audioData = (args.audioBase64 as string) || (args.audioFile as string);
  const model = (args.model as "moonshine/tiny" | "moonshine/base") || "moonshine/tiny";

  if (!audioData) {
    return { error: "Provide either 'audioBase64' or 'audioFile' to transcribe." };
  }

  const stt = STTService.getInstance();
  if (!stt.isAvailable()) {
    return {
      error: "Moonshine STT engine is not available. Please download the Moonshine model in Plugins & Tools > Moonshine STT.",
    };
  }

  try {
    const result = await stt.transcribe(audioData, { model });
    if (!result.success) {
      return { error: result.error || "Speech transcription failed." };
    }

    return {
      success: true,
      text: result.text,
      durationSeconds: result.duration,
      elapsedMs: result.elapsedMs,
      model: result.model,
    };
  } catch (err: any) {
    return { error: `Transcription failed: ${err.message || String(err)}` };
  }
};

const transcribeSchema: ToolSchema = {
  name: "transcribe_audio",
  description:
    "Transcribe spoken speech audio into text using local Moonshine ONNX model. " +
    "Processes variable-length audio with dynamic duration and zero 30-second padding overhead.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      audioBase64: {
        type: "string",
        description: "Base64-encoded audio data (WAV format, 16kHz mono recommended).",
      },
      audioFile: {
        type: "string",
        description: "Path to a local audio file to transcribe.",
      },
      model: {
        type: "string",
        enum: ["moonshine/tiny", "moonshine/base"],
        description: "Moonshine model variant. 'moonshine/tiny' (~27MB, ultra-fast) or 'moonshine/base' (~65MB).",
      },
    },
  },
};

// ─── Tool: get_stt_status ───────────────────────────────────────────

const statusHandler: ToolHandler = async () => {
  const stt = STTService.getInstance();
  const status = stt.getModelStatus();
  return {
    success: true,
    available: stt.isAvailable(),
    downloaded: status.downloaded,
    activeModel: status.activeModel,
    totalSizeBytes: status.totalSizeBytes,
    engine: "useful-moonshine-onnx",
  };
};

const statusSchema: ToolSchema = {
  name: "get_stt_status",
  description: "Check availability and model cache status for the local Moonshine STT engine.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
  },
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const sttPlugin: ToolPlugin = {
  id: "stt",
  name: "Moonshine Speech-to-Text (STT)",
  description:
    "Local ultra-fast speech recognition powered by Moonshine ONNX. " +
    "Transcribe microphone voice input directly on-device with zero latency and zero cloud dependency.",
  icon: "🎙️",

  register(registerTool) {
    registerTool(transcribeSchema, transcribeHandler);
    registerTool(statusSchema, statusHandler);
  },
};
