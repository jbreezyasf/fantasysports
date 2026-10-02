'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  HalfFloatType,
  InstancedMesh,
  Object3D,
  PMREMGenerator,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  Shape,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderTarget
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  buildStadiumExhibits,
  parseStadiumWorldZone,
  STADIUM_WORLD_ZONES,
  titleYearLabel,
  type StadiumWorldExhibitId,
  type StadiumWorldFeature,
  type StadiumWorldZone
} from './stadiumWorldModel';

export type StadiumWorldPrototypeProps = {
  franchiseName: string;
  abbreviation: string;
  primary: string;
  secondary: string;
  establishedYear?: number | null;
  titleYears: Array<number | null>;
  rivalryCount: number;
  unlockedFeatures: StadiumWorldFeature[];
  nextUnlock?: string | null;
  onStandardView?: () => void;
  /** Preview/QA harness only: keeps the frame readable for pixel checks. */
  qaCapture?: boolean;
};

type Vec3 = [number, number, number];
type Palette = { primary: string; secondary: string; dimPrimary: string };

// ---------------------------------------------------------------------------
// World layout. The bowl is an ellipse (x stretched by BOWL_X) around the
// field; the front gate faces +z onto the plaza.
// ---------------------------------------------------------------------------
const LOGO_URL = '/brand/be-crown-mark-2048.webp';
const BOWL_X = 1.55;
const FACADE_R = 28;
const STAND_PROFILE: Array<[number, number]> = [
  [16, 0], [16, 1.2], [18, 1.2], [18, 2.6], [20, 2.6], [20, 4.2], [22, 4.2], [22, 6], [24, 6], [24, 8], [26, 8], [26, 10.2], [FACADE_R, 10.2], [FACADE_R, 0]
];

const DESTINATIONS: Record<StadiumWorldZone, { position: Vec3; target: Vec3; mobilePullback: boolean }> = {
  gate: { position: [0, 6.2, 68], target: [0, 8, 27], mobilePullback: true },
  field: { position: [0, 13.5, 26], target: [0, 4.2, -8], mobilePullback: false },
  'owners-suite': { position: [-30.9, 8.15, 3.7], target: [-28.5, 7.6, -1.3], mobilePullback: false },
  'rivalry-walk': { position: [-1.5, 3.6, 63], target: [6.5, 3, 49], mobilePullback: true },
  'legacy-wall': { position: [1.5, 3.4, 61], target: [-8.5, 2.4, 48], mobilePullback: true }
};
const ARRIVAL_START: Vec3 = [0, 48, 140];

const BEACONS: Record<StadiumWorldExhibitId, Vec3> = {
  'front-gate': [6.6, 15.2, 30.2],
  'title-banners': [-12.5, 13.6, 27.6],
  scoreboard: [0, 22.4, -26.2],
  'champions-trophy': [-28.6, 9.75, -1.2],
  'rivalry-walk': [7, 6.6, 50],
  'legacy-wall': [-9, 5.4, 49]
};

function facadePoint(x: number, offset = 0.35): { z: number; yaw: number } {
  const a = FACADE_R * BOWL_X;
  const b = FACADE_R;
  const z = b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2));
  return { z: z + offset, yaw: Math.atan2(x / (a * a), z / (b * b)) };
}

// ---------------------------------------------------------------------------
// Canvas-drawn text. All words in the world come from props, never artwork.
// ---------------------------------------------------------------------------
const DISPLAY_FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const SERIF_FONT = 'Georgia, "Times New Roman", serif';

function useCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, width, height);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, deps);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, font: string, weight = '900') {
  let px = size;
  ctx.font = `${weight} ${px}px ${font}`;
  while (ctx.measureText(text).width > maxWidth && px > 10) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${font}`;
  }
  return px;
}

function spaced(text: string) {
  return text.toUpperCase().split('').join(' ');
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function SceneEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.42;
    return () => {
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// Cinematic finish applied after tone mapping: navy shadows, warm highlights, vignette, fine grain.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadows = vec3(0.02, 0.04, 0.10);
      vec3 highlights = vec3(1.04, 0.99, 0.90);
      vec3 graded = mix(c.rgb + shadows * (1.0 - luma), c.rgb * highlights, smoothstep(0.25, 0.85, luma));
      graded = mix(vec3(luma), graded, 1.08);
      graded = (graded - 0.5) * 1.06 + 0.5;
      vec2 d = vUv - 0.5;
      float vignette = smoothstep(0.85, 0.25, length(d * vec2(1.0, 1.15)));
      graded *= mix(0.62, 1.0, vignette);
      graded += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), c.a);
    }`
};

function Bloom() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    // Multisampled HDR target keeps edges smooth through post-processing.
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: gl.getPixelRatio() > 1.5 ? 2 : 4 });
    const next = new EffectComposer(gl, target);
    next.addPass(new RenderPass(scene, camera));
    next.addPass(new UnrealBloomPass(new Vector2(size.width, size.height), 0.42, 0.5, 0.95));
    next.addPass(new OutputPass());
    next.addPass(new ShaderPass(GradeShader));
    return next;
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((state) => {
    const grade = composer.passes[composer.passes.length - 1] as ShaderPass;
    grade.uniforms.uTime.value = state.clock.elapsedTime % 10;
    composer.render();
    // Signals QA that a full frame (scene + bloom) has been drawn to the canvas.
    if (gl.domElement.dataset.frame !== 'drawn') gl.domElement.dataset.frame = 'drawn';
  }, 1);
  return null;
}

type LookState = { yaw: number; pitch: number };

function CameraRig({ zone, look, arriving, reducedMotion }: { zone: StadiumWorldZone; look: MutableRefObject<LookState>; arriving: MutableRefObject<boolean>; reducedMotion: boolean }) {
  const { camera, size, gl } = useThree();
  const destination = DESTINATIONS[zone];
  const aspect = size.width / Math.max(size.height, 1);
  const pullback = destination.mobilePullback && aspect < 1 ? Math.min(1.5, 0.95 / aspect) : 1;
  const targetPosition = useMemo(() => new Vector3(...destination.target).lerp(new Vector3(...destination.position), pullback), [destination, pullback]);
  // On tall phone screens, aim slightly low so the subject sits above the card and destination bar.
  const targetLook = useMemo(() => {
    const next = new Vector3(...destination.target);
    if (aspect < 1) next.y -= next.distanceTo(targetPosition) * 0.12;
    return next;
  }, [destination, aspect, targetPosition]);
  const lookPoint = useRef(new Vector3(0, 6, 10));
  const scratch = useMemo(() => ({ dir: new Vector3(), axis: new Vector3(), desired: new Vector3(), up: new Vector3(0, 1, 0) }), []);

  // Tall phone screens get a wider lens so each destination keeps its context.
  useLayoutEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const fov = aspect < 1 ? 64 : 52;
    if (perspective.fov !== fov) {
      perspective.fov = fov;
      perspective.updateProjectionMatrix();
    }
  }, [camera, aspect]);

  useLayoutEffect(() => {
    if (arriving.current && !reducedMotion) {
      camera.position.set(...ARRIVAL_START);
      lookPoint.current.set(0, 6, 10);
    } else {
      camera.position.copy(targetPosition);
      lookPoint.current.copy(targetLook);
      arriving.current = false;
    }
    camera.lookAt(lookPoint.current);
    // Only on first mount.
  }, []);

  useFrame((_, delta) => {
    const rate = arriving.current ? 0.95 : 2.4;
    // Time-based so slow devices still arrive on time.
    const step = Math.min(delta, 0.5);
    const t = reducedMotion ? 1 : 1 - Math.exp(-rate * step);
    camera.position.lerp(targetPosition, t);

    const { dir, axis, desired, up } = scratch;
    dir.copy(targetLook).sub(targetPosition);
    dir.applyAxisAngle(up, look.current.yaw);
    axis.crossVectors(dir, up).normalize();
    dir.applyAxisAngle(axis, look.current.pitch);
    desired.copy(camera.position).add(dir);
    lookPoint.current.lerp(desired, reducedMotion ? 1 : 1 - Math.exp(-4 * step));
    camera.lookAt(lookPoint.current);

    const distance = camera.position.distanceTo(targetPosition);
    if (arriving.current && distance < 0.6) arriving.current = false;
    const settled = distance < 0.08 && lookPoint.current.distanceTo(desired) < 0.08 ? 'settled' : 'moving';
    if (gl.domElement.dataset.camera !== settled) gl.domElement.dataset.camera = settled;
  });
  return null;
}

