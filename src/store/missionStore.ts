import { create } from 'zustand';
import type { NotificationTone } from '@/game/core/GameEvents';
import type { ObjectiveStatus } from '@/game/missions/MissionObjectives';

export interface ObjectiveView {
  id: string;
  label: string;
  status: ObjectiveStatus;
  optional: boolean;
  /** Extra detail, e.g. distance or "signal acquired". */
  detail: string | null;
  /** Timestamp (ms) of completion for the completion animation. */
  completedAt: number | null;
}

export interface FeedItem {
  id: number;
  text: string;
  tone: NotificationTone;
  createdAt: number;
}

export interface RadioLine {
  id: string;
  speaker: string;
  text: string;
  createdAt: number;
}

const MAX_FEED = 4;
let feedId = 1;

interface MissionStoreState {
  objectives: ObjectiveView[];
  feed: FeedItem[];
  radio: RadioLine | null;
  transformNotice: string | null;
  setObjectives(objectives: ObjectiveView[]): void;
  pushFeed(text: string, tone: NotificationTone): void;
  expireFeed(now: number, lifetimeMs: number): void;
  setRadio(line: RadioLine | null): void;
  reset(): void;
}

export const useMissionStore = create<MissionStoreState>((set) => ({
  objectives: [],
  feed: [],
  radio: null,
  transformNotice: null,
  setObjectives: (objectives) => set({ objectives }),
  pushFeed: (text, tone) =>
    set((state) => {
      // Collapse repeated messages (e.g. "SCANNER RECHARGING" spam).
      const filtered = state.feed.filter((item) => item.text !== text);
      return {
        feed: [...filtered, { id: feedId++, text, tone, createdAt: performance.now() }].slice(
          -MAX_FEED,
        ),
      };
    }),
  expireFeed: (now, lifetimeMs) =>
    set((state) => {
      const feed = state.feed.filter((item) => now - item.createdAt < lifetimeMs);
      return feed.length === state.feed.length ? state : { feed };
    }),
  setRadio: (radio) => set({ radio }),
  reset: () => set({ objectives: [], feed: [], radio: null, transformNotice: null }),
}));
