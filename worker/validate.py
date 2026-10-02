"""Validators for video, COLMAP poses, Gaussian PLY, and PlayCanvas SOG."""

from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
from pathlib import Path

from config import Settings
from errors import PipelineError

LOGGER = logging.getLogger("gsplat.worker.validate")

_GAUSSIAN_HINTS = ("scale_0", "rot_0", "opacity", "f_dc_0", "f_dc_1", "f_dc_2")


def probe_video(path: Path) -> dict:
    if not path.exists() or path.stat().st_size < 1024:
        raise PipelineError("validate_video", f"Input video is missing or too small: {path}")

    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,format_name:stream=codec_type,codec_name,width,height,duration",
            "-of",
            "json",
            str(path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise PipelineError("validate_video", f"ffprobe could not read the file: {result.stderr.strip()}")

    payload = json.loads(result.stdout or "{}")
    video_stream = next(
        (stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video"),
        None,
    )
    if not video_stream:
        raise PipelineError("validate_video", "The file has no video stream.")

    duration = _as_float(video_stream.get("duration")) or _as_float((payload.get("format") or {}).get("duration"))
    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    codec = str(video_stream.get("codec_name") or "unknown")
    return {
        "duration": duration,
        "width": width,
        "height": height,
        "codec": codec,
        "size_bytes": int((payload.get("format") or {}).get("size") or path.stat().st_size),
        "format": (payload.get("format") or {}).get("format_name"),
    }


def validate_video(path: Path, settings: Settings) -> dict:
    info = probe_video(path)
    if (info["duration"] or 0) < settings.min_video_seconds:
        raise PipelineError(
            "validate_video",
            f"Walkthrough is {info['duration']:.1f}s; need at least {settings.min_video_seconds:.0f}s.",
        )
    if max(info["width"], info["height"]) < settings.min_video_width:
        raise PipelineError(
            "validate_video",
            f"Video is {info['width']}x{info['height']}; need at least {settings.min_video_width}px on the long edge.",
        )
    LOGGER.info(
        "video ok codec=%s %sx%s duration=%.2fs size=%s",
        info["codec"],
        info["width"],
        info["height"],
        info["duration"] or 0,
        info["size_bytes"],
    )
    return info


def count_frames(frames_dir: Path) -> int:
    if not frames_dir.is_dir():
        return 0
    return sum(1 for path in frames_dir.iterdir() if path.suffix.lower() in {".jpg", ".jpeg", ".png"})


def validate_frames(frames_dir: Path, settings: Settings) -> int:
    total = count_frames(frames_dir)
    if total < settings.min_frames:
        raise PipelineError(
            "extract_frames",
            f"Extracted {total} frames; need at least {settings.min_frames}. Lower FRAME_FPS or recapture.",
        )
    LOGGER.info("frames ok count=%s dir=%s", total, frames_dir)
    return total


def validate_colmap_poses(model_dir: Path, settings: Settings) -> dict:
    cameras = model_dir / "cameras.bin"
    images = model_dir / "images.bin"
    points = model_dir / "points3D.bin"
    missing = [str(path.name) for path in (cameras, images, points) if not path.exists()]
    if missing:
        raise PipelineError(
            "colmap",
            f"COLMAP did not write {', '.join(missing)} under {model_dir}. SfM failed.",
        )

    txt_dir = model_dir.parent / "txt"
    if txt_dir.exists():
        shutil.rmtree(txt_dir)
    txt_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "colmap",
            "model_converter",
            "--input_path",
            str(model_dir),
            "--output_path",
            str(txt_dir),
            "--output_type",
            "TXT",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise PipelineError("colmap", f"model_converter failed: {result.stderr.strip()}", recoverable=False)

    registered = _count_colmap_images(txt_dir / "images.txt")
    sparse_points = _count_colmap_points(txt_dir / "points3D.txt")

    if registered < settings.min_registered_cameras:
        raise PipelineError(
            "colmap",
            (
                f"Only {registered} cameras registered (need {settings.min_registered_cameras}). "
                "Recapture a slower walkthrough with more overlap and lighting."
            ),
        )
    if sparse_points < settings.min_sparse_points:
        raise PipelineError(
            "colmap",
            f"Sparse reconstruction has {sparse_points} points (need {settings.min_sparse_points}).",
        )

    LOGGER.info("colmap poses ok cameras=%s points=%s", registered, sparse_points)
    return {"registered_cameras": registered, "sparse_points": sparse_points, "txt_dir": str(txt_dir)}


def validate_ply(path: Path, settings: Settings) -> dict:
    if not path.exists():
        raise PipelineError("train_splat", f"Expected Gaussian splat PLY at {path}")
    size = path.stat().st_size
    if size < settings.min_ply_bytes:
        raise PipelineError("train_splat", f"PLY is too small ({size} bytes) to be a trained splat.")

    header, vertex_count = _read_ply_header(path)
    if vertex_count < settings.min_gaussians:
        raise PipelineError(
            "train_splat",
            f"PLY has {vertex_count} vertices; need at least {settings.min_gaussians} Gaussians.",
        )
    hints = [name for name in _GAUSSIAN_HINTS if name in header]
    if not hints:
        raise PipelineError(
            "train_splat",
            "PLY is not a Gaussian splat (missing scale/opacity/SH properties).",
        )
    LOGGER.info("ply ok bytes=%s vertices=%s hints=%s", size, vertex_count, ",".join(hints))
    return {"bytes": size, "vertices": vertex_count, "properties": hints}


def validate_sog(path: Path, settings: Settings) -> dict:
    if not path.exists():
        raise PipelineError("convert_sog", f"Expected room.sog at {path}")
    size = path.stat().st_size
    if size < settings.min_sog_bytes:
        raise PipelineError("convert_sog", f"SOG is too small ({size} bytes).")

    if settings.validate_sog_roundtrip and shutil.which("splat-transform"):
        check_ply = path.with_name("sog_roundtrip_check.ply")
        result = subprocess.run(
            ["splat-transform", str(path), str(check_ply)],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not check_ply.exists():
            raise PipelineError(
                "convert_sog",
                f"PlayCanvas SplatTransform could not read the SOG: {result.stderr.strip() or result.stdout.strip()}",
            )
        roundtrip_vertices = _read_ply_header(check_ply)[1]
        check_ply.unlink(missing_ok=True)
        if roundtrip_vertices < 1:
            raise PipelineError("convert_sog", "SOG round-trip produced an empty PLY.")
        LOGGER.info("sog ok bytes=%s roundtrip_vertices=%s", size, roundtrip_vertices)
        return {"bytes": size, "roundtrip_vertices": roundtrip_vertices}

    LOGGER.info("sog ok bytes=%s (roundtrip skipped)", size)
    return {"bytes": size, "roundtrip_vertices": None}


def _read_ply_header(path: Path) -> tuple[str, int]:
    lines: list[str] = []
    with path.open("rb") as handle:
        while True:
            raw = handle.readline()
            if not raw:
                break
            line = raw.decode("ascii", errors="replace").strip()
            lines.append(line)
            if line == "end_header":
                break
    header = "\n".join(lines)
    if not header.startswith("ply"):
        raise PipelineError("train_splat", f"{path.name} is not a PLY file.")
    match = re.search(r"element vertex\s+(\d+)", header)
    if not match:
        raise PipelineError("train_splat", "PLY header has no vertex element.")
    return header, int(match.group(1))


def _count_colmap_images(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 10 and _is_float(parts[1]):
            count += 1
    return count


def _count_colmap_points(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line or line.startswith("#"):
            continue
        count += 1
    return count


def _as_float(value: object) -> float | None:
    try:
        if value is None or value == "N/A":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_float(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False
