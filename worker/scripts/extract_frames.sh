#!/usr/bin/env bash
# Extract overlapping stills from a walkthrough. Runs on the GPU worker, never in Next.js.
set -euo pipefail

VIDEO_PATH="${1:?usage: extract_frames.sh <video> <frames_dir> [fps] [max_width]}"
FRAMES_DIR="${2:?usage: extract_frames.sh <video> <frames_dir> [fps] [max_width]}"
FPS="${3:-${FRAME_FPS:-2}}"
MAX_WIDTH="${4:-${FRAME_MAX_WIDTH:-1600}}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[extract_frames] ffmpeg is not installed on this worker" >&2
  exit 127
fi

mkdir -p "$FRAMES_DIR"
echo "[extract_frames] source=$VIDEO_PATH fps=$FPS max_width=$MAX_WIDTH dest=$FRAMES_DIR"

ffmpeg -y -hide_banner -loglevel warning -i "$VIDEO_PATH" \
  -vf "fps=${FPS},scale='min(${MAX_WIDTH},iw)':-2" \
  -q:v 2 \
  "${FRAMES_DIR}/frame_%06d.jpg"

COUNT="$(find "$FRAMES_DIR" -type f \( -name '*.jpg' -o -name '*.png' \) | wc -l | tr -d ' ')"
echo "[extract_frames] wrote ${COUNT} frames"
if [[ "$COUNT" -lt 1 ]]; then
  echo "[extract_frames] no frames were written" >&2
  exit 1
fi