function Clickable({ id, onSelect, children }: { id: StadiumWorldExhibitId; onSelect: (id: StadiumWorldExhibitId) => void; children: ReactNode }) {
  return <group
    onClick={(event: ThreeEvent<MouseEvent>) => {
      if (event.delta > 8) return;
      event.stopPropagation();
      onSelect(id);
    }}
    onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}
  >
    {children}
  </group>;
}

function Beacon({ id, position, color, active, onSelect }: { id: StadiumWorldExhibitId; position: Vec3; color: string; active: boolean; onSelect: (id: StadiumWorldExhibitId) => void }) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.6 + position[0]) * 0.18;
    ref.current.rotation.y += 0.012;
  });
  const scale = id === 'champions-trophy' ? 0.45 : 1;
  return <Clickable id={id} onSelect={onSelect}>
    <group ref={ref} position={position} scale={scale}>
      <mesh>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color={active ? '#ffffff' : color} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.78, 0.045, 8, 40]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      {/* generous invisible hit target for fingers */}
      <mesh visible={false}>
        <sphereGeometry args={[1.4, 8, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  </Clickable>;
}

// ---------------------------------------------------------------------------
// Sky and ground
// ---------------------------------------------------------------------------
const NAVY = '#070d1c';
const IVORY = '#ece3cf';

function useLogoTexture() {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    new TextureLoader().load(LOGO_URL, (loaded) => {
      if (cancelled) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = SRGBColorSpace;
      loaded.anisotropy = 8;
      setTexture(loaded);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function NightSky() {
  const geometry = useMemo(() => {
    const count = 1100;
    const positions = new Float32Array(count * 3);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(0.22 + random() * 0.78);
      positions[i * 3] = 380 * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = 380 * Math.cos(phi);
      positions[i * 3 + 2] = 380 * Math.sin(phi) * Math.sin(theta);
    }
    const next = new BufferGeometry();
    next.setAttribute('position', new BufferAttribute(positions, 3));
    return next;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const skyMaterial = useMemo(() => new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 horizon = vec3(0.075, 0.115, 0.215);
        vec3 glow = vec3(0.20, 0.16, 0.10);
        vec3 zenith = vec3(0.006, 0.012, 0.035);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.6, h));
        col += glow * exp(-abs(h) * 14.0) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`
  }), []);
  useEffect(() => () => skyMaterial.dispose(), [skyMaterial]);
  return <>
    <mesh material={skyMaterial}>
      <sphereGeometry args={[420, 32, 16]} />
    </mesh>
    <points geometry={geometry}>
      <pointsMaterial color="#dfe6f2" size={1.5} sizeAttenuation={false} fog={false} transparent opacity={0.8} />
    </points>
  </>;
}

function Ground() {
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <planeGeometry args={[500, 500]} />
      <meshStandardMaterial color="#080c16" roughness={0.42} metalness={0.5} />
    </mesh>
    {/* polished plaza paving in front of the gate */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 51]}>
      <planeGeometry args={[30, 44]} />
      <meshStandardMaterial color="#141a26" roughness={0.22} metalness={0.55} />
    </mesh>
  </>;
}

// Volumetric-looking light shaft from a light tower toward the field.
function LightBeam({ from, to, color }: { from: Vec3; to: Vec3; color: string }) {
  const ref = useRef<Group>(null);
  const length = useMemo(() => new Vector3(...from).distanceTo(new Vector3(...to)), [from, to]);
  const geometry = useMemo(() => {
    const next = new ConeGeometry(7.5, length, 40, 1, true);
    next.translate(0, -length / 2, 0);
    next.rotateX(-Math.PI / 2);
    return next;
  }, [length]);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    fog: false,
    uniforms: { uColor: { value: new Color(color) } },
    vertexShader: `varying float vAlong; varying vec3 vNormalV; varying vec3 vViewV;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlong; varying vec3 vNormalV; varying vec3 vViewV;
      void main() {
        float edge = pow(abs(dot(vNormalV, vViewV)), 2.2);
        float fade = pow(vAlong, 1.6);
        gl_FragColor = vec4(uColor * edge * fade * 0.16, 1.0);
      }`
  }), [color]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useLayoutEffect(() => { ref.current?.lookAt(...to); }, [to]);
  return <group ref={ref} position={from}>
    <mesh geometry={geometry} material={material} />
  </group>;
}

// Crowd camera flashes and phone lights, animated entirely on the GPU.
function CrowdLights({ positions }: { positions: Float32Array }) {
  const geometry = useMemo(() => {
    const count = positions.length / 3;
    const phase = new Float32Array(count);
    const rate = new Float32Array(count);
    let seed = 11;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      phase[i] = random() * 100;
      rate[i] = 0.4 + random() * 1.6;
    }
    const next = new BufferGeometry();
    next.setAttribute('position', new BufferAttribute(positions, 3));
    next.setAttribute('aPhase', new BufferAttribute(phase, 1));
    next.setAttribute('aRate', new BufferAttribute(rate, 1));
    return next;
  }, [positions]);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aPhase; attribute float aRate; uniform float uTime; varying float vAlpha;
      void main() {
        float flash = pow(max(0.0, sin(uTime * aRate + aPhase)), 80.0);
        float phone = step(0.82, fract(aPhase * 0.37)) * 0.22;
        vAlpha = max(flash, phone);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min((flash > phone ? 9.0 : 3.5) * (40.0 / -mv.z), 10.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * 2.0, a);
      }`
  }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });
  return <points geometry={geometry} material={material} />;
}

// Scrolling LED ribbon board wrapped around a riser of the bowl.
function RibbonBoard({ radius, y, height, palette, franchiseName, speed }: { radius: number; y: number; height: number; palette: Palette; franchiseName: string; speed: number }) {
  const texture = useCanvasTexture(4096, 128, (ctx, w, h) => {
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, w, h);
    const segment = w / 4;
    for (let s = 0; s < 4; s++) {
      const x0 = s * segment;
      const gradient = ctx.createLinearGradient(x0, 0, x0 + segment, 0);
      gradient.addColorStop(0, 'rgba(217,180,59,0.05)');
      gradient.addColorStop(0.5, 'rgba(217,180,59,0.32)');
      gradient.addColorStop(1, 'rgba(217,180,59,0.05)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x0, 0, segment, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = s % 2 ? palette.secondary : palette.primary;
      ctx.font = `900 72px ${DISPLAY_FONT}`;
      ctx.fillText(spaced(s % 2 ? 'Big Exec' : franchiseName), x0 + segment / 2, h / 2 + 4);
      // chevrons
      ctx.fillStyle = palette.primary;
      for (let c = 0; c < 3; c++) {
        const cx = x0 + 40 + c * 34;
        ctx.beginPath();
        ctx.moveTo(cx, 30);
        ctx.lineTo(cx + 22, h / 2);
        ctx.lineTo(cx, h - 30);
        ctx.lineTo(cx + 10, h / 2);
        ctx.closePath();
        ctx.fill();
      }
    }
  }, [franchiseName, palette.primary, palette.secondary]);
  useLayoutEffect(() => {
    texture.wrapS = RepeatWrapping;
    texture.repeat.set(-3, 1); // viewed from inside the cylinder, so flip to read left-to-right
    texture.needsUpdate = true;
  }, [texture]);
  useFrame((_, delta) => { texture.offset.x = (texture.offset.x + delta * speed) % 1; });
  return <mesh position={[0, y, 0]} scale={[BOWL_X, 1, 1]}>
    <cylinderGeometry args={[radius, radius, height, 160, 1, true]} />
    <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
  </mesh>;
}

// ---------------------------------------------------------------------------
// The bowl: stands, crowd, ribbon boards, roof halo, light towers, field, scoreboard
// ---------------------------------------------------------------------------
function Bowl({ palette, abbreviation, franchiseName, titles, rivalryCount, unlocks, logo, onSelect }: { palette: Palette; abbreviation: string; franchiseName: string; titles: number; rivalryCount: number; unlocks: number; logo: Texture | null; onSelect: (id: StadiumWorldExhibitId) => void }) {
  const standPoints = useMemo(() => STAND_PROFILE.slice(0, -2).map(([r, y]) => new Vector2(r, y)), []);
  const seatsRef = useRef<InstancedMesh>(null);
  const crowdRef = useRef<InstancedMesh>(null);

  const { seats, crowd, flashPositions } = useMemo(() => {
    const seatList: Array<{ x: number; y: number; z: number; yaw: number; accent: boolean }> = [];
    const crowdList: Array<{ x: number; y: number; z: number; yaw: number; tone: number; scale: number }> = [];
    let seed = 3;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const tiers = [[17, 1.2], [19, 2.6], [21, 4.2], [23, 6], [25, 8]] as const;
    tiers.forEach(([r, y], tier) => {
      const count = Math.round(r * 10);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * r * BOWL_X;
        const z = Math.sin(angle) * r;
        // leave the owner's suite clear
        if (x < -26 && Math.abs(z) < 5.2 && tier >= 1) continue;
        const section = Math.floor((angle / (Math.PI * 2)) * 20);
        const yaw = Math.atan2(-x, -z);
        seatList.push({ x, y: y + 0.22, z, yaw, accent: section % 5 === 0 });
        if (random() < 0.78) crowdList.push({ x: x * 0.995, y: y + 0.75, z: z * 0.995, yaw, tone: Math.floor(random() * 6), scale: 0.85 + random() * 0.3 });
      }
    });
    const flashes = new Float32Array(crowdList.length * 3);
    crowdList.forEach((person, index) => {
      flashes[index * 3] = person.x;
      flashes[index * 3 + 1] = person.y + 0.45;
      flashes[index * 3 + 2] = person.z;
    });
    return { seats: seatList, crowd: crowdList, flashPositions: flashes };
  }, []);

  useLayoutEffect(() => {
    const seatMesh = seatsRef.current;
    const crowdMesh = crowdRef.current;
    if (!seatMesh || !crowdMesh) return;
    const dummy = new Object3D();
    const accent = new Color(palette.primary).multiplyScalar(0.7);
    const base = new Color('#1a2340');
    seats.forEach((seat, index) => {
      dummy.position.set(seat.x, seat.y, seat.z);
      dummy.rotation.set(0, seat.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      seatMesh.setMatrixAt(index, dummy.matrix);
      seatMesh.setColorAt(index, seat.accent ? accent : base);
    });
    const tones = ['#e8e0cc', '#26314f', palette.primary, '#16402f', '#3a3f4c', '#a8a39a'].map((tone) => new Color(tone).multiplyScalar(0.5));
    crowd.forEach((person, index) => {
      dummy.position.set(person.x, person.y, person.z);
      dummy.rotation.set(0, person.yaw, 0);
      dummy.scale.setScalar(person.scale);
      dummy.updateMatrix();
      crowdMesh.setMatrixAt(index, dummy.matrix);
      crowdMesh.setColorAt(index, tones[person.tone]);
    });
    seatMesh.instanceMatrix.needsUpdate = true;
    crowdMesh.instanceMatrix.needsUpdate = true;
    if (seatMesh.instanceColor) seatMesh.instanceColor.needsUpdate = true;
    if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
  }, [seats, crowd, palette.primary]);

  const fins = useMemo(() => {
    const list: Array<{ x: number; z: number; yaw: number }> = [];
    for (let i = 0; i < 120; i++) {
      const angle = (i / 120) * Math.PI * 2;
      const x = Math.cos(angle) * (FACADE_R + 0.2) * BOWL_X;
      const z = Math.sin(angle) * (FACADE_R + 0.2);
      if (z > 20 && Math.abs(x) < 9) continue;
      list.push({ x, z, yaw: Math.atan2(x / BOWL_X, z) });
    }
    return list;
  }, []);

  const fieldTexture = useCanvasTexture(4096, 2048, (ctx, w, h) => {
    // turf with mowing stripes and grain
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = i % 2 ? '#0f5631' : '#126439';
      ctx.fillRect((i * w) / 20, 0, w / 20 + 1, h);
    }
    let seed = 5;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26000; i++) {
      ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(random() * w, random() * h, 3, 3);
    }
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.62);
    vignette.addColorStop(0, 'rgba(255,240,200,0.06)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // gold end zones lettered with the franchise name
    const endZone = w / 12;
    [0, w - endZone].forEach((x) => {
      const gradient = ctx.createLinearGradient(x, 0, x + endZone, h);
      gradient.addColorStop(0, '#a87f1c');
      gradient.addColorStop(0.5, '#e2bf55');
      gradient.addColorStop(1, '#b48a22');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, endZone, h);
    });
    ctx.fillStyle = NAVY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const endText = spaced(franchiseName);
    [[endZone / 2, -Math.PI / 2], [w - endZone / 2, Math.PI / 2]].forEach(([x, rotation]) => {
      ctx.save();
      ctx.translate(x, h / 2);
      ctx.rotate(rotation);
      fitText(ctx, endText, h * 0.86, 210, DISPLAY_FONT);
      ctx.fillText(endText, 0, 6);
      ctx.restore();
    });

    // lines, yard numbers, hash marks
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    const yard = (w - endZone * 2) / 10;
    for (let i = 0; i <= 10; i++) {
      const x = endZone + i * yard;
      ctx.lineWidth = i === 5 ? 12 : 8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      for (let k = 1; k < 5; k++) {
        const hx = x + (k * yard) / 5;
        if (i === 10) break;
        ctx.lineWidth = 4;
        [h * 0.06, h * 0.36, h * 0.6, h * 0.9].forEach((hy) => {
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx, hy + 26);
          ctx.stroke();
        });
      }
      if (i > 0 && i < 10) {
        const label = String((i <= 5 ? i : 10 - i) * 10);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `700 120px ${SERIF_FONT}`;
        ctx.fillText(label, x, h * 0.16);
        ctx.save();
        ctx.translate(x, h * 0.84);
        ctx.rotate(Math.PI);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }, [franchiseName]);

  const scoreboardTexture = useCanvasTexture(2048, 832, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1426');
    bg.addColorStop(1, '#03060d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(40, 40, w - 80, h - 80);
    ctx.globalAlpha = 1;
    if (logo?.image) ctx.drawImage(logo.image as CanvasImageSource, w / 2 - 80, 50, 160, 160);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.primary;
    ctx.font = `900 46px ${DISPLAY_FONT}`;
    ctx.fillText(spaced('Welcome home'), w / 2, 248);
    ctx.fillStyle = '#f6f0e2';
    fitText(ctx, franchiseName.toUpperCase(), w - 260, 150, SERIF_FONT, '700');
    ctx.fillText(franchiseName.toUpperCase(), w / 2, 348);
    const stats: Array<[string, number]> = [['TITLES', titles], ['RIVALRY WINS', rivalryCount], ['UNLOCKS', unlocks]];
    stats.forEach(([label, value], index) => {
      const x = (w / 3) * index + w / 6;
      if (index > 0) {
        ctx.fillStyle = 'rgba(217,180,59,0.45)';
        ctx.fillRect((w / 3) * index - 2, 470, 4, 260);
      }
      const gold = ctx.createLinearGradient(0, 470, 0, 650);
      gold.addColorStop(0, '#fff2c4');
      gold.addColorStop(1, palette.primary);
      ctx.fillStyle = gold;
      ctx.font = `700 200px ${SERIF_FONT}`;
      ctx.fillText(String(value), x, 580);
      ctx.fillStyle = '#c9c2b2';
      ctx.font = `900 42px ${DISPLAY_FONT}`;
      ctx.fillText(spaced(label), x, 728);
    });
  }, [franchiseName, titles, rivalryCount, unlocks, palette.primary, logo]);

  const towers: Vec3[] = [[-30, 0, -19], [30, 0, -19], [-30, 0, 19], [30, 0, 19]];

  return <group>
    {/* stands (interior) — midnight concrete */}
    <mesh scale={[BOWL_X, 1, 1]}>
      <latheGeometry args={[standPoints, 120]} />
      <meshStandardMaterial color="#121a2e" roughness={0.75} metalness={0.15} side={DoubleSide} />
    </mesh>
    {/* outer facade — ivory stone with champagne bands */}
    <mesh position={[0, 5.1, 0]} scale={[BOWL_X, 1, 1]}>
      <cylinderGeometry args={[FACADE_R, FACADE_R, 10.2, 160, 1, true]} />
      <meshStandardMaterial color={IVORY} roughness={0.5} metalness={0.08} side={DoubleSide} />
    </mesh>
    <mesh position={[0, 10.2, 0]} scale={[BOWL_X, 1, 1]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[26, FACADE_R, 160, 1]} />
      <meshStandardMaterial color="#1a2236" roughness={0.6} metalness={0.2} side={DoubleSide} />
    </mesh>
    {[2.2, 9.9].map((y) => <mesh key={y} position={[0, y, 0]} scale={[BOWL_X, 1, 1]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[FACADE_R + 0.12, 0.09, 6, 200]} />
      <meshStandardMaterial color={palette.primary} metalness={0.95} roughness={0.25} emissive={palette.primary} emissiveIntensity={0.35} />
    </mesh>)}
    {fins.map((fin, index) => <mesh key={index} position={[fin.x, 6.05, fin.z]} rotation={[0, fin.yaw, 0]}>
      <boxGeometry args={[0.22, 7.6, 0.22]} />
      <meshStandardMaterial color={palette.primary} metalness={0.9} roughness={0.3} emissive={palette.primary} emissiveIntensity={0.18} />
    </mesh>)}

    <instancedMesh ref={seatsRef} args={[undefined, undefined, seats.length]}>
      <boxGeometry args={[0.62, 0.4, 0.5]} />
      <meshStandardMaterial roughness={0.55} metalness={0.15} />
    </instancedMesh>
    <instancedMesh ref={crowdRef} args={[undefined, undefined, crowd.length]}>
      <capsuleGeometry args={[0.2, 0.42, 2, 6]} />
      <meshStandardMaterial roughness={0.8} metalness={0} />
    </instancedMesh>
    <CrowdLights positions={flashPositions} />

    <RibbonBoard radius={19.92} y={3.4} height={1.2} palette={palette} franchiseName={franchiseName} speed={0.012} />
    <RibbonBoard radius={23.92} y={7} height={1.5} palette={palette} franchiseName={franchiseName} speed={-0.008} />

    {/* roof halo */}
    <mesh position={[0, 12.8, 0]} scale={[BOWL_X, 1, 1]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[26.8, 0.75, 16, 160]} />
      <meshStandardMaterial color="#1b2338" metalness={0.8} roughness={0.3} />
    </mesh>
    <mesh position={[0, 12.05, 0]} scale={[BOWL_X, 1, 1]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[26.4, 0.16, 8, 200]} />
      <meshBasicMaterial color={palette.primary} toneMapped={false} />
    </mesh>
    {Array.from({ length: 28 }, (_, index) => {
      const angle = (index / 28) * Math.PI * 2;
      return <mesh key={index} position={[Math.cos(angle) * 27.6 * BOWL_X, 11.4, Math.sin(angle) * 27.6]}>
        <cylinderGeometry args={[0.14, 0.2, 2.6, 10]} />
        <meshStandardMaterial color="#2a3248" metalness={0.7} roughness={0.35} />
      </mesh>;
    })}

    {/* light towers with beams cutting through the haze */}
    {towers.map((tower, index) => {
      const yaw = Math.atan2(-tower[0], -tower[2]);
      return <group key={index}>
        <group position={tower}>
          <mesh position={[0, 12, 0]}>
            <cylinderGeometry args={[0.3, 0.55, 24, 12]} />
            <meshStandardMaterial color={IVORY} metalness={0.4} roughness={0.35} />
          </mesh>
          <group position={[0, 24.5, 0]} rotation={[0.45, yaw, 0]}>
            <mesh>
              <boxGeometry args={[5.6, 2.6, 0.5]} />
              <meshStandardMaterial color="#1a2030" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0, 0.27]}>
              <planeGeometry args={[5.1, 2.1]} />
              <meshBasicMaterial color="#fff4dc" toneMapped={false} />
            </mesh>
          </group>
        </group>
        <LightBeam from={[tower[0], 24.3, tower[2]]} to={[tower[0] * 0.25, 0, tower[2] * 0.25]} color="#fff1d2" />
      </group>;
    })}
    <spotLight position={[-30, 24.5, -19]} angle={0.6} penumbra={0.8} intensity={420} distance={90} decay={2} color="#fff3dc" />
    <spotLight position={[30, 24.5, 19]} angle={0.6} penumbra={0.8} intensity={420} distance={90} decay={2} color="#fff3dc" />

    {/* field with the real Big Exec crown logo at midfield */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[BOWL_X, 1, 1]}>
      <circleGeometry args={[16, 96]} />
      <meshStandardMaterial color="#0b3321" roughness={0.9} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <planeGeometry args={[40, 20]} />
      <meshStandardMaterial map={fieldTexture} roughness={0.82} metalness={0} />
    </mesh>
    {logo && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
      <planeGeometry args={[8.6, 8.6]} />
      <meshStandardMaterial map={logo} transparent alphaTest={0.08} roughness={0.75} metalness={0} polygonOffset polygonOffsetFactor={-2} />
    </mesh>}

    {/* floating scoreboard above the north stands */}
    <Clickable id="scoreboard" onSelect={onSelect}>
      <group position={[0, 17.4, -26.6]}>
        <mesh>
          <boxGeometry args={[18.4, 7.8, 0.9]} />
          <meshStandardMaterial color="#1b2338" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.46]}>
          <planeGeometry args={[17.6, 7.15]} />
          <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={scoreboardTexture} emissiveIntensity={0.8} roughness={0.5} />
        </mesh>
        <mesh position={[0, -3.95, 0.3]}>
          <boxGeometry args={[18.4, 0.1, 0.1]} />
          <meshBasicMaterial color={palette.primary} toneMapped={false} />
        </mesh>
      </group>
    </Clickable>
  </group>;
}

