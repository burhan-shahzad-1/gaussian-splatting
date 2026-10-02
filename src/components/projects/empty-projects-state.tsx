import { CreateScanButton } from "@/components/projects/create-scan-button";
import { EmptySlot } from "@/components/ui/empty-state";

export function EmptyProjectsState() {
  return (
    <EmptySlot className="min-h-[28rem] px-8 py-16">
      <p className="type-mono">Studio</p>
      <h2 className="type-title mt-4 max-w-lg">No rooms yet.</h2>
      <p className="type-body mx-auto mt-4 max-w-md">
        Upload a 360 or walkthrough to reconstruct a room. Nothing is stored
        here until you create a scan — there is no backend catalog pretending
        otherwise.
      </p>
      <div className="mt-8">
        <CreateScanButton />
      </div>
    </EmptySlot>
  );
}
