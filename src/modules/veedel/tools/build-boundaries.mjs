// Erzeugt die Grenzen der Veedel bzw. Stadtteile einer Stadt (Köln: boundaries.ts, Hamburg: boundaries-hamburg.ts).
//
// Aufruf (aus dem Repo-Root):
//   node src/modules/veedel/tools/build-boundaries.mjs                 Köln: lädt die Daten aus dem Geoportal
//   node src/modules/veedel/tools/build-boundaries.mjs stadtteile.json Köln: nimmt eine schon geladene GeoJSON-Datei
//   node src/modules/veedel/tools/build-boundaries.mjs --city hamburg hamburg.geojson
//                                                                      Hamburg: GeoJSON aus tools/fetch-divisions.py
//   node src/modules/veedel/tools/build-boundaries.mjs --city berlin berlin.geojson     Berlin (Auftrag 37), ebenso
//   npm run format                                                     danach, damit Biome zufrieden ist
//
// Quellen:
//   Köln: Offene Daten Köln, Datensatz "Stadtteile Köln" (https://www.offenedaten-koeln.de/dataset/stadtteile-koeln),
//     Lizenz: Datenlizenz Deutschland – Zero – Version 2.0 (https://www.govdata.de/dl-de/zero-2-0).
//   Hamburg (Auftrag 30): Overture Maps, Thema "divisions" (Stadtteile aus OpenStreetMap, ODbL 1.0), geladen mit
//     tools/fetch-divisions.py. Die Verwaltungsgrenzen des LGV Hamburg (WFS) waren aus der Entwicklungsumgebung nicht
//     erreichbar.
//
// Was das Skript macht:
//   1. Nimmt nur die Stadtteile, die im Spiel Veedel sind (names in CITIES unten). Bei Flächen mit Löchern oder mehreren
//      Teilen zählt der äußere Ring des größten Teils (Seen und kleine Inseln spielen keine Rolle).
//   2. Vereinfacht die Grenzen mit Douglas-Peucker. Gemeinsame Grenzen zweier Veedel werden nur einmal vereinfacht,
//      damit keine Lücken oder Überlappungen entstehen (Punkte, an denen sich die Nachbarschaft ändert, bleiben fest).
//   3. Grenzkorrektur: Einige Plätze im Spiel liegen genau auf einer Stadtteilgrenze (Ringe, Zoobrücke). Die Grenze
//      wird dort um wenige Meter verschoben, damit der Platz im Veedel liegt, zu dem er im Spiel gehört (anchors).
//   4. Leitet aus den Originaldaten ab, welche Veedel eine gemeinsame Grenze haben.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://geoportal.stadt-koeln.de/arcgis/rest/services/Basiskarten/kgg/MapServer/3/query' +
  '?where=objectid+is+not+null&outFields=nummer,name,stadtbezirk&returnGeometry=true&outSR=4326&f=geojson';