// ---------------------------------------------------------------------------
// Front gate: lit franchise name, crest, championship banners
// ---------------------------------------------------------------------------
function Crest({ palette, abbreviation, earned }: { palette: Palette; abbreviation: string; earned: boolean }) {
  const shape = useMemo(() => {
    const next = new Shape();
    next.moveTo(0, 1.6);
    next.lineTo(1.35, 1.15);
    next.lineTo(1.25, -0.2);
    next.quadraticCurveTo(0.9, -1.15, 0, -1.65);
    next.quadraticCurveTo(-0.9, -1.15, -1.25, -0.2);
    next.lineTo(-1.35, 1.15);
    next.closePath();
    return next;
  }, []);
  const face = useCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0c0e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, abbreviation, w * 0.72, 220, DISPLAY_FONT);
    ctx.fillText(abbreviation, w / 2, h / 2 + 10);
  }, [abbreviation]);
  return <group>
    <mesh position={[0, 0, -0.2]}>
      <extrudeGeometry args={[shape, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }]} />
      <meshStandardMaterial color={palette.dimPrimary} metalness={0.35} roughness={earned ? 0.5 : 0.65} envMapIntensity={0.35} />
    </mesh>
    <mesh position={[0, 0.05, 0.3]}>
      <planeGeometry args={[2.1, 2.1]} />
      <meshBasicMaterial map={face} transparent toneMapped={false} />
    </mesh>
    {/* crown points: original Big Exec crest motif */}
    {[-0.9, -0.45, 0, 0.45, 0.9].map((x, index) => <mesh key={index} position={[x, 2.0 + (index === 2 ? 0.2 : 0), 0]}>
      <coneGeometry args={[0.16, index === 2 ? 0.8 : 0.55, 4]} />
      <meshStandardMaterial color={palette.dimPrimary} metalness={0.4} roughness={0.5} envMapIntensity={0.35} />
    </mesh>)}
  </group>;
}

