import "server-only";
import type { Prisma, ReconstructionJob, ReconstructionStatus } from "@prisma/client";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import {
  DatabaseNotConfiguredError,
  JobConflictError,
  JobNotFoundError,
} from "@/lib/jobs/errors";
import { PIPELINE_ORDER } from "@/lib/status";

const PROCESSING_STATUSES: ReconstructionStatus[] = [
  "EXTRACTING_FRAMES",
  "RUNNING_COLMAP",
  "TRAINING_SPLAT",
  "CONVERTING_SOG",
  "UPLOADING_RESULT",
];

function requireDatabase() {
  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError();
  }
}

function asBytes(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return BigInt(Math.max(0, Math.round(value)));
}

function canTransition(from: ReconstructionStatus, to: ReconstructionStatus) {
  if (from === to) return true;
  if (from === "FAILED" || from === "COMPLETED") return false;
  if (to === "FAILED" || to === "COMPLETED" || to === "UPLOADING") return false;
  const fromIndex = PIPELINE_ORDER.indexOf(from as (typeof PIPELINE_ORDER)[number]);
  const toIndex = PIPELINE_ORDER.indexOf(to as (typeof PIPELINE_ORDER)[number]);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex >= fromIndex;
}

export type CreateReconstructionInput = {
  name: string;
  originalVideoName?: string | null;
  originalVideoKey?: string | null;
  originalVideoUrl?: string | null;
  sourceSizeBytes?: number | null;
  durationSeconds?: number | null;
  resolution?: string | null;
  thumbnailUrl?: string | null;
};

export type UpdateReconstructionStatusInput = {
  status: ReconstructionStatus;
  progress?: number;
  frameCount?: number | null;
  gpuType?: string | null;
  error?: string | null;
};

export type MarkCompletedInput = {
  outputSplatKey?: string | null;
  outputSplatUrl: string;
  outputSogKey?: string | null;
  outputSogUrl: string;
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
  outputSizeBytes?: number | null;
  processingMs?: number | null;
  frameCount?: number | null;
  gpuType?: string | null;
};

export async function createReconstruction(
  input: CreateReconstructionInput,
): Promise<ReconstructionJob> {
  requireDatabase();
  const name = input.name.trim() || "Untitled room";

  return prisma.reconstructionJob.create({
    data: {
      name,
      status: "UPLOADING",
      progress: 2,
      originalVideoName: input.originalVideoName ?? null,
      originalVideoKey: input.originalVideoKey ?? null,
      originalVideoUrl: input.originalVideoUrl ?? null,
      sourceSizeBytes: asBytes(input.sourceSizeBytes),
      durationSeconds: input.durationSeconds ?? null,
      resolution: input.resolution ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
    },
  });
}

export async function getReconstruction(id: string): Promise<ReconstructionJob | null> {
  requireDatabase();
  return prisma.reconstructionJob.findUnique({ where: { id } });
}

export async function requireReconstruction(id: string): Promise<ReconstructionJob> {
  const job = await getReconstruction(id);
  if (!job) throw new JobNotFoundError(id);
  return job;
}

