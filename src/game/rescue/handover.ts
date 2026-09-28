import {
  createPolyline,
  createProjection,
  type Polyline,
  projectOnPolyline,
  samplePolyline,
  type Vec2Tuple,
} from '@/utils/math/polyline';
import { smoothstep } from '@/utils/math/scalar';

/**
 * Patient handover at the extraction LZ, as a deterministic timeline in two stages:
 *
 * 1. Dispatch (`createHandoverPlan`), as TerraWing enters the LZ with casualties aboard: an
 *    ambulance per patient races in (road, then off-road to the pad's edge) and waits.
 * 2. Transfer (`planTransfer`), once TerraWing is down and parked in rover mode: a doctor and
 *    two nurses roll a stretcher trolley over, lift the casualty capsule onto it, the doctor
 *    assesses the patient, and the trolley is loaded. This plays out live, in gameplay.
 *
 * The ambulances leave for hospital when the mission completes (`scheduleDeparture`) — that
 * part is the closing cinematic. Everything is a function of the handover clock, so visuals,
 * camera and audio agree exactly.
 *
 * Conventions: positions are world XZ; `yaw` is a three.js Y rotation for models whose front
 * faces +Z (direction (dx, dz) ↔ yaw = atan2(dx, dz)).
 */

export interface HandoverPatient {
  id: string;
  name: string;
  jacket: string;
  /** Capsule slot across TerraWing's roof rack (local X). */
  slotX: number;
}

/** What a crew member is doing on a keyframe (drives their arms and posture). */
export type CrewPose = 'walk' | 'push' | 'pull' | 'reach' | 'assess' | 'stand';

export interface Key {
  t: number;
  x: number;
  z: number;
  yaw: number;
  /** Height above the ground (trolley deck inside the ambulance). */
  lift: number;
  /** Crew pose from this key until the next. */
  pose?: CrewPose;
  /** The mover comes to rest here (eased); false = keeps moving through (a waypoint). */
  stop?: boolean;
}

export interface HandoverUnit {
  patient: HandoverPatient;
  /** Sent to the LZ (otherwise waiting on standby at the base). */
  dispatched: boolean;
  /** Route distance where it waits parked at the base, and the drive time from there to the LZ. */
  sParked: number;
  travel: number;
  /** Ambulance: distance along the route where it parks, and when it sets off / arrives. */
  sStop: number;
  start: number;
  arrive: number;
  /** When it leaves for hospital (Infinity until the mission completes). */
  depart: number;
  /** Transfer timeline (valid once `planned`). */
  planned: boolean;
  doorsOpen: number;
  doorsClose: number;
  crewOut: number;
  crewIn: number;
  liftStart: number;
  liftEnd: number;
  canopyOpen: number;
  canopyClose: number;
  /** Capsule position across TerraWing's roof rack (its local X, m). */
  slotX: number;
  trolley: Key[];
  /** Nurse tracks: [lead (pulls at the front), second (pushes)]. */
  nurses: [Key[], Key[]];
  doctor: Key[];
}

export interface HandoverPlan {
  route: Polyline;
  /** TerraWing's parked pose for the transfer (set by `planTransfer`). */
  drover: { x: number; z: number; heading: number };
  /** Unit vector from the pad toward the ambulances' parking line. */
  toward: { x: number; z: number };
  units: HandoverUnit[];
  /** Bumped when units are dispatched (views re-read patients). */
  version: number;
  /** Handover clock time at which everything has left (Infinity until departure is scheduled). */
  duration: number;
}

const DEPART_ACCEL = 2.6;
const DEPART_MAX_SPEED = 17;
export const DEPART_TIME = 6.5;
/** Ambulance centre → rear doors, trolley half length, door swing time. */
export const AMBULANCE_REAR = 3.35;
export const TROLLEY_HALF = 1.05;
export const DOOR_SWING = 0.8;
/** Brisk emergency pace: pushing a loaded stretcher, and the doctor walking. */
const PUSH = 1.8;
const DOC_WALK = 2.1;
/** Capsule deck height on the trolley, and the ambulance's floor above the ground. */
export const TROLLEY_DECK = 0.92;
export const BOX_FLOOR = 0.86;
/** Lateral stand-off of the trolley from TerraWing's centreline while transferring. */
const BESIDE = 1.45;
/** A second ambulance parks this far behind the first. */
const CONVOY_GAP = 9;
const ROAD_SEARCH = 220;
/** Two capsules sit side by side on the roof rack this far off the centreline. */
export const SLOT_X = 0.36;

