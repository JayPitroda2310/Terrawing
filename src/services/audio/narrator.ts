import voice from '@/data/voice.json';

/**
 * Plays pre-recorded voice clips (neural voices recorded offline, in public/assets/voice): mission
 * briefing narration and base radio calls. One clip plays at a time; a new one interrupts it.
 */

/** A briefing recorded as one continuous take, with caption cards timed to the voice. */
export interface Briefing {
  src: string;
  duration: number;
  captions: { text: string; start: number }[];
}

const BRIEFINGS = voice.briefings as Record<string, Briefing>;
const RADIO = voice.radio as Record<string, Record<string, string>>;

let current: HTMLAudioElement | null = null;

function stop(): void {
  if (!current) return;
  current.onended = null;
  current.onerror = null;
  current.ontimeupdate = null;
  current.pause();
  current = null;
}

export const narrator = {
  /** Narrated briefing for a mission. */
  briefing(missionId: string): Briefing | null {
    return BRIEFINGS[missionId] ?? null;
  },

  /** Recorded radio call for a mission's radio message, if there is one. */
  radioClip(missionId: string, messageId: string): string | null {
    return RADIO[missionId]?.[messageId] ?? null;
  },

  /** Plays a clip, interrupting anything playing. `onEnd` fires once when it finishes or fails. */
  play(
    src: string,
    {
      volume = 1,
      onEnd,
      onTime,
    }: { volume?: number; onEnd?: () => void; onTime?: (seconds: number) => void } = {},
  ): void {
    stop();
    const audio = new Audio(src);
    audio.volume = Math.max(0, Math.min(1, volume));
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      if (current === audio) current = null;
      onEnd?.();
    };
    audio.onended = done;
    audio.onerror = done;
    if (onTime) audio.ontimeupdate = () => onTime(audio.currentTime);
    current = audio;
    // Autoplay can be refused before the first user gesture; the caller then simply moves on.
    audio.play().catch(done);
  },

  cancel(): void {
    stop();
  },

  /** Every recorded clip for a mission: the briefing and its radio calls. */
  missionClips(missionId: string): string[] {
    const briefing = BRIEFINGS[missionId]?.src;
    return [...(briefing ? [briefing] : []), ...Object.values(RADIO[missionId] ?? {})];
  },

  /**
   * Downloads clips into the browser cache so they play instantly and without gaps; `onProgress`
   * receives 0..1 by bytes. Resolves when all are done (a failed clip just plays later).
   */
  async preload(
    sources: readonly string[],
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    const loaded = new Array<number>(sources.length).fill(0);
    const totals = new Array<number>(sources.length).fill(0);
    const report = () => {
      const total = totals.reduce((a, b) => a + b, 0);
      onProgress?.(total > 0 ? loaded.reduce((a, b) => a + b, 0) / total : 0);
    };
    await Promise.all(
      sources.map(async (src, i) => {
        try {
          const response = await fetch(src);
          totals[i] = Number(response.headers.get('content-length')) || 1;
          const reader = response.body?.getReader();
          if (!reader) {
            await response.arrayBuffer();
            loaded[i] = totals[i]!;
          } else {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              loaded[i] = (loaded[i] ?? 0) + value.byteLength;
              if (loaded[i]! > totals[i]!) totals[i] = loaded[i]!;
              report();
            }
          }
        } catch {
          totals[i] = totals[i] || 1;
        }
        loaded[i] = totals[i]!;
        report();
      }),
    );
  },
};
