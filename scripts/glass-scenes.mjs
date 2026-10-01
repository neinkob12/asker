// Szenen für die Bilder des Looks "Glas" (Auftrag 24): Karte, HUD, Spots, Konfrontation, Razzia, Lieferung,
// Veedel übernommen. Jede Szene startet ein frisches Spiel (fester Seed, pausiert) und bereitet es per JavaScript vor
// (window.koeln = { session, runtime }). Genutzt von glass-shots.mjs.

/** Hilfen, die in jeder Szene im Browser bereitstehen. */
export const PRELUDE = `
  const k = window.koeln;
  const sim = k.session.sim;
  const api = k.runtime.api;
  const state = () => k.session.state;
  const run = (type, payload) => sim.dispatch({ type, payload });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rich = () => { state().wallet.dirty += 60000; state().wallet.clean += 20000; };
  const allSpots = () => {
    rich();
    for (const id of ['aachener-weiher', 'rudolfplatz', 'friesenplatz', 'breslauer', 'rheinpark', 'stadtgarten']) {
      run('spots.unlock', { spotId: id });
    }
  };
  /** Belebte Innenstadt: alle Spots offen, Läufer am Neumarkt, du am Zülpicher Platz, Kunden warten. */
  const busy = () => {
    allSpots();
    run('staff.hireRunner', { spotId: 'neumarkt' });
    run('customers.standAt', { spotId: 'zuelpicher' });
    sim.advance(50);
  };
  const render = () => k.runtime.requestRender();
  /** Liegeplatz, Rotterdam frei, ein Container bestellt. */
  const harbor = () => {
    rich();
    run('logistics.buyBerth', {});
    run('suppliers.unlock', { supplierId: 'rotterdam' });
    run('suppliers.order', { supplierId: 'rotterdam', packageId: 'medium' });
  };
  /** Bis zu diesem Anteil der Lieferzeit vorspulen. */
  const shipAt = (share) => {
    const s = state().modules.suppliers.shipments[0];
    sim.advance(Math.max(0, Math.floor(s.orderedAt + (s.arrivesAt - s.orderedAt) * share - state().time)));
  };
  const docked = () => {
    for (let i = 0; i < 400 && state().modules.logistics.cargo.length === 0; i++) sim.advance(30);
  };
  const port = { lng: 6.9712, lat: 50.9862 };
`;

/** Tageszeiten: Spielminuten ab Start (Tag 1, Freitag 18:00). */
export const TIMES = { abend: 120, nacht: 300, morgen: 12 * 60, tag: 18 * 60 };

export const SCENES = [
  { name: 'normal-tag', js: 'sim.advance(' + TIMES.tag + '); busy();' },
  { name: 'normal-nacht', js: 'sim.advance(' + TIMES.nacht + '); busy();' },
  { name: 'normal-morgen', js: 'sim.advance(' + TIMES.morgen + '); busy();' },
  { name: 'normal-abend', js: 'sim.advance(' + TIMES.abend + '); busy();' },
  { name: 'weggelegt-tag', js: 'sim.advance(' + TIMES.tag + '); busy(); api.closePhone();' },
  { name: 'weggelegt-nacht', js: 'sim.advance(' + TIMES.nacht + '); busy(); api.closePhone();' },
  { name: 'start', js: '' },
  {
    name: 'orte',
    js:
      'sim.advance(' +
      TIMES.nacht +
      '); busy(); run("goods.buyWarehouse", { warehouseId: "nippes" }); run("suppliers.order", { supplierId: "frankfurt", packageId: "weed50" }); sim.advance(20);',
  },
  {
    name: 'lieferung-see',
    js: 'sim.advance(' + TIMES.tag + '); harbor(); shipAt(0.93); api.flyTo(port, 13);',
    wait: 4500,
  },
  {
    name: 'lieferung-kai',
    js: 'sim.advance(' + TIMES.tag + '); harbor(); docked(); api.flyTo(port, 13.2);',
    wait: 4500,
  },
  {
    name: 'lieferung-lkw',
    js:
      'sim.advance(' +
      TIMES.nacht +
      '); harbor(); docked(); run("staff.hireDriver", {}); run("logistics.pickup", { by: "driver" }); sim.advance(45); api.flyTo({ lng: 6.95, lat: 50.965 }, 12.6);',
    wait: 4500,
  },
  {
    name: 'spot-hover',
    js: 'sim.advance(' + TIMES.nacht + '); busy();',
    hover: '.spot-marker[aria-label*="Neumarkt"]',
    sizes: ['desktop'],
  },
];
