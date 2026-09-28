import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameManager } from '@/app/GameManagerContext';
import { loadMission } from '@/data/missions';
import { Screen } from '@/game/core/GameState';
import type { MissionDefinition } from '@/game/missions/MissionDefinition';
import { narrator } from '@/services/audio/narrator';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { WordmarkLoader } from '@/ui/common/WordmarkLoader';
import { formatTime } from '@/utils/helpers/format';

interface Beat {
  kicker: string;
  text: string;
  /** Start time (s) within the narration; the title card has none. */
  start?: number;
  title?: boolean;
}

/** Title card, then one caption card per section of the narration. */
function buildStory(mission: MissionDefinition): Beat[] {
  const captions = narrator.briefing(mission.id)?.captions ?? [];
  return [
    {
      kicker: `Mission ${String(mission.index).padStart(2, '0')}`,
      text: mission.name,
      title: true,
    },
    ...captions.map((caption, i) => ({
      kicker: i === 0 ? `Incoming · Base · ${mission.briefing.location}` : '',
      text: caption.text,
      start: caption.start,
    })),
  ];
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" strokeLinejoin="round" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Mission briefing told as a narrated story, then a summary with the mission facts. */
export function MissionBriefing() {
  const manager = useGameManager();
  const missionId = useGameStore((s) => s.selectedMissionId);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const mission = useMemo(() => {
    const result = loadMission(missionId);
    return result.ok ? result.mission : null;
  }, [missionId]);
  const story = useMemo(() => (mission ? buildStory(mission) : []), [mission]);
  const [index, setIndex] = useState(0);
  // Narration (briefing + radio calls) downloads first, behind the loader, so the story plays
  // without gaps.
  const [voiceLoad, setVoiceLoad] = useState<{ id: string; progress: number; ready: boolean }>({
    id: '',
    progress: 0,
    ready: false,
  });
  const timer = useRef<number | null>(null);
  const voice = settings.voiceNarration;
  const finished = index >= story.length;
  const next = useCallback(() => setIndex((i) => Math.min(story.length, i + 1)), [story.length]);

  // Title card, then the whole briefing as one continuous radio call; caption cards follow the
  // voice. Without narration, cards advance on a reading timer instead.
  const playing = useRef(false);
  const ready = !voice || (voiceLoad.id === missionId && voiceLoad.ready);
  useEffect(() => {
    if (!voice) return;
    let cancelled = false;
    setVoiceLoad({ id: missionId, progress: 0, ready: false });
    void narrator
      .preload(narrator.missionClips(missionId), (progress) => {
        if (!cancelled) setVoiceLoad((s) => ({ ...s, id: missionId, progress }));
      })
      .then(() => {
        if (!cancelled) setVoiceLoad({ id: missionId, progress: 1, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [missionId, voice]);

  useEffect(() => {
    if (!ready) return;
    if (timer.current) window.clearTimeout(timer.current);
    const beat = story[index];
    if (!beat) {
      narrator.cancel();
      playing.current = false;
      return;
    }
    if (beat.title) {
      playing.current = false;
      timer.current = window.setTimeout(next, 1400);
      return;
    }
    const briefing = mission ? narrator.briefing(mission.id) : null;
    if (voice && briefing) {
      if (!playing.current) {
        playing.current = true;
        narrator.play(briefing.src, {
          volume: settings.masterVolume,
          onTime: (seconds) => {
            let card = 1;
            for (let i = 1; i < story.length; i++) if (seconds >= (story[i]!.start ?? 0)) card = i;
            setIndex((current) => (current === story.length ? current : card));
          },
          onEnd: () => {
            playing.current = false;
            timer.current = window.setTimeout(() => setIndex(story.length), 500);
          },
        });
      }
      return;
    }
    timer.current = window.setTimeout(next, 1500 + beat.text.length * 55);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, story, voice, next, mission, settings.masterVolume, ready]);

  useEffect(() => () => narrator.cancel(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Enter' && event.code !== 'Space') return;
      if (!ready) return;
      event.preventDefault();
      narrator.cancel();
      if (finished) manager.beginMission();
      else setIndex(story.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, manager, next, story.length, ready]);

  if (!mission) return null;
  if (!ready) return <WordmarkLoader percent={voiceLoad.progress * 100} />;
  const b = mission.briefing;
  const beat = story[Math.min(index, story.length - 1)]!;
  const facts: [string, string][] = [
    ['Location', b.location],
    ['Status', b.status],
    ['Weather', b.weather],
    ['Visibility', b.visibility],
    ['Risk', b.risk],
    ['Time limit', formatTime(mission.timeLimit)],
  ];

  return (
    <div className="absolute inset-0 z-20 overflow-hidden font-sans text-[#f3efe7]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_30%_60%,rgb(6_8_10/0.45),rgb(6_8_10/0.86))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[8vh] bg-black" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[8vh] bg-black" />

      <div className="relative flex h-full flex-col px-[clamp(2rem,7vw,8rem)] pt-[11vh] pb-[11vh]">
        <div className="flex items-center justify-between text-[0.75rem] text-[#f3efe7]/55">
          <span className="font-display tracking-[0.12em] uppercase">{mission.code} briefing</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (settings.voiceNarration) {
                  narrator.cancel();
                  playing.current = false;
                }
                update('voiceNarration', !settings.voiceNarration);
              }}
              className="glass flex h-9 w-9 items-center justify-center text-[#f3efe7]/80 hover:text-[#f3efe7]"
              aria-label={settings.voiceNarration ? 'Mute narration' : 'Unmute narration'}
            >
              <SpeakerIcon muted={!settings.voiceNarration} />
            </button>
            <button
              type="button"
              onClick={() => {
                narrator.cancel();
                playing.current = false;
                setIndex(0);
              }}
              className="glass h-9 px-4 text-[#f3efe7]/80 hover:text-[#f3efe7]"
            >
              Replay
            </button>
          </div>
        </div>

        {!finished ? (
          <div key={index} className="my-auto max-w-[54rem]">
            {beat.kicker && (
              <div className="mb-4 animate-rise-in font-display text-[0.8rem] tracking-[0.14em] text-brand uppercase">
                {beat.kicker}
              </div>
            )}
            {beat.title ? (
              <h1 className="animate-rise-in font-display text-[clamp(2.6rem,6.5vw,6rem)] leading-[0.95] tracking-[0.02em] uppercase">
                {beat.text}
              </h1>
            ) : (
              <p className="animate-rise-in text-[clamp(1.5rem,2.6vw,2.35rem)] leading-[1.35] font-light">
                {beat.text}
              </p>
            )}
          </div>
        ) : (
          <div className="my-auto grid animate-rise-in grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6">
            <div>
              <div className="font-display text-[0.8rem] tracking-[0.14em] text-brand uppercase">
                {mission.code}
              </div>
              <h1 className="mt-2 font-display text-[clamp(2.2rem,4.5vw,4rem)] leading-none tracking-[0.02em] uppercase">
                {mission.name}
              </h1>
              <dl className="mt-6 grid grid-cols-3 gap-px border border-ops-line bg-ops-line">
                {facts.map(([label, value]) => (
                  <div key={label} className="bg-ops-panel-strong px-4 py-3">
                    <dt className="text-[0.7rem] text-[#f3efe7]/50">{label}</dt>
                    <dd
                      className={`mt-0.5 text-[0.95rem] font-medium ${label === 'Status' ? 'text-brand' : ''}`}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="glass p-5">
              <div className="font-display text-[0.75rem] tracking-[0.12em] text-[#f3efe7]/70 uppercase">
                Field notes
              </div>
              <ul className="mt-3 space-y-2.5 text-[0.9rem] leading-snug text-[#f3efe7]/80">
                {b.tips.map((tip) => (
                  <li key={tip} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-brand" aria-hidden />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-1 items-center gap-1.5" aria-hidden>
            {story.map((_, i) => (
              <span
                key={i}
                className={`h-[3px] flex-1 transition-colors duration-500 ${
                  i < index ? 'bg-brand' : i === index ? 'bg-brand/50' : 'bg-[#f3efe7]/15'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                narrator.cancel();
                manager.navigate(Screen.MAIN_MENU);
              }}
              className="h-11 px-5 text-[0.9rem] text-[#f3efe7]/60 hover:text-[#f3efe7]"
            >
              Back
            </button>
            {!finished && (
              <button
                type="button"
                onClick={() => {
                  narrator.cancel();
                  setIndex(story.length);
                }}
                className="glass h-11 px-5 text-[0.9rem] text-[#f3efe7]/85 hover:text-[#f3efe7]"
              >
                Skip story
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => {
                narrator.cancel();
                manager.beginMission();
              }}
              className="h-11 bg-brand px-6 font-display text-[0.85rem] tracking-[0.08em] text-[#0b1206] uppercase transition-colors hover:bg-[#95e673] focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:outline-none"
            >
              Begin rescue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
