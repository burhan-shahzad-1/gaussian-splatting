"""Host reconstructor configuration. Paths and credentials come from the environment."""

from __future__ import annotations

import tempfile
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parent.parent
_HERE = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            str(_ROOT / ".env"),
            str(_ROOT / ".env.local"),
            str(_HERE / ".env"),
        ),
        extra="ignore",
    )

    app_url: str = "http://localhost:3000"
    worker_secret: str = ""
    poll_seconds: float = 8.0

    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_bucket: str = ""
    cloudfront_url: str = ""
    storage_backend: str = "s3"
    s3_endpoint: str = ""
    local_storage_dir: Path = Path(tempfile.gettempdir()) / "gsplat-objects"
    output_prefix: str = "reconstructions"

    work_dir: Path = Path(tempfile.gettempdir()) / "gsplat-work"
    keep_scratch: bool = False
    gpu_type: str = ""
    gpu_device: str = "0"

    # 8 GB laptop caps — upload-to-viewer in a couple of minutes
    frame_fps: float = 2.0
    frame_max_width: int = 640
    frame_max_count: int = 8
    min_video_seconds: float = 2.0
    min_video_width: int = 320
    min_frames: int = 4

    vggt_dir: Path = Path("")
    camera_backend: str = "fast_vggt"
    vggt_conf_thres: float = 1.0
    min_registered_cameras: int = 4
    min_sparse_points: int = 50

    splat_backend: str = "gsplat"
    gsplat_examples_dir: Path = Path("")
    train_iterations: int = 800
    train_data_factor: int = 4
    min_ply_bytes: int = 2048
    min_gaussians: int = 100

    sog_convert_cmd: str = ""
    min_sog_bytes: int = 256
    validate_sog_roundtrip: bool = False


def result_keys(job_id: str, prefix: str = "reconstructions") -> dict[str, str]:
    root = f"{prefix.strip('/')}/{job_id}"
    return {
        "ply": f"{root}/room.ply",
        "sog": f"{root}/room.sog",
        "thumbnail": f"{root}/thumbnail.jpg",
        "pano": f"{root}/pano.jpg",
    }
