"use client";

import { useMemo, useSyncExternalStore } from "react";
import { isCompletedStatus, isProcessingStatus } from "@/lib/status";
import {
  getCachedProject,
  getProjectsSnapshot,
  subscribeProjects,
} from "@/lib/projects/cache";
import type { RoomProject } from "@/lib/types";

type Snapshot = { ready: boolean; jobs: RoomProject[]; loadError: string | null };

function getSnapshot() {
  return getProjectsSnapshot();
}

function getServerSnapshot() {
  return JSON.stringify({ ready: false, jobs: [], loadError: null } satisfies Snapshot);
}

export function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useProjectsState(): Snapshot {
  const serialized = useSyncExternalStore(
    subscribeProjects,
    getSnapshot,
    getServerSnapshot,
  );
  return useMemo(() => JSON.parse(serialized) as Snapshot, [serialized]);
}

export function useProjects(): RoomProject[] {
  return useProjectsState().jobs;
}

export function useProjectsReady() {
  return useProjectsState().ready;
}

export function useProjectsLoadError() {
  return useProjectsState().loadError;
}

export function useProject(id: string): RoomProject | undefined {
  const { jobs } = useProjectsState();
  return jobs.find((project) => project.id === id) ?? getCachedProject(id);
}

export function partitionProjects(projects: RoomProject[]) {
  return {
    recent: projects.slice(0, 6),
    processing: projects.filter((project) => isProcessingStatus(project.status)),
    completed: projects.filter((project) => isCompletedStatus(project.status)),
    failed: projects.filter((project) => project.status === "FAILED"),
  };
}