const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

type P = { x: number; z: number };
const add = (p: P, dir: P, k: number): P => ({ x: p.x + dir.x * k, z: p.z + dir.z * k });
const dist = (p: P, q: P) => Math.hypot(q.x - p.x, q.z - p.z);
const unit_ = (from: P, to: P): P => {
  const d = dist(from, to) || 1;
  return { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
};

/** Cubic Bézier from a (tangent ta) to b (tangent tb), sampled into points. */
function bezier(
  ax: number,
  az: number,
  tax: number,
  taz: number,
  bx: number,
  bz: number,
  tbx: number,
  tbz: number,
  reach: number,
  steps = 14,
): Vec2Tuple[] {
  const c1x = ax + tax * reach;
  const c1z = az + taz * reach;
  const c2x = bx - tbx * reach;
  const c2z = bz - tbz * reach;
  const out: Vec2Tuple[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx,
      u * u * u * az + 3 * u * u * t * c1z + 3 * u * t * t * c2z + t * t * t * bz,
    ]);
  }
  return out;
}

/** Point `distance` along a polyline from `s` (extrapolated straight past either end). */
function pointAlong(line: Polyline, s: number): { x: number; z: number; dx: number; dz: number } {
  const out = { x: 0, z: 0 };
  const eps = 0.5;
  const clampS = Math.max(0, Math.min(line.length, s));
  samplePolyline(line, clampS / line.length, out);
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 0 };
  samplePolyline(line, Math.max(0, clampS - eps) / line.length, a);
  samplePolyline(line, Math.min(line.length, clampS + eps) / line.length, b);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const dx = (b.x - a.x) / len;
  const dz = (b.z - a.z) / len;
  const over = s - clampS;
  return { x: out.x + dx * over, z: out.z + dz * over, dx, dz };
}

export interface HandoverInput {
  /** Centre and radius of the extraction pad the ambulances park beside. */
  pad: { x: number; z: number; radius: number };
  /** The rescue base, where the ambulances wait on standby. */
  base: { x: number; z: number; radius: number };
  /** Park beside this (the medical tent) rather than on a ring round the base centre. */
  parkNear?: { x: number; z: number };
  /** Road centrelines (world XZ); the nearest to the pad is used. Empty → cross-country. */
  roads: readonly Polyline[];
  /** How many ambulances are on standby (one per casualty expected to need transport). */
  units: number;
  /** Structures the route must steer round (centre and clearance radius). */
  avoid?: readonly { x: number; z: number; r: number }[];
  /** Is this a good place to park (flat, dry, clear of tents and buildings)? */
  isClear?: (x: number, z: number) => boolean;
}

const STANDBY_PATIENT: HandoverPatient = { id: '', name: '', jacket: '#c0492a', slotX: 0 };

/**
 * Standby parking at the base: a clear spot on a ring round the base centre, preferring the side
 * facing the LZ, with the ambulances nose-to-tail pointing the way they will leave.
 */
function chooseParking(
  base: HandoverInput['base'],
  toward: { x: number; z: number },
  length: number,
  isClear: (x: number, z: number) => boolean,
): { x: number; z: number; fx: number; fz: number } {
  const lead = Math.atan2(toward.z - base.z, toward.x - base.x);
  let best: { x: number; z: number; fx: number; fz: number } | null = null;
  let bestScore = -Infinity;
  const rings =
    base.radius === 0 ? [7.5, 9.5, 12] : [base.radius + 7, base.radius + 11, base.radius + 16];
  for (const radius of rings) {
    for (let k = 0; k < 24; k++) {
      const angle = lead + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);
      const x = base.x + Math.cos(angle) * radius;
      const z = base.z + Math.sin(angle) * radius;
      // Point the column tangentially, turning toward the LZ side.
      const tx = -Math.sin(angle);
      const tz = Math.cos(angle);
      const sign = tx * (toward.x - x) + tz * (toward.z - z) >= 0 ? 1 : -1;
      const fx = tx * sign;
      const fz = tz * sign;
      let clear = true;
      for (let d = -length; d <= 4 && clear; d += 2)
        for (const side of [-1.4, 0, 1.4])
          if (!isClear(x + fx * d - fz * side, z + fz * d + fx * side)) clear = false;
      if (!clear) continue;
      const facing = Math.cos(angle - lead);
      const score = facing * 2 - radius * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, fx, fz };
      }
    }
  }
  if (best) return best;
  const d = Math.hypot(toward.x - base.x, toward.z - base.z) || 1;
  const fx = (toward.x - base.x) / d;
  const fz = (toward.z - base.z) / d;
  return { x: base.x + fx * (base.radius + 8), z: base.z + fz * (base.radius + 8), fx, fz };
}

