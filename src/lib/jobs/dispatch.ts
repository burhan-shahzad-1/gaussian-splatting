import "server-only";
import type { ReconstructionJob } from "@prisma/client";

export type WorkerDispatchResult =
  | { dispatched: true }
  | { dispatched: false; reason: string };

function workerBaseUrl() {
  return process.env.WORKER_URL?.trim().replace(/\/$/, "") ?? "";
}

export function workerPayload(job: ReconstructionJob) {
  return {
    jobId: job.id,
    inputUri: job.originalVideoUrl ?? job.originalVideoKey,
    originalVideoKey: job.originalVideoKey,
    config: {
      splatBackend: job.splatBackend,
      name: job.name,
    },
  };
}

export async function notifyGpuWorker(job: ReconstructionJob): Promise<WorkerDispatchResult> {
  // Optional push. The host reconstructor primarily polls /api/internal/jobs/claim.
  const base = workerBaseUrl();
  if (!base) {
    return {
      dispatched: false,
      reason: "WORKER_URL is not set; the job stays queued for the local reconstructor poller.",
    };
  }

  const secret = process.env.WORKER_SECRET?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  try {
    const response = await fetch(`${base}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify(workerPayload(job)),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return { dispatched: false, reason: `Worker responded ${response.status}` };
    }
    return { dispatched: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Worker unreachable";
    console.warn(`[jobs] optional worker notify failed for ${job.id}: ${reason}`);
    return { dispatched: false, reason };
  }
}
