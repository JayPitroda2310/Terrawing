import { useFrame } from '@react-three/fiber';
import {
  BallCollider,
  CoefficientCombineRule,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { getSurface } from '@/data/surfaces/surfaces';
import type { GameSession } from '@/game/core/GameSession';
import { RapierVehicleBody } from '@/game/physics/RapierVehicleBody';
import { VehicleVisual } from './VehicleVisual';

const HOVER_BOB_FREQUENCY = 2.1;
const ROUGHNESS_JITTER = 0.025;

interface TerraWingProps {
  session: GameSession;
  headlights: boolean;
  /** Exposes the interpolated visual root so the camera can follow it. */
  onVisualRoot?: (group: Group | null) => void;
}

/**
 * The player vehicle in the physics world. Physics only yaws the body; pitch/roll/bob are
 * visual-only layers so handling stays stable while the model still feels alive.
 */
export function TerraWing({ session, headlights, onVisualRoot }: TerraWingProps) {
  const body = useRef<RapierRigidBody>(null);
  const visualRoot = useRef<Group>(null);
  const rapier = useRapier();
  const config = session.config;
  const state = session.vehicle.state;
  const spawn = useMemo(() => {
    const p = session.vehicle.state.position;
    return {
      position: [p.x, p.y + 0.05, p.z] as [number, number, number],
      rotation: [0, -session.vehicle.state.heading, 0] as [number, number, number],
    };
  }, [session]);

  useEffect(() => {
    if (!body.current) return;
    session.attachBody(new RapierVehicleBody(body.current, rapier.world, rapier.rapier));
    return () => session.detachBody();
  }, [session, rapier]);

  useEffect(() => {
    onVisualRoot?.(visualRoot.current);
    return () => onVisualRoot?.(null);
  }, [onVisualRoot]);

  useFrame(({ clock }) => {
    const root = visualRoot.current;
    if (!root) return;
    const t = clock.elapsedTime;
    let offset = 0;
    if (state.mode === 'FLIGHT' || state.rig.rotorSpeed > 0.5) {
      offset +=
        Math.sin(t * HOVER_BOB_FREQUENCY) *
        config.flight.hoverBob *
        state.rig.rotorSpeed *
        (state.grounded ? 0 : 1);
    } else if (state.grounded && state.speed > 0.5) {
      const roughness = getSurface(state.surface).roughness;
      offset +=
        Math.sin(t * 31) *
        Math.sin(t * 17) *
        ROUGHNESS_JITTER *
        roughness *
        Math.min(1, state.speed / 8);
    }
    root.position.y = offset;
    root.rotation.set(state.visualPitch, 0, state.visualRoll);
  });

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={spawn.position}
      rotation={spawn.rotation}
      enabledRotations={[false, true, false]}
      linearDamping={0}
      angularDamping={0}
      canSleep={false}
      ccd
      name="terrawing"
    >
      <BallCollider
        args={[config.body.colliderRadius]}
        position={[0, config.body.colliderRadius, 0]}
        // Traction is modelled by the controllers; the physics contact must not add friction,
        // otherwise the ground-stick impulse would pin the rover in place.
        friction={0}
        frictionCombineRule={CoefficientCombineRule.Min}
        restitution={0}
        restitutionCombineRule={CoefficientCombineRule.Min}
        mass={config.body.mass}
      />
      <group ref={visualRoot}>
        <VehicleVisual config={config} state={state} headlights={headlights} />
      </group>
    </RigidBody>
  );
}
