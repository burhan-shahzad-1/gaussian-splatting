"use client";

import { useState } from "react";
import Link from "next/link";
import { ReconstructionField } from "@/components/reconstruction/reconstruction-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectStatus } from "@/components/projects/project-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBytes,
  formatClockTime,
  formatDuration,
  formatProcessingDate,
} from "@/lib/format";
import { retryReconstruction } from "@/lib/projects/api";
import { refreshProject } from "@/lib/projects/cache";
import { useProject, useIsClient, useProjectsReady } from "@/lib/projects/hooks";
import { SCENE_PIPELINE, STATUS_COPY, sceneStageIndex } from "@/lib/status";
import type { ReconstructionStatus, RoomProject } from "@/lib/types";

function stageState(status: ReconstructionStatus, progress: number, index: number) {
  if (status === "FAILED") {
    const stopped = Math.min(
      SCENE_PIPELINE.length - 2,
      Math.max(0, Math.round((progress / 100) * (SCENE_PIPELINE.length - 2))),
    );
    if (index < stopped) return "done";
    if (index === stopped) return "failed";
    return "idle";
  }
  const current = sceneStageIndex(status);
  if (status === "TRAINING_SPLAT") {
    if (index < 3) return "done";
    if (index === 3) return "current";
    if (index === 4) return "current";
    return "idle";
  }
  if (index < current) return "done";
  if (index === current) return "current";
  return "idle";
}

export function ReconstructionTheater({
  id,
  initialProject,
}: {
  id: string;
  initialProject: RoomProject | null;
}) {
  const isClient = useIsClient();
  const ready = useProjectsReady();
  const cached = useProject(id);
  const project = cached ?? initialProject;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (!project && (!isClient || !ready)) {
    return (
      <main className="theater-page">
        <Skeleton className="h-full min-h-[70vh] rounded-[var(--radius-lg)]" />
      </main>
    );
  }

  if (!project) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <EmptyState
          eyebrow="Missing"
          title="This room is not in the studio"
          body="No reconstruction job with that id exists yet. Create a scan to start one."
          action={{ href: "/projects/new", label: "Create 3D Scan" }}
        />
      </main>
    );
  }

  const copy = STATUS_COPY[project.status];
  const complete = project.status === "COMPLETED";
  const failed = project.status === "FAILED";

  async function onRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryReconstruction(project.id);
      await refreshProject(project.id);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Could not retry this reconstruction.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main className="theater-page">
      <Link href="/projects" className="theater-leave">
        Rooms
      </Link>
      <div className="theater-stage">
        <ReconstructionField status={project.status} />
        <div className="theater-stage-shade" />

        <div className="theater-copy">
          <p className="type-eyebrow">Reconstruction</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <h1 className="type-title max-w-3xl">{project.name}</h1>
            <ProjectStatus status={project.status} />
          </div>
          <p className="type-body mt-4 max-w-xl" aria-live="polite">
            {copy.summary}
          </p>
          {project.errorMessage ? <p className="upload-error mt-4 max-w-xl">{project.errorMessage}</p> : null}
        </div>
      </div>

      <aside className="theater-rail" aria-label="Reconstruction pipeline">
        <ol className="theater-pipeline">
          {SCENE_PIPELINE.map((stage, index) => {
            const state = stageState(project.status, project.progress, index);
            return (
              <li
                key={stage.id}
                className="theater-step"
                data-state={state}
                aria-current={state === "current" || state === "failed" ? "step" : undefined}
              >
                <div className="theater-step-mark" aria-hidden="true">
                  {state === "current" ? <span className="pulse-dot" /> : <span className="theater-node" />}
                </div>
                <div>
                  <p className="theater-step-label">{stage.label}</p>
                  {state === "current" || state === "failed" ? (
                    <p className="type-caption mt-1">
                      {state === "failed" ? "The worker stopped during this stage." : stage.summary}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        <dl className="theater-meta">
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(project.durationSeconds)}</dd>
          </div>
          <div>
            <dt>{complete ? "Scene" : "Source"}</dt>
            <dd>
              {complete
                ? formatBytes(project.outputSizeBytes ?? project.fileSizeBytes)
                : formatBytes(project.fileSizeBytes)}
            </dd>
          </div>
          <div>
            <dt>Processed</dt>
            <dd>
              {complete
                ? formatProcessingDate(project.completedAt ?? project.updatedAt)
                : project.processingMs
                  ? formatClockTime(project.processingMs)
                  : "In flight"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          {complete ? (
            <Button href={`/viewer/${project.id}`} variant="copper">
              Enter 3D viewer
            </Button>
          ) : failed ? (
            <div className="flex max-w-xs flex-col gap-3">
              <Button type="button" variant="copper" onClick={() => void onRetry()} disabled={retrying}>
                {retrying ? "Queueing…" : "Retry reconstruction"}
              </Button>
              {retryError ? <p className="upload-error">{retryError}</p> : null}
              <p className="type-caption">The local reconstructor will claim this job again from the same capture.</p>
            </div>
          ) : (
            <p className="type-caption max-w-xs">
              Progress follows the reconstructor stage. This page does not invent a percentage.
            </p>
          )}
        </div>
      </aside>
    </main>
  );
}
