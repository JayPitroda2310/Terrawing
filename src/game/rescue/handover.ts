import {
  createPolyline,
  createProjection,
  type Polyline,
  projectOnPolyline,
  samplePolyline,
  type Vec2Tuple,
} from '@/utils/math/polyline';
import { clamp01, smoothstep } from '@/utils/math/scalar';

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
  /** Handover clock time at which everything has left (Infinity until departure is scheduled). */
  duration: number;
}

const APPROACH_DISTANCE = 95;
const APPROACH_TIME = 7.5;
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
  /** Road centrelines near the LZ (world XZ), nearest is used; empty → straight approach. */
  roads: readonly Polyline[];
  patients: readonly HandoverPatient[];
  /** Handover clock time the ambulances are dispatched. */
  now?: number;
}

/** Dispatch: ambulance route to the pad's edge and the arrival timing of each unit. */
export function createHandoverPlan(input: HandoverInput): HandoverPlan {
  const { pad } = input;
  const now = input.now ?? 0;
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

  // Direction from the pad toward the road (or an arbitrary side when there is none).
  let ux = 1;
  let uz = 0;
  if (best && best.d > 1) {
    ux = (best.x - pad.x) / best.d;
    uz = (best.z - pad.z) / best.d;
  }
  let fx: number;
  let fz: number;
  if (best) {
    const here = pointAlong(best.line, best.s);
    fx = here.dx;
    fz = here.dz;
  } else {
    fx = -uz;
    fz = ux;
  }
  // Park parallel to the road just off the pad's edge (clear of wherever TerraWing set down).
  const edge = pad.radius + 2.6;
  const standOff = best ? Math.min(edge, Math.max(4, best.d - 1)) : edge;
  const px = pad.x + ux * standOff;
  const pz = pad.z + uz * standOff;

  let points: Vec2Tuple[];
  if (best && best.d > standOff + 2) {
    // Along the road, turn off to the pad, and back onto the road afterwards.
    const lead = 22 + best.d * 0.4;
    const inS = best.s - lead;
    const outS = best.s + lead;
    const before: Vec2Tuple[] = [];
    for (let s = inS - APPROACH_DISTANCE - 40; s <= inS; s += 6) {
      const p = pointAlong(best.line, s);
      before.push([p.x, p.z]);
    }
    const a = pointAlong(best.line, inS);
    const b = pointAlong(best.line, outS);
    const reach = Math.max(6, best.d * 0.6);
    const into = bezier(a.x, a.z, a.dx, a.dz, px, pz, fx, fz, reach);
    const outOf = bezier(px, pz, fx, fz, b.x, b.z, b.dx, b.dz, reach);
    const after: Vec2Tuple[] = [];
    for (let s = outS + 6; s <= outS + 220; s += 6) {
      const p = pointAlong(best.line, s);
      after.push([p.x, p.z]);
    }
    points = [...before, ...into, ...outOf, ...after];
  } else {
    points = [];
    for (let s = -APPROACH_DISTANCE - 60; s <= 240; s += 6) points.push([px + fx * s, pz + fz * s]);
  }
  const route = createPolyline(points);
  const park = createProjection();
  projectOnPolyline(route, px, pz, park);
  const sPark = park.t * route.length;

  const units = input.patients.slice(0, 2).map<HandoverUnit>((patient, k) => {
    const start = now + k * 2.6;
    return {
      patient,
      sStop: sPark - k * CONVOY_GAP,
      start,
      arrive: start + APPROACH_TIME,
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
      slotX: patient.slotX,
      trolley: [],
      doctor: [],
    };
  });
  return {
    route,
    drover: { x: pad.x, z: pad.z, heading: 0 },
    toward: { x: ux, z: uz },
    units,
    duration: Infinity,
  };
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
  if (!plan.units.every((u) => u.planned)) return Infinity;
  return Math.max(...plan.units.map((u) => u.doorsClose + DOOR_SWING));
}

/** The ambulances leave for hospital, one after the other, starting at `now`. */
export function scheduleDeparture(plan: HandoverPlan, now: number): void {
  plan.units.forEach((unit, k) => {
    unit.depart = Math.max(now + 0.6 + k * 1.8, unit.doorsClose + DOOR_SWING + 0.3);
  });
  plan.duration = Math.max(...plan.units.map((u) => u.depart)) + DEPART_TIME;
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
  const approach = Math.min(APPROACH_DISTANCE, unit.sStop);
  if (t < unit.arrive) {
    const tau = clamp01((t - unit.start) / APPROACH_TIME);
    const rest = 1 - tau;
    s = unit.sStop - approach * rest * rest;
    speed = ((2 * approach) / APPROACH_TIME) * rest;
    accel = -(2 * approach) / (APPROACH_TIME * APPROACH_TIME);
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
  out.visible = t >= unit.start;
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
