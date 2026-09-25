import type { GameSession } from '@/game/core/GameSession';
import { clamp, damp } from '@/utils/math/scalar';
import type { AudioManager } from './AudioManager';
import type { SoundId } from './SoundEffects';

const SURVIVOR_CALL_INTERVAL = 9;
const SURVIVOR_CALL_RANGE = 180;
const WATER_UPDATE_INTERVAL = 0.5;
const THUNDER_SPEED_OF_SOUND_SCALE = 1;

/**
 * Connects a session to audio: one-shot event sounds plus continuous loops (rotor, engine, wind,
 * rain, river, radio static) driven by live vehicle state.
 */
export class GameAudioDirector {
  private readonly unsubscribers: (() => void)[] = [];
  private rotorLevel = 0;
  private engineLevel = 0;
  private survivorCallTimer = 3;
  private waterTimer = 0;
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
        if (sound === 'transform' || sound === 'rotorSpinUp' || sound === 'rotorSpinDown')
          play(sound);
      }),
      on('transform:rejected', () => play('warning', 0.6)),
      on('vehicle:impact', ({ damage }) => play('impact', clamp(0.4 + damage / 20, 0.4, 1))),
      on('battery:level', ({ level }) => {
        if (level !== 'normal') play('warning');
      }),
      on('integrity:level', ({ level }) => {
        if (level === 'critical') play('warning');
      }),
      on('hazard:entered', () => play('warning')),
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
      on('mission:completed', () => play('missionComplete')),
      on('mission:failed', () => play('missionFail')),
    );
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
    this.audio.setLoop('engine', this.engineLevel, { rate: 0.7 + roverLoad * 0.8 });

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
