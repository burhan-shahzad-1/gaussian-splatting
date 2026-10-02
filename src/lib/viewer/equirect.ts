export function isEquirectRatio(width: number, height: number) {
  if (width < 2 || height < 1) return false;
  const ratio = width / height;
  return ratio >= 1.85 && ratio <= 2.15;
}

export function isLikelyEquirect(width: number, height: number) {
  if (width < 480 || height < 240) return false;
  return isEquirectRatio(width, height);
}

export function parseResolution(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}
