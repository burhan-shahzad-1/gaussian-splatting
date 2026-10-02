"""Reconstruction pipeline using FFmpeg, COLMAP, gsplat, and PlayCanvas SplatTransform."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from config import Settings, result_keys
from errors import PipelineError
from storage import ObjectStore
from validate import (
    validate_colmap_poses,
    validate_frames,
    validate_ply,
    validate_sog,
    validate_video,
)

LOGGER = logging.getLogger("gsplat.worker.pipeline")
SCRIPT_DIR = Path(__file__).resolve().parent / "scripts"
StatusFn = Callable[..., None]


@dataclass
class JobConfig:
    splat_backend: str = "gsplat"
    name: str = ""
    frame_fps: float = 0.0
    frame_max_width: int = 0
    train_iterations: int = 0
    train_data_factor: int = 0
    splat_train_cmd: str = ""
    sog_convert_cmd: str = ""


@dataclass
class JobRequest:
    job_id: str
    input_uri: str | None = None
    original_video_key: str | None = None
    config: JobConfig = field(default_factory=JobConfig)


@dataclass
class PipelineMetrics:
    video_duration_seconds: float | None = None
    video_resolution: str | None = None
    frame_count: int = 0
    registered_cameras: int = 0
    sparse_points: int = 0
    gaussian_count: int = 0
    ply_bytes: int = 0
    sog_bytes: int = 0
    thumbnail_bytes: int = 0
    extract_ms: int = 0
    colmap_ms: int = 0
    train_ms: int = 0
    convert_ms: int = 0
    upload_ms: int = 0
    total_ms: int = 0
    gpu_device: str = ""


@dataclass
class PipelineResult:
    metrics: PipelineMetrics
    ply_key: str
    ply_url: str
    sog_key: str
    sog_url: str
    thumbnail_key: str | None
    thumbnail_url: str | None


class ReconstructionPipeline:
    def __init__(self, settings: Settings, store: ObjectStore, update_status: StatusFn) -> None:
        self.settings = settings
        self.store = store
        self.update_status = update_status

    def run(self, request: JobRequest) -> PipelineResult:
        settings = self.settings
        job_id = request.job_id
        cfg = _merge_config(request.config, settings)
        metrics = PipelineMetrics(gpu_device=_gpu_label(settings))
        started = time.monotonic()

        work = settings.work_dir / job_id
        if work.exists():
            shutil.rmtree(work)
        work.mkdir(parents=True, exist_ok=True)

        video_path = work / "input.mp4"
        frames_dir = work / "frames"
        colmap_dir = work / "colmap"
        dataset_dir = work / "dataset"
        ply_path = work / "room.ply"
        sog_path = work / "room.sog"
        thumbnail_path = work / "thumbnail.jpg"
        keys = result_keys(job_id, settings.output_prefix)

        LOGGER.info(
            "=== job %s start backend=%s fps=%s max_width=%s iters=%s device=%s ===",
            job_id,
            cfg.splat_backend,
            cfg.frame_fps,
            cfg.frame_max_width,
            cfg.train_iterations,
            settings.gpu_device,
        )

        try:
            self.update_status(job_id, "EXTRACTING_FRAMES", progress=12, gpu_type=metrics.gpu_device)
            LOGGER.info("[1] download + validate input video")
            self.store.download(video_path, uri=request.input_uri, key=request.original_video_key)
            video = validate_video(video_path, settings)
            metrics.video_duration_seconds = video["duration"]
            metrics.video_resolution = f"{video['width']}x{video['height']}"

            LOGGER.info("[2] extract frames with FFmpeg")
            t0 = time.monotonic()
            _run_script(
                "extract_frames.sh",
                [str(video_path), str(frames_dir), str(cfg.frame_fps), str(cfg.frame_max_width)],
                stage="EXTRACTING_FRAMES",
                env=_stage_env(settings, cfg),
            )
            metrics.frame_count = validate_frames(frames_dir, settings)
            _extract_thumbnail(video_path, thumbnail_path, video["duration"])
            metrics.extract_ms = _elapsed_ms(t0)
            self.update_status(
                job_id,
                "EXTRACTING_FRAMES",
                progress=22,
                frame_count=metrics.frame_count,
                gpu_type=metrics.gpu_device,
            )

            LOGGER.info("[3-6] COLMAP feature extraction, matching, SfM, pose verify")
            self.update_status(job_id, "RUNNING_COLMAP", progress=28, gpu_type=metrics.gpu_device)
            t0 = time.monotonic()
            _run_script(
                "run_colmap.sh",
                ["features", str(frames_dir), str(colmap_dir)],
                stage="COLMAP_FEATURES",
                env=_stage_env(settings, cfg),
            )
            self.update_status(job_id, "RUNNING_COLMAP", progress=36, gpu_type=metrics.gpu_device)
            _run_script(
                "run_colmap.sh",
                ["match", str(frames_dir), str(colmap_dir)],
                stage="COLMAP_MATCH",
                env=_stage_env(settings, cfg),
            )
            self.update_status(job_id, "RUNNING_COLMAP", progress=44, gpu_type=metrics.gpu_device)
            _run_script(
                "run_colmap.sh",
                ["sfm", str(frames_dir), str(colmap_dir)],
                stage="COLMAP_SFM",
                env=_stage_env(settings, cfg),
            )
            poses = validate_colmap_poses(colmap_dir / "0", settings)
            metrics.registered_cameras = poses["registered_cameras"]
            metrics.sparse_points = poses["sparse_points"]
            metrics.colmap_ms = _elapsed_ms(t0)
            _prepare_dataset(dataset_dir, frames_dir, colmap_dir / "0")
            LOGGER.info(
                "COLMAP ok cameras=%s points=%s",
                metrics.registered_cameras,
                metrics.sparse_points,
            )
            self.update_status(job_id, "RUNNING_COLMAP", progress=52, gpu_type=metrics.gpu_device)

            LOGGER.info("[7] Gaussian Splatting training (%s)", cfg.splat_backend)
            self.update_status(job_id, "TRAINING_SPLAT", progress=55, gpu_type=metrics.gpu_device)
            t0 = time.monotonic()
            _run_script(
                "train_splat.sh",
                [str(dataset_dir), str(work / "train"), str(ply_path)],
                stage="TRAINING_SPLAT",
                env=_stage_env(settings, cfg),
            )
            ply_info = validate_ply(ply_path, settings)
            metrics.gaussian_count = ply_info["vertices"]
            metrics.ply_bytes = ply_info["bytes"]
            metrics.train_ms = _elapsed_ms(t0)
            self.update_status(job_id, "TRAINING_SPLAT", progress=74, gpu_type=metrics.gpu_device)

            LOGGER.info("[8] PLY -> SOG via PlayCanvas SplatTransform")
            self.update_status(job_id, "CONVERTING_SOG", progress=78, gpu_type=metrics.gpu_device)
            t0 = time.monotonic()
            _run_script(
                "convert_sog.sh",
                [str(ply_path), str(sog_path)],
                stage="CONVERTING_SOG",
                env=_stage_env(settings, cfg),
            )
            sog_info = validate_sog(sog_path, settings)
            metrics.sog_bytes = sog_info["bytes"]
            metrics.convert_ms = _elapsed_ms(t0)
            self.update_status(job_id, "CONVERTING_SOG", progress=86, gpu_type=metrics.gpu_device)

            LOGGER.info("[9] upload reconstructions/%s/", job_id)
            self.update_status(job_id, "UPLOADING_RESULT", progress=90, gpu_type=metrics.gpu_device)
            t0 = time.monotonic()
            ply_url, _ = self.store.upload(ply_path, keys["ply"], "application/octet-stream")
            sog_url, sog_size = self.store.upload(sog_path, keys["sog"], "application/octet-stream")
            thumb_url = None
            thumb_key = None
            if thumbnail_path.exists():
                thumb_url, metrics.thumbnail_bytes = self.store.upload(
                    thumbnail_path,
                    keys["thumbnail"],
                    "image/jpeg",
                )
                thumb_key = keys["thumbnail"]
            metrics.sog_bytes = sog_size
            metrics.upload_ms = _elapsed_ms(t0)
            metrics.total_ms = _elapsed_ms(started)

            LOGGER.info("metrics %s", metrics)
            return PipelineResult(
                metrics=metrics,
                ply_key=keys["ply"],
                ply_url=ply_url,
                sog_key=keys["sog"],
                sog_url=sog_url,
                thumbnail_key=thumb_key,
                thumbnail_url=thumb_url,
            )
        except PipelineError:
            raise
        except Exception as exc:
            raise PipelineError("pipeline", str(exc), recoverable=False) from exc
        finally:
            if settings.keep_scratch:
                LOGGER.info("scratch kept at %s", work)
            else:
                shutil.rmtree(work, ignore_errors=True)
                LOGGER.info("scratch removed %s", work)


def _merge_config(config: JobConfig, settings: Settings) -> JobConfig:
    return JobConfig(
        splat_backend=config.splat_backend or settings.splat_backend,
        name=config.name,
        frame_fps=config.frame_fps or settings.frame_fps,
        frame_max_width=config.frame_max_width or settings.frame_max_width,
        train_iterations=config.train_iterations or settings.train_iterations,
        train_data_factor=config.train_data_factor or settings.train_data_factor,
        splat_train_cmd=config.splat_train_cmd or settings.splat_train_cmd,
        sog_convert_cmd=config.sog_convert_cmd or settings.sog_convert_cmd,
    )


def _stage_env(settings: Settings, cfg: JobConfig) -> dict[str, str]:
    env = os.environ.copy()
    env["CUDA_VISIBLE_DEVICES"] = settings.gpu_device
    env["COLMAP_USE_GPU"] = str(settings.colmap_use_gpu)
    env["COLMAP_CAMERA_MODEL"] = settings.colmap_camera_model
    env["SPLAT_BACKEND"] = cfg.splat_backend
    env["SPLAT_TRAIN_CMD"] = cfg.splat_train_cmd
    env["SOG_CONVERT_CMD"] = cfg.sog_convert_cmd
    env["GSPLAT_EXAMPLES_DIR"] = str(settings.gsplat_examples_dir)
    env["GAUSSIAN_SPLATTING_DIR"] = str(settings.gaussian_splatting_dir)
    env["TRAIN_ITERATIONS"] = str(cfg.train_iterations)
    env["TRAIN_DATA_FACTOR"] = str(cfg.train_data_factor)
    env["FRAME_FPS"] = str(cfg.frame_fps)
    env["FRAME_MAX_WIDTH"] = str(cfg.frame_max_width)
    env["GPU_DEVICE"] = settings.gpu_device
    return env


def _prepare_dataset(dataset_dir: Path, frames_dir: Path, sparse_model: Path) -> None:
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    images = dataset_dir / "images"
    sparse = dataset_dir / "sparse" / "0"
    dataset_dir.mkdir(parents=True, exist_ok=True)
    sparse.parent.mkdir(parents=True, exist_ok=True)
    _link_or_copy(frames_dir, images)
    _link_or_copy(sparse_model, sparse)


def _link_or_copy(src: Path, dest: Path) -> None:
    try:
        dest.symlink_to(src, target_is_directory=src.is_dir())
    except OSError:
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)


def _extract_thumbnail(video_path: Path, dest: Path, duration: float | None) -> None:
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


def _run_script(name: str, args: list[str], *, stage: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    script = SCRIPT_DIR / name
    if not script.exists():
        raise PipelineError(stage, f"Missing worker script {script}", recoverable=False)
    command = ["bash", str(script), *args]
    LOGGER.info("[%s] $ %s", stage, " ".join(command))
    result = subprocess.run(command, check=False, text=True, capture_output=True, env=env)
    if result.stdout:
        LOGGER.info("[%s] stdout\n%s", stage, result.stdout.strip())
    if result.stderr:
        LOGGER.info("[%s] stderr\n%s", stage, result.stderr.strip())
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip() or f"exit {result.returncode}"
        raise PipelineError(stage, detail)
    return result


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def _gpu_label(settings: Settings) -> str:
    if settings.gpu_type:
        return settings.gpu_type
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            check=False,
            capture_output=True,
            text=True,
        )
        name = (result.stdout or "").strip().splitlines()[0] if result.returncode == 0 else ""
        if name:
            return name
    except Exception:
        pass
    return f"cuda:{settings.gpu_device}" if settings.gpu_device else "cpu"


def job_config_from_payload(payload: dict[str, Any], settings: Settings) -> JobConfig:
    backend = str(payload.get("splatBackend") or settings.splat_backend)
    if backend not in {"gsplat", "original", "external"}:
        backend = settings.splat_backend
    return JobConfig(
        splat_backend=backend,
        name=str(payload.get("name") or ""),
        frame_fps=float(payload.get("frameFps") or 0),
        frame_max_width=int(payload.get("frameMaxWidth") or 0),
        train_iterations=int(payload.get("trainIterations") or 0),
        train_data_factor=int(payload.get("trainDataFactor") or 0),
        splat_train_cmd="",
        sog_convert_cmd="",
    )
