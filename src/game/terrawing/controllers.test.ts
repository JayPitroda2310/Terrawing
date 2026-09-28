import { describe, expect, it } from 'vitest';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { TERRAWING_TW1 } from '@/data/vehicles/terrawing';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { ControlAxes } from '@/game/input/InputManager';
import { FakeVehicleBody } from '@/test/FakeVehicleBody';
import { FlightController } from './FlightController';
import { RoverController } from './RoverController';
import { TransformationController } from './TransformationController';
import { createVehicleState, createVelocityCommand, type VehicleState } from './VehicleState';

const DT = 1 / 60;
const axes = (partial: Partial<ControlAxes> = {}): ControlAxes => ({
  throttle: 0,
  steer: 0,
  lift: 0,
  strafe: 0,
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

  it('slides sideways on roll input and banks towards the slide', () => {
    const flight = new FlightController(TERRAWING_TW1.flight);
    const state = createVehicleState(TERRAWING_TW1, 'FLIGHT', 0, 50, 0, 0);
    state.altitudeAGL = 50;
    const command = createVelocityCommand();
    simulate(state, 4, (s) => {
      flight.update(s, axes({ strafe: 1 }), calmAir, DT, command);
      return command;
    });
    // Heading 0 faces north (-Z); right is +X.
    expect(command.x).toBeCloseTo(TERRAWING_TW1.flight.strafeSpeed, 0);
    expect(Math.abs(command.z)).toBeLessThan(0.1);
    expect(state.heading).toBe(0);
    expect(state.visualRoll).toBeLessThan(-0.2);
  });

  it('noses up while climbing', () => {
    const flight = new FlightController(TERRAWING_TW1.flight);
    const state = createVehicleState(TERRAWING_TW1, 'FLIGHT', 0, 50, 0, 0);
    state.altitudeAGL = 50;
    const command = createVelocityCommand();
    simulate(state, 2, (s) => {
      flight.update(s, axes({ lift: 1 }), calmAir, DT, command);
      return command;
    });
    expect(command.y).toBeCloseTo(TERRAWING_TW1.flight.verticalSpeed, 0);
    expect(state.visualPitch).toBeGreaterThan(0.05);
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

/** Flat test ground with a configurable surface. */
function flatTerrain(surface: SurfaceId): TerrainQuery {
  return {
    heightAt: () => 0,
    normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
      Object.assign(out, { x: 0, y: 1, z: 0 }),
    surfaceAt: () => surface,
    waterLevelAt: () => null,
  } as unknown as TerrainQuery;
}

function simulateRover(
  surface: SurfaceId,
  seconds: number,
  input: Partial<ControlAxes>,
  startSpeed = 0,
) {
  const terrain = flatTerrain(surface);
  const body = new FakeVehicleBody(terrain);
  body.setMode('rover');
  body.teleport(0, 0.02, 0, 0);
  body.velocity.z = -startSpeed;
  const rover = new RoverController(TERRAWING_TW1.rover);
  const state = createVehicleState(TERRAWING_TW1, 'ROVER', 0, 0, 0, 0);
  const sample = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, heading: 0 };
  let activity = 0;
  for (let t = 0; t < seconds; t += DT) {
    body.read(sample);
    Object.assign(state.position, sample.position);
    Object.assign(state.velocity, sample.velocity);
    state.speed = Math.hypot(sample.velocity.x, sample.velocity.z);
    rover.update(state, axes(input), { tractionMultiplier: 1, terrain }, DT, body);
    activity += state.suspensionActivity * DT;
    body.step(DT);
  }
  return { state, body, activity };
}

describe('RoverController (raycast suspension)', () => {
  it('settles on its springs at ride height', () => {
    const { state, body } = simulateRover(SurfaceId.PAD, 3, {});
    expect(state.grounded).toBe(true);
    expect(Math.abs(body.velocity.y)).toBeLessThan(0.05);
    for (const wheel of state.wheels) expect(wheel.compression).toBeGreaterThan(0.08);
    for (const wheel of state.wheels) expect(wheel.compression).toBeLessThan(0.16);
  });

  it('is fastest on road, slower on grass and slowest in mud', () => {
    const road = simulateRover(SurfaceId.ROAD, 8, { throttle: 1 }).state.speed;
    const grass = simulateRover(SurfaceId.GRASS, 8, { throttle: 1 }).state.speed;
    const mud = simulateRover(SurfaceId.MUD, 8, { throttle: 1 }).state.speed;
    expect(road).toBeGreaterThan(grass);
    expect(grass).toBeGreaterThan(mud);
    expect(road).toBeGreaterThan(TERRAWING_TW1.rover.maxSpeed * 0.8);
  });

  it('spins its wheels in mud under full throttle', () => {
    const { state } = simulateRover(SurfaceId.MUD, 0.5, { throttle: 1 });
    expect(state.slip).toBeGreaterThan(0.1);
  });

  it('stops much harder on grippy road than in mud', () => {
    const road = simulateRover(SurfaceId.ROAD, 1.8, { brake: true }, 12).state.speed;
    const mud = simulateRover(SurfaceId.MUD, 1.8, { brake: true }, 12).state.speed;
    expect(road).toBeLessThan(1);
    expect(mud).toBeGreaterThan(road + 3);
  });

  it('feels rough ground: rock works the suspension far more than asphalt', () => {
    const rock = simulateRover(SurfaceId.ROCK, 4, { throttle: 1 }).activity;
    const road = simulateRover(SurfaceId.ROAD, 4, { throttle: 1 }).activity;
    expect(rock).toBeGreaterThan(road * 3);
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
    expect(phases).toEqual(['raise', 'retract', 'unfold', 'spinup', 'liftoff']);
    expect(state.rig.armExtension).toBe(1);
    expect(state.rig.wheelDeploy).toBe(0);
    expect(state.rig.rotorSpeed).toBe(1);
  });
});

describe('RoverController hill-hold', () => {
  it('does not roll away on a slope when the driver lets go', () => {
    const slope = 0.25;
    const terrain = {
      heightAt: (_x: number, z: number) => z * Math.tan(slope),
      normalAt: (_x: number, _z: number, out: { x: number; y: number; z: number }) =>
        Object.assign(out, { x: 0, y: Math.cos(slope), z: -Math.sin(slope) }),
      surfaceAt: () => SurfaceId.GRASS,
      waterLevelAt: () => null,
    } as unknown as TerrainQuery;
    const body = new FakeVehicleBody(terrain);
    body.setMode('rover');
    body.teleport(0, 0.02, 0, 0);
    const rover = new RoverController(TERRAWING_TW1.rover);
    const state = createVehicleState(TERRAWING_TW1, 'ROVER', 0, 0, 0, 0);
    const sample = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, heading: 0 };
    for (let t = 0; t < 4; t += DT) {
      body.read(sample);
      Object.assign(state.position, sample.position);
      Object.assign(state.velocity, sample.velocity);
      rover.update(state, axes(), { tractionMultiplier: 1, terrain }, DT, body);
      body.step(DT);
    }
    expect(Math.hypot(body.velocity.x, body.velocity.z)).toBeLessThan(0.3);
  });
});
