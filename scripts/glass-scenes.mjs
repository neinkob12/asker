// Szenen für die Bilder des Looks "Glas" (Auftrag 24): Karte, HUD, Spots, Konfrontation, Razzia, Lieferung,
// Veedel übernommen; seit Auftrag 30 auch Anruf, Übergabe, Deutschland-Ansicht und Hamburg bei Nacht, seit Auftrag 31 Kölner Lichter und Hafengeburtstag. Jede Szene startet ein frisches Spiel (fester Seed, pausiert) und bereitet es per JavaScript vor
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
  const port = { lng: 6.9679, lat: 50.98527 };
  /** Razzia im Veedel des Neumarkts (Läufer dort): bis genau zur Razzia vorspulen. */
  const policeRaid = async () => {
    const spots = await import('/src/modules/spots/index.ts');
    const veedelId = spots.getSpot(state(), 'neumarkt').veedelId;
    // Razzia im ganzen Veedel (wie bei einem Händler), geplante Razzien haben Zeit, Umfang und Spot.
    state().modules.police.plannedRaids[veedelId] = { at: state().time + 1, scope: 'veedel', spotId: 'neumarkt' };
    for (let i = 0; i < 120 && state().modules.police.plannedRaids[veedelId] !== undefined; i++) sim.advance(1);
  };
  /** Das Veedel des Neumarkts übernehmen: Einfluss hoch, bis zur nächsten vollen Stunde vorspulen. */
  const takeover = async () => {
    const spots = await import('/src/modules/spots/index.ts');
    const territory = await import('/src/modules/territory/index.ts');
    const veedelId = spots.getSpot(state(), 'neumarkt').veedelId;
    territory.addInfluence(sim.ctx('territory'), veedelId, territory.PLAYER_FACTION, 100);
    // Ereignisse aus sim.ctx kommen erst mit dem nächsten Schritt an.
    sim.advance(1);
  };
  /** Überfall der Hafenkolonne auf den Neumarkt, mit Briefing; Läufer vor Ort. Gibt die ID zurück. */
  const raid = async () => {
    const enc = await import('/src/modules/encounters/index.ts');
    const spots = await import('/src/modules/spots/index.ts');
    rich();
    run('staff.hireRunner', { spotId: 'neumarkt' });
    const runner = state().modules.staff.members.find((m) => m.assignment?.targetId === 'neumarkt');
    const { encounterId } = enc.startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      spotId: 'neumarkt',
      veedelId: spots.getSpot(state(), 'neumarkt').veedelId,
      staffIds: [runner.id],
      askPlayer: true,
      opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 55, count: 3 },
      origin: { module: 'gangs', ref: 'raid:nord' },
    });
    api.openDialog('encounters.encounter', { encounterId });
    return encounterId;
  };
  /** Hamburg (Auftrag 30): frei, aktiv, du bist dort; Lager in Ottensen, drei Spots auf dem Kiez, Läufer, Ware. */
  const hamburg = async () => {
    const goods = await import('/src/modules/goods/index.ts');
    rich();
    k.dev.hamburgFrei();
    run('city.switch', { cityId: 'hamburg' });
    state().modules.city.present = 'hamburg';
    run('goods.buyWarehouse', { warehouseId: 'werkstatt-ottensen' });
    goods.store(sim.ctx('goods'), { productId: 'weed', amount: 800, warehouseId: 'werkstatt-ottensen', quality: 0.8 });
    for (const id of ['spielbudenplatz', 'hans-albers-platz', 'landungsbruecken', 'kiezbar']) run('spots.unlock', { spotId: id });
    run('staff.hireRunner', { spotId: 'spielbudenplatz' });
    run('customers.standAt', { spotId: 'hans-albers-platz' });
    sim.advance(60);
  };
