'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Color,
  Group,
  Vector3
} from 'three';
import { buildStadiumWorldObjects, parseStadiumWorldZone, STADIUM_WORLD_ZONES, type StadiumWorldZone } from './stadiumWorldModel';

export type StadiumWorldPrototypeProps = {
  franchiseName: string;
  abbreviation: string;
  primary: string;
  secondary: string;
  titleCount: number;
  rivalryCount: number;
  unlockedFeatureCount: number;
  /** Preview/QA harness only: keeps the frame readable for pixel checks. */
  qaCapture?: boolean;
};

const ZONE_TARGETS: Record<StadiumWorldZone, [number, number, number]> = {
  concourse: [0, 0.55, -3.35],
  'owners-office': [-4.1, 0.65, -1.4],
  'rivalry-hall': [4.15, 0.65, -1.25]
};

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

function CameraRig({ zone, reducedMotion }: { zone: StadiumWorldZone; reducedMotion: boolean }) {
  const { camera } = useThree();
  const zoneSpec = STADIUM_WORLD_ZONES.find((item) => item.id === zone) ?? STADIUM_WORLD_ZONES[0];
  const targetPosition = useMemo(() => new Vector3(...zoneSpec.camera), [zoneSpec.camera]);
  const targetLook = useMemo(() => new Vector3(...ZONE_TARGETS[zone]), [zone]);
  const direction = useMemo(() => new Vector3(), []);
  const currentLook = useMemo(() => new Vector3(), []);

  useEffect(() => {
    if (!reducedMotion) return;
    camera.position.copy(targetPosition);
    camera.lookAt(targetLook);
  }, [camera, reducedMotion, targetLook, targetPosition]);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const t = 1 - Math.exp(-3.8 * delta);
    camera.position.lerp(targetPosition, t);
    camera.getWorldDirection(direction);
    currentLook.copy(camera.position).addScaledVector(direction, 8).lerp(targetLook, t);
    camera.lookAt(currentLook);
  });

  return null;
}

function StadiumShell({ primary, secondary, reducedMotion }: { primary: string; secondary: string; reducedMotion: boolean }) {
  const ringRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!reducedMotion && ringRef.current) ringRef.current.rotation.z += delta * 0.018;
  });

  const columns = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const angle = (index / 18) * Math.PI * 2;
    return {
      key: index,
      x: Math.cos(angle) * 8.1,
      z: Math.sin(angle) * 5.1 - 1.7,
      rotation: -angle
    };
  }), []);

  return <group>
    <mesh position={[0, -1.16, -1.1]} receiveShadow>
      <cylinderGeometry args={[10.8, 10.8, 0.22, 64]} />
      <meshStandardMaterial color="#07100c" roughness={0.7} metalness={0.25} />
    </mesh>

    <mesh position={[0, -1.02, -2.55]} receiveShadow>
      <boxGeometry args={[12.6, 0.08, 5.7]} />
      <meshStandardMaterial color="#0a2b1b" roughness={0.9} />
    </mesh>

    {Array.from({ length: 9 }, (_, index) => (
      <mesh key={index} position={[-5 + index * 1.25, -0.96, -2.55]} receiveShadow>
        <boxGeometry args={[0.025, 0.025, 5.55]} />
        <meshStandardMaterial color={index === 4 ? secondary : '#b49a49'} emissive={index === 4 ? primary : '#000000'} emissiveIntensity={index === 4 ? 0.22 : 0} />
      </mesh>
    ))}

    <group ref={ringRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 3.25, -1.7]}>
      <mesh castShadow>
        <torusGeometry args={[8.15, 0.18, 12, 96]} />
        <meshStandardMaterial color="#171b18" metalness={0.82} roughness={0.28} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 36]}>
        <torusGeometry args={[7.72, 0.055, 8, 96]} />
        <meshStandardMaterial color={primary} emissive={primary} emissiveIntensity={0.36} metalness={0.72} roughness={0.28} />
      </mesh>
    </group>

    {columns.map((column) => <group key={column.key} position={[column.x, 0.8, column.z]} rotation={[0, column.rotation, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.18, 4.4, 10]} />
        <meshStandardMaterial color="#151a17" metalness={0.72} roughness={0.38} />
      </mesh>
      <mesh position={[0, 2.22, 0]}>
        <boxGeometry args={[0.5, 0.08, 0.22]} />
        <meshStandardMaterial color={primary} emissive={primary} emissiveIntensity={0.42} />
      </mesh>
    </group>)}

    <mesh position={[0, 2.55, -5.3]} castShadow receiveShadow>
      <boxGeometry args={[11.7, 5.4, 0.24]} />
      <meshStandardMaterial color="#101512" metalness={0.42} roughness={0.58} />
    </mesh>
    <mesh position={[0, 2.15, -5.12]}>
      <boxGeometry args={[6.4, 2.05, 0.06]} />
      <meshStandardMaterial color="#020403" emissive="#082117" emissiveIntensity={0.44} metalness={0.28} roughness={0.55} />
    </mesh>
    <mesh position={[0, 3.24, -5.05]}>
      <boxGeometry args={[6.65, 0.07, 0.1]} />
      <meshStandardMaterial color={primary} emissive={primary} emissiveIntensity={0.55} />
    </mesh>

    <mesh position={[0, -0.85, 2.35]} receiveShadow>
      <boxGeometry args={[7.9, 0.18, 2.5]} />
      <meshStandardMaterial color="#141714" metalness={0.58} roughness={0.52} />
    </mesh>
    <mesh position={[0, -0.73, 1.35]}>
      <boxGeometry args={[5.5, 0.04, 0.07]} />
      <meshStandardMaterial color={primary} emissive={primary} emissiveIntensity={0.5} />
    </mesh>
  </group>;
}

