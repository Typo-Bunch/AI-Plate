/**
 * Kokoro Text-to-Speech (TTS) Plugin — Local Neural Speech Synthesis.
 *
 * Tools:
 *   1. `speak_text`        — Convert any text or message into natural spoken audio via Kokoro ONNX.
 *   2. `list_tts_voices`   — List all available neural voice profiles and accents.
 */

import { TTSService } from "../../core/tts-service.js";
import type { ToolHandler, ToolPlugin, ToolSchema } from "../../core/types.js";

// ─── Tool: speak_text ──────────────────────────────────────────────

const speakHandler: ToolHandler = async (args) => {
  const text = (args.text as string)?.trim();
  const voice = (args.voice as string)?.trim() || "af_heart";
  const speed = typeof args.speed === "number" ? args.speed : 1.0;

  if (!text) {
    return { error: "Provide 'text' to speak." };
  }

  const tts = TTSService.getInstance();
  if (!tts.isAvailable()) {
    return {
      error: "Kokoro TTS engine is not available. Please download the Kokoro model files on-demand in Plugins & Tools > Kokoro TTS.",
    };
  }

  try {
    const result = await tts.synthesize(text, { voice, speed });

    if (!result.success) {
      return { error: result.error || "Speech synthesis failed." };
    }

    const cleanSpoken = tts.sanitizeTextForSpeech(text);

    return {
      success: true,
      message: `Speech synthesized successfully using voice "${voice}".`,
      audioFile: result.audioPath,
      durationSeconds: result.duration ? Math.round(result.duration * 10) / 10 : 0,
      sampleRate: result.sampleRate || 24000,
      elapsedMs: result.elapsedMs,
      spokenText: cleanSpoken.length > 200 ? cleanSpoken.slice(0, 200) + "..." : cleanSpoken,
      audioUrl: result.audioPath ? `/api/sandbox/file?name=${encodeURIComponent(result.audioPath.split(/[/\\]/).pop() || "")}` : undefined,
    };
  } catch (err: any) {
    return { error: `Speech synthesis failed: ${err.message || String(err)}` };
  }
};

const speakSchema: ToolSchema = {
  name: "speak_text",
  description:
    "Convert text into natural sounding neural speech audio using local Kokoro-v1.0 ONNX. " +
    "Generates a 24kHz studio-quality WAV audio file. Markdown formatting and code blocks " +
    "are automatically sanitized so they sound natural when read aloud.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to synthesize into spoken audio.",
      },
      voice: {
        type: "string",
        description:
          "Voice ID to use. Options include: 'af_heart' (default, American Female), " +
          "'af_bella', 'af_nicole', 'af_sky', 'am_adam' (American Male), 'am_michael', " +
          "'bf_emma' (British Female), 'bf_isabella', 'bm_george' (British Male).",
      },
      speed: {
        type: "number",
        description: "Speech rate multiplier from 0.5 to 2.0 (default: 1.0).",
      },
    },
    required: ["text"],
  },
};

// ─── Tool: list_tts_voices ──────────────────────────────────────────

const listVoicesHandler: ToolHandler = async () => {
  const tts = TTSService.getInstance();
  try {
    const voices = await tts.getVoices();
    return {
      success: true,
      totalVoices: voices.length,
      defaultVoice: "af_heart",
      recommended: [
        { id: "af_heart", name: "Heart (American Female) — Best quality general narration" },
        { id: "af_bella", name: "Bella (American Female) — Clear & expressive" },
        { id: "am_adam", name: "Adam (American Male) — Deep & clear" },
        { id: "am_michael", name: "Michael (American Male) — Professional & steady" },
        { id: "bf_emma", name: "Emma (British Female) — Elegant British accent" },
        { id: "bm_george", name: "George (British Male) — Formal British accent" },
      ],
      allVoices: voices,
    };
  } catch (err: any) {
    return { error: `Failed to list voices: ${err.message || String(err)}` };
  }
};

const listVoicesSchema: ToolSchema = {
  name: "list_tts_voices",
  description:
    "List all available neural voice profiles and accents supported by the local Kokoro TTS engine.",
  parametersJsonSchema: {
    type: "object",
    properties: {},
  },
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const ttsPlugin: ToolPlugin = {
  id: "tts",
  name: "Kokoro Text-to-Speech (TTS)",
  description:
    "Local 24kHz neural text-to-speech engine powered by Kokoro ONNX. " +
    "Synthesize speech from LLM responses with zero latency and natural cadence.",
  icon: "🔊",

  register(registerTool) {
    registerTool(speakSchema, speakHandler);
    registerTool(listVoicesSchema, listVoicesHandler);
  },
};
