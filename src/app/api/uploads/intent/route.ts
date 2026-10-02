import { NextResponse } from "next/server";
import { createReconstruction } from "@/lib/jobs/service";
import { jobErrorResponse } from "@/lib/jobs/http";
import { toRoomProject } from "@/lib/jobs/serialize";
import { titleFromFilename } from "@/lib/format";
import { createPresignedPut, isStorageConfigured } from "@/lib/uploads/s3";
import { UploadValidationError, validateWalkthroughFile } from "@/lib/uploads/validate";
import type { UploadIntentRequest } from "@/lib/uploads/types";

export async function POST(request: Request) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      {
        error: "Object storage is not configured. Add S3_BUCKET and CloudFront to .env.local.",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as UploadIntentRequest;
    const { contentType } = validateWalkthroughFile({
      name: body.filename,
      type: body.contentType,
      size: body.sizeBytes,
    });

    const job = await createReconstruction({
      name: body.name?.trim() || titleFromFilename(body.filename),
      originalVideoName: body.filename,
      sourceSizeBytes: body.sizeBytes,
      durationSeconds: body.durationSeconds,
      resolution: body.resolution,
    });

    const signed = await createPresignedPut({
      projectId: job.id,
      filename: body.filename,
      contentType,
      sizeBytes: body.sizeBytes,
    });

    return NextResponse.json({
      projectId: job.id,
      objectKey: signed.objectKey,
      uploadUrl: signed.uploadUrl,
      method: "PUT",
      headers: signed.headers,
      publicUrl: signed.publicUrl,
      job: toRoomProject(job),
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
