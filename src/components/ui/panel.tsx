import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  quiet?: boolean;
};

export function GlassPanel({ children, className, quiet = false, ...props }: PanelProps) {
  return (
    <div className={cn(quiet ? "glass-quiet" : "glass", className)} {...props}>
      {children}
    </div>
  );
}

export function SurfaceCard({ children, className, ...props }: PanelProps) {
  return (
    <div className={cn("surface-card", className)} {...props}>
      {children}
    </div>
  );
}
