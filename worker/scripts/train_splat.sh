#!/usr/bin/env bash
# Train a Gaussian splat with an EXISTING implementation (default: nerfstudio gsplat simple_trainer).
# This script does not contain projection, rasterization, or training mathematics.
set -euo pipefail

DATASET_DIR="${1:?usage: train_splat.sh <dataset_dir> <result_dir> <output_ply>}"
RESULT_DIR="${2:?usage: train_splat.sh <dataset_dir> <result_dir> <output_ply>}"
OUTPUT_PLY="${3:?usage: train_splat.sh <dataset_dir> <result_dir> <output_ply>}"
BACKEND="${SPLAT_BACKEND:-gsplat}"
ITERATIONS="${TRAIN_ITERATIONS:-30000}"
DATA_FACTOR="${TRAIN_DATA_FACTOR:-1}"
GSPLAT_EXAMPLES_DIR="${GSPLAT_EXAMPLES_DIR:-/opt/gsplat/examples}"
GAUSSIAN_SPLATTING_DIR="${GAUSSIAN_SPLATTING_DIR:-/opt/gaussian-splatting}"

mkdir -p "$(dirname "$OUTPUT_PLY")" "$RESULT_DIR"
DATASET_DIR="$(realpath "$DATASET_DIR")"
RESULT_DIR="$(realpath "$RESULT_DIR")"
OUTPUT_PLY="$(realpath -m "$OUTPUT_PLY")"

copy_ply() {
  local found
  found="$(find "$RESULT_DIR" -type f -name '*.ply' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || true)"
  if [[ -z "$found" ]]; then
    echo "[train_splat] trainer finished but no PLY was written under $RESULT_DIR" >&2
    exit 1
  fi
  cp "$found" "$OUTPUT_PLY"
  echo "[train_splat] copied $found -> $OUTPUT_PLY"
}

run_gsplat() {
  if [[ ! -f "${GSPLAT_EXAMPLES_DIR}/simple_trainer.py" ]]; then
    echo "[train_splat] gsplat simple_trainer.py not found at ${GSPLAT_EXAMPLES_DIR}" >&2
    echo "[train_splat] Clone https://github.com/nerfstudio-project/gsplat into GSPLAT_EXAMPLES_DIR." >&2
    exit 127
  fi
  echo "[train_splat] gsplat simple_trainer iterations=${ITERATIONS} data_factor=${DATA_FACTOR}"
  (
    cd "$GSPLAT_EXAMPLES_DIR"
    PYTHONPATH="$GSPLAT_EXAMPLES_DIR${PYTHONPATH:+:$PYTHONPATH}" \
      python simple_trainer.py default \
        --data_dir "$DATASET_DIR" \
        --result_dir "$RESULT_DIR" \
        --max_steps "$ITERATIONS" \
        --data_factor "$DATA_FACTOR" \
        --save_ply \
        --ply_steps "$ITERATIONS" \
        --eval_steps "$ITERATIONS" \
        --disable_viewer
  )
  copy_ply
}

run_3dgs() {
  if [[ ! -f "${GAUSSIAN_SPLATTING_DIR}/train.py" ]]; then
    echo "[train_splat] original 3DGS train.py not found at ${GAUSSIAN_SPLATTING_DIR}" >&2
    exit 127
  fi
  echo "[train_splat] graphdeco-inria/gaussian-splatting iterations=${ITERATIONS}"
  python "${GAUSSIAN_SPLATTING_DIR}/train.py" \
    -s "$DATASET_DIR" \
    -m "$RESULT_DIR" \
    --iterations "$ITERATIONS"
  copy_ply
}

run_external() {
  if [[ -z "${SPLAT_TRAIN_CMD:-}" ]]; then
    echo "[train_splat] SPLAT_BACKEND=external but SPLAT_TRAIN_CMD is unset." >&2
    exit 2
  fi
  local cmd="$SPLAT_TRAIN_CMD"
  cmd="${cmd//\{dataset\}/$DATASET_DIR}"
  cmd="${cmd//\{frames\}/${DATASET_DIR}/images}"
  cmd="${cmd//\{colmap\}/$DATASET_DIR/sparse/0}"
  cmd="${cmd//\{ply\}/$OUTPUT_PLY}"
  cmd="${cmd//\{result\}/$RESULT_DIR}"
  echo "[train_splat] exec: $cmd"
  eval "$cmd"
}

echo "[train_splat] backend=${BACKEND} dataset=${DATASET_DIR}"

if [[ -n "${SPLAT_TRAIN_CMD:-}" && "$BACKEND" == "external" ]]; then
  run_external
elif [[ "$BACKEND" == "3dgs" ]]; then
  run_3dgs
else
  run_gsplat
fi

if [[ ! -f "$OUTPUT_PLY" ]]; then
  echo "[train_splat] expected output missing: $OUTPUT_PLY" >&2
  exit 1
fi

echo "[train_splat] wrote $OUTPUT_PLY ($(wc -c < "$OUTPUT_PLY") bytes)"
