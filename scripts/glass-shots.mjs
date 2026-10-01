// Bilder des Looks "Glas" (Auftrag 24) für Desktop (Handy offen bzw. weggelegt) und Handy-Bildschirm.
// Jede Szene startet ein frisches Spiel (Seed 1, pausiert), siehe glass-scenes.mjs.
//
//   node scripts/glass-shots.mjs
//   node scripts/glass-shots.mjs --scenes=normal-tag,spot-hover --sizes=desktop --out=/tmp/glas
//
// Optionen: --out (Standard screenshots/glas), --scenes (Standard alle), --sizes (desktop,mobile), --motion=reduce
// Meldet Fehler aus der Browser-Konsole (Kartenkacheln, die nicht laden, nur als Hinweis).

import { mkdirSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, startServer } from './browser.mjs';
import { PRELUDE, SCENES } from './glass-scenes.mjs';
import { VIEWPORTS, waitForStill } from './phone-scenes.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const outDir = args.out ?? 'screenshots/glas';
const sizes = (args.sizes ?? 'desktop,mobile').split(',');
const wanted = args.scenes ? args.scenes.split(',') : SCENES.map((s) => s.name);

const { server, base } = await startServer();
const browser = await launchBrowser();
mkdirSync(outDir, { recursive: true });

/** Kartenkacheln und Schriften lädt Node, einmal pro Lauf (Zwischenspeicher im Speicher). */
const cache = new Map();
let tileFailures = 0;
async function route(context) {
  const local = new URL(base).host;
  await context.route(
    (url) => url.host !== local && (url.protocol === 'https:' || url.protocol === 'http:'),
    async (r) => {
      const url = r.request().url();
      try {
        let hit = cache.get(url);
        if (!hit) {
          const response = await fetch(url, { headers: { accept: '*/*' } });
          hit = {
            status: response.status,
            type: response.headers.get('content-type'),
            body: Buffer.from(await response.arrayBuffer()),
          };
          if (response.ok) cache.set(url, hit);
        }
        const headers = { 'access-control-allow-origin': '*' };
        if (hit.type) headers['content-type'] = hit.type;
        await r.fulfill({ status: hit.status, headers, body: hit.body });
      } catch {
        tileFailures++;
        await r.abort();
      }
    },
  );
}

const errors = [];
try {
  for (const scene of SCENES.filter((s) => wanted.includes(s.name))) {
    for (const size of sizes) {
      if (scene.sizes && !scene.sizes.includes(size)) continue;
      const context = await browser.newContext({
        ...VIEWPORTS[size],
        reducedMotion: args.motion === 'reduce' ? 'reduce' : 'no-preference',
      });
      await route(context);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`[${scene.name}/${size}] ${e.message}`));
      page.on('console', (m) => {
        const text = m.text();
        if (m.type() === 'error' && !text.includes('AJAXError') && !text.includes('Failed to load resource')) {
          errors.push(`[${scene.name}/${size}] ${text}`);
        }
      });
      await page.goto(new URL('?neu=normal&seed=1&tempo=0', base).toString());
      await page.waitForSelector('.shell-map', { timeout: 15000 });
      await page.waitForTimeout(2500);
      await page.evaluate(`(async () => { ${PRELUDE}\n${scene.js}\n render(); })()`);
      // Die Karte blendet Tageszeiten weich über und lädt Kacheln nach.
      await page.waitForTimeout(scene.wait ?? 2500);
      if (scene.hover) await page.hover(scene.hover, { force: true });
      if (scene.after) await page.evaluate(`(async () => { ${PRELUDE}\n${scene.after}\n render(); })()`);
      await page.waitForTimeout(500);
      await waitForStill(page);
      const file = `${outDir}/${scene.name}-${size}.png`;
      await page.screenshot({ path: file });
      console.log(`Screenshot: ${file}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (tileFailures > 0) console.warn(`Hinweis: ${tileFailures} Kartenkacheln konnten nicht geladen werden (Netz).`);
if (errors.length > 0) {
  console.error(`\nFehler im Browser:\n${errors.join('\n')}`);
  process.exit(1);
}
