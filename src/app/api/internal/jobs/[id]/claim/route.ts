import { NextResponse } from "next/server";
import { assertWorkerAuth } from "@/lib/jobs/auth";
import { workerPayload } from "@/lib/jobs/dispatch";
import { jobErrorResponse } from "@/lib/jobs/http";
import { jsonSafeJob } from "@/lib/jobs/serialize";
import { claimReconstruction } from "@/lib/jobs/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertWorkerAuth(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { gpuType?: string | null };
    const job = await claimReconstruction(id, body.gpuType);
    if (!job) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({
      job: jsonSafeJob(job),
      process: workerPayload(job),
    });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
