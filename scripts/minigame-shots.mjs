// Bilder der Minispiele (Auftrag 44) für Desktop (1440 × 900) und Handy (390 × 844): Einleitung, Spiel nach ein paar
// Sekunden und Ergebnis, über die Vorschau ?minispiel=<art> (erfundene Lage, nichts im Spielstand).
//
//   npm run screenshot:minigames -- --kind=safe
//   npm run screenshot:minigames -- --kind=alle --sizes=mobile --schwer=0.8 --ergebnis=verloren
//
// Optionen: --kind (Art oder alle, Standard alle), --sizes (desktop,mobile), --out (Standard screenshots/minispiele),
// --schwer (0 bis 1, Standard 0.5), --seed (Standard 1), --spielzeit (ms nach dem Countdown, Standard 3000),
// --ergebnis (geschafft | verloren, Standard geschafft), --motion=reduce. Meldet Fehler aus der Browser-Konsole.

import { mkdirSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';
import { VIEWPORTS } from './phone-scenes.mjs';

restartWithProxySupport();

/** Alle Arten (wie MINIGAME_KIND_IDS in src/modules/minigames/kinds/index.ts). */
const KINDS = [
  'chase',
  'brawl',
  'stash',
  'traffic',
  'undercover',
  'safe',
  'search',
  'container',
  'papers',
  'interview',
];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const kinds = !args.kind || args.kind === 'alle' ? KINDS : args.kind.split(',');
const unknown = kinds.filter((k) => !KINDS.includes(k));
if (unknown.length > 0) {
  console.error(`Unbekannte Art: ${unknown.join(', ')}. Bekannt: ${KINDS.join(', ')}, alle.`);
  process.exit(1);
}
const sizes = (args.sizes ?? 'desktop,mobile').split(',');
const outDir = args.out ?? 'screenshots/minispiele';
const difficulty = args.schwer ?? '0.5';
const seed = args.seed ?? '1';
const playMs = Number(args.spielzeit ?? 3000);
const win = (args.ergebnis ?? 'geschafft') !== 'verloren';

const { server, base } = await startServer();
const browser = await launchBrowser();
mkdirSync(outDir, { recursive: true });

const errors = [];
try {
  for (const kind of kinds) {
    for (const size of sizes) {
      const context = await browser.newContext({
        ...VIEWPORTS[size],
        reducedMotion: args.motion === 'reduce' ? 'reduce' : 'no-preference',
      });
      await routeExternal(context, base);
      const page = await context.newPage();
      const tag = `[${kind}/${size}]`;
      page.on('pageerror', (e) => errors.push(`${tag} ${e.message}`));
      page.on('console', (m) => {
        const text = m.text();
        if (m.type() === 'error' && !text.includes('AJAXError') && !text.includes('Failed to load resource')) {
          errors.push(`${tag} ${text}`);
        }
      });
      const url = `?neu=normal&seed=${seed}&tempo=0&minispiel=${kind}&schwer=${difficulty}`;
      await page.goto(new URL(url, base).toString());
      await page.waitForSelector('.mg-intro', { timeout: 20000 });
      // Karte und Schriften kurz laden lassen.
      await page.waitForTimeout(1500);
      const shot = async (step) => {
        const file = `${outDir}/${kind}-${size}-${step}.png`;
        await page.screenshot({ path: file });
        console.log(`Screenshot: ${file}`);
      };
      await shot('1-einleitung');
      await page.click('.mg-intro .mg-button.is-gold');
      await page.waitForSelector('.mg-run.is-play', { timeout: 8000 });
      await page.waitForTimeout(playMs);
      await shot('2-spiel');
      await page.evaluate((won) => {
        const dev = window.koeln?.dev;
        if (won) dev?.minigameWin?.();
        else dev?.minigameLose?.();
      }, win);
      await page.waitForSelector('.mg-result', { timeout: 8000 });
      await page.waitForTimeout(900);
      await shot('3-ergebnis');
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length > 0) {
  console.error(`\nFehler im Browser:\n${errors.join('\n')}`);
  process.exit(1);
}