/**
 * Standby: the ambulances parked at the base, and their route to the LZ (out of the base, along
 * the road, into the pad's edge) and on to hospital. Nobody moves until `dispatchUnits`.
 */
export function createHandoverPlan(input: HandoverInput): HandoverPlan {
  const { pad, base } = input;
  const count = Math.max(1, Math.min(2, input.units));
  const projection = createProjection();
  let best: { line: Polyline; s: number; x: number; z: number; d: number } | null = null;
  for (const line of input.roads) {
    projectOnPolyline(line, pad.x, pad.z, projection);
    if (projection.distance < ROAD_SEARCH && (!best || projection.distance < best.d)) {
      best = {
        line,
        s: projection.t * line.length,
        x: projection.x,
        z: projection.z,
        d: projection.distance,
      };
    }
  }

  // Parking spot at the pad's edge, on the road side (or the base side with no road).
  let ux: number;
  let uz: number;
  if (best && best.d > 1) {
    ux = (best.x - pad.x) / best.d;
    uz = (best.z - pad.z) / best.d;
  } else {
    const d = Math.hypot(base.x - pad.x, base.z - pad.z) || 1;
    ux = (base.x - pad.x) / d;
    uz = (base.z - pad.z) / d;
  }
  // Drive right up onto the pad, like a crew meeting an aircraft: close enough that the stretcher
  // run is short, clear of wherever TerraWing sets down near the marker.
  const edge = pad.radius * 0.6;
  const standOff = best ? Math.min(edge, Math.max(4, best.d - 1)) : edge;
  const px = pad.x + ux * standOff;
  const pz = pad.z + uz * standOff;

  const column = (count - 1) * CONVOY_GAP;
  const anchor = input.parkNear ? { x: input.parkNear.x, z: input.parkNear.z, radius: 0 } : base;
  const parking = chooseParking(anchor, pad, column + 7, input.isClear ?? (() => true));
  // The rear-most ambulance starts the route; the lead one is `column` metres further on.
  const startX = parking.x - parking.fx * column;
  const startZ = parking.z - parking.fz * column;

  const points: Vec2Tuple[] = [[startX, startZ]];
  if (column > 0) points.push([parking.x, parking.z]);
  let fx: number;
  let fz: number;
  const join = createProjection();
  if (best) projectOnPolyline(best.line, parking.x, parking.z, join);
  const sJoin = best ? join.t * best.line.length : 0;
  const lead = best ? 22 + best.d * 0.4 : 0;
  const dir = best ? (best.s >= sJoin ? 1 : -1) : 1;
  const inS = best ? best.s - dir * lead : 0;
  const outS = best ? best.s + dir * lead : 0;
  if (best && best.d > standOff + 2 && (inS - sJoin) * dir > 16 && join.distance < 90) {
    // Out of the base onto the road, along it, into the LZ; afterwards back to the road and on.
    const on = pointAlong(best.line, sJoin + dir * 10);
    points.push(
      ...bezier(
        parking.x,
        parking.z,
        parking.fx,
        parking.fz,
        on.x,
        on.z,
        on.dx * dir,
        on.dz * dir,
        Math.max(6, join.distance * 0.7),
      ),
    );
    for (let s = sJoin + dir * 16; (inS - s) * dir > 0; s += dir * 6) {
      const p = pointAlong(best.line, s);
      points.push([p.x, p.z]);
    }
    const a = pointAlong(best.line, inS);
    const b = pointAlong(best.line, outS);
    const here = pointAlong(best.line, best.s);
    fx = here.dx * dir;
    fz = here.dz * dir;
    const reach = Math.max(6, best.d * 0.6);
    points.push(...bezier(a.x, a.z, a.dx * dir, a.dz * dir, px, pz, fx, fz, reach));
    points.push(...bezier(px, pz, fx, fz, b.x, b.z, b.dx * dir, b.dz * dir, reach));
    for (let s = outS + dir * 6; (outS + dir * 220 - s) * dir > 0; s += dir * 6) {
      const p = pointAlong(best.line, s);
      points.push([p.x, p.z]);
    }
  } else {
    // Cross-country: straight from the base to the pad's edge, then onward.
    const d = Math.hypot(px - parking.x, pz - parking.z) || 1;
    fx = (px - parking.x) / d;
    fz = (pz - parking.z) / d;
    points.push(...bezier(parking.x, parking.z, parking.fx, parking.fz, px, pz, fx, fz, d * 0.4));
    for (let s = 6; s <= 220; s += 6) points.push([px + fx * s, pz + fz * s]);
  }
  // Steer round base structures (masts, containers, tents): push route points clear of them.
  for (const point of points) {
    for (const o of input.avoid ?? []) {
      const dx = point[0] - o.x;
      const dz = point[1] - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r && d > 1e-3) {
        (point as [number, number])[0] = o.x + (dx / d) * o.r;
        (point as [number, number])[1] = o.z + (dz / d) * o.r;
      }
    }
  }
  const route = createPolyline(points);
  const park = createProjection();
  projectOnPolyline(route, px, pz, park);
  const sPark = park.t * route.length;

  const units = Array.from({ length: count }, (_, k): HandoverUnit => {
    const sParked = (count - 1 - k) * CONVOY_GAP;
    const sStop = sPark - k * CONVOY_GAP;
    return {
      patient: STANDBY_PATIENT,
      dispatched: false,
      sParked,
      sStop,
      travel: travelTime(sStop - sParked),
      start: Infinity,
      arrive: Infinity,
      depart: Infinity,
      planned: false,
      doorsOpen: Infinity,
      doorsClose: Infinity,
      crewOut: Infinity,
      crewIn: Infinity,
      liftStart: Infinity,
      liftEnd: Infinity,
      canopyOpen: Infinity,
      canopyClose: Infinity,
      slotX: 0,
      trolley: [],
      nurses: [[], []],
      doctor: [],
    };
  });
  return {
    route,
    drover: { x: pad.x, z: pad.z, heading: 0 },
    toward: { x: ux, z: uz },
    units,
    version: 0,
    duration: Infinity,
  };
}

