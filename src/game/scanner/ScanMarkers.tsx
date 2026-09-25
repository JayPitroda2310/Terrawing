import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, type Mesh } from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { formatDistance } from '@/utils/helpers/format';
import { CATEGORY_STYLES, displayCategory, type ScannerTarget } from './ScannerTarget';

const MARKER_HEIGHT = 3.2;
const PILLAR_HEIGHT = 60;
/** Markers closer than this are hidden so they never sit on top of TerraWing. */
const NEAR_HIDE_DISTANCE = 14;

/** World-anchored scanner markers for every discovered target, plus ping highlight pillars. */
export function ScanMarkers({ session }: { session: GameSession }) {
  return (
    <group>
      {session.scanner.targets.map((target) => (
        <TargetMarker key={target.id} session={session} target={target} />
      ))}
      {session.mission.hazards.map((hazard) => (
        <HazardZone key={hazard.id} session={session} hazardId={hazard.id} />
      ))}
    </group>
  );
}

function TargetMarker({ session, target }: { session: GameSession; target: ScannerTarget }) {
  const container = useRef<HTMLDivElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const distance = useRef<HTMLSpanElement>(null);
  const pillar = useRef<Mesh>(null);
  const pillarMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: CATEGORY_STYLES[target.category].color,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    [target.category],
  );
  const color = useMemo(() => new Color(), []);
  const last = useRef({ category: '', visible: false });

  useFrame(() => {
    const el = container.current;
    if (!el) return;
    const now = session.time;
    const state = session.vehicle.state;
    const d = Math.hypot(
      target.position.x - state.position.x,
      target.position.z - state.position.z,
    );
    const visible =
      session.scanner.isMarkerVisible(target, now) &&
      session.phase !== 'loading' &&
      d > NEAR_HIDE_DISTANCE;
    if (visible !== last.current.visible) {
      el.style.display = visible ? 'flex' : 'none';
      last.current.visible = visible;
    }
    const highlight = session.scanner.highlight(target, now);
    if (pillar.current) {
      pillar.current.visible = highlight > 0;
      pillarMaterial.opacity = highlight * 0.35;
    }
    if (!visible) return;

    const category = displayCategory(target);
    if (category !== last.current.category) {
      last.current.category = category;
      const style = CATEGORY_STYLES[category];
      el.style.setProperty('--marker', style.color);
      if (glyph.current) glyph.current.textContent = style.glyph;
      if (label.current)
        label.current.textContent = target.classified ? target.label : 'UNKNOWN SIGNAL';
      color.set(style.color);
      pillarMaterial.color.copy(color);
    }
    const unstable = session.signal.state === 'unstable';
    if (distance.current) distance.current.textContent = unstable ? '— — —' : formatDistance(d);
    el.style.opacity = unstable ? String(0.45 + Math.random() * 0.3) : '1';
  });

  const { x, y, z } = target.position;
  return (
    <group position={[x, y, z]}>
      <mesh
        ref={pillar}
        material={pillarMaterial}
        position={[0, PILLAR_HEIGHT / 2, 0]}
        visible={false}
      >
        <cylinderGeometry args={[0.5, 1.4, PILLAR_HEIGHT, 12, 1, true]} />
      </mesh>
      <Html
        position={[0, MARKER_HEIGHT, 0]}
        center
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          ref={container}
          className="flex flex-col items-center gap-0.5 font-mono text-[10px] leading-none tracking-wider whitespace-nowrap"
          style={{ display: 'none', color: 'var(--marker)' }}
        >
          <span
            ref={glyph}
            className="flex h-6 w-6 items-center justify-center rounded-sm border text-[12px]"
            style={{ borderColor: 'var(--marker)', background: 'rgb(8 12 14 / 0.6)' }}
          />
          <span
            ref={label}
            className="rounded-sm bg-black/50 px-1 py-0.5 text-[10px] font-semibold"
          />
          <span ref={distance} className="tabular text-[#dfe7ec]" />
        </div>
      </Html>
    </group>
  );
}

/** Red boundary wall shown once a hazard has been discovered by the scanner. */
function HazardZone({ session, hazardId }: { session: GameSession; hazardId: string }) {
  const hazard = session.mission.hazards.find((h) => h.id === hazardId)!;
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ff4d4d',
        transparent: true,
        opacity: 0.07,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const target = session.scanner.getTarget(hazardId);
    mesh.current.visible = Boolean(target?.discovered);
    material.opacity = 0.05 + 0.03 * Math.sin(clock.elapsedTime * 2);
  });
  const [x, z] = hazard.position;
  const y = session.terrain.heightAt(x, z);
  return (
    <mesh ref={mesh} material={material} position={[x, y + 20, z]} visible={false}>
      <cylinderGeometry args={[hazard.radius, hazard.radius, 60, 64, 1, true]} />
    </mesh>
  );
}
