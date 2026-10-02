export function isEquirectRatio(width: number, height: number) {
  if (width < 2 || height < 1) return false;
  const ratio = width / height;
  return ratio >= 1.92 && ratio <= 2.08;
}

export function isLikelyEquirect(width: number, height: number) {
  // Real equirect stills are usually 2K+. Low-res ~2:1 stock clips are often
  // rectilinear walkthroughs — mapping those onto a sphere pinches the room.
  if (width < 1280 || height < 640) return false;
  return isEquirectRatio(width, height);
}

export function parseResolution(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(\d+)\s*(?:[x×]|A\?)\s*(\d+)/i) ?? value.match(/(\d+)\D+(\d+)/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}
