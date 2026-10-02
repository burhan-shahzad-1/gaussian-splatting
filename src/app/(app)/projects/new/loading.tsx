import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="page-shell py-12 sm:py-16">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-12 w-[min(100%,24rem)]" />
      <Skeleton className="mt-10 h-64 rounded-[var(--radius-lg)]" />
    </main>
  );
}
