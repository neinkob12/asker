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

/** Jede Seite, die ein Spieler erreichen kann: Apps (openPhone), Tabs (selectTab) und Seiten (openPanel). */
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
  // Auftrag 30: Seiten der Logistik (Routen mit Blatt, Fahrer, Hafen).
  { kind: 'panel', id: 'logistics.routes' },
  { kind: 'panel', id: 'logistics.drivers' },
  { kind: 'panel', id: 'logistics.port' },
  // Auftrag 33: Lager-App (Fahrzeuge, Warenfluss), Lager-Seite mit Ausbau, Warenfluss.
  { kind: 'phone', id: 'goods.app' },
  { kind: 'panel', id: 'goods.warehouse', params: { warehouseId: 'ehrenfeld' } },
  { kind: 'panel', id: 'goods.flow' },
  // Auftrag 40: Verkauf (Boss von Deutschland, Jansen hat angerufen) und die App „Handel“ der Hafen-Phase.
  { kind: 'panel', id: 'city.sale', extra: 'germany' },
  { kind: 'phone', id: 'trade.app', extra: 'sold' },
  // Auftrag 41: Seite „Einkauf“ (Ware, Container, Deckladung, Schiff).
  { kind: 'panel', id: 'trade.order', params: { producerId: 'spanien' }, extra: 'sold' },
  // Auftrag 42: Anbau in der App Handel, Seiten Region und Finca, Verschiffen aus Cartagena.
  { kind: 'phone', id: 'trade.app', extra: 'grow' },
  { kind: 'panel', id: 'grow.region', params: { regionId: 'kolumbien' }, extra: 'grow' },
  {
    kind: 'panel',
    id: 'grow.finca',
    paramsJs: '{ fincaId: window.koeln.session.sim.state.modules.grow.fincas[0].id }',
    extra: 'grow',
  },
  { kind: 'panel', id: 'trade.order', params: { producerId: 'own-kolumbien' }, extra: 'grow' },
];

