import type { EnvironmentDefinition } from '@/data/environments/environmentSchema';
import { puddleAt } from '@/game/environment/puddles';
import { getSurface } from '@/data/surfaces/surfaces';
import type { VehicleConfig } from '@/data/vehicles';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { AxisMode, ControlAxes } from '@/game/input/InputManager';
import type { GameAction } from '@/game/input/actions';
import type { MissionDefinition, ScanCategory } from '@/game/missions/MissionDefinition';
import { MissionManager } from '@/game/missions/MissionManager';
import type { MissionContext } from '@/game/missions/MissionObjectives';
import { rateMission, type MissionResult } from '@/game/missions/MissionRating';
import type { VehicleBody } from '@/game/physics/VehicleBody';
import { RescuePoint } from '@/game/rescue/RescuePoint';
import { SupplyManager } from '@/game/rescue/SupplyManager';
import { SurvivorManager } from '@/game/rescue/SurvivorManager';
import { Scanner, type ScanDetection } from '@/game/scanner/Scanner';
import type { ScannerTarget } from '@/game/scanner/ScannerTarget';
import { BatterySystem, type BatteryActivity } from '@/game/systems/BatterySystem';
import { DamageSystem } from '@/game/systems/DamageSystem';
import { HazardSystem, type HazardTransition } from '@/game/systems/HazardSystem';
import { InteractionSystem, STOP_VEHICLE } from '@/game/systems/InteractionSystem';
import { RadioSystem } from '@/game/systems/RadioSystem';
import { SignalSystem } from '@/game/systems/SignalSystem';
import { WeatherSystem } from '@/game/systems/WeatherSystem';
import { TerraWingController, type ControlMode } from '@/game/terrawing/TerraWingController';
import { DEG2RAD, RAD2DEG } from '@/utils/math/scalar';
import { EventBus } from './EventBus';
import type { FailureReason, GameEvents } from './GameEvents';
import { GameplayStateMachine, type CinematicShotId, type VehicleMode } from './GameState';
import {
  createHandoverPlan,
  type HandoverPlan,
  planTransfer,
  scheduleDeparture,
  SLOT_X,
  transferDoneAt,
} from '@/game/rescue/handover';
import { SURVIVOR_JACKETS } from '@/game/rescue/humanRig';
import { createTelemetry, type HudWarning, type Telemetry } from './Telemetry';

/** The subset of input the simulation needs; satisfied by InputManager and by test doubles. */
export interface SessionInput {
  sampleAxes(out: ControlAxes, mode: AxisMode): ControlAxes;
  consumePressed(action: GameAction): boolean;
  clearPressed(): void;
}

export interface SessionSetup {
  mission: MissionDefinition;
  environment: EnvironmentDefinition;
  vehicle: VehicleConfig;
  terrain: TerrainQuery;
  input: SessionInput;
}

export type SessionPhase = 'loading' | 'active' | 'ending' | 'ended';

const CINEMATIC_DURATIONS: Readonly<Record<CinematicShotId, number>> = {
  missionIntro: 5.5,
  missionComplete: 5,
  rescue: 3,
  handover: 30,
};
/** Player camera views: third-person chase, the nose FPV camera, the stabilised belly gimbal. */
export type CameraView = 'chase' | 'nose' | 'gimbal';

const FAILURE_DELAY = 2.2;
const HANDOVER_HOLD = 'HOLD POSITION — PATIENT TRANSFER IN PROGRESS';
const VISUAL_CONTACT_FLARE = 55;
const VISUAL_CONTACT_DEFAULT = 22;
const CLASSIFY_ON_ARRIVAL = 30;
const SURVIVOR_TARGET_HEIGHT = 1;
const SECURE_DURATION = 3.2;
const DELIVER_DURATION = 2.4;
const LOAD_DURATION = 1.6;
const BOUNDARY_PUSH = 12;
const INTERACT_RADIUS_SUPPLY = 7;
const CHARGE_MAX_SPEED = 1;

let nextSessionId = 1;

const ZERO_AXES: ControlAxes = { throttle: 0, steer: 0, lift: 0, strafe: 0, brake: false };

/**
 * A single run of a mission. Owns every gameplay system and advances them in a fixed-step
 * simulation. Rendering reads from it; React never drives it directly.
 */
/** Patient harm per m/s of collision speed, and from rough riding above a tolerance. */
const PATIENT_IMPACT_HARM = 4;
const PATIENT_RIDE_TOLERANCE = 2.5;
const PATIENT_RIDE_HARM = 1.6;

/** Seconds between aftershocks, and flood rise (m/s at full rain) and its limit (m). */
const TREMOR_INTERVAL = [28, 55] as const;
const FLOOD_RISE_RATE = 0.0012;
const FLOOD_MAX_RISE = 1.4;

export class GameSession {
  readonly id = nextSessionId++;
  readonly mission: MissionDefinition;
  readonly environment: EnvironmentDefinition;
  readonly config: VehicleConfig;
  readonly terrain: TerrainQuery;
  readonly events = new EventBus<GameEvents>();
  readonly gameplay: GameplayStateMachine;
  readonly vehicle: TerraWingController;
  readonly battery: BatterySystem;
  readonly damage: DamageSystem;
  readonly signal: SignalSystem;
  readonly weather: WeatherSystem;
  readonly scanner: Scanner;
  readonly survivors: SurvivorManager;
  readonly supplies: SupplyManager;
  readonly zones = new Map<string, RescuePoint>();
  readonly hazards: HazardSystem;
  readonly interaction = new InteractionSystem();
  readonly missionManager: MissionManager;
  readonly radio: RadioSystem;
  readonly telemetry: Telemetry = createTelemetry();

