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
};
