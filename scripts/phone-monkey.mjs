// Klickt sich zufällig (aber mit festem Seed, also wiederholbar) durch jede Handy-App und meldet, was schiefgeht:
//   - Fehler im Browser (Konsole, nicht abgefangene Ausnahmen),
//   - Knöpfe, die auf dem Bildschirm liegen, aber von etwas anderem verdeckt werden (Klick käme nicht an),
//   - ungültige Zahlen (NaN, Infinity) im Spielzustand,
//   - Seiten, die nach dem Klick leer sind (Sackgassen) oder nicht mehr schließbar.
//
//   npm run monkey:phone
//   npm run monkey:phone -- --steps=300 --seed=3 --sizes=mobile --apps=finance.app,core.settings
//
// Endet mit Fehlercode 1, wenn etwas gefunden wurde.

import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';
import { VIEWPORTS } from './phone-scenes.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const steps = Number(args.steps ?? 120);
const seed = Number(args.seed ?? 1);
const sizes = (args.sizes ?? 'mobile,desktop').split(',');

/** Jede Seite, die ein Spieler erreichen kann: Apps (openPhone) und Tabs (selectTab). */
const TARGETS = [
  { kind: 'phone', id: 'core.messages' },
  { kind: 'phone', id: 'finance.app' },
  { kind: 'phone', id: 'suppliers.app' },
  { kind: 'phone', id: 'laundering.app' },
  { kind: 'phone', id: 'core.settings' },
  { kind: 'phone', id: 'core.history' },
  { kind: 'tab', id: 'territory' },
  { kind: 'tab', id: 'gangs' },
  { kind: 'tab', id: 'staff' },
];
const wanted = args.apps ? args.apps.split(',') : TARGETS.map((t) => t.id);

