import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  ShaderMaterial,
  type Mesh,
} from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { formatDistance } from '@/utils/helpers/format';
import { CATEGORY_STYLES, displayCategory, type ScannerTarget } from './ScannerTarget';

const MARKER_HEIGHT = 3.2;
const PILLAR_HEIGHT = 45;

/**
 * Scanner beam: a slim column of light, brightest at the ground and fading out with height, with
 * soft edges (brightness falls off towards the silhouette) so it reads as light, not a solid tube.
 */
function createBeamMaterial(color: string): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uColor: { value: new Color(color) }, uStrength: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying float vEdge;
      void main() {
        vHeight = uv.y;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vHeight;
      varying float vEdge;
      void main() {
        float fade = pow(1.0 - vHeight, 2.2);
        float core = pow(vEdge, 2.5);
        gl_FragColor = vec4(uColor * (0.35 + core), fade * core * uStrength);
      }
    `,
  });
}
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
    () => createBeamMaterial(CATEGORY_STYLES[target.category].color),
    [target.category],
  );
  const ringMaterial = useMemo(
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
  const ring = useRef<Mesh>(null);
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
      (pillarMaterial.uniforms.uStrength as { value: number }).value = highlight * 0.9;
    }
    if (ring.current) {
      // Ground ring ripples outwards while the target is highlighted by a scan ping.
      ring.current.visible = highlight > 0;
      const phase = (now * 0.8) % 1;
      ring.current.scale.setScalar(1 + phase * 5);
      ringMaterial.opacity = highlight * (1 - phase) * 0.6;
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
      (pillarMaterial.uniforms.uColor as { value: Color }).value.copy(color);
      ringMaterial.color.copy(color);
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
        <cylinderGeometry args={[0.35, 0.6, PILLAR_HEIGHT, 16, 1, true]} />
      </mesh>
      <mesh
        ref={ring}
        material={ringMaterial}
        position={[0, 0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.9, 1.05, 48]} />
      </mesh>
      <Html
        position={[0, MARKER_HEIGHT, 0]}
        center
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          ref={container}
          className="scan-marker flex flex-col items-center whitespace-nowrap"
          style={{ display: 'none', color: 'var(--marker)' }}
        >
          {/* Target tag: accent bar, name and distance. */}
          <div className="flex items-stretch overflow-hidden rounded-[3px] bg-[rgb(6_9_11/0.78)] shadow-[0_2px_10px_rgb(0_0_0/0.35)]">
            <span className="w-[3px]" style={{ background: 'var(--marker)' }} />
            <span
              ref={label}
              className="px-2 py-[3px] font-display text-[9.5px] tracking-[0.12em] uppercase"
            />
            <span
              ref={distance}
              className="border-l border-white/10 px-2 py-[3px] font-mono text-[10px] text-[#e8eef1] tabular-nums"
            />
          </div>
          {/* Leader line down to the reticle. */}
          <span className="h-3 w-px opacity-70" style={{ background: 'var(--marker)' }} />
          {/* Reticle: corner brackets framing the category icon. */}
          <span className="relative flex h-7 w-7 items-center justify-center">
            {[
              'top-0 left-0 border-t border-l',
              'top-0 right-0 border-t border-r',
              'bottom-0 left-0 border-b border-l',
              'bottom-0 right-0 border-b border-r',
            ].map((c) => (
              <span
                key={c}
                className={`absolute h-2 w-2 ${c}`}
                style={{ borderColor: 'var(--marker)' }}
              />
            ))}
            <span
              ref={glyph}
              className="text-[11px] leading-none drop-shadow-[0_0_4px_currentColor]"
            />
          </span>
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
    const grow = session.hazards.radiusOf(hazard) / hazard.radius;
    mesh.current.scale.set(grow, 1, grow);
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