function ChampionsTrophy({ earned, primary, secondary, titleCount }: { earned: boolean; primary: string; secondary: string; titleCount: number }) {
  const trophyRef = useRef<Group>(null);
  const reducedMotion = useReducedMotion();
  useFrame((state) => {
    if (!reducedMotion && trophyRef.current && earned) {
      trophyRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.12;
    }
  });

  const gold = earned ? primary : '#343630';
  const ivory = earned ? secondary : '#4b4e47';

  return <group position={[-4.15, -0.7, -1.4]}>
    <mesh receiveShadow>
      <cylinderGeometry args={[1.28, 1.42, 0.24, 28]} />
      <meshStandardMaterial color="#080b09" metalness={0.86} roughness={0.24} />
    </mesh>
    <mesh position={[0, 0.13, 0]}>
      <cylinderGeometry args={[1.05, 1.18, 0.08, 28]} />
      <meshStandardMaterial color={gold} metalness={0.9} roughness={0.2} emissive={earned ? primary : '#000000'} emissiveIntensity={earned ? 0.18 : 0} />
    </mesh>

    <group ref={trophyRef} position={[0, 1.05, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.32, 0.48, 1.75, 8]} />
        <meshStandardMaterial color="#101412" metalness={0.94} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <torusGeometry args={[0.68, 0.13, 12, 36]} />
        <meshStandardMaterial color={gold} metalness={0.95} roughness={0.2} emissive={earned ? primary : '#000000'} emissiveIntensity={earned ? 0.22 : 0} />
      </mesh>
      {[0, 1, 2, 3].map((index) => (
        <mesh key={index} position={[
          Math.cos((index / 4) * Math.PI * 2) * 0.47,
          1.03,
          Math.sin((index / 4) * Math.PI * 2) * 0.47
        ]} rotation={[0, -(index / 4) * Math.PI * 2, Math.PI / 11]} castShadow>
          <boxGeometry args={[0.15, 0.72, 0.1]} />
          <meshStandardMaterial color={gold} metalness={0.92} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 1.38, 0]} castShadow>
        <octahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color={ivory} metalness={0.72} roughness={0.16} emissive={earned ? primary : '#000000'} emissiveIntensity={earned ? 0.2 : 0} />
      </mesh>
    </group>

    {earned && Array.from({ length: Math.min(titleCount, 4) }, (_, index) => (
      <mesh key={index} position={[-0.6 + index * 0.4, 0.28, 0.94]}>
        <boxGeometry args={[0.26, 0.12, 0.03]} />
        <meshStandardMaterial color={secondary} emissive={primary} emissiveIntensity={0.18} />
      </mesh>
    ))}
    <pointLight position={[0, 2.4, 1.3]} color={primary} intensity={earned ? 16 : 2} distance={5} decay={2} />
  </group>;
}

function OwnersOffice({ earned, primary, secondary, titleCount }: { earned: boolean; primary: string; secondary: string; titleCount: number }) {
  return <group>
    <mesh position={[-4.15, 1.05, -2.15]} castShadow receiveShadow>
      <boxGeometry args={[2.95, 3.25, 0.18]} />
      <meshStandardMaterial color="#171b18" metalness={0.5} roughness={0.48} />
    </mesh>
    <mesh position={[-4.15, 2.08, -2.03]}>
      <boxGeometry args={[2.25, 0.05, 0.04]} />
      <meshStandardMaterial color={primary} emissive={primary} emissiveIntensity={0.65} />
    </mesh>
    <mesh position={[-4.15, -0.9, -0.15]} receiveShadow>
      <boxGeometry args={[3.15, 0.18, 2.7]} />
      <meshStandardMaterial color="#101410" metalness={0.46} roughness={0.55} />
    </mesh>
    <mesh position={[-4.15, 1.05, -1.4]}>
      <boxGeometry args={[2.45, 3.15, 2.2]} />
      <meshPhysicalMaterial color="#17211c" transparent opacity={0.08} roughness={0.05} metalness={0.08} transmission={0.18} />
    </mesh>
    <ChampionsTrophy earned={earned} primary={primary} secondary={secondary} titleCount={titleCount} />
  </group>;
}

function RivalryHall({ rivalryCount, primary, secondary }: { rivalryCount: number; primary: string; secondary: string }) {
  const lit = rivalryCount > 0;
  const markers = Math.min(Math.max(rivalryCount, 1), 7);
  return <group>
    <mesh position={[4.2, 1.2, -2.0]} castShadow receiveShadow>
      <boxGeometry args={[3.35, 3.55, 0.25]} />
      <meshStandardMaterial color="#111612" metalness={0.6} roughness={0.42} />
    </mesh>
    <mesh position={[4.2, 2.7, -1.84]}>
      <torusGeometry args={[1.25, 0.09, 12, 48, Math.PI]} />
      <meshStandardMaterial color={primary} emissive={lit ? primary : '#000000'} emissiveIntensity={lit ? 0.5 : 0} metalness={0.88} roughness={0.22} />
    </mesh>
    {Array.from({ length: markers }, (_, index) => {
      const row = Math.floor(index / 4);
      const col = index % 4;
      return <group key={index} position={[3.16 + col * 0.68, 1.75 - row * 0.78, -1.81]}>
        <mesh castShadow>
          <boxGeometry args={[0.48, 0.58, 0.08]} />
          <meshStandardMaterial color={index < rivalryCount ? primary : '#272b27'} emissive={index < rivalryCount ? primary : '#000000'} emissiveIntensity={index < rivalryCount ? 0.34 : 0} metalness={0.82} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0, 0.055]}>
          <circleGeometry args={[0.12, 18]} />
          <meshStandardMaterial color={secondary} emissive={index < rivalryCount ? secondary : '#000000'} emissiveIntensity={index < rivalryCount ? 0.2 : 0} />
        </mesh>
      </group>;
    })}
    <mesh position={[4.2, -0.9, -0.1]} receiveShadow>
      <boxGeometry args={[3.4, 0.16, 2.5]} />
      <meshStandardMaterial color="#111512" metalness={0.5} roughness={0.58} />
    </mesh>
    <pointLight position={[4.2, 2.5, 0.6]} color={primary} intensity={lit ? 14 : 2} distance={5} decay={2} />
  </group>;
}

