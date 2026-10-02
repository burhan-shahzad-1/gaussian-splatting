#!/usr/bin/env bash
# COLMAP stages. This wraps the official COLMAP binary — it does not implement SfM.
# usage: run_colmap.sh <features|match|sfm> <frames_dir> <sparse_dir>
set -euo pipefail

STAGE="${1:?usage: run_colmap.sh <features|match|sfm> <frames_dir> <sparse_dir>}"
FRAMES_DIR="${2:?usage: run_colmap.sh <features|match|sfm> <frames_dir> <sparse_dir>}"
SPARSE_DIR="${3:?usage: run_colmap.sh <features|match|sfm> <frames_dir> <sparse_dir>}"
DATABASE_PATH="${SPARSE_DIR}/database.db"
CAMERA_MODEL="${COLMAP_CAMERA_MODEL:-SIMPLE_PINHOLE}"
USE_GPU="${COLMAP_USE_GPU:-1}"

if ! command -v colmap >/dev/null 2>&1; then
  echo "[run_colmap] COLMAP is not installed. Install it on the GPU image; do not add it to Next.js." >&2
  exit 127
fi

mkdir -p "$SPARSE_DIR"

case "$STAGE" in
  features)
    echo "[run_colmap] feature_extractor camera=${CAMERA_MODEL} gpu=${USE_GPU}"
    colmap feature_extractor \
      --database_path "$DATABASE_PATH" \
      --image_path "$FRAMES_DIR" \
      --ImageReader.single_camera 1 \
      --ImageReader.camera_model "$CAMERA_MODEL" \
      --SiftExtraction.use_gpu "$USE_GPU"
    ;;
  match)
    echo "[run_colmap] exhaustive_matcher gpu=${USE_GPU}"
    colmap exhaustive_matcher \
      --database_path "$DATABASE_PATH" \
      --SiftMatching.use_gpu "$USE_GPU"
    ;;
  sfm)
    echo "[run_colmap] mapper (Structure-from-Motion)"
    colmap mapper \
      --database_path "$DATABASE_PATH" \
      --image_path "$FRAMES_DIR" \
      --output_path "$SPARSE_DIR"
    if [[ ! -d "${SPARSE_DIR}/0" ]]; then
      echo "[run_colmap] mapper finished without sparse/0 — no reconstruction" >&2
      exit 1
    fi
    echo "[run_colmap] reconstruction written to ${SPARSE_DIR}/0"
    ;;
  *)
    echo "[run_colmap] unknown stage '$STAGE'" >&2
    exit 2
    ;;
esac
