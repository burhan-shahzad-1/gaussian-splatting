import { NextResponse } from "next/server";
import { notifyGpuWorker } from "@/lib/jobs/dispatch";
import { jobErrorResponse } from "@/lib/jobs/http";
import { toRoomProject } from "@/lib/jobs/serialize";
import { queueReconstruction } from "@/lib/jobs/service";
import {
  assertObjectExists,
  isStorageConfigured,
  keyBelongsToProject,
  publicObjectUrl,
} from "@/lib/uploads/s3";
import { MAX_THUMBNAIL_CHARS, MAX_UPLOAD_BYTES, MIN_UPLOAD_BYTES, type CompleteUploadRequest } from "@/lib/uploads/types";
import { UploadValidationError, validateWalkthroughFile } from "@/lib/uploads/validate";

export async function POST(request: Request) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Object storage is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as CompleteUploadRequest;

    if (!body.projectId || !body.objectKey || !body.filename) {
      return NextResponse.json({ error: "Missing upload completion fields." }, { status: 400 });
    }

    if (!keyBelongsToProject(body.objectKey, body.projectId)) {
      return NextResponse.json({ error: "That object does not belong to this room." }, { status: 400 });
    }

    validateWalkthroughFile({
      name: body.filename,
      type: body.contentType,
      size: body.sizeBytes,
    });

    const object = await assertObjectExists(body.objectKey);
    if (object.contentLength < MIN_UPLOAD_BYTES || object.contentLength > MAX_UPLOAD_BYTES) {
      throw new UploadValidationError("The stored object is not a valid walkthrough size.");
    }
    if (Math.abs(object.contentLength - body.sizeBytes) > Math.max(1024 * 1024, body.sizeBytes * 0.05)) {
      throw new UploadValidationError("The stored object does not match the declared file size.");
    }

    const thumbnailUrl =
      body.thumbnailDataUrl && body.thumbnailDataUrl.length <= MAX_THUMBNAIL_CHARS
        ? body.thumbnailDataUrl
        : null;

    const job = await queueReconstruction(body.projectId, {
      originalVideoKey: body.objectKey,
      originalVideoUrl: publicObjectUrl(body.objectKey),
      originalVideoName: body.filename,
      sourceSizeBytes: object.contentLength,
      durationSeconds: body.durationSeconds,
      resolution: body.resolution,
      thumbnailUrl,
      name: body.name,
    });

    const dispatch = await notifyGpuWorker(job);

    return NextResponse.json({
      projectId: job.id,
      objectKey: body.objectKey,
      publicUrl: job.originalVideoUrl,
      status: "QUEUED" as const,
      job: toRoomProject(job),
      worker: dispatch,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jobErrorResponse(error);
  }
}
