import { Badge } from "@/components/ui/badge";
import { STATUS_COPY } from "@/lib/status";
import type { ReconstructionStatus } from "@/lib/types";

export function ProjectStatus({ status }: { status: ReconstructionStatus }) {
  const copy = STATUS_COPY[status];
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}
