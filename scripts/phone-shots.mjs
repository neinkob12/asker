// Screenshots der Handy-Bildschirme (Startbildschirm, Nachrichten, Chat, Leute, Einstellungen, Ereignisse …)
// für Desktop und Handy-Bildschirm, gedacht zum Prüfen von Änderungen an der Handy-Oberfläche.
//
//   npm run screenshot:phone
//   npm run screenshot:phone -- --out=/tmp/vorher --scenes=home,chat --sizes=desktop
//
// Optionen:
//   --out     Zielordner (Standard: screenshots/handy)
//   --scenes  Kommagetrennte Auswahl (Standard: alle, siehe SCENES)
//   --sizes   desktop,mobile (Standard beide)
//   --time    Spielminuten, die vor den Szenen vorgespult werden (Standard 720 = Tag 2, 6 Uhr)
//   --appearance  dark (Standard) oder light: Erscheinungsbild des Handys (Tokens tragen beide Varianten)
// Die Szenen laufen pausiert (tempo=0) mit festem Seed, damit Vorher/Nachher vergleichbar bleiben.

import { mkdirSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';
import { openGame, SCENES, showScene, VIEWPORTS } from './phone-scenes.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const outDir = args.out ?? 'screenshots/handy';
const sizes = (args.sizes ?? 'desktop,mobile').split(',');
const advance = Number(args.time ?? 720);
const appearance = args.appearance === 'light' ? 'light' : 'dark';

const wanted = args.scenes ? args.scenes.split(',') : SCENES.map((s) => s.name);

const { server, base } = await startServer();
const browser = await launchBrowser();
mkdirSync(outDir, { recursive: true });
const errors = [];
try {
  for (const size of sizes) {
    const context = await browser.newContext({ ...VIEWPORTS[size], colorScheme: appearance });
    await routeExternal(context, base);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`[${size}] ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && !text.includes('AJAXError') && !text.includes('Failed to load resource')) {
        errors.push(`[${size}] ${text}`);
      }
    });
    await openGame(page, base, advance);
    await page.addStyleTag({ content: `.phone { color-scheme: ${appearance} !important; }` });
    for (const scene of SCENES.filter((s) => wanted.includes(s.name))) {
      await showScene(page, scene);
      const file = `${outDir}/${scene.name}-${size}.png`;
      await page.screenshot({ path: file });
      console.log(`Screenshot: ${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length > 0) {
  console.error(`\nFehler im Browser:\n${errors.join('\n')}`);
  process.exit(1);
}
