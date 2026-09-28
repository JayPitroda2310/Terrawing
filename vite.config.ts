/// <reference types="vitest/config" />
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * `virtual:asset-sizes`: byte size of every file under public/assets, keyed by URL path, so the
 * loading bar can weight progress by real data rather than by file count.
 */
function assetSizes(): Plugin {
  const id = 'virtual:asset-sizes';
  const root = fileURLToPath(new URL('./public', import.meta.url));
  const list = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? list(path) : [path];
    });
  return {
    name: 'asset-sizes',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return undefined;
      const table: Record<string, number> = {};
      for (const file of list(join(root, 'assets')))
        table[`/${relative(root, file).split('\\').join('/')}`] = statSync(file).size;
      return `export default ${JSON.stringify(table)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), assetSizes()],
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
