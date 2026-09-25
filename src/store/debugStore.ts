import { create } from 'zustand';

export interface RenderStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

/** Development-only render statistics (written by an in-canvas probe while the panel is open). */
export const useDebugStore = create<{ stats: RenderStats; setStats(stats: RenderStats): void }>(
  (set) => ({
    stats: { fps: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
    setStats: (stats) => set({ stats }),
  }),
);
