import { Howl, Howler } from 'howler';
import { logger } from '@/utils/helpers/logger';
import { SOUNDS, type SoundCategory, type SoundDefinition, type SoundId } from './SoundEffects';
import { synthesize } from './SynthSounds';

export interface VolumeSettings {
  master: number;
  music: number;
  sfx: number;
}

export interface PlayOptions {
  volume?: number;
  rate?: number;
  position?: { x: number; y: number; z: number };
}

interface LoopHandle {
  id: number;
  volume: number;
}

/**
 * Wraps Howler. Sounds are created lazily after the first user gesture (browser autoplay policy).
 * Every sound resolves to either its configured file or a synthesized fallback.
 */
export class AudioManager {
  private readonly howls = new Map<SoundId, Howl>();
  private readonly loops = new Map<string, LoopHandle>();
  private volumes: VolumeSettings = { master: 0.8, music: 0.5, sfx: 0.8 };
  private initialized = false;
  private suspended = false;

  get ready(): boolean {
    return this.initialized;
  }

  /** Creates all sounds. Safe to call repeatedly; must follow a user gesture. */
  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    Howler.volume(this.volumes.master);
    for (const id of Object.keys(SOUNDS) as SoundId[]) {
      try {
        this.howls.set(id, this.createHowl(id, SOUNDS[id]));
      } catch (error) {
        logger.warn('audio', `Could not create sound "${id}"`, error);
      }
    }
  }

  setVolumes(volumes: VolumeSettings): void {
    this.volumes = volumes;
    Howler.volume(volumes.master);
    for (const [key, handle] of this.loops) {
      const id = key.split('#')[0] as SoundId;
      this.howls.get(id)?.volume(this.effectiveVolume(id, handle.volume), handle.id);
    }
  }

  /** Pauses all audio (e.g. game paused / tab hidden). */
  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    for (const [key, handle] of this.loops) {
      const id = key.split('#')[0] as SoundId;
      if (SOUNDS[id].category === 'music') continue;
      const howl = this.howls.get(id);
      if (!howl) continue;
      if (suspended) howl.pause(handle.id);
      else howl.play(handle.id);
    }
  }

  play(id: SoundId, options: PlayOptions = {}): number | null {
    const howl = this.howls.get(id);
    if (!howl || this.suspended) return null;
    const soundId = howl.play();
    howl.volume(this.effectiveVolume(id, options.volume ?? 1), soundId);
    if (options.rate) howl.rate(options.rate, soundId);
    if (options.position) this.position(howl, soundId, options.position);
    return soundId;
  }

  /**
   * Starts, updates or stops a looping sound. `key` lets several instances of one sound coexist
   * (e.g. multiple positional water sources).
   */
  setLoop(
    id: SoundId,
    volume: number,
    options: { rate?: number; position?: PlayOptions['position']; key?: string } = {},
  ): void {
    const howl = this.howls.get(id);
    if (!howl) return;
    const loopKey = `${id}#${options.key ?? ''}`;
    let handle = this.loops.get(loopKey);
    if (volume <= 0.001) {
      if (handle) {
        howl.stop(handle.id);
        this.loops.delete(loopKey);
      }
      return;
    }
    if (!handle) {
      const soundId = howl.play();
      handle = { id: soundId, volume };
      this.loops.set(loopKey, handle);
      if (this.suspended && SOUNDS[id].category !== 'music') howl.pause(soundId);
    }
    handle.volume = volume;
    howl.volume(this.effectiveVolume(id, volume), handle.id);
    if (options.rate !== undefined) howl.rate(options.rate, handle.id);
    if (options.position) this.position(howl, handle.id, options.position);
  }

  fadeLoop(id: SoundId, to: number, durationMs: number, key = ''): void {
    const howl = this.howls.get(id);
    const handle = this.loops.get(`${id}#${key}`);
    if (!howl || !handle) {
      if (to > 0) this.setLoop(id, to, { key });
      return;
    }
    howl.fade(
      howl.volume(handle.id) as number,
      this.effectiveVolume(id, to),
      durationMs,
      handle.id,
    );
    handle.volume = to;
  }

  stopLoops(filter: (id: SoundId) => boolean = () => true): void {
    for (const [key, handle] of this.loops) {
      const id = key.split('#')[0] as SoundId;
      if (!filter(id)) continue;
      this.howls.get(id)?.stop(handle.id);
      this.loops.delete(key);
    }
  }

  setListener(
    x: number,
    y: number,
    z: number,
    forwardX: number,
    forwardY: number,
    forwardZ: number,
  ): void {
    if (!this.initialized) return;
    Howler.pos(x, y, z);
    Howler.orientation(forwardX, forwardY, forwardZ, 0, 1, 0);
  }

  private position(howl: Howl, soundId: number, p: { x: number; y: number; z: number }): void {
    howl.pos(p.x, p.y, p.z, soundId);
  }

  private effectiveVolume(id: SoundId, volume: number): number {
    const def: SoundDefinition = SOUNDS[id];
    return def.volume * volume * this.categoryVolume(def.category);
  }

  private categoryVolume(category: SoundCategory): number {
    return category === 'music' ? this.volumes.music : this.volumes.sfx;
  }

  private createHowl(id: SoundId, def: SoundDefinition): Howl {
    const fallback = () => synthesize(def.synth);
    const spatial = def.spatial;
    const options = {
      loop: def.loop ?? false,
      volume: def.volume,
      html5: false,
      ...(spatial
        ? {
            pannerAttr: {
              panningModel: 'HRTF' as const,
              distanceModel: 'inverse' as const,
              refDistance: spatial.refDistance,
              rolloffFactor: spatial.rolloff,
              maxDistance: spatial.maxDistance,
            },
          }
        : {}),
    };
    if (def.src && def.src.length > 0) {
      const howl = new Howl({
        ...options,
        src: def.src,
        onloaderror: (_soundId, error) => {
          logger.warn(
            'audio',
            `Failed to load "${id}" from ${def.src?.join(', ')}; using placeholder.`,
            error,
          );
          this.howls.set(id, new Howl({ ...options, src: [fallback()], format: ['wav'] }));
        },
      });
      return howl;
    }
    return new Howl({ ...options, src: [fallback()], format: ['wav'] });
  }
}
