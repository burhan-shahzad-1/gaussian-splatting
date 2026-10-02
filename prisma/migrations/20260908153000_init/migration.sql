-- CreateEnum
CREATE TYPE "ReconstructionStatus" AS ENUM (
    'UPLOADING',
    'QUEUED',
    'EXTRACTING_FRAMES',
    'RUNNING_COLMAP',
    'TRAINING_SPLAT',
    'CONVERTING_SOG',
    'UPLOADING_RESULT',
    'COMPLETED',
    'FAILED'
);

-- CreateTable
CREATE TABLE "ReconstructionJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ReconstructionStatus" NOT NULL DEFAULT 'UPLOADING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "originalVideoKey" TEXT,
    "originalVideoUrl" TEXT,
    "originalVideoName" TEXT,
    "outputSplatKey" TEXT,
    "outputSplatUrl" TEXT,
    "outputSogKey" TEXT,
    "outputSogUrl" TEXT,
    "thumbnailKey" TEXT,
    "thumbnailUrl" TEXT,
    "error" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "frameCount" INTEGER,
    "processingMs" INTEGER,
    "gpuType" TEXT,
    "outputSizeBytes" BIGINT,
    "sourceSizeBytes" BIGINT,
    "resolution" TEXT,
    "splatBackend" TEXT NOT NULL DEFAULT 'external',
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconstructionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconstructionJob_status_createdAt_idx" ON "ReconstructionJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReconstructionJob_updatedAt_idx" ON "ReconstructionJob"("updatedAt");