function LegacyWall({ count, primary, secondary }: { count: number; primary: string; secondary: string }) {
  return <group position={[0, 0, -4.93]}>
    <mesh position={[0, 0.65, 0]} receiveShadow>
      <boxGeometry args={[5.9, 2.7, 0.18]} />
      <meshStandardMaterial color="#0a0f0c" metalness={0.62} roughness={0.4} />
    </mesh>
    {Array.from({ length: 6 }, (_, index) => {
      const active = index < count;
      return <group key={index} position={[-2.1 + (index % 3) * 2.1, 1.22 - Math.floor(index / 3) * 1.12, 0.13]}>
        <mesh castShadow>
          <boxGeometry args={[1.35, 0.72, 0.08]} />
          <meshStandardMaterial color={active ? '#181c18' : '#0d100e'} metalness={0.72} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0.27, 0.06]}>
          <boxGeometry args={[1.06, 0.035, 0.025]} />
          <meshStandardMaterial color={active ? primary : '#2b2e2a'} emissive={active ? primary : '#000000'} emissiveIntensity={active ? 0.55 : 0} />
        </mesh>
        {active && <mesh position={[0, -0.08, 0.065]}>
          <boxGeometry args={[0.72, 0.12, 0.02]} />
          <meshStandardMaterial color={secondary} emissive={primary} emissiveIntensity={0.12} />
        </mesh>}
      </group>;
    })}
  </group>;
}

