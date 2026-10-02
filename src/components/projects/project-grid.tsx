import { ProjectCard } from "@/components/projects/project-card";
import type { RoomProject } from "@/lib/types";

export function ProjectGrid({ projects }: { projects: RoomProject[] }) {
  return (
    <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectCard project={project} />
        </li>
      ))}
    </ul>
  );
}
