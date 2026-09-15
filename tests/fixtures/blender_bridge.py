"""
═══════════════════════════════════════════════════════════════════════
  🤖 AI Plate — Blender 3D Companion Bridge (WebSocket + HTTP Server)
═══════════════════════════════════════════════════════════════════════

Instructions:
  1. Open Blender 3D.
  2. Switch to the 'Scripting' workspace tab.
  3. Click '+ New', paste this entire file, and click '▶ Run Script'.
  4. The bridge starts immediately as a background daemon thread.

Features:
  - RFC 6455 High-Speed WebSocket Server (zero external pip packages required).
  - Dual-mode: Supports both WebSocket (ws://localhost:8198/ws) and HTTP (http://localhost:8198).
  - Executes safely on Blender's main thread via bpy.app.timers.
  - Sub-millisecond execution round-trip for 3D modeling, material shaders, and camera control.
"""

import sys
import json
import socket
import threading
import hashlib
import base64
import struct
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

try:
    import bpy
    BLENDER_ACTIVE = True
except ImportError:
    BLENDER_ACTIVE = False
    print("[AI Plate Bridge] Warning: Running outside of Blender environment (Mock mode).")

HOST = "localhost"
PORT = 8198
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Active WebSocket connections set
active_ws_clients = set()
clients_lock = threading.Lock()


