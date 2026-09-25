import { describe, expect, it } from 'vitest';
import { MOUNTAIN_COLLAPSE } from '@/data/environments/mountainCollapse';
import { TERRAWING_TW1 } from '@/data/vehicles/terrawing';
import { getTerrain } from '@/game/environment/terrainCache';
import { BatterySystem } from './BatterySystem';
import { DamageSystem } from './DamageSystem';
import { HazardSystem, type HazardTransition } from './HazardSystem';
import { InteractionSystem } from './InteractionSystem';
import { SignalSystem } from './SignalSystem';

describe('BatterySystem', () => {
  it('drains faster hovering than flying, and far slower on wheels', () => {
    const rates = (['hover', 'flight', 'rover'] as const).map((activity) => {
      const battery = new BatterySystem(TERRAWING_TW1.battery, 100);
      battery.update(10, { activity, carryingPayload: false, charging: false });
      return 100 - battery.percent;
    });
    expect(rates[0]).toBeGreaterThan(rates[1]!);
    expect(rates[1]).toBeGreaterThan(rates[2]! * 2);
  });

  it('reports threshold crossings once and charges on pads', () => {
    const battery = new BatterySystem(TERRAWING_TW1.battery, 21);
    const levels: string[] = [];
    for (let i = 0; i < 1200; i++) {
      const level = battery.update(0.1, {
        activity: 'hover',
        carryingPayload: true,
        charging: false,
      });
      if (level) levels.push(level);
    }
    expect(levels).toEqual(['warning', 'critical', 'emergency', 'depleted']);
    expect(battery.depleted).toBe(true);
    battery.update(2, { activity: 'idle', carryingPayload: false, charging: true });
    expect(battery.percent).toBeGreaterThan(10);
  });

  it('refuses instant consumption it cannot afford', () => {
    const battery = new BatterySystem(TERRAWING_TW1.battery, 0.5);
    expect(battery.consume(1)).toBe(false);
    expect(battery.percent).toBe(0.5);
  });
});

describe('DamageSystem', () => {
  it('ignores gentle bumps and respects the impact cooldown', () => {
    const damage = new DamageSystem(TERRAWING_TW1.damage);
    expect(damage.applyImpact(3, 'BODY')).toBe(0);
    const dealt = damage.applyImpact(15, 'BODY');
    expect(dealt).toBeGreaterThan(0);
    expect(damage.applyImpact(15, 'BODY')).toBe(0);
    damage.tick(1);
    expect(damage.applyImpact(15, 'BODY')).toBeGreaterThan(0);
    expect(damage.componentIntegrity('BODY')).toBeLessThan(damage.integrity);
  });

  it('classifies integrity levels', () => {
    const damage = new DamageSystem(TERRAWING_TW1.damage);
    expect(damage.apply(45, 'BODY')).toBe('damaged');
    expect(damage.apply(40, 'BODY')).toBe('critical');
    expect(damage.apply(40, 'BODY')).toBe('destroyed');
    expect(damage.destroyed).toBe(true);
  });
});

describe('SignalSystem', () => {
  const terrain = getTerrain(MOUNTAIN_COLLAPSE);
  const create = () =>
    new SignalSystem(MOUNTAIN_COLLAPSE.relay, TERRAWING_TW1.signal, terrain, 0.92);

  it('is strong at the base and weak behind the ridge', () => {
    const signal = create();
    signal.reset(-330, terrain.heightAt(-330, 305), 305);
    expect(signal.state).toBe('good');
    signal.reset(238, terrain.heightAt(238, -166) + 1, -166);
    expect(signal.state).toBe('unstable');
  });

  it('recovers line of sight when climbing', () => {
    const signal = create();
    signal.reset(238, terrain.heightAt(238, -166) + 1, -166);
    const low = signal.percent;
    signal.reset(238, terrain.heightAt(238, -166) + 150, -166);
    expect(signal.percent).toBeGreaterThan(low + 20);
    expect(signal.state).toBe('good');
  });
});

describe('HazardSystem', () => {
  it('only damages the modes listed in the hazard', () => {
    const hazards = new HazardSystem([
      {
        id: 'rockfall',
        kind: 'rockfall',
        label: 'ROCKFALL',
        position: [0, 0],
        radius: 10,
        damagePerSecond: { FLIGHT: 4, ROVER: 0 },
        warning: 'x',
      },
    ]);
    const transitions: HazardTransition[] = [];
    expect(hazards.update(0, 0, 'FLIGHT', transitions)).toBe(4);
    expect(transitions).toHaveLength(1);
    expect(hazards.update(0, 0, 'ROVER', transitions)).toBe(0);
    expect(transitions).toHaveLength(0);
    hazards.update(50, 0, 'ROVER', transitions);
    expect(transitions[0]?.entered).toBe(false);
  });
});

describe('InteractionSystem', () => {
  const make = (onComplete: () => void) => ({
    id: 'secure:a',
    label: 'ASSIST',
    progressLabel: 'WORKING',
    position: { x: 0, y: 0, z: 0 },
    radius: 8,
    duration: 1,
    requiresMode: 'ROVER' as const,
    isAvailable: () => true,
    onComplete,
  });

  it('explains why an interaction is blocked', () => {
    const system = new InteractionSystem();
    system.register(make(() => undefined));
    system.updatePrompt(10, 5, 0, 'FLIGHT', false);
    expect(system.prompt?.blockedReason).toBe('LAND AND TRANSFORM TO ROVER');
    system.updatePrompt(12, 0, 0, 'ROVER', true);
    expect(system.prompt).toBeNull();
    system.updatePrompt(4, 0, 0, 'ROVER', true);
    expect(system.prompt?.blockedReason).toBeNull();
  });

  it('runs a timed interaction to completion', () => {
    let completed = 0;
    const system = new InteractionSystem();
    system.register(make(() => completed++));
    system.updatePrompt(2, 0, 0, 'ROVER', true);
    expect(system.tryStart()?.id).toBe('secure:a');
    expect(system.update(0.5)).toBeNull();
    expect(system.progress).toBeCloseTo(0.5);
    expect(system.update(0.6)?.id).toBe('secure:a');
    expect(completed).toBe(1);
  });
});
