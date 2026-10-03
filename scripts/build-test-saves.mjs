// Erzeugt die Test-Spielstände (src/playtest/testSaves.ts) als Dateien in public/spielstaende/<id>.json, so wie sie der
// Spielstände-Dialog unter "Test-Spielstände" lädt. Der Bot spielt dafür einen ganzen Durchgang (dauert etwas).
//
// Aufruf: npm run saves:build  (oder node scripts/build-test-saves.mjs [id …])

import { mkdirSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const load = async (id) => (await runnerImport(id, { logLevel: 'silent', configFile: false })).module;
const [{ TEST_SAVES, ownedInKoeln }, core] = await Promise.all([
  load('/src/playtest/testSaves.ts'),
  load('/src/core/index.ts'),
]);
const wanted = process.argv.slice(2);
mkdirSync('public/spielstaende', { recursive: true });
for (const save of TEST_SAVES) {
  if (wanted.length > 0 && !wanted.includes(save.id)) continue;
  const started = performance.now();
  const state = save.build();
  // savedAt 0: Die Datei hängt nur vom Spiel ab, nicht vom Zeitpunkt des Erzeugens.
  const text = core.serializeSave(core.createSaveFile(state, save.label, 0));
  const file = `public/spielstaende/${save.id}.json`;
  writeFileSync(file, text);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `${file}: ${Math.round(text.length / 1024)} KB, ${core.clock.formatLong(state.time)}, ${ownedInKoeln(state).length} Kölner Veedel, ${Math.round(state.wallet.dirty)} € schwarz (${seconds} s)`,
  );
}