  phase: SessionPhase = 'loading';
  time = 0;
  result: MissionResult | null = null;
  cinematicTime = 0;
  charging = false;
  boundaryWarning = false;
  /** Debug: disables battery drain and damage. */
  invulnerable = false;

  private readonly input: SessionInput;
  private readonly axes: ControlAxes = { throttle: 0, steer: 0, lift: 0, strafe: 0, brake: false };
  private readonly detections: ScanDetection[] = [];
  private readonly hazardTransitions: HazardTransition[] = [];
  private readonly missionContext: MissionContext;
  private endingTimer = 0;
  private warnings: HudWarning[] = [];

  constructor(setup: SessionSetup) {
    const { mission, environment, vehicle, terrain, input } = setup;
    this.mission = mission;
    this.environment = environment;
    this.config = vehicle;
    this.terrain = terrain;
    this.input = input;

    const [spawnX, spawnZ] = mission.spawn.position;
    this.vehicle = new TerraWingController(
      vehicle,
      terrain,
      mission.spawn.mode,
      spawnX,
      spawnZ,
      mission.spawn.headingDeg * DEG2RAD,
    );
    this.gameplay = new GameplayStateMachine({
      kind: 'CINEMATIC',
      shot: 'missionIntro',
      resume: mission.spawn.mode,
    });
    this.gameplay.subscribe((next, previous) =>
      this.events.emit('state:changed', { next, previous }),
    );

    this.battery = new BatterySystem(vehicle.battery, mission.batteryLimit);
    this.damage = new DamageSystem(vehicle.damage);
    this.weather = new WeatherSystem(mission.weather);
    this.signal = new SignalSystem(
      environment.relay,
      vehicle.signal,
      terrain,
      this.weather.signalFactor,
    );
    this.scanner = new Scanner(vehicle.scanner);
    this.survivors = new SurvivorManager(mission.survivors, terrain);
    this.supplies = new SupplyManager(mission.supplies, terrain);
    this.hazards = new HazardSystem(mission.hazards);
    for (const zone of mission.zones) this.zones.set(zone.id, new RescuePoint(zone, terrain));

    const isInZone = (zoneId: string, x: number, z: number) =>
      this.zones.get(zoneId)?.contains(x, z) ?? false;
    this.missionManager = new MissionManager(mission, isInZone);
    this.missionContext = {
      x: 0,
      z: 0,
      altitudeAGL: 0,
      speed: 0,
      mode: null,
      grounded: false,
      isInZone,
    };
    this.radio = new RadioSystem(mission.radio, this.events);

    this.registerScanTargets();
    this.registerInteractions();
    this.signal.reset(spawnX, terrain.heightAt(spawnX, spawnZ), spawnZ);
  }

  // ---------------------------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------------------------

  attachBody(body: VehicleBody): void {
    this.vehicle.attach(body);
  }

  detachBody(): void {
    this.vehicle.detach();
  }

  get ready(): boolean {
    return this.vehicle.attached;
  }

  /** Called once the world is loaded and the player takes control. */
  start(): void {
    if (this.phase !== 'loading') return;
    this.phase = 'active';
    this.cinematicTime = 0;
    this.radio.start();
  }

  dispose(): void {
    this.radio.dispose();
    this.events.clear();
    this.vehicle.detach();
  }

  get vehicleMode(): VehicleMode {
    return this.vehicle.state.mode;
  }

  // ---------------------------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------------------------

  /** Advances the simulation by one fixed physics step. */
  fixedUpdate(dt: number): void {
    if (!this.vehicle.attached || this.phase === 'loading' || this.phase === 'ended') return;
    this.time += dt;
    const state = this.vehicle.state;

    const impact = this.vehicle.sync(dt);
    if (impact > 0 && !this.invulnerable) {
      const damage = this.damage.applyImpact(
        impact,
        state.mode === 'FLIGHT' ? 'PROPULSION' : 'WHEELS',
      );
      if (damage > 0) {
        this.jolt(impact * PATIENT_IMPACT_HARM);
        this.events.emit('vehicle:impact', { speed: impact, damage, position: state.position });
        this.emitIntegrityLevel();
      }
    }

    const playerControl = this.phase === 'active' && this.hasPlayerControl();
    if (playerControl) this.input.sampleAxes(this.axes, state.mode);
    else Object.assign(this.axes, ZERO_AXES);

    if (this.phase === 'active') this.handleDiscreteInput();

    const result = this.vehicle.step(
      this.controlMode(),
      this.axes,
      { wind: this.weather.wind, serviceCeiling: this.environment.bounds.ceiling },
      {
        tractionMultiplier: this.weather.tractionMultiplier,
        terrain: this.terrain,
        puddleAt: (x, z) => puddleAt(this.terrain, x, z, this.weather.wetness),
      },
      dt,
    );
    if (result?.type === 'phase') {
      const direction = this.vehicle.transformation.currentDirection;
      if (direction) {
        this.events.emit('transform:phase', {
          direction,
          phaseId: result.phase.id,
          label: result.phase.label,
          sound: result.phase.sound,
        });
      }
    } else if (result?.type === 'completed') {
      const mode = this.vehicle.finishTransform(result.direction);
      this.gameplay.transition({ kind: mode });
      this.events.emit('transform:completed', { direction: result.direction });
      this.events.emit('vehicle:modeChanged', { mode });
    }

    // Rough driving jolts the patients: suspension working hard beyond a smooth ride.
    if (state.passengers > 0 && state.mode === 'ROVER') {
      this.jolt(
        Math.max(0, state.suspensionActivity - PATIENT_RIDE_TOLERANCE) * PATIENT_RIDE_HARM * dt,
      );
    }

    const [pushX, pushZ] = this.boundaryPush();
    this.vehicle.apply(pushX, pushZ);

    this.updateSystems(dt);
    state.wetness = this.weather.wetness;
    this.updateHandover(dt);
    this.updateCinematic(dt);
    this.updateEnding(dt);
  }

