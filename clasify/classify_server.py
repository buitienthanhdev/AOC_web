"""Slim architecture classifier — KHONG FastAPI/Redis/RQ, chi 1 script.

Nap clasify/best.pt (timm ConvNeXtV2, 49 phong cach kien truc) va phuc vu:
    POST /api/v1/classify   (multipart form, field "image")  -> JSON classification
    GET  /health                                             -> {"ok": true}

best.pt la checkpoint timm tu train (keys: state_dict / config / class_names),
KHONG phai YOLO. Ta dung 'config.model.name' de dung kien truc roi nap state_dict.

Frontend (js/api/classification.js) chi can architectural_style + confidence;
classification_status suy ra tu confidence.

Chay (python co timm + torch, vd python_embeded cua ComfyUI):
    <python> clasify/classify_server.py
Mac dinh 127.0.0.1:8189 (khop Cloudflare tunnel api.kellymoore-usa.com).
Doi: set CLASSIFY_PORT=8189 / CLASSIFY_DEVICE=cpu|cuda
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
import uuid
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── Cau hinh ────────────────────────────────────────────────────────────────
HOST = os.environ.get("CLASSIFY_HOST", "127.0.0.1")
PORT = int(os.environ.get("CLASSIFY_PORT", "8189"))
DEVICE = os.environ.get("CLASSIFY_DEVICE", "cpu")  # cpu de khong tranh VRAM voi ComfyUI
MODEL_PATH = os.environ.get(
    "CLASSIFY_MODEL",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "best.pt"),
)
ALLOWED_ORIGINS = {
    "https://kellymoore-usa.com",
    "https://www.kellymoore-usa.com",
    "http://localhost",
    "http://127.0.0.1",
}

# Nguong trang thai (clear>=0.45 / hybrid>=0.25 / uncertain<0.25)
T_CLEAR = 0.45
T_HYBRID = 0.25

# ── Nap model 1 lan ─────────────────────────────────────────────────────────
print(f"[classify] Loading {MODEL_PATH} on {DEVICE} ...", flush=True)
import torch
import timm
import torchvision.transforms as T

# CPU inference: KHOA so thread cua torch/OMP. Truoc day moi request lai bung
# nhieu thread torch song song -> tren CPU tao "thread explosion" (hang tram
# thread), tranh chap GIL/OMP -> server ket cung (ca /health cung treo).
if DEVICE == "cpu":
    _n = max(1, min(4, (os.cpu_count() or 4)))
    try:
        torch.set_num_threads(_n)
        os.environ.setdefault("OMP_NUM_THREADS", str(_n))
    except Exception:
        pass

# Suy luan tuan tu: ThreadingHTTPServer cho phep nhieu request song song, nhung
# model dung chung + CPU nang -> chay song song chi lam thrash. Khoa lai de moi
# lan chi 1 inference, cac request khac xep hang nhanh gon.
_INFER_LOCK = threading.Lock()

_ck = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
_CLASS_NAMES = list(_ck["class_names"])
_mcfg = _ck["config"]["model"]
_IMG = int(_ck["config"]["dataset"].get("image_size", 320))

_MODEL = timm.create_model(
    _mcfg["name"], pretrained=False, num_classes=len(_CLASS_NAMES),
    drop_rate=_mcfg.get("drop_rate", 0.0), drop_path_rate=_mcfg.get("drop_path_rate", 0.0),
)
_missing, _unexpected = _MODEL.load_state_dict(_ck["state_dict"], strict=False)
if _missing or _unexpected:
    print(f"[classify] WARN state_dict missing={len(_missing)} unexpected={len(_unexpected)}", flush=True)
_MODEL.eval().to(DEVICE)

_TF = T.Compose([
    T.Resize(_IMG), T.CenterCrop(_IMG), T.ToTensor(),
    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
print(f"[classify] Ready: {len(_CLASS_NAMES)} styles, img={_IMG}. Listening {HOST}:{PORT}", flush=True)


def _status(conf: float) -> str:
    if conf >= T_CLEAR:
        return "clear"
    if conf >= T_HYBRID:
        return "hybrid"
    return "uncertain"


def _classify(image_bytes: bytes) -> dict:
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    x = _TF(img).unsqueeze(0).to(DEVICE)
    with _INFER_LOCK, torch.no_grad():
        probs = torch.softmax(_MODEL(x), dim=1)[0]
    conf, idx = torch.max(probs, 0)
    conf = float(conf)
    top = torch.topk(probs, k=min(4, len(_CLASS_NAMES))).indices.tolist()
    # Kèm % thật của từng phong cách phụ (trước đây chỉ có tên, không có %).
    secondary = [
        {"style": _CLASS_NAMES[i], "confidence": round(float(probs[i]), 4)}
        for i in top if i != int(idx)
    ][:3]
    return {
        "classify_id": uuid.uuid4().hex[:12],
        "architectural_style": _CLASS_NAMES[int(idx)],
        "confidence": round(conf, 4),
        "classification_status": _status(conf),
        "secondary_influences": secondary,
    }


# ── Multipart parser toi gian (lay field "image") ───────────────────────────
def _extract_image(body: bytes, content_type: str):
    i = content_type.find("boundary=")
    if i < 0:
        return body or None  # raw body
    boundary = content_type[i + len("boundary="):].strip().strip('"')
    delim = ("--" + boundary).encode()
    for part in body.split(delim):
        if b"Content-Disposition" not in part:
            continue
        head_end = part.find(b"\r\n\r\n")
        if head_end < 0:
            continue
        headers = part[:head_end].decode("utf-8", "ignore").lower()
        if 'name="image"' in headers or "filename=" in headers:
            data = part[head_end + 4:]
            if data.endswith(b"\r\n"):
                data = data[:-2]
            return data
    return None


class Handler(BaseHTTPRequestHandler):
    # HTTP/1.1 + keep-alive tren ThreadingHTTPServer khien MOI ket noi giu 1
    # thread song mai cho toi khi client dong -> ro ri hang tram thread (browser
    # va cac probe deu giu keep-alive). Dat close_connection=True moi request +
    # gui "Connection: close" => 1 request/thread roi ket thuc, khong ro ri.
    protocol_version = "HTTP/1.1"
    timeout = 30  # socket idle timeout -> reap ket noi treo

    def log_message(self, fmt, *args):
        sys.stderr.write("[classify] %s\n" % (fmt % args))

    def handle_one_request(self):
        self.close_connection = True   # khong keep-alive
        super().handle_one_request()

    def _cors(self):
        origin = self.headers.get("Origin", "")
        allow = origin if origin in ALLOWED_ORIGINS else "https://kellymoore-usa.com"
        self.send_header("Access-Control-Allow-Origin", allow)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") in ("/health", "/healthz"):
            self._json(200, {"ok": True, "classes": len(_CLASS_NAMES)})
        else:
            self._json(404, {"detail": "Not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/api/v1/classify":
            self._json(404, {"detail": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length else b""
            img = _extract_image(body, self.headers.get("Content-Type", ""))
            if not img:
                self._json(422, {"detail": "Thieu file anh (field 'image')."})
                return
            t0 = time.time()
            result = _classify(img)
            elapsed_ms = int((time.time() - t0) * 1000)
            result["elapsed_ms"] = elapsed_ms
            sys.stderr.write(
                f"[classify] OK: style='{result['architectural_style']}' "
                f"conf={result['confidence']:.2f} "
                f"status='{result['classification_status']}' "
                f"in {elapsed_ms}ms\n"
            )
            self._json(200, result)
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"[classify] ERROR: {type(exc).__name__}: {exc}\n")
            self._json(500, {"detail": "Classification failed", "error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("[classify] serve_forever", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
