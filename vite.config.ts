import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { host: true },
  worker: { format: 'es' },
  // JSX wird mit Preact übersetzt (siehe auch tsconfig.json), auch beim Vorab-Scan im Entwicklungsserver.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  optimizeDeps: { rolldownOptions: { transform: { jsx: { runtime: 'automatic', importSource: 'preact' } } } },
  build: {
    // MapLibre und die Straßennetze aller Städte sind je ca. 1 MB groß (eigene Dateien, siehe unten), der Spielcode ca. 2 MB.
    chunkSizeWarningLimit: 2500,
    // Eigene Dateien für Bibliotheken und Straßennetze (Auftrag 47, Punkt 5): Sie ändern sich selten und bleiben nach
    // einem neuen Deploy im Browser-Cache, nur der Spielcode wird neu geladen; der Browser lädt die Teile parallel.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
            { name: 'vendor', test: /node_modules[\\/](preact|onnxruntime-web|@diffusionstudio)/ },
            { name: 'roads', test: /src[\\/]modules[\\/]roads[\\/](network|autobahn|waterways|seaways)/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs', 'api/**/*.test.ts'],
  },
});
