#!/usr/bin/env python
"""
Moonshine STT Persistent Worker
Communicates via JSON lines over stdin/stdout.
Maintains model in memory for sub-second speech recognition and auto-unloads when idle.
"""

import sys
import os
import json
import time
import gc
import threading
from pathlib import Path

# Force UTF-8 I/O for Windows console / piped execution
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

moonshine_instance = None
tokenizer_instance = None
current_model_name = "moonshine/tiny"
model_lock = threading.Lock()
last_activity_time = time.time()
IDLE_TIMEOUT_SECONDS = 300  # 5 minutes idle to unload model from RAM

def get_tokenizer():
    global tokenizer_instance
    if tokenizer_instance is None:
        try:
            from moonshine_onnx.transcribe import load_tokenizer
            tokenizer_instance = load_tokenizer()
        except Exception as e:
            sys.stderr.write(f"[Moonshine] Failed to load tokenizer: {e}\n")
            raise
    return tokenizer_instance

def load_audio_fast(audio_path):
    """
    High-performance audio loader.
    Reads 16kHz mono WAV directly via soundfile (sub-millisecond)
    and falls back to librosa if necessary.
    """
    try:
        import soundfile as sf
        import numpy as np

        data, sample_rate = sf.read(audio_path, dtype="float32")
        if data is None or len(data) == 0:
            return None

        # Convert stereo to mono if needed
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)

        # If already 16kHz, return immediately with shape (1, N)
        if sample_rate == 16000:
            return data[None, ...]

        # Resample to 16kHz if not already
        import librosa
        resampled = librosa.resample(data, orig_sr=sample_rate, target_sr=16000)
        return resampled[None, ...]
    except Exception as sf_err:
        # Fallback to standard moonshine load_audio
        try:
            from moonshine_onnx.transcribe import load_audio
            return load_audio(audio_path)
        except Exception as e:
            sys.stderr.write(f"[Moonshine] Failed to load audio {audio_path}: {e}\n")
            raise

def get_moonshine_model(model_name="moonshine/tiny", models_dir=None):
    global moonshine_instance, current_model_name
    with model_lock:
        if moonshine_instance is None or current_model_name != model_name:
            try:
                import moonshine_onnx
                from moonshine_onnx import MoonshineOnnxModel
            except ImportError as ie:
                sys.stderr.write(f"[Moonshine] Missing dependencies: {ie}. Run 'pip install useful-moonshine-onnx soundfile'\n")
                raise RuntimeError(f"Moonshine STT dependencies missing: {ie}. Please install useful-moonshine-onnx and soundfile.")

            appdata = os.getenv("AIPLATE_USERDATA") or (
                os.path.join(os.getenv("APPDATA", ""), "AI Plate") if os.getenv("APPDATA") else None
            )

            # Check potential local models directories
            short_name = model_name.split("/")[-1]
            candidates = [
                models_dir,
                os.path.join(appdata, "models", "moonshine", short_name) if appdata else None,
                os.path.join(PROJECT_ROOT, "models", "moonshine", short_name),
                os.path.join(appdata, "models", "moonshine") if appdata else None,
                os.path.join(PROJECT_ROOT, "models", "moonshine"),
            ]

            resolved_dir = None
            for c in candidates:
                if c and os.path.exists(os.path.join(c, "encoder_model.onnx")) and os.path.exists(os.path.join(c, "decoder_model_merged.onnx")):
                    resolved_dir = c
                    break

            if resolved_dir:
                sys.stderr.write(f"[Moonshine] Loading local ONNX weights from {resolved_dir}\n")
                moonshine_instance = MoonshineOnnxModel(models_dir=resolved_dir, model_name=short_name)
            else:
                sys.stderr.write(f"[Moonshine] Loading ONNX weights for {model_name} via HuggingFace Hub cache\n")
                moonshine_instance = MoonshineOnnxModel(model_name=model_name)

            current_model_name = model_name
            # Warm tokenizer
            get_tokenizer()
            gc.collect()

        return moonshine_instance

