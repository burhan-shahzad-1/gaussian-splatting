"use client";

import type { MouseEvent, ReactNode } from "react";
import { SurfaceCard } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  function onMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--spot-x",
      `${((event.clientX - rect.left) / rect.width) * 100}%`,
    );
    event.currentTarget.style.setProperty(
      "--spot-y",
      `${((event.clientY - rect.top) / rect.height) * 100}%`,
    );
  }

  return (
    <SurfaceCard onMouseMove={onMove} className={cn("h-full", className)}>
      {children}
    </SurfaceCard>
  );
}
