import { describe, expect, it } from 'vitest';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { TERRAWING_TW1 } from '@/data/vehicles/terrawing';
import type { ControlAxes } from '@/game/input/InputManager';
import { FlightController } from './FlightController';
import { RoverController } from './RoverController';
import { TransformationController } from './TransformationController';
import { createVehicleState, createVelocityCommand, type VehicleState } from './VehicleState';

const DT = 1 / 60;
const axes = (partial: Partial<ControlAxes> = {}): ControlAxes => ({
  throttle: 0,
  steer: 0,
  lift: 0,
  brake: false,
  ...partial,
});
const calmAir = { wind: { x: 0, z: 0 }, serviceCeiling: 1000 };

/** Integrates a controller for `seconds`, feeding its command straight back as the new velocity. */
function simulate(
  state: VehicleState,
  seconds: number,
  step: (s: VehicleState) => ReturnType<typeof createVelocityCommand>,
) {
  for (let t = 0; t < seconds; t += DT) {
    const command = step(state);
    state.velocity.x = command.x;
    state.velocity.y = command.y;
    state.velocity.z = command.z;
    state.heading += command.yawRate * DT;
    state.speed = Math.hypot(command.x, command.z);
  }
}

describe('FlightController', () => {
  it('accelerates towards max speed along the heading and pitches nose-down', () => {
    const flight = new FlightController(TERRAWING_TW1.flight);
    const state = createVehicleState(TERRAWING_TW1, 'FLIGHT', 0, 50, 0, 0);
    state.altitudeAGL = 50;
    const command = createVelocityCommand();
    simulate(state, 6, (s) => {
      flight.update(s, axes({ throttle: 1 }), calmAir, DT, command);
      return command;
    });
    expect(state.speed).toBeCloseTo(TERRAWING_TW1.flight.maxSpeed, 0);
    expect(state.visualPitch).toBeLessThan(0);
    expect(command.gravityScale).toBe(0);
  });

  it('banks into turns', () => {
    const flight = new FlightController(TERRAWING_TW1.flight);
    const state = createVehicleState(TERRAWING_TW1, 'FLIGHT', 0, 50, 0, 0);
    const command = createVelocityCommand();
    simulate(state, 2, (s) => {
      flight.update(s, axes({ throttle: 1, steer: 1 }), calmAir, DT, command);
      return command;
    });
    expect(state.yawRate).toBeGreaterThan(1);
    expect(state.visualRoll).toBeLessThan(0);
  });

  it('stabilises into a hover when released', () => {
    const flight = new FlightController(TERRAWING_TW1.flight);
    const state = createVehicleState(TERRAWING_TW1, 'FLIGHT', 0, 50, 0, 0);
    state.altitudeAGL = 50;
    state.velocity.z = -20;
    const command = createVelocityCommand();
    simulate(state, 5, (s) => {
      flight.update(s, axes(), calmAir, DT, command);
      return command;
    });
    expect(state.speed).toBeLessThan(0.1);
    expect(state.hovering).toBe(true);
  });

  it('softens descent close to the ground', () => {
    const flight = new FlightController(TERRAWING_TW1.flight);
    const state = createVehicleState(TERRAWING_TW1, 'FLIGHT', 0, 2, 0, 0);
    state.altitudeAGL = 1;
    state.velocity.y = -2;
    const command = createVelocityCommand();
    flight.update(state, axes({ lift: -1 }), calmAir, DT, command);
    expect(command.y).toBeGreaterThanOrEqual(-2);
  });
});

describe('RoverController', () => {
  const runRover = (surface: SurfaceId, normal = { x: 0, y: 1, z: 0 }) => {
    const rover = new RoverController(TERRAWING_TW1.rover);
    const state = createVehicleState(TERRAWING_TW1, 'ROVER', 0, 0, 0, 0);
    state.grounded = true;
    state.surface = surface;
    state.groundNormal = normal;
    const command = createVelocityCommand();
    simulate(state, 8, (s) => {
      rover.update(s, axes({ throttle: 1 }), { tractionMultiplier: 1 }, DT, command);
      return command;
    });
    return state.speed;
  };

  it('is fastest on road and slow in mud', () => {
    const road = runRover(SurfaceId.ROAD);
    const rock = runRover(SurfaceId.ROCK);
    const mud = runRover(SurfaceId.MUD);
    expect(road).toBeGreaterThan(rock);
    expect(rock).toBeGreaterThan(mud);
  });

  it('loses speed on steep uphill slopes', () => {
    // Ground rising towards the heading (north / -Z) tilts the normal towards +Z.
    const slope = 0.45;
    const normal = { x: 0, y: Math.cos(slope), z: Math.sin(slope) };
    expect(runRover(SurfaceId.ROAD, normal)).toBeLessThan(runRover(SurfaceId.ROAD) * 0.7);
  });
});

describe('TransformationController', () => {
  it('validates preconditions', () => {
    const t = new TransformationController(TERRAWING_TW1.transform);
    const base = {
      mode: 'FLIGHT' as const,
      altitudeAGL: 5,
      groundSlopeRad: 0.1,
      overWater: false,
      obstructed: false,
      speed: 0,
    };
    expect(t.check('toRover', base)).toBeNull();
    expect(t.check('toRover', { ...base, altitudeAGL: 40 })).toMatch(/DESCEND/);
    expect(t.check('toRover', { ...base, overWater: true })).toMatch(/WATER/);
    expect(t.check('toRover', { ...base, obstructed: true })).toMatch(/OBSTRUCTED/);
    expect(t.check('toRover', { ...base, groundSlopeRad: 1 })).toMatch(/STEEP/);
    expect(t.check('toFlight', { ...base, mode: 'ROVER', speed: 12 })).toMatch(/SLOW/);
  });

  it('runs every phase and ends with the target rig', () => {
    const t = new TransformationController(TERRAWING_TW1.transform);
    const state = createVehicleState(TERRAWING_TW1, 'ROVER', 0, 0, 0, 0);
    state.grounded = true;
    const command = createVelocityCommand();
    t.begin('toFlight', state.rig);
    const phases: string[] = [];
    let done = false;
    for (let i = 0; i < 60 * 20 && !done; i++) {
      const result = t.update(state, DT, command);
      if (result.type === 'phase') phases.push(result.phase.id);
      if (result.type === 'completed') done = true;
      // Pretend the lift-off phase climbs.
      state.altitudeAGL += Math.max(0, command.y) * DT;
    }
    expect(done).toBe(true);
    expect(phases).toEqual(['raise', 'retract', 'spinup', 'liftoff']);
    expect(state.rig.armExtension).toBe(1);
    expect(state.rig.wheelDeploy).toBe(0);
    expect(state.rig.rotorSpeed).toBe(1);
  });
});
