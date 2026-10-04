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
/** Route Köln → Hamburg (Auftrag 30), nur einmal pro Sitzung (Dev-Abkürzung aus src/modules/city/ui). */
const ROUTE = 'if (!window.koeln.session.state.modules.logistics.routes.length) window.koeln.dev.routeNachHamburg()';

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
  sim.state.wallet.dirty += 3000;
  for (const spotId of ['zuelpicher', 'uni']) sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  const runner = sim.state.modules.staff.members.find(
    (m) => m.role === 'runner' && m.status === 'active' && m.assignment?.targetId === 'zuelpicher',
  );
  if (!runner) return;
  runner.level = Math.max(runner.level, 2);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: runner.id, spotIds: ['zuelpicher', 'neumarkt', 'uni'] } });
  sim.advance(180);
})()`;

/** Erste Gang (für die Gang-Seite, das Bündnis-Blatt). */
const FIRST_GANG = 'Object.keys(window.koeln.session.state.modules.gangs.gangs)[0]';

/** Jede Szene: Name und JavaScript, das im Browser läuft (window.koeln = { session, runtime }). */

/**
 * JavaScript (in einer async-Funktion): Überfall auf den Neumarkt mit Briefing (Auftrag 35), ein Läufer vor Ort, ein
 * freier Fahrer für die Crew. Öffnet die Akte und gibt die ID zurück.
 */
const RAID = `
  const sim = window.koeln.session.sim;
  const s = sim.state;
  const enc = await import('/src/modules/encounters/index.ts');
  const spots = await import('/src/modules/spots/index.ts');
  s.wallet.dirty += 3000;
  if (!s.modules.staff.members.some((m) => m.assignment?.targetId === 'neumarkt')) {
    sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } });
  }
  if (!s.modules.staff.members.some((m) => m.role === 'driver' && m.status === 'active' && !m.assignment)) {
    sim.dispatch({ type: 'staff.hireDriver', payload: {} });
  }
  const runner = s.modules.staff.members.find((m) => m.assignment?.targetId === 'neumarkt');
  const { encounterId } = enc.startEncounter(sim.ctx('gangs'), {
    kind: 'raidDefense',
    spotId: 'neumarkt',
    veedelId: spots.getSpot(s, 'neumarkt').veedelId,
    staffIds: runner ? [runner.id] : [],
    askPlayer: true,
    opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 55, count: 3 },
    origin: { module: 'gangs', ref: 'raid:nord' },
  });
  window.koeln.runtime.api.openDialog('encounters.encounter', { encounterId });`;

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
  { name: 'leute', js: "window.koeln.runtime.api.selectTab('staff')" },
  {
    name: 'leute-finden',
    js: `(async () => {
      ${STEPS}
      window.koeln.runtime.api.selectTab('staff');
      const head = await until(() => [...document.querySelectorAll('.phone .ui-group__title')].find((h) => h.textContent.includes('Leute finden')));
      head?.scrollIntoView({ block: 'start' });
    })()`,
  },
  { name: 'reviere', js: "window.koeln.runtime.api.selectTab('territory')" },
  { name: 'gangs', js: "window.koeln.runtime.api.selectTab('gangs')" },
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
  // Hafen: ohne Liegeplatz, dann mit Ware am Kai, Fahrern, zweitem Lager und einer Fahrt unterwegs
  { name: 'hafen', js: "window.koeln.runtime.api.openPanel('logistics.port', {})" },
  {
    name: 'hafen-ware',
    js: `(() => {
      const sim = window.koeln.session.sim;
      sim.state.wallet.clean = 8000;
      sim.state.wallet.dirty = 6000;
      sim.dispatch({ type: 'logistics.buyBerth', payload: {} });
      sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } });
      sim.dispatch({ type: 'staff.hireDriver', payload: {} });
      sim.dispatch({ type: 'staff.hireDriver', payload: {} });
      sim.dispatch({ type: 'staff.hireDriver', payload: {} });
      sim.state.wallet.clean += 20000;
      sim.dispatch({ type: 'fleet.buy', payload: { model: 'van' } });
      sim.state.modules.suppliers.unlocked.push('rotterdam');
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'small' } });
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'hash' } });
      sim.advance(600);
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'ehrenfeld', toId: 'nippes', by: 'driver' } });
      // Auftrag 33: eine Nachtfahrt ist geplant (steht unter Unterwegs mit Abfahrtszeit).
      sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', choice: 'night', cargoIds: [sim.state.modules.logistics.cargo[0]?.id] } });
      window.koeln.runtime.api.openPanel('logistics.port', {});
    })()`,
  },
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
  {
    // Auftrag 33: Lager-App mit Fahrzeugen (frei, unterwegs, beschlagnahmt) und Modellen zum Kaufen.
    name: 'lager-fahrzeuge',
    js: `(() => {
      const sim = window.koeln.session.sim;
      sim.state.wallet.clean = 60000;
      for (const model of ['scooter', 'kombi', 'van']) sim.dispatch({ type: 'fleet.buy', payload: { model } });
      const [scooter, kombi] = sim.state.modules.fleet.vehicles;
      kombi.tripId = 1;
      scooter.seizedAt = sim.state.time;
      window.koeln.runtime.api.openPhone('goods.app');
    })()`,
  },
  {
    // Auftrag 33: Schiffe unterwegs im Tracker der Lieferanten-App (Container und halber Container).
    name: 'schiffe',
    js: `(() => {
      const sim = window.koeln.session.sim;
      sim.state.wallet.clean = 20000;
      sim.state.wallet.dirty = 30000;
      sim.dispatch({ type: 'logistics.buyBerth', payload: {} });
      sim.dispatch({ type: 'logistics.upgradeBerth', payload: {} });
      sim.state.modules.suppliers.unlocked.push('rotterdam');
      sim.state.modules.suppliers.relations.rotterdam.trust = 30;
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'container' } });
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'shared' } });
      // Das erste Schiff ist schon vier Stunden unterwegs (ohne Vorspulen, damit die Island ruhig bleibt).
      const [first] = sim.state.modules.suppliers.shipments;
      first.orderedAt -= 240;
      first.arrivesAt -= 240;
      if (first.problemAt !== undefined) first.problemAt -= 240;
      window.koeln.runtime.api.openPhone('suppliers.app');
    })()`,
  },
  {
    // Auftrag 33: Warenfluss mit Verbrauch der letzten Tage (Hasch knapp, Gras reicht).
    name: 'warenfluss',
    js: `(() => {
      const sim = window.koeln.session.sim;
      const g = sim.state.modules.goods;
      const spots = sim.state.modules.spots.unlocked.slice(0, 3);
      const day = { 'c:koeln:weed': 30, 'c:koeln:hash': 60 };
      spots.forEach((id, i) => { day['s:' + id + ':weed'] = 10; day['s:' + id + ':hash'] = 20 + i; });
      g.usage = { today: {}, days: [day, day, day] };
      g.stock.ehrenfeld.push({ id: sim.state.nextId++, productId: 'hash', amount: 70, quality: 0.6, cut: 0, unitCost: 3 });
      g.stock.ehrenfeld.push({ id: sim.state.nextId++, productId: 'weed', amount: 400, quality: 0.7, cut: 0, unitCost: 3 });
      window.koeln.runtime.api.openPanel('goods.flow', {});
    })()`,
  },
  { name: 'lagerdetail', js: "window.koeln.runtime.api.openPanel('goods.warehouse', { warehouseId: 'ehrenfeld' })" },
  {
    // Auftrag 33: fast volles Lager mit Regalen (Füllstand, Ausbau mit Preis).
    name: 'lager-ausbau',
    js: `(() => {
      const sim = window.koeln.session.sim;
      sim.state.wallet.clean = 20000;
      sim.dispatch({ type: 'goods.upgradeWarehouse', payload: { warehouseId: 'ehrenfeld', kind: 'shelves' } });
      sim.dispatch({ type: 'goods.upgradeWarehouse', payload: { warehouseId: 'ehrenfeld', kind: 'vault' } });
      const lots = sim.state.modules.goods.stock.ehrenfeld;
      lots.push({ id: 99001, productId: 'hash', amount: 26000, quality: 0.7, cut: 0, unitCost: 2.8 });
      window.koeln.runtime.api.openPanel('goods.warehouse', { warehouseId: 'ehrenfeld' });
    })()`,
  },
  { name: 'marktdetail', js: "window.koeln.runtime.api.openPanel('market.overview', {})" },
  // Markt in Bewegung (Auftrag 32): Preisindex, ein Marktereignis, eine Rabatt-Aktion, Qualität am Spot
  {
    name: 'markt-bewegt',
    js: `(() => {
      const s = window.koeln.session.sim.state;
      s.modules.market.index = { koeln: { weed: 1.09, hash: 0.93, haze: 1.03, vape: 0.95 } };
      s.modules.events.market = [{ id: 99001, eventId: 'customsSeizure', cityId: 'koeln', productId: 'weed', factor: 1.12, startedAt: s.time, endsAt: s.time + 3 * 1440 }];
      window.koeln.runtime.api.openPanel('market.overview', {});
    })()`,
  },
  {
    name: 'lieferant-aktion',
    js: `(async () => {
      ${STEPS}
      const s = window.koeln.session.sim.state;
      s.modules.market.index = { koeln: { weed: 1.09, hash: 0.93, haze: 1.03, vape: 0.95 } };
      s.modules.suppliers.deals = [{ id: 99002, supplierId: 'frankfurt', packageId: 'weed50', cityId: 'koeln', discount: 0.15, startedAt: s.time, endsAt: s.time + 3 * 1440 }];
      window.koeln.runtime.api.openPhone('suppliers.app', { supplierId: 'frankfurt' });
      const pkg = await until(() => document.querySelector('.phone .sup-pkg'));
      pkg?.scrollIntoView({ block: 'start' });
    })()`,
  },
  {
    name: 'spot-qualitaet',
    js: `(() => {
      const s = window.koeln.session.sim.state;
      const id = s.modules.spots.unlocked[0];
      s.modules.customers.quality[id] = { weed: 0.9, hash: 0.2 };
      window.koeln.runtime.api.openPanel('spots.spot', { spotId: id });
    })()`,
  },
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
      api.selectTab('territory');
      api.openPanel('goods.warehouse', { warehouseId: 'ehrenfeld' });
      await until(() => document.querySelector('.phone-page.is-top[data-kind="panel"]'));
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
  { name: 'einstellungen', js: "window.koeln.runtime.api.openPhone('core.settings')" },
  {
    // Auftrag 31: Abschnitt "Über" mit der Quellenangabe der Daten, ganz unten in den Einstellungen.
    name: 'einstellungen-ueber',
    js: `(async () => {
      ${STEPS}
      window.koeln.runtime.api.openPhone('core.settings');
      const list = await until(() => document.querySelector('.phone .set-sources'));
      list?.scrollIntoView({ block: 'center' });
    })()`,
  },
  {
    name: 'einstellungen-verlauf',
    js: `(async () => {
      ${STEPS}
      window.koeln.runtime.api.openPhone('core.settings');
      const head = await until(() => [...document.querySelectorAll('.phone .set-section__title')].find((h) => h.textContent.includes('Verlauf')));
      head?.scrollIntoView({ block: 'start' });
    })()`,
  },
  { name: 'verlauf', js: "window.koeln.runtime.api.openPhone('core.history')" },
  {
    name: 'geldwaesche',
    js: `(() => {
      const sim = window.koeln.session.sim;
      sim.state.wallet.dirty = Math.max(sim.state.wallet.dirty, 9000);
      sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'laundromat', pay: 'dirty' } });
      sim.dispatch({ type: 'laundering.launder', payload: { amount: 1200, channel: 'kiosk' } });
      window.koeln.runtime.api.openPhone('laundering.app');
    })()`,
  },
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
    name: 'personal-baum',
    js: `(() => {
      ${BUSINESS_DAYS};
      ${LIEUTENANT};
      window.koeln.runtime.api.selectTab('staff');
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
      await still();
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
      await still();
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
  // Auftrag 30: Kasse mit Filter Stadt, Routen (Seite, Blatt), Fahrer
  {
    name: 'kasse-stadt',
    js: `(async () => {
      ${STEPS}
      ${BUSINESS_DAYS};
      ${ROUTE};
      window.koeln.runtime.api.openPhone('finance.app');
      const select = await until(() => [...document.querySelectorAll('.phone select')].find((x) => [...x.options].some((o) => o.value === 'city:koeln')));
      if (select) {
        select.value = 'city:koeln';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await sleep(300);
    })()`,
    wait: 900,
  },
  {
    name: 'routen',
    js: `${ROUTE}; window.koeln.runtime.api.openPanel('logistics.routes', {})`,
  },
  {
    name: 'route-blatt',
    js: `(async () => {
      ${STEPS}
      ${ROUTE};
      window.koeln.runtime.api.openPanel('logistics.routes', {});
      const edit = await until(() => [...document.querySelectorAll('.phone button')].find((b) => b.textContent.trim() === 'Ändern'));
      edit?.click();
      await sleep(600);
      await still();
    })()`,
    wait: 900,
  },
  {
    name: 'fahrer',
    js: `${ROUTE}; window.koeln.runtime.api.openPanel('logistics.drivers', {})`,
  },
  // Auftrag 23: Spot gründen (Blatt mit Art-Auswahl), Spot mit Ausbau, Gang-Stimmen, Einbruch, Abwerben, Lieferproblem
  {
    name: 'spot-gruenden',
    js: `(async () => {
      ${STEPS}
      const rt = window.koeln.runtime;
      rt.map.pickLocation = async () => ({ lng: 7.0035, lat: 50.9385 });
      window.koeln.session.sim.state.wallet.dirty += 3000;
      rt.api.selectTab('territory');
      const button = await until(() => [...document.querySelectorAll('.phone button')].find((b) => b.textContent.includes('Eigenen Spot gründen')));
      button?.click();
      await until(() => document.querySelector('.ui-sheet'));
      await sleep(600);
      await still();
    })()`,
    wait: 900,
  },
  {
    name: 'spot-ausbau',
    js: `(async () => {
      ${STEPS}
      const sim = window.koeln.session.sim;
      let spot = sim.state.modules.spots.custom[0];
      if (!spot) {
        sim.state.wallet.dirty += 3000;
        sim.dispatch({ type: 'spots.found', payload: { lng: 7.0035, lat: 50.9385, kind: 'club', name: 'Keller in Kalk' } });
        spot = sim.state.modules.spots.custom[0];
      }
      if (!spot) return;
      sim.state.wallet.dirty += 2000;
      sim.dispatch({ type: 'spots.upgrade', payload: { spotId: spot.id, upgrade: 'lookout' } });
      window.koeln.runtime.api.openPanel('spots.spot', { spotId: spot.id });
      const head = await until(() => [...document.querySelectorAll('.phone .ui-group__title')].find((h) => h.textContent.includes('Bekanntheit')));
      head?.scrollIntoView({ block: 'start' });
    })()`,
  },
  ...['nord', 'west', 'ost', 'sued'].map((gangId) => ({
    name: `gang-chat-${gangId}`,
    js: `(() => {
      if (!window.koeln.session.state.messages.list.some((m) => m.contactId === 'gang:${gangId}')) window.koeln.dev.gangStimmen();
      window.koeln.runtime.api.openPhone('core.messages', { contactId: 'gang:${gangId}' });
    })()`,
  })),
  {
    name: 'einbruch',
    js: `(() => {
      if (!window.koeln.session.state.messages.list.some((m) => m.contactId === 'other:neighbor')) window.koeln.dev.einbruch();
      window.koeln.runtime.api.openPhone('core.messages', { contactId: 'other:neighbor' });
    })()`,
  },
  {
    name: 'gang-seite',
    js: `(() => {
      window.koeln.runtime.api.selectTab('gangs');
      window.koeln.runtime.api.openPanel('gangs.gang', { gangId: 'west' });
    })()`,
  },
  {
    name: 'lieferproblem',
    js: `(() => {
      if (!window.koeln.session.state.modules.suppliers.shipments.some((x) => x.decision)) window.koeln.dev.lieferProblem();
      window.koeln.runtime.api.openPhone('suppliers.app');
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
      if (!s.modules.hierarchy.rightHands?.koeln) {
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
      const id = s.modules.hierarchy.rightHands?.koeln?.staffId;
      window.koeln.runtime.api.openPhone('core.messages', id ? { contactId: 'staff:' + id } : undefined);
    })()`,
  },
  // Konfrontation (Auftrag 35): Briefing mit Crew, Runde mit Absicht, Zeigern, Uhr und Rat der Rechten Hand
  // (die gibt es seit der Szene rechte-hand), Ergebnis mit Teil-Ergebnissen. Am Ende alle offenen auswürfeln.
  { name: 'konfrontation', js: `(async () => { ${RAID} })()` },
  {
    name: 'konfrontation-runde',
    js: `(async () => {
      ${RAID}
      const driver = s.modules.staff.members.find((m) => m.role === 'driver' && m.status === 'active' && !m.assignment);
      const crew = [runner?.id, driver?.id].filter(Boolean);
      sim.dispatch({ type: 'encounters.join', payload: { encounterId, mode: 'crew', crew } });
      sim.dispatch({ type: 'encounters.act', payload: { encounterId, actionId: 'negotiate' } });
      window.koeln.runtime.requestRender();
    })()`,
  },
  {
    name: 'konfrontation-ergebnis',
    js: `(async () => {
      ${RAID}
      sim.dispatch({ type: 'encounters.join', payload: { encounterId, mode: 'crew' } });
      for (const e of [...s.modules.encounters.active]) {
        if (e.id !== encounterId) sim.dispatch({ type: 'encounters.auto', payload: { encounterId: e.id } });
      }
      sim.dispatch({ type: 'encounters.auto', payload: { encounterId } });
      window.koeln.runtime.api.openDialog('encounters.encounter', { encounterId });
    })()`,
  },
  // Wochenverträge (Auftrag 32): spult bis Montag 8 Uhr vor, deshalb hinten. Erst die Angebote, dann einer läuft.
  {
    name: 'vertraege',
    js: `(() => {
      const sim = window.koeln.session.sim;
      const q = sim.state.modules.quests.contracts;
      if (q.offers.length === 0 && !q.active) {
        const t = sim.state.time;
        const monday8 = 3 * 1440 + 8 * 60;
        const next = monday8 + Math.max(0, Math.ceil((t - monday8) / 10080)) * 10080;
        if (next > t) sim.advance(next - t);
      }
      window.koeln.runtime.api.openPanel('quests.list', {});
    })()`,
  },
  {
    name: 'vertrag-laeuft',
    js: `(() => {
      const sim = window.koeln.session.sim;
      const offer = sim.state.modules.quests.contracts.offers[0];
      if (offer) sim.dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } });
      window.koeln.runtime.api.openPanel('quests.list', {});
    })()`,
  },
  // Der Anruf aus Hamburg (macht Köln komplett, deshalb ganz am Ende)
  {
    name: 'anruf',
    js: `(async () => {
      ${STEPS}
      window.koeln.dev.koelnKomplett();
      window.koeln.runtime.api.closeDialog();
      window.koeln.session.sim.advance(45);
      window.koeln.runtime.requestRender();
      await sleep(800);
      window.koeln.runtime.api.closeDialog();
      window.koeln.runtime.api.showPhone?.();
    })()`,
    wait: 1500,
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
