# Host draft reconstructor

Windows-native Python poller that claims `QUEUED` jobs from Next.js and builds a **draft** Gaussian room on the local NVIDIA GPU.

Next.js never imports this package. Videos never pass through a Next.js API body.

## Pipeline

1. Download the walkthrough from MinIO / S3  
2. FFmpeg frames — capped for a 2–3 minute laptop pass (`FRAME_MAX_COUNT=8`, `FRAME_MAX_WIDTH=640`)  
3. VGGT **camera head only** → COLMAP-compatible `sparse/0` (the full depth head is skipped; it takes 20+ minutes on 8 GB GPUs)  
4. [gsplat](https://github.com/nerfstudio-project/gsplat) `simple_trainer` — `TRAIN_ITERATIONS=800`, `TRAIN_DATA_FACTOR=4`  
5. PlayCanvas `splat-transform` → `room.sog`  
6. Upload results and mark the job `COMPLETED`

CUDA OOM fails the job with a recoverable message. InstantSplat / DUSt3R are not used (they OOM on room-scale 8 GB runs). Set `CAMERA_BACKEND=vggt_depth` only if you want the slow full VGGT depth path.

## One-time setup (Windows)

1. Install [FFmpeg](https://ffmpeg.org/) so `ffmpeg` and `ffprobe` are on `PATH`.
2. Create a CUDA venv and install PyTorch for your driver, for example:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
```

3. Clone pose + trainer deps (outside or inside this folder):

```powershell
git clone https://github.com/facebookresearch/vggt.git
# follow vggt README for its Python deps (pycolmap, trimesh, …)

git clone https://github.com/nerfstudio-project/gsplat.git
pip install gsplat
# GSPLAT_EXAMPLES_DIR should point at gsplat/examples (where simple_trainer.py lives)
```

4. Install PlayCanvas SplatTransform:

```powershell
npm install -g @playcanvas/splat-transform
```

5. Copy env and fill paths / secrets:

```powershell
copy .env.example .env
```

`WORKER_SECRET` must match the Next.js `.env.local` value. Storage settings should match MinIO / S3 used by the app.

## Run

With Postgres + MinIO + `npm run dev` already up:

```powershell
cd reconstructor
.\.venv\Scripts\Activate.ps1
python process.py poll
```

Upload a phone walkthrough at `/projects/new`. The theater should leave **Queued** once this process claims the job.

Single job:

```powershell
python process.py job --job-id <uuid>
```

## Caps (defaults)

| Variable | Default | Purpose |
|---|---|---|
| `FRAME_MAX_COUNT` | 8 | Limit stills for a 2–3 minute pass |
| `FRAME_MAX_WIDTH` | 640 | Downscale frames |
| `TRAIN_ITERATIONS` | 800 | Draft gsplat budget |
| `TRAIN_DATA_FACTOR` | 4 | Lower memory / faster train |
| `CAMERA_BACKEND` | `fast_vggt` | Camera-only VGGT (use `vggt_depth` for the slow path) |

This is a draft room path. The Docker `worker/` COLMAP + 30k-step profile is optional high quality, not required for day-to-day testing.
