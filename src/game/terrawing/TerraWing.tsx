import { useFrame } from '@react-three/fiber';
import {
  BallCollider,
  CoefficientCombineRule,
  RigidBody,
  RoundCuboidCollider,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { RapierVehicleBody } from '@/game/physics/RapierVehicleBody';
import { VehicleVisual } from './VehicleVisual';

const HOVER_BOB_FREQUENCY = 2.1;
/** Chassis collision box used on wheels (half extents, centre height, edge radius). */
const CHASSIS = { halfWidth: 0.7, halfHeight: 0.2, halfLength: 1.15, centerY: 0.85, radius: 0.08 };

interface TerraWingProps {
  session: GameSession;
  headlights: boolean;
  /** Exposes the interpolated visual root so the camera can follow it. */
  onVisualRoot?: (group: Group | null) => void;
}

/**
 * The player vehicle in the physics world. In flight the body stays upright (a sphere collider,
 * visual banking layered on top). On wheels it is a free rigid body: a chassis box carried by four
 * raycast suspension units, so every bump pitches and rolls the real body.
 */
export function TerraWing({ session, headlights, onVisualRoot }: TerraWingProps) {
  const body = useRef<RapierRigidBody>(null);
  const flightCollider = useRef<RapierCollider>(null);
  const roverCollider = useRef<RapierCollider>(null);
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
    if (!body.current || !flightCollider.current || !roverCollider.current) return;
    session.attachBody(
      new RapierVehicleBody(
        body.current,
        rapier.world,
        rapier.rapier,
        { flight: flightCollider.current, rover: roverCollider.current },
        config.rover,
      ),
    );
    return () => session.detachBody();
  }, [session, rapier, config]);

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
      {/* Flight: sphere. Friction is zero because the controllers model traction themselves. */}
      <BallCollider
        ref={flightCollider}
        args={[config.body.colliderRadius]}
        position={[0, config.body.colliderRadius, 0]}
        friction={0}
        frictionCombineRule={CoefficientCombineRule.Min}
        restitution={0}
        restitutionCombineRule={CoefficientCombineRule.Min}
        density={0}
      />
      {/* Rover: chassis box above the wheels; scrapes on crests and hits obstacles. */}
      <RoundCuboidCollider
        ref={roverCollider}
        args={[CHASSIS.halfWidth, CHASSIS.halfHeight, CHASSIS.halfLength, CHASSIS.radius]}
        position={[0, CHASSIS.centerY, 0]}
        friction={0.4}
        restitution={0.05}
        density={0}
      />
      <group ref={visualRoot}>
        <VehicleVisual config={config} state={state} headlights={headlights} />
      </group>
    </RigidBody>
  );
}
