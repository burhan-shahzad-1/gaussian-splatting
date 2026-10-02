import { isProcessingStatus } from "@/lib/status";
import { fetchReconstruction, fetchReconstructions } from "@/lib/projects/api";
import type { RoomProject } from "@/lib/types";

let jobs: RoomProject[] = [];
let ready = false;
let loadError: string | null = null;
let pollMs = 0;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function snapshot() {
  return JSON.stringify({ ready, jobs, loadError });
}

function shouldPoll() {
  return jobs.some((job) => isProcessingStatus(job.status));
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  pollMs = 0;
}

function syncPolling() {
  if (typeof window === "undefined" || listeners.size === 0) {
    stopPolling();
    return;
  }
  const next = shouldPoll() ? 3000 : 12000;
  if (pollTimer && pollMs === next) return;
  stopPolling();
  pollMs = next;
  pollTimer = setInterval(() => {
    if (listeners.size === 0) {
      stopPolling();
      return;
    }
    void refreshJobs();
  }, next);
}

async function refreshJobs() {
  if (inflight) return inflight;
  inflight = fetchReconstructions()
    .then((next) => {
      jobs = next;
      loadError = null;
      ready = true;
      emit();
      syncPolling();
    })
    .catch((error) => {
      console.warn("[projects] failed to refresh reconstructions", error);
      loadError = "The studio could not load reconstructions.";
      ready = true;
      emit();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function getProjectsSnapshot() {
  return snapshot();
}

export function listCachedProjects() {
  return jobs;
}

export function projectsCacheReady() {
  return ready;
}

export function getCachedProject(id: string) {
  return jobs.find((job) => job.id === id);
}

export function subscribeProjects(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    void refreshJobs();
    syncPolling();
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) stopPolling();
  };
}

export async function refreshProject(id: string) {
  const job = await fetchReconstruction(id);
  if (!job) {
    jobs = jobs.filter((item) => item.id !== id);
    emit();
    syncPolling();
    return null;
  }
  jobs = [job, ...jobs.filter((item) => item.id !== job.id)];
  ready = true;
  loadError = null;
  emit();
  syncPolling();
  return job;
}
