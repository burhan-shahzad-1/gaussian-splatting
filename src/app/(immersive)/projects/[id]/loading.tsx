import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="theater-page">
      <Skeleton className="h-full min-h-[70vh] rounded-[var(--radius-lg)]" />
    </main>
  );
}
