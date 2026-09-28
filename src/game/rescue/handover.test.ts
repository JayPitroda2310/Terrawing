import { describe, expect, it } from 'vitest';
import { createPolyline } from '@/utils/math/polyline';
import {
  ambulanceAt,
  createHandoverPlan,
  doorOpening,
  type HandoverPlan,
  planTransfer,
  sampleKeys,
  scheduleDeparture,
  transferDoneAt,
} from './handover';

const road = createPolyline([
  [-300, 40],
  [0, 40],
  [300, 40],
]);
const pose = () => ({ x: 0, z: 0, yaw: 0, speed: 0, accel: 0, s: 0, visible: false });
const PAD = { x: 0, z: 0, radius: 12 };

function dispatch(patients = 1, roads = [road]): HandoverPlan {
  return createHandoverPlan({
    pad: PAD,
    roads,
    patients: Array.from({ length: patients }, (_, i) => ({
      id: `p${i}`,
      name: `p${i}`,
      jacket: '#fff',
      slotX: patients === 1 ? 0 : i === 0 ? -0.36 : 0.36,
    })),
  });
}

describe('patient handover', () => {
  it('races in and parks at the edge of the pad, facing along the road', () => {
    const p = dispatch();
    const u = p.units[0]!;
    const arriving = ambulanceAt(p, u, u.start + 0.5, pose());
    expect(arriving.speed).toBeGreaterThan(15);
    const parked = ambulanceAt(p, u, u.arrive + 10, pose());
    expect(parked.speed).toBe(0);
    expect(Math.hypot(parked.x, parked.z)).toBeGreaterThan(PAD.radius);
    expect(Math.hypot(parked.x, parked.z)).toBeLessThan(PAD.radius + 5);
    expect(parked.z).toBeGreaterThan(0); // road side
  });

  it('waits with doors shut until TerraWing is parked, then runs the transfer', () => {
    const p = dispatch();
    const u = p.units[0]!;
    expect(doorOpening(u, u.arrive + 20)).toBe(0);
    expect(transferDoneAt(p)).toBe(Infinity);
    planTransfer(p, { x: 1, z: -2, heading: 0.4 }, u.arrive + 20);
    expect(u.doorsOpen).toBeGreaterThanOrEqual(u.arrive + 20);
    const at = sampleKeys(u.trolley, u.liftStart, { t: 0, x: 0, z: 0, yaw: 0, lift: 0 });
    expect(Math.hypot(at.x - 1, at.z + 2)).toBeCloseTo(1.45, 1);
    expect(Number.isFinite(transferDoneAt(p))).toBe(true);
  });

  it('orders every beat and keyframe for two patients, then departs one after the other', () => {
    const p = dispatch(2);
    planTransfer(p, { x: 0, z: 0, heading: 0 }, 3);
    for (const u of p.units) {
      const beats = [u.start, u.arrive, u.doorsOpen, u.crewOut, u.liftStart, u.liftEnd];
      const all = [...beats, u.canopyOpen, u.canopyClose, u.crewIn, u.doorsClose];
      for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThanOrEqual(all[i - 1]!);
      for (const track of [u.trolley, u.doctor])
        for (let i = 1; i < track.length; i++) expect(track[i]!.t).toBeGreaterThan(track[i - 1]!.t);
      expect(u.depart).toBe(Infinity);
    }
    const done = transferDoneAt(p);
    scheduleDeparture(p, done + 3);
    expect(p.units[1]!.depart).toBeGreaterThan(p.units[0]!.depart);
    const u = p.units[0]!;
    const parked = ambulanceAt(p, u, u.depart - 0.1, pose());
    const leaving = ambulanceAt(p, u, u.depart + 6, pose());
    expect(Math.hypot(leaving.x - parked.x, leaving.z - parked.z)).toBeGreaterThan(30);
  });

  it('works without any road nearby', () => {
    const p = dispatch(1, []);
    const u = p.units[0]!;
    const parked = ambulanceAt(p, u, u.arrive + 1, pose());
    expect(Math.hypot(parked.x, parked.z)).toBeCloseTo(PAD.radius + 2.6, 0);
  });
});
