import "server-only";
import { isDatabaseConfigured } from "@/lib/db";
import { toRoomProject } from "@/lib/jobs/serialize";
import { getReconstruction } from "@/lib/jobs/service";
import type { RoomProject } from "@/lib/types";

export async function getRoomProject(id: string): Promise<RoomProject | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const job = await getReconstruction(id);
    return job ? toRoomProject(job) : null;
  } catch {
    return null;
  }
}
