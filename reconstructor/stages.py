"""Windows-safe stage helpers: FFmpeg frames, fast VGGT poses, gsplat train, SOG convert."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

from config import Settings
from errors import CudaOomError, PipelineError
from validate import list_frame_paths

LOGGER = logging.getLogger("gsplat.reconstructor.stages")

_REPO_ROOT = Path(__file__).resolve().parent.parent
_PORTABLE_FFMPEG = _REPO_ROOT / "third_party" / "ffmpeg" / "bin"


def _ensure_ffmpeg_on_path() -> None:
    if shutil.which("ffmpeg") and shutil.which("ffprobe"):
        return
    if _PORTABLE_FFMPEG.is_dir():
        path = os.environ.get("PATH", "")
        prefix = str(_PORTABLE_FFMPEG)
        if prefix not in path.split(os.pathsep):
            os.environ["PATH"] = prefix + os.pathsep + path
    if not shutil.which("ffmpeg"):
        raise PipelineError(
            "EXTRACTING_FRAMES",
            "ffmpeg is not on PATH. Install FFmpeg or place it under third_party/ffmpeg/bin.",
            recoverable=False,
        )


def extract_frames(
    video_path: Path,
    frames_dir: Path,
    *,
    fps: float,
    max_width: int,
    max_count: int,
) -> int:
    _ensure_ffmpeg_on_path()
    if shutil.which("ffmpeg") is None:
        raise PipelineError("EXTRACTING_FRAMES", "ffmpeg is not on PATH.", recoverable=False)

    if frames_dir.exists():
        shutil.rmtree(frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)

    LOGGER.info("extract frames fps=%s max_width=%s max_count=%s", fps, max_width, max_count)
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-i",
            str(video_path),
            "-vf",
            f"fps={fps},scale='min({max_width},iw)':-2",
            "-q:v",
            "2",
            str(frames_dir / "frame_%06d.jpg"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise PipelineError("EXTRACTING_FRAMES", f"ffmpeg failed: {detail}")

    frames = list_frame_paths(frames_dir)
    if not frames:
        raise PipelineError("EXTRACTING_FRAMES", "No frames were written.")

    if len(frames) > max_count:
        # Keep evenly spaced frames for 8 GB VRAM.
        keep = _even_sample(frames, max_count)
        keep_set = set(keep)
        for path in frames:
            if path not in keep_set:
                path.unlink(missing_ok=True)
        # Renumber remaining frames so COLMAP/VGGT see a clean sequence.
        kept = list_frame_paths(frames_dir)
        for index, path in enumerate(kept, start=1):
            target = frames_dir / f"frame_{index:06d}.jpg"
            if path != target:
                path.rename(target)
        frames = list_frame_paths(frames_dir)

    LOGGER.info("wrote %s frames under %s", len(frames), frames_dir)
    return len(frames)


def extract_equirect_pano(video_path: Path, dest: Path, duration: float | None, max_width: int = 4096) -> None:
    """Pull one full-resolution equirect frame for the look-around environment."""
    _ensure_ffmpeg_on_path()
    stamp = "1"
    if duration and duration > 2:
        stamp = f"{max(duration / 2, 0.5):.2f}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            stamp,
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-vf",
            f"scale='min({max_width},iw)':-2",
            "-q:v",
            "2",
            str(dest),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not dest.exists():
        detail = (result.stderr or result.stdout or "").strip()
        raise PipelineError("EXTRACTING_FRAMES", f"Could not extract a 360 panorama: {detail}")
    LOGGER.info("wrote equirect pano %s (%s bytes)", dest, dest.stat().st_size)


def extract_thumbnail(video_path: Path, dest: Path, duration: float | None) -> None:
    stamp = "1"
    if duration and duration > 2:
        stamp = f"{max(duration / 2, 0.5):.2f}"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            stamp,
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "4",
            str(dest),
        ],
        check=False,
        capture_output=True,
        text=True,
    )


def estimate_cameras(dataset_dir: Path, settings: Settings) -> Path:
    """Estimate poses into dataset_dir/sparse/0 (COLMAP layout)."""
    images = dataset_dir / "images"
    if not images.is_dir() or not list_frame_paths(images):
        raise PipelineError("RUNNING_COLMAP", f"No images under {images}")

    vggt_dir = Path(settings.vggt_dir) if settings.vggt_dir else Path()
    backend = (settings.camera_backend or "fast_vggt").strip().lower()
    if backend in {"vggt", "vggt_depth"}:
        script = vggt_dir / "demo_colmap.py" if vggt_dir else Path()
        extra = ["--conf_thres_value", str(settings.vggt_conf_thres)]
        cwd = str(vggt_dir)
        label = "VGGT depth cameras"
    else:
        script = Path(__file__).with_name("fast_vggt.py")
        extra = ["--stride", "20"]
        cwd = str(Path(__file__).resolve().parent)
        label = "fast VGGT cameras"

    if not script.exists():
        raise PipelineError(
            "RUNNING_COLMAP",
            "Camera estimator is missing. Set VGGT_DIR to a clone of "
            "https://github.com/facebookresearch/vggt (needs demo_colmap.py).",
            recoverable=False,
        )

    sparse_root = dataset_dir / "sparse"
    if sparse_root.exists():
        shutil.rmtree(sparse_root)

    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = settings.gpu_device
    pythonpath = [str(vggt_dir)] if vggt_dir else []
    if env.get("PYTHONPATH"):
        pythonpath.append(env["PYTHONPATH"])
    env["PYTHONPATH"] = os.pathsep.join(pythonpath)

    command = [sys.executable, str(script), "--scene_dir", str(dataset_dir), *extra]
    LOGGER.info("%s: %s", label, " ".join(command))
    result = _run_streaming("RUNNING_COLMAP", command, env=env, cwd=cwd)
    if result.returncode != 0:
        combined = result.stdout or ""
        if _looks_like_oom(combined):
            raise CudaOomError("RUNNING_COLMAP", "VGGT")
        detail = combined.strip()[-2000:] or f"exit {result.returncode}"
        raise PipelineError("RUNNING_COLMAP", f"Camera estimator failed: {detail}")

    model_dir = _normalize_sparse_layout(dataset_dir)
    return model_dir


def train_gsplat(
    dataset_dir: Path,
    result_dir: Path,
    output_ply: Path,
    settings: Settings,
) -> Path:
    examples = Path(settings.gsplat_examples_dir) if settings.gsplat_examples_dir else Path()
    trainer = examples / "simple_trainer.py"
    if not trainer.exists():
        raise PipelineError(
            "TRAINING_SPLAT",
            "GSPLAT_EXAMPLES_DIR is missing simple_trainer.py. "
            "Clone https://github.com/nerfstudio-project/gsplat and set GSPLAT_EXAMPLES_DIR to its examples/ folder.",
            recoverable=False,
        )

    if result_dir.exists():
        shutil.rmtree(result_dir)
    result_dir.mkdir(parents=True, exist_ok=True)
    output_ply.parent.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = settings.gpu_device
    env["PYTHONPATH"] = (
        f"{examples}{os.pathsep}{env['PYTHONPATH']}" if env.get("PYTHONPATH") else str(examples)
    )

    command = [
        sys.executable,
        str(trainer),
        "default",
        "--data_dir",
        str(dataset_dir),
        "--result_dir",
        str(result_dir),
        "--max_steps",
        str(settings.train_iterations),
        "--data_factor",
        str(settings.train_data_factor),
        "--save_ply",
        "--ply_steps",
        str(settings.train_iterations),
        "--eval_steps",
        "10000000",
        "--test_every",
        str(max(settings.frame_max_count + 4, 32)),
        "--sh_degree",
        "1",
        "--disable_viewer",
    ]
    LOGGER.info(
        "gsplat train steps=%s data_factor=%s",
        settings.train_iterations,
        settings.train_data_factor,
    )
    result = _run_streaming("TRAINING_SPLAT", command, env=env, cwd=str(examples))
    if result.returncode != 0:
        combined = result.stdout or ""
        if _looks_like_oom(combined):
            raise CudaOomError("TRAINING_SPLAT", "gsplat")
        detail = combined.strip()[-2000:] or f"exit {result.returncode}"
        raise PipelineError("TRAINING_SPLAT", f"gsplat trainer failed: {detail}")

    found = _latest_ply(result_dir)
    if not found:
        raise PipelineError("TRAINING_SPLAT", f"Trainer finished but no PLY under {result_dir}")
    shutil.copyfile(found, output_ply)
    LOGGER.info("copied %s -> %s", found, output_ply)
    return output_ply


def convert_sog(ply_path: Path, sog_path: Path, settings: Settings) -> Path:
    sog_path.parent.mkdir(parents=True, exist_ok=True)
    if not ply_path.exists():
        raise PipelineError("CONVERTING_SOG", f"Missing input PLY: {ply_path}")

    _ensure_sog_tools_on_path()

    if settings.sog_convert_cmd.strip():
        cmd = settings.sog_convert_cmd.replace("{ply}", str(ply_path)).replace("{sog}", str(sog_path))
        result = subprocess.run(cmd, check=False, capture_output=True, text=True, shell=True)
    else:
        command = _sog_convert_command(ply_path, sog_path)
        if not command:
            raise PipelineError(
                "CONVERTING_SOG",
                "PlayCanvas SplatTransform is not installed (splat-transform / npx).",
                recoverable=False,
            )
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            shell=os.name == "nt",
        )

    _log_subprocess("CONVERTING_SOG", result)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip() or f"exit {result.returncode}"
        raise PipelineError("CONVERTING_SOG", f"SOG convert failed: {detail}")
    if not sog_path.exists():
        raise PipelineError("CONVERTING_SOG", f"Converter finished but {sog_path} was not created")
    return sog_path


def prepare_dataset(dataset_dir: Path, frames_dir: Path) -> Path:
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    images = dataset_dir / "images"
    images.mkdir(parents=True, exist_ok=True)
    for path in list_frame_paths(frames_dir):
        shutil.copyfile(path, images / path.name)
    # gsplat's COLMAP parser looks for images_{factor}/ unless this flag is set.
    (dataset_dir / "ext_metadata.json").write_text(
        '{"no_factor_suffix": true, "spiral_radius_scale": 1.0}\n',
        encoding="utf-8",
    )
    return dataset_dir


def _normalize_sparse_layout(dataset_dir: Path) -> Path:
    sparse = dataset_dir / "sparse"
    model_zero = sparse / "0"
    if model_zero.exists() and (
        (model_zero / "cameras.bin").exists()
        or (model_zero / "cameras.txt").exists()
    ):
        return model_zero

    # VGGT demo_colmap writes cameras.bin directly under sparse/
    if (sparse / "cameras.bin").exists() or (sparse / "cameras.txt").exists():
        model_zero.mkdir(parents=True, exist_ok=True)
        for name in (
            "cameras.bin",
            "images.bin",
            "points3D.bin",
            "cameras.txt",
            "images.txt",
            "points3D.txt",
            "points.ply",
            "frames.bin",
            "frames.txt",
            "rigs.bin",
            "rigs.txt",
        ):
            src = sparse / name
            if src.exists():
                shutil.move(str(src), str(model_zero / name))
        return model_zero

    raise PipelineError("RUNNING_COLMAP", f"VGGT did not write a COLMAP model under {sparse}")


def _sog_convert_command(ply_path: Path, sog_path: Path) -> list[str] | None:
    for name in ("splat-transform.cmd", "splat-transform.exe", "splat-transform"):
        resolved = shutil.which(name)
        if resolved:
            return [resolved, str(ply_path), str(sog_path)]
    for name in ("npx.cmd", "npx"):
        resolved = shutil.which(name)
        if resolved:
            return [resolved, "--yes", "@playcanvas/splat-transform", str(ply_path), str(sog_path)]
    return None


def _ensure_sog_tools_on_path() -> None:
    extras: list[str] = []
    npm_global = Path.home() / "AppData" / "Roaming" / "npm"
    if npm_global.is_dir():
        extras.append(str(npm_global))
    node_dir = Path(r"C:\Program Files\nodejs")
    if node_dir.is_dir():
        extras.append(str(node_dir))
    if not extras:
        return
    path = os.environ.get("PATH", "")
    parts = path.split(os.pathsep)
    prefix = [item for item in extras if item not in parts]
    if prefix:
        os.environ["PATH"] = os.pathsep.join(prefix + parts)


def _even_sample(paths: list[Path], count: int) -> list[Path]:
    if len(paths) <= count:
        return paths
    if count == 1:
        return [paths[len(paths) // 2]]
    step = (len(paths) - 1) / (count - 1)
    indices = sorted({round(i * step) for i in range(count)})
    while len(indices) < count:
        for i in range(len(paths)):
            if i not in indices:
                indices.append(i)
                break
        indices = sorted(indices)[:count]
    return [paths[i] for i in indices[:count]]


def _latest_ply(root: Path) -> Path | None:
    candidates = sorted(root.rglob("*.ply"), key=lambda p: p.stat().st_mtime)
    return candidates[-1] if candidates else None


def _run_streaming(
    stage: str,
    command: list[str],
    *,
    env: dict[str, str],
    cwd: str,
) -> subprocess.CompletedProcess[str]:
    child_env = env.copy()
    child_env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.Popen(
        command,
        env=child_env,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    chunks: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        chunks.append(line)
        LOGGER.info("[%s] %s", stage, line.rstrip())
    code = proc.wait()
    return subprocess.CompletedProcess(command, code, "".join(chunks), "")


def _looks_like_oom(text: str) -> bool:
    lowered = text.lower()
    return any(
        token in lowered
        for token in (
            "out of memory",
            "cuda out of memory",
            "cudaerror: out of memory",
            "cudnn_status_alloc_failed",
            "hip out of memory",
        )
    )


def _log_subprocess(stage: str, result: subprocess.CompletedProcess[str]) -> None:
    if result.stdout and result.stdout.strip():
        LOGGER.info("[%s] stdout\n%s", stage, result.stdout.strip()[-4000:])
    if result.stderr and result.stderr.strip():
        LOGGER.info("[%s] stderr\n%s", stage, result.stderr.strip()[-4000:])
