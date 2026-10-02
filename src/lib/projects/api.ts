import type { RoomProject } from "@/lib/types";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export async function fetchReconstructions(): Promise<RoomProject[]> {
  const payload = await readJson<{ jobs: RoomProject[] }>(await fetch("/api/reconstructions"));
  return payload.jobs ?? [];
}

export async function fetchReconstruction(id: string): Promise<RoomProject | null> {
  const response = await fetch(`/api/reconstructions/${id}`);
  if (response.status === 404) return null;
  const payload = await readJson<{ job: RoomProject }>(response);
  return payload.job;
}

export async function abandonReconstruction(id: string, error: string) {
  await readJson(await fetch(`/api/reconstructions/${id}/abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error }),
  }));
}

export async function retryReconstruction(id: string): Promise<RoomProject> {
  const payload = await readJson<{ job: RoomProject }>(
    await fetch(`/api/reconstructions/${id}/retry`, { method: "POST" }),
  );
  return payload.job;
}