/** Drive profile from standstill: accelerate, cruise, brake to a stop over `distance` metres. */
const DRIVE = { accel: 2.4, cruise: 15, brake: 3.6 };

function driveProfile(distance: number) {
  const { accel, brake } = DRIVE;
  let v = DRIVE.cruise;
  if ((v * v) / (2 * accel) + (v * v) / (2 * brake) > distance)
    v = Math.sqrt((2 * distance * accel * brake) / (accel + brake));
  const tAcc = v / accel;
  const tDec = v / brake;
  const dAcc = (v * v) / (2 * accel);
  const dDec = (v * v) / (2 * brake);
  const tCruise = Math.max(0, (distance - dAcc - dDec) / v);
  return { v, tAcc, tCruise, tDec, dAcc };
}

function travelTime(distance: number): number {
  const p = driveProfile(Math.max(1, distance));
  return p.tAcc + p.tCruise + p.tDec;
}

/**
 * Sends the standby ambulances to the LZ, one per casualty aboard, a moment apart. Any extra
 * ambulance stays parked.
 */
export function dispatchUnits(
  plan: HandoverPlan,
  patients: readonly HandoverPatient[],
  now: number,
): void {
  patients.slice(0, plan.units.length).forEach((patient, k) => {
    const unit = plan.units[k]!;
    unit.patient = patient;
    unit.slotX = patient.slotX;
    unit.dispatched = true;
    unit.start = now + k * 1.5;
    unit.arrive = unit.start + unit.travel;
  });
  plan.version++;
}