type BannerSpec = { kind: 'title' | 'founder' | 'ghost'; year: number | null };

function Banner({ spec, palette, abbreviation, x }: { spec: BannerSpec; palette: Palette; abbreviation: string; x: number }) {
  const { z, yaw } = facadePoint(x, 0.5);
  const texture = useCanvasTexture(512, 1280, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // swallow-tail banner silhouette
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(w / 2, h - 150);
    ctx.lineTo(0, h);
    ctx.closePath();
    if (spec.kind === 'ghost') {
      ctx.setLineDash([28, 22]);
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(220,210,190,0.55)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,210,190,0.75)';
      ctx.font = `900 54px ${DISPLAY_FONT}`;
      ['YOUR', 'FIRST', 'TITLE', 'HANGS', 'HERE'].forEach((word, index) => ctx.fillText(word, w / 2, 360 + index * 92));
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, spec.kind === 'title' ? palette.primary : '#1d2126');
    gradient.addColorStop(1, spec.kind === 'title' ? '#2a2108' : '#0c0e10');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 16;
    ctx.strokeStyle = spec.kind === 'title' ? palette.secondary : palette.primary;
    ctx.stroke();
    ctx.fillStyle = spec.kind === 'title' ? '#0a0b0c' : palette.primary;
    ctx.font = `900 46px ${DISPLAY_FONT}`;
    ctx.fillText(spaced('Big Exec'), w / 2, 120);
    if (spec.kind === 'title') {
      fitText(ctx, 'CHAMPIONS', w - 60, 84, DISPLAY_FONT);
      ctx.fillText('CHAMPIONS', w / 2, 230);
      ctx.font = `900 190px ${SERIF_FONT}`;
      ctx.fillText(titleYearLabel(spec.year).length > 4 ? '★' : titleYearLabel(spec.year), w / 2, 560);
    } else {
      ctx.font = `900 96px ${DISPLAY_FONT}`;
      ctx.fillText('EST.', w / 2, 330);
      ctx.font = `900 170px ${SERIF_FONT}`;
      ctx.fillText(spec.year ? String(spec.year) : '—', w / 2, 540);
    }
    ctx.font = `900 120px ${DISPLAY_FONT}`;
    fitText(ctx, abbreviation, w - 120, 120, DISPLAY_FONT);
    ctx.fillText(abbreviation, w / 2, 860);
  }, [spec.kind, spec.year, abbreviation, palette.primary, palette.secondary]);

  return <group position={[x, 7.6, z]} rotation={[0, yaw, 0]}>
    <mesh position={[0, 4.15, 0]}>
      <boxGeometry args={[2.9, 0.12, 0.12]} />
      <meshStandardMaterial color="#c9c3b6" metalness={0.9} roughness={0.25} />
    </mesh>
    <mesh>
      <planeGeometry args={[2.6, 6.5]} />
      {spec.kind === 'ghost'
        ? <meshBasicMaterial map={texture} transparent toneMapped={false} side={DoubleSide} />
        : <meshStandardMaterial map={texture} transparent roughness={0.65} metalness={0.05} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.22} side={DoubleSide} />}
    </mesh>
  </group>;
}

