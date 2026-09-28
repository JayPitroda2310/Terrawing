import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { useGameManager } from '@/app/GameManagerContext';
import { getEnvironment } from '@/data/environments';
import { GRAPHICS_PROFILES } from '@/data/graphics';
import { DEFAULT_MISSION_ID, loadMission } from '@/data/missions';
import { getVehicle } from '@/data/vehicles';
import type { GameSession } from '@/game/core/GameSession';
import { Screen } from '@/game/core/GameState';
import { PostFX } from '@/game/effects/PostFX';
import { getTerrain } from '@/game/environment/terrainCache';
import { World } from '@/game/environment/World';
import { WeatherSystem } from '@/game/systems/WeatherSystem';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { RenderStatsProbe } from '@/ui/debug/RenderStatsProbe';
import { MENU_FOCUS } from './menuConfig';
import { MenuScene } from './MenuScene';
import { BackdropReady } from './BackdropReady';
import { MissionScene } from './MissionScene';

const PHYSICS_STEP = 1 / 60;
/** Dynamic resolution: never render below this fraction of native resolution. */
const MIN_DPR = 0.6;
const DPR_STEP_DOWN = 0.15;
const DPR_STEP_UP = 0.1;
const GRAVITY: [number, number, number] = [0, -9.81, 0];

function useMenuBackdrop() {
  return useMemo(() => {
    const result = loadMission(DEFAULT_MISSION_ID);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const environment = getEnvironment(result.mission.environment);
    return {
      mission: result.mission,
      environment,
      terrain: getTerrain(environment),
      vehicle: getVehicle(result.mission.vehicle),
      weather: new WeatherSystem(result.mission.weather),
    };
  }, []);
}

/** Structure ids that sit inside a charging zone of the current mission. */
function chargingStructures(
  session: GameSession | null,
  menu: ReturnType<typeof useMenuBackdrop>,
): Set<string> {
  const mission = session?.mission ?? menu.mission;
  const environment = session?.environment ?? menu.environment;
  const ids = new Set<string>();
  for (const zone of mission.zones) {
    if (!zone.charging) continue;
    for (const structure of environment.structures) {
      const d = Math.hypot(
        structure.position[0] - zone.position[0],
        structure.position[1] - zone.position[1],
      );
      if (d < zone.radius) ids.add(structure.id);
    }
  }
  return ids;
}

/**
 * The single persistent WebGL canvas. Shows the menu backdrop when no mission runs and the mission
 * world otherwise. Physics is paused whenever the game is not actively playing.
 */
export function GameCanvas() {
  const manager = useGameManager();
  const session = useGameStore((s) => s.session);
  const screen = useGameStore((s) => s.screen);
  const debugOpen = useGameStore((s) => s.debugOpen);
  const debugColliders = useGameStore((s) => s.debugColliders);
  const quality = useSettingsStore((s) => s.settings.graphics);
  const reducedMotion = useSettingsStore((s) => s.settings.reducedMotion);
  const graphics = GRAPHICS_PROFILES[quality];
  const menu = useMenuBackdrop();

  const environment = session?.environment ?? menu.environment;
  const terrain = session?.terrain ?? menu.terrain;
  const weather = session?.weather ?? menu.weather;
  const chargingPads = useMemo(() => chargingStructures(session, menu), [session, menu]);
  const menuFocus = useMemo(
    () => ({
      x: MENU_FOCUS.x,
      y: menu.terrain.heightAt(MENU_FOCUS.x, MENU_FOCUS.z),
      z: MENU_FOCUS.z,
    }),
    [menu],
  );
  const getFocus = useCallback(
    () => session?.vehicle.state.position ?? menuFocus,
    [session, menuFocus],
  );
  const getRotorWash = useCallback(() => {
    if (!session) return null;
    const state = session.vehicle.state;
    return { ...state.position, strength: state.rig.rotorSpeed };
  }, [session]);
  const controlsIntro = useGameStore((s) => s.controlsIntro);
  const paused = screen !== Screen.PLAYING || controlsIntro;
  // Dynamic resolution keeps frame rate up on weaker GPUs; resets whenever quality changes.
  const [dpr, setDpr] = useState<{ quality: string; value: number }>({
    quality,
    value: graphics.maxPixelRatio,
  });
  const currentDpr = dpr.quality === quality ? dpr.value : graphics.maxPixelRatio;
  const nativeDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const maxDpr = Math.min(graphics.maxPixelRatio, nativeDpr);

  return (
    <Canvas
      key={quality}
      shadows={graphics.shadows ? { type: PCFShadowMap } : false}
      dpr={Math.min(currentDpr, maxDpr)}
      gl={{
        antialias: graphics.antialias,
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
      }}
      camera={{
        fov: 60,
        near: 0.3,
        far: graphics.drawDistance,
        position: [MENU_FOCUS.x + 15, 30, MENU_FOCUS.z + 15],
      }}
      onCreated={(state) => {
        manager.input.mouse.attach(state.gl.domElement);
        // Development-only handle for inspecting the scene from automated checks.
        if (import.meta.env.DEV) (window as unknown as { __twThree?: unknown }).__twThree = state;
      }}
      onPointerDown={() => {
        if (useGameStore.getState().screen === Screen.PLAYING) manager.input.mouse.requestLock();
      }}
      className="!absolute inset-0"
    >
      <BackdropReady />
      <PerformanceMonitor
        onDecline={() =>
          setDpr({
            quality,
            value: Math.max(MIN_DPR, Math.min(currentDpr, maxDpr) - DPR_STEP_DOWN),
          })
        }
        onIncline={() => setDpr({ quality, value: Math.min(maxDpr, currentDpr + DPR_STEP_UP) })}
      />
      <Suspense fallback={null}>
        <Physics
          key={session?.id ?? 'menu'}
          paused={paused || !session}
          timeStep={PHYSICS_STEP}
          gravity={GRAVITY}
          debug={debugColliders}
          updatePriority={-50}
        >
          <World
            environment={environment}
            terrain={terrain}
            weather={weather}
            graphics={graphics}
            chargingPads={chargingPads}
            getFocus={getFocus}
            getRotorWash={getRotorWash}
          />
          {session ? (
            <MissionScene session={session} manager={manager} graphics={graphics} />
          ) : (
            <MenuScene
              terrain={menu.terrain}
              vehicle={menu.vehicle}
              weather={menu.weather}
              reducedMotion={reducedMotion}
            />
          )}
        </Physics>
      </Suspense>
      {graphics.bloom && <PostFX />}
      {import.meta.env.DEV && debugOpen && <RenderStatsProbe />}
    </Canvas>
  );
}