/**
 * Transfer choreography, once TerraWing is parked at `drover` (handover clock `now`). Each crew
 * member has their own keyframed track with a pose per move, so what they do matches what they
 * are trying to do:
 *
 * 1. Rear doors swing open; both nurses step down out of the back, the doctor follows.
 * 2. One nurse pulls the stretcher out, walking backwards facing it; the other guides.
 * 3. They roll it briskly to TerraWing — lead nurse pulling at the front, the other pushing —
 *    while the doctor goes ahead to the patient's head.
 * 4. The stretcher parks alongside; the nurses take stations on its far side, reach up to the
 *    capsule's handles and draw it across and down onto the stretcher, stepping back as it comes.
 * 5. The canopy opens and the doctor checks the patient; the canopy closes.
 * 6. They roll it back and slide it in: one nurse climbs in first to guide, the other pushes and
 *    climbs in last, the doctor gets in, and the doors shut.
 */
export function planTransfer(
  plan: HandoverPlan,
  drover: { x: number; z: number; heading: number },
  now: number,
): void {
  plan.drover = { ...drover };
  const axisYaw = -drover.heading; // TerraWing's own model yaw (its nose faces -Z locally).
  const a: P = { x: Math.sin(drover.heading), z: -Math.cos(drover.heading) };
  // TerraWing's lateral (local +X) direction, signed toward the ambulances.
  let side: P = { x: -a.z, z: a.x };
  let flip = 1;
  if (side.x * plan.toward.x + side.z * plan.toward.z < 0) {
    side = { x: -side.x, z: -side.z };
    flip = -1;
  }
  const D: P = { x: drover.x, z: drover.z };

  plan.units.forEach((unit, k) => {
    if (!unit.dispatched) return;
    const at = pointAlong(plan.route, unit.sStop);
    const d: P = { x: at.dx, z: at.dz };
    const l: P = { x: d.z, z: -d.x };
    const vehicleYaw = yawOf(d.x, d.z);
    const rear = add({ x: at.x, z: at.z }, d, -AMBULANCE_REAR);
    const inside = add(rear, d, TROLLEY_HALF + 0.25);
    const outside = add(rear, d, -(TROLLEY_HALF + 1.1));
    // Work from the side of TerraWing the capsule is on (the ambulance side when centred).
    const sign = unit.slotX * flip < -0.01 ? -1 : 1;
    const s: P = { x: side.x * sign, z: side.z * sign };
    const beside = add(D, s, BESIDE);
    const approach = add(beside, s, 2.0);
    const via: P[] =
      sign > 0 ? [] : [add(add(D, a, -3.4), side, 2.4), add(add(D, a, -3.4), side, -2.4)];
    const facing = (p: P) => yawOf(p.x, p.z);
    const back: P = { x: -s.x, z: -s.z };
    const minusA: P = { x: -a.x, z: -a.z };
    const END = TROLLEY_HALF + 0.35;

    const trolley: Key[] = [];
    const n1: Key[] = [];
    const n2: Key[] = [];
    const doc: Key[] = [];
    const put = (
      track: Key[],
      t: number,
      p: P,
      yaw: number,
      lift = 0,
      pose: CrewPose = 'walk',
      stop = true,
    ) => track.push({ t, x: p.x, z: p.z, yaw, lift, pose, stop });

    const t0 = Math.max(unit.arrive, now) + k * 0.6;
    const doorsOpen = t0 + 0.2;
    const crewOut = doorsOpen + 0.35;

    // 1. Step down out of the back.
    put(n1, crewOut, add(add(rear, d, 0.6), l, 0.42), vehicleYaw + Math.PI, BOX_FLOOR);
    put(n2, crewOut + 0.1, add(add(rear, d, 0.6), l, -0.42), vehicleYaw + Math.PI, BOX_FLOOR);
    const puller = add(rear, d, -0.1);
    put(n1, crewOut + 0.6, puller, vehicleYaw, 0, 'push');
    const guide = add(add(rear, d, -0.7), l, -1.05);
    put(n2, crewOut + 0.8, guide, facing(l), 0, 'stand');

    // 2. Stretcher out: pulled backwards out of the compartment.
    const tS = crewOut + 0.65;
    put(trolley, tS, inside, vehicleYaw, BOX_FLOOR);
    put(n1, tS, puller, vehicleYaw, 0, 'push');
    const tOut = tS + 1.0;
    put(trolley, tOut, outside, vehicleYaw, 0);
    put(n1, tOut, add(outside, d, -END), vehicleYaw, 0, 'push');
    put(n2, tOut, guide, facing(l), 0, 'stand');

    // 3. Roll it to TerraWing. Swivel toward the first leg, take ends, go.
    const legs = [...via, approach];
    const u0 = unit_(outside, legs[0]!);
    let t = tOut + 0.5;
    put(trolley, t, outside, facing(u0));
    put(n1, t, add(outside, u0, END), facing(u0), 0, 'pull');
    put(n2, t, add(outside, u0, -END), facing(u0), 0, 'push');
    let from = outside;
    legs.forEach((p, i) => {
      const u = unit_(from, p);
      t += Math.max(0.6, dist(from, p) / PUSH);
      const last = i === legs.length - 1;
      put(trolley, t, p, facing(u), 0, 'walk', last);
      put(n1, t, add(p, u, END), facing(u), 0, 'pull', last);
      put(n2, t, add(p, u, -END), facing(u), 0, 'push', last);
      from = p;
    });
    // Crab it in alongside TerraWing, lined up with it.
    t += Math.max(0.9, dist(approach, beside) / PUSH);
    const tBeside = t;
    put(trolley, t, beside, axisYaw);
    put(n1, t, add(beside, a, END), facing(minusA), 0, 'push');
    put(n2, t, add(beside, a, -END), facing(a), 0, 'push');

    // 4. Stations on the far side, reach up, draw the capsule across and down onto the deck.
    const station1 = add(add(beside, s, 0.72), a, 0.55);
    const station2 = add(add(beside, s, 0.72), a, -0.55);
    put(n1, t + 0.7, station1, facing(back), 0, 'stand');
    put(n2, t + 0.7, station2, facing(back), 0, 'stand');
    const liftStart = tBeside + 0.9;
    const liftEnd = liftStart + 2.0;
    put(n1, liftStart, station1, facing(back), 0, 'reach');
    put(n2, liftStart, station2, facing(back), 0, 'reach');
    put(n1, liftEnd, add(station1, s, 0.25), facing(back), 0, 'reach');
    put(n2, liftEnd, add(station2, s, 0.25), facing(back), 0, 'reach');

    // 5. Doctor's check under the open canopy.
    const canopyOpen = liftEnd + 0.2;
    const canopyClose = canopyOpen + 3.2;
    put(n1, liftEnd + 0.4, add(station1, s, 0.25), facing(back), 0, 'stand');
    put(n2, liftEnd + 0.4, add(station2, s, 0.25), facing(back), 0, 'stand');
    const tReturn = canopyClose + 0.9;
    put(n1, tReturn, add(station1, s, 0.25), facing(back), 0, 'stand');
    put(n2, tReturn, add(station2, s, 0.25), facing(back), 0, 'stand');

    // 6. Back out alongside, then roll home and slide it in.
    t = tReturn + 0.6;
    put(trolley, t, beside, axisYaw);
    put(n1, t, add(beside, a, END), facing(minusA), 0, 'push');
    put(n2, t, add(beside, a, -END), facing(a), 0, 'push');
    t += Math.max(0.9, dist(beside, approach) / PUSH);
    put(trolley, t, approach, axisYaw);
    put(n1, t, add(approach, a, END), facing(minusA), 0, 'push');
    put(n2, t, add(approach, a, -END), facing(a), 0, 'push');
    const home = [...via.slice().reverse(), outside];
    from = approach;
    const uBack = unit_(approach, home[0]!);
    t += 0.5;
    put(trolley, t, approach, facing(uBack));
    put(n1, t, add(approach, uBack, END), facing(uBack), 0, 'pull');
    put(n2, t, add(approach, uBack, -END), facing(uBack), 0, 'push');
    home.forEach((p, i) => {
      const u = unit_(from, p);
      t += Math.max(0.6, dist(from, p) / PUSH);
      const last = i === home.length - 1;
      put(trolley, t, p, facing(u), 0, 'walk', last);
      put(n1, t, add(p, u, END), facing(u), 0, 'pull', last);
      put(n2, t, add(p, u, -END), facing(u), 0, 'push', last);
      from = p;
    });
    // Line up behind the doors: lead nurse steps up into the back, the other pushes it in.
    t += 0.6;
    put(trolley, t, outside, vehicleYaw);
    put(n1, t, add(rear, d, -0.3), vehicleYaw + Math.PI, 0, 'push');
    put(n2, t, add(outside, d, -END), vehicleYaw, 0, 'push');
    put(n1, t + 0.5, add(rear, d, 0.9), vehicleYaw + Math.PI, BOX_FLOOR, 'push');
    const tIn = t + 1.1;
    put(trolley, tIn, inside, vehicleYaw, BOX_FLOOR);
    put(n1, tIn, add(add(rear, d, 2.4), l, 0.5), vehicleYaw + Math.PI, BOX_FLOOR, 'stand');
    put(n2, tIn, add(rear, d, -0.1), vehicleYaw, 0, 'push');
    put(n2, tIn + 0.5, add(add(rear, d, 0.6), l, -0.45), vehicleYaw, BOX_FLOOR, 'walk');

    // Doctor: out behind the nurses, ahead to the patient's head, check, and back in last.
    const doorSide = add(add(rear, d, -0.8), l, 1.15);
    put(doc, crewOut + 0.25, add(rear, d, 1.1), vehicleYaw + Math.PI, BOX_FLOOR);
    put(doc, crewOut + 0.95, doorSide, vehicleYaw + Math.PI, 0);
    const head = add(add(beside, a, TROLLEY_HALF + 0.45), s, 0.05);
    let td = crewOut + 0.95;
    from = doorSide;
    [...via, head].forEach((p, i, all) => {
      td += Math.max(0.5, dist(from, p) / DOC_WALK);
      put(doc, td, p, facing(unit_(from, p)), 0, 'walk', i === all.length - 1);
      from = p;
    });
    td = Math.max(td + 0.4, liftStart - 0.5);
    put(doc, td, head, facing(minusA), 0, 'stand');
    const tAssess = Math.max(td + 0.1, canopyOpen - 0.2);
    put(doc, tAssess, head, facing(minusA), 0, 'assess');
    const tDone = Math.max(tAssess + 0.3, canopyClose + 0.3);
    put(doc, tDone, head, facing(minusA), 0, 'stand');
    td = tDone + 0.3;
    from = head;
    [...via.slice().reverse(), doorSide].forEach((p, i, all) => {
      td += Math.max(0.5, dist(from, p) / DOC_WALK);
      put(doc, td, p, facing(unit_(from, p)), 0, 'walk', i === all.length - 1);
      from = p;
    });
    const docWait = Math.max(td + 0.2, tIn + 0.3);
    put(doc, docWait, doorSide, facing(d), 0, 'stand');
    put(doc, docWait + 0.7, add(rear, d, 1.2), vehicleYaw, BOX_FLOOR, 'walk');

    unit.planned = true;
    unit.doorsOpen = doorsOpen;
    unit.crewOut = crewOut;
    unit.crewIn = Math.max(n1.at(-1)!.t, n2.at(-1)!.t, doc.at(-1)!.t) + 0.1;
    unit.doorsClose = unit.crewIn + 0.1;
    unit.liftStart = liftStart;
    unit.liftEnd = liftEnd;
    unit.canopyOpen = canopyOpen;
    unit.canopyClose = canopyClose;
    unit.trolley = trolley;
    unit.nurses = [n1, n2];
    unit.doctor = doc;
  });
}

