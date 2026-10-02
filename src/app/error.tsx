"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <div className="grid justify-items-center">
        <EmptyState
          eyebrow="Error"
          title="This page could not be shown"
          body="The studio hit an unexpected problem. Try again, or return to your rooms."
          action={{ href: "/projects", label: "Back to rooms" }}
        />
        <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
