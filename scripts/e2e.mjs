// Ende-zu-Ende-Test im echten Browser (Playwright): neues Spiel, selbst verkaufen, Läufer anheuern, Ware bestellen,
// speichern, laden und nach dem Neuladen der Seite den Autosave fortsetzen. Bedient die Oberfläche wie ein Mensch
// (Klicks auf Karte, Handy, Dialoge); nur zum Vorspulen der Zeit wird die Simulation direkt angestoßen.
// Speichert Screenshots nach screenshots/e2e-*.png und schlägt fehl, wenn etwas nicht klappt oder der Browser
// Fehler meldet.
//
//   npm run e2e                  (Desktop und Handy)
//   npm run e2e -- --size=mobile

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const sizes = (args.size ?? 'desktop,mobile').split(',');
let size = sizes[0];
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const outDir = 'screenshots';
mkdirSync(outDir, { recursive: true });

const { server, base } = await startServer(5191);
const browser = await launchBrowser();
const errors = [];
const isTileError = (text) => text.includes('AJAXError') || text.includes('Failed to load resource');
let step = 0;

/** Zustand aus dem Spiel lesen (nur lesen, wie die Oberfläche). */
const game = (page, fn) => page.evaluate(`(${fn})(window.koeln.session.state)`);
/** Spielzeit vorspulen (Minuten) und neu zeichnen. */
const advance = (page, minutes) =>
  page.evaluate((m) => {
    window.koeln.session.sim.advance(m);
    window.koeln.runtime.requestRender();
  }, minutes);

async function shot(page, name) {
  step++;
  const file = `${outDir}/e2e-${String(step).padStart(2, '0')}-${name}-${size}.png`;
  await page.waitForTimeout(300);
  await page.screenshot({ path: file });
  console.log(`  Screenshot: ${file}`);
}

/** Spielstände liegen im Menü (Hamburger-Knopf im HUD). */
async function openSaves(page) {
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('button', { name: 'Spielstände' }).click();
}

async function check(name, fn) {
  process.stdout.write(`- ${name} … `);
  await fn();
  console.log('ok');
}

