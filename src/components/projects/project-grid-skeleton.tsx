import { Skeleton } from "@/components/ui/skeleton";

export function ProjectGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="grid gap-3 p-5">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-px w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
