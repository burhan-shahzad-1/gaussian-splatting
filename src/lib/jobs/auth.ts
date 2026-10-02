import { timingSafeEqual } from "node:crypto";
import "server-only";
import { WorkerAuthError } from "@/lib/jobs/errors";

export function getWorkerSecret() {
  return process.env.WORKER_SECRET?.trim() || "";
}

function secretsEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

export function assertWorkerAuth(request: Request) {
  const secret = getWorkerSecret();
  if (!secret) {
    throw new WorkerAuthError();
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !secretsEqual(token, secret)) {
    throw new WorkerAuthError();
  }
}
