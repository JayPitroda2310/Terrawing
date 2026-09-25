import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import type { VehicleConfig } from '@/data/vehicles';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { WeatherSystem } from '@/game/systems/WeatherSystem';
import { VehicleVisual, type VehicleVisualState } from '@/game/terrawing/VehicleVisual';
import { MENU_FOCUS } from './menuConfig';

const HOVER_HEIGHT = 3.2;
const ORBIT_RADIUS = 10.5;
const ORBIT_SPEED = 0.045;

interface MenuSceneProps {
  terrain: TerrainQuery;
  vehicle: VehicleConfig;
  weather: WeatherSystem;
  reducedMotion: boolean;
}

/** Main-menu backdrop: TerraWing hovering over the extraction LZ, slow orbiting camera. */
export function MenuScene({ terrain, vehicle, weather, reducedMotion }: MenuSceneProps) {
  const group = useRef<Group>(null);
  const ground = terrain.heightAt(MENU_FOCUS.x, MENU_FOCUS.z);
  const state = useMemo<VehicleVisualState>(
    () => ({ rig: { ...vehicle.rig.flight }, forwardSpeed: 0, steer: 0, payload: null }),
    [vehicle],
  );

  useFrame(({ camera, clock }, dt) => {
    const t = clock.elapsedTime;
    weather.update(Math.min(dt, 0.1));
    if (group.current) {
      group.current.position.y = ground + HOVER_HEIGHT + Math.sin(t * 1.6) * 0.12;
      group.current.rotation.z = Math.sin(t * 0.9) * 0.03;
      group.current.rotation.x = Math.sin(t * 0.7) * 0.025;
    }
    const angle = reducedMotion ? 0.6 : 0.6 + t * ORBIT_SPEED;
    camera.position.set(
      MENU_FOCUS.x + Math.sin(angle) * ORBIT_RADIUS,
      ground + HOVER_HEIGHT + 2.2,
      MENU_FOCUS.z + Math.cos(angle) * ORBIT_RADIUS,
    );
    // Frame TerraWing on the right third, leaving the left side for the menu.
    camera.lookAt(
      MENU_FOCUS.x - Math.cos(angle) * 3.2,
      ground + HOVER_HEIGHT + 1.2,
      MENU_FOCUS.z + Math.sin(angle) * 3.2,
    );
  });

  return (
    <group
      ref={group}
      position={[MENU_FOCUS.x, ground + HOVER_HEIGHT, MENU_FOCUS.z]}
      rotation-y={0.4}
    >
      <VehicleVisual config={vehicle} state={state} headlights />
    </group>
  );
}
