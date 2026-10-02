export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${rest}s`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const delta = Math.round((now - then) / 1000);
  if (delta < 10) return "Just now";
  if (delta < 60) return `${delta}s ago`;
  const minutes = Math.round(delta / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatClockTime(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms <= 0) return "—";
  return formatDuration(ms / 1000);
}

export function processingElapsedMs(updatedAt: string, createdAt: string): number {
  return Math.max(0, new Date(updatedAt).getTime() - new Date(createdAt).getTime());
}

export function formatProcessingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "Untitled room";
  return base.replace(/\b\w/g, (char) => char.toUpperCase());
}
