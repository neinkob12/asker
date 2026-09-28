// Findet alle Module unter src/modules/*/index.ts automatisch. Ein neues Modul anzulegen
// ändert daher keine Datei außerhalb seines Ordners. Ordner mit "_" am Anfang (z.B. _template) zählen nicht.

import type { ModuleDefinition } from './module';

const found = import.meta.glob<{ default?: ModuleDefinition }>(['../modules/*/index.ts', '!../modules/_*/index.ts'], {
  eager: true,
});

/** Ordnername aus dem Glob-Pfad '../modules/<ordner>/index.ts'. */
function folderOf(path: string): string {
  return path.split('/').at(-2) ?? path;
}

/** Alle gefundenen Module (unsortiert; die Simulation sortiert nach Abhängigkeiten). */
export function discoverModules(): ModuleDefinition[] {
  return Object.entries(found)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, mod]) => {
      const def = mod.default;
      const folder = folderOf(path);
      if (!def) throw new Error(`src/modules/${folder}/index.ts exportiert kein defineModule(...) als default.`);
      if (def.id !== folder) {
        throw new Error(`Modul-ID "${def.id}" passt nicht zum Ordner src/modules/${folder}/.`);
      }
      return def;
    });
}
