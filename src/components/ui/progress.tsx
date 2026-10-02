import { cn } from "@/lib/cn";

export function HairlineProgress({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));

  return (
    <div
      className={cn("progress-track", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
    >
      <div className="progress-fill" style={{ width: `${width}%` }} />
    </div>
  );
}
