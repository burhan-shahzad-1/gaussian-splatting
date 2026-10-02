import Link from "next/link";
import { ProjectStatus } from "@/components/projects/project-status";
import { ScanStill } from "@/components/scan-still";
import { SpotlightCard } from "@/components/spotlight-card";
import { formatRelativeTime } from "@/lib/format";
import { STATUS_COPY } from "@/lib/status";
import type { RoomProject } from "@/lib/types";

export function ProjectCard({ project }: { project: RoomProject }) {
  const copy = STATUS_COPY[project.status];

  return (
    <Link href={`/projects/${project.id}`} className="block h-full">
      <SpotlightCard className="flex h-full flex-col overflow-hidden">
        <div className="relative aspect-[16/10] overflow-hidden bg-[#12100d]">
          {project.thumbnailDataUrl ? (
            <div
              className="h-full w-full bg-cover bg-center opacity-90"
              style={{ backgroundImage: `url("${project.thumbnailDataUrl}")` }}
            />
          ) : (
            <ScanStill mood="amber" />
          )}
          <div className="absolute top-3 left-3">
            <ProjectStatus status={project.status} />
          </div>
        </div>
        <div className="flex flex-1 flex-col px-5 py-5">
          <h2 className="type-heading">{project.name}</h2>
          <p className="type-caption mt-2">{copy.summary}</p>
          <p className="type-mono mt-5">{formatRelativeTime(project.updatedAt)}</p>
        </div>
      </SpotlightCard>
    </Link>
  );
}
