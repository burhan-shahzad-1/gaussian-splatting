import type { ReconstructionJob } from "@prisma/client";
import type { ReconstructionStatus, RoomProject } from "@/lib/types";
import { isLikelyEquirect, parseResolution } from "@/lib/viewer/equirect";

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toNumber(value: bigint | number | null | undefined) {
  if (value == null) return null;
  return typeof value === "bigint" ? Number(value) : value;
}

export function toRoomProject(job: ReconstructionJob): RoomProject {
  return {
    id: job.id,
    name: job.name,
    status: job.status as ReconstructionStatus,
    progress: job.progress,
    sourceVideoName: job.originalVideoName,
    sourceVideoKey: job.originalVideoKey,
    sourceVideoUrl: job.originalVideoUrl,
    durationSeconds: job.durationSeconds,
    fileSizeBytes: toNumber(job.sourceSizeBytes),
    outputSizeBytes: toNumber(job.outputSizeBytes),
    resolution: job.resolution,
    frameCount: job.frameCount,
    processingMs: job.processingMs,
    gpuType: job.gpuType,
    thumbnailDataUrl: job.thumbnailUrl,
    plyUrl: job.outputSplatUrl,
    sogUrl: job.outputSogUrl,
    panoUrl: panoramaUrl(job),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: toIso(job.startedAt),
    completedAt: toIso(job.completedAt),
    errorMessage: job.error,
  };
}

function panoramaUrl(job: ReconstructionJob) {
  if (!job.thumbnailKey?.endsWith("pano.jpg")) return null;
  const size = parseResolution(job.resolution);
  if (size && !isLikelyEquirect(size.width, size.height)) return null;
  return job.thumbnailUrl;
}

export function jsonSafeJob(job: ReconstructionJob) {
  return {
    ...job,
    sourceSizeBytes: toNumber(job.sourceSizeBytes),
    outputSizeBytes: toNumber(job.outputSizeBytes),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    claimedAt: toIso(job.claimedAt),
    startedAt: toIso(job.startedAt),
    completedAt: toIso(job.completedAt),
  };
}
