export type SpatialVideoHandle = {
  reset: () => void;
  togglePlay: () => Promise<void>;
  resize: () => void;
  destroy: () => void;
};

export type SpatialVideoOptions = {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  onReady?: () => void;
  onError?: (message: string) => void;
  onPlaying?: (playing: boolean) => void;
};

type Look = { yaw: number; pitch: number };

export async function mountSpatialVideo(
  options: SpatialVideoOptions,
): Promise<SpatialVideoHandle> {
  const { stage, canvas, video, onReady, onError, onPlaying } = options;
  const maybeCtx = canvas.getContext("2d", { alpha: false });
  if (!maybeCtx) {
    throw new Error("This browser could not create a 2D video canvas.");
  }
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const look: Look = { yaw: 0, pitch: 0 };
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startYaw = 0;
  let startPitch = 0;
  let disposed = false;
  let frame = 0;

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function draw() {
    if (disposed) return;
    frame = requestAnimationFrame(draw);

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, cw, ch);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return;

    const cover = Math.max(cw / vw, ch / vh) * 1.06;
    const dw = vw * cover;
    const dh = vh * cover;
    const maxPanX = Math.max(0, (dw - cw) / 2);
    const maxPanY = Math.max(0, (dh - ch) / 2);
    const dx = (cw - dw) / 2 + (look.yaw / 18) * maxPanX;
    const dy = (ch - dh) / 2 + (look.pitch / 10) * maxPanY;
    ctx.drawImage(video, dx, dy, dw, dh);
  }

  function reset() {
    look.yaw = 0;
    look.pitch = 0;
    video.currentTime = 0;
  }

  async function togglePlay() {
    if (disposed) return;
    if (video.paused) {
      video.muted = false;
      try {
        await video.play();
      } catch {
        video.muted = true;
        await video.play();
      }
    } else {
      video.pause();
    }
    onPlaying?.(!video.paused);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > 4) moved = true;
    look.yaw = Math.max(-18, Math.min(18, startYaw + dx * 0.07));
    look.pitch = Math.max(-10, Math.min(10, startPitch - dy * 0.05));
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    startYaw = look.yaw;
    startPitch = look.pitch;
    stage.setPointerCapture(event.pointerId);
    stage.focus({ preventScroll: true });
  }

  function onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return;
    dragging = false;
    if (!moved) void togglePlay();
  }

  function onVideoError() {
    onError?.(
      video.error?.message || "The walkthrough video could not be loaded from storage.",
    );
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  draw();

  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  video.addEventListener("playing", () => onPlaying?.(true));
  video.addEventListener("pause", () => onPlaying?.(false));
  video.addEventListener("error", onVideoError);

  await new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error("The walkthrough video could not be loaded.")),
      { once: true },
    );
  });

  try {
    await video.play();
  } catch {
    onPlaying?.(false);
  }

  onReady?.();

  return {
    reset,
    togglePlay,
    resize,
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointercancel", onPointerUp);
      video.removeEventListener("error", onVideoError);
      video.pause();
    },
  };
}
