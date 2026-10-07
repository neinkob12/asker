// Ende-zu-Ende-Test im echten Browser (Playwright): neues Spiel mit Tutorial (nur der Neumarkt, Mission 1 mit drei
// Verkäufen und Belohnung, dann in den Einstellungen beendet), selbst verkaufen, Läufer anheuern, Ware bestellen,
// speichern, laden und nach dem Neuladen der Seite den Autosave fortsetzen. Bedient die Oberfläche wie ein Mensch (Klicks auf Karte, Handy, Dialoge); nur zum Vorspulen der Zeit
// wird die Simulation direkt angestoßen.
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
/**
 * Kachel-Fehler kommen bei MapLibre aus dem Worker als AJAXError ohne Stack; die Konsole zeigt dann nur den
 * (minifizierten) Klassennamen, z.B. "xn". Darum am Objekt prüfen: status, statusText und eine fremde url.
 */
const isForeignAjaxError = (arg) =>
  arg
    .evaluate(
      (e) =>
        !!e &&
        typeof e === 'object' &&
        'status' in e &&
        'statusText' in e &&
        typeof e.url === 'string' &&
        !e.url.startsWith(location.origin),
    )
    .catch(() => false);
/** Noch laufende Prüfungen von Konsolen-Fehlern (vor dem Schließen des Browsers abwarten). */
const pendingChecks = [];
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
    if (m.type() !== 'error' || isTileError(m.text())) return;
    pendingChecks.push(
      Promise.all(m.args().map(isForeignAjaxError)).then((tile) => {
        if (!tile.some(Boolean)) errors.push(m.text());
      }),
    );
  });

  await check('Intro beim ersten Start, Name für die Bestenliste', async () => {
    await page.goto(base);
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByRole('button', { name: 'Überspringen' }).click();
    await page.getByLabel('Dein Name').fill('E2E Tester');
    await page.getByRole('button', { name: 'Weiter' }).click();
    const name = await page.evaluate(() => localStorage.getItem('koeln-tycoon:player-name'));
    assert.equal(name, 'E2E Tester');
  });

  await check('Neues Spiel über den Start-Dialog', async () => {
    await page.getByRole('button', { name: "Los geht's" }).click();
    await page.waitForFunction(() => window.koeln?.session?.state?.time > 0);
    // Pause, damit der Test nicht vom Tempo abhängt; die Zeit spulen wir gezielt vor.
    await page.evaluate(() => window.koeln.runtime.api.setSpeed(0));
    const state = await game(page, (s) => ({
      time: s.time,
      mode: s.meta.mode,
      dirty: s.wallet.dirty,
      tutorial: s.modules.tutorial.enabled,
    }));
    assert.equal(state.mode, 'normal');
    // Auftrag 46b: Im Modus normal läuft das Tutorial, mit 700 € mehr Startgeld.
    assert.equal(state.tutorial, true);
    assert.equal(state.dirty, 2200);
    await page.waitForSelector('.spot-marker');
    await shot(page, 'neues-spiel');
  });

  await check(
    'Tutorial: nur der Neumarkt, Mission 1 auf der Karte, drei Verkäufe erledigen sie, Belohnung kommt',
    async () => {
      // Auftrag 46b: Am Anfang gibt es nur den Neumarkt, Apps wie Gangs und Lieferanten fehlen noch.
      // Marker gibt es für jeden Spot der aktiven Stadt (gesperrte grau, Auftrag 47); offen ist nur der Neumarkt.
      assert.equal(await page.locator('.spot-marker:not(.is-locked)').count(), 1, 'nur ein offener Spot');
      const wasOpen = await page.evaluate(() => window.koeln.runtime.ui.phone.open);
      await page.evaluate(() => window.koeln.runtime.api.openPhone(null));
      const home = page.locator('.phone__home');
      await home.getByRole('button', { name: /^Einstellungen/ }).waitFor();
      assert.equal(await home.getByRole('button', { name: /^Gangs/ }).count(), 0, 'Gangs fehlt am Anfang');
      assert.equal(await home.getByRole('button', { name: /^Lieferanten/ }).count(), 0, 'Lieferanten fehlen am Anfang');
      if (!wasOpen) await page.evaluate(() => window.koeln.runtime.api.closePhone());
      // Stufe 0 ist eine Erklär-Stufe: „Weiter“ auf der Karte bringt Mission 1.
      const card = page.locator('.tutorial-hud');
      await card.getByRole('button', { name: 'Weiter', exact: true }).click();
      await card.getByText('Drei Kunden bedienen').waitFor();
      assert.equal(await game(page, (s) => s.modules.tutorial.mission?.id), 'serve3');
      await page.waitForTimeout(800);
      await shot(page, 'tutorial-mission-1');
      const before = await game(page, (s) => s.wallet.dirty);
      // Am Handy-Bildschirm liegt der Neumarkt sonst unter dem HUD: Kamera hin.
      await page.evaluate(() => window.koeln.runtime.api.flyTo({ lng: 6.9476, lat: 50.9362 }, 16));
      await page.waitForTimeout(1500);
      for (let sold = 0; sold < 3; sold++) {
        for (let i = 0; i < 60; i++) {
          const waiting = await game(
            page,
            (s) => s.modules.customers.waiting.filter((c) => c.spotId === 'neumarkt').length,
          );
          if (waiting > 0) break;
          await advance(page, 10);
        }
        // Die Spot-Seite bleibt nach dem ersten Verkauf offen (am Handy-Bildschirm über der Karte).
        const sell = page.getByRole('button', { name: 'Verkaufen', exact: true }).first();
        if (!(await sell.isVisible())) await page.locator('.spot-marker[aria-label*="Neumarkt"]').click();
        await sell.click();
      }
      const after = await game(page, (s) => ({
        dirty: s.wallet.dirty,
        done: s.modules.tutorial.done,
        stage: s.modules.tutorial.stage,
        mission: s.modules.tutorial.mission?.id,
      }));
      assert.deepEqual(after.done, ['serve3'], 'Mission 1 erledigt');
      assert.equal(after.stage, 2);
      assert.equal(after.mission, 'buySpots');
      assert.ok(after.dirty >= before + 100, 'Belohnung (mindestens 100 €) nach drei Verkäufen');
      await card.getByText('Zwei Spots kaufen').waitFor();
      await shot(page, 'tutorial-mission-2');
      // Der Rest des Tests braucht alle Spots und Apps: beenden wie ein Spieler, der sich auskennt.
      await page.evaluate(() => window.koeln.runtime.api.openPhone(null));
      // Mit Badge heißt die Kachel "Einstellungen, 1 neu" (ein Ereignis im Verlauf, z.B. eine Gang drängt).
      await home.getByRole('button', { name: /^Einstellungen/ }).click();
      await page.locator('.phone').getByRole('button', { name: 'Tutorial beenden', exact: true }).click();
      assert.equal(await game(page, (s) => s.modules.tutorial.stage), 12);
      await page.evaluate(() => window.koeln.runtime.api.openPhone(null));
      await home.getByRole('button', { name: /^Gangs/ }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.spot-marker:not(.is-locked)').length >= 4);
      // Wie vorher: Lag das Handy weg, kommt es wieder weg; die Kamera zurück zum Zülpicher Platz (nächster Schritt).
      if (!wasOpen) await page.evaluate(() => window.koeln.runtime.api.closePhone());
      await page.evaluate(() => window.koeln.runtime.api.flyTo({ lng: 6.9398, lat: 50.9317 }, 16));
      await page.waitForTimeout(1500);
    },
  );

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
    // Die Plakette zeigt seit #41 nur Symbole: Der Name steht im aria-label des Markers.
    await page.locator('.spot-marker[aria-label*="Zülpicher Platz"]').click();
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
    await page.getByRole('button', { name: /Toni.*Frankfurt/ }).click();
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
    assert.ok(await page.getByRole('button', { name: /Jansen.*Liegeplatz/ }).isVisible());
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
    assert.equal(await game(page, (s) => s.modules.logistics.berths.koeln != null), true);
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

  await check('Eigenen Spot mit Art gründen (Befehl; der Weg über die Karte ist seit Auftrag 46d weg)', async () => {
    // Eine feste Stelle in Kalk: Der Shop-Platzhalter (46e) schickt denselben Befehl.
    const result = await page.evaluate(() => {
      window.koeln.session.state.wallet.dirty += 3000;
      return window.koeln.runtime.api.dispatch({
        type: 'spots.found',
        payload: { lng: 7.0035, lat: 50.9385, kind: 'park' },
      });
    });
    assert.equal(result.ok, true, result.reason);
    const custom = await game(page, (s) => s.modules.spots.custom.map((x) => [x.kind, x.veedelId]));
    assert.deepEqual(custom, [['park', 'kalk']]);
    assert.equal(
      await page
        .locator('.phone')
        .getByRole('button', { name: /Eigenen Spot gründen/ })
        .count(),
      0,
    );
  });

  await check('Stadt wechseln: Hamburg frei, Stadt-Chip, Hamburg aktiv, zurück nach Köln', async () => {
    assert.equal(await page.locator('.hud-pill', { hasText: 'Köln ▾' }).count(), 0, 'kein Stadt-Chip mit einer Stadt');
    await page.evaluate(() => {
      window.koeln.session.sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
      window.koeln.runtime.requestRender();
    });
    const chip = page.locator('.hud-pill', { hasText: 'Köln ▾' }).first();
    // Nach dem Freischalten kommen noch Nachrichten und das HUD ordnet sich neu: Geht die Karte des Stadt-Chips dabei
    // gleich wieder zu (das Menü-Element verschwindet, während es noch einfliegt), noch einmal öffnen.
    await chip.waitFor();
    await page.waitForTimeout(500);
    for (let attempt = 1; ; attempt++) {
      // Am linken Rand antippen: Am Handy-Bildschirm kann die schwebende Anzeige die Mitte der Kachelreihe verdecken.
      await chip.click({ position: { x: 14, y: 20 } });
      try {
        await page.locator('.city-menu__item', { hasText: 'Hamburg' }).first().click({ timeout: 5000 });
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }
    assert.equal(await game(page, (s) => s.modules.city.active), 'hamburg');
    await page.waitForFunction(() => window.koeln.runtime.api.mapView() === 'city:hamburg', null, { timeout: 15000 });
    await shot(page, 'hamburg');
    await page.evaluate(() => window.koeln.runtime.api.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } }));
    assert.equal(await game(page, (s) => s.modules.city.active), 'koeln');
  });

  await check('Route Köln → Hamburg im Blatt anlegen', async () => {
    await page.evaluate(() => {
      const api = window.koeln.runtime.api;
      window.koeln.session.state.wallet.clean = 20000;
      window.koeln.session.state.wallet.dirty = 20000;
      api.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'werkstatt-ottensen' } });
      api.dispatch({ type: 'staff.hireDriver', payload: {} });
      api.openPanel('logistics.routes', {});
    });
    await page.locator('.phone').getByRole('button', { name: 'Neue Route', exact: true }).click();
    const sheet = page.locator('.ui-sheet');
    await sheet.getByLabel('Startlager').selectOption('ehrenfeld');
    await sheet.getByLabel('Ziellager').selectOption('werkstatt-ottensen');
    const driverId = await game(page, (s) => s.modules.staff.members.find((m) => m.role === 'driver')?.id);
    await sheet.getByLabel('Fahrer', { exact: true }).selectOption(driverId);
    await shot(page, 'route-blatt');
    await sheet.getByRole('button', { name: 'Sichern', exact: true }).click();
    const routes = await game(page, (s) =>
      s.modules.logistics.routes.map((r) => [r.fromId, r.toId, r.driverId, r.items.length]),
    );
    assert.deepEqual(routes, [['ehrenfeld', 'werkstatt-ottensen', driverId, 1]]);
    await page.locator('.phone').getByText('Köln → Hamburg').first().waitFor();
    await shot(page, 'routen');
    await page.evaluate(() => window.koeln.runtime.api.closePhone());
  });

  await check('Minispiel: Bewerbungsgespräch selbst führen (Auftrag 44)', async () => {
    // Echter Weg über die Oberfläche: Personal › Bewerber › „Gespräch führen“ startet das Minispiel über der Karte.
    const candidate = await game(
      page,
      (s) =>
        s.modules.recruiting.candidates.find(
          (c) => c.source === 'pool' && c.cityId === s.modules.city.active && !c.interviewed && c.expiresAt > s.time,
        )?.name ?? null,
    );
    assert.ok(candidate, 'ein Bewerber wartet');
    // Offene HUD-Karten (z.B. „Ruf · Reviere“ aus einem früheren Schritt) liegen am Handy-Bildschirm über dem Handy:
    // erst schließen (Esc), dann das Ziel in die Mitte scrollen (oben HUD, unten Handy-Leiste) und antippen.
    // Nur ein Esc, dann warten, bis die Karte weg ist: Ein zweites Esc ginge ans Handy und legte es weg.
    const closeFlyouts = async () => {
      if ((await page.locator('.hud-flyout').count()) === 0) return;
      await page.keyboard.press('Escape');
      await page.locator('.hud-flyout').first().waitFor({ state: 'detached', timeout: 5000 });
    };
    const centered = async (locator) => {
      for (let attempt = 1; ; attempt++) {
        await closeFlyouts();
        await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        try {
          await locator.click({ timeout: 5000 });
          return;
        } catch (error) {
          if (attempt >= 3) throw error;
        }
      }
    };
    await closeFlyouts();
    await page.evaluate(() => window.koeln.runtime.api.openPhone('tab:staff'));
    await centered(page.locator('.phone').getByText(candidate, { exact: true }).first());
    await centered(page.getByText('Gespräch führen', { exact: true }));
    await page.waitForSelector('.mg-intro');
    assert.equal(await page.locator('.mg-overlay').count(), 1, 'Rahmen offen');
    // Spielzeit in Echtzeit (headless mit wenigen Bildern pro Sekunde wäre sie sonst gedeckelt und langsam).
    await page.evaluate(() => window.koeln.dev.minigameRealtime(true));
    await page.click('.mg-intro .mg-button.is-gold');
    await page.waitForSelector('.mg-run.is-play', { timeout: 10000 });
    await shot(page, 'minispiel-gespraech');
    // Drei Runden laufen von selbst (Lügendetektor): ab und zu „Zeichen!“ tippen, bis das Ergebnis steht.
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline && (await page.locator('.mg-result').count()) === 0) {
      const mark = page.locator('.iv-mark:enabled').first();
      if (await mark.count()) await mark.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(700);
    }
    await page.waitForSelector('.mg-result', { timeout: 5000 });
    await shot(page, 'minispiel-ergebnis');
    await page
      .locator('.mg-result')
      .getByRole('button', { name: /Weiter/ })
      .click();
    const last = await game(page, (s) => s.modules.minigames.history[0] ?? null);
    assert.equal(last?.kind, 'interview');
    assert.equal(last?.by, 'player');
    assert.ok(Number.isFinite(last?.score), 'Score gezählt');
    assert.equal(await game(page, (s) => s.modules.minigames.active.length), 0, 'kein Minispiel mehr offen');
    // Danach geht das Handy wieder beim Blatt der Person auf.
    await page.getByText('Gespräch geführt', { exact: false }).first().waitFor({ timeout: 5000 });
    await shot(page, 'minispiel-zurueck');
    await page.evaluate(() => {
      window.koeln.dev.minigameRealtime(false);
      window.koeln.runtime.api.closePhone();
    });
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
    assert.equal(resumed.staff, saved.staff);
    assert.equal(await page.getByRole('button', { name: "Los geht's" }).count(), 0, 'kein Neues-Spiel-Dialog');
    await shot(page, 'fortgesetzt');
  });

  await check('Test-Spielstand "Köln fast komplett" im Spielstände-Dialog laden', async () => {
    await page.evaluate(() => {
      window.koeln.runtime.api.setSpeed(0);
      window.koeln.runtime.api.openDialog('core.saves', {});
    });
    // Die Test-Spielstände stehen in eingeklappten Gruppen pro Stadt (Auftrag 43): erst Köln aufklappen.
    await page.locator('.ui-dialog summary', { hasText: 'Köln' }).first().click();
    const item = page.locator('.ui-dialog li', { hasText: 'Köln fast komplett' });
    await item.getByRole('button', { name: 'Laden', exact: true }).click();
    await page.waitForFunction(() => window.koeln.session.state?.meta.scenario === 'koeln-komplett', null, {
      timeout: 15000,
    });
    const loaded = await game(page, (s) => ({ dirty: s.wallet.dirty, won: s.outcome.won }));
    assert.equal(loaded.dirty, 50000);
    assert.equal(loaded.won, null);
    await shot(page, 'test-spielstand');
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
  await Promise.all(pendingChecks);
  await browser.close();
  await server.close();
}

if (errors.length > 0) {
  console.error(`\nFehler im Browser:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
if (!process.exitCode) console.log('\nEnde-zu-Ende-Test bestanden.');
