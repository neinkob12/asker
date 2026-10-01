// Gemeinsame Hilfen für phone-shots.mjs und phone-audit.mjs: Fenstergrößen, Szenen (welche Handy-Seite offen ist)
// und das Starten einer Sitzung mit festem Seed, damit Vorher/Nachher vergleichbar bleiben.

export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

/** JavaScript für die Island-Szenen: legt offene Nachrichten mit Frist an (das ergibt Live-Aktivitäten). */
const deadlines = (count) => `(() => {
  const s = window.koeln.session.sim.state;
  const now = s.time;
  const names = ['Nordstadt Boys', 'Jansen (Hafen Rotterdam)'];
  for (let i = 0; i < ${count}; i++) {
    const id = 'gang:demo' + i;
    s.messages.contacts[id] = { id, name: names[i], kind: i === 0 ? 'gang' : 'supplier' };
    s.messages.list.push({
      id: 9000 + i, contactId: id, time: now, from: 'contact', text: 'Das läuft ab, antworte schnell.', read: false,
      options: [{ id: 'yes', label: 'Ja' }], expiresAt: now + 130 + i * 300, source: 'demo',
    });
  }
})()`;

/** JavaScript: synthetische Zeiger-Ereignisse (Maus und Touch gehen über dieselben Pointer Events). */
const POINTER = `
  const pointer = (type, target, x, y) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true,
    button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1,
  }));
  const drag = (target, x0, y0, x1, y1, release) => {
    pointer('pointerdown', target, x0, y0);
    for (let i = 1; i <= 8; i++) pointer('pointermove', window, x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
    if (release) pointer('pointerup', window, x1, y1);
    else window.__sceneCleanup = () => pointer('pointercancel', window, x1, y1);
  };
  /** Langsam ziehen (echte Zeitabstände, geringe Geschwindigkeit): Die Geste rastet, statt durchzuschnellen. */
  const dragSlow = async (target, x0, y0, x1, y1) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    pointer('pointerdown', target, x0, y0);
    for (let i = 1; i <= 10; i++) {
      await wait(40);
      pointer('pointermove', window, x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10);
    }
    await wait(160);
    pointer('pointermove', window, x1, y1);
    pointer('pointerup', window, x1, y1);
  };`;

/**
 * JavaScript für Szenen in mehreren Schritten (als async-Funktion, page.evaluate wartet darauf): `until` wartet, bis
 * ein Element da ist (Seiten erscheinen erst im nächsten Bild), `sleep` eine feste Zeit, `still` auf das Ende der Federn.
 */
const STEPS = `
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (find, timeout = 6000) => {
    const start = performance.now();
    for (;;) {
      const found = find();
      if (found || performance.now() - start > timeout) return found;
      await sleep(50);
    }
  };
  const still = () => until(() => !document.documentElement.hasAttribute('data-moving'));`;

/**
 * JavaScript: ein paar Tage Geschäft für die Kasse (zwei Läufer, Nachschub, drei Spieltage vorspulen). Läuft nur
 * einmal pro Sitzung, spätere Szenen bauen darauf auf.
 */
const BUSINESS_DAYS = `(() => {
  if (window.__businessDays) return;
  window.__businessDays = true;
  const sim = window.koeln.session.sim;
  sim.state.wallet.dirty += 4000;
  const spots = sim.state.modules.spots.unlocked;
  for (const spotId of spots.slice(0, 2)) sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  for (let day = 0; day < 3; day++) {
    for (const packageId of ['weed50', 'haze50', 'weed50']) {
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId } });
    }
    sim.advance(1440);
  }
})()`;

/** JavaScript: Der erste Läufer wird Leutnant mit drei Spots in zwei Veedeln (einmal pro Sitzung). */
const LIEUTENANT = `(() => {
  const sim = window.koeln.session.sim;
  if (Object.keys(sim.state.modules.hierarchy.posts).length > 0) return;
  const runner = sim.state.modules.staff.members.find((m) => m.role === 'runner' && m.status === 'active');
  if (!runner) return;
  runner.level = Math.max(runner.level, 2);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: runner.id, spotIds: ['zuelpicher', 'neumarkt', 'uni'] } });
  sim.advance(120);
})()`;