/** Handover clock time when every patient is loaded and every door shut. */
export function transferDoneAt(plan: HandoverPlan): number {
  const sent = plan.units.filter((u) => u.dispatched);
  if (sent.length === 0 || !sent.every((u) => u.planned)) return Infinity;
  return Math.max(...sent.map((u) => u.doorsClose + DOOR_SWING));
}

/** The ambulances leave for hospital, one after the other, starting at `now`. */
export function scheduleDeparture(plan: HandoverPlan, now: number): void {
  plan.units.forEach((unit, k) => {
    if (!unit.dispatched) return;
    unit.depart = Math.max(now + 0.6 + k * 1.8, unit.doorsClose + DOOR_SWING + 0.3);
  });
  plan.duration =
    Math.max(...plan.units.filter((u) => u.dispatched).map((u) => u.depart)) + DEPART_TIME;
}

export interface AmbulancePose {
  x: number;
  z: number;
  yaw: number;
  /** Signed speed (m/s) and acceleration along the route. */
  speed: number;
  accel: number;
  /** Distance travelled along the route (drives wheel spin). */
  s: number;
  visible: boolean;
}

/** Ambulance pose at handover time `t`: hard braking arrival, parked, then pulling away. */
export function ambulanceAt(plan: HandoverPlan, unit: HandoverUnit, t: number, out: AmbulancePose) {
  let s: number;
  let speed = 0;
  let accel = 0;
  if (t < unit.start) {
    s = unit.sParked;
  } else if (t < unit.arrive) {
    const p = driveProfile(unit.sStop - unit.sParked);
    const dt = t - unit.start;
    if (dt < p.tAcc) {
      s = unit.sParked + 0.5 * DRIVE.accel * dt * dt;
      speed = DRIVE.accel * dt;
      accel = DRIVE.accel;
    } else if (dt < p.tAcc + p.tCruise) {
      s = unit.sParked + p.dAcc + p.v * (dt - p.tAcc);
      speed = p.v;
    } else {
      const left = Math.max(0, unit.arrive - t);
      s = unit.sStop - 0.5 * DRIVE.brake * left * left;
      speed = DRIVE.brake * left;
      accel = -DRIVE.brake;
    }
  } else if (t < unit.depart) {
    s = unit.sStop;
  } else {
    const dt = t - unit.depart;
    const tMax = DEPART_MAX_SPEED / DEPART_ACCEL;
    if (dt < tMax) {
      s = unit.sStop + 0.5 * DEPART_ACCEL * dt * dt;
      speed = DEPART_ACCEL * dt;
      accel = DEPART_ACCEL;
    } else {
      s = unit.sStop + 0.5 * DEPART_ACCEL * tMax * tMax + DEPART_MAX_SPEED * (dt - tMax);
      speed = DEPART_MAX_SPEED;
    }
  }
  const p = pointAlong(plan.route, s);
  out.x = p.x;
  out.z = p.z;
  out.yaw = yawOf(p.dx, p.dz);
  out.speed = speed;
  out.accel = accel;
  out.s = s;
  out.visible = true;
  return out;
}

