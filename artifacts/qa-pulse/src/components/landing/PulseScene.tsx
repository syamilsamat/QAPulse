import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { scrollState } from "./scrollState";

/**
 * QMPulse landing — WebGL scene.
 *
 * Concept: the viewer flies along a giant ECG "pulse" line running into the
 * depth of the scene. Scroll progress drives the camera down the corridor;
 * floating dashboard panels drift past on either side.
 */

// ---------------------------------------------------------------------------
// ECG waveform helpers
// ---------------------------------------------------------------------------

/** Gaussian bump */
function bump(u: number, center: number, width: number, amp: number) {
  return amp * Math.exp(-((u - center) ** 2) / (2 * width * width));
}

/** One heartbeat cycle, u in [0,1) → vertical displacement */
function ecgY(u: number) {
  return (
    bump(u, 0.18, 0.028, 0.22) + // P wave
    bump(u, 0.36, 0.009, -0.32) + // Q dip
    bump(u, 0.4, 0.011, 1.55) + // R spike
    bump(u, 0.44, 0.01, -0.42) + // S dip
    bump(u, 0.62, 0.045, 0.36) // T wave
  );
}

const CORRIDOR_START = 10;
const CORRIDOR_END = -52;
const BEATS = 8;

function buildEcgCurve(): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const N = 480;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = CORRIDOR_START - (CORRIDOR_START - CORRIDOR_END) * t;
    const u = (t * BEATS) % 1;
    const y = ecgY(u) * 1.6 - 0.4;
    const x = Math.sin(t * Math.PI * 3) * 0.9;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

function HeartbeatLine({ segments }: { segments: number }) {
  const { core, glow } = useMemo(() => {
    const curve = buildEcgCurve();
    return {
      core: new THREE.TubeGeometry(curve, segments, 0.03, 8, false),
      glow: new THREE.TubeGeometry(curve, segments, 0.11, 8, false),
    };
  }, [segments]);

  return (
    <group>
      <mesh geometry={core}>
        <meshBasicMaterial color="#3af5c8" toneMapped={false} />
      </mesh>
      <mesh geometry={glow}>
        <meshBasicMaterial
          color="#14b8a6"
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Bright dot + light that races along the ECG line like a monitor sweep. */
function PulseRunner() {
  const curve = useMemo(() => buildEcgCurve(), []);
  const dot = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = (clock.getElapsedTime() * 0.045) % 1;
    const p = curve.getPointAt(t);
    dot.current?.position.copy(p);
    halo.current?.position.copy(p);
    light.current?.position.copy(p);
    const s = 1 + Math.sin(clock.getElapsedTime() * 6) * 0.25;
    halo.current?.scale.setScalar(s);
  });

  return (
    <group>
      <mesh ref={dot}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color="#eafff7" toneMapped={false} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial
          color="#2dd4bf"
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <pointLight ref={light} color="#2dd4bf" intensity={14} distance={9} />
    </group>
  );
}

