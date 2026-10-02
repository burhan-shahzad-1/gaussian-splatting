import {
  ClampToEdgeWrapping,
  DoubleSide,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  VideoTexture,
  WebGLRenderer,
} from "three";

export type PanoramaHandle = {
  reset: () => void;
  resize: () => void;
  destroy: () => void;
};

export type PanoramaOptions = {
  canvas: HTMLCanvasElement;
  panoUrl?: string;
  video?: HTMLVideoElement;
  spots?: boolean;
  onReady?: () => void;
  onError?: (message: string) => void;
};

type Look = { yaw: number; pitch: number };

const SPOT_COUNT = 8;

export async function mountPanoramaViewer(
  options: PanoramaOptions,
): Promise<PanoramaHandle> {
  const { canvas, panoUrl, video, spots = true, onReady } = options;
  if (!canvas.parentElement) {
    throw new Error("Viewer canvas has no parent.");
  }
  if (!video && !panoUrl) {
    throw new Error("The panorama has no picture.");
  }
  const host: HTMLElement = canvas.parentElement;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x050403, 1);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(80, 1, 0.1, 2000);
  camera.rotation.order = "YXZ";

  const look: Look = { yaw: 0, pitch: 8 };
  let dragging = false;
  let didDrag = false;
  let startX = 0;
  let startY = 0;
  let startYaw = 0;
  let startPitch = 0;
  let disposed = false;
  let frame = 0;
  let hoverIndex = -1;
  let sphere: Mesh | null = null;
  const pointer = new Vector2();
  const raycaster = new Raycaster();

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function applyLook() {
    const phi = MathUtils.degToRad(90 - look.pitch);
    const theta = MathUtils.degToRad(look.yaw);
    camera.lookAt(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
  }

  function reset() {
    look.yaw = 0;
    look.pitch = 8;
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(0, video.duration * 0.5);
    }
    applyLook();
  }

  const floor = new Mesh(
    new PlaneGeometry(28, 28),
    new MeshBasicMaterial({ visible: false, side: DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.55;
  scene.add(floor);

  const rings: Mesh[] = [];
  if (spots) {
    for (let index = 0; index < SPOT_COUNT; index += 1) {
      const angle = (index / SPOT_COUNT) * Math.PI * 2;
      const ring = new Mesh(
        new RingGeometry(0.18, 0.3, 48),
        new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.72,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(Math.sin(angle) * 3.4, -1.52, Math.cos(angle) * 3.4);
      ring.userData.index = index;
      rings.push(ring);
      scene.add(ring);
    }
  }

  function standAt(index: number) {
    const ring = rings[index];
    if (!ring) return;
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    if (video && duration > 0) {
      video.currentTime = (index / SPOT_COUNT) * duration;
    }
    look.yaw = MathUtils.radToDeg(Math.atan2(ring.position.x, ring.position.z));
    look.pitch = 6;
    applyLook();
  }

  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const ringHit = raycaster.intersectObjects(rings, false)[0];
    if (ringHit) {
      standAt(ringHit.object.userData.index as number);
      return;
    }
    const floorHit = raycaster.intersectObject(floor, false)[0];
    if (floorHit && rings.length > 0) {
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      rings.forEach((ring, index) => {
        const dist = ring.position.distanceTo(floorHit.point);
        if (dist < bestDist) {
          best = index;
          bestDist = dist;
        }
      });
      if (bestDist < 3.2) {
        standAt(best);
        return;
      }
    }
    if (!sphere) return;
    const wall = raycaster.intersectObject(sphere, false)[0];
    if (!wall) return;
    const point = wall.point.clone().normalize();
    look.yaw = MathUtils.radToDeg(Math.atan2(point.z, point.x));
    look.pitch = Math.max(
      -85,
      Math.min(85, 90 - MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, point.y))))),
    );
    applyLook();
  }

  function updateHover(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const ringHit = raycaster.intersectObjects(rings, false)[0];
    const floorHit = raycaster.intersectObject(floor, false)[0];
    hoverIndex = ringHit ? (ringHit.object.userData.index as number) : -1;
    canvas.style.cursor = dragging ? "grabbing" : ringHit || floorHit ? "pointer" : "grab";
  }

  function draw() {
    if (disposed) return;
    frame = requestAnimationFrame(draw);
    texture.needsUpdate = Boolean(video);
    rings.forEach((ring, index) => {
      const material = ring.material as MeshBasicMaterial;
      const pulse = 0.62 + 0.18 * Math.sin(performance.now() / 400 + index);
      material.opacity = index === hoverIndex ? 0.95 : pulse;
      ring.scale.setScalar(index === hoverIndex ? 1.18 : 1);
    });
    renderer.render(scene, camera);
  }

  function onPointerMove(event: PointerEvent) {
    updateHover(event);
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > 8) didDrag = true;
    look.yaw = startYaw - dx * 0.15;
    look.pitch = Math.max(-85, Math.min(85, startPitch + dy * 0.12));
    applyLook();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    dragging = true;
    didDrag = false;
    startX = event.clientX;
    startY = event.clientY;
    startYaw = look.yaw;
    startPitch = look.pitch;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    canvas.style.cursor = "grabbing";
  }

  function onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return;
    const wasDragging = dragging;
    dragging = false;
    if (wasDragging && !didDrag) pick(event);
    updateHover(event);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  canvas.tabIndex = 0;
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  const texture = video
    ? await textureFromVideo(video)
    : await textureFromUrl(panoUrl as string);

  const geometry = new SphereGeometry(80, 128, 96);
  geometry.scale(-1, 1, 1);
  sphere = new Mesh(geometry, new MeshBasicMaterial({ map: texture }));
  scene.add(sphere);

  resize();
  applyLook();
  draw();
  onReady?.();

  return {
    reset,
    resize,
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      if (sphere) {
        sphere.geometry.dispose();
        (sphere.material as MeshBasicMaterial).dispose();
      }
      texture.dispose();
      floor.geometry.dispose();
      (floor.material as MeshBasicMaterial).dispose();
      for (const ring of rings) {
        ring.geometry.dispose();
        (ring.material as MeshBasicMaterial).dispose();
      }
      renderer.dispose();
    },
  };
}

async function textureFromUrl(panoUrl: string) {
  const texture = await new Promise<Texture>((resolve, reject) => {
    const loader = new TextureLoader();
    loader.load(
      panoUrl,
      (loaded) => resolve(loaded),
      undefined,
      () => reject(new Error("The panorama could not be loaded from storage.")),
    );
  });
  applyPanoTexture(texture);
  return texture;
}

async function textureFromVideo(video: HTMLVideoElement) {
  if (video.readyState < 2) {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error("The 360 capture could not be loaded from storage.")),
        { once: true },
      );
    });
  }
  const texture = new VideoTexture(video);
  applyPanoTexture(texture);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function applyPanoTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
}
