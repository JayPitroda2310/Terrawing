import { z } from 'zod';

/**
 * Rig parameters drive the vehicle's articulated parts. The procedural model reads them directly;
 * a future skeletal GLB model maps them onto bone rotations / animation clip weights.
 */
export const rigStateSchema = z.object({
  /** 0 = arms folded against the body (rover), 1 = arms extended (flight). */
  armExtension: z.number().min(0).max(1),
  /** 0 = wheels retracted, 1 = wheels deployed and load-bearing. */
  wheelDeploy: z.number().min(0).max(1),
  /** Vertical offset of the chassis relative to its rover ride height, in metres. */
  bodyLift: z.number(),
  /** 0..1 normalised rotor speed. */
  rotorSpeed: z.number().min(0).max(1),
  /** 0 = sensor mast stowed, 1 = raised. */
  sensorMast: z.number().min(0).max(1),
});
export type RigState = z.infer<typeof rigStateSchema>;

export const transformPhaseSchema = z.object({
  id: z.string(),
  /** Text shown in the HUD while the phase runs. */
  label: z.string(),
  /**
   * timed   — runs for `duration` seconds
   * descend — auto-descends until grounded (duration is a safety timeout)
   * ascend  — climbs to the configured lift-off height (duration is a safety timeout)
   * brake   — stops the rover (duration is a safety timeout)
   */
  kind: z.enum(['timed', 'descend', 'ascend', 'brake']),
  duration: z.number().positive(),
  /** Rig values reached at the end of this phase (interpolated from the phase start). */
  rigTarget: rigStateSchema.partial(),
  /** Audio cue played when the phase begins. */
  sound: z.string().optional(),
});
export type TransformPhaseConfig = z.infer<typeof transformPhaseSchema>;

const cameraProfileSchema = z.object({
  distance: z.number().positive(),
  height: z.number(),
  lookHeight: z.number(),
  lookAhead: z.number(),
  fov: z.number().min(30).max(100),
  /** Extra FOV at full speed (disabled with motion effects off). */
  fovBoost: z.number().min(0),
  followDamping: z.number().positive(),
  rotationDamping: z.number().positive(),
});
export type CameraProfile = z.infer<typeof cameraProfileSchema>;

export const vehicleConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  visual: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('procedural') }),
    z.object({ kind: z.literal('gltf'), url: z.string(), scale: z.number().positive() }),
  ]),
  body: z.object({
    mass: z.number().positive(),
    colliderRadius: z.number().positive(),
  }),
  flight: z.object({
    maxSpeed: z.number().positive(),
    reverseSpeed: z.number().positive(),
    acceleration: z.number().positive(),
    deceleration: z.number().positive(),
    verticalSpeed: z.number().positive(),
    verticalAcceleration: z.number().positive(),
    yawRate: z.number().positive(),
    yawResponse: z.number().positive(),
    maxAltitudeAGL: z.number().positive(),
    serviceCeiling: z.number().positive(),
    bankAngleDeg: z.number().min(0).max(45),
    pitchAngleDeg: z.number().min(0).max(45),
    hoverBob: z.number().min(0),
    windInfluence: z.number().min(0),
    groundEffectHeight: z.number().positive(),
    hoverSpeedThreshold: z.number().positive(),
  }),
  rover: z.object({
    maxSpeed: z.number().positive(),
    reverseSpeed: z.number().positive(),
    acceleration: z.number().positive(),
    brakeDeceleration: z.number().positive(),
    coastDeceleration: z.number().positive(),
    steerRate: z.number().positive(),
    steerSpeedReference: z.number().positive(),
    maxClimbSlopeDeg: z.number().positive(),
    lateralGrip: z.number().positive(),
    rideHeight: z.number(),
  }),
  transform: z.object({
    maxAltitudeAGL: z.number().positive(),
    maxGroundSlopeDeg: z.number().positive(),
    maxRoverSpeedToFlight: z.number().positive(),
    descentSpeed: z.number().positive(),
    liftoffHeight: z.number().positive(),
    toRover: z.array(transformPhaseSchema).min(1),
    toFlight: z.array(transformPhaseSchema).min(1),
  }),
  rig: z.object({ flight: rigStateSchema, rover: rigStateSchema }),
  battery: z.object({
    /** Percent per second unless noted. */
    drain: z.object({
      flight: z.number().min(0),
      hover: z.number().min(0),
      rover: z.number().min(0),
      roverIdle: z.number().min(0),
      /** Percent per pulse. */
      scannerPulse: z.number().min(0),
      /** Percent per transformation. */
      transform: z.number().min(0),
      /** Percent per second while running emergency/medical systems during an interaction. */
      emergency: z.number().min(0),
      /** Multiplier applied to flight drain while carrying a payload. */
      payloadMultiplier: z.number().min(1),
    }),
    rechargeRate: z.number().positive(),
    thresholds: z.object({
      warning: z.number(),
      critical: z.number(),
      emergency: z.number(),
    }),
  }),
  damage: z.object({
    impactThreshold: z.number().positive(),
    damagePerImpactSpeed: z.number().positive(),
    impactCooldown: z.number().min(0),
    thresholds: z.object({ damaged: z.number(), critical: z.number() }),
  }),
  scanner: z.object({
    range: z.number().positive(),
    classifyRange: z.number().positive(),
    pulseSpeed: z.number().positive(),
    cooldown: z.number().positive(),
    highlightDuration: z.number().positive(),
    transientMarkerDuration: z.number().positive(),
    zoomFovDelta: z.number(),
  }),
  signal: z.object({
    antennaHeight: z.number(),
    thresholds: z.object({ weak: z.number(), unstable: z.number() }),
  }),
  interaction: z.object({ radius: z.number().positive() }),
  camera: z.object({
    flight: cameraProfileSchema,
    rover: cameraProfileSchema,
    recenterDelay: z.number().min(0),
    pitchLimitsDeg: z.tuple([z.number(), z.number()]),
    minClearance: z.number().positive(),
  }),
});

export type VehicleConfig = z.infer<typeof vehicleConfigSchema>;
