import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "copper" | "live" | "muted" | "signal";

const tones: Record<Tone, string> = {
  default: "",
  copper: "badge-copper",
  live: "badge-live",
  muted: "badge-muted",
  signal: "badge-signal",
};

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn("badge", tones[tone], className)}>{children}</span>;
}