/** Samples a keyframe track (eased per segment, so walkers start and stop naturally). */
export function sampleKeys(keys: readonly Key[], t: number, out: Key): Key {
  const first = keys[0]!;
  if (t <= first.t) return Object.assign(out, first, { t });
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t > b.t) continue;
    const a = keys[i - 1]!;
    const u = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t)));
    const startsFromRest = a.stop !== false;
    const endsAtRest = b.stop !== false;
    const k =
      startsFromRest && endsAtRest
        ? smoothstep(0, 1, u)
        : startsFromRest
          ? u * u * (2 - u) * 0.5 + u * 0.5
          : endsAtRest
            ? 1 - (1 - u) * (1 - u) * 0.5 - (1 - u) * 0.5
            : u;
    out.pose = a.pose;
    out.stop = b.stop;
    out.t = t;
    out.x = a.x + (b.x - a.x) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.lift = a.lift + (b.lift - a.lift) * k;
    let dy = b.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    // Turn early in the segment, as a person does before walking off.
    out.yaw = a.yaw + dy * smoothstep(0, 0.35, (t - a.t) / Math.max(1e-6, b.t - a.t));
    return out;
  }
  return Object.assign(out, keys[keys.length - 1]!, { t });
}

/** Rear-door opening 0..1 at handover time `t`. */
export function doorOpening(unit: HandoverUnit, t: number): number {
  if (!unit.planned) return 0;
  return (
    smoothstep(unit.doorsOpen, unit.doorsOpen + DOOR_SWING, t) *
    (1 - smoothstep(unit.doorsClose, unit.doorsClose + DOOR_SWING, t))
  );
}
