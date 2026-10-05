// Startet das Spiel im Headless-Browser und speichert Screenshots (Desktop und Handy) nach screenshots/.
// Meldet Fehler aus der Browser-Konsole. Gedacht zum Selbst-Ausprobieren in jeder Session.
//
//   npm run screenshot
//   npm run screenshot -- --query="?neu=normal&seed=7" --wait=6000
//   npm run screenshot -- --eval="window.koeln.session.sim.advance(600)" --name=abend
//   npm run screenshot -- --click=".spot-marker" --sizes=mobile
//   npm run screenshot -- --scenes=normal-tag,konfrontation-briefing   (Szenen des Looks "Glas", glass-shots.mjs)
//   npm run screenshot -- --scenes=alle                                 (alle Szenen nach screenshots/glas/)
//
// Optionen:
//   --query   URL-Parameter (Standard: ?neu=normal&seed=1&tempo=0, also frisches Spiel, pausiert)
//   --wait    Wartezeit in ms nach dem Laden (Standard 4000, die Karte braucht etwas)
//   --eval    JavaScript, das vor dem Screenshot im Browser läuft (window.koeln = { session, runtime })
//   --after   Wartezeit in ms nach --eval und --click (Standard 400, z.B. 4000 für einen Kameraflug)
//   --click   CSS-Selektor, der vor dem Screenshot angeklickt wird
//   --sizes   desktop,mobile (Standard beide)
//   --name    Präfix der Dateinamen (Standard: spiel)
// Browser: CHROMIUM_PATH setzen, sonst wird der Playwright-Chromium gesucht.
// Kartenkacheln lädt Node (auch über einen HTTPS_PROXY), dann zeigt die Karte auch in abgeschotteten Umgebungen
// die echten Vektorkacheln (OpenFreeMap).

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';

restartWithProxySupport();

// Mit --scenes übernimmt das Szenen-Skript des Looks "Glas" (Normalbetrieb Tag/Nacht, Spot-Hover, Konfrontation,
// Razzia, Lieferung, Veedel übernommen; siehe glass-scenes.mjs).
const sceneArg = process.argv.find((a) => a.startsWith('--scenes='));
if (sceneArg) {
  const rest = process.argv.slice(2).filter((a) => a !== sceneArg || !a.endsWith('=alle'));
  const result = spawnSync(process.execPath, ['scripts/glass-shots.mjs', ...rest], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const query = args.query ?? '?neu=normal&seed=1&tempo=0';
const wait = Number(args.wait ?? 4000);
const sizes = (args.sizes ?? 'desktop,mobile').split(',');
const name = args.name ?? 'spiel';
const outDir = 'screenshots';

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const { server, base } = await startServer();
const browser = await launchBrowser();
mkdirSync(outDir, { recursive: true });

const errors = [];
let tileFailures = 0;
// Kartenkacheln kommen aus dem Netz. Sind sie nicht erreichbar (z.B. gesperrt), ist das nur eine Warnung.
const isTileError = (text) => text.includes('AJAXError') || text.includes('Failed to load resource');
try {
  for (const size of sizes) {
    const context = await browser.newContext(VIEWPORTS[size]);
    const failed = await routeExternal(context, base);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`[${size}] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (isTileError(m.text())) tileFailures++;
      else errors.push(`[${size}] ${m.text()}`);
    });
    await page.goto(new URL(query, base).toString());
    await page.waitForSelector('.shell-map', { timeout: 15000 });
    await page.waitForTimeout(wait);
    if (args.eval) await page.evaluate(args.eval);
    if (args.click) await page.click(args.click);
    await page.waitForTimeout(Number(args.after ?? 400));
    const file = `${outDir}/${name}-${size}.png`;
    await page.screenshot({ path: file });
    console.log(`Screenshot: ${file}`);
    tileFailures += failed();
    await context.close();
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