def unload_model():
    global moonshine_instance, tokenizer_instance
    with model_lock:
        if moonshine_instance is not None:
            moonshine_instance = None
            tokenizer_instance = None
            gc.collect()
            sys.stderr.write("[Moonshine] Model unloaded from RAM (idle timeout or manual unload).\n")
            return True
        return False

def idle_checker_thread():
    global last_activity_time
    while True:
        time.sleep(15)
        if moonshine_instance is not None:
            idle_sec = time.time() - last_activity_time
            if idle_sec > IDLE_TIMEOUT_SECONDS:
                unload_model()

# Start background thread to watch for idle timeout
t = threading.Thread(target=idle_checker_thread, daemon=True)
t.start()

def process_command(cmd_obj):
    global last_activity_time
    last_activity_time = time.time()
    action = cmd_obj.get("action", "")

    if action == "ping":
        return {"status": "ok", "timestamp": time.time()}

    elif action == "status":
        with model_lock:
            loaded = moonshine_instance is not None
        return {
            "status": "ok",
            "loaded": loaded,
            "model_name": current_model_name,
            "pid": os.getpid(),
        }

    elif action == "unload":
        was_unloaded = unload_model()
        return {"status": "ok", "unloaded": was_unloaded}

    elif action == "load":
        model_name = cmd_obj.get("model", "moonshine/tiny")
        models_dir = cmd_obj.get("models_dir")
        try:
            get_moonshine_model(model_name, models_dir)
            return {"status": "ok", "loaded": True, "model": model_name}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    elif action == "transcribe":
        audio_path = cmd_obj.get("audio_path")
        model_name = cmd_obj.get("model", "moonshine/tiny")
        models_dir = cmd_obj.get("models_dir")

        if not audio_path or not os.path.exists(audio_path):
            return {"status": "error", "error": f"Audio file not found: {audio_path}"}

        start_time = time.time()
        try:
            model = get_moonshine_model(model_name, models_dir)
            tokenizer = get_tokenizer()

            audio = load_audio_fast(audio_path)
            if audio is None or len(audio.shape) != 2 or audio.size == 0:
                return {
                    "status": "ok",
                    "text": "",
                    "duration": 0.0,
                    "elapsed_ms": int((time.time() - start_time) * 1000),
                    "model": model_name,
                }

            num_seconds = float(audio.size) / 16000.0
            if num_seconds < 0.15:
                return {
                    "status": "ok",
                    "text": "",
                    "duration": round(num_seconds, 2),
                    "elapsed_ms": int((time.time() - start_time) * 1000),
                    "model": model_name,
                }

            if num_seconds > 62.0:
                audio = audio[:, :int(60.0 * 16000)]
                num_seconds = 60.0

            import numpy as np
            max_val = float(np.max(np.abs(audio))) if audio.size > 0 else 0.0
            if 0.0001 < max_val < 0.75:
                gain = min(40.0, 0.85 / max_val)
                audio = audio * gain

            tokens = model.generate(audio)
            text_list = tokenizer.decode_batch(tokens)
            text = text_list[0].strip() if text_list else ""

            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "status": "ok",
                "text": text,
                "duration": round(num_seconds, 2),
                "elapsed_ms": elapsed_ms,
                "model": model_name,
            }
        except Exception as e:
            return {"status": "error", "error": f"Transcription error: {str(e)}"}

    else:
        return {"status": "error", "error": f"Unknown action: {action}"}

def main():
    sys.stderr.write(f"[Moonshine Worker] Started (PID: {os.getpid()})\n")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            resp = process_command(cmd)
            if isinstance(resp, dict) and "id" in cmd:
                resp["id"] = cmd["id"]
        except json.JSONDecodeError as e:
            resp = {"status": "error", "error": f"Invalid JSON input: {str(e)}"}
        except Exception as e:
            resp = {"status": "error", "error": f"Internal worker exception: {str(e)}"}

        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