  private hasPlayerControl(): boolean {
    const kind = this.gameplay.kind;
    return kind === 'FLIGHT' || kind === 'ROVER';
  }

  private controlMode(): ControlMode {
    if (this.phase === 'ending' || this.handoverHold) return 'hold';
    switch (this.gameplay.kind) {
      case 'FLIGHT':
        return 'flight';
      case 'ROVER':
        return 'rover';
      case 'TRANSFORMING':
        return 'transform';
      case 'INTERACTING':
      case 'CINEMATIC':
        return 'hold';
    }
  }

  private handleDiscreteInput(): void {
    const kind = this.gameplay.kind;
    const scan = this.input.consumePressed('scan');
    const interact = this.input.consumePressed('interact');
    if (this.input.consumePressed('camera') && kind !== 'CINEMATIC') this.cycleCameraView();

    if (kind === 'CINEMATIC') {
      const state = this.gameplay.state;
      const skippable =
        state.kind === 'CINEMATIC' && (state.shot === 'missionIntro' || state.shot === 'handover');
      if ((scan || interact) && skippable) {
        this.endCinematic();
      }
      return;
    }
    if (scan) this.tryScan();
    if (interact && (kind === 'FLIGHT' || kind === 'ROVER')) this.handleInteractKey();
  }

  /** Which camera the player is looking through: chase (third person) or TerraWing's own. */
  cameraView: CameraView = 'chase';
  /** Gimbal pan / tilt (radians), published by the camera rig for the camera-feed overlay. */
  readonly cameraAim = { pan: 0, tilt: 0 };

  private cycleCameraView(): void {
    const order: CameraView[] = ['chase', 'nose', 'gimbal'];
    this.cameraView = order[(order.indexOf(this.cameraView) + 1) % order.length]!;
    this.events.emit('camera:view', { view: this.cameraView });
  }

  private handleInteractKey(): void {
    if (this.handoverHold) {
      this.events.emit('notification', { text: HANDOVER_HOLD, tone: 'warning' });
      return;
    }
    const prompt = this.interaction.prompt;
    if (prompt?.blockedReason === STOP_VEHICLE) {
      // Next to a survivor but still rolling: don't fall through to transforming.
      this.events.emit('notification', { text: STOP_VEHICLE, tone: 'warning' });
      return;
    }
    if (prompt && !prompt.blockedReason) {
      const started = this.interaction.tryStart();
      if (started) {
        this.gameplay.transition({
          kind: 'INTERACTING',
          interactionId: started.id,
          resume: this.vehicle.state.mode,
        });
        this.events.emit('interaction:started', {
          interactionId: started.id,
          label: started.progressLabel,
        });
      }
      return;
    }
    this.requestTransform();
  }

  requestTransform(): void {
    const direction = this.vehicle.state.mode === 'FLIGHT' ? 'toRover' : 'toFlight';
    if (!this.invulnerable && this.battery.percent < this.config.battery.drain.transform) {
      this.events.emit('transform:rejected', { reason: 'INSUFFICIENT POWER' });
      return;
    }
    const rejection = this.vehicle.requestTransform(direction);
    if (rejection) {
      this.events.emit('transform:rejected', { reason: rejection });
      return;
    }
    if (!this.invulnerable) this.battery.consume(this.config.battery.drain.transform);
    this.gameplay.transition({ kind: 'TRANSFORMING', direction });
    this.events.emit('transform:started', { direction });
    const phase = this.vehicle.transformation.currentPhase;
    if (phase) {
      this.events.emit('transform:phase', {
        direction,
        phaseId: phase.id,
        label: phase.label,
        sound: phase.sound,
      });
    }
  }

  tryScan(): void {
    const s = this.vehicle.state;
    const cost = this.config.battery.drain.scannerPulse;
    const rejection = this.scanner.tryPulse(
      s.position.x,
      s.position.y + 1,
      s.position.z,
      this.invulnerable || this.battery.percent > cost,
    );
    if (rejection) {
      this.events.emit('scan:rejected', {
        reason: rejection === 'cooldown' ? 'SCANNER RECHARGING' : 'INSUFFICIENT POWER',
      });
      return;
    }
    if (!this.invulnerable) this.battery.consume(cost);
    this.events.emit('scan:pulse', { origin: s.position, range: this.scanner.range });
    this.missionManager.notify({ type: 'scanPerformed', x: s.position.x, z: s.position.z });
  }

