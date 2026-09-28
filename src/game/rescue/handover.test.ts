import { describe, expect, it } from 'vitest';
import { createPolyline } from '@/utils/math/polyline';
import {
  ambulanceAt,
  createHandoverPlan,
  dispatchUnits,
  doorOpening,
  type HandoverPlan,
  planTransfer,
  sampleKeys,
  scheduleDeparture,
  transferDoneAt,
} from './handover';

// A road running east–west past both the base (west) and the LZ (east).
const road = createPolyline([
  [-400, 40],
  [0, 40],
  [400, 40],
]);
const pose = () => ({ x: 0, z: 0, yaw: 0, speed: 0, accel: 0, s: 0, visible: false });
const PAD = { x: 0, z: 0, radius: 12 };
const BASE = { x: -120, z: 10, radius: 11 };
const patient = (i: number, slotX = 0) => ({ id: `p${i}`, name: `p${i}`, jacket: '#fff', slotX });

function standby(units = 1, roads = [road]): HandoverPlan {
  return createHandoverPlan({ pad: PAD, base: BASE, roads, units });
}

describe('patient handover', () => {
  it('waits parked at the base, lights off, until dispatched', () => {
    const p = standby();
    const u = p.units[0]!;
    const parked = ambulanceAt(p, u, 500, pose());
    expect(parked.speed).toBe(0);
    expect(Math.hypot(parked.x - BASE.x, parked.z - BASE.z)).toBeLessThan(BASE.radius + 20);
    expect(Math.hypot(parked.x - BASE.x, parked.z - BASE.z)).toBeGreaterThan(BASE.radius);
    expect(u.dispatched).toBe(false);
    expect(transferDoneAt(p)).toBe(Infinity);
  });

  it('drives from the base to the edge of the LZ once dispatched', () => {
    const p = standby();
    dispatchUnits(p, [patient(0)], 10);
    const u = p.units[0]!;
    expect(u.start).toBe(10);
    expect(ambulanceAt(p, u, 10, pose()).speed).toBe(0); // pulls away from a standstill
    expect(ambulanceAt(p, u, 10 + u.travel / 2, pose()).speed).toBeGreaterThan(5);
    const arrived = ambulanceAt(p, u, u.arrive + 5, pose());
    expect(arrived.speed).toBe(0);
    const fromPad = Math.hypot(arrived.x - PAD.x, arrived.z - PAD.z);
    expect(fromPad).toBeGreaterThan(PAD.radius);
    expect(fromPad).toBeLessThan(PAD.radius + 5);
  });

  it('keeps doors shut until TerraWing is parked, then runs the transfer', () => {
    const p = standby();
    dispatchUnits(p, [patient(0)], 0);
    const u = p.units[0]!;
    expect(doorOpening(u, u.arrive + 20)).toBe(0);
    planTransfer(p, { x: 1, z: -2, heading: 0.4 }, u.arrive + 20);
    expect(u.doorsOpen).toBeGreaterThanOrEqual(u.arrive + 20);
    const at = sampleKeys(u.trolley, u.liftStart, { t: 0, x: 0, z: 0, yaw: 0, lift: 0 });
    expect(Math.hypot(at.x - 1, at.z + 2)).toBeCloseTo(1.45, 1);
    expect(Number.isFinite(transferDoneAt(p))).toBe(true);
  });

  it('orders every beat for two patients, then departs one after the other', () => {
    const p = standby(2);
    dispatchUnits(p, [patient(0, -0.36), patient(1, 0.36)], 0);
    planTransfer(p, { x: 0, z: 0, heading: 0 }, 3);
    for (const u of p.units) {
      const all = [u.start, u.arrive, u.doorsOpen, u.crewOut, u.liftStart, u.liftEnd];
      all.push(u.canopyOpen, u.canopyClose, u.crewIn, u.doorsClose);
      for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThanOrEqual(all[i - 1]!);
      for (const track of [u.trolley, u.doctor])
        for (let i = 1; i < track.length; i++) expect(track[i]!.t).toBeGreaterThan(track[i - 1]!.t);
    }
    scheduleDeparture(p, transferDoneAt(p) + 3);
    expect(p.units[1]!.depart).toBeGreaterThan(p.units[0]!.depart);
    const u = p.units[0]!;
    const parked = ambulanceAt(p, u, u.depart - 0.1, pose());
    const leaving = ambulanceAt(p, u, u.depart + 6, pose());
    expect(Math.hypot(leaving.x - parked.x, leaving.z - parked.z)).toBeGreaterThan(30);
  });

  it('only sends as many ambulances as there are patients', () => {
    const p = standby(2);
    dispatchUnits(p, [patient(0)], 0);
    expect(p.units[0]!.dispatched).toBe(true);
    expect(p.units[1]!.dispatched).toBe(false);
    planTransfer(p, { x: 0, z: 0, heading: 0 }, 0);
    expect(Number.isFinite(transferDoneAt(p))).toBe(true);
  });

  it('works without any road', () => {
    const p = standby(1, []);
    dispatchUnits(p, [patient(0)], 0);
    const u = p.units[0]!;
    const arrived = ambulanceAt(p, u, u.arrive + 1, pose());
    expect(Math.hypot(arrived.x - PAD.x, arrived.z - PAD.z)).toBeCloseTo(PAD.radius + 2.6, 0);
  });
});
