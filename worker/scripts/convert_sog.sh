#!/usr/bin/env bash
# Convert room.ply to room.sog with PlayCanvas SplatTransform.
# This is not a custom Gaussian codec.
set -euo pipefail

INPUT_PLY="${1:?usage: convert_sog.sh <input_ply> <output_sog>}"
OUTPUT_SOG="${2:?usage: convert_sog.sh <input_ply> <output_sog>}"

mkdir -p "$(dirname "$OUTPUT_SOG")"

if [[ ! -f "$INPUT_PLY" ]]; then
  echo "[convert_sog] missing input PLY: $INPUT_PLY" >&2
  exit 1
fi

if [[ -z "${SOG_CONVERT_CMD:-}" ]]; then
  if command -v splat-transform >/dev/null 2>&1; then
    SOG_CONVERT_CMD='splat-transform {ply} {sog}'
  elif command -v npx >/dev/null 2>&1; then
    SOG_CONVERT_CMD='npx --yes @playcanvas/splat-transform {ply} {sog}'
  else
    echo "[convert_sog] PlayCanvas SplatTransform is not installed (splat-transform / npx)." >&2
    exit 127
  fi
fi

CMD="${SOG_CONVERT_CMD}"
CMD="${CMD//\{ply\}/$INPUT_PLY}"
CMD="${CMD//\{sog\}/$OUTPUT_SOG}"

echo "[convert_sog] exec: $CMD"
eval "$CMD"

if [[ ! -f "$OUTPUT_SOG" ]]; then
  echo "[convert_sog] converter finished but ${OUTPUT_SOG} was not created" >&2
  exit 1
fi

echo "[convert_sog] wrote $OUTPUT_SOG ($(wc -c < "$OUTPUT_SOG") bytes)"
