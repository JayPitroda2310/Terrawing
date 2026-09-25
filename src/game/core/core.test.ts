import { describe, expect, it } from 'vitest';
import { TERRAWING_TW1 } from '@/data/vehicles/terrawing';
import { DEFAULT_KEY_BINDINGS } from '@/game/input/actions';
import { InputManager } from '@/game/input/InputManager';
import { Scanner, type ScanDetection } from '@/game/scanner/Scanner';
import type { ScannerTarget } from '@/game/scanner/ScannerTarget';
import { canTransition, GameplayStateMachine, Screen } from './GameState';

describe('screen state machine', () => {
  it('allows the main flow and rejects nonsense transitions', () => {
    expect(canTransition(Screen.MAIN_MENU, Screen.MISSION_BRIEFING)).toBe(true);
    expect(canTransition(Screen.MISSION_BRIEFING, Screen.LOADING)).toBe(true);
    expect(canTransition(Screen.LOADING, Screen.PLAYING)).toBe(true);
    expect(canTransition(Screen.PLAYING, Screen.PAUSED)).toBe(true);
    expect(canTransition(Screen.PAUSED, Screen.LOADING)).toBe(true);
    expect(canTransition(Screen.MAIN_MENU, Screen.PLAYING)).toBe(false);
    expect(canTransition(Screen.CREDITS, Screen.PLAYING)).toBe(false);
  });
});

describe('GameplayStateMachine', () => {
  it('guards transitions and notifies listeners', () => {
    const machine = new GameplayStateMachine({ kind: 'ROVER' });
    const seen: string[] = [];
    machine.subscribe((next) => seen.push(next.kind));
    expect(machine.transition({ kind: 'TRANSFORMING', direction: 'toFlight' })).toBe(true);
    expect(machine.transition({ kind: 'INTERACTING', interactionId: 'x', resume: 'ROVER' })).toBe(
      false,
    );
    expect(machine.transition({ kind: 'FLIGHT' })).toBe(true);
    expect(seen).toEqual(['TRANSFORMING', 'FLIGHT']);
  });
});

describe('Scanner', () => {
  const target = (id: string, x: number, persistent = true): ScannerTarget => ({
    id,
    category: 'SURVIVOR',
    label: id,
    identity: id,
    position: { x, y: 0, z: 0 },
    persistent,
    discovered: false,
    classified: false,
    lastPing: -Infinity,
    active: true,
  });

  it('detects targets as the wavefront reaches them and classifies only nearby ones', () => {
    const scanner = new Scanner(TERRAWING_TW1.scanner);
    scanner.addTarget(target('near', 50));
    scanner.addTarget(target('far', 200));
    scanner.addTarget(target('outside', 400));
    expect(scanner.tryPulse(0, 0, 0, true)).toBeNull();
    expect(scanner.tryPulse(0, 0, 0, true)).toBe('cooldown');
    const found: string[] = [];
    const out: ScanDetection[] = [];
    for (let t = 0; t < 3; t += 0.05)
      for (const d of scanner.update(0.05, t, true, out)) found.push(d.target.id);
    expect(found).toEqual(['near', 'far']);
    expect(scanner.getTarget('near')?.classified).toBe(true);
    expect(scanner.getTarget('far')?.classified).toBe(false);
    expect(scanner.accuracy).toBe(100);
  });

  it('counts pulses that find nothing new against accuracy', () => {
    const scanner = new Scanner(TERRAWING_TW1.scanner);
    const out: ScanDetection[] = [];
    scanner.tryPulse(0, 0, 0, true);
    for (let t = 0; t < 6; t += 0.1) scanner.update(0.1, t, true, out);
    scanner.tryPulse(0, 0, 0, true);
    scanner.update(2, 7, true, out);
    expect(scanner.accuracy).toBe(0);
  });
});

describe('InputManager', () => {
  it('maps rebindable keys to actions and ignores input while disabled', () => {
    const input = new InputManager();
    input.attach();
    const down = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const up = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    const axes = { throttle: 0, steer: 0, lift: 0, brake: false };

    down('KeyW');
    expect(input.sampleAxes(axes).throttle).toBe(1);
    up('KeyW');

    input.setBindings({ ...DEFAULT_KEY_BINDINGS, forward: ['KeyI'] });
    down('KeyI');
    expect(input.sampleAxes(axes).throttle).toBe(1);
    up('KeyI');

    down('KeyQ');
    expect(input.consumePressed('scan')).toBe(true);
    expect(input.consumePressed('scan')).toBe(false);

    input.setEnabled(false);
    down('KeyI');
    expect(input.sampleAxes(axes).throttle).toBe(0);
    input.detach();
  });
});
