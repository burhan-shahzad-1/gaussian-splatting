"use client";

import { useEffect, useRef } from "react";
import type { LookAroundHandle } from "@/lib/viewer/look-around";

type Phase = "loading" | "ready" | "error";

export function LookAroundCanvas({
  videoUrl,
  onPhase,
  onResetRef,
}: {
  videoUrl: string;
  onPhase: (phase: Phase, message?: string) => void;
  onResetRef: (reset: (() => void) | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: LookAroundHandle | null = null;
    const abort = new AbortController();

    onPhase("loading");
    onResetRef(null);

    void (async () => {
      try {
        const { mountLookAround } = await import("@/lib/viewer/look-around");
        handle = await mountLookAround({
          canvas,
          videoUrl,
          signal: abort.signal,
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
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        onPhase(
          "error",
          error instanceof Error
            ? error.message
            : "This browser could not build a look-around from the capture.",
        );
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      onResetRef(null);
      handle?.destroy();
    };
  }, [videoUrl, onPhase, onResetRef]);

  return <canvas ref={canvasRef} className="splat-canvas" aria-label="Room tour. Click a spot to stand there, then drag to look around." />;
}
