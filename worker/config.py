"""Worker configuration. Paths and credentials come from the environment, never from code."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    app_url: str = "http://localhost:3000"
    worker_secret: str = ""
    worker_poll: bool = True
    poll_seconds: float = 8.0

    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_bucket: str = ""
    cloudfront_url: str = ""
    storage_backend: str = "s3"
    local_storage_dir: Path = Path("/work/objects")
    s3_endpoint: str = ""
    output_prefix: str = "reconstructions"

    keep_scratch: bool = False
    gpu_type: str = ""
    gpu_device: str = "0"

    frame_fps: float = 2.0
    frame_max_width: int = 1600
    min_video_seconds: float = 2.0
    min_video_width: int = 320
    min_frames: int = 8

    colmap_use_gpu: int = 0
    colmap_camera_model: str = "SIMPLE_PINHOLE"
    min_registered_cameras: int = 8
    min_sparse_points: int = 50

    splat_backend: str = "gsplat"
    splat_train_cmd: str = ""
    gsplat_examples_dir: Path = Path("/opt/gsplat/examples")
    gaussian_splatting_dir: Path = Path("/opt/gaussian-splatting")
    train_iterations: int = 30_000
    train_data_factor: int = 1
    min_ply_bytes: int = 2048
    min_gaussians: int = 100

    sog_convert_cmd: str = ""
    min_sog_bytes: int = 256
    validate_sog_roundtrip: bool = True


def result_keys(job_id: str, prefix: str = "reconstructions") -> dict[str, str]:
    root = f"{prefix.strip('/')}/{job_id}"
    return {
        "ply": f"{root}/room.ply",
        "sog": f"{root}/room.sog",
        "thumbnail": f"{root}/thumbnail.jpg",
    }
