import { NextResponse } from "next/server";
import { assertWorkerAuth } from "@/lib/jobs/auth";
import { jobErrorResponse } from "@/lib/jobs/http";
import { toRoomProject } from "@/lib/jobs/serialize";
import { markReconstructionFailed } from "@/lib/jobs/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertWorkerAuth(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { error?: string };
    const job = await markReconstructionFailed(id, body.error || "Reconstruction failed.");
    return NextResponse.json({ job: toRoomProject(job) });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
