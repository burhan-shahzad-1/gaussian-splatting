export async function readVideoMetadata(file: File): Promise<{
  durationSeconds: number | null;
  resolution: string | null;
  thumbnailDataUrl: string | null;
}> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => resolve();
      const onError = () => reject(new Error("The video could not be read. Try another MP4 or MOV."));
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;
    const resolution =
      video.videoWidth && video.videoHeight
        ? `${video.videoWidth} × ${video.videoHeight}`
        : null;

    let thumbnailDataUrl: string | null = null;
    try {
      video.currentTime = Math.min(0.6, Math.max(durationSeconds ? durationSeconds * 0.08 : 0.1, 0));
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
      });
      const canvas = document.createElement("canvas");
      const width = Math.min(video.videoWidth || 640, 720);
      const height = width * ((video.videoHeight || 9) / (video.videoWidth || 16));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context?.drawImage(video, 0, 0, width, height);
      thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.72);
    } catch {
      thumbnailDataUrl = null;
    }

    return { durationSeconds, resolution, thumbnailDataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
