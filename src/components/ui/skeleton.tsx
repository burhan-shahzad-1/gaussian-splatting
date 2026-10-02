import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function LoadingArc({ className }: { className?: string }) {
  return <span className={cn("loading-arc", className)} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div className="page-shell grid gap-8 py-16">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-16 w-[min(100%,28rem)]" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
