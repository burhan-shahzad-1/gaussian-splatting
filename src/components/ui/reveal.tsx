import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: 0 | 1 | 2 | 3 | 4 | 5;
  className?: string;
}) {
  const delayClass =
    delay === 0
      ? ""
      : delay === 1
        ? "reveal-delay-1"
        : delay === 2
          ? "reveal-delay-2"
          : delay === 3
            ? "reveal-delay-3"
            : delay === 4
              ? "reveal-delay-4"
              : "reveal-delay-5";

  return <div className={cn("reveal", delayClass, className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("type-eyebrow", className)}>{children}</p>;
}
