import type { ReactNode } from "react";

export default function ImmersiveLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh overflow-hidden bg-void text-paper">{children}</div>;
}
