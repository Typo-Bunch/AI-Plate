/**
 * Kokoro Text-to-Speech (TTS) Plugin — Local Neural Speech Synthesis.
 *
 * Tools:
 *   1. `speak_text`        — Convert any text or message into natural spoken audio via Kokoro ONNX.
 *   2. `list_tts_voices`   — List all available neural voice profiles and accents.
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
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

    if (!result.success || !result.audioPath) {
      return { error: result.error || "Speech synthesis failed." };
    }

    const cleanSpoken = tts.sanitizeTextForSpeech(text);

    // Copy to persistent artifacts directory so it appears in the artifacts gallery
    const artifactsDir = resolve(process.env.AIPLATE_USERDATA || process.cwd(), "artifacts");
    if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });

    let destFilename = (args.output_filename as string)?.trim();
    if (!destFilename) {
      destFilename = result.audioPath.split(/[/\\]/).pop() || `speech_${Date.now()}.wav`;
    }
    if (!destFilename.endsWith(".wav")) destFilename += ".wav";

    const artifactPath = join(artifactsDir, destFilename);
    copyFileSync(result.audioPath, artifactPath);

    const audioUrl = `/api/artifacts/file?name=${encodeURIComponent(destFilename)}`;
    const durationStr = result.duration ? `${result.duration.toFixed(1)}s` : "Audio";

    const cardHtml = `
      <div class="plugin-custom-card tts-audio-card" style="border: 1px solid rgba(139, 92, 246, 0.4); background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.05) 100%); padding: 14px 16px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 22px;">🔊</span>
            <div>
              <div style="font-weight: 700; font-size: 13.5px; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                Kokoro Speech Synthesis
                <span style="font-size: 10px; padding: 2px 7px; background: rgba(139, 92, 246, 0.2); color: #a78bfa; border-radius: 10px; font-weight: 700;">
                  ${voice}
                </span>
              </div>
              <div style="font-size: 11px; color: var(--text-dim);">
                24kHz Studio Audio • ${durationStr}
              </div>
            </div>
          </div>
          <a href="${audioUrl}" download="${destFilename}" class="btn btn-secondary btn-xs" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Download WAV audio file">
            ⬇ Download
          </a>
        </div>
        <audio controls src="${audioUrl}" style="width: 100%; height: 38px; border-radius: 8px; outline: none; margin-top: 4px;"></audio>
        <div style="font-size: 11.5px; color: var(--text-muted); font-style: italic; line-height: 1.4; background: rgba(0,0,0,0.15); padding: 8px 10px; border-radius: 6px;">
          "${cleanSpoken.length > 220 ? cleanSpoken.slice(0, 220) + "..." : cleanSpoken}"
        </div>
      </div>
    `;

    return {
      ui_type: "card",
      html: cardHtml,
      success: true,
      message: `Speech synthesized successfully using voice "${voice}".`,
      audioFile: artifactPath,
      filename: destFilename,
      durationSeconds: result.duration ? Math.round(result.duration * 10) / 10 : 0,
      sampleRate: result.sampleRate || 24000,
      elapsedMs: result.elapsedMs,
      spokenText: cleanSpoken,
      audioUrl,
    };
  } catch (err: any) {
    return { error: `Speech synthesis failed: ${err.message || String(err)}` };
  }
};

const speakSchema: ToolSchema = {
  name: "speak_text",
  description:
    "Generate, synthesize, or speak neural audio using local Kokoro-v1.0 ONNX. " +
    "Use this tool whenever the user asks to generate audio, speak words, produce voiceover narration, or synthesize speech. " +
    "Outputs a studio-quality 24kHz WAV audio deliverable with an in-chat playable audio card.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text or script to synthesize into spoken audio.",
      },
      voice: {
        type: "string",
        description:
          "Voice ID to use. Options include: 'af_heart' (default, American Female), " +
          "'af_bella', 'af_nicole', 'af_sky', 'am_adam' (American Male), 'am_michael', 'am_santa' (Santa Claus voice), " +
          "'bf_emma' (British Female), 'bf_isabella', 'bm_george' (British Male).",
      },
      speed: {
        type: "number",
        description: "Speech rate multiplier from 0.5 to 2.0 (default: 1.0).",
      },
      output_filename: {
        type: "string",
        description: "Optional filename for the output WAV file (e.g. 'speech.wav', 'narration.wav').",
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
