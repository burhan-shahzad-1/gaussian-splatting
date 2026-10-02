import {
  ClampToEdgeWrapping,
  CanvasTexture,
  EquirectangularReflectionMapping,
  LinearFilter,
  MathUtils,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
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
  /** Optional already-decoded equirect frame (preferred on main). */
  frame?: HTMLCanvasElement | OffscreenCanvas | ImageBitmap;
  /** Position rings. Off on main. */
  spots?: boolean;
  onReady?: () => void;
  onError?: (message: string) => void;
};

type Look = { yaw: number; pitch: number };

export async function mountPanoramaViewer(
  options: PanoramaOptions,
): Promise<PanoramaHandle> {
  const { canvas, panoUrl, video, frame: sourceFrame, onReady } = options;
  if (!canvas.parentElement) {
    throw new Error("Viewer canvas has no parent.");
  }
  if (!video && !panoUrl && !sourceFrame) {
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
  renderer.autoClear = true;

  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.1, 2000);
  camera.rotation.order = "YXZ";

  const look: Look = { yaw: 0, pitch: 0 };
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startYaw = 0;
  let startPitch = 0;
  let disposed = false;
  let raf = 0;

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function applyLook() {
    camera.rotation.y = MathUtils.degToRad(-look.yaw);
    camera.rotation.x = MathUtils.degToRad(look.pitch);
  }

  function reset() {
    look.yaw = 0;
    look.pitch = 0;
    applyLook();
  }

  function draw() {
    if (disposed) return;
    raf = requestAnimationFrame(draw);
    if (video) texture.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) {
      canvas.style.cursor = "grab";
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    look.yaw = startYaw - dx * 0.18;
    look.pitch = Math.max(-85, Math.min(85, startPitch + dy * 0.14));
    applyLook();
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    dragging = true;
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
    dragging = false;
    canvas.style.cursor = "grab";
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  canvas.tabIndex = 0;
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  const texture = sourceFrame
    ? textureFromFrame(sourceFrame)
    : video
      ? await textureFromVideo(video)
      : await textureFromUrl(panoUrl as string);

  texture.mapping = EquirectangularReflectionMapping;
  scene.background = texture;

  resize();
  applyLook();
  draw();
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
      scene.background = null;
      texture.dispose();
      renderer.dispose();
    },
  };
}

function textureFromFrame(frame: HTMLCanvasElement | OffscreenCanvas | ImageBitmap) {
  const surface = document.createElement("canvas");
  surface.width = frame.width;
  surface.height = frame.height;
  const ctx = surface.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not copy a panorama frame.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, 0, 0);
  const texture = new CanvasTexture(surface);
  applyPanoTexture(texture);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
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
  video.pause();
  const texture = new VideoTexture(video);
  applyPanoTexture(texture);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function applyPanoTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
}