  private updateSystems(dt: number): void {
    const s = this.vehicle.state;

    const thunder = this.weather.update(dt);
    if (thunder) this.events.emit('weather:thunder', thunder);

    // Charging at designated zones while parked.
    this.charging = false;
    for (const zone of this.zones.values()) {
      if (
        zone.charging &&
        zone.contains(s.position.x, s.position.z) &&
        s.grounded &&
        s.speed < CHARGE_MAX_SPEED
      ) {
        this.charging = this.battery.percent < 100;
      }
    }

    if (!this.invulnerable && this.phase === 'active') {
      const level = this.battery.update(dt, {
        activity: this.batteryActivity(),
        carryingPayload: s.payload !== null,
        charging: this.charging,
      });
      if (level) this.events.emit('battery:level', { level });
    } else if (this.charging) {
      this.battery.update(dt, { activity: 'idle', carryingPayload: false, charging: true });
    }

    this.damage.tick(dt);
    this.hazards.time = this.time;
    this.updateDisasters(dt);
    const hazardDamage = this.hazards.update(
      s.position.x,
      s.position.z,
      s.mode,
      this.hazardTransitions,
    );
    for (const transition of this.hazardTransitions) {
      if (transition.entered) {
        this.events.emit('hazard:entered', {
          hazardId: transition.hazard.id,
          warning: transition.hazard.warning,
        });
      } else {
        this.events.emit('hazard:exited', { hazardId: transition.hazard.id });
      }
    }
    if (!this.invulnerable) {
      const surfaceDamage = s.grounded || s.inWater ? getSurface(s.surface).damagePerSecond : 0;
      if (hazardDamage > 0) this.damage.apply(hazardDamage * dt, 'BODY');
      if (surfaceDamage > 0) this.damage.apply(surfaceDamage * dt, 'SENSORS');
      if (hazardDamage > 0 || surfaceDamage > 0) this.emitIntegrityLevel();
    }

    const signalState = this.signal.update(dt, s.position.x, s.position.y, s.position.z);
    if (signalState) this.events.emit('signal:state', { state: signalState });

    this.scanner.update(dt, this.time, this.signal.state !== 'unstable', this.detections);
    for (const detection of this.detections) {
      if (!detection.isNew) continue;
      this.events.emit('scan:detected', {
        targetId: detection.target.id,
        category: detection.target.classified ? detection.target.category : 'UNKNOWN_SIGNAL',
        classified: detection.target.classified,
        distance: detection.distance,
      });
    }
    this.updateVisualContact();

    this.updateInteraction(dt);
    this.radio.update(dt);

    if (this.phase === 'active') this.updateMission(dt);
  }

  private batteryActivity(): BatteryActivity {
    const s = this.vehicle.state;
    switch (this.gameplay.kind) {
      case 'TRANSFORMING':
        return 'transforming';
      case 'INTERACTING':
        return 'interacting';
      case 'CINEMATIC':
        return s.mode === 'FLIGHT' ? 'hover' : 'idle';
      case 'FLIGHT':
        return s.hovering ? 'hover' : 'flight';
      case 'ROVER':
        return s.speed > 0.5 ? 'rover' : 'roverIdle';
    }
  }

  private updateInteraction(dt: number): void {
    const s = this.vehicle.state;
    const kind = this.gameplay.kind;
    if (kind === 'INTERACTING') {
      const completed = this.interaction.update(dt);
      if (completed) {
        const state = this.gameplay.state;
        const resume = state.kind === 'INTERACTING' ? state.resume : s.mode;
        this.gameplay.transition({ kind: resume });
        this.events.emit('interaction:completed', { interactionId: completed.id });
      }
      return;
    }
    const mode = kind === 'FLIGHT' || kind === 'ROVER' ? s.mode : null;
    this.interaction.updatePrompt(
      s.position.x,
      s.position.y,
      s.position.z,
      mode,
      s.grounded,
      s.speed,
    );
  }

  private updateVisualContact(): void {
    const s = this.vehicle.state;
    for (const survivor of this.survivors.survivors) {
      const target = this.scanner.getTarget(survivor.definition.id);
      if (!target || target.classified) continue;
      const range = survivor.definition.signalFlare ? VISUAL_CONTACT_FLARE : VISUAL_CONTACT_DEFAULT;
      const distance = Math.hypot(
        survivor.position.x - s.position.x,
        survivor.position.z - s.position.z,
      );
      if (distance <= range) {
        target.discovered = true;
        target.classified = true;
        target.lastPing = this.time;
        this.events.emit('notification', {
          text: `VISUAL CONTACT — ${survivor.definition.name.toUpperCase()}`,
          tone: 'success',
        });
      }
    }
    const classified = this.scanner.classifyNearby(s.position.x, s.position.z, CLASSIFY_ON_ARRIVAL);
    if (classified) {
      this.events.emit('notification', {
        text: `IDENTIFIED: ${classified.identity.toUpperCase()}`,
        tone: 'info',
      });
    }
  }

