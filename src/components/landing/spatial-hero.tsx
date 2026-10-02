"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { HairlineProgress } from "@/components/ui/progress";
import { RoomVolume } from "@/components/room-volume";
import type { SpatialHandle } from "@/components/landing/spatial-scene";

export function SpatialHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let handle: SpatialHandle | null = null;
    let cancelled = false;

    void import("@/components/landing/spatial-scene").then(({ mountSpatialScene }) => {
      if (cancelled) return;
      handle = mountSpatialScene(canvas, {
        onProgress: (value) => {
          const next = Math.round(value * 20) / 20;
          setProgress((current) => (current === next ? current : next));
        },
      });
      if (!handle) setFallback(true);
    });

    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, []);

  const complete = progress >= 0.995;

  return (
    <div className="spatial-stage glass h-full min-h-[380px]">
      <canvas
        ref={canvasRef}
        className="spatial-stage-canvas"
        aria-label="Animated reconstruction of a room as a Gaussian point field"
      />
      {fallback ? (
        <div className="absolute inset-0 grid place-items-center">
          <RoomVolume caption="Spatial preview" />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 spatial-stage-shade" />

      <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-start justify-between gap-3 sm:top-5 sm:left-5 sm:right-5">
        <Badge tone={complete ? "copper" : "live"}>
          {complete ? "Field stable" : "Assembling field"}
        </Badge>
        <p className="type-mono">Live preview · not a captured splat</p>
      </div>

      <div className="pointer-events-none absolute right-4 bottom-4 left-4 grid gap-2 sm:right-5 sm:bottom-5 sm:left-5">
        <div className="flex items-end justify-between gap-4">
          <p className="type-mono">{complete ? "Orbit to inspect" : "Reconstructing volume"}</p>
        </div>
        <HairlineProgress value={progress} label="Preview assemble" />
      </div>
    </div>
  );
}