/** Erste Gang (für die Gang-Seite, das Bündnis-Blatt). */
const FIRST_GANG = 'Object.keys(window.koeln.session.state.modules.gangs.gangs)[0]';

/** Jede Szene: Name und JavaScript, das im Browser läuft (window.koeln = { session, runtime }). */
export const SCENES = [
  { name: 'home', js: 'window.koeln.runtime.api.openPhone(null)' },
  { name: 'nachrichten', js: "window.koeln.runtime.api.openPhone('core.messages')" },
  {
    name: 'chat',
    js: `(() => {
      const s = window.koeln.session.sim.state;
      const c = s.messages.list.at(-1)?.contactId;
      window.koeln.runtime.api.openPhone('core.messages', c ? { contactId: c } : undefined);
    })()`,
  },
  { name: 'geschaeft', js: "window.koeln.runtime.api.selectTab('business')" },
  { name: 'leute', js: "window.koeln.runtime.api.selectTab('staff')" },
  { name: 'kontakte', js: "window.koeln.runtime.api.openPhone('recruiting.contacts')" },
  { name: 'reviere', js: "window.koeln.runtime.api.selectTab('territory')" },
  { name: 'gangs', js: "window.koeln.runtime.api.selectTab('gangs')" },
  { name: 'auftraege', js: "window.koeln.runtime.api.openPhone('customers.orders')" },
  { name: 'lieferanten', js: "window.koeln.runtime.api.openPhone('suppliers.app')" },
  // Gesperrter Lieferant (Bedingungen mit Stand) und einer, der sich freischalten lässt
  { name: 'lieferant-gesperrt', js: "window.koeln.runtime.api.openPhone('suppliers.app', { supplierId: 'berlin' })" },
  {
    name: 'lieferant-bereit',
    js: `(() => {
      window.koeln.session.sim.state.modules.customers.stats.revenue = 2000;
      window.koeln.runtime.api.openPhone('suppliers.app', { supplierId: 'hamburg' });
    })()`,
  },
  // Logistik: ohne Liegeplatz, dann mit Ware am Kai, Fahrern, zweitem Lager und einer Fahrt unterwegs
  { name: 'logistik', js: "window.koeln.runtime.api.openPhone('logistics.app')" },
  {
    name: 'logistik-hafen',
    js: `(() => {
      const sim = window.koeln.session.sim;
      sim.state.wallet.clean = 8000;
      sim.state.wallet.dirty = 6000;
      sim.dispatch({ type: 'logistics.buyBerth', payload: {} });
      sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } });
      sim.dispatch({ type: 'staff.hireDriver', payload: {} });
      sim.dispatch({ type: 'staff.hireDriver', payload: {} });
      sim.state.modules.suppliers.unlocked.push('rotterdam');
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'small' } });
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'hash' } });
      sim.advance(600);
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'ehrenfeld', toId: 'nippes', by: 'driver' } });
      window.koeln.runtime.api.openPhone('logistics.app');
    })()`,
  },
  // Abschnitte des Geschäfts (jede Zeile der Liste öffnet einen)
  ...[
    ['lager', 'goods.stock'],
    ['lieferungen', 'suppliers.order'],
    ['spots', 'spots.list'],
    ['personal', 'staff.runners'],
    ['kundschaft', 'customers.stats'],
    ['ruf', 'reputation.summary'],
    ['markt', 'market.summary'],
    ['geldwaesche', 'laundering.section'],
    ['logistik', 'logistics.overview'],
  ].map(([name, section]) => ({
    name: `geschaeft-${name}`,
    js: `(() => { const api = window.koeln.runtime.api; api.selectTab('business'); api.openSection('${section}'); })()`,
  })),
  // Details (Panels): Spot, Veedel, Lager, Markt, Mitarbeiter-Akte
  {
    name: 'spot',
    js: `(() => {
      const id = window.koeln.session.sim.state.modules.spots.unlocked[0];
      window.koeln.runtime.api.openPanel('spots.spot', { spotId: id });
    })()`,
  },
  {
    name: 'spot-hinstellen',
    js: `(() => {
      const sim = window.koeln.session.sim;
      const id = sim.state.modules.spots.unlocked[0];
      sim.dispatch({ type: 'customers.standAt', payload: { spotId: id } });
      window.koeln.runtime.api.openPanel('spots.spot', { spotId: id });
    })()`,
  },
  { name: 'veedel', js: "window.koeln.runtime.api.openPanel('veedel.veedel', { veedelId: 'neustadt-nord' })" },
  // Gang als eigene Seite (Lage, Diplomatie, Gegenmaßnahmen) und das Bündnis als Blatt (mittel, dann groß gezogen)
  {
    name: 'gang',
    js: `(() => { const api = window.koeln.runtime.api; api.selectTab('gangs'); api.openPanel('gangs.gang', { gangId: ${FIRST_GANG} }); })()`,
  },
  {
    name: 'blatt-mittel',
    js: `(async () => {
      ${STEPS}
      const api = window.koeln.runtime.api;
      api.selectTab('gangs');
      api.openPanel('gangs.gang', { gangId: ${FIRST_GANG} });
      const row = await until(() =>
        [...document.querySelectorAll('.phone-page.is-top .ui-list__button')].find((b) => b.textContent.includes('Bündnis')),
      );
      await still();
      row?.click();
      await until(() => document.querySelector('.ui-sheet'));
    })()`,
  },
  {
    name: 'blatt-gross',
    js: `(async () => {
      ${STEPS}
      ${POINTER}
      const api = window.koeln.runtime.api;
      api.selectTab('gangs');
      api.openPanel('gangs.gang', { gangId: ${FIRST_GANG} });
      const row = await until(() =>
        [...document.querySelectorAll('.phone-page.is-top .ui-list__button')].find((b) => b.textContent.includes('Bündnis')),
      );
      await still();
      row?.click();
      const head = await until(() => document.querySelector('.ui-sheet__head'));
      await sleep(100);
      await still();
      if (head) {
        const r = head.getBoundingClientRect();
        drag(head, r.left + r.width / 2, r.top + 30, r.left + r.width / 2, r.top - 380, true);
      }
      await sleep(100);
    })()`,
  },
  { name: 'lagerdetail', js: "window.koeln.runtime.api.openPanel('goods.warehouse', { warehouseId: 'ehrenfeld' })" },
  { name: 'marktdetail', js: "window.koeln.runtime.api.openPanel('market.overview', {})" },
  {
    name: 'akte',
    js: `(() => {
      const sim = window.koeln.session.sim;
      const spot = sim.state.modules.spots.unlocked[0];
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: spot } });
      const member = sim.state.modules.staff.members[0];
      window.koeln.runtime.api.selectTab('staff');
      if (member) window.koeln.runtime.api.openPanel('staff.profile', { staffId: member.id });
    })()`,
  },
  // Aktionsblatt: Entlassen in der Akte bestätigen
  {
    name: 'aktionsblatt',
    js: `(async () => {
      ${STEPS}
      const sim = window.koeln.session.sim;
      if (sim.state.modules.staff.members.length === 0) {
        sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: sim.state.modules.spots.unlocked[0] } });
      }
      const member = sim.state.modules.staff.members[0];
      const api = window.koeln.runtime.api;
      api.selectTab('staff');
      if (member) api.openPanel('staff.profile', { staffId: member.id });
      const button = await until(() =>
        [...document.querySelectorAll('.phone-page.is-top .ui-button--danger')].find((b) => b.textContent.includes('Entlassen')),
      );
      await still();
      button?.click();
      await until(() => document.querySelector('.ui-action-sheet'));
    })()`,
  },
  // Kontextmenü: langer Druck (hier Rechtsklick) auf die Kachel der Nachrichten
  {
    name: 'kontextmenue',
    js: `(async () => {
      ${STEPS}
      window.koeln.runtime.api.openPhone(null);
      const tile = await until(() =>
        [...document.querySelectorAll('.phone__app')].find((e) => e.dataset.appId === 'core.messages'),
      );
      await still();
      tile?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await until(() => document.querySelector('.ui-ctx-menu'));
    })()`,
  },
  // Mitteilungszentrale: Banner herunterziehen (hier direkt geöffnet)
  {
    name: 'mitteilungen',
    js: `(() => {
      const api = window.koeln.runtime.api;
      api.openPhone(null);
      api.notify({ title: 'Toni (Frankfurt)', text: 'Ware ist unterwegs, morgen früh da.', icon: 'truck', appId: 'core.messages', sound: null });
      api.notify({ title: 'Nordstadt Boys', text: 'Halt dich vom Ebertplatz fern.', icon: 'skull', appId: 'core.messages', sound: null });
      api.toggleNotificationCenter(true);
    })()`,
  },
  // Rand-Wischen zurück, auf halbem Weg festgehalten (Vorseite parallax, Titel wandert)
  {
    name: 'rand-wischen',
    js: `(async () => {
      ${STEPS}
      ${POINTER}
      const api = window.koeln.runtime.api;
      api.selectTab('business');
      api.openSection('goods.stock');
      await until(() => document.querySelector('.phone-page.is-top[data-kind="section"]'));
      await sleep(100);
      await still();
      const screen = document.querySelector('.phone__screen');
      const r = screen.getBoundingClientRect();
      const target = document.querySelector('.phone-page.is-top .phone-screen__body') ?? screen;
      drag(target, r.left + 6, r.top + r.height / 2, r.left + 6 + r.width * 0.5, r.top + r.height / 2 + 8, false);
    })()`,
  },
  // Nachrichten: Suche unter dem großen Titel und eine Zeile mit freigelegter Wisch-Aktion
  {
    name: 'suche',
    js: `(async () => {
      ${STEPS}
      window.koeln.runtime.api.openPhone('core.messages');
      const button = await until(() => document.querySelector('.phone-page.is-top .phone-screen__search-button'));
      await still();
      button?.click();
      const input = await until(() => document.querySelector('.phone-page.is-top .phone-screen__search.is-open input'));
      if (input) {
        input.value = 'Jan';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await sleep(300);
    })()`,
  },
  {
    name: 'wischzeile',
    js: `(async () => {
      ${STEPS}
      ${POINTER}
      window.koeln.runtime.api.openPhone('core.messages');
      const row = await until(() => document.querySelector('.phone-page.is-top .ui-swipe .msg-row.is-unread'));
      await still();
      if (row) {
        const r = row.getBoundingClientRect();
        await dragSlow(row, r.right - 30, r.top + r.height / 2, r.right - 130, r.top + r.height / 2 + 2);
      }
      await sleep(100);
    })()`,
  },
  { name: 'ereignisse', js: "window.koeln.runtime.api.selectTab('journal')" },
  { name: 'einstellungen', js: "window.koeln.runtime.api.openPhone('core.settings')" },
  { name: 'wetter', js: "window.koeln.runtime.api.openPhone('weather.app')" },
  { name: 'meldungen', js: "window.koeln.runtime.api.openPhone('core.alerts')" },
  {
    name: 'island-kompakt',
    js: `${deadlines(1)}; window.koeln.runtime.api.openPhone(null)`,
  },
  {
    name: 'island-zwei',
    js: `${deadlines(2)}; window.koeln.runtime.api.openPhone(null)`,
  },
  {
    name: 'island-offen',
    js: `${deadlines(2)}; window.koeln.runtime.api.openPhone(null); window.koeln.runtime.api.toggleIsland(true)`,
  },
  {
    name: 'island',
    js: `(() => {
      const api = window.koeln.runtime.api;
      api.openPhone(null);
      api.pulseIsland({ kind: 'earn.dirty', amount: 450, icon: 'moneyBag', tone: 'accent', text: '' });
    })()`,
  },
  // Ausfälle: ein Läufer in Haft (ohne Stillhaltegeld), einer verletzt, die Nachricht nach der Festnahme
  {
    name: 'faellt-aus',
    js: `(() => {
      ${BUSINESS_DAYS};
      const sim = window.koeln.session.sim;
      if (!window.__absent) {
        window.__absent = true;
        const runners = sim.state.modules.staff.members.filter((m) => m.role === 'runner' && m.status === 'active');
        if (runners[0]) {
          sim.ctx('police').emit('police.arrest', { staffId: runners[0].id, veedelId: 'altstadt-sued' });
          sim.step();
          sim.dispatch({ type: 'staff.setJailSupport', payload: { staffId: runners[0].id, enabled: false } });
        }
        if (runners[1]) {
          runners[1].status = 'injured';
          runners[1].statusUntil = sim.state.time + 1440;
          runners[1].returnTo = runners[1].assignment;
          runners[1].assignment = null;
        }
      }
      window.koeln.runtime.api.selectTab('staff');
    })()`,
  },
  {
    name: 'festnahme-chat',
    js: `(() => {
      const s = window.koeln.session.sim.state;
      const m = [...s.messages.list].reverse().find((x) => x.options?.some((o) => o.id === 'replace'));
      window.koeln.runtime.api.openPhone('core.messages', m ? { contactId: m.contactId } : undefined);
    })()`,
  },
  // Leutnant mit drei Spots über zwei Veedel, Ernennen-Fluss und Bestellregel-Blatt
  {
    name: 'leutnant',
    js: `(() => {
      ${BUSINESS_DAYS};
      ${LIEUTENANT};
      window.koeln.runtime.api.openPanel('hierarchy.lieutenant', { staffId: Object.keys(window.koeln.session.sim.state.modules.hierarchy.posts)[0] });
    })()`,
  },
  {
    name: 'leutnant-einkauf',
    js: `(async () => {
      ${STEPS}
      ${BUSINESS_DAYS};
      ${LIEUTENANT};
      window.koeln.runtime.api.openPanel('hierarchy.lieutenant', { staffId: Object.keys(window.koeln.session.sim.state.modules.hierarchy.posts)[0] });
      const group = await until(() => [...document.querySelectorAll('.phone .ui-group__title')].find((h) => h.textContent.includes('Einkauf')));
      group?.scrollIntoView({ block: 'start' });
    })()`,
  },
  {
    name: 'bestellregel',
    js: `(async () => {
      ${STEPS}
      ${BUSINESS_DAYS};
      ${LIEUTENANT};
      window.koeln.runtime.api.openPanel('hierarchy.lieutenant', { staffId: Object.keys(window.koeln.session.sim.state.modules.hierarchy.posts)[0] });
      const row = await until(() => [...document.querySelectorAll('.phone .ui-item__title')].find((t) => t.textContent.includes('Nachfrage')));
      row?.closest('button')?.click();
      await sleep(500);
      await still();
    })()`,
    wait: 900,
  },
  {
    name: 'ernennen',
    js: `(async () => {
      ${STEPS}
      ${BUSINESS_DAYS};
      ${LIEUTENANT};
      const sim = window.koeln.session.sim;
      const other = sim.state.modules.staff.members.find((m) => m.role === 'runner' && !sim.state.modules.hierarchy.posts[m.id]);
      if (!other) return;
      other.level = Math.max(other.level, 2);
      window.koeln.runtime.api.openPanel('staff.profile', { staffId: other.id });
      const row = await until(() => [...document.querySelectorAll('.phone .ui-item__title')].find((t) => t.textContent.includes('Zum Leutnant')));
      row?.closest('button')?.click();
      await sleep(500);
      await still();
    })()`,
    wait: 900,
  },
  // Kasse (nach ein paar Tagen Geschäft): heute, 7 Tage, eine Kategorie
  { name: 'kasse', js: `${BUSINESS_DAYS}; window.koeln.runtime.api.openPhone('finance.app')` },
  {
    name: 'kasse-woche',
    js: `(async () => {
      ${STEPS}
      ${BUSINESS_DAYS};
      window.koeln.runtime.api.openPhone('finance.app');
      const seg = await until(() => [...document.querySelectorAll('.phone .ui-segmented button')].find((b) => b.textContent.includes('7 Tage')));
      seg?.click();
      await sleep(200);
      document.querySelector('.phone .fin-chart')?.scrollIntoView({ block: 'center' });
    })()`,
  },
  {
    name: 'kasse-buchungen',
    js: `${BUSINESS_DAYS}; window.koeln.runtime.api.openPhone('finance.app'); window.koeln.runtime.api.openPanel('finance.category', { category: 'wages.runner', period: 'week' })`,
  },
  {
    name: 'kasse-spots',
    js: `(async () => {
      ${STEPS}
      ${BUSINESS_DAYS};
      window.koeln.runtime.api.openPhone('finance.app');
      const group = await until(() => [...document.querySelectorAll('.phone .ui-group__title')].find((h) => h.textContent.includes('Pro Spot')));
      group?.scrollIntoView({ block: 'start' });
    })()`,
  },
  // Rechte Hand mit Tagesbericht (spult einen Tag vor, deshalb am Ende)
  {
    name: 'rechte-hand',
    js: `(() => {
      ${BUSINESS_DAYS};
      ${LIEUTENANT};
      const sim = window.koeln.session.sim;
      const s = sim.state;
      if (!s.modules.hierarchy.rightHand) {
        s.wallet.dirty += 6000;
        const taken = new Set(Object.values(s.modules.hierarchy.posts).flatMap((p) => p.spotIds));
        const free = s.modules.spots.unlocked.filter((id) => !taken.has(id));
        for (const spotId of free) sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
        const runners = s.modules.staff.members.filter((m) => m.role === 'runner' && m.status === 'active' && !s.modules.hierarchy.posts[m.id]);
        const second = runners.find((m) => m.assignment?.kind === 'spot' && free.includes(m.assignment.targetId));
        if (second) {
          second.level = Math.max(second.level, 2);
          sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: second.id, spotIds: [second.assignment.targetId] } });
        }
        const boss = runners.find((m) => m.id !== second?.id);
        if (boss) {
          boss.level = Math.max(boss.level, 4);
          boss.stats.loyalty = Math.max(boss.stats.loyalty, 70);
          sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
        }
        sim.advance(1440);
      }
      window.koeln.runtime.api.openPanel('hierarchy.rightHand', {});
    })()`,
  },
  {
    name: 'tagesbericht',
    js: `(() => {
      const s = window.koeln.session.sim.state;
      const id = s.modules.hierarchy.rightHand?.staffId;
      window.koeln.runtime.api.openPhone('core.messages', id ? { contactId: 'staff:' + id } : undefined);
    })()`,
  },
];

