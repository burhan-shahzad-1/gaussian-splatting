"use client";

import { useEffect, useRef } from "react";
import type { PanoramaHandle } from "@/lib/viewer/panorama";

type Phase = "loading" | "ready" | "error";

export function PanoramaCanvas({
  panoUrl,
  onPhase,
  onResetRef,
}: {
  panoUrl: string;
  onPhase: (phase: Phase, message?: string) => void;
  onResetRef: (reset: (() => void) | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: PanoramaHandle | null = null;

    onPhase("loading");
    onResetRef(null);

    void (async () => {
      try {
        const { mountPanoramaViewer } = await import("@/lib/viewer/panorama");
        handle = await mountPanoramaViewer({
          canvas,
          panoUrl,
          onReady: () => {
            if (!cancelled) onPhase("ready");
          },
          onError: (message) => {
            if (!cancelled) onPhase("error", message);
          },
        });
        if (cancelled) {
          handle.destroy();
          return;
        }
        onResetRef(() => handle?.reset());
      } catch (error) {
        if (cancelled) return;
        onPhase(
          "error",
          error instanceof Error
            ? error.message
            : "This browser could not open the 360 environment.",
        );
      }
    })();

    return () => {
      cancelled = true;
      onResetRef(null);
      handle?.destroy();
    };
  }, [panoUrl, onPhase, onResetRef]);

  return <canvas ref={canvasRef} className="splat-canvas" aria-label="360 room. Click a spot to stand there, then drag to look around." />;
}
