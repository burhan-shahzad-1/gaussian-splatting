"""Host-native draft reconstructor. Polls Next.js; never imported by the Next.js runtime."""

from __future__ import annotations

import argparse
import logging
import sys
import threading
import time
import uuid
from typing import Any

from config import Settings
from errors import PipelineError
from pipeline import JobConfig, JobRequest, ReconstructionPipeline, job_config_from_payload
from storage import create_store

LOGGER = logging.getLogger("gsplat.reconstructor")


class AppClient:
    def __init__(self, settings: Settings) -> None:
        import httpx

        self._base = settings.app_url.rstrip("/")
        self._secret = settings.worker_secret
        self._http = httpx.Client(timeout=60.0)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._secret:
            headers["Authorization"] = f"Bearer {self._secret}"
        return headers

    def update_status(
        self,
        job_id: str,
        status: str,
        *,
        progress: int | None = None,
        frame_count: int | None = None,
        gpu_type: str | None = None,
        error: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {"status": status}
        if progress is not None:
            payload["progress"] = progress
        if frame_count is not None:
            payload["frameCount"] = frame_count
        if gpu_type is not None:
            payload["gpuType"] = gpu_type
        if error is not None:
            payload["error"] = error
        LOGGER.info("status job=%s -> %s progress=%s", job_id, status, progress)
        response = self._http.patch(
            f"{self._base}/api/reconstructions/{job_id}",
            headers=self._headers(),
            json=payload,
        )
        if response.status_code == 409:
            LOGGER.warning(
                "status conflict job=%s -> %s progress=%s; continuing reconstruction",
                job_id,
                status,
                progress,
            )
            return
        response.raise_for_status()

    def complete(self, job_id: str, payload: dict[str, Any]) -> None:
        LOGGER.info("complete job=%s", job_id)
        response = self._http.post(
            f"{self._base}/api/reconstructions/{job_id}/complete",
            headers=self._headers(),
            json=payload,
        )
        response.raise_for_status()

    def fail(self, job_id: str, error: str) -> None:
        LOGGER.error("fail job=%s error=%s", job_id, error)
        try:
            response = self._http.post(
                f"{self._base}/api/reconstructions/{job_id}/fail",
                headers=self._headers(),
                json={"error": error},
            )
            response.raise_for_status()
        except Exception:
            LOGGER.exception("could not mark job %s failed", job_id)

    def claim_next(self, gpu_type: str | None) -> dict[str, Any] | None:
        response = self._http.post(
            f"{self._base}/api/internal/jobs/claim",
            headers=self._headers(),
            json={"gpuType": gpu_type},
        )
        if response.status_code == 204:
            return None
        response.raise_for_status()
        return response.json()

    def claim_job(self, job_id: str, gpu_type: str | None) -> dict[str, Any] | None:
        response = self._http.post(
            f"{self._base}/api/internal/jobs/{job_id}/claim",
            headers=self._headers(),
            json={"gpuType": gpu_type},
        )
        if response.status_code == 204:
            return None
        response.raise_for_status()
        return response.json()


class JobProcessor:
    def __init__(self, settings: Settings) -> None:
        if not settings.worker_secret.strip():
            raise SystemExit("WORKER_SECRET must be set (same value as Next.js .env.local).")
        self.settings = settings
        self.app = AppClient(settings)
        self._store = None
        self._pipeline = None
        self._lock = threading.Lock()

    @property
    def store(self):
        if self._store is None:
            self._store = create_store(self.settings)
        return self._store

    @property
    def pipeline(self):
        if self._pipeline is None:
            self._pipeline = ReconstructionPipeline(self.settings, self.store, self.app.update_status)
        return self._pipeline

    def busy(self) -> bool:
        return self._lock.locked()

    def process(self, request: JobRequest) -> None:
        if not self._lock.acquire(blocking=False):
            LOGGER.info("reconstructor busy; leaving job %s queued", request.job_id)
            return
        try:
            claimed = self.app.claim_job(request.job_id, self.settings.gpu_type or None)
            if not claimed:
                LOGGER.info("job %s is not queued; skip", request.job_id)
                return
            self._run(claimed_to_request(claimed, self.settings))
        finally:
            self._lock.release()

    def process_next(self) -> bool:
        if not self._lock.acquire(blocking=False):
            return False
        try:
            claimed = self.app.claim_next(self.settings.gpu_type or None)
            if not claimed:
                return False
            try:
                self._run(claimed_to_request(claimed, self.settings))
            except Exception:
                LOGGER.exception("job failed; poller will keep looking for work")
            return True
        finally:
            self._lock.release()

    def _run(self, request: JobRequest) -> None:
        try:
            result = self.pipeline.run(request)
            metrics = result.metrics
            self.app.complete(
                request.job_id,
                {
                    "outputSplatKey": result.pano_key or result.ply_key,
                    "outputSplatUrl": result.pano_url or result.ply_url,
                    "outputSogKey": result.sog_key or result.pano_key,
                    "outputSogUrl": result.sog_url or result.pano_url,
                    "thumbnailKey": result.pano_key or result.thumbnail_key,
                    "thumbnailUrl": result.pano_url or result.thumbnail_url,
                    "outputSizeBytes": metrics.sog_bytes,
                    "processingMs": metrics.total_ms,
                    "frameCount": metrics.frame_count,
                    "gpuType": metrics.gpu_device,
                },
            )
            LOGGER.info(
                "=== job %s completed ply=%s sog=%s cameras=%s gaussians=%s total_ms=%s ===",
                request.job_id,
                metrics.ply_bytes,
                metrics.sog_bytes,
                metrics.registered_cameras,
                metrics.gaussian_count,
                metrics.total_ms,
            )
        except Exception as exc:
            LOGGER.exception("job %s failed", request.job_id)
            message = str(exc)
            if isinstance(exc, PipelineError) and exc.recoverable:
                message = f"{exc} Recapture or requeue after fixing the cause."
            self.app.fail(request.job_id, message)
            raise


def claimed_to_request(claimed: dict[str, Any], settings: Settings) -> JobRequest:
    process_body = claimed.get("process") or {}
    job_id = process_body.get("jobId") or claimed["job"]["id"]
    try:
        uuid.UUID(str(job_id))
    except ValueError as exc:
        raise PipelineError("claim", f"jobId must be a UUID: {job_id}", recoverable=False) from exc
    return JobRequest(
        job_id=str(job_id),
        input_uri=process_body.get("inputUri"),
        original_video_key=process_body.get("originalVideoKey"),
        config=job_config_from_payload(process_body.get("config") or {}, settings),
    )


def poll_forever(processor: JobProcessor) -> None:
    settings = processor.settings
    LOGGER.info(
        "polling %s/api/internal/jobs/claim every %ss (draft reconstructor)",
        settings.app_url,
        settings.poll_seconds,
    )
    while True:
        try:
            if processor.busy():
                time.sleep(settings.poll_seconds)
                continue
            if not processor.process_next():
                time.sleep(settings.poll_seconds)
        except KeyboardInterrupt:
            LOGGER.info("poller stopped")
            return
        except Exception:
            LOGGER.exception("poll loop error")
            time.sleep(settings.poll_seconds)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="GSplat host draft reconstructor (not Next.js)")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("job", help="Process a single queued job id")
    run.add_argument("--job-id", required=True)
    run.add_argument("--input-uri", default=None)
    run.add_argument("--original-video-key", default=None)

    sub.add_parser("poll", help="Pull queued jobs from the Next.js claim API")

    args = parser.parse_args()
    settings = Settings()
    processor = JobProcessor(settings)

    if args.command == "poll":
        poll_forever(processor)
        return

    processor.process(
        JobRequest(
            job_id=args.job_id,
            input_uri=args.input_uri,
            original_video_key=args.original_video_key,
            config=JobConfig(splat_backend=settings.splat_backend),
        )
    )


if __name__ == "__main__":
    main()