/** Kleiner deterministischer Zufall (mulberry32). */
function rng(start) {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Läuft im Browser: Spielstand mit Geschäft, Leutnant, Rechter Hand, Lieferanten und Gang-Kontakt füllen. */
const SETUP = `(() => {
  const sim = window.koeln.session.sim;
  sim.state.wallet.dirty += 30000;
  sim.state.wallet.clean = (sim.state.wallet.clean ?? 0) + 8000;
  const spots = sim.state.modules.spots.unlocked;
  for (const spotId of spots.slice(0, 3)) sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  for (const id of ['frankfurt', 'rotterdam', 'antwerpen']) sim.dispatch({ type: 'suppliers.unlock', payload: { supplierId: id } });
  for (let day = 0; day < 3; day++) {
    for (const packageId of ['weed50', 'haze50', 'weed50']) {
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId } });
    }
    sim.advance(1440);
  }
  const runners = sim.state.modules.staff.members.filter((m) => m.role === 'runner' && m.status === 'active');
  for (const r of runners) r.level = Math.max(r.level, 3);
  if (runners[0]) sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: runners[0].id, spotIds: spots.slice(0, 2) } });
  if (runners[1]) sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: runners[1].id } });
  sim.advance(240);
})()`;

/** Läuft im Browser: sucht Zahlen, die keine sind. */
const SCAN = `(() => {
  const bad = [];
  const seen = new Set();
  const walk = (value, path) => {
    if (bad.length > 8) return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) bad.push(path + ' = ' + value);
      return;
    }
    if (value && typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
      for (const [k, v] of Object.entries(value)) walk(v, path + '.' + k);
    }
  };
  walk(window.koeln.session.state, 'state');
  return bad;
})()`;

/** Läuft im Browser: alle sichtbaren Bedienelemente im Handy und in Dialogen/Blättern. */
const COLLECT = `(() => {
  const SKIP = /neues spiel|neustart|zurücksetzen|spielstand|exportieren|importieren|datei|aufgeben|beenden|weglegen/i;
  const sel = [
    '.phone button', '.phone [role="button"]', '.phone [role="tab"]', '.phone [role="switch"]', '.phone select',
    '.phone input', '.ui-dialog button', '.ui-dialog [role="button"]', '.ui-sheet button', '.ui-sheet [role="button"]',
    '.ui-sheet [role="switch"]', '.ui-dialog [role="switch"]',
  ].join(',');
  const out = [];
  document.querySelectorAll(sel).forEach((el, index) => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    // Seiten unter der obersten (inert/versteckt) und Wisch-Aktionen hinter einer Zeile sind für den Spieler nicht da.
    if (el.closest('[inert], .is-hidden, [aria-hidden="true"]')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return;
    const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 50);
    if (SKIP.test(label)) return;
    el.setAttribute('data-monkey', String(index));
    out.push({ index, label, tag: el.tagName.toLowerCase() });
  });
  return out;
})()`;

/**
 * Läuft im Browser: liegt der Mittelpunkt des Elements (nach Scrollen) wirklich auf ihm? Verdeckt es nur eine
 * vorübergehende Ebene (Island, Banner, Blatt, Dialog), ist das kein Fund (overlay).
 */
const HIT = (index) => `(() => {
  const el = document.querySelector('[data-monkey="${index}"]');
  if (!el) return { gone: true };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const inView = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
  const top = document.elementFromPoint(x, y);
  const ok = !!top && (el === top || el.contains(top) || top.contains(el));
  const overlay = !!top && !!top.closest('.island, .phone-notice, .ui-sheet-layer, .ui-dialog-backdrop, .ui-dialog, .ui-menu, .ui-popover, .hud-flyout, .phone-notifications');
  const name = top ? (top.className && top.className.baseVal !== undefined ? top.className.baseVal : String(top.className)).slice(0, 60) || top.tagName : 'nichts';
  return { x, y, inView, ok, overlay, covered: name, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw: innerWidth, vh: innerHeight };
})()`;

const findings = new Map();
const note = (key, text) => {
  if (!findings.has(key)) findings.set(key, text);
};

const { server, base } = await startServer(5195);
const browser = await launchBrowser();
let exitCode = 0;
try {
  for (const size of sizes) {
    const context = await browser.newContext(VIEWPORTS[size]);
    await routeExternal(context, base);
    for (const target of TARGETS.filter((t) => wanted.includes(t.id))) {
      const page = await context.newPage();
      const where = `${size} · ${target.id}`;
      page.on('pageerror', (e) => note(`err:${e.message}`, `[${where}] Ausnahme: ${e.message.split('\n')[0]}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/Failed to load resource|tile|net::ERR|WebGL|maplibre|font/i.test(text)) return;
        note(`log:${text}`, `[${where}] Konsole: ${text.split('\n')[0].slice(0, 200)}`);
      });
      const enter = async (target) => {
        // Frisch ins Spiel (auch nach einem Neuladen, das selbst noch einmal nachlädt): ein paar Versuche.
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await target.goto(new URL(`?neu=normal&seed=${seed}&tempo=0`, base).toString());
            await target.waitForSelector('.shell-map', { timeout: 20000 });
            await target.waitForTimeout(1500);
            await target.evaluate(SETUP);
            return;
          } catch (error) {
            if (attempt === 3) throw error;
          }
        }
      };
      await enter(page);
      const random = rng(seed * 7919 + target.id.length);
      let depthStuck = 0;
      let lastLabel = '';
      for (let step = 0; step < steps; step++) {
        try {
          // Immer wieder frisch in die App einsteigen, damit nicht alles in einer Unterseite hängen bleibt.
          if (step % 25 === 0) {
            await page.evaluate(`(() => {
            const api = window.koeln.runtime.api;
            api.closeDialog(); api.closePanel(); api.toggleNotificationCenter(false); api.openPhone(null);
            ${target.kind === 'tab' ? `api.selectTab('${target.id}')` : `api.openPhone('${target.id}')`};
          })()`);
            await page.waitForTimeout(500);
          }
          if (step % 10 === 0) await page.evaluate('window.koeln.session.sim.advance(25)');
          await page.evaluate(
            'window.koeln.runtime.api.toggleIsland(false); window.koeln.runtime.api.dismissNotification()',
          );
          const items = await page.evaluate(COLLECT);
          if (items.length === 0) {
            // Keine Bedienelemente: Sackgasse? Dann muss "zurück" gehen.
            if (++depthStuck > 2) {
              note(
                `dead:${target.id}`,
                `[${where}] Keine Bedienelemente mehr sichtbar (Sackgasse?) nach ${step} Schritten.`,
              );
              await page.evaluate('window.koeln.runtime.api.back(); window.koeln.runtime.api.showPhone()');
            }
            await page.waitForTimeout(200);
            continue;
          }
          depthStuck = 0;
          const pick = items[Math.floor(random() * items.length)];
          const hit = await page.evaluate(HIT(pick.index));
          if (hit.gone) continue;
          if (!hit.inView)
            note(
              `off:${target.id}:${pick.label}`,
              `[${where}] „${pick.label}" liegt auch nach Scrollen außerhalb des Bildschirms (Rechteck ${hit.rect.join(',')}, Fenster ${hit.vw}×${hit.vh}).`,
            );
          else if (!hit.ok && !hit.overlay)
            note(`cov:${target.id}:${pick.label}`, `[${where}] „${pick.label}" wird verdeckt von ${hit.covered}.`);
          lastLabel = pick.label;
          if (hit.inView) {
            try {
              if (pick.tag === 'select') {
                const options = await page.$$eval(`[data-monkey="${pick.index}"] option`, (os) =>
                  os.map((o) => o.value),
                );
                if (options.length)
                  await page.selectOption(
                    `[data-monkey="${pick.index}"]`,
                    options[Math.floor(random() * options.length)],
                  );
              } else if (pick.tag === 'input') {
                await page.fill(
                  `[data-monkey="${pick.index}"]`,
                  random() < 0.5 ? '' : String(Math.floor(random() * 5000) - 100),
                  { timeout: 1000 },
                );
              } else {
                await page.mouse.click(hit.x, hit.y);
              }
            } catch {
              // Element verschwunden: kein Fund.
            }
          }
          await page.waitForTimeout(90);
          if (random() < 0.12)
            await page.evaluate('window.koeln.runtime.api.back(); window.koeln.runtime.api.showPhone()');
          if (step % 20 === 19) {
            const bad = await page.evaluate(SCAN);
            if (bad.length) note(`nan:${bad[0]}`, `[${where}] Ungültige Zahl im Spielstand: ${bad.join(', ')}`);
          }
        } catch (error) {
          // Ein Klick hat die Seite neu geladen (oder der Browser ist weg): als Fund melden und neu einsteigen.
          if (!/Execution context was destroyed|navigation/i.test(String(error))) throw error;
          note(`reload:${lastLabel}`, `[${where}] „${lastLabel}" hat die Seite neu geladen.`);
          await enter(page);
        }
      }
      await page.close();
      console.log(`${where}: fertig (${findings.size} Funde bisher)`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (findings.size === 0) {
  console.log('Keine Auffälligkeiten.');
} else {
  console.log(`\n${findings.size} Auffälligkeiten:`);
  for (const text of findings.values()) console.log(`- ${text}`);
  exitCode = 1;
}
process.exit(exitCode);
