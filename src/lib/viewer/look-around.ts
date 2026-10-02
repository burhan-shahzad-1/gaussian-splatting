import { isLikelyEquirect } from "@/lib/viewer/equirect";

export type LookAroundHandle = {
  reset: () => void;
  resize: () => void;
  destroy: () => void;
};

export type LookAroundOptions = {
  canvas: HTMLCanvasElement;
  videoUrl: string;
  signal?: AbortSignal;
  onReady?: () => void;
  onError?: (message: string) => void;
};

type Look = { heading: number; panX: number; panY: number; zoom: number };
type Still = ImageBitmap | HTMLCanvasElement;
type Spot = { heading: number; x: number; y: number; scale: number; here: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => resolve();
    const onError = () => reject(new Error("Could not read a frame from the capture."));
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = time;
  });
}

function waitForFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof video.requestVideoFrameCallback === "function" && !video.paused) {
      const timer = window.setTimeout(finish, 120);
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        finish();
      });
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
}

function copyNativeFrame(video: HTMLVideoElement) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width < 2 || height < 2) {
    throw new Error("The capture has no picture.");
  }
  if (typeof OffscreenCanvas !== "undefined") {
    const surface = new OffscreenCanvas(width, height);
    const ctx = surface.getContext("2d", { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(video, 0, 0, width, height);
      return surface.transferToImageBitmap();
    }
  }
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  const ctx = surface.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("Could not copy a frame from the capture.");
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, 0, 0, width, height);
  return surface;
}

function stillWidth(frame: Still) {
  return frame instanceof HTMLCanvasElement ? frame.width : frame.width;
}

function closeStill(frame: Still) {
  if (frame instanceof ImageBitmap) frame.close();
}

function frameLooksEmpty(frame: Still) {
  const probe = document.createElement("canvas");
  probe.width = 24;
  probe.height = 24;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(frame, 0, 0, 24, 24);
  const pixels = ctx.getImageData(0, 0, 24, 24).data;
  let luma = 0;
  let max = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const sample = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    luma += sample;
    if (sample > max) max = sample;
  }
  return luma / 576 < 4 && max < 12;
}

async function grabFrame(video: HTMLVideoElement, time: number, duration: number) {
  const nudges = [0, 0.04, -0.04, 0.08];
  let last: Still | null = null;
  for (const nudge of nudges) {
    const target = clamp(time + nudge, 0, Math.max(duration, 0));
    await seek(video, target);
    await waitForFrame(video);
    const frame = copyNativeFrame(video);
    if (!frameLooksEmpty(frame) && stillWidth(frame) === video.videoWidth) {
      if (last) closeStill(last);
      return frame;
    }
    if (last) closeStill(last);
    last = frame;
  }
  if (last) return last;
  throw new Error("Could not read a frame from the capture.");
}

