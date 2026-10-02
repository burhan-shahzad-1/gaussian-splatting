import { NextResponse } from "next/server";
import type { ReconstructionStatus } from "@prisma/client";
import { assertWorkerAuth } from "@/lib/jobs/auth";
import { jobErrorResponse } from "@/lib/jobs/http";
import { toRoomProject } from "@/lib/jobs/serialize";
import { requireReconstruction, updateReconstructionStatus } from "@/lib/jobs/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const job = await requireReconstruction(id);
    return NextResponse.json({ job: toRoomProject(job) });
  } catch (error) {
    return jobErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertWorkerAuth(request);
    const { id } = await context.params;
    const body = (await request.json()) as {
      status?: ReconstructionStatus;
      progress?: number;
      frameCount?: number | null;
      gpuType?: string | null;
      error?: string | null;
    };

    if (!body.status) {
      return NextResponse.json({ error: "status is required." }, { status: 400 });
    }

    const job = await updateReconstructionStatus(id, {
      status: body.status,
      progress: body.progress,
      frameCount: body.frameCount,
      gpuType: body.gpuType,
      error: body.error,
    });

    return NextResponse.json({ job: toRoomProject(job) });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