function WorldScene({
  zone,
  primary,
  secondary,
  titleCount,
  rivalryCount,
  unlockedFeatureCount
}: {
  zone: StadiumWorldZone;
  primary: string;
  secondary: string;
  titleCount: number;
  rivalryCount: number;
  unlockedFeatureCount: number;
}) {
  const reducedMotion = useReducedMotion();
  return <>
    <color attach="background" args={['#020504']} />
    <fog attach="fog" args={['#020504', 8, 23]} />
    <ambientLight intensity={0.45} color="#b8c2b9" />
    <hemisphereLight intensity={0.65} color={secondary} groundColor="#020604" />
    <directionalLight position={[0, 8, 5]} intensity={1.8} color={secondary} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    <pointLight position={[0, 4.5, -3.5]} color={primary} intensity={18} distance={13} decay={2} />

    <StadiumShell primary={primary} secondary={secondary} reducedMotion={reducedMotion} />
    <LegacyWall count={unlockedFeatureCount} primary={primary} secondary={secondary} />
    <OwnersOffice earned={titleCount > 0} primary={primary} secondary={secondary} titleCount={titleCount} />
    <RivalryHall rivalryCount={rivalryCount} primary={primary} secondary={secondary} />
    <CameraRig zone={zone} reducedMotion={reducedMotion} />
  </>;
}

