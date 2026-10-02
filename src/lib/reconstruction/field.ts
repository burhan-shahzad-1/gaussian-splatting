import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Clock,
  Color,
  EdgesGeometry,
  FogExp2,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  BoxGeometry,
  LineSegments,
} from "three";
import type { ReconstructionStatus } from "@/lib/types";
import { sceneStageIndex } from "@/lib/status";

export type ReconstructionFieldHandle = {
  setStatus: (status: ReconstructionStatus) => void;
  destroy: () => void;
};

const ROOM = { w: 6.2, d: 8, h: 3.05 };

const POINT_VERT = /* glsl */ `
attribute float aBirth;
uniform float uProgress;
uniform float uTime;
uniform float uSize;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = color;
  float appear = smoothstep(aBirth - 0.12, aBirth + 0.04, uProgress);
  float pulse = 0.9 + 0.1 * sin(uTime * 0.8 + aBirth * 16.0);
  vAlpha = appear * pulse;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(appear * uSize * (260.0 / -mvPosition.z), 0.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const POINT_FRAG = /* glsl */ `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor, vAlpha * exp(-d * 2.6));
}
`;

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function densityFor(status: ReconstructionStatus) {
  const index = sceneStageIndex(status);
  if (status === "FAILED") return 0.08;
  return Math.min(0.08 + index * 0.14, 1);
}

function buildSamples(count: number) {
  const rand = mulberry32(42);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const births = new Float32Array(count);
  const hw = ROOM.w * 0.5;
  const hd = ROOM.d * 0.5;

  for (let i = 0; i < count; i += 1) {
    const wall = rand();
    let x = (rand() * 2 - 1) * hw;
    let y = rand() * ROOM.h;
    let z = (rand() * 2 - 1) * hd;
    let r = 0.72;
    let g = 0.58;
    let b = 0.4;

    if (wall < 0.22) {
      y = 0.03;
      r = 0.42;
      g = 0.32;
      b = 0.22;
    } else if (wall < 0.3) {
      y = ROOM.h - 0.04;
      r = 0.5;
      g = 0.46;
      b = 0.4;
    } else if (wall < 0.48) {
      x = wall < 0.39 ? -hw : hw;
    } else if (wall < 0.66) {
      z = wall < 0.57 ? -hd : hd;
    } else if (wall < 0.78) {
      x = -1.4 + rand() * 2.4;
      y = 0.12 + rand() * 0.7;
      z = -2.8 + rand() * 1.1;
      r = 0.32;
      g = 0.26;
      b = 0.2;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = r + rand() * 0.12;
    colors[i * 3 + 1] = g + rand() * 0.08;
    colors[i * 3 + 2] = b + rand() * 0.06;
    births[i] = rand();
  }

  return { positions, colors, births };
}

function cameraPath() {
  return new CatmullRomCurve3(
    [
      new Vector3(-2.4, 1.35, 3.2),
      new Vector3(-0.4, 1.5, 2.6),
      new Vector3(1.8, 1.4, 1.1),
      new Vector3(2.2, 1.45, -1.4),
      new Vector3(0.3, 1.55, -2.8),
      new Vector3(-2.1, 1.4, -1.6),
      new Vector3(-2.4, 1.35, 1.2),
    ],
    false,
    "catmullrom",
    0.35,
  );
}

export function mountReconstructionField(
  canvas: HTMLCanvasElement,
  status: ReconstructionStatus,
): ReconstructionFieldHandle | null {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const count = mobile ? 2800 : 7200;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !mobile,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(new Color(0x060504), 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.5));

  const scene = new Scene();
  scene.fog = new FogExp2(0x060504, 0.06);
  const camera = new PerspectiveCamera(42, 1, 0.1, 80);
  const root = new Group();
  root.position.y = -ROOM.h * 0.42;
  scene.add(root);

  const samples = buildSamples(count);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(samples.positions, 3));
  geometry.setAttribute("color", new BufferAttribute(samples.colors, 3));
  geometry.setAttribute("aBirth", new BufferAttribute(samples.births, 1));

  const material = new ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: {
      uProgress: { value: reduceMotion ? densityFor(status) : 0.05 },
      uTime: { value: 0 },
      uSize: { value: mobile ? 7.2 : 9 },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  root.add(new Points(geometry, material));

  const box = new BoxGeometry(ROOM.w, ROOM.h, ROOM.d);
  box.translate(0, ROOM.h * 0.5, 0);
  const wireMaterial = new LineBasicMaterial({
    color: 0xc9a06a,
    transparent: true,
    opacity: 0.22,
  });
  const wire = new LineSegments(new EdgesGeometry(box), wireMaterial);
  root.add(wire);

  const grid = new GridHelper(16, 32, 0x8a7354, 0x2a2620);
  if (!Array.isArray(grid.material)) {
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
  }
  root.add(grid);

  const path = cameraPath();
  const pathGeom = new BufferGeometry().setFromPoints(path.getPoints(80));
  const pathMat = new LineBasicMaterial({ color: 0xe4c49a, transparent: true, opacity: 0.0 });
  const pathLine = new Line(pathGeom, pathMat);
  root.add(pathLine);

  const camMarkerGeom = new BufferGeometry().setFromPoints([
    new Vector3(-0.16, 0.1, 0.18),
    new Vector3(0.16, 0.1, 0.18),
    new Vector3(0.16, -0.1, 0.18),
    new Vector3(-0.16, -0.1, 0.18),
  ]);
  const camMarker = new LineLoop(
    camMarkerGeom,
    new LineBasicMaterial({ color: 0xf3ece0, transparent: true, opacity: 0 }),
  );
  root.add(camMarker);

  let target = densityFor(status);
  let currentStatus = status;
  let running = true;
  let destroyed = false;
  let frame = 0;
  const clock = new Clock();
  let elapsed = 0;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

    const vis = () => {
      running = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", vis);

    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      running = document.visibilityState === "visible" && (entry?.isIntersecting ?? true);
    });
    io.observe(canvas);

  const tick = () => {
    if (destroyed) return;
    frame = window.requestAnimationFrame(tick);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.033);
    elapsed += dt;

    const progress = material.uniforms.uProgress.value as number;
    if (!reduceMotion) {
      material.uniforms.uProgress.value += (target - progress) * Math.min(dt * 1.6, 1);
    } else {
      material.uniforms.uProgress.value = target;
    }
    material.uniforms.uTime.value = elapsed;

    const stage = sceneStageIndex(currentStatus);
    wireMaterial.opacity = stage < 4 ? 0.28 : Math.max(0.06, 0.28 - (stage - 3) * 0.08);
    pathMat.opacity = stage >= 2 && stage < 6 ? 0.55 : stage >= 6 ? 0.12 : 0;
    (camMarker.material as LineBasicMaterial).opacity = pathMat.opacity;

    if (stage >= 2) {
      const t = (elapsed * 0.06) % 1;
      const point = path.getPointAt(t);
      const look = path.getPointAt(Math.min(t + 0.04, 1));
      camMarker.position.copy(point);
      camMarker.lookAt(look);
    }

    const freeze = reduceMotion || currentStatus === "COMPLETED" || currentStatus === "FAILED";
    const orbit = freeze ? 0.7 : elapsed * 0.07;
    const radius = 10.6;
    camera.position.set(Math.cos(orbit) * radius, 3.4, Math.sin(orbit) * radius);
    camera.lookAt(0, 1.15, 0);
    renderer.render(scene, camera);
  };
  tick();

  return {
    setStatus(next) {
      currentStatus = next;
      target = densityFor(next);
    },
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      geometry.dispose();
      material.dispose();
      box.dispose();
      wire.geometry.dispose();
      wireMaterial.dispose();
      pathGeom.dispose();
      pathMat.dispose();
      camMarkerGeom.dispose();
      (camMarker.material as LineBasicMaterial).dispose();
      renderer.dispose();
    },
  };
}
