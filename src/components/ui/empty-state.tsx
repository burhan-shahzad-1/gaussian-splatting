import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/reveal";
import { cn } from "@/lib/cn";

export function EmptyState({
  eyebrow = "Empty",
  title,
  body,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center px-6 py-16 text-center", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="type-title mt-4 max-w-lg">{title}</h1>
      <p className="type-body mx-auto mt-4 max-w-md">{body}</p>
      {action ? (
        <div className="mt-8">
          <Button href={action.href} variant="copper">
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptySlot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-48 place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] bg-white/[0.02] px-6 py-10 text-center",
        className,
      )}
    >
      {children}
    </div>
  );
}