  private updateMission(dt: number): void {
    const s = this.vehicle.state;
    const ctx = this.missionContext;
    ctx.x = s.position.x;
    ctx.z = s.position.z;
    ctx.altitudeAGL = s.altitudeAGL;
    ctx.speed = s.speed;
    ctx.grounded = s.grounded;
    ctx.mode = this.hasPlayerControl() ? s.mode : null;
    ctx.extractionBlocked =
      this.vehicle.state.passengers > 0 ||
      (this.handover !== null && this.handoverTime < transferDoneAt(this.handover));

    const update = this.missionManager.update(dt, ctx);
    for (const objective of update.completed) {
      this.events.emit('objective:completed', {
        objectiveId: objective.definition.id,
        label: objective.definition.label,
      });
    }
    if (update.missionCompleted) {
      this.beginEnding();
      // Patients were handed over: the closing shot is the ambulances leaving for hospital.
      if (this.handover && Number.isFinite(transferDoneAt(this.handover))) {
        scheduleDeparture(this.handover, this.handoverTime);
        this.startCinematic('handover', 'NONE');
        this.notify('AMBULANCES EN ROUTE TO REGIONAL HOSPITAL', 'success');
      } else this.startCinematic('missionComplete', 'NONE');
      return;
    }

    if (this.battery.depleted) this.failMission('BATTERY_DEPLETED');
    else if (this.damage.destroyed) this.failMission('SYSTEM_INTEGRITY_CRITICAL');
    else if (this.missionManager.state === 'failed')
      this.failMission(this.missionManager.failureReason ?? 'TIME_EXPIRED');
  }

  private failMission(reason: FailureReason): void {
    if (this.phase !== 'active') return;
    this.missionManager.fail(reason);
    this.interaction.cancel();
    this.vehicle.transformation.cancel();
    this.beginEnding();
    this.result = this.buildResult(false, reason);
  }

  private beginEnding(): void {
    this.phase = 'ending';
    this.endingTimer = 0;
  }

