"use client";

import { useEffect, useRef } from "react";
import type { ReconstructionStatus } from "@/lib/types";
import type { ReconstructionFieldHandle } from "@/lib/reconstruction/field";

export function ReconstructionField({ status }: { status: ReconstructionStatus }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ReconstructionFieldHandle | null>(null);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
    handleRef.current?.setStatus(status);
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    void (async () => {
      const { mountReconstructionField } = await import("@/lib/reconstruction/field");
      if (cancelled || !canvasRef.current) return;
      handleRef.current = mountReconstructionField(canvasRef.current, statusRef.current);
    })();

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="theater-canvas" aria-hidden="true" />;
}
