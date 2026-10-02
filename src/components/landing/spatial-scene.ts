import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Clock,
  Color,
  EdgesGeometry,
  FogExp2,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";

export type SpatialHandle = {
  destroy: () => void;
};

type MountOptions = {
  onProgress?: (value: number) => void;
};

type Sample = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  birth: number;
};

const ROOM = { w: 6.4, d: 8.2, h: 3.05 };

const POINT_VERT = /* glsl */ `
attribute float aBirth;
uniform float uProgress;
uniform float uTime;
uniform float uSize;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = color;
  float appear = smoothstep(aBirth - 0.14, aBirth + 0.02, uProgress);
  float breathe = 0.92 + 0.08 * sin(uTime * 0.7 + aBirth * 18.0);
  vAlpha = appear * breathe;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(appear * uSize * (280.0 / -mvPosition.z), 0.0);
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
  float gaussian = exp(-d * 2.8);
  gl_FragColor = vec4(vColor, vAlpha * gaussian);
}
`;

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
varying float vAlpha;

void main() {
  vec3 pos = position;
  pos.y += mod(uTime * 0.07 + position.x * 0.15, 2.8);
  vAlpha = 0.18;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * (180.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const DUST_FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  gl_FragColor = vec4(0.92, 0.84, 0.7, vAlpha * (1.0 - d));
}
`;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function push(
  out: Sample[],
  x: number,
  y: number,
  z: number,
  color: [number, number, number],
  rand: () => number,
  jitter = 0.03,
) {
  const px = x + (rand() - 0.5) * jitter;
  const py = y + (rand() - 0.5) * jitter;
  const pz = z + (rand() - 0.5) * jitter;
  const door = Math.hypot(px, pz - ROOM.d * 0.5);
  const birth = Math.min(door / 9.4, 0.98);
  out.push({
    x: px,
    y: py,
    z: pz,
    r: color[0],
    g: color[1],
    b: color[2],
    birth,
  });
}

function sampleBox(
  out: Sample[],
  count: number,
  bounds: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number },
  color: [number, number, number],
  rand: () => number,
  jitter: number,
) {
  for (let i = 0; i < count; i += 1) {
    push(
      out,
      bounds.x0 + rand() * (bounds.x1 - bounds.x0),
      bounds.y0 + rand() * (bounds.y1 - bounds.y0),
      bounds.z0 + rand() * (bounds.z1 - bounds.z0),
      color,
      rand,
      jitter,
    );
  }
}

function sampleWalls(out: Sample[], count: number, rand: () => number) {
  const wall: [number, number, number] = [0.78, 0.72, 0.61];
  const hw = ROOM.w * 0.5;
  const hd = ROOM.d * 0.5;

  for (let i = 0; i < count; i += 1) {
    const face = Math.floor(rand() * 4);
    const y = 0.08 + rand() * (ROOM.h - 0.16);
    let x = 0;
    let z = 0;

    if (face === 0) {
      x = -hw;
      z = (rand() * 2 - 1) * hd;
    } else if (face === 1) {
      x = hw;
      z = (rand() * 2 - 1) * hd;
    } else if (face === 2) {
      z = -hd;
      x = (rand() * 2 - 1) * hw;
    } else {
      z = hd;
      x = (rand() * 2 - 1) * hw;
      if (Math.abs(x) < 0.7 && y < 2.15) continue;
    }

    if (face === 0 && y > 1.05 && y < 2.15 && z > -0.7 && z < 1.15) {
      push(out, x, y, z, [0.95, 0.84, 0.62], rand, 0.04);
      continue;
    }

    push(out, x, y, z, wall, rand, 0.035);
  }
}

function buildRoom(count: number): Sample[] {
  const rand = mulberry32(20260908);
  const points: Sample[] = [];
  const hw = ROOM.w * 0.5;
  const hd = ROOM.d * 0.5;

  sampleWalls(points, Math.floor(count * 0.46), rand);

  for (let i = 0; i < Math.floor(count * 0.28); i += 1) {
    push(
      points,
      (rand() * 2 - 1) * hw,
      0.02,
      (rand() * 2 - 1) * hd,
      [0.4, 0.3, 0.2],
      rand,
      0.02,
    );
  }

  for (let i = 0; i < Math.floor(count * 0.06); i += 1) {
    push(
      points,
      (rand() * 2 - 1) * hw,
      ROOM.h,
      (rand() * 2 - 1) * hd,
      [0.52, 0.49, 0.43],
      rand,
      0.04,
    );
  }

  sampleBox(
    points,
    Math.floor(count * 0.1),
    { x0: -2.35, x1: 0.55, y0: 0.08, y1: 0.82, z0: -3.45, z1: -2.25 },
    [0.3, 0.25, 0.2],
    rand,
    0.04,
  );

  sampleBox(
    points,
    Math.floor(count * 0.035),
    { x0: -0.7, x1: 0.7, y0: 0.32, y1: 0.44, z0: -1.55, z1: -0.35 },
    [0.55, 0.42, 0.28],
    rand,
    0.03,
  );

  sampleBox(
    points,
    Math.floor(count * 0.04),
    { x0: hw - 0.42, x1: hw - 0.08, y0: 0.1, y1: 1.05, z0: -1.8, z1: 0.2 },
    [0.36, 0.3, 0.24],
    rand,
    0.03,
  );

  for (let i = 0; i < Math.floor(count * 0.025); i += 1) {
    push(points, 1.85, 0.15 + rand() * 1.55, 2.35, [0.86, 0.66, 0.38], rand, 0.05);
  }

  return points;
}

function geometryFromSamples(samples: Sample[]) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(samples.length * 3);
  const colors = new Float32Array(samples.length * 3);
  const births = new Float32Array(samples.length);

  samples.forEach((sample, index) => {
    positions[index * 3] = sample.x;
    positions[index * 3 + 1] = sample.y;
    positions[index * 3 + 2] = sample.z;
    colors[index * 3] = sample.r;
    colors[index * 3 + 1] = sample.g;
    colors[index * 3 + 2] = sample.b;
    births[index] = sample.birth;
  });

  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("aBirth", new BufferAttribute(births, 1));
  return geometry;
}

export function mountSpatialScene(
  canvas: HTMLCanvasElement,
  options: MountOptions = {},
): SpatialHandle | null {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const pointCount = mobile ? 2400 : 6200;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !mobile,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(new Color(0x070605), 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.35 : 1.6));

  const scene = new Scene();
  scene.fog = new FogExp2(0x070605, 0.068);

  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(7.4, 3.6, 8.6);

  const root = new Group();
  root.position.y = -ROOM.h * 0.42;
  scene.add(root);

  const roomMaterial = new ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: {
      uProgress: { value: reduceMotion ? 1 : 0 },
      uTime: { value: 0 },
      uSize: { value: mobile ? 7.5 : 9.2 },
    },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });

  const roomPoints = new Points(geometryFromSamples(buildRoom(pointCount)), roomMaterial);
  roomMaterial.toneMapped = false;
  root.add(roomPoints);

  const dustCount = mobile ? 120 : 280;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustRand = mulberry32(88);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (dustRand() - 0.5) * ROOM.w * 1.2;
    dustPositions[i * 3 + 1] = dustRand() * ROOM.h;
    dustPositions[i * 3 + 2] = (dustRand() - 0.5) * ROOM.d * 1.2;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(dustPositions, 3));
  const dustMaterial = new ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 4.2 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  root.add(new Points(dustGeometry, dustMaterial));

  const roomBox = new BoxGeometry(ROOM.w, ROOM.h, ROOM.d);
  roomBox.translate(0, ROOM.h * 0.5, 0);
  const wire = new LineSegments(
    new EdgesGeometry(roomBox),
    new LineBasicMaterial({
      color: 0xc9a06a,
      transparent: true,
      opacity: 0.28,
    }),
  );
  root.add(wire);

  const grid = new GridHelper(18, 36, 0x8a7354, 0x2c2822);
  const gridMaterial = grid.material;
  if (!Array.isArray(gridMaterial)) {
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.32;
  }
  root.add(grid);

  const pointer = new Vector2(0, 0);
  const clock = new Clock();
  let elapsed = 0;
  let progress = reduceMotion ? 1 : 0;
  let lastPct = -1;
  let frame = 0;
  let running = true;
  let destroyed = false;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const onPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  };

  canvas.addEventListener("pointermove", onPointer);

  const visibility = () => {
    running = document.visibilityState === "visible";
  };
  document.addEventListener("visibilitychange", visibility);

  const intersection = new IntersectionObserver(
    ([entry]) => {
      running = Boolean(entry?.isIntersecting) && document.visibilityState === "visible";
    },
    { threshold: 0.08 },
  );
  intersection.observe(canvas);

  const tick = () => {
    if (destroyed) return;
    frame = window.requestAnimationFrame(tick);
    if (!running) return;

    const dt = Math.min(clock.getDelta(), 0.033);
    elapsed += dt;

    if (!reduceMotion && progress < 1) {
      progress = Math.min(progress + dt * 0.22, 1);
      roomMaterial.uniforms.uProgress.value = progress;
    }

    const pct = Math.round(progress * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      options.onProgress?.(progress);
    }

    roomMaterial.uniforms.uTime.value = elapsed;
    dustMaterial.uniforms.uTime.value = elapsed;

    const orbit = reduceMotion ? 0.55 : elapsed * 0.085;
    const radius = 11.2 + Math.sin(elapsed * 0.18) * 0.35;
    const lookY = 1.15;
    const px = Math.cos(orbit) * radius + pointer.x * 0.9;
    const pz = Math.sin(orbit) * radius + pointer.y * 0.4;
    const py = 3.35 + Math.sin(elapsed * 0.22) * 0.18 - pointer.y * 0.35;
    camera.position.set(px, py, pz);
    camera.lookAt(0, lookY, 0);

    renderer.render(scene, camera);
  };

  tick();

  return {
    destroy() {
      destroyed = true;
      running = false;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointermove", onPointer);
      roomPoints.geometry.dispose();
      roomMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
      wire.geometry.dispose();
      (wire.material as LineBasicMaterial).dispose();
      roomBox.dispose();
      grid.geometry.dispose();
      renderer.dispose();
    },
  };
}