/** Öffnet eine frische Sitzung (pausiert, fester Seed) und spult vor. */
export async function openGame(page, base, advance) {
  await page.goto(new URL('?neu=normal&seed=1&tempo=0', base).toString());
  await page.waitForSelector('.shell-map', { timeout: 15000 });
  await page.waitForTimeout(2500);
  if (advance > 0) await page.evaluate(`window.koeln.session.sim.advance(${advance})`);
}

/**
 * Wechselt in die Szene und wartet, bis Animationen durch sind. Jede Szene beginnt auf dem Startbildschirm mit
 * zugeklappter Island.
 */
export async function showScene(page, scene) {
  await page.evaluate(`(() => {
    window.__sceneCleanup?.();
    window.__sceneCleanup = undefined;
    const api = window.koeln.runtime.api;
    api.toggleNotificationCenter(false);
    api.openPhone(null);
    api.toggleIsland(false);
    api.closePhone();
  })()`);
  await page.waitForTimeout(100);
  await page.evaluate(scene.js);
  await page.waitForTimeout(scene.wait ?? 650);
  await waitForStill(page);
}

/**
 * Wartet, bis keine Feder im Handy mehr läuft (Übergänge, Island; siehe src/ui/phone/motion.ts), und spult endliche
 * CSS-Animationen (Einblenden) ans Ende. Ohne GPU zeichnet Chromium so langsam, dass sie sonst auf dem Bild noch
 * halb durchsichtig sind.
 */
export async function waitForStill(page, timeout = 8000) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-moving'), null, { timeout });
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const end = animation.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end)) animation.finish();
    }
  });
}
