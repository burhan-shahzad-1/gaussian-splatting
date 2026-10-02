import { CreateScanButton } from "@/components/projects/create-scan-button";
import { Eyebrow } from "@/components/ui/reveal";

export function DashboardHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <Eyebrow>Studio</Eyebrow>
        <h1 className="type-title mt-3">Rooms</h1>
        <p className="type-body mt-3 max-w-xl">
          Interiors you captured. Processing stays on the local reconstructor;
          this view only tracks the job.
        </p>
      </div>
      <CreateScanButton />
    </div>
  );
}
