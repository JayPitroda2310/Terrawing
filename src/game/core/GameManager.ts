import { getEnvironment } from '@/data/environments';
import { loadMission } from '@/data/missions';
import { getVehicle } from '@/data/vehicles';
import { AudioManager } from '@/game/audio/AudioManager';
import { MusicManager } from '@/game/audio/MusicManager';
import { getTerrain } from '@/game/environment/terrainCache';
import type { GameAction } from '@/game/input/actions';
import { InputManager } from '@/game/input/InputManager';
import type { Settings } from '@/services/save/saveSchema';
import { saveService, type SaveService } from '@/services/save/SaveService';
import { useGameStore } from '@/store/gameStore';
import { useMissionStore, type ObjectiveView } from '@/store/missionStore';
import { useProgressStore } from '@/store/progressStore';
import { useSettingsStore } from '@/store/settingsStore';
import { narrator } from '@/services/audio/narrator';
import { useTelemetryStore } from '@/store/telemetryStore';
import { formatDistance } from '@/utils/helpers/format';
import { logger } from '@/utils/helpers/logger';
import { IntervalGate } from '@/utils/performance/throttle';
import { GameSession } from './GameSession';
import { isMissionScreen, Screen } from './GameState';

const TELEMETRY_INTERVAL = 0.1;
const OBJECTIVE_INTERVAL = 0.5;
const FEED_LIFETIME_MS = 5000;
const RADIO_LIFETIME_MS = 7000;
/** Ignore the Escape keydown that immediately follows a pointer-lock loss (same key press). */
const PAUSE_DEBOUNCE_MS = 250;

/**
 * Top-level orchestrator. Owns long-lived services (input, audio, save) and the active session,
 * and translates between the gameplay layer and the React stores.
 */
export class GameManager {
  readonly input = new InputManager();
  readonly audio = new AudioManager();
  readonly music = new MusicManager(this.audio);
  private readonly telemetryGate = new IntervalGate(TELEMETRY_INTERVAL);
  private readonly objectiveGate = new IntervalGate(OBJECTIVE_INTERVAL);
  private sessionUnsubscribers: (() => void)[] = [];
  private readonly disposers: (() => void)[] = [];
  private lastAutoPause = 0;
  private initialized = false;
  /** Incremented on every init/dispose so an init that was disposed mid-await bails out. */
  private generation = 0;

  constructor(private readonly saves: SaveService = saveService) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const generation = ++this.generation;
    const save = await this.saves.init();
    // React StrictMode (and hot reload) may dispose us while the save was loading.
    if (generation !== this.generation) return;
    useSettingsStore.getState().hydrate(save.settings);
    useProgressStore.getState().setProgress(save.progress);
    this.applySettings(save.settings);

