import type { EnvironmentDefinition } from '@/data/environments/environmentSchema';
import { getSurface } from '@/data/surfaces/surfaces';
import type { VehicleConfig } from '@/data/vehicles';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { ControlAxes } from '@/game/input/InputManager';
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
import { InteractionSystem } from '@/game/systems/InteractionSystem';
import { RadioSystem } from '@/game/systems/RadioSystem';
import { SignalSystem } from '@/game/systems/SignalSystem';
import { WeatherSystem } from '@/game/systems/WeatherSystem';
import { TerraWingController, type ControlMode } from '@/game/terrawing/TerraWingController';
import { DEG2RAD, RAD2DEG } from '@/utils/math/scalar';
import { EventBus } from './EventBus';
import type { FailureReason, GameEvents } from './GameEvents';
import { GameplayStateMachine, type CinematicShotId, type VehicleMode } from './GameState';
import { createTelemetry, type HudWarning, type Telemetry } from './Telemetry';

/** The subset of input the simulation needs; satisfied by InputManager and by test doubles. */
export interface SessionInput {
  sampleAxes(out: ControlAxes): ControlAxes;
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
};
const FAILURE_DELAY = 2.2;
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

const ZERO_AXES: ControlAxes = { throttle: 0, steer: 0, lift: 0, brake: false };

/**
 * A single run of a mission. Owns every gameplay system and advances them in a fixed-step
 * simulation. Rendering reads from it; React never drives it directly.
 */
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
  private readonly axes: ControlAxes = { throttle: 0, steer: 0, lift: 0, brake: false };
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
        this.events.emit('vehicle:impact', { speed: impact, damage, position: state.position });
        this.emitIntegrityLevel();
      }
    }

    const playerControl = this.phase === 'active' && this.hasPlayerControl();
    if (playerControl) this.input.sampleAxes(this.axes);
    else Object.assign(this.axes, ZERO_AXES);

    if (this.phase === 'active') this.handleDiscreteInput();

    const result = this.vehicle.step(
      this.controlMode(),
      this.axes,
      { wind: this.weather.wind, serviceCeiling: this.environment.bounds.ceiling },
      { tractionMultiplier: this.weather.tractionMultiplier },
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

    const [pushX, pushZ] = this.boundaryPush();
    this.vehicle.apply(pushX, pushZ);

    this.updateSystems(dt);
    this.updateCinematic(dt);
    this.updateEnding(dt);
  }

  private hasPlayerControl(): boolean {
    const kind = this.gameplay.kind;
    return kind === 'FLIGHT' || kind === 'ROVER';
  }

  private controlMode(): ControlMode {
    if (this.phase === 'ending') return 'hold';
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

    if (kind === 'CINEMATIC') {
      const state = this.gameplay.state;
      if ((scan || interact) && state.kind === 'CINEMATIC' && state.shot === 'missionIntro') {
        this.endCinematic();
      }
      return;
    }
    if (scan) this.tryScan();
    if (interact && (kind === 'FLIGHT' || kind === 'ROVER')) this.handleInteractKey();
  }

  private handleInteractKey(): void {
    const prompt = this.interaction.prompt;
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
    this.interaction.updatePrompt(s.position.x, s.position.y, s.position.z, mode, s.grounded);
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

    const update = this.missionManager.update(dt, ctx);
    for (const objective of update.completed) {
      this.events.emit('objective:completed', {
        objectiveId: objective.definition.id,
        label: objective.definition.label,
      });
    }
    if (update.missionCompleted) {
      this.beginEnding();
      this.startCinematic('missionComplete', 'NONE');
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
    if (this.cinematicTime >= CINEMATIC_DURATIONS[state.shot]) this.endCinematic();
  }

  get cinematicProgress(): number {
    const state = this.gameplay.state;
    if (state.kind !== 'CINEMATIC') return 0;
    return Math.min(1, this.cinematicTime / CINEMATIC_DURATIONS[state.shot]);
  }

  private endCinematic(): void {
    const state = this.gameplay.state;
    if (state.kind !== 'CINEMATIC') return;
    this.events.emit('cinematic:finished', { shot: state.shot });
    if (state.shot === 'missionComplete') {
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
        label: `ASSIST ${def.name.toUpperCase()}`,
        progressLabel: 'DEPLOYING THERMAL SHELTER & LOCATOR BEACON',
        position: survivor.position,
        radius,
        duration: SECURE_DURATION,
        requiresMode: 'ROVER',
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
          requiresMode: 'ROVER',
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
    t.missionTime = this.missionManager.elapsed;
    t.timeRemaining = this.missionManager.timeRemaining;
    const extract = this.missionManager.objectives.find((o) => o.definition.type === 'extract');
    t.extractionProgress = extract && extract.status === 'active' ? extract.progress : 0;
    t.survivorsSecured = this.survivors.securedCount;
    t.survivorsTotal = this.survivors.total;
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

  debugTeleport(x: number, z: number): void {
    const height = this.vehicle.state.mode === 'FLIGHT' ? 25 : 1;
    this.vehicle.teleport(x, z, height);
    this.signal.reset(x, this.terrain.heightAt(x, z) + height, z);
  }

  debugRefill(): void {
    this.battery.set(100);
  }
}
