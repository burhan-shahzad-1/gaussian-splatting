"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PanoramaCanvas } from "@/components/viewer/panorama-canvas";
import { LookAroundCanvas } from "@/components/viewer/look-around-canvas";
import { useViewerPhase } from "@/components/viewer/splat-canvas";
import { getCatalogRoom } from "@/lib/catalog";
import { useProject, useProjectsReady } from "@/lib/projects/hooks";
import { refreshProject } from "@/lib/projects/cache";
import type { RoomProject } from "@/lib/types";

export function ImmersiveViewer({
  id,
  initialProject,
}: {
  id: string;
  initialProject: RoomProject | null;
}) {
  const ready = useProjectsReady();
  const cached = useProject(id);
  const catalog = getCatalogRoom(id);
  const project = cached ?? initialProject;
  const { phase, message, resetRef, onPhase, onResetRef } = useViewerPhase();
  const [fullscreen, setFullscreen] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    if (!initialProject) void refreshProject(id);
  }, [id, initialProject]);

  const toggleFullscreen = useCallback(async () => {
    const node = document.getElementById("viewer-root");
    if (!node) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await node.requestFullscreen();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = window.setTimeout(() => setHint(false), 5200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "r" || event.key === "R" || event.key === "Home") {
        event.preventDefault();
        resetRef.current?.();
      }
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        void toggleFullscreen();
      }
      if (event.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetRef, toggleFullscreen]);

  if (!project && catalog) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <EmptyState
          eyebrow="Design study"
          title={catalog.name}
          body="This landing example is not a reconstructed room. Create a scan, then open the viewer from a completed job."
          action={{ href: "/projects/new", label: "Create 3D scan" }}
        />
      </div>
    );
  }

  if (!project && !ready && !initialProject) {
    return (
      <div className="viewer-shell">
        <div className="viewer-state" role="status">
          <span className="loading-arc" aria-hidden="true" />
          <p className="type-mono">Opening viewer</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <EmptyState
          eyebrow="Viewer"
          title="Room not found"
          body="No reconstruction job with that id exists."
          action={{ href: "/projects", label: "Back to rooms" }}
        />
      </div>
    );
  }

  const videoUrl =
    project.sourceVideoKey || project.sourceVideoUrl
      ? `/api/reconstructions/${project.id}/video`
      : null;
  const panoUrl =
    !videoUrl && project.panoUrl ? `/api/reconstructions/${project.id}/pano` : null;
  const mode = videoUrl ? "look" : panoUrl ? "pano" : null;
  const canLoad = Boolean(mode);

  return (
    <div id="viewer-root" className="viewer-shell">
      {mode === "pano" && panoUrl ? (
        <PanoramaCanvas panoUrl={panoUrl} onPhase={onPhase} onResetRef={onResetRef} />
      ) : mode === "look" && videoUrl ? (
        <LookAroundCanvas videoUrl={videoUrl} onPhase={onPhase} onResetRef={onResetRef} />
      ) : (
        <div className="viewer-empty" />
      )}

      <div className="viewer-vignette" aria-hidden="true" />

      {phase === "loading" && canLoad ? (
        <div className="viewer-state" role="status">
          <span className="loading-arc" aria-hidden="true" />
          <p className="type-mono">Entering the room</p>
          <p className="type-caption">Stand on a spot, then look around.</p>
        </div>
      ) : null}

      {phase === "error" || !canLoad ? (
        <div className="viewer-state" role="alert">
          <p className="type-mono">{!canLoad ? "Environment unavailable" : "Could not open 3D environment"}</p>
          <p className="type-body max-w-md text-center">
            {!canLoad
              ? "This job has no source capture yet."
              : message || "The 3D environment could not be fetched from storage."}
          </p>
          <Link href={`/projects/${project.id}`} className="btn btn-secondary btn-sm mt-4">
            Reconstruction
          </Link>
        </div>
      ) : null}

      <div className="viewer-hud viewer-hud-tour">
        <Link href={`/projects/${project.id}`} className="viewer-chip viewer-tour-back">
          Back
        </Link>
        <div className="viewer-tour-title">{project.name}</div>
        {phase === "ready" && hint ? (
          <p className="viewer-tour-hint">Click a spot to stand there · Drag to look around</p>
        ) : null}
        <div className="viewer-tour-rounds">
          <button
            type="button"
            className="viewer-round"
            aria-label="Reset view"
            title="Reset view (R)"
            onClick={() => resetRef.current?.()}
            disabled={!canLoad || phase !== "ready"}
          >
            <span className="viewer-round-reset" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="viewer-round"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
            onClick={() => void toggleFullscreen()}
          >
            <span className={fullscreen ? "viewer-round-full is-exit" : "viewer-round-full"} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
