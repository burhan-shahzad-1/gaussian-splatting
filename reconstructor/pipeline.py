"""Fast draft reconstruction: FFmpeg -> VGGT cameras -> short gsplat -> PlayCanvas SOG."""

from __future__ import annotations

import logging
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from config import Settings, result_keys
from errors import CudaOomError, PipelineError
from stages import (
    convert_sog,
    estimate_cameras,
    extract_equirect_pano,
    extract_frames,
    extract_thumbnail,
    prepare_dataset,
    train_gsplat,
)
from storage import ObjectStore
from validate import validate_frames, validate_ply, validate_poses, validate_sog, validate_video

LOGGER = logging.getLogger("gsplat.reconstructor.pipeline")
StatusFn = Callable[..., None]


@dataclass
class JobConfig:
    splat_backend: str = "gsplat"
    name: str = ""
    frame_fps: float = 0.0
    frame_max_width: int = 0
    frame_max_count: int = 0
    train_iterations: int = 0
    train_data_factor: int = 0


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
    cameras_ms: int = 0
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
    pano_key: str | None = None
    pano_url: str | None = None


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
        dataset_dir = work / "dataset"
        ply_path = work / "room.ply"
        sog_path = work / "room.sog"
        thumbnail_path = work / "thumbnail.jpg"
        pano_path = work / "pano.jpg"
        keys = result_keys(job_id, settings.output_prefix)

        LOGGER.info(
            "=== job %s draft fps=%s max_width=%s max_frames=%s iters=%s data_factor=%s ===",
            job_id,
            cfg.frame_fps,
            cfg.frame_max_width,
            cfg.frame_max_count,
            cfg.train_iterations,
            cfg.train_data_factor,
        )

        try:
            self.update_status(job_id, "EXTRACTING_FRAMES", progress=12, gpu_type=metrics.gpu_device)
            self.store.download(video_path, uri=request.input_uri, key=request.original_video_key)
            video = validate_video(video_path, settings)
            metrics.video_duration_seconds = video["duration"]
            metrics.video_resolution = f"{video['width']}x{video['height']}"

            t0 = time.monotonic()
            extract_frames(
                video_path,
                frames_dir,
                fps=5.0 if video.get("equirect") else cfg.frame_fps,
                max_width=min(2048, video["width"]) if video.get("equirect") else cfg.frame_max_width,
                max_count=max(cfg.frame_max_count, 24) if video.get("equirect") else cfg.frame_max_count,
            )
            metrics.frame_count = validate_frames(frames_dir, settings)
            extract_thumbnail(video_path, thumbnail_path, video["duration"])
            if video.get("equirect"):
                extract_equirect_pano(video_path, pano_path, video["duration"])
            metrics.extract_ms = _elapsed_ms(t0)
            self.update_status(
                job_id,
                "EXTRACTING_FRAMES",
                progress=22,
                frame_count=metrics.frame_count,
                gpu_type=metrics.gpu_device,
            )

            if video.get("equirect") and pano_path.exists():
                return self._publish_panorama(
                    job_id,
                    keys,
                    metrics,
                    started,
                    thumbnail_path,
                    pano_path,
                )

            # Status enum keeps RUNNING_COLMAP; copy elsewhere says "estimating cameras".
            self.update_status(job_id, "RUNNING_COLMAP", progress=28, gpu_type=metrics.gpu_device)
            t0 = time.monotonic()
            prepare_dataset(dataset_dir, frames_dir)
            try:
                model_dir = estimate_cameras(dataset_dir, settings)
            except CudaOomError:
                raise
            except PipelineError:
                raise
            except Exception as exc:
                if _is_oom(exc):
                    raise CudaOomError("RUNNING_COLMAP", str(exc)) from exc
                raise PipelineError("RUNNING_COLMAP", str(exc)) from exc

            poses = validate_poses(model_dir, settings)
            metrics.registered_cameras = poses["registered_cameras"]
            metrics.sparse_points = poses["sparse_points"]
            metrics.cameras_ms = _elapsed_ms(t0)
            self.update_status(job_id, "RUNNING_COLMAP", progress=52, gpu_type=metrics.gpu_device)

            self.update_status(job_id, "TRAINING_SPLAT", progress=55, gpu_type=metrics.gpu_device)
            t0 = time.monotonic()
            try:
                train_gsplat(dataset_dir, work / "train", ply_path, settings)
            except CudaOomError:
                raise
            except PipelineError:
                raise
            except Exception as exc:
                if _is_oom(exc):
                    raise CudaOomError("TRAINING_SPLAT", str(exc)) from exc
                raise PipelineError("TRAINING_SPLAT", str(exc)) from exc

            ply_info = validate_ply(ply_path, settings)
            metrics.gaussian_count = ply_info["vertices"]
            metrics.ply_bytes = ply_info["bytes"]
            metrics.train_ms = _elapsed_ms(t0)
            self.update_status(job_id, "TRAINING_SPLAT", progress=74, gpu_type=metrics.gpu_device)

            self.update_status(job_id, "CONVERTING_SOG", progress=78, gpu_type=metrics.gpu_device)
            t0 = time.monotonic()
            convert_sog(ply_path, sog_path, settings)
            sog_info = validate_sog(sog_path, settings)
            metrics.sog_bytes = sog_info["bytes"]
            metrics.convert_ms = _elapsed_ms(t0)
            self.update_status(job_id, "CONVERTING_SOG", progress=86, gpu_type=metrics.gpu_device)

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
            if _is_oom(exc):
                raise CudaOomError("pipeline", str(exc)) from exc
            raise PipelineError("pipeline", str(exc), recoverable=False) from exc
        finally:
            if settings.keep_scratch:
                LOGGER.info("scratch kept at %s", work)
            else:
                shutil.rmtree(work, ignore_errors=True)
                LOGGER.info("scratch removed %s", work)

    def _publish_panorama(
        self,
        job_id: str,
        keys: dict[str, str],
        metrics: PipelineMetrics,
        started: float,
        thumbnail_path: Path,
        pano_path: Path,
    ) -> PipelineResult:
        self.update_status(job_id, "UPLOADING_RESULT", progress=90, gpu_type=metrics.gpu_device)
        t0 = time.monotonic()
        pano_url, pano_size = self.store.upload(pano_path, keys["pano"], "image/jpeg")
        thumb_url = None
        thumb_key = None
        if thumbnail_path.exists():
            thumb_url, metrics.thumbnail_bytes = self.store.upload(
                thumbnail_path,
                keys["thumbnail"],
                "image/jpeg",
            )
            thumb_key = keys["thumbnail"]
        metrics.sog_bytes = pano_size
        metrics.upload_ms = _elapsed_ms(t0)
        metrics.total_ms = _elapsed_ms(started)
        LOGGER.info("360 panorama ready job=%s pano=%s frames=%s", job_id, pano_size, metrics.frame_count)
        return PipelineResult(
            metrics=metrics,
            ply_key="",
            ply_url="",
            sog_key="",
            sog_url="",
            thumbnail_key=thumb_key,
            thumbnail_url=thumb_url,
            pano_key=keys["pano"],
            pano_url=pano_url,
        )


def _merge_config(config: JobConfig, settings: Settings) -> JobConfig:
    return JobConfig(
        splat_backend=config.splat_backend or settings.splat_backend,
        name=config.name,
        frame_fps=config.frame_fps or settings.frame_fps,
        frame_max_width=config.frame_max_width or settings.frame_max_width,
        frame_max_count=config.frame_max_count or settings.frame_max_count,
        train_iterations=config.train_iterations or settings.train_iterations,
        train_data_factor=config.train_data_factor or settings.train_data_factor,
    )


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def _is_oom(exc: BaseException) -> bool:
    text = str(exc).lower()
    return any(
        token in text
        for token in ("out of memory", "cuda out of memory", "cudnn_status_alloc_failed")
    )


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
    return JobConfig(
        splat_backend=backend,
        name=str(payload.get("name") or ""),
        frame_fps=float(payload.get("frameFps") or 0),
        frame_max_width=int(payload.get("frameMaxWidth") or 0),
        frame_max_count=int(payload.get("frameMaxCount") or 0),
        train_iterations=int(payload.get("trainIterations") or 0),
        train_data_factor=int(payload.get("trainDataFactor") or 0),
    )
