import { ProjectStatus } from "@/components/projects/project-status";
import { ScanStill } from "@/components/scan-still";
import { SpotlightCard } from "@/components/spotlight-card";
import { Button } from "@/components/ui/button";
import type { CatalogRoom } from "@/lib/types";

export function CatalogCard({ room }: { room: CatalogRoom }) {
  return (
    <SpotlightCard className="grid overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
      <div className="px-7 pt-8 pb-6 sm:px-9">
        <ProjectStatus status={room.status} />
        <h2 className="type-title mt-5">{room.name}</h2>
        <p className="type-body mt-3 max-w-md">{room.location}</p>
        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="type-mono">Captured</dt>
            <dd className="mt-1 text-paper-soft">{room.capturedAt}</dd>
          </div>
          <div>
            <dt className="type-mono">Source</dt>
            <dd className="mt-1 text-paper-soft">
              {room.durationLabel} · {room.resolution.split(" · ")[0]}
            </dd>
          </div>
        </dl>
        <div className="mt-8">
          <Button href="/projects/new" variant="secondary" size="sm">
            Create your own scan
          </Button>
        </div>
      </div>
      <div className="relative min-h-[220px]">
        <ScanStill mood={room.mood} />
      </div>
    </SpotlightCard>
  );
}
