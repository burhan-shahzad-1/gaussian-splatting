import { NextResponse } from "next/server";
import { isStorageConfigured } from "@/lib/uploads/s3";

export async function GET() {
  return NextResponse.json({ configured: isStorageConfigured() });
}
