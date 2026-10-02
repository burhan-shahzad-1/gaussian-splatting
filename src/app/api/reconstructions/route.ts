import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { jobErrorResponse } from "@/lib/jobs/http";
import { createReconstruction, listReconstructions } from "@/lib/jobs/service";
import { toRoomProject } from "@/lib/jobs/serialize";

export async function GET() {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ jobs: [], database: false });
    }
    const jobs = await listReconstructions();
    return NextResponse.json({ jobs: jobs.map(toRoomProject), database: true });
  } catch (error) {
    return jobErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      originalVideoName?: string | null;
      sourceSizeBytes?: number | null;
      durationSeconds?: number | null;
      resolution?: string | null;
      thumbnailUrl?: string | null;
    };

    const job = await createReconstruction({
      name: body.name?.trim() || "Untitled room",
      originalVideoName: body.originalVideoName,
      sourceSizeBytes: body.sourceSizeBytes,
      durationSeconds: body.durationSeconds,
      resolution: body.resolution,
      thumbnailUrl: body.thumbnailUrl,
    });

    return NextResponse.json({ job: toRoomProject(job) }, { status: 201 });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