  private updateEnding(dt: number): void {
    if (this.phase !== 'ending') return;
    this.endingTimer += dt;
    if (this.result && !this.result.success && this.endingTimer >= FAILURE_DELAY) {
      this.phase = 'ended';
      this.events.emit('mission:failed', { reason: this.result.failureReason ?? 'TIME_EXPIRED' });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Cinematics
  // ---------------------------------------------------------------------------------------------

  private startCinematic(shot: CinematicShotId, resume: 'FLIGHT' | 'ROVER' | 'NONE'): void {
    this.cinematicTime = 0;
    this.gameplay.transition({ kind: 'CINEMATIC', shot, resume });
  }

  private updateCinematic(dt: number): void {
    const state = this.gameplay.state;
    if (state.kind !== 'CINEMATIC') return;
    this.cinematicTime += dt;
    if (this.cinematicTime >= this.cinematicDuration(state.shot)) this.endCinematic();
  }

  get cinematicProgress(): number {
    const state = this.gameplay.state;
    if (state.kind !== 'CINEMATIC') return 0;
    return Math.min(1, this.cinematicTime / this.cinematicDuration(state.shot));
  }

  private cinematicDuration(shot: CinematicShotId): number {
    return shot === 'handover' && this.handover
      ? Math.max(1, this.handover.duration - (this.handoverTime - this.cinematicTime))
      : CINEMATIC_DURATIONS[shot];
  }

  /**
   * Ambulance handover at the LZ: dispatched when TerraWing reaches the extraction zone with
   * casualties aboard; the transfer plays out live once TerraWing is parked there in rover mode.
   */
  handover: HandoverPlan | null = null;
  /** Handover clock (s since the ambulances were dispatched). */
  handoverTime = 0;
  private handoverStep = 0;

  /** TerraWing must stay put while the medical team works on it. */
  get handoverHold(): boolean {
    const plan = this.handover;
    return Boolean(
      plan && plan.units.some((u) => u.planned) && this.handoverTime < transferDoneAt(plan),
    );
  }

  private updateHandover(dt: number): void {
    const s = this.vehicle.state;
    const zone = this.zones.get(this.mission.extractionZoneId);
    if (!this.handover) {
      if (this.phase !== 'active' || !zone || this.survivors.passengers === 0) return;
      if (!zone.contains(s.position.x, s.position.z)) return;
      const lines = (kind: 'road' | 'trail') =>
        this.terrain.data.paths.filter((p) => p.kind === kind).map((p) => p.line);
      const roads = lines('road');
      const aboard = this.survivors.survivors.filter((v) => v.onBoard);
      this.handover = createHandoverPlan({
        pad: { x: zone.position.x, z: zone.position.z, radius: zone.definition.radius },
        roads: roads.length > 0 ? roads : lines('trail'),
        patients: aboard.map((v, i) => ({
          id: v.definition.id,
          name: v.definition.name,
          jacket: SURVIVOR_JACKETS[v.definition.callsign] ?? '#c0492a',
          slotX: s.capsules[i]?.x ?? 0,
        })),
      });
      this.handoverTime = 0;
      this.handoverStep = 0;
      this.notify('AMBULANCE DISPATCHED TO THE LZ — LAND AND SWITCH TO ROVER', 'info');
      return;
    }
    const plan = this.handover;
    this.handoverTime += dt;
    const t = this.handoverTime;
    // The transfer starts once TerraWing is parked in the LZ as a rover.
    if (
      !plan.units[0]!.planned &&
      this.phase === 'active' &&
      zone?.contains(s.position.x, s.position.z) &&
      this.gameplay.kind === 'ROVER' &&
      s.grounded &&
      s.speed < 0.6
    ) {
      planTransfer(plan, { x: s.position.x, z: s.position.z, heading: s.heading }, t);
      s.capsulesDetached = true;
      this.notify('HOLD POSITION — MEDICAL TEAM COMING TO TERRAWING', 'warning');
    }
    // Casualties leave TerraWing as the team lifts each capsule off.
    const aboard = plan.units.filter((u) => !(t >= u.liftEnd)).length;
    if (s.passengers !== aboard) {
      s.passengers = aboard;
      this.notify('PATIENT TRANSFERRED TO THE MEDICAL TEAM', 'success');
    }
    const first = plan.units[0]!;
    const beats: [number, () => void][] = [
      [first.arrive, () => this.notify('AMBULANCE ON SCENE AT THE LZ', 'info')],
      [
        transferDoneAt(plan),
        () => this.notify('PATIENTS LOADED — COMPLETE THE EXTRACTION', 'success'),
      ],
    ];
    while (this.handoverStep < beats.length && t >= beats[this.handoverStep]![0]) {
      beats[this.handoverStep]![1]();
      this.handoverStep++;
    }
  }

  private notify(text: string, tone: 'info' | 'success' | 'warning'): void {
    this.events.emit('notification', { text, tone });
  }

  private endCinematic(): void {
    const state = this.gameplay.state;
    if (state.kind !== 'CINEMATIC') return;
    this.events.emit('cinematic:finished', { shot: state.shot });
    if (state.shot === 'missionComplete' || state.shot === 'handover') {
      this.vehicle.state.passengers = 0;
      this.result = this.buildResult(true, null);
      this.phase = 'ended';
      this.events.emit('mission:completed', {});
      return;
    }
    if (state.resume !== 'NONE') {
      this.gameplay.transition({ kind: state.resume });
      this.input.clearPressed();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Setup helpers
  // ---------------------------------------------------------------------------------------------

  private registerScanTargets(): void {
    const add = (
      id: string,
      category: ScanCategory,
      label: string,
      identity: string,
      x: number,
      z: number,
      elevation: number,
      persistent: boolean,
      known: boolean,
    ) => {
      const target: ScannerTarget = {
        id,
        category,
        label,
        identity,
        position: { x, y: this.terrain.heightAt(x, z) + elevation, z },
        persistent,
        discovered: known,
        classified: known,
        lastPing: -Infinity,
        active: true,
      };
      this.scanner.addTarget(target);
    };

    for (const survivor of this.mission.survivors) {
      const [x, z] = survivor.position;
      add(
        survivor.id,
        'SURVIVOR',
        survivor.name.toUpperCase(),
        survivor.report,
        x,
        z,
        SURVIVOR_TARGET_HEIGHT,
        true,
        false,
      );
    }
    for (const supply of this.mission.supplies) {
      const [x, z] = supply.position;
      add(supply.id, 'MEDICAL_SUPPLY', supply.label, supply.label, x, z, 1, true, true);
    }
    for (const hazard of this.mission.hazards) {
      const [x, z] = hazard.position;
      add(hazard.id, 'HAZARD', hazard.label, hazard.warning, x, z, 4, true, false);
    }
    for (const point of this.mission.scanPoints) {
      const [x, z] = point.position;
      add(
        point.id,
        point.category,
        point.label,
        point.identity,
        x,
        z,
        point.elevation,
        false,
        false,
      );
    }
    for (const zone of this.mission.zones) {
      if (!zone.alwaysVisible) continue;
      const [x, z] = zone.position;
      add(`zone:${zone.id}`, 'OBJECTIVE', zone.label, zone.label, x, z, 2, true, true);
    }
  }

  private registerInteractions(): void {
    const radius = this.config.interaction.radius;
    for (const survivor of this.survivors.survivors) {
      const def = survivor.definition;
      this.interaction.register({
        id: `secure:${def.id}`,
        label:
          def.access === 'air'
            ? `WINCH ${def.name.toUpperCase()}`
            : `ASSIST ${def.name.toUpperCase()}`,
        progressLabel:
          def.access === 'air'
            ? 'HOLD HOVER — LOWERING RESCUE HARNESS'
            : 'DEPLOYING THERMAL SHELTER & LOCATOR BEACON',
        position: survivor.position,
        radius,
        duration: SECURE_DURATION,
        requiresMode: def.access === 'air' ? 'FLIGHT' : 'ROVER',
        isAvailable: () => survivor.status === 'missing',
        onComplete: () => {
          this.survivors.secure(def.id, this.time);
          const target = this.scanner.getTarget(def.id);
          if (target) {
            target.discovered = true;
            target.classified = true;
            // Keep the marker only while the survivor still needs something from us.
            target.active = def.needsMedical && !survivor.medicalDelivered;
          }
          this.missionManager.notify({ type: 'survivorSecured', survivorId: def.id });
          this.boardPatient(def.id);
          this.events.emit('survivor:secured', { survivorId: def.id });
          this.events.emit('notification', {
            text: `${def.name.toUpperCase()} SECURED — ${def.report.toUpperCase()}`,
            tone: 'success',
          });
          if (def.needsMedical && !survivor.medicalDelivered) {
            this.events.emit('notification', { text: 'MEDICAL KIT REQUIRED', tone: 'warning' });
          }
        },
      });

      if (!def.needsMedical) continue;
      for (const supply of this.supplies.supplies) {
        this.interaction.register({
          id: `deliver:${supply.definition.id}:${def.id}`,
          label: `DELIVER ${supply.definition.label} TO ${def.callsign}`,
          progressLabel: 'TRANSFERRING MEDICAL KIT',
          position: survivor.position,
          radius,
          duration: DELIVER_DURATION,
          requiresMode: def.access === 'air' ? 'FLIGHT' : 'ROVER',
          isAvailable: () =>
            survivor.status === 'secured' &&
            !survivor.medicalDelivered &&
            this.vehicle.state.payload === supply.definition.id,
          onComplete: () => {
            this.supplies.deliver(supply.definition.id);
            this.survivors.deliverMedical(def.id);
            this.vehicle.state.payload = null;
            const target = this.scanner.getTarget(def.id);
            if (target) target.active = false;
            this.missionManager.notify({
              type: 'supplyDelivered',
              supplyId: supply.definition.id,
              survivorId: def.id,
            });
            this.events.emit('supply:delivered', {
              supplyId: supply.definition.id,
              survivorId: def.id,
            });
            this.boardPatient(def.id);
          },
        });
      }
    }

    for (const supply of this.supplies.supplies) {
      this.interaction.register({
        id: `load:${supply.definition.id}`,
        label: `LOAD ${supply.definition.label}`,
        progressLabel: `SECURING ${supply.definition.label}`,
        position: supply.position,
        radius: INTERACT_RADIUS_SUPPLY,
        duration: LOAD_DURATION,
        requiresMode: 'ROVER',
        isAvailable: () => supply.status === 'available' && this.vehicle.state.payload === null,
        onComplete: () => {
          this.supplies.load(supply.definition.id);
          this.vehicle.state.payload = supply.definition.id;
          const target = this.scanner.getTarget(supply.definition.id);
          if (target) target.active = false;
          this.events.emit('supply:loaded', { supplyId: supply.definition.id });
          this.events.emit('notification', {
            text: `${supply.definition.label} LOADED`,
            tone: 'success',
          });
        },
      });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  private boundaryPush(): [number, number] {
    const { soft, hard } = this.environment.bounds;
    const p = this.vehicle.state.position;
    const extent = Math.max(Math.abs(p.x), Math.abs(p.z));
    const warning = extent > soft;
    if (warning !== this.boundaryWarning) {
      this.boundaryWarning = warning;
      this.events.emit('boundary:warning', { active: warning });
    }
    if (extent <= hard) return [0, 0];
    const strength = BOUNDARY_PUSH * Math.min(1, (extent - hard) / 10 + 0.2);
    return [
      Math.abs(p.x) > hard ? -Math.sign(p.x) * strength : 0,
      Math.abs(p.z) > hard ? -Math.sign(p.z) * strength : 0,
    ];
  }

  private emitIntegrityLevel(): void {
    this.events.emit('integrity:level', { level: this.damage.level });
  }

  private tremorTimer: number = TREMOR_INTERVAL[0];

  /**
   * Ongoing disasters: aftershocks shake the ground at intervals (earthquake zones), and flood
   * water keeps rising while it rains.
   */
  private updateDisasters(dt: number): void {
    if (this.mission.hazards.some((h) => h.kind === 'aftershock')) {
      this.tremorTimer -= dt;
      if (this.tremorTimer <= 0) {
        this.tremorTimer =
          TREMOR_INTERVAL[0] + Math.random() * (TREMOR_INTERVAL[1] - TREMOR_INTERVAL[0]);
        this.events.emit('world:tremor', { intensity: 0.45 + Math.random() * 0.55 });
      }
    }
    const data = this.terrain.data as { floodLevel?: number | null };
    if (data.floodLevel != null && this.environment.flood) {
      data.floodLevel = Math.min(
        this.environment.flood.level + FLOOD_MAX_RISE,
        data.floodLevel + FLOOD_RISE_RATE * dt * (0.4 + this.weather.rainIntensity),
      );
    }
  }

  /** 0..100 condition of the patients carried aboard (100 = arrived as they were loaded). */
  patientCondition = 100;
  private patientWarned = 0;

  private boardPatient(id: string): void {
    if (!this.survivors.board(id)) return;
    const survivor = this.survivors.get(id)!;
    const s = this.vehicle.state;
    s.passengers = this.survivors.passengers;
    s.capsules.push({
      jacket: SURVIVOR_JACKETS[survivor.definition.callsign] ?? '#c0492a',
      x: 0,
    });
    if (s.capsules.length === 2) {
      s.capsules[0]!.x = -SLOT_X;
      s.capsules[1]!.x = SLOT_X;
    }
    this.events.emit('notification', {
      text: `${survivor.definition.name.toUpperCase()} ABOARD — CASUALTY POD SECURED. DRIVE SMOOTHLY`,
      tone: 'info',
    });
  }

  /** Harm to the patients aboard from a jolt (bumps, impacts, hard landings). */
  private jolt(amount: number): void {
    if (this.vehicle.state.passengers === 0 || amount <= 0) return;
    this.patientCondition = Math.max(0, this.patientCondition - amount);
    const level = this.patientCondition < 35 ? 2 : this.patientCondition < 70 ? 1 : 0;
    if (level > this.patientWarned) {
      this.patientWarned = level;
      this.events.emit('notification', {
        text:
          level === 2 ? 'PATIENT CRITICAL — AVOID ALL IMPACTS' : 'PATIENT IN DISTRESS — SLOW DOWN',
        tone: level === 2 ? 'danger' : 'warning',
      });
    }
  }

  buildResult(success: boolean, reason: FailureReason | null): MissionResult {
    return rateMission(
      this.mission,
      {
        survivorsRescued: this.survivors.securedCount,
        survivorsTotal: this.survivors.total,
        batteryRemaining: this.battery.percent,
        integrity: this.damage.integrity,
        timeSeconds: this.missionManager.elapsed,
        scannerAccuracy: this.scanner.accuracy,
        patientCare: this.survivors.survivors.some((s) => s.onBoard)
          ? this.patientCondition / 100
          : 1,
      },
      success,
      reason,
    );
  }

  /** Refreshes and returns the HUD telemetry snapshot. */
  updateTelemetry(): Telemetry {
    const t = this.telemetry;
    const s = this.vehicle.state;
    t.battery = this.battery.percent;
    t.batteryLevel = this.battery.level;
    t.batteryRate = this.battery.rate;
    t.charging = this.charging;
    t.signal = this.signal.percent;
    t.signalState = this.signal.state;
    t.integrity = this.damage.integrity;
    t.integrityLevel = this.damage.level;
    t.recentlyDamaged = this.damage.sinceLastDamage < 0.6;
    t.altitudeAGL = s.altitudeAGL;
    t.altitudeASL = s.altitudeASL;
    t.speedKmh = Math.hypot(s.speed, s.mode === 'FLIGHT' ? s.verticalSpeed : 0) * 3.6;
    t.verticalSpeed = s.verticalSpeed;
    t.headingDeg = (((s.heading * RAD2DEG) % 360) + 360) % 360;
    t.x = s.position.x;
    t.z = s.position.z;
    t.mode = s.mode;
    t.substate = this.gameplay.kind;
    const phase = this.vehicle.transformation.currentPhase;
    t.transformLabel = phase?.label ?? null;
    t.transformProgress = this.vehicle.transformation.progress;
    t.scannerReadiness = this.scanner.readiness;
    t.scannerActive = this.scanner.pulse.active;
    const prompt = this.interaction.prompt;
    t.prompt =
      prompt && this.hasPlayerControl()
        ? { label: prompt.interactable.label, blockedReason: prompt.blockedReason }
        : null;
    const active = this.interaction.active;
    t.interaction = active
      ? { label: active.interactable.progressLabel, progress: this.interaction.progress }
      : null;
    t.payload = s.payload ? (this.supplies.get(s.payload)?.definition.label ?? s.payload) : null;
    t.surface = getSurface(s.surface).label;
    t.traction = Math.min(1, s.traction);
    t.slip = s.slip;
    t.selfRighting = s.selfRighting;
    t.missionTime = this.missionManager.elapsed;
    t.timeRemaining = this.missionManager.timeRemaining;
    const extract = this.missionManager.objectives.find((o) => o.definition.type === 'extract');
    t.extractionProgress = extract && extract.status === 'active' ? extract.progress : 0;
    t.survivorsSecured = this.survivors.securedCount;
    t.survivorsTotal = this.survivors.total;
    t.passengers = this.vehicle.state.passengers;
    t.patientCondition = this.patientCondition;
    t.warnings = this.collectWarnings();
    return t;
  }

  private collectWarnings(): HudWarning[] {
    const list = this.warnings;
    list.length = 0;
    const level = this.battery.level;
    if (level === 'emergency')
      list.push({ id: 'battery', text: 'EMERGENCY POWER', severity: 'critical' });
    else if (level === 'critical')
      list.push({ id: 'battery', text: 'BATTERY CRITICAL', severity: 'critical' });
    else if (level === 'warning')
      list.push({ id: 'battery', text: 'LOW BATTERY', severity: 'warning' });
    if (this.signal.state === 'unstable') {
      list.push({ id: 'signal', text: 'COMMUNICATION LINK UNSTABLE', severity: 'warning' });
    }
    if (this.damage.level === 'critical') {
      list.push({ id: 'integrity', text: 'SYSTEM INTEGRITY CRITICAL', severity: 'critical' });
    }
    for (const hazard of this.hazards.hazards) {
      if (this.hazards.activeHazards.has(hazard.id)) {
        list.push({ id: `hazard:${hazard.id}`, text: hazard.warning, severity: 'critical' });
      }
    }
    if (this.vehicle.state.inWater)
      list.push({ id: 'water', text: 'WATER INGRESS — LEAVE THE RIVER', severity: 'critical' });
    if (this.boundaryWarning)
      list.push({ id: 'bounds', text: 'LEAVING OPERATION AREA', severity: 'caution' });
    return [...list];
  }

  // ---------------------------------------------------------------------------------------------
  // Debug hooks (development only — callers are tree-shaken from production builds)
  // ---------------------------------------------------------------------------------------------

  debugTeleport(x: number, z: number, headingDeg?: number): void {
    if (headingDeg !== undefined) this.vehicle.state.heading = headingDeg * DEG2RAD;
    const height = this.vehicle.state.mode === 'FLIGHT' ? 25 : 1;
    this.vehicle.teleport(x, z, height);
    this.signal.reset(x, this.terrain.heightAt(x, z) + height, z);
  }

  debugRefill(): void {
    this.battery.set(100);
  }
}
