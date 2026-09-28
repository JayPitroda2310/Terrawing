import type { GameSession } from '@/game/core/GameSession';
import { type AmbulancePose, ambulanceAt } from '@/game/rescue/handover';
import { clamp, damp } from '@/utils/math/scalar';
import type { AudioManager } from './AudioManager';
import type { SoundId } from './SoundEffects';

const SURVIVOR_CALL_INTERVAL = 9;
/** Suspension activity (m/s) above which a bump is audible. */
const BUMP_SOUND_THRESHOLD = 0.9;
const BUMP_SOUND_COOLDOWN = 0.18;
const SURVIVOR_CALL_RANGE = 180;
const WATER_UPDATE_INTERVAL = 0.5;
const THUNDER_SPEED_OF_SOUND_SCALE = 1;

/**
 * Connects a session to audio: one-shot event sounds plus continuous loops (rotor, engine, wind,
 * rain, river, radio static) driven by live vehicle state.
 */
/** Sounds that transformation phases may request (see the vehicle's transform phase data). */
const TRANSFORM_SOUNDS: ReadonlySet<string> = new Set([
  'transform',
  'rotorSpinUp',
  'rotorSpinDown',
  'armFold',
  'armUnfold',
  'wheelsDeploy',
  'wheelsRetract',
  'chassisLower',
  'chassisRaise',
]);

