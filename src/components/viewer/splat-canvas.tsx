"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SplatViewerHandle } from "@/lib/viewer/playcanvas-splat";

type Phase = "loading" | "ready" | "error";

export function SplatCanvas({
  sogUrl,
  onPhase,
  onResetRef,
}: {
  sogUrl: string;
  onPhase: (phase: Phase, message?: string) => void;
  onResetRef: (reset: (() => void) | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: SplatViewerHandle | null = null;

    onPhase("loading");
    onResetRef(null);

    void (async () => {
      try {
        const { mountSplatViewer } = await import("@/lib/viewer/playcanvas-splat");
        handle = await mountSplatViewer({
          canvas,
          sogUrl,
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
            : "PlayCanvas could not start. This browser may be blocking WebGL.",
        );
      }
    })();

    return () => {
      cancelled = true;
      onResetRef(null);
      handle?.destroy();
    };
  }, [sogUrl, onPhase, onResetRef]);

  return <canvas ref={canvasRef} className="splat-canvas" aria-label="Gaussian splat scene" />;
}

export function useViewerPhase() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const toggleRef = useRef<(() => void) | null>(null);

  const onPhase = useCallback((next: Phase, text?: string) => {
    setPhase(next);
    setMessage(text ?? null);
  }, []);

  const onResetRef = useCallback((reset: (() => void) | null) => {
    resetRef.current = reset;
  }, []);

  const onToggleRef = useCallback((toggle: (() => void) | null) => {
    toggleRef.current = toggle;
  }, []);

  return { phase, message, resetRef, toggleRef, onPhase, onResetRef, onToggleRef };
}
