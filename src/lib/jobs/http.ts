import { NextResponse } from "next/server";
import {
  DatabaseNotConfiguredError,
  JobConflictError,
  JobNotFoundError,
  WorkerAuthError,
} from "@/lib/jobs/errors";
import { StorageNotConfiguredError } from "@/lib/uploads/s3";

export function jobErrorResponse(error: unknown) {
  if (error instanceof WorkerAuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof StorageNotConfiguredError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof DatabaseNotConfiguredError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof JobNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof JobConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "Reconstruction request failed." }, { status: 500 });
}
