# GSplat

Web studio for reconstructing a room from a phone walkthrough.

Mobile video → `ReconstructionJob` in Postgres → **host draft reconstructor** (FFmpeg, VGGT, short gsplat, PlayCanvas SplatTransform) → `room.ply` / `room.sog` → object storage → browser viewer.

## Boundary

The Next.js app **only orchestrates jobs**. It does not run FFmpeg, COLMAP, CUDA, or Gaussian Splatting. Reconstruction lives in `reconstructor/` on a machine with an NVIDIA GPU (this laptop’s RTX-class card is enough for draft quality).

The draft reconstructor uses existing tools:

- FFmpeg for a capped frame set (~24 frames, max width 960)
- [VGGT](https://github.com/facebookresearch/vggt) for feed-forward camera poses (no COLMAP by default)
- [gsplat](https://github.com/nerfstudio-project/gsplat) `simple_trainer` with a short budget (3 000 steps, `data_factor=4`)
- [PlayCanvas SplatTransform](https://github.com/playcanvas/splat-transform) for `room.ply` → `room.sog`

This repo does not implement a custom 3DGS rasterizer or the SOG codec. The older Docker `worker/` profile remains available for a slower high-quality COLMAP path, but it is not the default.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript (strict)
- Tailwind CSS 4
- Prisma + PostgreSQL
- AWS S3 / MinIO (direct browser PUT via presigned URL)
- Host CUDA reconstructor (Python poller)

## Develop

```bash
cp .env.example .env.local
docker compose up -d postgres minio minio-init
# Postgres is published on localhost:5434 (see DATABASE_URL).
npx prisma migrate deploy
npm install
npm run dev
```

Local `.env.local` can point at MinIO (`S3_ENDPOINT=http://127.0.0.1:9000`, bucket `gsplat`) so the browser PUTs video straight to object storage — never through a Next.js API body. Restart `npm run dev` after changing env files.

Open [http://localhost:3000](http://localhost:3000).

### Host draft reconstructor

See [reconstructor/README.md](reconstructor/README.md). Summary:

```bash
# one-time: CUDA PyTorch venv, clone VGGT + gsplat examples, install splat-transform
cp reconstructor/.env.example reconstructor/.env
# set WORKER_SECRET to match .env.local, plus VGGT_DIR and GSPLAT_EXAMPLES_DIR
cd reconstructor
python process.py poll
```

Docker is only required for Postgres and MinIO — not for the CUDA pipeline.

Results are stored as:

```
reconstructions/{jobId}/room.ply
reconstructions/{jobId}/room.sog
reconstructions/{jobId}/thumbnail.jpg
```

Public URLs use `CLOUDFRONT_URL` when set. Draft knobs (`FRAME_FPS`, `FRAME_MAX_WIDTH`, `FRAME_MAX_COUNT`, `TRAIN_ITERATIONS`, `TRAIN_DATA_FACTOR`, `WORK_DIR`) are environment variables on the reconstructor.

## Job statuses

`UPLOADING` → `QUEUED` → `EXTRACTING_FRAMES` → `RUNNING_COLMAP` (camera estimate) → `TRAINING_SPLAT` → `CONVERTING_SOG` → `UPLOADING_RESULT` → `COMPLETED` (`FAILED` at any stage after a reconstructor or upload error).