export class GameAudioDirector {
  private readonly unsubscribers: (() => void)[] = [];
  private rotorLevel = 0;
  private engineLevel = 0;
  private bumpCooldown = 0;
  private survivorCallTimer = 3;
  private waterTimer = 0;
  /** Danger alarm: steady beeps whose rate rises smoothly with the danger (0..1). */
  private alarmDanger = 0;
  private alarmTimer = 0;
  private readonly waterPosition = { x: 0, y: 0, z: 0 };
  private readonly timeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly session: GameSession,
    private readonly audio: AudioManager,
  ) {
    const on = session.events.on.bind(session.events);
    const play = (id: SoundId, volume?: number) => this.audio.play(id, { volume });
    this.unsubscribers.push(
      on('scan:pulse', () => play('scanPing')),
      on('scan:detected', ({ classified }) => play('scanDetect', classified ? 1 : 0.6)),
      on('scan:rejected', () => play('uiClick', 0.6)),
      on('transform:phase', ({ sound }) => {
        if (sound && TRANSFORM_SOUNDS.has(sound)) play(sound as SoundId);
      }),
      on('transform:rejected', () => play('warning', 0.6)),
      on('vehicle:impact', ({ damage }) => play('impact', clamp(0.4 + damage / 20, 0.4, 1))),
      on('battery:level', ({ level }) => {
        if (level !== 'normal') play('warning');
      }),
      on('radio:message', () => play('radio')),
      on('objective:completed', () => play('objective')),
      on('interaction:started', () => play('interact')),
      on('supply:loaded', () => play('uiConfirm')),
      on('weather:thunder', ({ intensity, delay }) => {
        this.timeouts.push(
          setTimeout(
            () => this.audio.play('thunder', { volume: intensity }),
            delay * 1000 * THUNDER_SPEED_OF_SOUND_SCALE,
          ),
        );
      }),
      // Aftershock: a deep ground rumble (the thunder recording slowed right down).
      on('world:tremor', ({ intensity }) =>
        this.audio.play('thunder', { volume: 0.5 + intensity * 0.5, rate: 0.45 }),
      ),
      // A tree or boulder crashing down: a heavy, low thud where it lands.
      on('world:crash', ({ x, y, z, size }) =>
        this.audio.play('impact', { volume: 0.35 + size * 0.65, rate: 0.5, position: { x, y, z } }),
      ),
      on('mission:completed', () => play('missionComplete')),
      on('mission:failed', () => play('missionFail')),
    );
  }

  private readonly sirenPose: AmbulancePose = {
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    accel: 0,
    s: 0,
    visible: false,
  };

  /**
   * Ambulance sirens during the patient handover: on while racing in and pulling away, off while
   * parked. Positional, with Doppler shift from the ambulance's speed toward the listener.
   */
  private updateSirens(listener: { x: number; y: number; z: number }): void {
    const session = this.session;
    const plan = session.handover;
    const state = session.gameplay.state;
    const active = plan && session.phase !== 'ended';
    void state;
    for (let k = 0; k < 2; k++) {
      const unit = active ? plan.units[k] : undefined;
      const key = `amb${k}`;
      if (!unit) {
        this.audio.setLoop('siren', 0, { key });
        continue;
      }
      const t = session.handoverTime;
      const pose = ambulanceAt(plan!, unit, t, this.sirenPose);
      const on = (t >= unit.start && t < unit.arrive - 0.6) || t > unit.depart + 1.5;
      const y = session.terrain.heightAt(pose.x, pose.z) + 2.5;
      const dx = listener.x - pose.x;
      const dz = listener.z - pose.z;
      const d = Math.hypot(dx, dz) || 1;
      const closing = (Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz) * (pose.speed / d);
      this.audio.setLoop('siren', on ? 1 : 0, {
        key,
        position: { x: pose.x, y, z: pose.z },
        rate: 343 / (343 - clamp(closing, -60, 60)),
      });
    }
  }

  /** Called every rendered frame with the listener (camera) transform. */
  update(
    dt: number,
    listener: { x: number; y: number; z: number; fx: number; fy: number; fz: number },
  ): void {
    const session = this.session;
    const state = session.vehicle.state;
    this.audio.setListener(
      listener.x,
      listener.y,
      listener.z,
      listener.fx,
      listener.fy,
      listener.fz,
    );

    // Rotor: volume and pitch follow rotor speed, load and climb.
    const load = clamp(state.speed / 30 + Math.max(0, state.lift) * 0.4, 0, 1);
    this.rotorLevel = damp(this.rotorLevel, state.rig.rotorSpeed, 6, dt);
    this.audio.setLoop('rotor', this.rotorLevel * (0.55 + 0.45 * load), {
      rate: 0.6 + this.rotorLevel * (0.45 + 0.25 * load),
    });

    const roverActive = state.rig.wheelDeploy > 0.9 ? 1 : 0;
    const roverLoad = clamp(Math.abs(state.forwardSpeed) / 16, 0, 1);
    this.engineLevel = damp(this.engineLevel, roverActive * (0.25 + 0.75 * roverLoad), 5, dt);
    // Wheelspin makes the motor rev up without the rover going faster.
    const spin = roverActive * state.slip * Math.abs(state.throttle);
    this.audio.setLoop('engine', this.engineLevel, { rate: 0.7 + roverLoad * 0.8 + spin * 0.6 });

    // Suspension thuds: stones, ruts and hard landings are heard, not only seen.
    this.bumpCooldown -= dt;
    if (roverActive && state.suspensionActivity > BUMP_SOUND_THRESHOLD && this.bumpCooldown <= 0) {
      this.bumpCooldown = BUMP_SOUND_COOLDOWN;
      this.audio.play('impact', {
        volume: clamp((state.suspensionActivity - BUMP_SOUND_THRESHOLD) * 0.25, 0.08, 0.45),
        rate: 1.3,
      });
    }

    // Ambience.
    const weather = session.weather;
    const altitudeWind = clamp(state.altitudeAGL / 80, 0, 1);
    this.audio.setLoop('wind', 0.35 + 0.35 * altitudeWind + clamp(state.speed / 40, 0, 0.3));
    this.audio.setLoop('rain', weather.rainIntensity * 1.4);
    this.audio.setLoop('forest', state.surface === 1 ? 0.8 : 0.35);

    this.waterTimer -= dt;
    if (this.waterTimer <= 0) {
      this.waterTimer = WATER_UPDATE_INTERVAL;
      // Place the river emitter at the closest point of the river to the listener.
      session.terrain.nearestRiverPoint(listener.x, listener.z, this.waterPosition);
    }
    this.audio.setLoop('water', 1, { position: this.waterPosition });

    const base = session.zones.get('base');
    if (base) this.audio.setLoop('machinery', 1, { position: base.position });
    this.updateSirens(listener);

    // Danger alarm, like factory machinery: evenly spaced beeps that speed up smoothly while the
    // vehicle is being damaged by a hazard or its integrity is critical, and stop when safe.
    const integrity = session.damage.integrity;
    const critical = session.vehicle.config.damage.thresholds.critical;
    const inHazard = session.hazards.activeHazards.size > 0;
    const damageDanger = clamp((critical - integrity) / critical, 0, 1);
    const target =
      inHazard || integrity <= critical
        ? Math.max(inHazard ? 0.25 : 0, 0.2 + 0.8 * damageDanger)
        : 0;
    // Danger builds up the longer you stay exposed, and eases off gently once clear.
    this.alarmDanger =
      target > this.alarmDanger
        ? Math.min(target + (inHazard ? 0.6 : 0), this.alarmDanger + dt * (inHazard ? 0.12 : 0.5))
        : Math.max(target, this.alarmDanger - dt * 0.8);
    if (this.alarmDanger > 0.01) {
      const interval = 1.0 - 0.82 * clamp(this.alarmDanger, 0, 1); // 1.0 s → 0.18 s between beeps
      this.alarmTimer -= dt;
      if (this.alarmTimer <= 0) {
        this.alarmTimer += interval;
        if (this.alarmTimer < 0) this.alarmTimer = interval;
        this.audio.play('alarmBeep', { volume: 0.55 + 0.35 * clamp(this.alarmDanger, 0, 1) });
      }
    } else this.alarmTimer = 0;

    // Radio static grows as the relay link degrades.
    const signalLoss = clamp(1 - session.signal.percent / 60, 0, 1);
    this.audio.setLoop('radioStatic', signalLoss * signalLoss);

    // Distress whistles from survivors still waiting for help — a navigation aid.
    this.survivorCallTimer -= dt;
    if (this.survivorCallTimer <= 0) {
      this.survivorCallTimer = SURVIVOR_CALL_INTERVAL;
      for (const survivor of session.survivors.survivors) {
        if (survivor.status === 'secured') continue;
        const d = Math.hypot(
          survivor.position.x - state.position.x,
          survivor.position.z - state.position.z,
        );
        if (d < SURVIVOR_CALL_RANGE) {
          this.audio.play('survivorCall', {
            position: { ...survivor.position, y: survivor.position.y + 1.5 },
          });
          break;
        }
      }
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    for (const timeout of this.timeouts) clearTimeout(timeout);
    this.audio.stopLoops((id) => id !== 'musicAmbient' && id !== 'musicMenu');
  }
}
