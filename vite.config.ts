/// <reference types="vitest/config" />
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * `virtual:asset-manifest`: every world asset under public/assets (textures, models, sky), so the
 * game can start downloading them while the player is still on the briefing. Voice clips are left
 * to the narrator, which streams the one it needs.
 */
function assetManifest(): Plugin {
  const id = 'virtual:asset-manifest';
  const root = fileURLToPath(new URL('./public', import.meta.url));
  const list = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? list(path) : [path];
    });
  return {
    name: 'asset-manifest',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return undefined;
      const files = ['textures', 'models', 'hdri']
        .flatMap((folder) => list(join(root, 'assets', folder)))
        .map((file) => ({
          url: `/${relative(root, file).split('\\').join('/')}`,
          size: statSync(file).size,
        }))
        // Smallest first: many small files finish early and unblock the most materials.
        .sort((a, b) => a.size - b.size);
      return `export default ${JSON.stringify(files)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), assetManifest()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Rapier ships its WASM inlined as base64 (~2.2 MB), which dominates the physics chunk.
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@dimforge')) return 'physics';
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three') || id.includes('postprocessing')) return 'r3f';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