async function hydrateLocalUrl(videoUrl: string, signal?: AbortSignal) {
  const response = await fetch(videoUrl, { signal, cache: "force-cache" });
  if (!response.ok) {
    throw new Error("The room capture could not be loaded from storage.");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function wrap01(value: number) {
  return value - Math.floor(value);
}

function headingDelta(from: number, to: number, wrap: boolean) {
  let delta = to - from;
  if (wrap) delta -= Math.round(delta);
  return delta;
}

function headingTime(heading: number, duration: number, wrap: boolean) {
  const span = Number.isFinite(duration) && duration > 0 ? duration : 0.001;
  if (wrap) return wrap01(heading) * span;
  return clamp(heading, 0, 1) * span;
}

function stillsDiffScore(first: Still | undefined, last: Still | undefined) {
  if (!first || !last) return Number.POSITIVE_INFINITY;
  const probe = document.createElement("canvas");
  probe.width = 32;
  probe.height = 32;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return Number.POSITIVE_INFINITY;
  ctx.drawImage(first, 0, 0, 32, 32);
  const a = ctx.getImageData(0, 0, 32, 32).data;
  ctx.drawImage(last, 0, 0, 32, 32);
  const b = ctx.getImageData(0, 0, 32, 32).data;
  let acc = 0;
  for (let i = 0; i < a.length; i += 4) {
    acc += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return acc / (32 * 32 * 3);
}

function stillsLoop(first: Still | undefined, last: Still | undefined) {
  if (!first || !last || first === last) return false;
  return stillsDiffScore(first, last) < 32;
}

function stationHeadings(duration: number) {
  const count = clamp(Math.round(4 + duration * 0.28), 5, 9);
  if (count <= 1) return [0.5];
  return Array.from({ length: count }, (_, index) => index / (count - 1));
}

function nearestHeading(value: number, headings: number[], wrap: boolean) {
  let best = headings[0] ?? 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const heading of headings) {
    const dist = Math.abs(headingDelta(value, heading, wrap));
    if (dist < bestDist) {
      best = heading;
      bestDist = dist;
    }
  }
  return best;
}

async function mountVideoPhotosphere(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  dropLocal: () => void,
  onReady?: () => void,
  onError?: (message: string) => void,
) {
  video.pause();
  const duration = Math.max(video.duration || 0, 0.001);
  // Skip Adobe intro; lock one in-scene equirect frame for a stable centre view.
  const time = clamp(Math.min(3, duration * 0.2), 0, Math.max(duration - 0.1, 0));
  const still = await grabFrame(video, time, duration);
  const { mountPanoramaViewer } = await import("@/lib/viewer/panorama");
  const handle = await mountPanoramaViewer({
    canvas,
    frame: still,
    spots: false,
    onReady,
    onError,
  });
  const innerDestroy = handle.destroy;
  handle.destroy = () => {
    innerDestroy();
    closeStill(still);
    dropLocal();
  };
  return handle;
}

export async function mountLookAround(
  options: LookAroundOptions,
): Promise<LookAroundHandle> {
  const { canvas, videoUrl, signal, onReady, onError } = options;
  if (!canvas.parentElement) {
    throw new Error("Viewer canvas has no parent.");
  }
  const host: HTMLElement = canvas.parentElement;

  const localUrl = await hydrateLocalUrl(videoUrl, signal);
  const video = document.createElement("video");
  video.className = "look-around-video";
  video.src = localUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "true");
  host.appendChild(video);

  const dropLocal = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(localUrl);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error("The room capture could not be loaded from storage.")),
        { once: true },
      );
    });

    video.width = video.videoWidth;
    video.height = video.videoHeight;
    video.style.width = `${video.videoWidth}px`;
    video.style.height = `${video.videoHeight}px`;
    video.pause();

    if (isLikelyEquirect(video.videoWidth, video.videoHeight)) {
      return await mountVideoPhotosphere(canvas, video, dropLocal, onReady, onError);
    }

    const maybeCtx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!maybeCtx) {
      throw new Error("This browser could not create a 2D canvas.");
    }
    const ctx: CanvasRenderingContext2D = maybeCtx;
    const duration = Math.max(video.duration, 0.001);
    const nativeW = video.videoWidth;
    const nativeH = video.videoHeight;
    const spots = stationHeadings(duration);

    // Dense still strip + crossfade. Never seek <video> while dragging.
    const stripCount = clamp(Math.round(duration * 2.5), 24, 72);
    const strip: Still[] = [];
    try {
      for (let index = 0; index < stripCount; index += 1) {
        if (signal?.aborted) throw new DOMException("Look-around cancelled.", "AbortError");
        const heading = stripCount <= 1 ? 0.5 : index / (stripCount - 1);
        const raw = await grabFrame(video, heading * duration, duration);
        if (typeof createImageBitmap === "function") {
          try {
            const bitmap = await createImageBitmap(raw);
            closeStill(raw);
            strip.push(bitmap);
            continue;
          } catch {
            /* fall through to raw still */
          }
        }
        strip.push(raw);
      }
    } catch (error) {
      strip.forEach(closeStill);
      throw error;
    }
    const midIndex = Math.floor(strip.length / 2);
    const wrapAround =
      stillsLoop(strip[0], strip[strip.length - 1]) && stillsDiffScore(strip[0], strip[midIndex]) > 18;
    video.pause();

    const look: Look = { heading: 0.5, panX: 0, panY: 0, zoom: 1 };
    let stand = 0.5;
    let dragging = false;
    let didDrag = false;
    let startX = 0;
    let startY = 0;
    let startHeading = 0.5;
    let startPanX = 0;
    let startPanY = 0;
    let disposed = false;
    let raf = 0;
    let lastDraw = performance.now();
    let lastMove = performance.now();
    let velH = 0;
    let velX = 0;
    let velY = 0;
    let hoverX = 0;
    let hoverY = 0;
    let hoverOnFloor = false;
    let walk: { from: number; to: number; start: number } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let pinchZoom = 1;

    function samplePair(heading: number) {
      const count = strip.length;
      if (count <= 1) return { a: strip[0], b: strip[0], mix: 0 };
      if (wrapAround) {
        const f = wrap01(heading) * count;
        const i0 = Math.floor(f) % count;
        const i1 = (i0 + 1) % count;
        return { a: strip[i0], b: strip[i1], mix: f - Math.floor(f) };
      }
      const f = clamp(heading, 0, 1) * (count - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(i0 + 1, count - 1);
      return { a: strip[i0], b: strip[i1], mix: f - i0 };
    }

    function clampHeading(value: number) {
      if (wrapAround) return wrap01(value);
      return clamp(value, 0, 1);
    }

    function stage() {
      const cssW = Math.max(1, host.clientWidth);
      const cssH = Math.max(1, host.clientHeight);
      const dpr = canvas.width / cssW;
      const boxW = canvas.width;
      const boxH = canvas.height;
      const native = Math.max(dpr, 1);
      const cover = Math.max(boxW / nativeW, boxH / nativeH);
      const base = cover;
      const maxZoom = Math.max(1, native / Math.max(base, 0.0001));
      return { padL: 0, padT: 0, boxW, boxH, dpr, native, fit: cover, base, maxZoom };
    }

    function limits() {
      const view = stage();
      const scale = view.base * look.zoom;
      const dw = nativeW * scale;
      const dh = nativeH * scale;
      return {
        ...view,
        scale,
        dw,
        dh,
        maxPanX: Math.max(0, (dw - view.boxW) / 2),
        maxPanY: Math.max(0, (dh - view.boxH) / 2),
      };
    }

    function clampLook() {
      const beforeH = look.heading;
      const beforeX = look.panX;
      const beforeY = look.panY;
      look.heading = clampHeading(look.heading);
      look.zoom = clamp(look.zoom, 1, limits().maxZoom);
      const next = limits();
      look.panX = clamp(look.panX, -next.maxPanX, next.maxPanX);
      look.panY = clamp(look.panY, -next.maxPanY, next.maxPanY);
      if (look.heading !== beforeH && Math.abs(headingDelta(beforeH, look.heading, wrapAround)) < 1e-6) {
        velH = 0;
      }
      if (!wrapAround && look.heading !== beforeH) {
        if (look.heading === 0 || look.heading === 1) velH = 0;
      }
      if (look.panX !== beforeX) velX = 0;
      if (look.panY !== beforeY) velY = 0;
      return next;
    }

    function resize() {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      clampLook();
    }

    function layoutSpots(view: ReturnType<typeof limits>): Spot[] {
      return spots.map((heading, index) => {
        const here = Math.abs(headingDelta(stand, heading, wrapAround)) < 0.03;
        if (wrapAround) {
          const rel = headingDelta(look.heading, heading, true);
          const angle = rel * Math.PI * 2;
          const depth = (Math.cos(angle) + 1) / 2;
          return {
            heading,
            x: view.padL + view.boxW * (0.5 + Math.sin(angle) * lerp(0.1, 0.3, depth)),
            y: view.padT + view.boxH * lerp(0.9, 0.56, depth),
            scale: lerp(0.7, 1.2, depth),
            here,
          };
        }
        const along = heading - stand;
        if (along < -0.02) {
          const backLane = ((index % 3) - 1) * 0.07;
          return {
            heading,
            x: view.padL + view.boxW * clamp(0.5 + backLane, 0.12, 0.88),
            y: view.padT + view.boxH * 0.93,
            scale: 0.58,
            here,
          };
        }
        const depth = here ? 0 : clamp(along / Math.max(1 - stand, 0.18), 0.08, 1);
        const lane = ((index % 3) - 1) * lerp(0.16, 0.05, depth);
        const yawShift = headingDelta(look.heading, stand, false) * -0.45;
        return {
          heading,
          x: view.padL + view.boxW * clamp(0.5 + lane + yawShift, 0.08, 0.92),
          y: view.padT + view.boxH * (here ? 0.9 : lerp(0.88, 0.5, depth)),
          scale: here ? 0.72 : lerp(1.15, 0.48, depth),
          here,
        };
      });
    }

    function hitSpot(x: number, y: number, view: ReturnType<typeof limits>) {
      let best: Spot | null = null;
      let bestDist = 28 * view.dpr;
      for (const spot of layoutSpots(view)) {
        if (spot.x < 0) continue;
        const dist = Math.hypot(spot.x - x, spot.y - y);
        const radius = 26 * spot.scale * view.dpr;
        if (dist < Math.max(bestDist, radius) && dist < radius) {
          best = spot;
          bestDist = dist;
        }
      }
      return best;
    }

    function blitStill(still: Still, view: ReturnType<typeof limits>, alpha: number) {
      const fw = stillWidth(still) || nativeW;
      const fh = still.height || nativeH;
      if (fw < 2 || fh < 2 || alpha <= 0.001) return;
      const dx = view.padL + (view.boxW - view.dw) / 2 + look.panX;
      const dy = view.padT + (view.boxH - view.dh) / 2 + look.panY;
      const destX = view.padL;
      const destY = view.padT;
      const destW = view.boxW;
      const destH = view.boxH;
      const sx = clamp((destX - dx) / view.scale, 0, Math.max(0, fw - destW / view.scale));
      const sy = clamp((destY - dy) / view.scale, 0, Math.max(0, fh - destH / view.scale));
      const sw = Math.min(fw - sx, destW / view.scale);
      const sh = Math.min(fh - sy, destH / view.scale);
      ctx.globalAlpha = alpha;
      ctx.drawImage(still, sx, sy, sw, sh, destX, destY, destW, destH);
    }

    function paintFrame(view: ReturnType<typeof limits>) {
      const { a, b, mix } = samplePair(look.heading);
      ctx.imageSmoothingEnabled = view.scale < 0.999;
      ctx.imageSmoothingQuality = "low";
      if (mix < 0.02) {
        blitStill(a, view, 1);
      } else if (mix > 0.98) {
        blitStill(b, view, 1);
      } else {
        blitStill(a, view, 1);
        blitStill(b, view, mix);
      }
      ctx.globalAlpha = 1;
    }

    function paintNow() {
      const view = clampLook();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#050403";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      paintFrame(view);
      canvas.style.cursor = dragging ? "grabbing" : "grab";
    }

    function paintSpot(spot: Spot, view: ReturnType<typeof limits>, hover: boolean) {
      if (spot.x < 0) return;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.scale(1, 0.38);
      const radius = 17 * spot.scale * view.dpr;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (hover ? 1.18 : 1), 0, Math.PI * 2);
      ctx.strokeStyle = hover ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.8)";
      ctx.lineWidth = (hover ? 3.4 : 2.2) * view.dpr;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = spot.here
        ? `rgba(201,160,106,${0.75 + pulse * 0.2})`
        : hover
          ? "rgba(255,255,255,0.88)"
          : "rgba(255,255,255,0.5)";
      ctx.fill();
      ctx.restore();
    }

    function draw(now: number) {
      if (disposed) return;
      raf = requestAnimationFrame(draw);
      const dt = Math.min(32, now - lastDraw);
      lastDraw = now;

      if (walk) {
        const t = clamp((now - walk.start) / 520, 0, 1);
        const heading = walk.from + headingDelta(walk.from, walk.to, wrapAround) * easeInOut(t);
        look.heading = wrapAround ? wrap01(heading) : heading;
        if (t >= 1) {
          stand = walk.to;
          look.heading = walk.to;
          walk = null;
        }
      } else if (!dragging && pointers.size < 2) {
        look.heading += velH * dt;
        look.panX += velX * dt;
        look.panY += velY * dt;
        const decay = Math.exp(-dt / 110);
        velH *= decay;
        velX *= decay;
        velY *= decay;
        if (Math.abs(velH) < 1e-7) velH = 0;
        if (Math.abs(velX) < 1e-4) velX = 0;
        if (Math.abs(velY) < 1e-4) velY = 0;
      }

      const view = clampLook();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#050403";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      paintFrame(view);

      // Main branch: no click-to-stand spots.
      void layoutSpots;
      void hitSpot;
      void paintSpot;
      hoverOnFloor = false;
      canvas.style.cursor = dragging ? "grabbing" : "grab";
    }

    function standAt(heading: number) {
      const next = nearestHeading(heading, spots, wrapAround);
      if (Math.abs(headingDelta(stand, next, wrapAround)) < 0.01 && !walk) {
        look.heading = next;
        stand = next;
        return;
      }
      walk = { from: look.heading, to: next, start: performance.now() };
      velH = 0;
      velX = 0;
      velY = 0;
    }

    function eventPoint(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const view = limits();
      const x = (event.clientX - rect.left) * view.dpr;
      const y = (event.clientY - rect.top) * view.dpr;
      const nx = (x - view.padL) / Math.max(view.boxW, 1);
      const ny = (y - view.padT) / Math.max(view.boxH, 1);
      return { x, y, nx, ny };
    }

    function chooseSpot(event: PointerEvent) {
      const point = eventPoint(event);
      const view = limits();
      const hit = hitSpot(point.x, point.y, view);
      if (hit) {
        standAt(hit.heading);
        return;
      }
      if (point.ny < 0.42) return;
      const depth = clamp((point.ny - 0.42) / 0.5, 0, 1);
      const far = 1 - depth;
      const lateral = point.nx - 0.5;
      let target = stand + far * (wrapAround ? 0.28 : Math.max(1 - stand, 0.12) * 0.9);
      target += lateral * 0.12;
      target = wrapAround ? wrap01(target) : clamp(target, 0, 1);
      standAt(target);
    }

    function reset() {
      walk = null;
      stand = 0.5;
      look.heading = 0.5;
      look.panX = 0;
      look.panY = 0;
      look.zoom = 1;
      velH = 0;
      velX = 0;
      velY = 0;
    }

    function setZoom(nextZoom: number, originX?: number, originY?: number) {
      const before = limits();
      const dpr = before.dpr;
      const cx = originX == null ? before.padL + before.boxW / 2 : originX * dpr;
      const cy = originY == null ? before.padT + before.boxH / 2 : originY * dpr;
      const relX = cx - (before.padL + before.boxW / 2 + look.panX);
      const relY = cy - (before.padT + before.boxH / 2 + look.panY);
      look.zoom = nextZoom;
      clampLook();
      const after = limits();
      if (before.scale > 0 && after.scale > 0) {
        const ratio = after.scale / before.scale;
        look.panX += relX - relX * ratio;
        look.panY += relY - relY * ratio;
      }
      clampLook();
    }

    function onPointerMove(event: PointerEvent) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const point = eventPoint(event);
      hoverX = point.x;
      hoverY = point.y;
      hoverOnFloor = point.ny >= 0.42 && point.ny <= 1 && point.nx >= 0 && point.nx <= 1;
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStart > 0) {
          const rect = canvas.getBoundingClientRect();
          const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
          const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
          setZoom(pinchZoom * (distance / pinchStart), midX, midY);
        }
        return;
      }
      if (!dragging) return;
      const now = performance.now();
      const moveDt = Math.max(1, now - lastMove);
      lastMove = now;
      const view = limits();
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) > 4) didDrag = true;
      const prevH = look.heading;
      const prevY = look.panY;
      // Horizontal drag scrubs look-around; vertical only nudges pan.
      look.heading = clampHeading(startHeading - dx / Math.max(host.clientWidth * 0.48, 1));
      look.panY = clamp(startPanY + dy * view.dpr * 0.45, -view.maxPanY, view.maxPanY);
      velH = headingDelta(prevH, look.heading, wrapAround) / moveDt;
      velX = 0;
      velY = (look.panY - prevY) / moveDt;
      paintNow();
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      velH = 0;
      velX = 0;
      velY = 0;
      didDrag = false;
      lastMove = performance.now();
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchZoom = look.zoom;
        dragging = false;
        return;
      }
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startHeading = look.heading;
      startPanX = look.panX;
      startPanY = look.panY;
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
    }

    function onPointerUp(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const wasDragging = dragging;
      dragging = pointers.size === 1;
      if (wasDragging && !didDrag && pointers.size === 0 && !walk) {
        // Main branch keeps look-around only — no floor teleport.
      }
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setZoom(look.zoom * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX - rect.left, event.clientY - rect.top);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom(look.zoom * 1.1);
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom(look.zoom / 1.1);
      }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    canvas.tabIndex = 0;
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);

    resize();
    lastDraw = performance.now();
    raf = requestAnimationFrame(draw);
    onReady?.();

    return {
      reset,
      resize,
      destroy() {
        disposed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("keydown", onKey);
        strip.forEach(closeStill);
        dropLocal();
      },
    };
  } catch (error) {
    dropLocal();
    throw error;
  }
}
