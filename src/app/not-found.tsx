import { EmptyState } from "@/components/ui/empty-state";
import { Atmosphere } from "@/components/atmosphere";

export default function NotFound() {
  return (
    <div className="relative min-h-dvh">
      <Atmosphere />
      <div className="relative z-10 grid min-h-dvh place-items-center">
        <EmptyState
          eyebrow="404"
          title="Room not found"
          body="That page is not part of this studio."
          action={{ href: "/projects", label: "Back to rooms" }}
        />
      </div>
    </div>
  );
}
