import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { isStorageConfigured } from "@/lib/uploads/s3";

export async function GET() {
  let database = false;
  if (isDatabaseConfigured()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }
  }

  return NextResponse.json({
    storage: isStorageConfigured(),
    database,
    reconstructorPoll: Boolean(process.env.WORKER_SECRET?.trim()),
    workerUrl: Boolean(process.env.WORKER_URL?.trim()),
  });
}
