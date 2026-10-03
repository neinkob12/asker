// Packt die espeak-ng-Daten des Phonemizers auf Deutsch zusammen. Das npm-Paket @diffusionstudio/piper-wasm bringt
// ein Emscripten-Datenpaket mit allen Sprachen mit (18 MB); das Spiel braucht nur Deutsch (plus Englisch, das espeak
// beim Start als Standardstimme lädt) und die Phonem-Tabellen, zusammen unter 1 MB. Erzeugt in src/audio/piper/vendor/:
//
//   piper_phonemize.js     der Emscripten-Lader mit angepasster Dateiliste
//   piper_phonemize.data   nur die nötigen Dateien
//   piper_phonemize.wasm   unverändert kopiert
//
//   node src/audio/piper/tools/trim-espeak-data.mjs
//
// Danach: npm test (piper.test.ts prüft, dass der Lader zur Datei passt).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../../node_modules/@diffusionstudio/piper-wasm/build');
const target = resolve(here, '../vendor');

/** Was espeak-ng für Deutsch braucht (und Englisch als Standardstimme beim Start). */
const KEEP = [
  /^\/espeak-ng-data\/(phontab|phonindex|phondata|intonations)$/,
  /^\/espeak-ng-data\/(de|en)_dict$/,
  /^\/espeak-ng-data\/lang\/gmw\/(de|en)$/,
];

const js = readFileSync(`${source}/piper_phonemize.js`, 'utf8');
const data = readFileSync(`${source}/piper_phonemize.data`);
const match = js.match(/loadPackage\((\{"files":\[.*?\],"remote_package_size":\d+\})\)/s);
if (!match) throw new Error('Dateiliste im Lader nicht gefunden (anderes Emscripten-Format?).');
const meta = JSON.parse(match[1]);

const parts = [];
const files = [];
let offset = 0;
for (const file of meta.files) {
  if (!KEEP.some((rule) => rule.test(file.filename))) continue;
  const bytes = data.subarray(file.start, file.end);
  parts.push(bytes);
  files.push({ filename: file.filename, start: offset, end: offset + bytes.length });
  offset += bytes.length;
}
const trimmed = Buffer.concat(parts);
const patched = js.replace(match[1], JSON.stringify({ files, remote_package_size: trimmed.length }));

writeFileSync(`${target}/piper_phonemize.data`, trimmed);
writeFileSync(
  `${target}/piper_phonemize.js`,
  `// Erzeugt von tools/trim-espeak-data.mjs aus @diffusionstudio/piper-wasm (MIT; espeak-ng GPL-3.0). Nicht von Hand ändern.\n${patched}`,
);
writeFileSync(`${target}/piper_phonemize.wasm`, readFileSync(`${source}/piper_phonemize.wasm`));
console.log(`${files.length} von ${meta.files.length} Dateien behalten, ${trimmed.length} statt ${data.length} Byte.`);
for (const file of files) console.log(`  ${file.filename} ${file.end - file.start}`);
