// Beweis, dass ein neues Modul angelegt werden kann, ohne eine Datei außerhalb seines Ordners zu ändern:
// Kopiert src/modules/_template nach src/modules/smoketest, benennt die ID um und lässt Typecheck,
// Ordnerregeln, alle Tests (inklusive Modul-Erkennung) und den Build laufen. Danach wird die Kopie gelöscht.
//
// Aufruf: npm run template:smoke  (läuft in der CI)

import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ID = 'smoketest';
const target = join('src', 'modules', ID);
if (existsSync(target)) throw new Error(`${target} existiert schon.`);

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};
const changedOutside = () =>
  execSync('git status --porcelain --untracked-files=all', { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line && !line.slice(3).startsWith(`${target}/`));

const before = changedOutside();
try {
  cpSync(join('src', 'modules', '_template'), target, { recursive: true });
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  for (const file of walk(target)) {
    const text = readFileSync(file, 'utf8')
      .replaceAll('template', ID)
      .replaceAll('Template', 'Smoketest')
      .replaceAll('TEMPLATE', 'SMOKETEST');
    writeFileSync(file, text);
    if (file.includes('template')) renameSync(file, file.replaceAll('template', ID));
  }
  const after = changedOutside();
  if (after.join('\n') !== before.join('\n')) throw new Error('Außerhalb des Modulordners hat sich etwas geändert.');

  run('npx tsc --noEmit');
  run('node scripts/check-boundaries.mjs');
  run('npx vitest run');
  // Der Test "findet jeden Modulordner" in src/core/discover.test.ts ist oben mitgelaufen: Er schlägt fehl,
  // wenn ein Ordner unter src/modules nicht automatisch registriert wird.
  run('npx vite build --logLevel warn');
  console.log(`\nOK: Das Modul "${ID}" wurde nur durch seinen eigenen Ordner registriert, getestet und gebaut.`);
} finally {
  rmSync(target, { recursive: true, force: true });
}
