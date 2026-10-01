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
];

/** Öffnet eine frische Sitzung (pausiert, fester Seed) und spult vor. */
export async function openGame(page, base, advance) {
  await page.goto(new URL('?neu=normal&seed=1&tempo=0', base).toString());
  await page.waitForSelector('.shell-map', { timeout: 15000 });
  await page.waitForTimeout(2500);
  if (advance > 0) await page.evaluate(`window.koeln.session.sim.advance(${advance})`);
}

/** Wechselt in die Szene und wartet, bis Animationen durch sind. Jede Szene beginnt auf dem Startbildschirm. */
export async function showScene(page, scene) {
  await page.evaluate('window.koeln.runtime.api.openPhone(null); window.koeln.runtime.api.closePhone()');
  await page.waitForTimeout(100);
  await page.evaluate(scene.js);
  await page.waitForTimeout(650);
}
