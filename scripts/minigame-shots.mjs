// Bilder der Minispiele (Auftrag 44) für Desktop (1440 × 900) und Handy (390 × 844): Einleitung, Spiel nach ein paar
// Sekunden und Ergebnis, über die Vorschau (erfundene Lage, nichts im Spielstand),
// geöffnet mit window.koeln.dev.minigamePreview, sobald das Spiel steht.
//
//   npm run screenshot:minigames -- --kind=safe
//   npm run screenshot:minigames -- --kind=alle --sizes=mobile --schwer=0.8 --ergebnis=verloren
//   npm run screenshot:minigames -- --kind=chase --uhr=23 --spielstand=ankunft-hamburg
//
// Optionen: --kind (Art oder alle, Standard alle), --sizes (desktop,mobile), --out (Standard screenshots/minispiele),
// --schwer (0 bis 1, Standard 0.5), --seed (Standard 1), --spielzeit (ms nach dem Countdown, Standard 3000),
// --ergebnis (geschafft | verloren, Standard geschafft), --motion=reduce, --uhr (Stunde 0 bis 23: Spieluhr und
// Tageszeit der Lage), --spielstand (Test-Spielstand, z.B. ankunft-hamburg; die Vorschau öffnet erst nach dem Laden
// und spielt in dessen aktiver Stadt), --echtzeit=0 (Spielzeit wie im Spiel gedeckelt; Standard: Echtzeit, damit
// headless mit wenigen Bildern pro Sekunde „nach 3 s“ auch 3 s Spielzeit sind). Meldet Fehler aus der Browser-Konsole.

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
const hour = args.uhr === undefined ? undefined : Number(args.uhr);
if (hour !== undefined && !(hour >= 0 && hour < 24)) {
  console.error('--uhr braucht eine Stunde von 0 bis 23.');
  process.exit(1);
}
const save = args.spielstand;
const realtime = args.echtzeit !== '0';

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
      const url = save ? `?spielstand=${save}&tempo=0` : `?neu=normal&seed=${seed}&tempo=0`;
      await page.goto(new URL(url, base).toString());
      // Ein Test-Spielstand ist geladen, wenn er sich aus der Adresse genommen hat (src/ui/start.tsx).
      if (save)
        await page.waitForFunction(() => !window.location.search.includes('spielstand='), null, { timeout: 30000 });
      // Vorschau über den Dev-Haken (erst, wenn Spiel und HUD stehen): so gelten Spielstand und Uhrzeit.
      await page.waitForFunction(
        ({ kind, difficulty, seed, hour, realtime }) => {
          const dev = window.koeln?.dev;
          if (!dev?.minigamePreview) return false;
          dev.minigameRealtime?.(realtime);
          return dev.minigamePreview(kind, { schwer: Number(difficulty), seed: Number(seed), uhr: hour });
        },
        { kind, difficulty, seed, hour, realtime },
        { timeout: 20000, polling: 250 },
      );
      await page.waitForSelector('.mg-intro', { timeout: 20000 });
      // Karte und Schriften kurz laden lassen.
      await page.waitForTimeout(1500);
      const shot = async (step) => {
        const file = `${outDir}/${kind}-${size}${hour === undefined ? '' : `-${hour}uhr`}${save ? `-${save}` : ''}-${step}.png`;
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
