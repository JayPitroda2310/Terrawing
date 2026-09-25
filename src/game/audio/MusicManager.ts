import type { AudioManager } from './AudioManager';
import type { SoundId } from './SoundEffects';

const CROSSFADE_MS = 2500;

export type MusicTrack = Extract<SoundId, 'musicAmbient' | 'musicMenu'>;

/** Crossfades between music tracks. Only one track plays at a time. */
export class MusicManager {
  private current: MusicTrack | null = null;

  constructor(private readonly audio: AudioManager) {}

  play(track: MusicTrack | null, volume = 1): void {
    if (track === this.current) return;
    const previous = this.current;
    this.current = track;
    if (previous) {
      this.audio.fadeLoop(previous, 0, CROSSFADE_MS);
      setTimeout(() => {
        if (this.current !== previous) this.audio.setLoop(previous, 0);
      }, CROSSFADE_MS + 50);
    }
    if (track) {
      // Start just above the silence threshold, then fade in.
      this.audio.setLoop(track, 0.002);
      this.audio.fadeLoop(track, volume, CROSSFADE_MS);
    }
  }
}
