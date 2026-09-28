import manifest from 'virtual:asset-manifest';

export interface PrefetchState {
  /** Bytes downloaded so far and in total. */
  loaded: number;
  total: number;
  /** Resolves once every asset is in the HTTP cache (failures included — they load normally). */
  done: Promise<void>;
}

let state: PrefetchState | null = null;

/**
 * Downloads every world asset into the browser's HTTP cache in the background, a few at a time
 * at low priority (so briefing narration and UI requests are never starved). Started as soon as
 * a mission is chosen, so the story and briefing cover most of the download; the mission world
 * then mounts with everything already local and builds in one pass.
 */
export function prefetchWorldAssets(concurrency = 3): PrefetchState {
  if (state) return state;
  const total = manifest.reduce((sum, file) => sum + file.size, 0);
  const current: PrefetchState = { loaded: 0, total, done: Promise.resolve() };
  state = current;
  if (typeof fetch === 'undefined') return current;
  const queue = [...manifest];
  const worker = async (): Promise<void> => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      try {
        const response = await fetch(file.url, { priority: 'low' } as RequestInit);
        await response.arrayBuffer();
      } catch {
        // A failed prefetch only means that asset loads normally later.
      }
      current.loaded += file.size;
    }
  };
  current.done = Promise.all(Array.from({ length: concurrency }, worker)).then(() => undefined);
  return current;
}

/** 0..1 download progress of the world assets (1 when nothing is pending). */
export function prefetchProgress(): number {
  if (!state || state.total === 0) return 0;
  return Math.min(1, state.loaded / state.total);
}
