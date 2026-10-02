export function ScanStill({ mood = "amber" }: { mood?: "amber" | "slate" }) {
  return (
    <div className={`scan-still scan-still-${mood}`} aria-hidden="true">
      <div className="scan-still-wall" />
      <div className="scan-still-window" />
      <div className="scan-still-floor" />
      <div className="scan-still-glow" />
    </div>
  );
}
