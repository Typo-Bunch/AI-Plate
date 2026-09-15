#!/usr/bin/env python
"""
Kokoro TTS Persistent Worker
Communicates via JSON lines over stdin/stdout.
Maintains model in memory for sub-second synthesis and auto-unloads when idle.
"""

import sys
import os
import json
import time
import gc
import threading

# Force UTF-8 I/O for Windows console / piped execution
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Default relative paths to model and voices
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DEFAULT_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "kokoro", "kokoro-v1.0.onnx")
DEFAULT_VOICES_PATH = os.path.join(PROJECT_ROOT, "models", "kokoro", "voices-v1.0.bin")

kokoro_instance = None
kokoro_lock = threading.Lock()
last_activity_time = time.time()
IDLE_TIMEOUT_SECONDS = 300  # 5 minutes idle to unload model from RAM

AUDIO_CACHE = {}
AUDIO_CACHE_MAX = 64

def get_kokoro(model_path=None, voices_path=None):
    global kokoro_instance
    with kokoro_lock:
        if kokoro_instance is None:
            import onnxruntime as rt
            from kokoro_onnx import Kokoro

            appdata = os.getenv("AIPLATE_USERDATA") or (
                os.path.join(os.getenv("APPDATA", ""), "AI Plate") if os.getenv("APPDATA") else None
            )
            default_m = os.path.join(appdata, "models", "kokoro", "kokoro-v1.0.onnx") if appdata and os.path.exists(os.path.join(appdata, "models", "kokoro", "kokoro-v1.0.onnx")) else DEFAULT_MODEL_PATH
            default_v = os.path.join(appdata, "models", "kokoro", "voices-v1.0.bin") if appdata and os.path.exists(os.path.join(appdata, "models", "kokoro", "voices-v1.0.bin")) else DEFAULT_VOICES_PATH

            m_path = model_path or default_m
            v_path = voices_path or default_v
            if not os.path.exists(m_path):
                raise FileNotFoundError(f"Kokoro model not found at {m_path}")
            if not os.path.exists(v_path):
                raise FileNotFoundError(f"Kokoro voices not found at {v_path}")

            # Performance-tuned ONNX Runtime SessionOptions
            sess_opts = rt.SessionOptions()
            cpu_count = os.cpu_count() or 4
            # Assign up to 8 threads for low-latency parallel inference
            sess_opts.intra_op_num_threads = min(8, max(2, cpu_count // 2))
            sess_opts.inter_op_num_threads = 2
            sess_opts.graph_optimization_level = rt.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess_opts.execution_mode = rt.ExecutionMode.ORT_SEQUENTIAL
            sess_opts.enable_mem_pattern = True
            sess_opts.enable_cpu_mem_arena = True

            session = rt.InferenceSession(m_path, sess_options=sess_opts, providers=["CPUExecutionProvider"])
            kokoro_instance = Kokoro.from_session(session, v_path)

            # Instant warm-up so first user synthesis is immediate
            try:
                kokoro_instance.create(".", voice="af_heart")
            except Exception:
                pass

        return kokoro_instance

def unload_model():
    global kokoro_instance, AUDIO_CACHE
    with kokoro_lock:
        if kokoro_instance is not None:
            kokoro_instance = None
            AUDIO_CACHE.clear()
            gc.collect()

def idle_checker():
    """Background thread to unload model weights when inactive for IDLE_TIMEOUT_SECONDS."""
    global last_activity_time
    while True:
        time.sleep(30)
        with kokoro_lock:
            if kokoro_instance is not None and (time.time() - last_activity_time) > IDLE_TIMEOUT_SECONDS:
                unload_model()

# Start idle watcher thread
watcher = threading.Thread(target=idle_checker, daemon=True)
watcher.start()

def send_response(data):
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()

def handle_request(req):
    global last_activity_time
    action = req.get("action", "")
    req_id = req.get("id", "")
    model_path = req.get("model_path")
    voices_path = req.get("voices_path")

    last_activity_time = time.time()

    if action == "ping":
        send_response({"status": "ok", "id": req_id, "action": "ping", "model_loaded": kokoro_instance is not None})
        return

    if action == "get_voices":
        try:
            k = get_kokoro(model_path, voices_path)
            voices = k.get_voices()
            send_response({"status": "ok", "id": req_id, "voices": voices})
        except Exception as e:
            send_response({"status": "error", "id": req_id, "error": str(e)})
        return

    if action == "unload":
        unload_model()
        send_response({"status": "ok", "id": req_id, "action": "unload", "model_loaded": False})
        return

    if action == "synthesize":
        text = req.get("text", "").strip()
        voice = req.get("voice", "af_heart")
        speed = float(req.get("speed", 1.0))
        lang = req.get("lang", "en-us")
        output_path = req.get("output_path")

        if not text:
            send_response({"status": "error", "id": req_id, "error": "Text cannot be empty"})
            return
        if not output_path:
            send_response({"status": "error", "id": req_id, "error": "output_path is required"})
            return

        out_dir = os.path.dirname(output_path)
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)

        try:
            import soundfile as sf
            start_time = time.time()
            cache_key = (text, voice, round(speed, 2), lang)

            cached_item = AUDIO_CACHE.get(cache_key)
            if cached_item is not None:
                samples, sample_rate = cached_item
                sf.write(output_path, samples, sample_rate)
                duration = float(len(samples)) / float(sample_rate)
                send_response({
                    "status": "ok",
                    "id": req_id,
                    "output_path": output_path,
                    "sample_rate": sample_rate,
                    "duration": duration,
                    "elapsed_ms": 1,
                    "cached": True,
                })
                return

            k = get_kokoro(model_path, voices_path)
            samples, sample_rate = k.create(text, voice=voice, speed=speed, lang=lang)
            sf.write(output_path, samples, sample_rate)
            duration = float(len(samples)) / float(sample_rate)
            elapsed_ms = round((time.time() - start_time) * 1000)

            if len(AUDIO_CACHE) >= AUDIO_CACHE_MAX:
                try:
                    first_key = next(iter(AUDIO_CACHE))
                    del AUDIO_CACHE[first_key]
                except Exception:
                    pass
            AUDIO_CACHE[cache_key] = (samples, sample_rate)

            send_response({
                "status": "ok",
                "id": req_id,
                "output_path": output_path,
                "sample_rate": sample_rate,
                "duration": duration,
                "elapsed_ms": elapsed_ms,
            })
        except Exception as e:
            send_response({"status": "error", "id": req_id, "error": str(e)})
        return

    send_response({"status": "error", "id": req_id, "error": f"Unknown action '{action}'"})

def main():
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            req = json.loads(line)
            if req.get("action") == "exit":
                send_response({"status": "ok", "id": req.get("id", ""), "action": "exit"})
                break
            handle_request(req)
        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as e:
            send_response({"status": "error", "error": f"Worker parse error: {str(e)}"})

if __name__ == "__main__":
    main()
