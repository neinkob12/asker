import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { host: true },
  worker: { format: 'es' },
  // JSX wird mit Preact übersetzt (siehe auch tsconfig.json), auch beim Vorab-Scan im Entwicklungsserver.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  optimizeDeps: { rolldownOptions: { transform: { jsx: { runtime: 'automatic', importSource: 'preact' } } } },
  build: {
    // MapLibre allein ist schon ca. 1 MB groß, das Kölner Straßennetz (src/modules/roads/network.ts) ca. 180 KB.
    chunkSizeWarningLimit: 1800,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
});
