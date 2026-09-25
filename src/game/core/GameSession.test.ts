import { beforeEach, describe, expect, it } from 'vitest';
import { getEnvironment } from '@/data/environments';
import { loadMission } from '@/data/missions';
import { getVehicle } from '@/data/vehicles';
import { getTerrain } from '@/game/environment/terrainCache';
import type { GameAction } from '@/game/input/actions';
import type { ControlAxes } from '@/game/input/InputManager';
import { FakeVehicleBody } from '@/test/FakeVehicleBody';
import { GameSession, type SessionInput } from './GameSession';

const DT = 1 / 60;

class ScriptedInput implements SessionInput {
  axes: ControlAxes = { throttle: 0, steer: 0, lift: 0, brake: false };
  private readonly pressed = new Set<GameAction>();
  press(action: GameAction): void {
    this.pressed.add(action);
  }
  sampleAxes(out: ControlAxes): ControlAxes {
    return Object.assign(out, this.axes);
  }
  consumePressed(action: GameAction): boolean {
    return this.pressed.delete(action);
  }
  clearPressed(): void {
    this.pressed.clear();
  }
}

function createSession() {
  const result = loadMission('mission-01');
  if (!result.ok) throw new Error(result.errors.join('\n'));
  const mission = result.mission;
  const environment = getEnvironment(mission.environment);
  const terrain = getTerrain(environment);
  const input = new ScriptedInput();
  const session = new GameSession({
    mission,
    environment,
    vehicle: getVehicle(mission.vehicle),
    terrain,
    input,
  });
  const body = new FakeVehicleBody(terrain);
  const [x, z] = mission.spawn.position;
  body.teleport(x, terrain.heightAt(x, z), z, 0);
  session.attachBody(body);
  session.start();
  const run = (seconds: number, until?: () => boolean) => {
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      session.fixedUpdate(DT);
      body.step(DT);
      if (until?.()) return true;
    }
    return false;
  };
  return { session, input, body, terrain, run };
}

describe('GameSession — Mission 01 loop', () => {
  let ctx: ReturnType<typeof createSession>;
  beforeEach(() => {
    ctx = createSession();
  });

  it('starts with the intro cinematic, which can be skipped', () => {
    expect(ctx.session.gameplay.kind).toBe('CINEMATIC');
    ctx.input.press('interact');
    ctx.run(0.1);
    expect(ctx.session.gameplay.kind).toBe('ROVER');
  });

  it('transforms to flight, deploys and scans the disaster zone', () => {
    const { session, input, run } = ctx;
    run(6);
    expect(session.gameplay.kind).toBe('ROVER');

    input.press('interact');
    run(0.05);
    expect(session.gameplay.kind).toBe('TRANSFORMING');
    expect(run(8, () => session.gameplay.kind === 'FLIGHT')).toBe(true);
    expect(session.vehicleMode).toBe('FLIGHT');

    input.axes.lift = 1;
    run(3);
    input.axes.lift = 0;
    expect(session.missionManager.getObjective('deploy')?.status).toBe('completed');

    // Fly towards the disaster zone and scan.
    session.debugTeleport(-150, 150);
    input.press('scan');
    run(0.1);
    expect(session.missionManager.getObjective('scan')?.status).toBe('completed');
    expect(session.scanner.totalPulses).toBe(1);
  });

  it('secures a survivor after landing and interacting in rover mode', () => {
    const { session, input, run, body, terrain } = ctx;
    run(6);
    // Take off first so the deploy objective completes.
    input.press('interact');
    run(8, () => session.gameplay.kind === 'FLIGHT');
    input.axes.lift = 1;
    run(2.5);
    input.axes.lift = 0;

    // Hover next to survivor A and land.
    const [sx, sz] = [-27, 131];
    body.teleport(sx - 4, terrain.heightAt(sx - 4, sz) + 6, sz, 0);
    run(0.2);
    input.press('interact');
    expect(run(15, () => session.gameplay.kind === 'ROVER')).toBe(true);

    run(0.2);
    expect(session.interaction.prompt?.interactable.id).toBe('secure:survivor-a');
    expect(session.interaction.prompt?.blockedReason).toBeNull();
    input.press('interact');
    run(0.1);
    expect(session.gameplay.kind).toBe('INTERACTING');
    run(4, () => session.gameplay.kind === 'ROVER');
    expect(session.survivors.get('survivor-a')?.status).toBe('secured');
    expect(session.missionManager.getObjective('survivor-a')?.status).toBe('completed');
  });

  it('rejects landing when too high', () => {
    const { session, input, run, body, terrain } = ctx;
    run(6);
    input.press('interact');
    run(8, () => session.gameplay.kind === 'FLIGHT');
    const rejected: string[] = [];
    session.events.on('transform:rejected', ({ reason }) => rejected.push(reason));
    body.teleport(-200, terrain.heightAt(-200, 200) + 60, 200, 0);
    run(0.1);
    input.press('interact');
    run(0.1);
    expect(session.gameplay.kind).toBe('FLIGHT');
    expect(rejected[0]).toMatch(/DESCEND/);
  });

  it('fails the mission when the battery is depleted', () => {
    const { session, run } = ctx;
    const failures: string[] = [];
    session.events.on('mission:failed', ({ reason }) => failures.push(reason));
    run(6);
    // Away from the charging pad, otherwise the base would recharge the battery.
    session.debugTeleport(-150, 150);
    session.battery.set(0);
    run(3);
    expect(failures).toEqual(['BATTERY_DEPLETED']);
    expect(session.result?.success).toBe(false);
  });

  it('completes the mission after all objectives and extraction', () => {
    const { session, input, run, body, terrain } = ctx;
    const completed: string[] = [];
    session.events.on('mission:completed', () => completed.push('done'));
    run(6);
    for (const objective of session.missionManager.objectives) {
      if (objective.definition.type !== 'extract' && objective.definition.type !== 'reachZone') {
        objective.status = 'completed';
        objective.progress = 1;
      }
    }
    // Survivors counted as rescued for the report.
    for (const s of session.survivors.survivors) s.status = 'secured';
    session.missionManager.getObjective('reach-extraction')!.status = 'active';
    const [ex, ez] = [-262, 262];
    body.teleport(ex, terrain.heightAt(ex, ez), ez, 0);
    run(1);
    expect(session.missionManager.getObjective('extract')?.status).toBe('active');
    run(4);
    expect(session.gameplay.kind).toBe('CINEMATIC');
    input.press('interact');
    run(6);
    expect(completed).toEqual(['done']);
    expect(session.result?.success).toBe(true);
    expect(session.result?.survivorsRescued).toBe(3);
    expect(session.result?.stars).toBeGreaterThanOrEqual(1);
  });
});
