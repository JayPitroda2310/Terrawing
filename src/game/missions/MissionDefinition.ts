import { z } from 'zod';
import { vec2Schema } from '@/data/environments/environmentSchema';

export const SCAN_CATEGORIES = [
  'SURVIVOR',
  'MEDICAL_SUPPLY',
  'HAZARD',
  'VEHICLE',
  'UNKNOWN_SIGNAL',
  'OBJECTIVE',
] as const;
export const scanCategorySchema = z.enum(SCAN_CATEGORIES);
export type ScanCategory = z.infer<typeof scanCategorySchema>;

const objectiveBase = {
  id: z.string(),
  label: z.string(),
  /** Objectives that must be complete before this one becomes active. */
  requires: z.array(z.string()).default([]),
  optional: z.boolean().default(false),
};

export const objectiveSchema = z.discriminatedUnion('type', [
  z.object({ ...objectiveBase, type: z.literal('deploy'), minAltitude: z.number().positive() }),
  z.object({ ...objectiveBase, type: z.literal('scan'), zoneId: z.string() }),
  z.object({ ...objectiveBase, type: z.literal('secureSurvivor'), survivorId: z.string() }),
  z.object({
    ...objectiveBase,
    type: z.literal('deliverSupply'),
    supplyId: z.string(),
    survivorId: z.string(),
  }),
  z.object({ ...objectiveBase, type: z.literal('reachZone'), zoneId: z.string() }),
  z.object({
    ...objectiveBase,
    type: z.literal('extract'),
    zoneId: z.string(),
    holdSeconds: z.number().positive(),
  }),
]);
export type ObjectiveDefinition = z.infer<typeof objectiveSchema>;
export type ObjectiveType = ObjectiveDefinition['type'];

const zoneSchema = z.object({
  id: z.string(),
  kind: z.enum(['base', 'extraction', 'area']),
  label: z.string(),
  position: vec2Schema,
  radius: z.number().positive(),
  charging: z.boolean().default(false),
  /** Shown as a scanner/compass marker from the start of the mission. */
  alwaysVisible: z.boolean().default(false),
});
export type ZoneDefinition = z.infer<typeof zoneSchema>;

const hazardSchema = z.object({
  id: z.string(),
  kind: z.enum(['rockfall', 'unstableGround', 'fire', 'flood', 'aftershock']),
  label: z.string(),
  position: vec2Schema,
  radius: z.number().positive(),
  /** Integrity loss per second, by vehicle mode. */
  damagePerSecond: z.object({ FLIGHT: z.number().min(0), ROVER: z.number().min(0) }),
  warning: z.string(),
});
export type HazardDefinition = z.infer<typeof hazardSchema>;

const survivorSchema = z.object({
  id: z.string(),
  name: z.string(),
  callsign: z.string(),
  position: vec2Schema,
  facingDeg: z.number().default(0),
  pose: z.enum(['waving', 'sitting', 'lying']),
  condition: z.enum(['stable', 'injured', 'critical']),
  needsMedical: z.boolean().default(false),
  /** A visible smoke flare makes the survivor easy to spot without the scanner. */
  signalFlare: z.boolean().default(false),
  /** A flashing torch/strobe — the easiest way to spot someone at night. */
  strobe: z.boolean().default(false),
  /** Metres above the ground (e.g. stranded on a roof). */
  elevation: z.number().min(0).default(0),
  /** `air`: unreachable by road, rescued by hovering over them (winch). */
  access: z.enum(['ground', 'air']).default('ground'),
  /** Report shown once the survivor has been secured. */
  report: z.string(),
});
export type SurvivorDefinition = z.infer<typeof survivorSchema>;

const supplySchema = z.object({
  id: z.string(),
  kind: z.enum(['medical']),
  label: z.string(),
  position: vec2Schema,
});
export type SupplyDefinition = z.infer<typeof supplySchema>;

const scanPointSchema = z.object({
  id: z.string(),
  category: scanCategorySchema,
  label: z.string(),
  /** Revealed once the target is classified up close. */
  identity: z.string(),
  position: vec2Schema,
  elevation: z.number().default(1),
});
export type ScanPointDefinition = z.infer<typeof scanPointSchema>;

const radioTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('missionStart'), delay: z.number().min(0).default(0) }),
  z.object({ type: z.literal('objectiveCompleted'), objectiveId: z.string() }),
  z.object({ type: z.literal('scanDetected'), targetId: z.string() }),
  z.object({ type: z.literal('hazardEntered'), hazardId: z.string() }),
  z.object({
    type: z.literal('batteryLevel'),
    level: z.enum(['warning', 'critical', 'emergency']),
  }),
  z.object({ type: z.literal('signalLost') }),
]);

const radioMessageSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  trigger: radioTriggerSchema,
});
export type RadioMessageDefinition = z.infer<typeof radioMessageSchema>;
export type RadioTrigger = RadioMessageDefinition['trigger'];

export const missionSchema = z
  .object({
    id: z.string(),
    index: z.number().int().positive(),
    code: z.string(),
    name: z.string(),
    description: z.string(),
    environment: z.string(),
    vehicle: z.string(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    timeLimit: z.number().positive(),
    /** Starting battery percentage. */
    batteryLimit: z.number().min(1).max(100),
    briefing: z.object({
      location: z.string(),
      status: z.string(),
      weather: z.string(),
      visibility: z.string(),
      risk: z.string(),
      paragraphs: z.array(z.string()).min(1),
      tips: z.array(z.string()).default([]),
    }),
    weather: z.object({
      preset: z.enum(['clear', 'cloudy', 'lightRain', 'heavyRain', 'storm', 'fog', 'snow']),
      rainIntensity: z.number().min(0).max(1),
      fogDensity: z.number().min(0),
      windStrength: z.number().min(0),
      windDirectionDeg: z.number(),
      gustiness: z.number().min(0).max(1),
      thunder: z.boolean(),
      /** 0..1 attenuation of radio signal. */
      signalAttenuation: z.number().min(0).max(1),
      /** Multiplier on ground traction (wet ground). */
      tractionMultiplier: z.number().min(0).max(1),
    }),
    spawn: z.object({
      position: vec2Schema,
      headingDeg: z.number(),
      mode: z.enum(['FLIGHT', 'ROVER']),
    }),
    extractionZoneId: z.string(),
    zones: z.array(zoneSchema),
    hazards: z.array(hazardSchema),
    survivors: z.array(survivorSchema).min(1),
    supplies: z.array(supplySchema),
    scanPoints: z.array(scanPointSchema),
    objectives: z.array(objectiveSchema).min(1),
    radio: z.array(radioMessageSchema).default([]),
    rewards: z.object({
      parTimeSeconds: z.number().positive(),
      /** Score thresholds (0..1) for 1, 2 and 3 stars. */
      starThresholds: z.tuple([z.number(), z.number(), z.number()]),
      weights: z.object({
        survivors: z.number(),
        time: z.number(),
        integrity: z.number(),
        battery: z.number(),
        scanner: z.number(),
      }),
      unlocks: z.array(z.string()).default([]),
    }),
  })
  .superRefine((mission, ctx) => {
    const ids = new Set<string>();
    const zoneIds = new Set(mission.zones.map((z) => z.id));
    const survivorIds = new Set(mission.survivors.map((s) => s.id));
    const supplyIds = new Set(mission.supplies.map((s) => s.id));
    for (const objective of mission.objectives) {
      if (ids.has(objective.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate objective id "${objective.id}"` });
      }
      ids.add(objective.id);
    }
    const objectiveIds = ids;
    for (const objective of mission.objectives) {
      for (const dependency of objective.requires) {
        if (!objectiveIds.has(dependency)) {
          ctx.addIssue({
            code: 'custom',
            message: `Objective "${objective.id}" requires unknown objective "${dependency}"`,
          });
        }
      }
      const check = (kind: string, id: string, pool: Set<string>) => {
        if (!pool.has(id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Objective "${objective.id}" references unknown ${kind} "${id}"`,
          });
        }
      };
      switch (objective.type) {
        case 'scan':
        case 'reachZone':
        case 'extract':
          check('zone', objective.zoneId, zoneIds);
          break;
        case 'secureSurvivor':
          check('survivor', objective.survivorId, survivorIds);
          break;
        case 'deliverSupply':
          check('survivor', objective.survivorId, survivorIds);
          check('supply', objective.supplyId, supplyIds);
          break;
        case 'deploy':
          break;
      }
    }
    if (!zoneIds.has(mission.extractionZoneId)) {
      ctx.addIssue({
        code: 'custom',
        message: `Unknown extraction zone "${mission.extractionZoneId}"`,
      });
    }
  });

export type MissionDefinition = z.infer<typeof missionSchema>;
export type MissionInput = z.input<typeof missionSchema>;

export type MissionValidationResult =
  { ok: true; mission: MissionDefinition } | { ok: false; errors: string[] };

/** Validates raw mission data. Invalid data never reaches gameplay code. */
export function validateMission(input: unknown): MissionValidationResult {
  const result = missionSchema.safeParse(input);
  if (result.success) return { ok: true, mission: result.data };
  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'mission'}: ${issue.message}`,
    ),
  };
}
