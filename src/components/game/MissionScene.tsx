import { useCallback, useRef } from 'react';
import type { Group } from 'three';
import type { GraphicsProfile } from '@/data/graphics';
import { CameraRig } from '@/game/camera/CameraRig';
import { GameLoop } from '@/game/core/GameLoop';
import type { GameManager } from '@/game/core/GameManager';
import type { GameSession } from '@/game/core/GameSession';
import { Dust } from '@/game/effects/Dust';
import { ScanEffect } from '@/game/effects/ScanEffect';
import { Smoke } from '@/game/effects/Smoke';
import { Sparks } from '@/game/effects/Sparks';
import { MedicalSupply } from '@/game/rescue/MedicalSupply';
import { Survivor } from '@/game/rescue/Survivor';
import { ScanMarkers } from '@/game/scanner/ScanMarkers';
import { TerraWing } from '@/game/terrawing/TerraWing';

interface MissionSceneProps {
  session: GameSession;
  manager: GameManager;
  graphics: GraphicsProfile;
}

/** Everything that exists only while a mission runs: the vehicle, rescue entities, FX, camera, loop. */
export function MissionScene({ session, manager, graphics }: MissionSceneProps) {
  const visualRoot = useRef<Group | null>(null);
  const setVisualRoot = useCallback((group: Group | null) => {
    visualRoot.current = group;
  }, []);
  const getVisualRoot = useCallback(() => visualRoot.current, []);

  return (
    <>
      <GameLoop session={session} manager={manager} />
      <TerraWing session={session} headlights={graphics.headlights} onVisualRoot={setVisualRoot} />
      {session.survivors.survivors.map((survivor) => (
        <Survivor key={survivor.definition.id} survivor={survivor} />
      ))}
      {session.supplies.supplies.map((supply) => (
        <MedicalSupply key={supply.definition.id} supply={supply} />
      ))}
      <ScanMarkers session={session} />
      <ScanEffect
        pulse={session.scanner.pulse}
        getWetness={() => 0.35 + session.weather.rainIntensity * 0.6}
      />
      <Dust session={session} budget={graphics.particleBudget} />
      <Smoke session={session} />
      <Sparks session={session} />
      <CameraRig session={session} input={manager.input} getVisualRoot={getVisualRoot} />
    </>
  );
}
