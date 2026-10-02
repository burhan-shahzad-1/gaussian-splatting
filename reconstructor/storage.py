"""Object storage for the host reconstructor. Credentials come from the environment."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse

import boto3
import httpx
from botocore.config import Config as BotoConfig

from config import Settings
from errors import PipelineError

LOGGER = logging.getLogger("gsplat.reconstructor.storage")


class ObjectStore(Protocol):
    def public_url(self, key: str) -> str: ...

    def download(self, dest: Path, *, uri: str | None, key: str | None) -> Path: ...

    def upload(self, local_path: Path, key: str, content_type: str) -> tuple[str, int]: ...


class S3ObjectStore:
    def __init__(self, settings: Settings) -> None:
        if not settings.s3_bucket:
            raise PipelineError("storage", "S3_BUCKET is not set on the reconstructor.", recoverable=False)

        self._bucket = settings.s3_bucket
        self._cdn = settings.cloudfront_url.rstrip("/")
        boto_kwargs: dict = {"retries": {"max_attempts": 5, "mode": "standard"}}
        if settings.s3_endpoint:
            boto_kwargs["s3"] = {"addressing_style": "path"}
        kwargs: dict = {
            "region_name": settings.aws_region,
            "config": BotoConfig(**boto_kwargs),
        }
        if settings.s3_endpoint:
            kwargs["endpoint_url"] = settings.s3_endpoint
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        self._client = boto3.client("s3", **kwargs)

    def public_url(self, key: str) -> str:
        if self._cdn:
            return f"{self._cdn}/{key}"
        return f"s3://{self._bucket}/{key}"

    def download(self, dest: Path, *, uri: str | None, key: str | None) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        local = _local_source(uri)
        if local:
            shutil.copyfile(local, dest)
            LOGGER.info("copied local source %s -> %s", local, dest)
            return dest

        source_key = key or _key_from_uri(uri)
        if uri and uri.startswith(("http://", "https://")) and not source_key:
            _http_download(uri, dest)
            return dest

        if not source_key:
            raise PipelineError("storage", "Job is missing originalVideoKey / inputUri.")

        LOGGER.info("download s3://%s/%s -> %s", self._bucket, source_key, dest)
        try:
            self._client.download_file(self._bucket, source_key, str(dest))
        except Exception as exc:
            if uri and uri.startswith(("http://", "https://")):
                LOGGER.warning("S3 download failed (%s); trying public URI", exc)
                _http_download(uri, dest)
                return dest
            raise PipelineError("storage", f"Could not download source video: {exc}") from exc
        return dest

    def upload(self, local_path: Path, key: str, content_type: str) -> tuple[str, int]:
        size = local_path.stat().st_size
        LOGGER.info("upload %s -> s3://%s/%s (%s bytes)", local_path, self._bucket, key, size)
        extra = {
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000, immutable",
        }
        self._client.upload_file(str(local_path), self._bucket, key, ExtraArgs=extra)
        return self.public_url(key), size


class LocalObjectStore:
    def __init__(self, settings: Settings) -> None:
        self._root = settings.local_storage_dir
        self._cdn = settings.cloudfront_url.rstrip("/")
        self._root.mkdir(parents=True, exist_ok=True)

    def public_url(self, key: str) -> str:
        if self._cdn:
            return f"{self._cdn}/{key}"
        return (self._root / key).as_uri()

    def download(self, dest: Path, *, uri: str | None, key: str | None) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        local = _local_source(uri)
        if local:
            shutil.copyfile(local, dest)
            return dest
        if key:
            src = self._root / key
            if src.exists():
                shutil.copyfile(src, dest)
                return dest
        if uri and uri.startswith(("http://", "https://")):
            _http_download(uri, dest)
            return dest
        raise PipelineError("storage", "Local storage could not find the source video.")

    def upload(self, local_path: Path, key: str, content_type: str) -> tuple[str, int]:
        dest = self._root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local_path, dest)
        return self.public_url(key), dest.stat().st_size


def create_store(settings: Settings) -> ObjectStore:
    backend = settings.storage_backend.strip().lower()
    if backend == "local":
        LOGGER.info("storage backend=local dir=%s", settings.local_storage_dir)
        return LocalObjectStore(settings)
    LOGGER.info(
        "storage backend=s3 bucket=%s endpoint=%s cdn=%s",
        settings.s3_bucket,
        settings.s3_endpoint or "aws",
        settings.cloudfront_url,
    )
    return S3ObjectStore(settings)


def _local_source(uri: str | None) -> Path | None:
    if not uri:
        return None
    if uri.startswith("file://"):
        return Path(urlparse(uri).path)
    path = Path(uri)
    return path if path.exists() else None


def _key_from_uri(uri: str | None) -> str | None:
    if not uri:
        return None
    parsed = urlparse(uri)
    if parsed.scheme == "s3":
        return parsed.path.lstrip("/")
    if parsed.scheme in {"http", "https"}:
        path = parsed.path.lstrip("/")
        # MinIO path-style: /bucket/key...
        parts = path.split("/", 1)
        if len(parts) == 2 and parts[1]:
            return parts[1]
        return path or None
    if "/" in uri and not Path(uri).exists():
        return uri
    return None


def _http_download(uri: str, dest: Path) -> None:
    LOGGER.info("download %s -> %s", uri, dest)
    with httpx.stream("GET", uri, timeout=300.0, follow_redirects=True) as response:
        response.raise_for_status()
        with dest.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