function FrontGate({ palette, franchiseName, abbreviation, establishedYear, titleYears, logo, onSelect }: { palette: Palette; franchiseName: string; abbreviation: string; establishedYear?: number | null; titleYears: Array<number | null>; logo: Texture | null; onSelect: (id: StadiumWorldExhibitId) => void }) {
  const signTexture = useCanvasTexture(2048, 256, (ctx, w, h) => {
    ctx.fillStyle = '#050607';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.secondary;
    const text = spaced(franchiseName);
    fitText(ctx, text, w - 140, 150, DISPLAY_FONT);
    ctx.fillText(text, w / 2, h / 2 + 6);
  }, [franchiseName, palette.secondary]);

  const tunnelTexture = useCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#010203';
    ctx.fillRect(0, 0, w, h);
    // receding tunnel rings
    for (let i = 0; i < 7; i++) {
      const inset = 30 + i * 30;
      ctx.strokeStyle = `rgba(217,180,59,${0.08 + i * 0.03})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(inset, inset * 1.05, w - inset * 2, h - inset * 1.05);
    }
    const glow = ctx.createRadialGradient(w / 2, h * 0.86, 10, w / 2, h * 0.86, w * 0.42);
    glow.addColorStop(0, 'rgba(140,220,150,0.85)');
    glow.addColorStop(0.35, 'rgba(60,140,80,0.45)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,210,130,0.9)';
    ctx.fillRect(w * 0.36, h * 0.84, w * 0.28, h * 0.16);
  }, []);

  const banners = useMemo<BannerSpec[]>(() => {
    const titles = [...titleYears].sort((a, b) => (a ?? 0) - (b ?? 0)).slice(-7).map((year) => ({ kind: 'title' as const, year }));
    return [{ kind: 'founder', year: establishedYear ?? null }, ...titles, ...(titles.length ? [] : [{ kind: 'ghost' as const, year: null }])];
  }, [titleYears, establishedYear]);
  const bannerX = (index: number) => (index % 2 === 0 ? -1 : 1) * (11 + Math.floor(index / 2) * 3.6);

  const gateZ = 28.6;
  return <group>
    <Clickable id="front-gate" onSelect={onSelect}>
      {/* pylons and lintel */}
      {[-6.6, 6.6].map((x) => <group key={x}>
        <mesh position={[x, 6.6, gateZ]}>
          <boxGeometry args={[2.2, 13.2, 2.4]} />
          <meshStandardMaterial color="#cdbf9f" metalness={0.1} roughness={0.5} />
        </mesh>
        <mesh position={[x + (x < 0 ? 1.12 : -1.12), 6.6, gateZ + 1.21]}>
          <boxGeometry args={[0.1, 13.2, 0.1]} />
          <meshBasicMaterial color={palette.primary} toneMapped={false} />
        </mesh>
      </group>)}
      <mesh position={[0, 12.4, gateZ]}>
        <boxGeometry args={[15.4, 2.6, 2.6]} />
        <meshStandardMaterial color="#cdbf9f" metalness={0.1} roughness={0.5} />
      </mesh>
      <mesh position={[0, 12.4, gateZ + 1.31]}>
        <planeGeometry args={[13.6, 1.7]} />
        <meshBasicMaterial map={signTexture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 11.0, gateZ + 1.32]}>
        <boxGeometry args={[13.6, 0.08, 0.06]} />
        <meshBasicMaterial color={palette.primary} toneMapped={false} />
      </mesh>
      {logo
        ? <mesh position={[0, 16.1, gateZ + 0.6]}>
          <planeGeometry args={[5.2, 5.2]} />
          <meshStandardMaterial map={logo} transparent alphaTest={0.08} roughness={0.45} metalness={0.1} emissive="#ffffff" emissiveMap={logo} emissiveIntensity={0} side={DoubleSide} />
        </mesh>
        : <group position={[0, 15.4, gateZ + 0.4]}>
          <Crest palette={palette} abbreviation={abbreviation} earned={titleYears.length > 0} />
        </group>}
      {/* tunnel mouth: dark passage with the lit field glowing at the far end */}
      <mesh position={[0, 5.4, gateZ - 0.6]}>
        <planeGeometry args={[11, 10.8]} />
        <meshBasicMaterial map={tunnelTexture} toneMapped={false} />
      </mesh>
      {[-5.4, 5.4].map((x) => <mesh key={x} position={[x, 5.4, gateZ - 0.4]}>
        <boxGeometry args={[0.12, 10.8, 0.12]} />
        <meshBasicMaterial color={palette.dimPrimary} toneMapped={false} />
      </mesh>)}
    </Clickable>

    {/* lit walkway from the plaza into the gate */}
    {[-2.4, 2.4].map((x) => <mesh key={x} position={[x, 0.04, 47]}>
      <boxGeometry args={[0.14, 0.04, 36]} />
      <meshBasicMaterial color={palette.secondary} toneMapped={false} />
    </mesh>)}

    <Clickable id="title-banners" onSelect={onSelect}>
      {banners.map((spec, index) => <Banner key={`${spec.kind}-${index}`} spec={spec} palette={palette} abbreviation={abbreviation} x={bannerX(index)} />)}
    </Clickable>
  </group>;
}

// ---------------------------------------------------------------------------
// Owner's suite and the original Big Exec Champions Trophy
// ---------------------------------------------------------------------------
function ChampionsTrophy({ earned, palette }: { earned: boolean; palette: Palette }) {
  const ref = useRef<Group>(null);
  const crystalRef = useRef<Group>(null);
  useFrame((state, delta) => {
    if (ref.current && earned) ref.current.rotation.y += delta * 0.25;
    if (crystalRef.current && earned) crystalRef.current.position.y = 1.62 + Math.sin(state.clock.elapsedTime * 1.4) * 0.04;
  });
  const metal = earned ? palette.primary : '#3a3c3e';
  const plinth = useMemo(() => [
    new Vector2(0, 0), new Vector2(0.62, 0), new Vector2(0.62, 0.12), new Vector2(0.5, 0.16), new Vector2(0.5, 0.3), new Vector2(0.42, 0.34), new Vector2(0, 0.34)
  ], []);

  return <group ref={ref}>
    <mesh>
      <latheGeometry args={[plinth, 8]} />
      <meshStandardMaterial color="#0b0c0e" metalness={0.9} roughness={0.15} />
    </mesh>
    <mesh position={[0, 0.2, 0]}>
      <cylinderGeometry args={[0.51, 0.51, 0.05, 8]} />
      <meshStandardMaterial color={metal} metalness={1} roughness={0.16} />
    </mesh>
    {/* faceted obsidian column */}
    <mesh position={[0, 0.78, 0]}>
      <cylinderGeometry args={[0.16, 0.3, 0.92, 6]} />
      <meshStandardMaterial color="#121418" metalness={0.92} roughness={0.12} />
    </mesh>
    {[0, 1, 2].map((index) => <mesh key={index} position={[0, 0.78, 0]} rotation={[0, (index / 3) * Math.PI, 0]}>
      <boxGeometry args={[0.04, 0.92, 0.5]} />
      <meshStandardMaterial color={metal} metalness={1} roughness={0.2} />
    </mesh>)}
    {/* crown ring with five points */}
    <mesh position={[0, 1.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.34, 0.06, 12, 40]} />
      <meshStandardMaterial color={metal} metalness={1} roughness={0.14} />
    </mesh>
    {Array.from({ length: 5 }, (_, index) => {
      const angle = (index / 5) * Math.PI * 2;
      return <mesh key={index} position={[Math.cos(angle) * 0.34, 1.46, Math.sin(angle) * 0.34]} rotation={[Math.sin(angle) * 0.25, 0, -Math.cos(angle) * 0.25]}>
        <coneGeometry args={[0.07, 0.36, 4]} />
        <meshStandardMaterial color={metal} metalness={1} roughness={0.14} />
      </mesh>;
    })}
    <group ref={crystalRef} position={[0, 1.62, 0]}>
      <mesh>
        <octahedronGeometry args={[0.2, 0]} />
        {earned
          ? <meshBasicMaterial color={palette.secondary} toneMapped={false} />
          : <meshStandardMaterial color="#26292c" metalness={0.6} roughness={0.4} />}
      </mesh>
    </group>
  </group>;
}

function OwnersSuite({ palette, titleYears, franchiseName, onSelect }: { palette: Palette; titleYears: Array<number | null>; franchiseName: string; onSelect: (id: StadiumWorldExhibitId) => void }) {
  const earned = titleYears.length > 0;
  const plates = earned ? [...titleYears].sort((a, b) => (a ?? 0) - (b ?? 0)).slice(-6) : [null];
  const nameTexture = useCanvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.primary;
    ctx.font = `900 40px ${DISPLAY_FONT}`;
    ctx.fillText(spaced('Owner’s Suite'), w / 2, 70);
    ctx.fillStyle = '#f2ede2';
    fitText(ctx, franchiseName, w - 80, 92, SERIF_FONT, '700');
    ctx.fillText(franchiseName, w / 2, 165);
  }, [franchiseName, palette.primary]);

  return <group>
    {/* structure */}
    <mesh position={[-29, 6.35, 0]}>
      <boxGeometry args={[5.4, 0.3, 9.4]} />
      <meshStandardMaterial color="#0d0e10" roughness={0.22} metalness={0.6} />
    </mesh>
    <mesh position={[-31.7, 8.45, 0]}>
      <boxGeometry args={[0.3, 4, 9.4]} />
      <meshStandardMaterial color="#2a1c12" roughness={0.55} metalness={0.15} />
    </mesh>
    {Array.from({ length: 9 }, (_, index) => <mesh key={index} position={[-31.53, 8.45, -4.2 + index * 1.05]}>
      <boxGeometry args={[0.02, 4, 0.03]} />
      <meshStandardMaterial color="#120c08" roughness={0.6} />
    </mesh>)}
    <mesh position={[-29, 10.55, 0]}>
      <boxGeometry args={[5.8, 0.3, 9.8]} />
      <meshStandardMaterial color="#121417" roughness={0.4} metalness={0.7} />
    </mesh>
    {[-4.7, 4.7].map((z) => <mesh key={z} position={[-29, 8.45, z]}>
      <boxGeometry args={[5.4, 4, 0.3]} />
      <meshStandardMaterial color="#14161a" roughness={0.45} metalness={0.4} />
    </mesh>)}
    <mesh position={[-26.25, 10.38, 0]}>
      <boxGeometry args={[0.08, 0.08, 9.6]} />
      <meshBasicMaterial color={palette.primary} toneMapped={false} />
    </mesh>
    <mesh position={[-26.25, 6.55, 0]}>
      <boxGeometry args={[0.08, 0.08, 9.6]} />
      <meshBasicMaterial color={palette.primary} toneMapped={false} />
    </mesh>
    {/* glass front facing the field */}
    <mesh position={[-26.3, 8.45, 0]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[9.4, 4]} />
      <meshPhysicalMaterial color="#9fc7d8" transparent opacity={0.1} roughness={0.04} metalness={0.2} side={DoubleSide} depthWrite={false} />
    </mesh>
    {[-2.35, 0, 2.35].map((z) => <mesh key={z} position={[-26.3, 8.45, z]}>
      <boxGeometry args={[0.08, 4, 0.06]} />
      <meshStandardMaterial color="#202326" metalness={0.9} roughness={0.25} />
    </mesh>)}

    {/* interior */}
    <mesh position={[-28.6, 6.52, -1.2]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.95, 1.05, 48]} />
      <meshBasicMaterial color={earned ? palette.primary : '#4a4c4e'} toneMapped={false} />
    </mesh>
    <mesh position={[-28.6, 6.95, -1.2]}>
      <cylinderGeometry args={[0.62, 0.7, 0.9, 8]} />
      <meshStandardMaterial color="#0d0f11" metalness={0.85} roughness={0.2} />
    </mesh>
    <Clickable id="champions-trophy" onSelect={onSelect}>
      <group position={[-28.6, 7.4, -1.2]} scale={0.95}>
        <ChampionsTrophy earned={earned} palette={palette} />
      </group>
      <mesh position={[-28.6, 8.35, -1.2]}>
        <boxGeometry args={[1.5, 1.9, 1.5]} />
        <meshPhysicalMaterial color="#d8eef5" transparent opacity={earned ? 0.07 : 0.16} roughness={0.03} metalness={0.1} depthWrite={false} />
      </mesh>
    </Clickable>
    {/* desk */}
    <mesh position={[-30.3, 7.15, 2.6]}>
      <boxGeometry args={[1.3, 0.12, 2.8]} />
      <meshStandardMaterial color="#0f1012" metalness={0.6} roughness={0.25} />
    </mesh>
    <mesh position={[-29.66, 7.15, 2.6]}>
      <boxGeometry args={[0.04, 0.13, 2.8]} />
      <meshStandardMaterial color={palette.primary} metalness={1} roughness={0.2} />
    </mesh>
    {[-0.9, 0.9].map((dz) => <mesh key={dz} position={[-30.3, 6.82, 2.6 + dz * 1.4]}>
      <boxGeometry args={[1.1, 0.6, 0.1]} />
      <meshStandardMaterial color="#121417" metalness={0.6} roughness={0.3} />
    </mesh>)}
    {/* name panel and title plates on the back wall */}
    <mesh position={[-31.53, 9.25, 2.6]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[3, 0.75]} />
      <meshBasicMaterial map={nameTexture} toneMapped={false} />
    </mesh>
    {plates.map((year, index) => <TitlePlate key={index} year={year} earned={earned} palette={palette} z={-3.6 + index * 0.95} />)}

    <pointLight position={[-28.6, 10, -1.2]} color={earned ? '#ffe7b0' : '#b9c2cc'} intensity={earned ? 26 : 8} distance={7} decay={2} />
    <pointLight position={[-29, 9.6, 3]} color="#ffd9a0" intensity={6} distance={6} decay={2} />
  </group>;
}

function TitlePlate({ year, earned, palette, z }: { year: number | null; earned: boolean; palette: Palette; z: number }) {
  const texture = useCanvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = earned ? '#14110a' : '#111315';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = earned ? palette.primary : '#5b5f63';
    ctx.lineWidth = 8;
    if (!earned) ctx.setLineDash([12, 10]);
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = earned ? palette.primary : '#8b8f93';
    ctx.font = `900 22px ${DISPLAY_FONT}`;
    ctx.fillText(earned ? 'CHAMPIONS' : 'AWAITING', w / 2, 46);
    ctx.font = `900 ${earned ? 58 : 30}px ${earned ? SERIF_FONT : DISPLAY_FONT}`;
    ctx.fillText(earned ? (year ? String(year) : '★') : 'FIRST TITLE', w / 2, 104);
  }, [year, earned, palette.primary]);
  return <mesh position={[-31.53, 9.4, z]} rotation={[0, Math.PI / 2, 0]}>
    <planeGeometry args={[0.85, 0.53]} />
    <meshBasicMaterial map={texture} toneMapped={false} />
  </mesh>;
}

// ---------------------------------------------------------------------------
// Plaza: Rivalry Walk pillars and the Legacy Wall
// ---------------------------------------------------------------------------
function RivalryPillar({ index, lit, palette, z }: { index: number; lit: boolean; palette: Palette; z: number }) {
  const texture = useCanvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = lit ? '#0f0d08' : '#0d0f11';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = lit ? palette.primary : '#4c5054';
    ctx.font = `900 30px ${DISPLAY_FONT}`;
    ctx.fillText('RIVALRY', w / 2, 120);
    ctx.fillText('WIN', w / 2, 160);
    ctx.font = `900 150px ${SERIF_FONT}`;
    ctx.fillText(lit ? String(index + 1) : '—', w / 2, 320);
  }, [index, lit, palette.primary]);
  return <group position={[7, 0, z]}>
    <mesh position={[0, 0.25, 0]}>
      <boxGeometry args={[1.5, 0.5, 1.5]} />
      <meshStandardMaterial color="#141619" metalness={0.75} roughness={0.3} />
    </mesh>
    <mesh position={[0, 2.6, 0]}>
      <cylinderGeometry args={[0.38, 0.55, 4.4, 4]} />
      <meshStandardMaterial color={lit ? '#1c1a15' : '#141619'} metalness={0.85} roughness={0.22} />
    </mesh>
    <mesh position={[-0.47, 2.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[0.62, 1.24]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
    <mesh position={[0, 5.05, 0]}>
      <octahedronGeometry args={[0.32, 0]} />
      {lit
        ? <meshBasicMaterial color={palette.primary} toneMapped={false} />
        : <meshStandardMaterial color="#2a2d30" metalness={0.7} roughness={0.35} />}
    </mesh>
    {lit && <pointLight position={[-0.8, 3, 0]} color={palette.primary} intensity={5} distance={4} decay={2} />}
  </group>;
}

function LegacyPlaque({ label, kind, palette, z }: { label: string; kind: 'unlocked' | 'next' | 'empty'; palette: Palette; z: number }) {
  const texture = useCanvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = kind === 'unlocked' ? '#15120b' : '#0e1012';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = kind === 'unlocked' ? palette.primary : '#6a6e72';
    ctx.lineWidth = 10;
    if (kind !== 'unlocked') ctx.setLineDash([20, 14]);
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = kind === 'unlocked' ? palette.primary : '#9a9ea2';
    ctx.font = `900 30px ${DISPLAY_FONT}`;
    ctx.fillText(kind === 'unlocked' ? 'UNLOCKED' : kind === 'next' ? 'NEXT UNLOCK' : 'LEGACY WALL', w / 2, 70);
    ctx.fillStyle = kind === 'unlocked' ? '#f4efe4' : '#b5b9bd';
    const words = label.split(' ');
    const lines: string[] = [];
    words.forEach((word) => {
      const last = lines[lines.length - 1];
      if (last && (last + ' ' + word).length <= 16) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    });
    lines.slice(0, 3).forEach((line, index, all) => {
      fitText(ctx, line, w - 60, 56, SERIF_FONT, '700');
      ctx.fillText(line, w / 2, 180 + (index - (all.length - 1) / 2) * 62);
    });
  }, [label, kind, palette.primary]);
  return <mesh position={[-8.83, 2.4, z]} rotation={[0, Math.PI / 2, 0]}>
    <planeGeometry args={[2.4, 1.5]} />
    <meshBasicMaterial map={texture} toneMapped={false} />
  </mesh>;
}

function Plaza({ palette, rivalryCount, unlockedFeatures, nextUnlock, onSelect }: { palette: Palette; rivalryCount: number; unlockedFeatures: StadiumWorldFeature[]; nextUnlock?: string | null; onSelect: (id: StadiumWorldExhibitId) => void }) {
  const pillars = Math.min(10, Math.max(rivalryCount + 2, 5));
  const plaques = useMemo(() => {
    const list: Array<{ label: string; kind: 'unlocked' | 'next' | 'empty' }> = unlockedFeatures.slice(0, 7).map((feature) => ({ label: feature.name, kind: 'unlocked' }));
    if (nextUnlock) list.push({ label: nextUnlock, kind: 'next' });
    if (!list.length) list.push({ label: 'Plaques appear as you earn them', kind: 'empty' });
    return list;
  }, [unlockedFeatures, nextUnlock]);
  const wallLength = Math.max(14, plaques.length * 2.9 + 2);

  return <group>
    <Clickable id="rivalry-walk" onSelect={onSelect}>
      {Array.from({ length: pillars }, (_, index) => <RivalryPillar key={index} index={index} lit={index < rivalryCount} palette={palette} z={38.5 + index * 2.7} />)}
    </Clickable>
    <Clickable id="legacy-wall" onSelect={onSelect}>
      <mesh position={[-9.4, 2.1, 37.5 + wallLength / 2]}>
        <boxGeometry args={[1, 4.2, wallLength]} />
        <meshStandardMaterial color="#16181b" metalness={0.7} roughness={0.32} />
      </mesh>
      <mesh position={[-8.88, 4.15, 37.5 + wallLength / 2]}>
        <boxGeometry args={[0.06, 0.08, wallLength]} />
        <meshBasicMaterial color={palette.primary} toneMapped={false} />
      </mesh>
      {plaques.map((plaque, index) => <LegacyPlaque key={`${plaque.label}-${index}`} label={plaque.label} kind={plaque.kind} palette={palette} z={39.1 + index * 2.9} />)}
    </Clickable>
    {/* plaza bollard lights */}
    {[36, 42, 48, 54, 60].map((z) => [-3.6, 3.6].map((x) => <mesh key={`${x}-${z}`} position={[x, 0.45, z]}>
      <cylinderGeometry args={[0.09, 0.11, 0.7, 8]} />
      <meshBasicMaterial color="#b9ad92" toneMapped={false} />
    </mesh>))}
    <pointLight position={[0, 7, 50]} color="#fff0d0" intensity={32} distance={30} decay={2} />
    <pointLight position={[0, 4, 37]} color={palette.primary} intensity={18} distance={20} decay={2} />
  </group>;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}

function WorldScene(props: StadiumWorldPrototypeProps & { zone: StadiumWorldZone; selected: StadiumWorldExhibitId | null; look: MutableRefObject<LookState>; arriving: MutableRefObject<boolean>; reducedMotion: boolean; onSelect: (id: StadiumWorldExhibitId) => void; palette: Palette }) {
  const { palette, onSelect } = props;
  const logo = useLogoTexture();
  return <>
    <fog attach="fog" args={['#0a1222', 80, 300]} />
    <SceneEnvironment />
    <NightSky />
    <hemisphereLight args={['#6d82a8', '#05070d', 0.5]} />
    <directionalLight position={[10, 40, 18]} intensity={1.25} color="#ffeccc" />
    <directionalLight position={[-20, 25, 60]} intensity={0.5} color="#b9c8e6" />
    <pointLight position={[0, 20, 0]} color="#fff4de" intensity={140} distance={60} decay={2} />

    <Ground />
    <Bowl
      palette={palette}
      abbreviation={props.abbreviation}
      franchiseName={props.franchiseName}
      titles={props.titleYears.length}
      rivalryCount={props.rivalryCount}
      unlocks={props.unlockedFeatures.length}
      logo={logo}
      onSelect={onSelect}
    />
    <FrontGate palette={palette} franchiseName={props.franchiseName} abbreviation={props.abbreviation} establishedYear={props.establishedYear} titleYears={props.titleYears} logo={logo} onSelect={onSelect} />
    <OwnersSuite palette={palette} titleYears={props.titleYears} franchiseName={props.franchiseName} onSelect={onSelect} />
    <Plaza palette={palette} rivalryCount={props.rivalryCount} unlockedFeatures={props.unlockedFeatures} nextUnlock={props.nextUnlock} onSelect={onSelect} />

    {(Object.keys(BEACONS) as StadiumWorldExhibitId[]).filter((id) => id !== props.selected).map((id) => <Beacon key={id} id={id} position={BEACONS[id]} color={palette.primary} active={props.selected === id} onSelect={onSelect} />)}

    <CameraRig zone={props.zone} look={props.look} arriving={props.arriving} reducedMotion={props.reducedMotion} />
    <Bloom />
  </>;
}

// ---------------------------------------------------------------------------
// Shell: full-bleed canvas with HUD, destinations and inspection card
// ---------------------------------------------------------------------------
export function StadiumWorldPrototype(props: StadiumWorldPrototypeProps) {
  const reducedMotion = useReducedMotion();
  const [zone, setZoneState] = useState<StadiumWorldZone>('gate');
  const [selectedId, setSelectedId] = useState<StadiumWorldExhibitId | null>(null);
  const [welcome, setWelcome] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const look = useRef<LookState>({ yaw: 0, pitch: 0 });
  const arriving = useRef(true);
  const drag = useRef<{ x: number; y: number; pointerType: string } | null>(null);

  const exhibits = useMemo(() => buildStadiumExhibits({
    franchiseName: props.franchiseName,
    establishedYear: props.establishedYear,
    titleYears: props.titleYears,
    rivalryCount: props.rivalryCount,
    unlockedFeatures: props.unlockedFeatures,
    nextUnlock: props.nextUnlock
  }), [props.franchiseName, props.establishedYear, props.titleYears, props.rivalryCount, props.unlockedFeatures, props.nextUnlock]);
  const selected = exhibits.find((item) => item.id === selectedId) ?? null;

  const palette = useMemo<Palette>(() => {
    const primary = new Color(props.primary);
    return { primary: primary.getStyle(), secondary: new Color(props.secondary).getStyle(), dimPrimary: primary.clone().multiplyScalar(0.55).getStyle() };
  }, [props.primary, props.secondary]);

  // Each destination is shareable: ?zone=owners-suite
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('zone');
    if (raw) {
      const initial = parseStadiumWorldZone(raw);
      setZoneState(initial);
      if (initial !== 'gate') {
        arriving.current = false;
        setWelcome(false);
        setSelectedId(STADIUM_WORLD_ZONES.find((item) => item.id === initial)?.exhibit ?? null);
      }
    }
    const timer = window.setTimeout(() => setWelcome(false), 5200);
    return () => window.clearTimeout(timer);
  }, []);

  const goTo = (next: StadiumWorldZone, exhibit?: StadiumWorldExhibitId) => {
    arriving.current = false;
    look.current = { yaw: 0, pitch: 0 };
    setWelcome(false);
    setZoneState(next);
    setSelectedId(exhibit ?? STADIUM_WORLD_ZONES.find((item) => item.id === next)?.exhibit ?? null);
    const url = new URL(window.location.href);
    if (next === 'gate') url.searchParams.delete('zone');
    else url.searchParams.set('zone', next);
    window.history.replaceState(window.history.state, '', url);
  };

  useEffect(() => setExpanded(false), [selectedId]);

  const select = (id: StadiumWorldExhibitId) => {
    const exhibit = exhibits.find((item) => item.id === id);
    if (exhibit) goTo(exhibit.zone, id);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, aside, nav')) return;
    drag.current = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    look.current.yaw = Math.max(-1.1, Math.min(1.1, look.current.yaw + dx * 0.004));
    if (drag.current.pointerType === 'mouse') look.current.pitch = Math.max(-0.35, Math.min(0.35, look.current.pitch - dy * 0.003));
  };
  const endDrag = () => { drag.current = null; };

  const zoneLabel = STADIUM_WORLD_ZONES.find((item) => item.id === zone)?.label;

  return <section className="stadiumWorld" aria-label={`${props.franchiseName} Stadium, explorable 3D view`}>
    <div
      className="stadiumWorldStage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') look.current.yaw = Math.max(-1.1, look.current.yaw - 0.12);
        if (event.key === 'ArrowRight') look.current.yaw = Math.min(1.1, look.current.yaw + 0.12);
      }}
      tabIndex={0}
      aria-label="Stadium view. Use left and right arrow keys to look around, or the destination buttons to travel."
    >
      <div className="stadiumWorldCanvasShell">
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: Boolean(props.qaCapture), powerPreference: 'high-performance' }}
          camera={{ position: ARRIVAL_START, fov: 52, near: 0.1, far: 900 }}
          onCreated={({ gl, camera, scene }) => {
            gl.domElement.dataset.renderState = 'ready';
            if (props.qaCapture) Object.assign(window, { __stadiumCamera: camera, __stadiumScene: scene });
            gl.domElement.classList.add('stadiumWorldCanvasElement');
            gl.domElement.setAttribute('role', 'img');
            gl.domElement.setAttribute('aria-label', `3D view of the ${props.franchiseName} stadium.`);
          }}
        >
          <WorldScene
            {...props}
            zone={zone}
            selected={selectedId}
            look={look}
            arriving={arriving}
            reducedMotion={reducedMotion}
            onSelect={select}
            palette={palette}
          />
        </Canvas>
      </div>

      <div className="stadiumWorldTopBar">
        <div className="stadiumWorldPlace">
          <span>{props.abbreviation} STADIUM · NOW AT</span>
          <strong>{zoneLabel}</strong>
        </div>
        {props.onStandardView && <button type="button" className="stadiumWorldGhostButton" onClick={props.onStandardView}>Standard view</button>}
      </div>

      {welcome && <div className="stadiumWorldWelcome" aria-hidden="true">
        <span>WELCOME TO</span>
        <strong>{props.franchiseName}</strong>
        <span>STADIUM</span>
      </div>}

      {!selected && !welcome && <p className="stadiumWorldHint">Drag to look around · Tap a glowing marker</p>}

      {selected && <aside className={`stadiumWorldCard${expanded ? ' expanded' : ''}`} aria-live="polite" aria-labelledby="stadium-world-card-title">
        <div className="stadiumWorldCardHead">
          <span className={`stadiumWorldStatus ${selected.status}`}>{selected.status === 'earned' ? 'Earned' : selected.status === 'locked' ? 'Locked · waiting' : STADIUM_WORLD_ZONES.find((item) => item.id === selected.zone)?.label}</span>
          <button type="button" className="stadiumWorldClose" aria-label="Close details" onClick={() => setSelectedId(null)}>×</button>
        </div>
        <h3 id="stadium-world-card-title">{selected.label}</h3>
        <button type="button" className="stadiumWorldMore" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide details' : 'Details'}</button>
        <p>{selected.detail}</p>
        {selected.facts.length > 0 && <dl>
          {selected.facts.map((fact, index) => <div key={`${fact.label}-${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
        </dl>}
      </aside>}

      <nav className="stadiumWorldTravel" aria-label="Travel inside the stadium">
        {STADIUM_WORLD_ZONES.map((item) => <button key={item.id} type="button" aria-pressed={zone === item.id} onClick={() => goTo(item.id)}>{item.label}</button>)}
      </nav>
    </div>

    <div className="srOnly">
      <h3>Everything in this stadium</h3>
      <ul>
        {exhibits.map((item) => <li key={item.id}>
          <button type="button" onClick={() => select(item.id)}>{item.label}: {item.status === 'earned' ? 'earned' : item.status === 'locked' ? 'locked' : 'information'}</button>
        </li>)}
      </ul>
    </div>
  </section>;
}
