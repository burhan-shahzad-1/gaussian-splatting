import { NextResponse } from "next/server";
import { assertWorkerAuth } from "@/lib/jobs/auth";
import { jobErrorResponse } from "@/lib/jobs/http";
import { toRoomProject } from "@/lib/jobs/serialize";
import { markReconstructionCompleted } from "@/lib/jobs/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertWorkerAuth(request);
    const { id } = await context.params;
    const body = (await request.json()) as {
      outputSplatKey?: string | null;
      outputSplatUrl?: string;
      outputSogKey?: string | null;
      outputSogUrl?: string | null;
      thumbnailKey?: string | null;
      thumbnailUrl?: string | null;
      outputSizeBytes?: number | null;
      processingMs?: number | null;
      frameCount?: number | null;
      gpuType?: string | null;
    };

    if (!body.outputSplatUrl || !body.outputSogUrl) {
      return NextResponse.json(
        { error: "outputSplatUrl and outputSogUrl are required." },
        { status: 400 },
      );
    }

    const job = await markReconstructionCompleted(id, {
      outputSplatKey: body.outputSplatKey,
      outputSplatUrl: body.outputSplatUrl,
      outputSogKey: body.outputSogKey,
      outputSogUrl: body.outputSogUrl,
      thumbnailKey: body.thumbnailKey,
      thumbnailUrl: body.thumbnailUrl,
      outputSizeBytes: body.outputSizeBytes,
      processingMs: body.processingMs,
      frameCount: body.frameCount,
      gpuType: body.gpuType,
    });

    return NextResponse.json({ job: toRoomProject(job) });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
