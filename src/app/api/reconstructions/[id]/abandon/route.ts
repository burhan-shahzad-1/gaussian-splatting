import { NextResponse } from "next/server";
import { jobErrorResponse } from "@/lib/jobs/http";
import { toRoomProject } from "@/lib/jobs/serialize";
import { abandonReconstruction } from "@/lib/jobs/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { error?: string };
    const job = await abandonReconstruction(id, body.error || "Upload cancelled.");
    return NextResponse.json({ job: toRoomProject(job) });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
