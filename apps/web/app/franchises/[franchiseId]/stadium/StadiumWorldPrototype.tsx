'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Object3D,
  PMREMGenerator,
  SRGBColorSpace,
  Shape,
  Vector2,
  Vector3
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
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
const BOWL_X = 1.55;
const FACADE_R = 28;
const STAND_PROFILE: Array<[number, number]> = [
  [16, 0], [16, 1.2], [18, 1.2], [18, 2.6], [20, 2.6], [20, 4.2], [22, 4.2], [22, 6], [24, 6], [24, 8], [26, 8], [26, 10.2], [FACADE_R, 10.2], [FACADE_R, 0]
];

const DESTINATIONS: Record<StadiumWorldZone, { position: Vec3; target: Vec3; mobilePullback: boolean }> = {
  gate: { position: [0, 6.2, 68], target: [0, 8, 27], mobilePullback: true },
  field: { position: [0, 16.5, 21], target: [0, 7, -7], mobilePullback: false },
  'owners-suite': { position: [-30.9, 8.15, 3.7], target: [-28.5, 7.6, -1.3], mobilePullback: false },
  'rivalry-walk': { position: [-1.5, 3.6, 63], target: [6.5, 3, 49], mobilePullback: true },
  'legacy-wall': { position: [1.5, 3.4, 61], target: [-8.5, 2.4, 48], mobilePullback: true }
};
const ARRIVAL_START: Vec3 = [0, 48, 140];

const BEACONS: Record<StadiumWorldExhibitId, Vec3> = {
  'front-gate': [6.6, 15.2, 30.2],
  'title-banners': [-12.5, 13.6, 27.6],
  scoreboard: [0, 21.6, -26],
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

function Bloom() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const next = new EffectComposer(gl);
    next.addPass(new RenderPass(scene, camera));
    next.addPass(new UnrealBloomPass(new Vector2(size.width, size.height), 0.5, 0.45, 0.92));
    next.addPass(new OutputPass());
    return next;
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => {
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
function NightSky() {
  const geometry = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(0.15 + random() * 0.85);
      positions[i * 3] = 380 * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = 380 * Math.cos(phi);
      positions[i * 3 + 2] = 380 * Math.sin(phi) * Math.sin(theta);
    }
    const next = new BufferGeometry();
    next.setAttribute('position', new BufferAttribute(positions, 3));
    return next;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <>
    <mesh>
      <sphereGeometry args={[420, 32, 16]} />
      <meshBasicMaterial side={BackSide} color="#040910" fog={false} />
    </mesh>
    <points geometry={geometry}>
      <pointsMaterial color="#cfd8e6" size={1.6} sizeAttenuation={false} fog={false} transparent opacity={0.85} />
    </points>
  </>;
}

function Ground() {
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <planeGeometry args={[500, 500]} />
      <meshStandardMaterial color="#07090b" roughness={0.55} metalness={0.4} />
    </mesh>
    {/* plaza paving in front of the gate */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 51]}>
      <planeGeometry args={[30, 44]} />
      <meshStandardMaterial color="#121518" roughness={0.5} metalness={0.45} />
    </mesh>
  </>;
}

