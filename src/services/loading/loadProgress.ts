import sizes from 'virtual:asset-sizes';
import { DefaultLoadingManager } from 'three';
import { create } from 'zustand';

/**
 * Real loading progress, weighted by data: every file three's loaders fetch counts by its actual
 * size (from a build-time table of the assets' byte sizes), so a 4 MB sky or a 1.3 MB terrain
 * texture moves the bar far more than a small icon. After the downloads comes a short "build"
 * stage (world assembly and shader compilation), shown as the last part of the bar so it never
 * sits frozen at 99%.
 */
interface LoadState {
  /** Bytes of the files requested so far, and of those finished. */
  expected: number;
  loaded: number;
  /** 0..1 progress of the build stage (set by the world while it compiles). */
  build: number;
}

export const useLoadStore = create<LoadState>(() => ({ expected: 0, loaded: 0, build: 0 }));

/** Share of the bar given to downloads; the rest is the build stage. */
const DOWNLOAD_SHARE = 0.85;
/** Fallback weight for files not in the size table (e.g. generated or third-party URLs). */
const UNKNOWN_BYTES = 40_000;

const sizeOf = (url: string) => {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!;
  return (sizes as Record<string, number>)[path] ?? UNKNOWN_BYTES;
};

let installed = false;

/** Hooks three's default loading manager (chaining any existing handlers, e.g. drei's). */
export function installLoadTracking(): void {
  if (installed) return;
  installed = true;
  const pending = new Map<string, number>();
  const begin = (url: string) => {
    if (pending.has(url)) return;
    const bytes = sizeOf(url);
    pending.set(url, bytes);
    useLoadStore.setState((s) => ({ expected: s.expected + bytes }));
  };
  const finish = (url: string) => {
    const bytes = pending.get(url);
    if (bytes === undefined) return;
    pending.delete(url);
    useLoadStore.setState((s) => ({ loaded: s.loaded + bytes }));
  };
  // Hook the manager's per-file methods (drei replaces the onStart/onProgress callbacks, but
  // never these): every file start and end goes through them.
  const itemStart = DefaultLoadingManager.itemStart.bind(DefaultLoadingManager);
  const itemEnd = DefaultLoadingManager.itemEnd.bind(DefaultLoadingManager);
  const itemError = DefaultLoadingManager.itemError.bind(DefaultLoadingManager);
  DefaultLoadingManager.itemStart = (url: string) => {
    begin(url);
    itemStart(url);
  };
  DefaultLoadingManager.itemEnd = (url: string) => {
    finish(url);
    itemEnd(url);
  };
  DefaultLoadingManager.itemError = (url: string) => {
    finish(url);
    itemError(url);
  };
}

/** Starts a fresh measurement (a new loading screen). */
export function resetLoadProgress(): void {
  const { expected, loaded } = useLoadStore.getState();
  // Keep what is still in flight; count only from here on.
  useLoadStore.setState({ expected: expected - loaded, loaded: 0, build: 0 });
}

/** 0..100 overall: bytes downloaded, then the build stage. */
export function overallPercent(state: LoadState): number {
  // Nothing to download (all cached) counts as complete once the build has started.
  const download = state.expected > 0 ? state.loaded / state.expected : state.build > 0 ? 1 : 0;
  return (download * DOWNLOAD_SHARE + state.build * (1 - DOWNLOAD_SHARE)) * 100;
}
