import { NextResponse } from "next/server";
import { jobErrorResponse } from "@/lib/jobs/http";
import { toRoomProject } from "@/lib/jobs/serialize";
import { retryReconstruction } from "@/lib/jobs/service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = await retryReconstruction(id);
    return NextResponse.json({ job: toRoomProject(job) });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