/** Zusätzliche Ausgangslagen (Auftrag 40), nach SETUP. */
const EXTRA = {
  germany: `(() => {
    window.koeln.dev.deutschlandKomplett();
    window.koeln.session.sim.state.modules.city.sale = { status: 'calling', callAt: null, sold: null };
    window.koeln.runtime.api.closeDialog();
  })()`,
  sold: `(() => {
    const sim = window.koeln.session.sim;
    window.koeln.dev.verkaufen();
    while (sim.state.modules.city.travel) sim.advance(30);
    sim.state.wallet.dirty += 300000;
    sim.state.wallet.clean += 300000;
    window.koeln.runtime.api.closeDialog();
  })()`,
  grow: `(() => {
    const sim = window.koeln.session.sim;
    window.koeln.dev.verkaufen();
    while (sim.state.modules.city.travel) sim.advance(30);
    sim.state.wallet.dirty += 3000000;
    sim.state.wallet.clean += 3000000;
    const trade = sim.state.modules.trade;
    trade.startedAt = sim.state.time - 21 * 1440;
    trade.stats.revenue = Math.max(trade.stats.revenue, 1500000);
    sim.advance(8 * 60);
    for (const regionId of ['kolumbien', 'marokko']) sim.dispatch({ type: 'grow.openRegion', payload: { regionId } });
    sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'el-tigre' } });
    sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'ketama-hang' } });
    for (const f of sim.state.modules.grow.fincas) {
      sim.dispatch({ type: 'grow.hire', payload: { fincaId: f.id, role: 'worker', count: 2 } });
      sim.dispatch({ type: 'grow.plant', payload: { fincaId: f.id, productId: f.regionId === 'marokko' ? 'hash' : 'weed' } });
    }
    trade.origins['own-kolumbien'] = { weed: { amount: 64000, quality: 0.7, pack: 0.8 } };
    window.koeln.runtime.api.closeDialog();
  })()`,
};
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
  // Zweite Stadt mit Lager, Fahrer und einer Route über die A1 (Auftrag 30).
  window.koeln.dev?.routeNachHamburg?.();
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
  // Liegt ein Blatt oder Dialog offen, ist alles dahinter (unter der Abdunklung) für den Spieler nicht erreichbar.
  // Ein Minispiel (Auftrag 44, .mg-overlay) liegt über allem und lässt sich nur dort weiterspielen.
  const minigame = !!document.querySelector('.mg-overlay');
  const layered = !!document.querySelector('.ui-sheet, .ui-dialog, .ui-action-sheet');
  const base = minigame
    ? ['.mg-overlay']
    : layered
      ? ['.ui-dialog', '.ui-sheet', '.ui-action-sheet']
      : ['.phone', '.ui-dialog', '.ui-sheet'];
  const sel = base
    .flatMap((root) => ['button', '[role="button"]', '[role="tab"]', '[role="switch"]', 'select', 'input'].map((k) => root + ' ' + k))
    .join(',');
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
const HIT = (index) => `(async () => {
  const el = document.querySelector('[data-monkey="${index}"]');
  if (!el) return { gone: true };
  // Seitenwechsel dauern eine Weile (Feder): Erst messen, wenn die oberste Seite wieder bei 0 liegt. Liegt sie auch nach
  // drei Sekunden woanders, hängt der Übergang (das wäre ein echter Fehler, kein Messfehler).
  const pageOffset = () => {
    const page = document.querySelector('.phone-page.is-top');
    const screen = document.querySelector('.phone__screen');
    return page && screen ? Math.round(page.getBoundingClientRect().left - screen.getBoundingClientRect().left) : 0;
  };
  const began = performance.now();
  let restSince = 0;
  let stuckAt = null;
  for (;;) {
    const off = pageOffset();
    // Federn melden sich mit data-moving am Dokument (motion.ts): Erst wenn nichts mehr läuft und die Seite bei 0 liegt.
    const quiet = !document.documentElement.hasAttribute('data-moving');
    if (Math.abs(off) <= 1 && quiet) {
      restSince = restSince || performance.now();
      if (performance.now() - restSince > 150) break;
    } else {
      restSince = 0;
    }
    if (performance.now() - began > 3000) {
      // Nur eine Seite, die auch nach drei Sekunden noch woanders liegt, ist ein Fund (läuft nur eine Feder weiter, nicht).
      if (Math.abs(off) > 1) stuckAt = off;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (stuckAt !== null) return { stuck: true, offset: stuckAt };
  // CSS-Animationen des Handys (Einschub, Wackeln bei einer Nachricht) zu Ende laufen lassen, sonst liegt alles kurz
  // daneben (höchstens zwei Sekunden, endlose Animationen zählen nicht).
  const running = (document.querySelector('.phone')?.getAnimations({ subtree: true }) ?? []).filter(
    (a) => a.effect?.getComputedTiming().iterations !== Infinity,
  );
  await Promise.race([
    Promise.all(running.map((a) => a.finished.catch(() => null))),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  // Blätter, Dialoge und Fenster gleiten mit einer Feder ein: Erst messen, wenn das Element nicht mehr wandert.
  let before = '';
  for (let i = 0; i < 30; i++) {
    const box = el.getBoundingClientRect();
    const now = [box.left, box.top, box.width, box.height].map(Math.round).join(',');
    if (now === before) break;
    before = now;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  // Wie ein Spieler: nur Bereiche scrollen, die sich scrollen lassen (overflow auto oder scroll). scrollIntoView
  // verschöbe auch Bereiche mit overflow hidden (Handy-Bildschirm, Blätter) und erzeugte Überdeckungen, die es nicht gibt.
  for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    const canY = /(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1;
    const canX = /(auto|scroll)/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1;
    if (!canY && !canX) continue;
    const box = el.getBoundingClientRect();
    const view = a.getBoundingClientRect();
    if (canY && (box.top < view.top || box.bottom > view.bottom)) {
      a.scrollTop += box.top + box.height / 2 - (view.top + view.height / 2);
    }
    if (canX && (box.left < view.left || box.right > view.right)) {
      a.scrollLeft += box.left + box.width / 2 - (view.left + view.width / 2);
    }
  }
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const inView = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight;
  const top = document.elementFromPoint(x, y);
  const ok = !!top && (el === top || el.contains(top) || top.contains(el));
  const overlay = !!top && !!top.closest('.island, .phone-notice, .ui-sheet-layer, .ui-sheet-backdrop, .ui-action-sheet, .ui-dialog-backdrop, .ui-dialog, .ui-menu, .ui-popover, .hud-flyout, .phone-notifications, .mg-overlay');
  const name = top ? (top.className && top.className.baseVal !== undefined ? top.className.baseVal : String(top.className)).slice(0, 60) || top.tagName : 'nichts';
  const chain = [];
  for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) chain.push(n.tagName.toLowerCase() + '.' + String(n.className?.baseVal ?? n.className).split(' ').filter(Boolean).slice(0, 2).join('.'));
  return { x, y, inView, ok, overlay, covered: name, chain: chain.join(' < '), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw: innerWidth, vh: innerHeight };
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
      const extra = target.extra;
      const enter = async (target) => {
        // Frisch ins Spiel (auch nach einem Neuladen, das selbst noch einmal nachlädt): ein paar Versuche.
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await target.goto(new URL(`?neu=normal&seed=${seed}&tempo=0`, base).toString());
            await target.waitForSelector('.shell-map', { timeout: 20000 });
            await target.waitForTimeout(1500);
            await target.evaluate(SETUP);
            if (extra) await target.evaluate(EXTRA[extra]);
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
            ${
              target.kind === 'tab'
                ? `api.selectTab('${target.id}')`
                : target.kind === 'panel'
                  ? `api.openPanel('${target.id}', ${target.paramsJs ?? JSON.stringify(target.params ?? {})})`
                  : `api.openPhone('${target.id}')`
            };
          })()`);
            await page.waitForTimeout(500);
          }
          if (step % 10 === 0) await page.evaluate('window.koeln.session.sim.advance(25)');
          await page.evaluate(
            'window.koeln.runtime.api.toggleIsland(false); window.koeln.runtime.api.dismissNotification()',
          );
          // Das Handy liegt am Handy-Bildschirm manchmal in der Tasche (der Klicktest drückt auch "Weglegen"): holen.
          await page.evaluate('(() => { const r = window.koeln.runtime; if (!r.ui.phone.open) r.api.showPhone(); })()');
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
          if (hit.stuck) {
            note(
              `stuck:${target.id}:${lastLabel}`,
              `[${where}] Nach „${lastLabel}" liegt die oberste Seite auch nach 3 Sekunden bei x=${hit.offset} (Übergang hängt).`,
            );
            await page.evaluate('window.koeln.runtime.api.back(); window.koeln.runtime.api.showPhone()');
            continue;
          }
          if (!hit.inView)
            note(
              `off:${target.id}:${pick.label}`,
              `[${where}] „${pick.label}" liegt auch nach Scrollen außerhalb des Bildschirms (Rechteck ${hit.rect.join(',')}, Fenster ${hit.vw}×${hit.vh}; ${hit.chain}).`,
            );
          else if (!hit.ok && !hit.overlay)
            note(
              `cov:${target.id}:${pick.label}`,
              `[${where}] „${pick.label}" wird verdeckt von ${hit.covered} (${hit.chain}).`,
            );
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
          // "Spot gründen" wartet auf einen Klick auf die Karte: Abbrechen, wie es ein Spieler mit Esc täte.
          await page.evaluate('(() => { const r = window.koeln.runtime; if (r.ui.picking) r.api.cancelPick(); })()');
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
