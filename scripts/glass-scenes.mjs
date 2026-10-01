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
    name: 'spot-hover',
    js: 'sim.advance(' + TIMES.nacht + '); busy();',
    hover: '.spot-marker[aria-label*="Neumarkt"]',
    sizes: ['desktop'],
  },
];