// ---------------------------------------------------------------------------
// The bowl: stands, seats, roof ring, light towers, field, scoreboard
// ---------------------------------------------------------------------------
function Bowl({ palette, abbreviation, franchiseName, titles, rivalryCount, unlocks, onSelect }: { palette: Palette; abbreviation: string; franchiseName: string; titles: number; rivalryCount: number; unlocks: number; onSelect: (id: StadiumWorldExhibitId) => void }) {
  const standPoints = useMemo(() => STAND_PROFILE.map(([r, y]) => new Vector2(r, y)), []);
  const seatsRef = useRef<InstancedMesh>(null);

  const seats = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number; yaw: number; accent: boolean }> = [];
    const tiers = [[17, 1.2], [19, 2.6], [21, 4.2], [23, 6], [25, 8]] as const;
    tiers.forEach(([r, y], tier) => {
      const count = Math.round(r * 7.2);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * r * BOWL_X;
        const z = Math.sin(angle) * r;
        // leave the owner's suite and gate tunnel clear
        if (x < -26 && Math.abs(z) < 5.2 && tier >= 1) continue;
        const section = Math.floor((angle / (Math.PI * 2)) * 16);
        list.push({ x, y: y + 0.25, z, yaw: Math.atan2(-x, -z), accent: section % 4 === 0 || tier === 2 });
      }
    });
    return list;
  }, []);

  useLayoutEffect(() => {
    const mesh = seatsRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const accent = new Color(palette.primary).multiplyScalar(0.55);
    const base = new Color('#1b1f23');
    seats.forEach((seat, index) => {
      dummy.position.set(seat.x, seat.y, seat.z);
      dummy.rotation.set(0, seat.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, seat.accent ? accent : base);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [seats, palette.primary]);

  const fins = useMemo(() => {
    const list: Array<{ x: number; z: number; yaw: number }> = [];
    for (let i = 0; i < 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      const x = Math.cos(angle) * (FACADE_R + 0.25) * BOWL_X;
      const z = Math.sin(angle) * (FACADE_R + 0.25);
      if (z > 20 && Math.abs(x) < 9) continue;
      list.push({ x, z, yaw: Math.atan2(x / BOWL_X, z) });
    }
    return list;
  }, []);

  const fieldTexture = useCanvasTexture(2048, 1024, (ctx, w, h) => {
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 ? '#0f4a2a' : '#125633';
      ctx.fillRect((i * w) / 24, 0, w / 24 + 1, h);
    }
    const endZone = w / 12;
    ctx.fillStyle = palette.primary;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 0, endZone, h);
    ctx.fillRect(w - endZone, 0, endZone, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    for (let i = 1; i < 12; i++) {
      ctx.lineWidth = i === 6 ? 8 : 4;
      ctx.beginPath();
      ctx.moveTo((i * w) / 12, 0);
      ctx.lineTo((i * w) / 12, h);
      ctx.stroke();
    }
    ctx.fillStyle = '#0b0d0f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [[endZone / 2, -Math.PI / 2], [w - endZone / 2, Math.PI / 2]].forEach(([x, rotation]) => {
      ctx.save();
      ctx.translate(x, h / 2);
      ctx.rotate(rotation);
      fitText(ctx, spaced(abbreviation), h * 0.8, 150, DISPLAY_FONT);
      ctx.fillText(spaced(abbreviation), 0, 0);
      ctx.restore();
    });
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 150, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,12,10,0.55)';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = palette.primary;
    ctx.stroke();
    ctx.fillStyle = palette.secondary;
    ctx.font = `900 120px ${DISPLAY_FONT}`;
    ctx.fillText('BE', w / 2, h / 2 + 6);
  }, [abbreviation, palette.primary, palette.secondary]);

  const scoreboardTexture = useCanvasTexture(2048, 768, (ctx, w, h) => {
    ctx.fillStyle = '#020405';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.primary;
    ctx.font = `900 54px ${DISPLAY_FONT}`;
    ctx.fillText(spaced('Welcome home'), w / 2, 92);
    ctx.fillStyle = '#ffffff';
    fitText(ctx, franchiseName.toUpperCase(), w - 200, 150, DISPLAY_FONT);
    ctx.fillText(franchiseName.toUpperCase(), w / 2, 238);
    const stats: Array<[string, number]> = [['TITLES', titles], ['RIVALRY WINS', rivalryCount], ['UNLOCKS', unlocks]];
    stats.forEach(([label, value], index) => {
      const x = (w / 3) * index + w / 6;
      ctx.fillStyle = palette.secondary;
      ctx.font = `900 210px ${DISPLAY_FONT}`;
      ctx.fillText(String(value), x, 480);
      ctx.fillStyle = palette.primary;
      ctx.font = `900 50px ${DISPLAY_FONT}`;
      ctx.fillText(spaced(label), x, 660);
    });
  }, [franchiseName, titles, rivalryCount, unlocks, palette.primary, palette.secondary]);

  const towers: Vec3[] = [[-30, 0, -19], [30, 0, -19], [-30, 0, 19], [30, 0, 19]];

  return <group>
    {/* stands + outer wall as one stepped lathe, stretched into an oval */}
    <mesh scale={[BOWL_X, 1, 1]}>
      <latheGeometry args={[standPoints, 96]} />
      <meshStandardMaterial color="#23272c" roughness={0.62} metalness={0.35} side={DoubleSide} />
    </mesh>
    <instancedMesh ref={seatsRef} args={[undefined, undefined, seats.length]}>
      <boxGeometry args={[0.9, 0.5, 0.55]} />
      <meshStandardMaterial roughness={0.5} metalness={0.2} />
    </instancedMesh>

    {/* facade fins glow in franchise colour */}
    {fins.map((fin, index) => <mesh key={index} position={[fin.x, 5.2, fin.z]} rotation={[0, fin.yaw, 0]}>
      <boxGeometry args={[0.16, 10.2, 0.16]} />
      <meshBasicMaterial color={palette.dimPrimary} toneMapped={false} />
    </mesh>)}

    {/* roof ring */}
    <mesh position={[0, 12.6, 0]} scale={[BOWL_X, 1, 1]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[26.6, 0.9, 10, 120]} />
      <meshStandardMaterial color="#15181b" metalness={0.85} roughness={0.25} />
    </mesh>
    <mesh position={[0, 11.65, 0]} scale={[BOWL_X, 1, 1]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[25.9, 0.12, 8, 160]} />
      <meshBasicMaterial color={palette.primary} toneMapped={false} />
    </mesh>
    {Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return <mesh key={index} position={[Math.cos(angle) * 27.3 * BOWL_X, 11.4, Math.sin(angle) * 27.3]}>
        <cylinderGeometry args={[0.18, 0.24, 2.4, 8]} />
        <meshStandardMaterial color="#15181b" metalness={0.8} roughness={0.3} />
      </mesh>;
    })}

    {/* light towers */}
    {towers.map((tower, index) => {
      const yaw = Math.atan2(-tower[0], -tower[2]);
      return <group key={index} position={tower}>
        <mesh position={[0, 12, 0]}>
          <cylinderGeometry args={[0.35, 0.6, 24, 10]} />
          <meshStandardMaterial color="#1a1d21" metalness={0.8} roughness={0.35} />
        </mesh>
        <group position={[0, 24.5, 0]} rotation={[0.45, yaw, 0]}>
          <mesh>
            <boxGeometry args={[5.6, 2.6, 0.5]} />
            <meshStandardMaterial color="#111316" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.27]}>
            <planeGeometry args={[5.1, 2.1]} />
            <meshBasicMaterial color="#fff7e6" toneMapped={false} />
          </mesh>
        </group>
      </group>;
    })}

    {/* field */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <planeGeometry args={[40, 20]} />
      <meshStandardMaterial map={fieldTexture} roughness={0.85} metalness={0} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[BOWL_X, 1, 1]}>
      <circleGeometry args={[16, 64]} />
      <meshStandardMaterial color="#0b2416" roughness={0.9} />
    </mesh>

    {/* scoreboard above the north stands */}
    <Clickable id="scoreboard" onSelect={onSelect}>
      <group position={[0, 16.5, -26.4]}>
        <mesh position={[0, -5.2, -0.4]}>
          <boxGeometry args={[1, 6, 1]} />
          <meshStandardMaterial color="#15181b" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh>
          <boxGeometry args={[17.4, 6.8, 0.8]} />
          <meshStandardMaterial color="#0c0e10" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.41]}>
          <planeGeometry args={[16.6, 6.2]} />
          <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={scoreboardTexture} emissiveIntensity={0.85} roughness={0.6} />
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