def execute_in_blender_main_thread(func, *args, **kwargs):
    """Dispatch execution safely onto Blender's main event loop via timer."""
    if not BLENDER_ACTIVE:
        try:
            return {"success": True, "data": func(*args, **kwargs)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    res_id = str(time.time()) + "_" + str(threading.get_ident())
    event = threading.Event()
    result_box = {}

    def runner():
        try:
            res = func(*args, **kwargs)
            result_box["payload"] = {"success": True, "data": res}
        except Exception as e:
            result_box["payload"] = {"success": False, "error": str(e)}
        finally:
            event.set()
        return None  # Unregister timer

    bpy.app.timers.register(runner)
    event.wait(timeout=30)
    return result_box.get("payload", {"success": False, "error": "Main thread execution timeout"})


def get_scene_summary():
    """Extract summary information about the active 3D scene."""
    if not BLENDER_ACTIVE:
        return {"scene": "Mock Scene", "objects": ["Cube", "Light", "Camera"]}

    scene = bpy.context.scene
    objects = []
    for obj in scene.objects:
        objects.append({
            "name": obj.name,
            "type": obj.type,
            "location": [round(v, 3) for v in obj.location],
            "visible": obj.visible_get(),
        })

    materials = [mat.name for mat in bpy.data.materials]
    camera_name = scene.camera.name if scene.camera else None

    return {
        "sceneName": scene.name,
        "renderEngine": scene.render.engine,
        "activeCamera": camera_name,
        "objectCount": len(objects),
        "objects": objects,
        "materials": materials,
        "fps": scene.render.fps,
        "frameCurrent": scene.frame_current,
    }


def run_blender_script(code_str):
    """Execute arbitrary Python script in the Blender namespace."""
    if not BLENDER_ACTIVE:
        return {"output": "Mock script executed outside Blender.", "scene": get_scene_summary()}

    local_ns = {"bpy": bpy, "math": __import__("math")}
    
    import io
    from contextlib import redirect_stdout, redirect_stderr

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()

    with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
        exec(code_str, local_ns)

    return {
        "stdout": stdout_buf.getvalue().strip(),
        "stderr": stderr_buf.getvalue().strip(),
        "scene": get_scene_summary(),
    }


def render_scene_frame(output_path, resolution_x=1920, resolution_y=1080, engine="BLENDER_EEVEE_NEXT"):
    """Render the active frame to an image file."""
    if not BLENDER_ACTIVE:
        return {"rendered": output_path, "mock": True}

    scene = bpy.context.scene
    scene.render.resolution_x = int(resolution_x)
    scene.render.resolution_y = int(resolution_y)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = output_path
    
    if engine in ["BLENDER_EEVEE_NEXT", "CYCLES", "BLENDER_WORKBENCH"]:
        scene.render.engine = engine

    bpy.ops.render.render(write_still=True)
    return {"rendered": output_path, "resolution": f"{resolution_x}x{resolution_y}", "engine": scene.render.engine}


# ─── Pure-Python RFC 6455 WebSocket Framing Helpers ──────────────────────────

def decode_ws_frame(data):
    """Decode a single WebSocket frame from bytes."""
    if len(data) < 2:
        return None, data
    byte1, byte2 = data[0], data[1]
    opcode = byte1 & 0x0F
    masked = bool(byte2 & 0x80)
    payload_len = byte2 & 0x7F
    offset = 2

    if payload_len == 126:
        if len(data) < 4: return None, data
        payload_len = struct.unpack(">H", data[2:4])[0]
        offset = 4
    elif payload_len == 127:
        if len(data) < 10: return None, data
        payload_len = struct.unpack(">Q", data[2:10])[0]
        offset = 10

    if masked:
        if len(data) < offset + 4: return None, data
        mask = data[offset:offset+4]
        offset += 4
    else:
        mask = None

    if len(data) < offset + payload_len:
        return None, data

    raw = data[offset:offset+payload_len]
    remaining = data[offset+payload_len:]

    if masked:
        unmasked = bytes([b ^ mask[i % 4] for i, b in enumerate(raw)])
    else:
        unmasked = raw

    return (opcode, unmasked), remaining


def encode_ws_frame(payload_bytes, opcode=0x1):
    """Encode payload bytes into an RFC 6455 unmasked server frame."""
    header = bytearray([0x80 | (opcode & 0x0F)])
    length = len(payload_bytes)
    if length < 126:
        header.append(length)
    elif length <= 65535:
        header.append(126)
        header.extend(struct.pack(">H", length))
    else:
        header.append(127)
        header.extend(struct.pack(">Q", length))
    return bytes(header) + payload_bytes


def dispatch_ws_action(message_json):
    """Process incoming JSON action from WebSocket client."""
    action = message_json.get("action") or message_json.get("type")
    req_id = message_json.get("id")

    if action in ["ping", "status"]:
        version = ".".join(map(str, bpy.app.version)) if BLENDER_ACTIVE else "mock-4.x"
        return {
            "id": req_id,
            "success": True,
            "status": "online",
            "protocol": "websocket",
            "version": version,
            "timestamp": time.time(),
        }

    if action == "exec":
        script = message_json.get("script", "")
        if not script:
            return {"id": req_id, "success": False, "error": "Missing 'script' parameter"}
        res = execute_in_blender_main_thread(run_blender_script, script)
        return {
            "id": req_id,
            "success": res.get("success", False),
            "data": res.get("data"),
            "error": res.get("error"),
        }

    if action in ["scene", "get_scene"]:
        res = execute_in_blender_main_thread(get_scene_summary)
        return {
            "id": req_id,
            "success": res.get("success", False),
            "data": res.get("data"),
            "error": res.get("error"),
        }

    if action == "render":
        out_path = message_json.get("outputPath", "//ai_plate_render.png")
        res_x = message_json.get("resolutionX", 1920)
        res_y = message_json.get("resolutionY", 1080)
        engine = message_json.get("engine", "BLENDER_EEVEE_NEXT")
        res = execute_in_blender_main_thread(render_scene_frame, out_path, res_x, res_y, engine)
        return {
            "id": req_id,
            "success": res.get("success", False),
            "data": res.get("data"),
            "error": res.get("error"),
        }

    return {"id": req_id, "success": False, "error": f"Unknown action '{action}'"}


# ─── Dual-Mode HTTP + WebSocket Request Handler ───────────────────────────────

class DualModeBridgeHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Check if WebSocket Upgrade request
        upgrade_hdr = self.headers.get("Upgrade", "")
        if upgrade_hdr.lower() == "websocket":
            self.handle_websocket()
            return

        path = self.path.split("?")[0]
        if path in ["/", "/status"]:
            version = ".".join(map(str, bpy.app.version)) if BLENDER_ACTIVE else "mock-4.x"
            return self._send_json(200, {
                "status": "online",
                "app": "Blender 3D",
                "bridge": "AI Plate Companion Bridge v2.0 (WebSocket + HTTP)",
                "websocket_endpoint": f"ws://{HOST}:{PORT}/ws",
                "version": version,
            })

        if path == "/scene":
            res = execute_in_blender_main_thread(get_scene_summary)
            if res.get("success", False):
                return self._send_json(200, res["data"])
            return self._send_json(500, {"error": res.get("error", "Unknown scene query error")})

        self._send_json(404, {"error": f"Path '{path}' not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        content_len = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else "{}"
        
        try:
            body = json.loads(post_body)
        except Exception:
            body = {}

        if path == "/exec":
            script = body.get("script", "")
            if not script:
                return self._send_json(400, {"error": "Missing 'script' field in body"})
            res = execute_in_blender_main_thread(run_blender_script, script)
            if res.get("success", False):
                return self._send_json(200, res["data"])
            return self._send_json(500, {"error": res.get("error", "Execution failed")})

        if path == "/render":
            out_path = body.get("outputPath", "//ai_plate_render.png")
            res_x = body.get("resolutionX", 1920)
            res_y = body.get("resolutionY", 1080)
            engine = body.get("engine", "BLENDER_EEVEE_NEXT")
            res = execute_in_blender_main_thread(render_scene_frame, out_path, res_x, res_y, engine)
            if res.get("success", False):
                return self._send_json(200, res["data"])
            return self._send_json(500, {"error": res.get("error", "Render failed")})

        self._send_json(404, {"error": f"Unknown endpoint '{path}'"})

    def handle_websocket(self):
        """Perform WebSocket handshake and loop on WebSocket frames."""
        sec_key = self.headers.get("Sec-WebSocket-Key", "")
        if not sec_key:
            self.send_error(400, "Missing Sec-WebSocket-Key")
            return

        accept_val = base64.b64encode(hashlib.sha1((sec_key + WS_GUID).encode()).digest()).decode()
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept_val)
        self.end_headers()

        raw_sock = self.connection
        with clients_lock:
            active_ws_clients.add(raw_sock)

        buf = b""
        try:
            while True:
                data = raw_sock.recv(4096)
                if not data:
                    break
                buf += data

                while True:
                    frame, remaining = decode_ws_frame(buf)
                    if frame is None:
                        break
                    buf = remaining
                    opcode, payload = frame

                    if opcode == 0x8:  # Close frame
                        raw_sock.sendall(encode_ws_frame(b"", opcode=0x8))
                        return

                    if opcode == 0x9:  # Ping frame
                        raw_sock.sendall(encode_ws_frame(payload, opcode=0xA))
                        continue

                    if opcode == 0x1:  # Text frame (JSON)
                        try:
                            msg = json.loads(payload.decode("utf-8"))
                            resp = dispatch_ws_action(msg)
                            raw_sock.sendall(encode_ws_frame(json.dumps(resp).encode("utf-8")))
                        except Exception as err:
                            err_resp = {"success": False, "error": str(err)}
                            raw_sock.sendall(encode_ws_frame(json.dumps(err_resp).encode("utf-8")))

        except Exception:
            pass
        finally:
            with clients_lock:
                active_ws_clients.discard(raw_sock)

    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_bridge():
    server = ThreadedHTTPServer((HOST, PORT), DualModeBridgeHandler)
    print(f"[AI Plate Bridge] Online on ws://{HOST}:{PORT}/ws and http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__" and not BLENDER_ACTIVE:
    start_bridge()
else:
    thread = threading.Thread(target=start_bridge, daemon=True)
    thread.start()
