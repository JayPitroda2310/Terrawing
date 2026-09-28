import { Suspense, useCallback, useRef } from 'react';
import type { Group } from 'three';
import type { GraphicsProfile } from '@/data/graphics';
import { CameraRig } from '@/game/camera/CameraRig';
import { GameLoop } from '@/game/core/GameLoop';
import type { GameManager } from '@/game/core/GameManager';
import type { GameSession } from '@/game/core/GameSession';
import { Dust } from '@/game/effects/Dust';
import { WaterSpray } from '@/game/effects/WaterSpray';
import { LivingWorld } from '@/game/life/LivingWorld';
import { HazardEffects } from '@/game/effects/HazardEffects';
import { ScanEffect } from '@/game/effects/ScanEffect';
import { Smoke } from '@/game/effects/Smoke';
import { Sparks } from '@/game/effects/Sparks';
import { MedicalSupply } from '@/game/rescue/MedicalSupply';
import { FallingTrees } from '@/game/disasters/FallingTrees';
import { Rockfalls } from '@/game/disasters/Rockfall';
import { HandoverScene } from '@/game/rescue/HandoverScene';
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
      <TerraWing
        session={session}
        headlights={graphics.headlights || session.environment.lighting.night}
        onVisualRoot={setVisualRoot}
      />
      {session.survivors.survivors.map((survivor) => (
        <Survivor key={survivor.definition.id} survivor={survivor} />
      ))}
      {session.supplies.supplies.map((supply) => (
        <MedicalSupply key={supply.definition.id} supply={supply} />
      ))}
      <ScanMarkers session={session} />
      <ScanEffect
        pulse={session.scanner.pulse}
        getWetness={() => 0.15 + session.weather.wetness * 0.85}
      />
      <Dust session={session} budget={graphics.particleBudget} />
      <WaterSpray session={session} />
      <Suspense fallback={null}>
        <LivingWorld session={session} graphics={graphics} />
        <Rockfalls session={session} />
      </Suspense>
      <FallingTrees session={session} />
      <HandoverScene session={session} getVisualRoot={getVisualRoot} />
      <Smoke session={session} />
      <HazardEffects session={session} />
      <Sparks session={session} />
      <CameraRig session={session} input={manager.input} getVisualRoot={getVisualRoot} />
    </>
  );
}