function FrontGate({ palette, franchiseName, abbreviation, establishedYear, titleYears, onSelect }: { palette: Palette; franchiseName: string; abbreviation: string; establishedYear?: number | null; titleYears: Array<number | null>; onSelect: (id: StadiumWorldExhibitId) => void }) {
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
          <meshStandardMaterial color="#1a1d21" metalness={0.75} roughness={0.32} />
        </mesh>
        <mesh position={[x + (x < 0 ? 1.12 : -1.12), 6.6, gateZ + 1.21]}>
          <boxGeometry args={[0.1, 13.2, 0.1]} />
          <meshBasicMaterial color={palette.primary} toneMapped={false} />
        </mesh>
      </group>)}
      <mesh position={[0, 12.4, gateZ]}>
        <boxGeometry args={[15.4, 2.6, 2.6]} />
        <meshStandardMaterial color="#121417" metalness={0.8} roughness={0.28} />
      </mesh>
      <mesh position={[0, 12.4, gateZ + 1.31]}>
        <planeGeometry args={[13.6, 1.7]} />
        <meshBasicMaterial map={signTexture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 11.0, gateZ + 1.32]}>
        <boxGeometry args={[13.6, 0.08, 0.06]} />
        <meshBasicMaterial color={palette.primary} toneMapped={false} />
      </mesh>
      <group position={[0, 15.4, gateZ + 0.4]}>
        <Crest palette={palette} abbreviation={abbreviation} earned={titleYears.length > 0} />
      </group>
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
    <pointLight position={[0, 7, 50]} color="#fff0d0" intensity={60} distance={30} decay={2} />
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
  return <>
    <fog attach="fog" args={['#05080d', 70, 260]} />
    <SceneEnvironment />
    <NightSky />
    <hemisphereLight args={['#8fa3bd', '#050608', 0.55]} />
    <directionalLight position={[10, 40, 18]} intensity={1.5} color="#fff6e6" />
    <directionalLight position={[-20, 25, 60]} intensity={0.55} color="#c9d6ea" />
    <pointLight position={[0, 20, 0]} color="#fff4de" intensity={160} distance={60} decay={2} />

    <Ground />
    <Bowl
      palette={palette}
      abbreviation={props.abbreviation}
      franchiseName={props.franchiseName}
      titles={props.titleYears.length}
      rivalryCount={props.rivalryCount}
      unlocks={props.unlockedFeatures.length}
      onSelect={onSelect}
    />
    <FrontGate palette={palette} franchiseName={props.franchiseName} abbreviation={props.abbreviation} establishedYear={props.establishedYear} titleYears={props.titleYears} onSelect={onSelect} />
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
