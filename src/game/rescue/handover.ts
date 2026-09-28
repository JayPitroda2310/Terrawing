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

export interface Key {
  t: number;
  x: number;
  z: number;
  yaw: number;
  /** Height above the ground (trolley deck inside the ambulance). */
  lift: number;
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
export const DOOR_SWING = 1;
const WALK = 1.55;
const PUSH = 1.3;
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
  /** Road centrelines (world XZ); the nearest to the pad is used. Empty → cross-country. */
  roads: readonly Polyline[];
  /** How many ambulances are on standby (one per casualty expected to need transport). */
  units: number;
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
  for (const radius of [base.radius + 7, base.radius + 11, base.radius + 16]) {
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
  const edge = pad.radius + 2.6;
  const standOff = best ? Math.min(edge, Math.max(4, best.d - 1)) : edge;
  const px = pad.x + ux * standOff;
  const pz = pad.z + uz * standOff;

  const column = (count - 1) * CONVOY_GAP;
  const parking = chooseParking(base, pad, column + 7, input.isClear ?? (() => true));
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
 * Transfer choreography, once TerraWing is parked at `drover` (handover clock `now`): crews
 * leave their ambulances (or wait for them to arrive), roll trolleys alongside TerraWing, lift
 * the capsules off, assess, and load.
 */
export function planTransfer(
  plan: HandoverPlan,
  drover: { x: number; z: number; heading: number },
  now: number,
): void {
  plan.drover = { ...drover };
  const axisYaw = -drover.heading; // TerraWing's own model yaw (its nose faces -Z locally).
  const axisX = Math.sin(drover.heading);
  const axisZ = -Math.cos(drover.heading);
  // TerraWing's lateral (local +X) direction, signed toward the ambulances.
  let sideX = -axisZ;
  let sideZ = axisX;
  let flip = 1;
  if (sideX * plan.toward.x + sideZ * plan.toward.z < 0) {
    sideX = -sideX;
    sideZ = -sideZ;
    flip = -1;
  }

  plan.units.forEach((unit, k) => {
    if (!unit.dispatched) return;
    const at = pointAlong(plan.route, unit.sStop);
    const vehicleYaw = yawOf(at.dx, at.dz);
    const base = Math.max(unit.arrive, now) + k * 0.8;
    const rearX = at.x - at.dx * AMBULANCE_REAR;
    const rearZ = at.z - at.dz * AMBULANCE_REAR;
    // Trolley: inside the box → out behind the doors → beside TerraWing (near side for the first
    // patient, far side — round TerraWing's tail — for the second).
    const inX = rearX + at.dx * (TROLLEY_HALF + 0.2);
    const inZ = rearZ + at.dz * (TROLLEY_HALF + 0.2);
    const outX = rearX - at.dx * (TROLLEY_HALF + 1.3);
    const outZ = rearZ - at.dz * (TROLLEY_HALF + 1.3);
    // Work from the side of TerraWing the capsule is on (the ambulance side when centred).
    const sign = unit.slotX * flip < -0.01 ? -1 : 1;
    const besideX = drover.x + sideX * BESIDE * sign;
    const besideZ = drover.z + sideZ * BESIDE * sign;
    const approachX = besideX + sideX * sign * 2.2;
    const approachZ = besideZ + sideZ * sign * 2.2;
    const via: Vec2Tuple[] =
      sign > 0
        ? []
        : [
            [drover.x - axisX * 3.4 + sideX * 2.4, drover.z - axisZ * 3.4 + sideZ * 2.4],
            [drover.x - axisX * 3.4 - sideX * 2.4, drover.z - axisZ * 3.4 - sideZ * 2.4],
          ];

    const trolley: Key[] = [];
    const key = (t: number, x: number, z: number, yaw: number, lift: number) =>
      trolley.push({ t, x, z, yaw, lift });
    const doorsOpen = base + 0.5;
    const crewOut = doorsOpen + 0.6;
    let t = doorsOpen + DOOR_SWING + 0.2;
    key(t, inX, inZ, vehicleYaw, BOX_FLOOR);
    t += 1.8;
    key(t, outX, outZ, vehicleYaw, 0);
    let lx = outX;
    let lz = outZ;
    for (const [x, z] of [...via, [approachX, approachZ] as Vec2Tuple]) {
      const d = Math.hypot(x - lx, z - lz);
      t += Math.max(1.2, d / WALK);
      key(t, x, z, yawOf(x - lx, z - lz), 0);
      lx = x;
      lz = z;
    }
    t += 1.6;
    key(t, besideX, besideZ, axisYaw, 0);
    const liftStart = t + 0.5;
    const liftEnd = liftStart + 2.6;
    const canopyOpen = liftEnd + 0.3;
    const canopyClose = canopyOpen + 5.2;
    t = canopyClose + 1.4;
    key(t, besideX, besideZ, axisYaw, 0);
    t += 1.6;
    key(t, approachX, approachZ, axisYaw, 0);
    lx = approachX;
    lz = approachZ;
    for (const [x, z] of [...via.slice().reverse(), [outX, outZ] as Vec2Tuple]) {
      const d = Math.hypot(x - lx, z - lz);
      t += Math.max(1.2, d / PUSH);
      key(t, x, z, yawOf(x - lx, z - lz), 0);
      lx = x;
      lz = z;
    }
    t += 1.3;
    key(t, outX, outZ, vehicleYaw + Math.PI, 0);
    t += 2;
    key(t, inX, inZ, vehicleYaw + Math.PI, BOX_FLOOR);
    const trolleyIn = t;

    // Doctor: out of the cab's passenger side, to the far end of the trolley, assesses the
    // patient, walks back alongside and climbs in.
    const cabX = at.x + at.dx * 1.6 + at.dz * 1.4;
    const cabZ = at.z + at.dz * 1.6 - at.dx * 1.4;
    const docX = besideX + sideX * sign * 1.0 + axisX * 0.6;
    const docZ = besideZ + sideZ * sign * 1.0 + axisZ * 0.6;
    const faceTrolley = yawOf(besideX - docX, besideZ - docZ);
    const doctor: Key[] = [{ t: base + 0.4, x: cabX, z: cabZ, yaw: vehicleYaw, lift: 0 }];
    let dt0 = base + 0.9;
    let dx0 = cabX;
    let dz0 = cabZ;
    for (const [x, z] of [...via, [docX, docZ] as Vec2Tuple]) {
      const d = Math.hypot(x - dx0, z - dz0);
      dt0 += Math.max(1, d / WALK);
      doctor.push({ t: dt0, x, z, yaw: yawOf(x - dx0, z - dz0), lift: 0 });
      dx0 = x;
      dz0 = z;
    }
    dt0 += 0.6;
    doctor.push({ t: dt0, x: docX, z: docZ, yaw: faceTrolley, lift: 0 });
    let back = Math.max(canopyClose + 1.4, dt0 + 0.5);
    doctor.push({ t: back, x: docX, z: docZ, yaw: faceTrolley, lift: 0 });
    for (const [x, z] of [...via.slice().reverse(), [cabX, cabZ] as Vec2Tuple]) {
      const d = Math.hypot(x - dx0, z - dz0);
      back += Math.max(1, d / WALK);
      doctor.push({ t: back, x, z, yaw: yawOf(x - dx0, z - dz0), lift: 0 });
      dx0 = x;
      dz0 = z;
    }

    unit.planned = true;
    unit.doorsOpen = doorsOpen;
    unit.crewOut = crewOut;
    unit.crewIn = Math.max(trolleyIn + 1.2, back + 0.3);
    unit.doorsClose = unit.crewIn + 0.2;
    unit.liftStart = liftStart;
    unit.liftEnd = liftEnd;
    unit.canopyOpen = canopyOpen;
    unit.canopyClose = canopyClose;
    unit.trolley = trolley;
    unit.doctor = doctor;
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
    const k = smoothstep(0, 1, (t - a.t) / Math.max(1e-6, b.t - a.t));
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
