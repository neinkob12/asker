// Lint-Regel für die Architektur: prüft alle Importe in src/ gegen die Ordnerregeln aus CLAUDE.md.
//
//   1. Module importieren andere Module nur über deren index.ts.
//   2. Module importieren den Kern nur über src/core/index.ts (Tests zusätzlich src/core/testing.ts).
//   3. Nur der ui/-Ordner eines Moduls darf Oberfläche und Karte nutzen (src/ui/index.ts, src/map/index.ts,
//      preact, maplibre-gl, three). Der Rest eines Moduls bleibt DOM-frei, damit die Simulation überall läuft.
//   4. Der Kern importiert keine Module, keine UI und keine Karte.
//   5. UI und Karte importieren keine Module (die werden automatisch gefunden) und den Kern nur über index.ts.
//
// Aufruf: node scripts/check-boundaries.mjs  (läuft in `npm run lint`)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UI_PACKAGES = ['preact', 'maplibre-gl', 'three'];

/** Pfad relativ zum Repo mit '/' als Trenner und ohne Dateiendung / ohne '/index'. */
function normalize(absPath) {
  let p = relative(ROOT, absPath).split(sep).join('/');
  p = p.replace(/\.(tsx?|mjs|js)$/, '');
  return p.replace(/\/index$/, '');
}

/** Was ist das Ziel eines Imports? */
function classify(target) {
  let m = target.match(/^src\/modules\/([^/]+)(\/(.*))?$/);
  if (m) return { area: 'module', module: m[1], entry: !m[2] };
  m = target.match(/^src\/(core|ui|map)(\/(.*))?$/);
  if (m) return { area: m[1], entry: !m[2], path: m[3] ?? '' };
  return { area: 'other' };
}

/** Wo liegt die importierende Datei? */
function locate(file) {
  const rel = relative(ROOT, file).split(sep).join('/');
  let m = rel.match(/^src\/modules\/([^/]+)\/(.*)$/);
  if (m) return { area: 'module', module: m[1], inUi: m[2].startsWith('ui/'), rel };
  m = rel.match(/^src\/(core|ui|map)\//);
  if (m) return { area: m[1], rel };
  return { area: 'other', rel };
}

/**
 * Prüft einen Import. Gibt eine Fehlermeldung zurück oder null.
 * @param {string} file absoluter Pfad der importierenden Datei
 * @param {string} spec Import-Pfad, wie er im Code steht
 */
export function checkImport(file, spec) {
  const from = locate(file);
  const isTest = /\.test\.tsx?$/.test(file);
  const bare = !spec.startsWith('.');
  if (bare) {
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (!UI_PACKAGES.includes(pkg)) return null;
    if (from.area === 'core') return `Der Kern bleibt DOM-frei und darf "${pkg}" nicht importieren.`;
    if (from.area === 'module' && !from.inUi) {
      return `"${pkg}" nur im ui/-Ordner des Moduls verwenden (Simulation bleibt DOM-frei).`;
    }
    return null;
  }
  if (spec.endsWith('.css')) return null;
  const target = classify(normalize(resolve(dirname(file), spec)));

  if (from.area === 'module') {
    if (target.area === 'module' && target.module !== from.module && !target.entry) {
      return `Andere Module nur über ihre index.ts importieren: '../${target.module}' statt '${spec}'.`;
    }
    if (target.area === 'module' && target.module === from.module && !from.inUi && /(^|\/)ui(\/|$)/.test(spec)) {
      return 'Die Simulation eines Moduls darf seinen ui/-Ordner nicht importieren.';
    }
    if (target.area === 'core' && !target.entry && !(isTest && target.path === 'testing')) {
      return `Den Kern nur über src/core/index.ts importieren${isTest ? ' (Tests auch src/core/testing.ts)' : ''}.`;
    }
    if (target.area === 'ui' || target.area === 'map') {
      if (!from.inUi) return `Oberfläche und Karte nur im ui/-Ordner des Moduls verwenden.`;
      if (!target.entry) return `Nur über src/${target.area}/index.ts importieren, nicht '${spec}'.`;
    }
    return null;
  }
  if (from.area === 'core') {
    if (['module', 'ui', 'map'].includes(target.area)) {
      return 'Der Kern importiert keine Module, keine UI und keine Karte.';
    }
    return null;
  }
  if (from.area === 'ui' || from.area === 'map') {
    if (target.area === 'module') return 'UI und Karte importieren keine Module (die melden sich über Registries an).';
    if (target.area === 'core' && !target.entry) return 'Den Kern nur über src/core/index.ts importieren.';
    return null;
  }
  return null;
}

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bdeclare\s+module\s+['"]([^'"]+)['"]/g,
];

/** Alle Importe einer Datei mit Zeilennummer. */
export function findImports(source) {
  const found = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      found.push({ spec: match[1], line });
    }
  }
  return found;
}

function listFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else if (/\.tsx?$/.test(name)) files.push(path);
  }
  return files;
}

export function checkAll(srcDir = join(ROOT, 'src')) {
  const problems = [];
  for (const file of listFiles(srcDir)) {
    const source = readFileSync(file, 'utf8');
    for (const { spec, line } of findImports(source)) {
      const problem = checkImport(file, spec);
      if (problem) problems.push(`${relative(ROOT, file)}:${line}  ${problem}`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkAll();
  if (problems.length > 0) {
    console.error(`Verstöße gegen die Ordnerregeln (siehe CLAUDE.md):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('Ordnerregeln eingehalten.');
}
