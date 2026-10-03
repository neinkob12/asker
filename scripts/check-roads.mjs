// Prüfskript "Fahrzeuge fahren überall auf der Straße" (Auftrag 31), läuft in `npm run lint`: Für jede Stadt liegen
// Spots, Lager, Hafen und Autobahn-Einfahrten höchstens 60 m von einer Straße des Netzes, und roadRoute zwischen allen
// Lagern und Spots hat kein gerades Stück über 80 m neben der Straße. Die Regeln stehen in
// src/modules/roads/tools/check.ts; dieses Skript lädt sie über Vite (TypeScript) mit einem frischen Spielstand.
//
// Aufruf: node scripts/check-roads.mjs

import { runnerImport } from 'vite';

const started = performance.now();
const load = async (id) => (await runnerImport(id, { logLevel: 'silent', configFile: false })).module;
const [{ checkRoads, checkedCounts }, core, discover] = await Promise.all([
  load('/src/modules/roads/tools/check.ts'),
  load('/src/core/index.ts'),
  load('/src/core/discover.ts'),
]);
const sim = core.Simulation.create(discover.discoverModules(), {
  seed: 1,
  mode: 'normal',
  createdAt: 0,
  runId: 'check-roads',
});
const problems = checkRoads(sim.state);
const { places, routes } = checkedCounts(sim.state);
const seconds = ((performance.now() - started) / 1000).toFixed(1);
if (problems.length > 0) {
  console.error(`Straßen: ${problems.length} Probleme (${places} Orte, ${routes} Routen geprüft):`);
  for (const p of problems) console.error(`  ${p.text}`);
  process.exit(1);
}
console.log(`Straßen in Ordnung (${places} Orte, ${routes} Routen, ${seconds} s).`);