export async function listReconstructions(): Promise<ReconstructionJob[]> {
  requireDatabase();
  return prisma.reconstructionJob.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateReconstructionStatus(
  id: string,
  input: UpdateReconstructionStatusInput,
): Promise<ReconstructionJob> {
  requireDatabase();
  const current = await requireReconstruction(id);
  if (!canTransition(current.status, input.status)) {
    throw new JobConflictError(
      `Cannot move a ${current.status} job to ${input.status}.`,
    );
  }

  const progress =
    input.progress != null
      ? Math.max(0, Math.min(100, Math.round(input.progress)))
      : undefined;

  const data: Prisma.ReconstructionJobUpdateInput = {
    status: input.status,
    error: input.status === "FAILED" ? input.error ?? "Reconstruction failed." : null,
  };

  if (progress != null) data.progress = progress;
  if (input.frameCount !== undefined) data.frameCount = input.frameCount;
  if (input.gpuType !== undefined) data.gpuType = input.gpuType;
  if (input.status === "QUEUED" && current.status === "UPLOADING") data.claimedAt = null;
  if (current.status === "QUEUED" && input.status !== "QUEUED" && input.status !== "UPLOADING") {
    data.claimedAt = current.claimedAt ?? new Date();
  }
  if (PROCESSING_STATUSES.includes(input.status) && !current.startedAt) {
    data.startedAt = new Date();
  }

  return prisma.reconstructionJob.update({
    where: { id },
    data,
  });
}

export async function markReconstructionFailed(id: string, error: string): Promise<ReconstructionJob> {
  requireDatabase();
  const current = await requireReconstruction(id);
  if (current.status === "COMPLETED") {
    throw new JobConflictError("A completed reconstruction cannot be marked failed.");
  }

  return prisma.reconstructionJob.update({
    where: { id },
    data: {
      status: "FAILED",
      error: error.trim() || "Reconstruction failed.",
      completedAt: new Date(),
    },
  });
}

export async function markReconstructionCompleted(
  id: string,
  input: MarkCompletedInput,
): Promise<ReconstructionJob> {
  requireDatabase();
  const current = await requireReconstruction(id);
  if (current.status === "UPLOADING" || current.status === "QUEUED") {
    throw new JobConflictError("This job has not produced a splat yet.");
  }

  if (!input.outputSplatUrl || !input.outputSogUrl) {
    throw new JobConflictError("A completed reconstruction needs splat and SOG URLs.");
  }

  return prisma.reconstructionJob.update({
    where: { id },
    data: {
      status: "COMPLETED",
      progress: 100,
      error: null,
      outputSplatKey: input.outputSplatKey ?? null,
      outputSplatUrl: input.outputSplatUrl,
      outputSogKey: input.outputSogKey ?? null,
      outputSogUrl: input.outputSogUrl ?? null,
      thumbnailKey: input.thumbnailKey ?? undefined,
      thumbnailUrl: input.thumbnailUrl ?? undefined,
      outputSizeBytes: asBytes(input.outputSizeBytes),
      processingMs: input.processingMs ?? undefined,
      frameCount: input.frameCount ?? undefined,
      gpuType: input.gpuType ?? undefined,
      completedAt: new Date(),
    },
  });
}

export async function queueReconstruction(
  id: string,
  patch: {
    originalVideoKey: string;
    originalVideoUrl: string;
    originalVideoName?: string | null;
    sourceSizeBytes?: number | null;
    durationSeconds?: number | null;
    resolution?: string | null;
    thumbnailUrl?: string | null;
    name?: string | null;
  },
): Promise<ReconstructionJob> {
  requireDatabase();
  const current = await requireReconstruction(id);

  if (current.status !== "UPLOADING") {
    throw new JobConflictError("Only uploads in progress can be queued.");
  }

  return prisma.reconstructionJob.update({
    where: { id },
    data: {
      status: "QUEUED",
      progress: 8,
      error: null,
      originalVideoKey: patch.originalVideoKey,
      originalVideoUrl: patch.originalVideoUrl,
      originalVideoName: patch.originalVideoName ?? current.originalVideoName,
      sourceSizeBytes: asBytes(patch.sourceSizeBytes) ?? current.sourceSizeBytes,
      durationSeconds: patch.durationSeconds ?? current.durationSeconds,
      resolution: patch.resolution ?? current.resolution,
      thumbnailUrl: patch.thumbnailUrl ?? current.thumbnailUrl,
      name: patch.name?.trim() || current.name,
    },
  });
}

export async function abandonReconstruction(id: string, error: string): Promise<ReconstructionJob> {
  requireDatabase();
  const current = await requireReconstruction(id);

  if (current.status !== "UPLOADING") {
    throw new JobConflictError("Only an in-progress upload can be abandoned.");
  }

  return markReconstructionFailed(id, error);
}

export async function retryReconstruction(id: string): Promise<ReconstructionJob> {
  requireDatabase();
  const current = await requireReconstruction(id);

  if (current.status !== "FAILED") {
    throw new JobConflictError("Only a failed reconstruction can be retried.");
  }
  if (!current.originalVideoKey && !current.originalVideoUrl) {
    throw new JobConflictError("This job has no source capture to retry.");
  }

  return prisma.reconstructionJob.update({
    where: { id },
    data: {
      status: "QUEUED",
      progress: 8,
      error: null,
      claimedAt: null,
      startedAt: null,
      completedAt: null,
    },
  });
}

export async function claimReconstruction(
  id: string,
  gpuType?: string | null,
): Promise<ReconstructionJob | null> {
  requireDatabase();

  const claimed = await prisma.reconstructionJob.updateMany({
    where: { id, status: "QUEUED" },
    data: {
      status: "EXTRACTING_FRAMES",
      progress: 12,
      claimedAt: new Date(),
      startedAt: new Date(),
      gpuType: gpuType ?? undefined,
      error: null,
    },
  });
  if (claimed.count === 0) return null;
  return prisma.reconstructionJob.findUnique({ where: { id } });
}

export async function claimNextQueuedJob(gpuType?: string | null): Promise<ReconstructionJob | null> {
  requireDatabase();

  return prisma.$transaction(async (tx) => {
    const next = await tx.reconstructionJob.findFirst({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;

    const claimed = await tx.reconstructionJob.updateMany({
      where: { id: next.id, status: "QUEUED" },
      data: {
        status: "EXTRACTING_FRAMES",
        progress: 12,
        claimedAt: new Date(),
        startedAt: next.startedAt ?? new Date(),
        gpuType: gpuType ?? next.gpuType,
        error: null,
      },
    });
    if (claimed.count === 0) return null;

    return tx.reconstructionJob.findUnique({ where: { id: next.id } });
  });
}
