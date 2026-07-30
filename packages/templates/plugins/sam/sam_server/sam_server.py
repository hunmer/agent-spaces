"""Standalone SAM (Segment Anything) Flask server for Genie Reskin.

Implements the `/segment_with_boxes` endpoint expected by the backend's
`ai/sam_provider.py`:

    POST /segment_with_boxes
    Content-Type: application/json
    Body:  { "image_base64": "<png|jpg b64>",
             "boxes": [{"slot_id","x_min","y_min","x_max","y_max"}, ...] }
    Returns: { "masks": [{"slot_id","score","mask_b64"}, ...] }

The embedding is computed ONCE per request (set_image), then every box is
prompted against it — cheap fan-out, single HTTP call regardless of slot
count.

Backend selection (SAM backend = "SAM3" service surface, model can be SAM2
or original SAM):

    SAM_BACKEND=sam2     Meta SAM2 (recommended; best quality)
    SAM_BACKEND=sam      Original Segment Anything (segment-anything pkg)
    SAM_BACKEND=opencv   No ML model — GrabCut fallback inside each bbox.
                         Useful when torch/SAM checkpoints are unavailable;
                         never as clean as a real SAM but keeps the
                         pipeline running end-to-end.

All knobs are env vars so the same image ships everywhere; see sam_server/.env.example.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import threading
from pathlib import Path
from typing import Any

import numpy as np
from flask import Flask, jsonify, request
from PIL import Image

# Load sam_server/.env early (optional; absent python-dotenv is fine).
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
except Exception:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sam_server")

app = Flask(__name__)

# ─── config ────────────────────────────────────────────────────────────────
BACKEND = os.environ.get("SAM_BACKEND", "sam2").strip().lower()
SAM2_CKPT = os.environ.get("SAM2_CHECKPOINT", "checkpoints/sam2.1_hiera_tiny.pt")
SAM2_CFG = os.environ.get("SAM2_CONFIG", "configs/sam2.1/sam2.1_hiera_t.yaml")
SAM_CKPT = os.environ.get("SAM_CHECKPOINT", "checkpoints/sam_vit_h_4b8939.pth")
SAM_MODEL = os.environ.get("SAM_MODEL_TYPE", "vit_h")  # vit_h | vit_l | vit_b
DEVICE = os.environ.get("SAM_DEVICE", "cuda").strip().lower()  # cuda | cpu | mps
PORT = int(os.environ.get("SAM_PORT", "30231"))
HOST = os.environ.get("SAM_HOST", "0.0.0.0")

# ─── backend state (lazy, one model per process, guarded by a lock) ────────
_lock = threading.Lock()
_predictor: Any = None          # SAM2 predictor / SAM predictor
_backend_loaded: str | None = None


class OpenCVPredictor:
    """GrabCut-based fallback. Implements the SAM2 predictor surface this
    server uses (set_image + predict(box=...)). No torch needed."""

    def __init__(self):
        self._image: np.ndarray | None = None

    def set_image(self, image: np.ndarray) -> None:
        self._image = image

    @staticmethod
    def _to_rgb(img: np.ndarray) -> np.ndarray:
        if img.ndim == 2:
            img = np.stack([img] * 3, axis=-1)
        elif img.shape[2] == 4:
            img = img[:, :, :3]
        return img

    def predict(self, box: np.ndarray, multimask_output: bool = False):
        import cv2

        img = self._to_rgb(self._image)
        h, w = img.shape[:2]
        x0 = int(max(0, box[0])); y0 = int(max(0, box[1]))
        x1 = int(min(w, box[2])); y1 = int(min(h, box[3]))
        if x1 - x0 < 2 or y1 - y0 < 2:
            mask = np.zeros((h, w), dtype=np.uint8)
            return np.array([mask]), np.array([0.0]), None
        rect = (x0, y0, x1 - x0, y1 - y0)
        bgd = np.zeros((1, 65), np.float64)
        fgd = np.zeros((1, 65), np.float64)
        mask = np.zeros((h, w), np.uint8)  # 0 = bg / 2 = probable fg
        # Tighten: treat a 10% margin band inside the box as definite fg.
        m = 0.1
        bw = max(1, int((x1 - x0) * m))
        bh = max(1, int((y1 - y0) * m))
        mask[y0 + bh:y1 - bh, x0 + bw:x1 - bw] = 1  # definite fg
        try:
            cv2.grabCut(img, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT | cv2.GC_INIT_WITH_MASK)
        except cv2.error:
            cv2.grabCut(img, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
        out = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
        return np.array([out]), np.array([0.8]), None


def _load_sam2():
    """Build a SAM2 predictor. Works with sam2 (Meta) or sam-2 pip package."""
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    device = DEVICE
    sam2 = build_sam2(config_file=SAM2_CFG, ckpt_path=SAM2_CKPT, device=device)
    return SAM2ImagePredictor(sam2)


def _load_sam():
    """Build the original Segment Anything predictor."""
    from segment_anything import sam_model_registry, SamPredictor

    device = DEVICE
    sam = sam_model_registry[SAM_MODEL](checkpoint=SAM_CKPT)
    sam.to(device=device)
    return SamPredictor(sam)


def get_predictor():
    """Return the configured predictor, loading it once (process-wide)."""
    global _predictor, _backend_loaded
    if _predictor is not None and _backend_loaded == BACKEND:
        return _predictor
    with _lock:
        if _predictor is not None and _backend_loaded == BACKEND:
            return _predictor
        if BACKEND == "opencv":
            log.info("Loading OpenCV GrabCut backend (no ML model)")
            _predictor = OpenCVPredictor()
        elif BACKEND == "sam":
            log.info("Loading original SAM (ckpt=%s, type=%s, device=%s)", SAM_CKPT, SAM_MODEL, DEVICE)
            _predictor = _load_sam()
        else:
            log.info("Loading SAM2 (ckpt=%s, cfg=%s, device=%s)", SAM2_CKPT, SAM2_CFG, DEVICE)
            _predictor = _load_sam2()
        _backend_loaded = BACKEND
        log.info("SAM backend '%s' ready", BACKEND)
        return _predictor


# ─── routes ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return jsonify({"status": "ok", "backend": BACKEND, "loaded": _backend_loaded == BACKEND})


@app.post("/segment_with_boxes")
def segment_with_boxes():
    data = request.get_json(force=True, silent=True) or {}
    img_b64 = data.get("image_base64")
    boxes = data.get("boxes")
    if not img_b64 or not isinstance(boxes, list) or not boxes:
        return jsonify({"error": "image_base64 and non-empty boxes[] required"}), 400

    try:
        img_bytes = base64.b64decode(img_b64)
        image = np.array(Image.open(io.BytesIO(img_bytes)).convert("RGB"))
    except Exception as e:
        return jsonify({"error": f"bad image_base64: {e}"}), 400

    try:
        predictor = get_predictor()
        # SAM2 predictor.set_image expects RGB HWC uint8. Original SAM same.
        with _lock:
            if hasattr(predictor, "set_image"):
                predictor.set_image(image)
            masks_out = []
            for box in boxes:
                xyxy = np.array(
                    [box["x_min"], box["y_min"], box["x_max"], box["y_max"]],
                    dtype=np.float32,
                )
                if BACKEND == "opencv":
                    masks, scores, _ = predictor.predict(box=xyxy, multimask_output=False)
                else:
                    masks, scores, _ = predictor.predict(box=xyxy[None, :], multimask_output=False)
                mask = (masks[0] * 255).astype(np.uint8)
                buf = io.BytesIO()
                Image.fromarray(mask, mode="L").save(buf, format="PNG")
                masks_out.append({
                    "slot_id": box.get("slot_id"),
                    "score": float(scores[0]),
                    "mask_b64": base64.b64encode(buf.getvalue()).decode(),
                })
        log.info("segmented %d boxes (image %dx%d)", len(boxes), image.shape[1], image.shape[0])
        return jsonify({"masks": masks_out})
    except Exception as e:
        log.exception("segmentation failed")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Eager-load so the model is ready before we bind (fail fast on bad config).
    try:
        get_predictor()
    except Exception:
        log.exception("model load failed; starting anyway (lazy-load on first request)")
    log.info("serving on %s:%d (backend=%s)", HOST, PORT, BACKEND)
    app.run(host=HOST, port=PORT, threaded=True)
