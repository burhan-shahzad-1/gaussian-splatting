import { ProjectGridSkeleton } from "@/components/projects/project-grid-skeleton";
import { DashboardHeader } from "@/components/projects/dashboard-header";

export default function Loading() {
  return (
    <main className="page-shell py-12 sm:py-16">
      <DashboardHeader />
      <div className="mt-12">
        <ProjectGridSkeleton />
      </div>
    </main>
  );
}
