"use client";

import { DashboardHeader } from "@/components/projects/dashboard-header";
import { EmptyProjectsState } from "@/components/projects/empty-projects-state";
import { ProjectGrid } from "@/components/projects/project-grid";
import { ProjectGridSkeleton } from "@/components/projects/project-grid-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import {
  partitionProjects,
  useIsClient,
  useProjects,
  useProjectsLoadError,
  useProjectsReady,
} from "@/lib/projects/hooks";

export function ProjectsDashboard() {
  const isClient = useIsClient();
  const ready = useProjectsReady();
  const loadError = useProjectsLoadError();
  const projects = useProjects();
  const { processing } = partitionProjects(projects);

  if (!isClient || !ready) {
    return (
      <main className="page-shell py-12 sm:py-16">
        <DashboardHeader />
        <div className="mt-12">
          <ProjectGridSkeleton />
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell py-12 sm:py-16">
      <DashboardHeader />

      {loadError && projects.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            eyebrow="Studio"
            title="Rooms could not be loaded"
            body="The job list is unreachable. Check that Postgres is running, then refresh."
          />
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-12">
          <EmptyProjectsState />
        </div>
      ) : (
        <section className="mt-14">
          <Reveal>
            <p className="type-mono">Studio</p>
            <h2 className="type-heading mt-3">Reconstructions</h2>
            {processing.length > 0 ? (
              <p className="type-caption mt-2 max-w-xl">
                {processing.length === 1 ? "One room is" : `${processing.length} rooms are`} with
                the local reconstructor. This app only queues jobs.
              </p>
            ) : null}
            {loadError ? <p className="upload-error mt-4 max-w-xl">{loadError}</p> : null}
          </Reveal>
          <div className="mt-8">
            <ProjectGrid projects={projects} />
          </div>
        </section>
      )}
    </main>
  );
}