`;

/** Tageszeiten: Spielminuten ab Start (Tag 1, Freitag 18:00). */
export const TIMES = { abend: 120, nacht: 300, morgen: 12 * 60, tag: 18 * 60 };

export const SCENES = [
  { name: 'normal-tag', js: `sim.advance(${TIMES.tag}); busy();` },
  { name: 'normal-nacht', js: `sim.advance(${TIMES.nacht}); busy();` },
  { name: 'normal-morgen', js: `sim.advance(${TIMES.morgen}); busy();` },
  { name: 'normal-abend', js: `sim.advance(${TIMES.abend}); busy();` },
  { name: 'weggelegt-tag', js: `sim.advance(${TIMES.tag}); busy(); api.closePhone();` },
  { name: 'weggelegt-nacht', js: `sim.advance(${TIMES.nacht}); busy(); api.closePhone();` },
  { name: 'start', js: '' },
  // Auftrag 31: Verkehr als Kulisse (läuft ein paar Sekunden mit Tempo 1, dann Pause für das Bild).
  {
    name: 'verkehr-tag',
    js: `sim.advance(${TIMES.tag}); busy(); api.closePhone(); api.flyTo({ lng: 6.9405, lat: 50.9345 }, 15.2); api.setSpeed(1); await sleep(5000); api.setSpeed(0);`,
    wait: 2500,
  },
  {
    // Auftrag 31: Leute an Spots: Läufer am Neumarkt, wartende Kunden, eine Streife im Veedel mit hoher Heat.
    name: 'leute-spots',
    js: `sim.advance(${TIMES.tag}); busy(); const spots = await import('/src/modules/spots/index.ts'); state().modules.police.heat[spots.getSpot(state(), 'neumarkt').veedelId] = 70; sim.advance(30); api.closePhone(); api.flyTo({ lng: 6.9476, lat: 50.9362 }, 16.4); api.setSpeed(1); await sleep(4000); api.setSpeed(0);`,
    wait: 2500,
  },
  {
    name: 'verkehr-nacht',
    js: `sim.advance(${TIMES.nacht}); busy(); api.closePhone(); api.flyTo({ lng: 6.9405, lat: 50.9345 }, 15.2); api.setSpeed(1); await sleep(5000); api.setSpeed(0);`,
    wait: 2500,
  },
  {
    name: 'orte',
    js:
      'sim.advance(' +
      TIMES.nacht +
      '); busy(); run("goods.buyWarehouse", { warehouseId: "nippes" }); run("suppliers.order", { supplierId: "frankfurt", packageId: "weed50" }); sim.advance(20);',
  },
  {
    name: 'lieferung-see',
    js: `sim.advance(${TIMES.tag}); harbor(); shipAt(0.93); api.flyTo(port, 13);`,
    wait: 4500,
  },
  {
    // Auftrag 31: Das Schiff fährt auf dem echten Rhein (Overture-Daten), hier in der Europa-Ansicht bei Nijmegen.
    name: 'schiff-rhein',
    js: `sim.advance(${TIMES.tag}); harbor(); shipAt(0.28); api.flyToEuropa();`,
    wait: 4500,
  },
  {
    name: 'lieferung-kai',
    js: `sim.advance(${TIMES.tag}); harbor(); docked(); api.flyTo(port, 13.2);`,
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
    // Auftrag 31: Das Auto hält an der Straße, die letzten Meter zum Kunden sind ein gepunkteter Fußweg.
    name: 'lieferung-fussweg',
    js:
      'sim.advance(' +
      TIMES.tag +
      '); busy(); const orders = await import("/src/modules/customers/orders.ts"); state().modules.customers.orders = [];' +
      ' const o = orders.offerDelivery(sim.ctx("customers"), true); run("customers.acceptOrder", { orderId: o.id, by: "player" });' +
      ' sim.advance(o.arrivesAt - 3 - state().time); api.flyTo(o, 16.5);',
    wait: 4500,
  },
  {
    // Auftrag 31: Der Kurier aus Frankfurt kommt über die A3-Zufahrt herein (roads: roadApproach).
    name: 'kurier-a3',
    js:
      'sim.advance(' +
      TIMES.tag +
      '); rich(); run("suppliers.order", { supplierId: "frankfurt", packageId: "weed50" }); const s = state().modules.suppliers.shipments[0];' +
      ' sim.advance(Math.floor((s.arrivesAt - s.orderedAt) * 0.74)); api.flyTo({ lng: 7.065, lat: 50.925 }, 13.4);',
    wait: 4500,
  },
  {
    name: 'konfrontation-briefing',
    js: `sim.advance(${TIMES.nacht}); busy(); await raid();`,
  },
  {
    name: 'konfrontation-runde',
    js:
      'sim.advance(' +
      TIMES.tag +
      '); busy(); const id = await raid(); run("encounters.join", { encounterId: id, mode: "self" }); run("encounters.act", { encounterId: id, actionId: "hold" });',
  },
  {
    name: 'konfrontation-ergebnis',
    js:
      'sim.advance(' +
      TIMES.nacht +
      '); busy(); const id = await raid(); run("encounters.join", { encounterId: id, mode: "crew" }); run("encounters.auto", { encounterId: id });',
  },
  {
    name: 'konfrontation-weggelegt',
    js: `sim.advance(${TIMES.tag}); busy(); api.closePhone(); await raid();`,
    sizes: ['desktop'],
  },
  {
    name: 'razzia-alarm',
    js: `sim.advance(${TIMES.nacht}); busy(); await policeRaid();`,
    wait: 1500,
    after: 'api.closeDialog();',
  },
  {
    name: 'razzia-bilanz',
    js: `sim.advance(${TIMES.tag}); busy(); await policeRaid();`,
    wait: 5500,
  },
  {
    name: 'uebernahme',
    js: `sim.advance(${TIMES.nacht}); busy(); await takeover();`,
    wait: 3000,
  },
  {
    name: 'uebernahme-tag',
    js: `sim.advance(${TIMES.tag}); busy(); await takeover();`,
    wait: 3000,
    sizes: ['desktop'],
  },
  // Auftrag 30: der Anruf aus Hamburg, die Übergabe an die Rechte Hand, Deutschland mit einer Route über die A1,
  // Hamburg bei Nacht (Kiez, Nachtleben).
  {
    name: 'anruf',
    js: `sim.advance(${TIMES.tag}); busy(); k.dev.koelnKomplett(); api.closeDialog(); sim.advance(45); render(); await sleep(800); api.closeDialog(); render();`,
    wait: 2500,
  },
  {
    name: 'uebergabe',
    js:
      'sim.advance(' +
      TIMES.tag +
      "); busy(); k.dev.koelnKomplett(); api.closeDialog(); k.dev.rechteHandBereit(); sim.advance(45); run('messages.acceptCall', { messageId: state().messages.calls.ringing[0] }); run('city.answerOffer', { choice: 'come' }); api.openDialog('hierarchy.handover', { cityId: 'koeln' }); render();",
    wait: 2500,
  },
  // Nach der Zusage fragt Fiete noch im Gespräch, ob du Köln jetzt übergibst (Antworten im Anruf).
  {
    name: 'anruf-uebergabe',
    js:
      'sim.advance(' +
      TIMES.tag +
      "); busy(); k.dev.koelnKomplett(); api.closeDialog(); k.dev.rechteHandBereit(); sim.advance(45); const id = state().messages.calls.ringing[0]; run('messages.acceptCall', { messageId: id }); api.openCall(id); run('messages.answer', { messageId: id, optionId: 'come' }); render();",
    wait: 4000,
  },
  {
    name: 'deutschland',
    js: `sim.advance(${TIMES.tag}); busy(); k.dev.routeNachHamburg(); sim.advance(150); render(); api.flyToDeutschland();`,
    wait: 5000,
  },
  {
    name: 'hamburg-nacht',
    js: `sim.advance(${TIMES.nacht}); await hamburg(); render();`,
    wait: 4500,
  },
  // Auftrag 31: Events auf der Karte. Die Uhr springt direkt auf den Event-Tag (nur für das Bild).
  {
    name: 'lichter',
    js:
      'busy(); state().time = (60 - 1) * 1440 + 21 * 60 + 40; sim.step(); render(); api.setSpeed(1); ' +
      'k.runtime.map.map.jumpTo({ center: [6.9672, 50.9372], zoom: 14.8 });',
    wait: 2600,
    live: true,
  },
  {
    name: 'hafengeburtstag',
    js:
      'await hamburg(); state().time = (50 - 1) * 1440 + 15 * 60; sim.step(); render(); ' +
      'k.runtime.map.map.jumpTo({ center: [9.95, 53.5445], zoom: 14 });',
    wait: 4000,
  },
  {
    name: 'spot-hover',
    js: `sim.advance(${TIMES.nacht}); busy();`,
    hover: '.spot-marker[aria-label*="Neumarkt"]',
    sizes: ['desktop'],
  },
];