async function run() {
  const context = await browser.newContext(VIEWPORTS[size]);
  await routeExternal(context, base);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isTileError(m.text())) errors.push(m.text());
  });

  await check('Neues Spiel über den Start-Dialog', async () => {
    await page.goto(base);
    await page.getByRole('button', { name: "Los geht's" }).click();
    await page.waitForFunction(() => window.koeln?.session?.state?.time > 0);
    // Pause, damit der Test nicht vom Tempo abhängt; die Zeit spulen wir gezielt vor.
    await page.evaluate(() => window.koeln.runtime.api.setSpeed(0));
    const state = await game(page, (s) => ({ time: s.time, mode: s.meta.mode, dirty: s.wallet.dirty }));
    assert.equal(state.mode, 'normal');
    assert.equal(state.dirty, 1500);
    await page.waitForSelector('.spot-marker');
    await shot(page, 'neues-spiel');
  });

  await check('Selbst am Spot verkaufen', async () => {
    // Warten, bis am Zülpicher Platz jemand steht.
    for (let i = 0; i < 48; i++) {
      const waiting = await game(
        page,
        (s) => s.modules.customers.waiting.filter((c) => c.spotId === 'zuelpicher').length,
      );
      if (waiting > 0) break;
      await advance(page, 10);
    }
    const before = await game(page, (s) => ({
      dirty: s.wallet.dirty,
      served: s.modules.customers.stats.customersServed,
    }));
    await page.locator('.spot-marker', { hasText: 'Zülpicher Platz' }).click();
    await page.getByRole('button', { name: 'Verkaufen', exact: true }).first().click();
    const after = await game(page, (s) => ({
      dirty: s.wallet.dirty,
      served: s.modules.customers.stats.customersServed,
    }));
    assert.equal(after.served, before.served + 1);
    assert.ok(after.dirty > before.dirty, 'Geld nach dem Verkauf');
    await shot(page, 'verkauft');
  });

  await check('Selbst an den Spot stellen, dann verkauft es sich von allein', async () => {
    await page.getByRole('button', { name: 'Hier hinstellen', exact: true }).click();
    assert.equal(await game(page, (s) => s.modules.customers.self.spotId), 'zuelpicher');
    const served = await game(page, (s) => s.modules.customers.stats.customersServed);
    for (let i = 0; i < 48; i++) {
      if ((await game(page, (s) => s.modules.customers.stats.customersServed)) > served) break;
      await advance(page, 10);
    }
    assert.ok((await game(page, (s) => s.modules.customers.stats.customersServed)) > served, 'automatisch verkauft');
    await page.getByRole('button', { name: 'Weggehen', exact: true }).click();
    assert.equal(await game(page, (s) => s.modules.customers.self.spotId), null);
  });

  await check('Läufer am Spot anheuern', async () => {
    await page.getByRole('button', { name: /^Anheuern/ }).click();
    const staff = await game(page, (s) => s.modules.staff.members.map((m) => [m.role, m.assignment?.targetId]));
    assert.deepEqual(staff, [['runner', 'zuelpicher']]);
    await shot(page, 'laeufer');
  });

  await check('Ware im Handy bei den Lieferanten bestellen', async () => {
    // Am Desktop ist das Handy angedockt und zeigt noch die Spot-Details: zum Startbildschirm.
    // Am Handy-Bildschirm liegt es nach dem Anheuern noch offen über der Karte.
    if (await page.locator('.phone').count()) await page.locator('.phone__nav-button').click();
    else await page.getByRole('button', { name: /^Handy/ }).click();
    await page.locator('.phone').getByRole('button', { name: 'Lieferanten', exact: true }).click();
    await page.getByRole('button', { name: /Toni · Frankfurt/ }).click();
    await shot(page, 'lieferant');
    await page.locator('.phone').getByRole('button', { name: 'Kaufen', exact: true }).first().click();
    const shipments = await game(page, (s) => s.modules.suppliers.shipments.map((x) => x.supplierId));
    assert.deepEqual(shipments, ['frankfurt']);
    await shot(page, 'bestellt');
    // Zurück zum Startbildschirm.
    await page.locator('.phone__nav-button').click();
    await page.locator('.phone__nav-button').click();
    // Gesperrte Lieferanten zeigen, was noch fehlt.
    if (!(await page.locator('.phone').count())) await page.getByRole('button', { name: /^Handy/ }).click();
    await page.locator('.phone').getByRole('button', { name: 'Lieferanten', exact: true }).click();
    assert.ok(await page.getByRole('button', { name: /Jansen · Hafen Rotterdam.*Liegeplatz/ }).isVisible());
    await page.locator('.phone__nav-button').click();
  });

  await check('Hafen-Seite (über das Lager): Liegeplatz braucht sauberes Geld', async () => {
    await page.evaluate(() => window.koeln.runtime.api.openPanel('goods.warehouse', { warehouseId: 'ehrenfeld' }));
    await page
      .locator('.phone')
      .getByRole('button', { name: /^Niehler Hafen/ })
      .click();
    const berth = page.getByRole('button', { name: /^Liegeplatz mieten/ });
    assert.ok(await berth.isDisabled(), 'ohne sauberes Geld kein Liegeplatz');
    await page.evaluate(() => {
      window.koeln.session.state.wallet.clean = 5000;
    });
    await advance(page, 1);
    await berth.click();
    assert.equal(await game(page, (s) => s.modules.logistics.berth !== null), true);
    await shot(page, 'hafen');
    // Zurück zum Startbildschirm, dann das Handy weglegen.
    await page.evaluate(() => window.koeln.runtime.api.openPhone(null));
    if (await page.locator('.phone').count()) await page.locator('.phone__nav-button').click();
  });

  await check('Kasse im Handy: Gewinn- und Verlustrechnung', async () => {
    await page.evaluate(() => window.koeln.runtime.api.openPhone(null));
    await page.locator('.phone').getByRole('button', { name: 'Kasse', exact: true }).first().click();
    await page.locator('.phone').getByText('Straßenverkauf').first().waitFor();
    assert.ok(await page.locator('.phone').getByText('Einkauf Ware').first().isVisible(), 'Einkauf als Ausgabe');
    await page.locator('.phone').getByRole('button', { name: '7 Tage', exact: true }).click();
    await shot(page, 'kasse');
  });

  await check('Leutnant mit zwei Spots ernennen', async () => {
    const staffId = await page.evaluate(() => {
      const m = window.koeln.session.state.modules.staff.members[0];
      m.level = 2;
      window.koeln.runtime.api.openPanel('staff.profile', { staffId: m.id });
      return m.id;
    });
    await page
      .locator('.phone')
      .getByRole('button', { name: /Zum Leutnant machen/ })
      .click();
    await page
      .locator('.ui-sheet')
      .getByRole('button', { name: /Zülpicher Platz/ })
      .click();
    await page
      .locator('.ui-sheet')
      .getByRole('button', { name: /Neumarkt/ })
      .click();
    await page.locator('.ui-sheet').getByRole('button', { name: 'Weiter', exact: true }).click();
    await page.locator('.ui-sheet').getByRole('button', { name: 'Ernennen', exact: true }).click();
    const spots = await game(page, (s) => Object.values(s.modules.hierarchy.posts).map((p) => [p.staffId, p.spotIds]));
    assert.deepEqual(spots, [[staffId, ['zuelpicher', 'neumarkt']]]);
    await page.evaluate((id) => window.koeln.runtime.api.openPanel('hierarchy.lieutenant', { staffId: id }), staffId);
    await page.locator('.phone').getByText('Spot zuweisen').first().waitFor();
    await shot(page, 'leutnant');
    await page.evaluate(() => window.koeln.runtime.api.closePhone());
  });

  let saved;
  await check('Speichern und Laden', async () => {
    saved = await game(page, (s) => ({ time: s.time, dirty: s.wallet.dirty, staff: s.modules.staff.members.length }));
    await openSaves(page);
    await page.getByRole('button', { name: 'Speichern', exact: true }).first().click();
    await page.keyboard.press('Escape');
    await advance(page, 300);
    const later = await game(page, (s) => s.time);
    assert.equal(later, saved.time + 300);
    await openSaves(page);
    // Zeile "Speicherplatz 1": dort "Laden".
    await page.locator('.ui-list__item', { hasText: 'Speicherplatz 1' }).getByRole('button', { name: 'Laden' }).click();
    const loaded = await game(page, (s) => ({
      time: s.time,
      dirty: s.wallet.dirty,
      staff: s.modules.staff.members.length,
    }));
    assert.deepEqual(loaded, saved);
    await shot(page, 'geladen');
  });

  await check('Nach dem Neuladen geht es mit dem Autosave weiter', async () => {
    await page.evaluate(() => window.koeln.runtime.api.setSpeed(0));
    const before = await page.evaluate(() => {
      window.koeln.session.autosave();
      return window.koeln.session.state.time;
    });
    await page.reload();
    await page.waitForFunction(() => window.koeln?.session?.state?.time > 0);
    const resumed = await game(page, (s) => ({ time: s.time, staff: s.modules.staff.members.length }));
    // Nach dem Laden kann die Uhr schon wieder ein paar Minuten gelaufen sein.
    assert.ok(resumed.time >= before && resumed.time < before + 60, `Zeit ${resumed.time} statt ${before}`);
    assert.equal(resumed.staff, 1);
    assert.equal(await page.getByRole('button', { name: "Los geht's" }).count(), 0, 'kein Neues-Spiel-Dialog');
    await shot(page, 'fortgesetzt');
  });

  await context.close();
}

try {
  for (const next of sizes) {
    size = next;
    step = 0;
    console.log(`\n${size === 'mobile' ? 'Handy (390×844)' : 'Desktop (1440×900)'}`);
    await run();
  }
} catch (error) {
  console.error(`\nFehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}

if (errors.length > 0) {
  console.error(`\nFehler im Browser:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
if (!process.exitCode) console.log('\nEnde-zu-Ende-Test bestanden.');
