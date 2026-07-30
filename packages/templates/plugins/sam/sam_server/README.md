# SAM Segmentation Server

Standalone Flask server that the Genie Reskin backend talks to for per-slot
mask cutting. Implements the `/segment_with_boxes` contract documented in
`app/backend/ai/sam_provider.py`:

```
POST /segment_with_boxes
{ "image_base64": "<png|jpg b64>",
  "boxes": [{"slot_id","x_min","y_min","x_max","y_max"}, ...] }
→ { "masks": [{"slot_id","score","mask_b64"}, ...] }
```

The image embedding is computed **once** per request, then every box is
prompted against it — single HTTP call regardless of slot count.

## Backends

The same `/segment_with_boxes` surface is backed by three interchangeable
engines (set `SAM_BACKEND`):

| backend | quality | needs torch | needs checkpoint | when to use |
|---------|---------|-------------|------------------|-------------|
| `sam2`  | best    | yes         | yes (SAM2 ckpt)  | default for production reskin |
| `sam`   | good    | yes         | yes (SAM ckpt)   | legacy / if you only have SAM weights |
| `opencv`| fallback| no          | no               | dev / no GPU; GrabCut inside each bbox |

## Quick start (opencv, no torch)

```bash
cd reskin-app/sam_server
python -m venv .venv && .venv/Scripts/activate     # win
# python -m venv .venv && source .venv/bin/activate  # mac/linux
pip install -r requirements.txt
cp .env.example .env        # defaults to opencv, port 30231
python sam_server.py
```

Health check: `curl http://127.0.0.1:30231/health`
→ `{"status":"ok","backend":"opencv","loaded":true}`

## Switch to SAM2

1. Install torch for your platform → https://pytorch.org
2. `pip install sam-2` (or clone https://github.com/facebookresearch/sam2)
3. Download a SAM 2.1 checkpoint into `checkpoints/` →
   https://github.com/facebookresearch/sam2#segment-anything-2-1
4. In `.env`:
   ```
   SAM_BACKEND=sam2
   SAM2_CHECKPOINT=checkpoints/sam2.1_hiera_tiny.pt
   SAM2_CONFIG=configs/sam2.1/sam2.1_hiera_t.yaml
   SAM_DEVICE=cuda            # or cpu / mps
   ```
5. Restart `python sam_server.py`.

## Wire it into Reskin

Set the Reskin backend's `SAM_SERVER_URL` so `sam_provider.py` finds it. In
`app/.env`:

```
SAM_SERVER_URL=http://127.0.0.1:30231
```

(Or enter it under Settings → API keys in the Reskin UI.)

## Test it

```bash
python -c "
import base64, json, requests
from PIL import Image
import io
img = Image.new('RGB', (256,256), 'white')
b = io.BytesIO(); img.save(b, 'PNG')
r = requests.post('http://127.0.0.1:30231/segment_with_boxes', json={
    'image_base64': base64.b64encode(b.getvalue()).decode(),
    'boxes': [{'slot_id':'x','x_min':0,'y_min':0,'x_max':128,'y_max':128}],
})
print(r.status_code, len(r.json().get('masks',[])))
"
```

## Config reference (env)

| var | default | meaning |
|-----|---------|---------|
| `SAM_BACKEND`     | `sam2`                              | `sam2` \| `sam` \| `opencv` |
| `SAM2_CHECKPOINT` | `checkpoints/sam2.1_hiera_tiny.pt`  | SAM2 weights |
| `SAM2_CONFIG`     | `configs/sam2.1/sam2.1_hiera_t.yaml`| SAM2 model cfg |
| `SAM_CHECKPOINT`  | `checkpoints/sam_vit_h_4b8939.pth`  | original SAM weights |
| `SAM_MODEL_TYPE`  | `vit_h`                             | `vit_h` \| `vit_l` \| `vit_b` |
| `SAM_DEVICE`      | `cuda`                              | `cuda` \| `cpu` \| `mps` |
| `SAM_HOST`        | `0.0.0.0`                           | bind host |
| `SAM_PORT`        | `30231`                             | bind port |