export function StadiumWorldPrototype(props: StadiumWorldPrototypeProps) {
  const [zone, setZoneState] = useState<StadiumWorldZone>('concourse');
  const [selectedId, setSelectedId] = useState<'champions-trophy' | 'rivalry-monument' | 'legacy-wall'>('legacy-wall');
  const objects = useMemo(() => buildStadiumWorldObjects({
    titleCount: props.titleCount,
    rivalryCount: props.rivalryCount,
    unlockedFeatureCount: props.unlockedFeatureCount
  }), [props.titleCount, props.rivalryCount, props.unlockedFeatureCount]);
  const selected = objects.find((item) => item.id === selectedId) ?? objects[0];

  // Each zone is a shareable destination: ?zone=owners-office
  useEffect(() => {
    const initial = parseStadiumWorldZone(new URLSearchParams(window.location.search).get('zone'));
    setZoneState(initial);
    const preferred = objects.find((item) => item.zone === initial);
    if (preferred && initial !== 'concourse') setSelectedId(preferred.id);
    // Read once on mount; after that the URL follows the user.
  }, []);

  const setZone = (next: StadiumWorldZone) => {
    setZoneState(next);
    const url = new URL(window.location.href);
    if (next === 'concourse') url.searchParams.delete('zone');
    else url.searchParams.set('zone', next);
    window.history.replaceState(window.history.state, '', url);
  };

  const travel = (next: StadiumWorldZone) => {
    setZone(next);
    const preferred = objects.find((item) => item.zone === next);
    if (preferred) setSelectedId(preferred.id);
  };

  const primary = useMemo(() => new Color(props.primary).getStyle(), [props.primary]);
  const secondary = useMemo(() => new Color(props.secondary).getStyle(), [props.secondary]);

  return <section className="stadiumWorld" aria-labelledby="stadium-world-heading">
    <div className="stadiumWorldIntro">
      <div>
        <p className="eyebrow">BIG EXEC WORLD • LIVE 3D PROTOTYPE</p>
        <h2 id="stadium-world-heading">{props.franchiseName} Stadium</h2>
        <p>Move through your franchise legacy as a place. Official accomplishments remain controlled by Fantasy Core; the world changes only when those accomplishments exist.</p>
      </div>
      <div className="stadiumWorldMetrics" aria-label="Current franchise legacy data">
        <span><b>{props.titleCount}</b> Titles</span>
        <span><b>{props.rivalryCount}</b> Rivalry Wins</span>
        <span><b>{props.unlockedFeatureCount}</b> Unlocks</span>
      </div>
    </div>

    <div className="stadiumWorldViewport">
      <div className="stadiumWorldCanvasShell">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: Boolean(props.qaCapture) }}
          camera={{ position: [0, 2.2, 8.8], fov: 54, near: 0.1, far: 70 }}
          onCreated={({ gl }) => {
            gl.domElement.dataset.renderState = 'ready';
            gl.domElement.classList.add('stadiumWorldCanvasElement');
            gl.domElement.setAttribute('role', 'img');
            gl.domElement.setAttribute('aria-label', `3D view of the ${props.franchiseName} stadium. Use the fast travel and inspect buttons below to explore.`);
          }}
          fallback={<div className="stadiumWorldFallback" role="status">3D rendering is unavailable on this device. Stadium data and navigation remain available below.</div>}
        >
          <WorldScene
            zone={zone}
            primary={primary}
            secondary={secondary}
            titleCount={props.titleCount}
            rivalryCount={props.rivalryCount}
            unlockedFeatureCount={props.unlockedFeatureCount}
          />
        </Canvas>
      </div>
      <div className="stadiumWorldHud" aria-hidden="true">
        <span>NOW VISITING</span>
        <strong>{STADIUM_WORLD_ZONES.find((item) => item.id === zone)?.label}</strong>
        <small>{props.abbreviation} • LIVE LEGACY DATA</small>
      </div>
    </div>

    <nav className="stadiumWorldTravel" aria-label="Fast travel inside the stadium">
      {STADIUM_WORLD_ZONES.map((item) => <button key={item.id} type="button" aria-pressed={zone === item.id} onClick={() => travel(item.id)}>{item.label}</button>)}
    </nav>

    <div className="stadiumWorldObjects">
      <div>
        <p className="eyebrow">INSPECT OBJECTS</p>
        <div className="stadiumWorldObjectButtons">
          {objects.map((item) => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setZone(item.zone); }}>
            <span>{item.earned ? 'EARNED' : 'LOCKED / WAITING'}</span>
            <strong>{item.label}</strong>
          </button>)}
        </div>
      </div>
      <aside className="stadiumWorldDetail" aria-live="polite">
        <span>{selected.earned ? 'Franchise legacy' : 'Future unlock'}</span>
        <h3>{selected.label}</h3>
        <p>{selected.detail}</p>
        <small>Zone: {STADIUM_WORLD_ZONES.find((item) => item.id === selected.zone)?.label}</small>
      </aside>
    </div>
  </section>;
}
