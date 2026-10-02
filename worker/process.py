"""GPU reconstruction worker HTTP/CLI entrypoint. Next.js must never import this module."""

from __future__ import annotations

import argparse
import hmac
import logging
import sys
import threading
import time
import uuid
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from config import Settings
from errors import PipelineError
from pipeline import JobConfig, JobRequest, ReconstructionPipeline, job_config_from_payload
from storage import create_store

LOGGER = logging.getLogger("gsplat.worker")


class JobRequestBody(BaseModel):
    jobId: str
    inputUri: str | None = None
    originalVideoKey: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)


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
            LOGGER.info("worker busy; leaving job %s queued", request.job_id)
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
            self._run(claimed_to_request(claimed, self.settings))
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
                    "outputSplatKey": result.ply_key,
                    "outputSplatUrl": result.ply_url,
                    "outputSogKey": result.sog_key,
                    "outputSogUrl": result.sog_url,
                    "thumbnailKey": result.thumbnail_key,
                    "thumbnailUrl": result.thumbnail_url,
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
                message = f"{exc} Recapture or requeue the job after fixing the cause."
            self.app.fail(request.job_id, message)
            raise


def job_from_body(body: JobRequestBody, settings: Settings) -> JobRequest:
    return JobRequest(
        job_id=body.jobId,
        input_uri=body.inputUri,
        original_video_key=body.originalVideoKey,
        config=job_config_from_payload(body.config or {}, settings),
    )


def claimed_to_request(claimed: dict[str, Any], settings: Settings) -> JobRequest:
    process_body = claimed.get("process") or {}
    body = JobRequestBody(
        jobId=process_body.get("jobId") or claimed["job"]["id"],
        inputUri=process_body.get("inputUri"),
        originalVideoKey=process_body.get("originalVideoKey"),
        config=process_body.get("config") or {},
    )
    return job_from_body(body, settings)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    processor = JobProcessor(settings)
    api = FastAPI(title="GSplat GPU worker", version="0.2.0")

    def authorize(authorization: str | None) -> None:
        if not settings.worker_secret:
            raise HTTPException(status_code=401, detail="Unauthorized")
        token = (authorization or "").removeprefix("Bearer ").strip()
        secret = settings.worker_secret
        if len(token) != len(secret) or not hmac.compare_digest(token, secret):
            raise HTTPException(status_code=401, detail="Unauthorized")

    @api.get("/health")
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "service": "gsplat-gpu-worker",
            "busy": processor.busy(),
        }

    @api.post("/jobs")
    def enqueue(
        body: JobRequestBody,
        background_tasks: BackgroundTasks,
        authorization: str | None = Header(default=None),
    ) -> dict[str, str]:
        authorize(authorization)
        try:
            uuid.UUID(str(body.jobId))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="jobId must be a UUID") from exc
        if processor.busy():
            LOGGER.info("defer push job=%s; worker busy", body.jobId)
            return {"status": "deferred", "jobId": body.jobId}
        request = job_from_body(body, settings)
        LOGGER.info("accepted push job=%s", request.job_id)
        background_tasks.add_task(processor.process, request)
        return {"status": "accepted", "jobId": request.job_id}

    @api.on_event("startup")
    def start_poller() -> None:
        if not settings.worker_poll:
            LOGGER.info("WORKER_POLL disabled; push /jobs only")
            return
        thread = threading.Thread(target=poll_forever, args=(processor,), daemon=True)
        thread.start()

    return api


def serve(host: str, port: int) -> None:
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port, log_level="info")


def poll_forever(processor: JobProcessor) -> None:
    settings = processor.settings
    LOGGER.info("polling %s/api/internal/jobs/claim every %ss", settings.app_url, settings.poll_seconds)
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
    parser = argparse.ArgumentParser(description="GSplat GPU worker (separate from Next.js)")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("job", help="Process a single job id")
    run.add_argument("--job-id", required=True)
    run.add_argument("--input-uri", default=None)
    run.add_argument("--original-video-key", default=None)

    serve_cmd = sub.add_parser("serve", help="HTTP job interface")
    serve_cmd.add_argument("--host", default="0.0.0.0")
    serve_cmd.add_argument("--port", type=int, default=8080)

    sub.add_parser("poll", help="Pull queued jobs from the Next.js claim API")

    args = parser.parse_args()
    settings = Settings()

    if args.command == "serve":
        serve(args.host, args.port)
        return
    if args.command == "poll":
        poll_forever(JobProcessor(settings))
        return

    processor = JobProcessor(settings)
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