    this.disposers.push(
      useSettingsStore.subscribe((state, previous) => {
        if (state.settings === previous.settings) return;
        this.applySettings(state.settings);
        this.saves.updateSettings(state.settings);
      }),
      useGameStore.subscribe((state, previous) => {
        if (state.screen !== previous.screen) this.onScreenChanged(state.screen, previous.screen);
      }),
      this.input.onAction((action) => this.onAction(action)),
      this.input.mouse.onLockChange((locked) => this.onPointerLockChange(locked)),
    );
    this.input.attach();
    const unlock = () => this.unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const visibility = () => {
      if (document.hidden && useGameStore.getState().screen === Screen.PLAYING) this.pause();
    };
    document.addEventListener('visibilitychange', visibility);
    this.disposers.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      () => document.removeEventListener('visibilitychange', visibility),
    );
    this.input.setEnabled(false);
  }

  dispose(): void {
    this.generation++;
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.endSession();
    this.input.detach();
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------------------------

  navigate(screen: Screen): void {
    useGameStore.getState().setScreen(screen);
  }

  openBriefing(missionId: string): void {
    const result = loadMission(missionId);
    if (!result.ok) {
      logger.error('mission', `Mission "${missionId}" is invalid`, result.errors);
      useGameStore
        .getState()
        .setFatalError(`Mission data is invalid:\n${result.errors.join('\n')}`);
      return;
    }
    useGameStore.getState().setSelectedMission(missionId);
    this.navigate(Screen.MISSION_BRIEFING);
  }

  /** Creates the session and shows the loading screen while the world mounts. */
  beginMission(): void {
    const store = useGameStore.getState();
    const result = loadMission(store.selectedMissionId);
    if (!result.ok) {
      store.setFatalError(`Mission data is invalid:\n${result.errors.join('\n')}`);
      return;
    }
    this.endSession();
    const mission = result.mission;
    try {
      const environment = getEnvironment(mission.environment);
      const session = new GameSession({
        mission,
        environment,
        vehicle: getVehicle(mission.vehicle),
        terrain: getTerrain(environment),
        input: this.input,
      });
      useMissionStore.getState().reset();
      store.setLastResult(null);
      store.setSession(session);
      this.bindSession(session);
      this.navigate(Screen.LOADING);
    } catch (error) {
      logger.error('mission', 'Failed to create mission session', error);
      store.setFatalError(error instanceof Error ? error.message : String(error));
    }
  }

  /** Called by the world once physics and the vehicle body are ready. */
  onWorldReady(session: GameSession): void {
    const store = useGameStore.getState();
    if (store.session !== session || store.screen !== Screen.LOADING) return;
    session.start();
    this.publishObjectives(session);
    // Show the controls demo before play starts (skipped for automated browser tests).
    const automated = typeof navigator !== 'undefined' && navigator.webdriver;
    store.setControlsIntro(!automated);
    this.navigate(Screen.PLAYING);
  }

  /** Closes the controls demo and lets the mission run. */
  finishControlsIntro(): void {
    useGameStore.getState().setControlsIntro(false);
    this.input.clearPressed();
    this.input.mouse.requestLock();
  }

  pause(): void {
    if (useGameStore.getState().screen !== Screen.PLAYING) return;
    this.navigate(Screen.PAUSED);
  }

  resume(): void {
    if (useGameStore.getState().screen !== Screen.PAUSED) return;
    this.navigate(Screen.PLAYING);
    this.input.mouse.requestLock();
  }

  retry(): void {
    this.beginMission();
  }

  quitToMenu(): void {
    narrator.cancel();
    useGameStore.getState().setControlsIntro(false);
    this.endSession();
    this.navigate(Screen.MAIN_MENU);
  }

  openSettings(): void {
    this.navigate(Screen.SETTINGS);
  }

  closeSettings(): void {
    this.navigate(useGameStore.getState().settingsReturn);
  }

  // ---------------------------------------------------------------------------------------------
  // Frame hook — called from the render loop
  // ---------------------------------------------------------------------------------------------

  onFrame(dt: number): void {
    this.input.poll();
    const session = useGameStore.getState().session;
    if (!session) return;
    if (this.telemetryGate.tick(dt)) {
      useTelemetryStore.getState().publish(session.updateTelemetry());
      const now = performance.now();
      const missionStore = useMissionStore.getState();
      missionStore.expireFeed(now, FEED_LIFETIME_MS);
      if (missionStore.radio && now - missionStore.radio.createdAt > RADIO_LIFETIME_MS)
        missionStore.setRadio(null);
    }
    if (this.objectiveGate.tick(dt)) this.publishObjectives(session);
  }

  // ---------------------------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------------------------

  private bindSession(session: GameSession): void {
    const events = session.events;
    const feed = useMissionStore.getState().pushFeed;
    this.sessionUnsubscribers = [
      events.on('notification', ({ text, tone }) => feed(text, tone)),
      events.on('objective:completed', ({ label }) => {
        feed(`OBJECTIVE COMPLETE — ${label.toUpperCase()}`, 'success');
        this.publishObjectives(session);
      }),
      events.on('transform:rejected', ({ reason }) => feed(reason, 'warning')),
      events.on('scan:rejected', ({ reason }) => feed(reason, 'info')),
      events.on('scan:detected', ({ targetId, classified, distance }) => {
        const target = session.scanner.getTarget(targetId);
        if (!target) return;
        const label = classified ? target.label : 'UNKNOWN SIGNAL';
        feed(
          `${label} DETECTED — ${formatDistance(distance)}`,
          classified && target.category === 'SURVIVOR' ? 'success' : 'info',
        );
      }),
      events.on('hazard:entered', ({ warning }) => feed(warning, 'danger')),
      events.on('battery:level', ({ level }) => {
        if (level === 'warning') feed('BATTERY LOW — 20%', 'warning');
        if (level === 'critical') feed('BATTERY CRITICAL — 10%', 'danger');
        if (level === 'emergency') feed('EMERGENCY POWER — 5%', 'danger');
      }),
      events.on('signal:state', ({ state }) => {
        // "Unstable" is shown by the persistent HUD warning; only announce recovery here.
        if (state === 'good') feed('RELAY LINK RESTORED', 'info');
      }),
      events.on('supply:delivered', () => feed('MEDICAL KIT DELIVERED', 'success')),
      events.on('radio:message', ({ id, speaker, text }) => {
        useMissionStore.getState().setRadio({ id, speaker, text, createdAt: performance.now() });
        const settings = useSettingsStore.getState().settings;
        const clip = narrator.radioClip(session.mission.id, id);
        if (settings.voiceNarration && clip) {
          narrator.play(clip, { volume: settings.masterVolume * settings.sfxVolume });
        }
      }),
      events.on('mission:completed', () => this.finishMission(session)),
      events.on('mission:failed', () => this.finishMission(session)),
    ];
  }

  private finishMission(session: GameSession): void {
    const result = session.result;
    if (!result) return;
    const progress = this.saves.recordMission(result, session.mission.rewards.unlocks);
    useProgressStore.getState().setProgress(progress);
    useGameStore.getState().setLastResult(result);
    this.input.mouse.releaseLock();
    this.navigate(result.success ? Screen.MISSION_COMPLETE : Screen.MISSION_FAILED);
  }

  private endSession(): void {
    for (const unsubscribe of this.sessionUnsubscribers) unsubscribe();
    this.sessionUnsubscribers = [];
    const store = useGameStore.getState();
    store.session?.dispose();
    store.setSession(null);
    useMissionStore.getState().reset();
  }

  private publishObjectives(session: GameSession): void {
    const state = session.vehicle.state;
    const views: ObjectiveView[] = session.missionManager.objectives.map((objective) => {
      const def = objective.definition;
      let detail: string | null = null;
      if (objective.status !== 'completed') {
        switch (def.type) {
          case 'secureSurvivor': {
            const target = session.scanner.getTarget(def.survivorId);
            const survivor = session.survivors.get(def.survivorId);
            if (target?.discovered && survivor) {
              detail = formatDistance(
                Math.hypot(
                  survivor.position.x - state.position.x,
                  survivor.position.z - state.position.z,
                ),
              );
            } else detail = 'NO SIGNAL — USE SCANNER';
            break;
          }
          case 'deliverSupply':
            detail = state.payload === def.supplyId ? 'KIT ON BOARD' : 'COLLECT AT BASE';
            break;
          case 'reachZone':
          case 'extract': {
            const zone = session.zones.get(def.zoneId);
            if (zone && objective.status === 'active') {
              detail =
                def.type === 'extract' && objective.progress > 0
                  ? `HOLD ${Math.round(objective.progress * 100)}%`
                  : formatDistance(zone.distanceTo(state.position.x, state.position.z));
            }
            break;
          }
          case 'scan':
          case 'deploy':
            break;
        }
      }
      const previous = useMissionStore.getState().objectives.find((o) => o.id === def.id);
      return {
        id: def.id,
        label: def.label,
        status: objective.status,
        optional: def.optional,
        detail,
        completedAt:
          objective.status === 'completed' ? (previous?.completedAt ?? performance.now()) : null,
      };
    });
    useMissionStore.getState().setObjectives(views);
  }

  private onScreenChanged(screen: Screen, previous: Screen): void {
    this.input.setEnabled(screen === Screen.PLAYING);
    this.audio.setSuspended(
      screen === Screen.PAUSED || (screen === Screen.SETTINGS && previous === Screen.PAUSED),
    );
    if (screen !== Screen.PLAYING) this.input.mouse.releaseLock();
    this.updateMusic(screen);
  }

  private updateMusic(screen: Screen): void {
    if (!this.audio.ready) return;
    const inMission =
      isMissionScreen(screen) ||
      (screen === Screen.SETTINGS && useGameStore.getState().session !== null);
    this.music.play(inMission ? 'musicAmbient' : 'musicMenu', inMission ? 0.55 : 1);
  }

  private unlockAudio(): void {
    this.audio.init();
    this.applySettings(useSettingsStore.getState().settings);
    this.updateMusic(useGameStore.getState().screen);
  }

  private onAction(action: GameAction): void {
    const store = useGameStore.getState();
    if (action === 'pause') {
      if (performance.now() - this.lastAutoPause < PAUSE_DEBOUNCE_MS) return;
      if (store.screen === Screen.PLAYING) this.pause();
      else if (store.screen === Screen.PAUSED) this.resume();
    } else if (action === 'debug' && import.meta.env.DEV) {
      store.toggleDebug();
    }
  }

  private onPointerLockChange(locked: boolean): void {
    useGameStore.getState().setPointerLocked(locked);
    // Browsers consume Escape to exit pointer lock, so treat losing the lock as a pause request.
    if (!locked && useGameStore.getState().screen === Screen.PLAYING) {
      this.lastAutoPause = performance.now();
      this.pause();
    }
  }

  private applySettings(settings: Settings): void {
    this.input.setBindings(settings.keyBindings);
    this.input.setLookSettings({
      sensitivity: settings.mouseSensitivity,
      invertY: settings.invertY,
    });
    this.audio.setVolumes({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
    });
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  }
}