/** Pro Stadt: Name in den Daten → Veedel-ID, Plätze auf Grenzlinien, Ausgabe und Quellenangabe. */
const CITIES = {
  koeln: {
    sourceUrl: SOURCE_URL,
    lat0: 50.94,
    outFile: 'boundaries.ts',
    names: {
      'Altstadt/Nord': 'altstadt-nord',
      'Altstadt/Süd': 'altstadt-sued',
      'Neustadt/Nord': 'neustadt-nord',
      'Neustadt/Süd': 'neustadt-sued',
      Deutz: 'deutz',
      Ehrenfeld: 'ehrenfeld',
      Lindenthal: 'lindenthal',
      Sülz: 'suelz',
      Nippes: 'nippes',
      Kalk: 'kalk',
      Mülheim: 'muelheim',
      Bayenthal: 'bayenthal',
    },
    anchors: [
      { name: 'Ebertplatz', veedelId: 'neustadt-nord', lng: 6.9575, lat: 50.9497 },
      { name: 'Rudolfplatz', veedelId: 'neustadt-sued', lng: 6.9392, lat: 50.9366 },
      { name: 'Rheinpark (Nordrand an der Zoobrücke)', veedelId: 'deutz', lng: 6.979, lat: 50.9468 },
    ],
    header: [
      '// Quelle: Stadt Köln, Offene Daten Köln, Datensatz "Stadtteile Köln"',
      '//   https://www.offenedaten-koeln.de/dataset/stadtteile-koeln',
      '// Lizenz: Datenlizenz Deutschland – Zero – Version 2.0 (dl-de/zero-2-0, https://www.govdata.de/dl-de/zero-2-0).',
      '//   Nutzung ohne Einschränkungen und ohne Pflicht zur Quellenangabe; wir nennen die Quelle trotzdem.',
    ],
  },
  hamburg: {
    sourceUrl: null,
    lat0: 53.55,
    outFile: 'boundaries-hamburg.ts',
    names: {
      'St. Pauli': 'st-pauli',
      Sternschanze: 'sternschanze',
      'Altona-Altstadt': 'altona-altstadt',
      Ottensen: 'ottensen',
      'St. Georg': 'st-georg',
      HafenCity: 'hafencity',
      Eimsbüttel: 'eimsbuettel',
      Eppendorf: 'eppendorf',
      'Barmbek-Süd': 'barmbek-sued',
      Wilhelmsburg: 'wilhelmsburg',
      Harburg: 'harburg',
      Blankenese: 'blankenese',
    },
    anchors: [],
    header: [
      '// Quelle: Overture Maps Foundation, Thema "divisions", Typ "division_area" (Release 2026-09-23.1), Stadtteile',
      '//   (admin_level 10) aus OpenStreetMap, Landflächen ohne Elbe und Hafenbecken. Geladen mit tools/fetch-divisions.py.',
      '// Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/), © OpenStreetMap-Mitwirkende,',
      '//   © Overture Maps Foundation.',
    ],
  },
  berlin: {
    sourceUrl: null,
    lat0: 52.51,
    outFile: 'boundaries-berlin.ts',
    names: {
      Mitte: 'mitte',
      Kreuzberg: 'kreuzberg',
      Friedrichshain: 'friedrichshain',
      Neukölln: 'neukoelln',
      'Prenzlauer Berg': 'prenzlauer-berg',
      Wedding: 'wedding',
      Moabit: 'moabit',
      Schöneberg: 'schoeneberg',
      Charlottenburg: 'charlottenburg',
      'Alt-Treptow': 'alt-treptow',
      Lichtenberg: 'lichtenberg',
      Tempelhof: 'tempelhof',
    },
    anchors: [],
    header: [
      '// Quelle: Overture Maps Foundation, Thema "divisions", Typ "division_area" (Release 2026-09-23.1), Ortsteile',
      '//   (admin_level 10) aus OpenStreetMap, Landflächen ohne Spree und Landwehrkanal. Geladen mit tools/fetch-divisions.py.',
      '// Lizenz: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/), © OpenStreetMap-Mitwirkende,',
      '//   © Overture Maps Foundation.',
    ],
  },
};

const args = process.argv.slice(2);
const cityFlag = args.indexOf('--city');
const CITY_ID = cityFlag >= 0 ? args[cityFlag + 1] : 'koeln';
const FILE_ARG = args.filter((_a, i) => i !== cityFlag && i !== cityFlag + 1)[0];
const CITY = CITIES[CITY_ID];
if (!CITY) throw new Error(`Unbekannte Stadt: ${CITY_ID}`);
/** Stadtteil-Name in den Daten → Veedel-ID im Spiel. */
const VEEDEL = CITY.names;

/** Größte Abweichung der vereinfachten von der echten Grenze. */
const TOLERANCE_METERS = 20;

/** Plätze auf einer Grenzlinie und das Veedel, zu dem sie im Spiel gehören. */
const ANCHORS = CITY.anchors;
/** Weiter als so viel wird eine Grenze für einen Platz nicht verschoben. */
const MAX_CORRECTION_METERS = 30;
/** So weit hinter dem Platz verläuft die korrigierte Grenze. */
const CORRECTION_MARGIN_METERS = 8;

const DECIMALS = 5;
const OUT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', CITY.outFile);

// Lokale Projektion in Meter (für eine Stadt genau genug).
const LAT0 = CITY.lat0;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110540;
const toXY = ([lng, lat]) => [lng * KX, lat * KY];
const round = (n) => Math.round(n * 10 ** DECIMALS) / 10 ** DECIMALS;
const key = (p) => `${p[0]},${p[1]}`;

async function loadSource() {
  const file = FILE_ARG;
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  if (!CITY.sourceUrl) throw new Error(`Für ${CITY_ID} bitte eine GeoJSON-Datei angeben (tools/fetch-divisions.py).`);
  const response = await fetch(CITY.sourceUrl);
  if (!response.ok) throw new Error(`Download fehlgeschlagen: ${response.status}`);
  return response.json();
}

