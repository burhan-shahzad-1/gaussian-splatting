import type { CatalogRoom } from "@/lib/types";

export const CATALOG_ROOMS: CatalogRoom[] = [
  {
    id: "living-room",
    name: "Living room, late afternoon",
    location: "Design study · not a user scan",
    capturedAt: "8 September 2026",
    durationLabel: "1m 42s",
    resolution: "3840 × 2160 · 30 fps",
    status: "COMPLETED",
    mood: "amber",
  },
  {
    id: "kitchen-study",
    name: "Kitchen study",
    location: "Design study · processing language",
    capturedAt: "8 September 2026",
    durationLabel: "58s",
    resolution: "1920 × 1080 · 30 fps",
    status: "RUNNING_COLMAP",
    mood: "slate",
  },
];

export function getCatalogRoom(id: string): CatalogRoom | undefined {
  return CATALOG_ROOMS.find((room) => room.id === id);
}
