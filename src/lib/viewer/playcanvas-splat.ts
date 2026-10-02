import {
  Application,
  Asset,
  Color,
  Entity,
  FILLMODE_NONE,
  RESOLUTION_AUTO,
  Vec3,
} from "playcanvas";

export type SplatViewerHandle = {
  reset: () => void;
  resize: () => void;
  destroy: () => void;
};

export type SplatViewerOptions = {
  canvas: HTMLCanvasElement;
  sogUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

type OrbitState = {
  yaw: number;
  pitch: number;
  distance: number;
  panX: number;
  panY: number;
  panZ: number;
};

const CLEAR = new Color(0.024, 0.02, 0.016, 1);

function applyOrbit(camera: Entity, focus: Vec3, orbit: OrbitState) {
  const pitch = (orbit.pitch * Math.PI) / 180;
  const yaw = (orbit.yaw * Math.PI) / 180;
  const x = focus.x + orbit.panX + orbit.distance * Math.sin(yaw) * Math.cos(pitch);
  const y = focus.y + orbit.panY + orbit.distance * Math.sin(pitch);
  const z = focus.z + orbit.panZ + orbit.distance * Math.cos(yaw) * Math.cos(pitch);
  camera.setPosition(x, y, z);
  camera.lookAt(focus.x + orbit.panX, focus.y + orbit.panY, focus.z + orbit.panZ);
}

function frameFromSplat(splat: Entity): { focus: Vec3; distance: number } {
  const aabb = splat.gsplat?.resource?.aabb;
  if (!aabb) {
    return { focus: new Vec3(0, 0.8, 0), distance: 4.2 };
  }
  const focus = aabb.center.clone();
  const span = aabb.halfExtents.length() * 2.4;
  return { focus, distance: Math.min(Math.max(span, 1.6), 28) };
}

function pinchDistance(a: PointerEvent, b: PointerEvent) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export async function mountSplatViewer(options: SplatViewerOptions): Promise<SplatViewerHandle> {
  const { canvas, sogUrl, onReady, onError } = options;
  const parent = canvas.parentElement;
  if (!parent) {
    throw new Error("Viewer canvas has no parent.");
  }

  canvas.tabIndex = 0;
  canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));

  const app = new Application(canvas, {
    graphicsDeviceOptions: { antialias: false, alpha: false, powerPreference: "high-performance" },
  });
  app.setCanvasFillMode(FILLMODE_NONE);
  app.setCanvasResolution(RESOLUTION_AUTO);
  app.start();

  const camera = new Entity("Camera");
  camera.addComponent("camera", {
    fov: 70,
    clearColor: CLEAR,
    farClip: 250,
    nearClip: 0.05,
  });
  app.root.addChild(camera);

  let destroyed = false;
  let dragging: "orbit" | "pan" | null = null;
  let lastX = 0;
  let lastY = 0;
  let pinchStart = 0;
  let pinchDistance0 = 0;
  let focus = new Vec3(0, 0.8, 0);
  const home: OrbitState = { yaw: 28, pitch: 12, distance: 4.2, panX: 0, panY: 0, panZ: 0 };
  const orbit: OrbitState = { ...home };
  const pointers = new Map<number, PointerEvent>();

  const resize = () => {
    if (destroyed) return;
    const width = Math.max(parent.clientWidth, 1);
    const height = Math.max(parent.clientHeight, 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    app.resizeCanvas(width, height);
  };
  resize();

  const onPointerDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, event);
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      dragging = null;
      pinchDistance0 = pinchDistance(a, b);
      pinchStart = orbit.distance;
      return;
    }
    if (event.button === 2 || event.button === 1 || event.shiftKey) {
      dragging = "pan";
    } else if (event.button === 0 || event.pointerType === "touch") {
      dragging = "orbit";
    } else {
      return;
    }
    lastX = event.clientX;
    lastY = event.clientY;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, event);
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const next = pinchDistance(a, b);
      if (pinchDistance0 > 0) {
        orbit.distance = Math.min(40, Math.max(0.6, pinchStart * (pinchDistance0 / next)));
        applyOrbit(camera, focus, orbit);
      }
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (dragging === "orbit") {
      orbit.yaw -= dx * 0.32;
      orbit.pitch = Math.min(78, Math.max(-12, orbit.pitch + dy * 0.28));
    } else {
      const panScale = orbit.distance * 0.0018;
      const yaw = (orbit.yaw * Math.PI) / 180;
      orbit.panX += -dx * panScale * Math.cos(yaw) + dy * panScale * Math.sin(yaw) * 0.15;
      orbit.panZ += dx * panScale * Math.sin(yaw);
      orbit.panY += dy * panScale;
    }
    applyOrbit(camera, focus, orbit);
  };

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    dragging = pointers.size === 1 ? "orbit" : null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.08 : 0.92;
    orbit.distance = Math.min(40, Math.max(0.6, orbit.distance * factor));
    applyOrbit(camera, focus, orbit);
  };

  const onContext = (event: Event) => event.preventDefault();

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      orbit.distance = Math.max(0.6, orbit.distance * 0.9);
      applyOrbit(camera, focus, orbit);
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      orbit.distance = Math.min(40, orbit.distance * 1.1);
      applyOrbit(camera, focus, orbit);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      orbit.yaw += 4;
      applyOrbit(camera, focus, orbit);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      orbit.yaw -= 4;
      applyOrbit(camera, focus, orbit);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      orbit.pitch = Math.min(78, orbit.pitch + 3);
      applyOrbit(camera, focus, orbit);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      orbit.pitch = Math.max(-12, orbit.pitch - 3);
      applyOrbit(camera, focus, orbit);
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContext);
  canvas.addEventListener("keydown", onKey);
  window.addEventListener("resize", resize);

  applyOrbit(camera, focus, orbit);

  const asset = new Asset("room", "gsplat", { url: sogUrl });
  app.assets.add(asset);

  const load = new Promise<void>((resolve, reject) => {
    asset.ready(() => resolve());
    asset.on("error", (err: unknown) => {
      const message = err instanceof Error ? err.message : "The SOG asset could not be loaded.";
      reject(new Error(message));
    });
    app.assets.load(asset);
  });

  const reset = () => {
    Object.assign(orbit, home);
    applyOrbit(camera, focus, orbit);
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContext);
    canvas.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", resize);
    app.destroy();
  };

  try {
    await load;
    if (!destroyed) {
      const splat = new Entity("Room");
      splat.addComponent("gsplat", { asset });
      app.root.addChild(splat);

      const framed = frameFromSplat(splat);
      focus = framed.focus;
      home.distance = framed.distance;
      home.yaw = 32;
      home.pitch = 8;
      Object.assign(orbit, home);
      applyOrbit(camera, focus, orbit);
      onReady?.();
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "PlayCanvas could not read this SOG. Check the CDN URL and CORS.";
    onError?.(message);
  }

  return { reset, resize, destroy };
}