function segmentDistance(p, a, b) {
  const [px, py] = toXY(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return { distance: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/** Douglas-Peucker auf einer offenen Linie. Gibt die Indizes der behaltenen Punkte zurück. */
function simplifyLine(points, tolerance) {
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const { distance } = segmentDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep.add(index);
      stack.push([first, index], [index, last]);
    }
  }
  return keep;
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Vereinfacht alle Ringe so, dass gemeinsame Grenzen deckungsgleich bleiben. */
function simplifyRings(rings) {
  const owners = new Map();
  for (const [id, ring] of Object.entries(rings)) {
    for (const p of ring) {
      const k = key(p);
      if (!owners.has(k)) owners.set(k, new Set());
      owners.get(k).add(id);
    }
  }
  const ownerKey = (p) => [...owners.get(key(p))].sort().join('|');

  const keep = new Set();
  for (const ring of Object.values(rings)) {
    const n = ring.length;
    const junctions = [];
    for (let i = 0; i < n; i++) {
      const here = ownerKey(ring[i]);
      if (here !== ownerKey(ring[(i - 1 + n) % n]) || here !== ownerKey(ring[(i + 1) % n])) junctions.push(i);
    }
    if (junctions.length < 2) {
      // Keine Nachbarn im Spiel: Start und den am weitesten entfernten Punkt festhalten.
      let far = 0;
      let best = -1;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(...toXY(ring[i]).map((v, j) => v - toXY(ring[0])[j]));
        if (d > best) {
          best = d;
          far = i;
        }
      }
      junctions.splice(0, junctions.length, 0, far);
    }
    for (const j of junctions) keep.add(key(ring[j]));
    for (let a = 0; a < junctions.length; a++) {
      const start = junctions[a];
      const end = junctions[(a + 1) % junctions.length];
      const arc = [];
      for (let i = start; ; i = (i + 1) % n) {
        arc.push(ring[i]);
        if (i === end) break;
      }
      for (const index of simplifyLine(arc, TOLERANCE_METERS)) keep.add(key(arc[index]));
    }
  }

  const result = {};
  for (const [id, ring] of Object.entries(rings)) {
    const simplified = [];
    for (const p of ring) {
      if (!keep.has(key(p))) continue;
      const q = [round(p[0]), round(p[1])];
      const prev = simplified[simplified.length - 1];
      if (!prev || key(prev) !== key(q)) simplified.push(q);
    }
    if (key(simplified[0]) === key(simplified[simplified.length - 1])) simplified.pop();
    result[id] = simplified;
  }
  return result;
}

/** Verschiebt die Grenze an einem Platz, der knapp im falschen Veedel liegt. */
function applyAnchor(rings, anchor) {
  const p = [anchor.lng, anchor.lat];
  const target = rings[anchor.veedelId];
  if (pointInRing(p, target)) return false;
  let best = { distance: Infinity, index: -1, t: 0 };
  for (let i = 0; i < target.length; i++) {
    const { distance, t } = segmentDistance(p, target[i], target[(i + 1) % target.length]);
    if (distance < best.distance) best = { distance, index: i, t };
  }
  if (best.distance > MAX_CORRECTION_METERS) {
    throw new Error(`${anchor.name} liegt ${Math.round(best.distance)} m außerhalb von ${anchor.veedelId}.`);
  }
  const a = target[best.index];
  const b = target[(best.index + 1) % target.length];
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const [px, py] = toXY(p);
  const fx = ax + best.t * (bx - ax);
  const fy = ay + best.t * (by - ay);
  const scale = (best.distance + CORRECTION_MARGIN_METERS) / Math.max(best.distance, 0.01);
  const moved = [round((fx + (px - fx) * scale) / KX), round((fy + (py - fy) * scale) / KY)];
  const corner = best.t < 0.01 ? a : best.t > 0.99 ? b : null;
  if (corner) {
    // Nächster Punkt ist eine Ecke: die Ecke selbst verschieben (in allen Ringen, die sie haben).
    const cornerKey = key(corner);
    for (const ring of Object.values(rings)) {
      for (let i = 0; i < ring.length; i++) if (key(ring[i]) === cornerKey) ring[i] = moved;
    }
    return true;
  }
  // Sonst in alle Ringe mit dieser Kante einen Punkt einfügen, damit die Nachbarn deckungsgleich bleiben.
  for (const ring of Object.values(rings)) {
    for (let i = 0; i < ring.length; i++) {
      const u = ring[i];
      const v = ring[(i + 1) % ring.length];
      if ((key(u) === key(a) && key(v) === key(b)) || (key(u) === key(b) && key(v) === key(a))) {
        ring.splice(i + 1, 0, moved);
        break;
      }
    }
  }
  return true;
}

/** Veedel mit gemeinsamer Grenze: mindestens eine gemeinsame Kante in den Originaldaten. */
function sharedBorders(rings) {
  const edges = new Map();
  for (const [id, ring] of Object.entries(rings)) {
    for (let i = 0; i < ring.length; i++) {
      const edge = [key(ring[i]), key(ring[(i + 1) % ring.length])].sort().join(';');
      if (!edges.has(edge)) edges.set(edge, new Set());
      edges.get(edge).add(id);
    }
  }
  const result = Object.fromEntries(Object.keys(rings).map((id) => [id, new Set()]));
  for (const ids of edges.values()) {
    for (const a of ids) for (const b of ids) if (a !== b) result[a].add(b);
  }
  return Object.fromEntries(Object.entries(result).map(([id, set]) => [id, [...set].sort()]));
}

async function main() {
  const source = await loadSource();
  const rings = {};
  for (const feature of source.features) {
    const id = VEEDEL[feature.properties.name];
    if (!id) continue;
    // Äußerer Ring des größten Teils (Löcher und kleine Inseln spielen keine Rolle).
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.type === 'MultiPolygon'
          ? feature.geometry.coordinates
          : [];
    if (polygons.length === 0) throw new Error(`${feature.properties.name}: keine Fläche.`);
    const area = (r) =>
      Math.abs(r.reduce((sum, p, i) => sum + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0));
    const outer = polygons.map((poly) => poly[0]).sort((a, b) => area(b) - area(a))[0];
    const ring = outer.map(([lng, lat]) => [lng, lat]);
    if (key(ring[0]) === key(ring[ring.length - 1])) ring.pop();
    rings[id] = ring;
  }
  const missing = Object.values(VEEDEL).filter((id) => !rings[id]);
  if (missing.length > 0) throw new Error(`Fehlende Stadtteile: ${missing.join(', ')}`);

  const neighbors = sharedBorders(rings);
  const simplified = simplifyRings(rings);
  const corrected = ANCHORS.filter((anchor) => applyAnchor(simplified, anchor)).map((a) => a.name);
  for (const anchor of ANCHORS) {
    const inside = Object.entries(simplified)
      .filter(([, ring]) => pointInRing([anchor.lng, anchor.lat], ring))
      .map(([id]) => id);
    if (inside.length !== 1 || inside[0] !== anchor.veedelId) {
      throw new Error(`${anchor.name} liegt nach der Korrektur in [${inside.join(', ')}].`);
    }
  }

  const before = Object.values(rings).reduce((sum, r) => sum + r.length, 0);
  const after = Object.values(simplified).reduce((sum, r) => sum + r.length, 0);
  const lines = [
    `// Automatisch erzeugt von tools/build-boundaries.mjs${CITY_ID === 'koeln' ? '' : ` --city ${CITY_ID}`}. Nicht von Hand ändern, sondern das Skript anpassen.`,
    '//',
    ...CITY.header,
    `// Vereinfacht mit Douglas-Peucker (Toleranz ${TOLERANCE_METERS} m, ${before} → ${after} Punkte). Gemeinsame Grenzen`,
    '// sind deckungsgleich, es gibt also keine Lücken zwischen benachbarten Veedeln.',
    `// Grenzkorrektur (höchstens ${MAX_CORRECTION_METERS} m) für Plätze auf der Grenzlinie: ${corrected.join(', ') || 'keine'}.`,
    '',
    '/** Grenze pro Veedel als flache Liste [lng, lat, lng, lat, …], Ring ohne Wiederholung des Startpunkts. */',
    'export const BOUNDARY_COORDINATES: Record<string, readonly number[]> = {',
  ];
  for (const id of Object.values(VEEDEL)) {
    lines.push(`  '${id}': [${simplified[id].flat().join(', ')}],`);
  }
  lines.push('};', '');
  lines.push('/** Veedel mit gemeinsamer Grenze (aus den ungekürzten Originaldaten). */');
  lines.push('export const SHARED_BORDERS: Record<string, readonly string[]> = {');
  for (const id of Object.values(VEEDEL)) {
    lines.push(`  '${id}': [${neighbors[id].map((n) => `'${n}'`).join(', ')}],`);
  }
  lines.push('};', '');
  writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`${OUT_FILE}: ${after} Punkte (vorher ${before}), korrigiert: ${corrected.join(', ') || 'nichts'}`);
}

await main();
