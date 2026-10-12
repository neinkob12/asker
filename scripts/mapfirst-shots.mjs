// Screenshots des Prototyps „Karte zuerst“ (?ui=karte), Handy-Bildschirm. Aufruf: node scripts/mapfirst-shots.mjs <ordner> [gold|neon]
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';
import { openGame, showScene, VIEWPORTS, waitForStill } from './phone-scenes.mjs';

restartWithProxySupport();
const out = process.argv[2];
const accent = process.argv[3] ?? 'gold';
const scenes = [
  { name: 'karte', js: 'window.koeln.runtime.api.closeDialog()' },
  {
    name: 'spot',
    js: `window.koeln.runtime.api.openPanel('spots.spot', { spotId: window.koeln.session.sim.state.modules.spots.unlocked[0] })`,
  },
  { name: 'chats', js: `window.koeln.runtime.api.openPhone('core.messages')` },
  { name: 'einkauf', js: `window.koeln.runtime.api.openPhone('suppliers.app')` },
  { name: 'kasse-ganz', js: `window.koeln.runtime.api.openPhone('finance.app')`, full: true },
  { name: 'mehr', js: `window.koeln.runtime.api.openPhone(null)` },
];
const { server, base } = await startServer();
const browser = await launchBrowser();
const errors = [];
try {
  const context = await browser.newContext(VIEWPORTS.mobile);
  await context.addInitScript(
    `localStorage.setItem('koeln-tycoon:ui-proto','karte'); ${accent === 'neon' ? "localStorage.setItem('koeln-tycoon:ui-accent','neon')" : "localStorage.removeItem('koeln-tycoon:ui-accent')"}`,
  );
  await routeExternal(context, base);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await openGame(page, base, 720);
  for (let i = 0; i < 3; i++) {
    const later = page.getByRole('button', { name: 'Später' });
    if (await later.count()) await later.first().click();
    await page.waitForTimeout(300);
  }
  for (const s of scenes) {
    await showScene(page, s);
    if (s.full) {
      await page.click('.mapfirst-grabber');
      await page.waitForTimeout(600);
      await waitForStill(page);
    }
    await page.screenshot({ path: `${out}/${s.name}-${accent}.png` });
    console.log(s.name);
  }
} finally {
  await browser.close();
  server.close();
}
if (errors.length) console.log('Fehler:', errors);
