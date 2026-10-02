"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { mountSpatialVideo, type SpatialVideoHandle } from "@/lib/viewer/spatial-video";

type Phase = "loading" | "ready" | "error";

function sizeCanvas(stage: HTMLElement, canvas: HTMLCanvasElement) {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

export function SpatialVideoCanvas({
  videoUrl,
  onPhase,
  onResetRef,
  onToggleRef,
  onPlaying,
}: {
  videoUrl: string;
  onPhase: (phase: Phase, message?: string) => void;
  onResetRef: (reset: (() => void) | null) => void;
  onToggleRef: (toggle: (() => void) | null) => void;
  onPlaying: (playing: boolean) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const apply = () => sizeCanvas(stage, canvas);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!stage || !canvas || !video) return;

    let cancelled = false;
    let handle: SpatialVideoHandle | null = null;

    onPhase("loading");
    onResetRef(null);
    onToggleRef(null);

    void (async () => {
      try {
        handle = await mountSpatialVideo({
          stage,
          canvas,
          video,
          onReady: () => {
            if (!cancelled) onPhase("ready");
          },
          onError: (message) => {
            if (!cancelled) onPhase("error", message);
          },
          onPlaying: (playing) => {
            if (!cancelled) onPlaying(playing);
          },
        });
        if (cancelled) {
          handle.destroy();
          return;
        }
        onResetRef(() => handle?.reset());
        onToggleRef(() => {
          void handle?.togglePlay();
        });
      } catch (error) {
        if (cancelled) return;
        onPhase(
          "error",
          error instanceof Error
            ? error.message
            : "This browser could not start the 3D video player.",
        );
      }
    })();

    return () => {
      cancelled = true;
      onResetRef(null);
      onToggleRef(null);
      handle?.destroy();
    };
  }, [videoUrl, onPhase, onResetRef, onToggleRef, onPlaying]);

  return (
    <div ref={stageRef} className="spatial-video-stage" tabIndex={0}>
      <video
        ref={videoRef}
        className="spatial-video-el"
        src={videoUrl}
        autoPlay
        playsInline
        loop
        muted
        preload="auto"
        controls={false}
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="spatial-video-canvas" aria-label="3D walkthrough video" />
    </div>
  );
}