function Particles({ count }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 46;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 2] = CORRIDOR_END - 6 + Math.random() * (CORRIDOR_START - CORRIDOR_END + 16);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return geo;
  }, [count]);

  useFrame(({ clock }) => {
    if (!points.current) return;
    points.current.rotation.z = clock.getElapsedTime() * 0.012;
    points.current.position.x = scrollState.mouseX * 0.6;
    points.current.position.y = scrollState.mouseY * 0.35;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.07}
        color="#67e8f9"
        transparent
        opacity={0.45}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/** A floating glass "dashboard card" with a tiny bar chart inside. */
function Panel({
  position,
  tilt,
  seed,
}: {
  position: [number, number, number];
  tilt: number;
  seed: number;
}) {
  const group = useRef<THREE.Group>(null);
  const bars = useMemo(
    () => [0.5, 0.9, 0.65, 1.1, 0.8].map((h, i) => ({ h: h * (0.7 + ((seed * 7 + i * 3) % 5) * 0.1), i })),
    [seed],
  );

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.position.y = position[1] + Math.sin(t * 0.6 + seed * 2.1) * 0.25;
    group.current.rotation.y = tilt + Math.sin(t * 0.3 + seed) * 0.06;
    group.current.rotation.x = Math.sin(t * 0.4 + seed * 1.7) * 0.04;
  });

  return (
    <group ref={group} position={position} rotation={[0, tilt, 0]}>
      {/* glass slab */}
      <mesh>
        <boxGeometry args={[3, 1.9, 0.06]} />
        <meshStandardMaterial
          color="#0a1526"
          transparent
          opacity={0.6}
          metalness={0.35}
          roughness={0.35}
        />
      </mesh>
      {/* edge frame */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(3, 1.9, 0.06)]} />
        <lineBasicMaterial color="#2dd4bf" transparent opacity={0.7} />
      </lineSegments>
      {/* mini bar chart */}
      {bars.map(({ h, i }) => (
        <mesh key={i} position={[-1 + i * 0.5, -0.7 + h / 2, 0.06]}>
          <boxGeometry args={[0.26, h, 0.05]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#2dd4bf" : "#38bdf8"}
            transparent
            opacity={0.85}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* header line */}
      <mesh position={[-0.55, 0.68, 0.06]}>
        <boxGeometry args={[1.5, 0.09, 0.02]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function Panels() {
  const panels: { position: [number, number, number]; tilt: number }[] = [
    { position: [-4.4, 0.7, 1], tilt: 0.5 },
    { position: [4.6, -0.4, -5], tilt: -0.55 },
    { position: [-4.8, -0.8, -13], tilt: 0.45 },
    { position: [4.4, 1.0, -21], tilt: -0.5 },
    { position: [-4.5, 0.4, -30], tilt: 0.55 },
    { position: [4.8, -0.6, -39], tilt: -0.45 },
    { position: [-4.2, 1.1, -47], tilt: 0.5 },
  ];
  return (
    <group>
      {panels.map((p, i) => (
        <Panel key={i} position={p.position} tilt={p.tilt} seed={i + 1} />
      ))}
    </group>
  );
}

/** Camera rig — flies down the corridor as the page scrolls. */
function Rig() {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const p = scrollState.progress;
    const z = CORRIDOR_START + 4 - p * (CORRIDOR_START + 4 - (CORRIDOR_END + 10));
    const x = Math.sin(p * Math.PI * 2) * 1.4 + scrollState.mouseX * 0.7;
    const y = 0.9 + Math.sin(p * Math.PI) * 0.8 + scrollState.mouseY * 0.45;
    target.set(x, y, z);
    // framerate-independent damping
    const alpha = 1 - Math.pow(0.0015, dt);
    camera.position.lerp(target, alpha);
    lookAt.set(x * 0.3, 0.2, z - 9);
    camera.lookAt(lookAt);
  });

  return null;
}

function Lights() {
  const key = useRef<THREE.PointLight>(null);
  const colorA = useMemo(() => new THREE.Color("#14b8a6"), []);
  const colorB = useMemo(() => new THREE.Color("#7c3aed"), []);
  const mixed = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (!key.current) return;
    mixed.copy(colorA).lerp(colorB, scrollState.progress);
    key.current.color = mixed;
    key.current.position.z = camZ();
  });

  function camZ() {
    return CORRIDOR_START + 2 - scrollState.progress * (CORRIDOR_START - CORRIDOR_END);
  }

  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight ref={key} position={[0, 6, 4]} intensity={40} distance={30} />
      <pointLight position={[-8, -4, -20]} color="#0ea5e9" intensity={25} distance={35} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

/** Static gradient stand-in when WebGL is unavailable or the user prefers reduced motion. */
function StaticBackdrop() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none bg-[#04070f]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_15%,rgba(20,184,166,0.20),transparent_55%),radial-gradient(ellipse_at_75%_75%,rgba(14,165,233,0.15),transparent_55%)]" />
    </div>
  );
}

export default function PulseScene() {
  const { webglOk, isCoarse, reducedMotion } = useMemo(() => {
    if (typeof window === "undefined") {
      return { webglOk: false, isCoarse: false, reducedMotion: false };
    }
    let webglOk = false;
    try {
      const c = document.createElement("canvas");
      webglOk = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglOk = false;
    }
    return {
      webglOk,
      isCoarse: window.matchMedia("(max-width: 768px), (pointer: coarse)").matches,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }, []);

  if (!webglOk || reducedMotion) return <StaticBackdrop />;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        dpr={[1, isCoarse ? 1.5 : 1.75]}
        camera={{ fov: 58, position: [0, 1, 14], near: 0.1, far: 90 }}
        gl={{ antialias: !isCoarse, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#04070f"]} />
        <fog attach="fog" args={["#04070f", 12, 46]} />
        <Lights />
        <HeartbeatLine segments={isCoarse ? 450 : 900} />
        <PulseRunner />
        <Particles count={isCoarse ? 700 : 1600} />
        <Panels />
        <gridHelper
          args={[140, 70, "#0e3a34", "#0a1f2e"]}
          position={[0, -3.4, -20]}
        />
        <Rig />
      </Canvas>
    </div>
  );
}
