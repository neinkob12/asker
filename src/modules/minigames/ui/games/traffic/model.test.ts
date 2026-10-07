import { describe, expect, it } from 'vitest';
import { LOOK_LINES, OFFICER_LINES } from './lines';
import {
  advance,
  BRIBE_MAX,
  BRIBE_MIN,
  BRIBE_SCORE,
  bribe,
  createTraffic,
  FLEE_SCORE,
  FOUND_SUS,
  flee,
  GREET,
  initTraffic,
  isDone,
  type Lines,
  litZone,
  MAX_FOUND,
  nextPacket,
  PULSE_NERVOUS,
  packetAt,
  packetsIn,
  progress,
  send,
  type TrafficState,
  tap,
  trafficPicks,
  trafficScore,
  zoneAt,
  zoneById,
  zoneOfPulse,
} from './model';

const LINES: Lines = {
  greet: OFFICER_LINES.greetNight,
  walk: OFFICER_LINES.walk,
  found: OFFICER_LINES.found,
  fail: OFFICER_LINES.fail,
  nervous: OFFICER_LINES.nervous,
  pass: OFFICER_LINES.pass,
  look: LOOK_LINES,
};
const BRIBE_LINES = { ok: OFFICER_LINES.bribeOk, low: OFFICER_LINES.bribeLow, high: OFFICER_LINES.bribeHigh };

type Setup = ReturnType<typeof createTraffic>;

function run(setup: Setup, state: TrafficState, seconds: number, calm = true, smart = false) {
  const signals: string[] = [];
  for (let t = 0; t < seconds && !isDone(state); t += 1 / 30) {
    signals.push(...advance(setup, state, 1 / 30, LINES));
    // Ruhig bleiben: immer genau auf den Schlag tippen.
    if (calm && Math.abs(state.t - Math.round(state.t)) < 1 / 60) tap(state);
    if (smart) smartMove(setup, state);
  }
  return signals;
}

/** Stellen, in die er schon geleuchtet hat (danach sicher). */
function inspected(state: TrafficState): Set<string> {
  const done = new Set<string>();
  for (let i = 0; i < state.stopIndex; i++) for (const z of state.stops[i].zones) done.add(z);
  const stop = state.stops[state.stopIndex];
  if (stop) for (let k = 0; k < (state.phase === 'look' ? state.zoneIndex : 0); k++) done.add(stop.zones[k]);
  return done;
}

/**
 * Ein guter Spieler: Was offen liegt oder an der aktuellen bzw. nächsten Station drankommt, wandert in eine Stelle, in
 * die er schon geleuchtet hat, sonst in eine, die an diesen beiden Stationen nicht drankommt.
 */
function smartMove(setup: Setup, state: TrafficState): void {
  const done = inspected(state);
  const soon = new Set<string>([
    ...(state.stops[state.stopIndex]?.zones ?? []),
    ...(state.stops[state.stopIndex + 1]?.zones ?? []),
  ]);
  for (const [i, p] of setup.packets.entries()) {
    const it = state.items[i];
    if (it.found || it.moving || !it.zone) continue;
    const zone = zoneById(it.zone);
    const atRisk = zone.open || (soon.has(it.zone) && !done.has(it.zone));
    if (!atRisk) continue;
    const candidates = setup.zones
      .filter((z) => !z.open && z.id !== it.zone && p.size <= z.maxSize)
      .sort(
        (a, b) => Number(done.has(b.id)) - Number(done.has(a.id)) || Number(soon.has(a.id)) - Number(soon.has(b.id)),
      );
    for (const z of candidates) {
      if (!done.has(z.id) && soon.has(z.id)) continue;
      if (send(setup, state, i, z.id) === 'ok') break;
    }
  }
}

/** Alle Pakete sofort in versteckte Stellen, die an der ersten Station nicht drankommen (danach spielt smartMove). */
function hideAll(setup: Setup, state: TrafficState): void {
  const first = new Set(setup.stops[0].zones);
  const safe = setup.zones.filter((z) => !z.open && !first.has(z.id));
  for (const [i, p] of setup.packets.entries()) {
    const zone = safe.find((z) => p.size <= z.maxSize && send(setup, state, i, z.id) === 'ok');
    if (!zone) throw new Error(`kein Platz für Paket ${i}`);
  }
}

describe('Verkehrskontrolle: Aufbau', () => {
  it('kommt fest aus dem Seed: Fahrerfenster zuerst, dann einmal ums Auto, Kofferraum immer dabei', () => {
    const a = createTraffic(7, 0.5);
    const b = createTraffic(7, 0.5);
    expect(a.stops.map((s) => s.id)).toEqual(b.stops.map((s) => s.id));
    expect(a.stops[0].id).toBe('driverWindow');
    expect(a.stops.some((s) => s.id === 'trunk')).toBe(true);
    expect(a.stops.every((s) => s.zones.length > 0)).toBe(true);
    // Versteckte Stellen kommen höchstens einmal dran.
    const hidden = a.stops.flatMap((s) => s.zones).filter((z) => !zoneById(z).open);
    expect(new Set(hidden).size).toBe(hidden.length);
  });

  it('wird mit der Schwierigkeit härter: mehr Pakete, mehr Stationen, weniger Zeit', () => {
    const easy = createTraffic(3, 0);
    const hard = createTraffic(3, 1);
    expect(hard.packets.length).toBeGreaterThan(easy.packets.length);
    expect(hard.stops.length).toBeGreaterThanOrEqual(easy.stops.length);
    expect(hard.look).toBeLessThan(easy.look);
    expect(hard.walk).toBeLessThan(easy.walk);
  });

  it('legt die Pakete sichtbar auf Sitz, Bank oder in den Fußraum', () => {
    const setup = createTraffic(5, 0.6);
    const state = initTraffic(setup);
    for (const it of state.items) {
      expect(it.zone).not.toBeNull();
      expect(zoneById(it.zone as never).open).toBe(true);
      expect(it.found).toBe(false);
    }
    expect(packetAt(setup, state, state.items[0].x, state.items[0].y)).toBe(0);
    expect(zoneAt(setup, 60, 42)).toBe('glovebox');
    expect(zoneAt(setup, 50, 130)).toBe('spare');
    expect(zoneAt(setup, 50, 118)).toBe('trunk');
    expect(zoneAt(setup, 5, 5)).toBeNull();
  });
});

describe('Verkehrskontrolle: Ablauf', () => {
  it('begrüßt, geht dann Station für Station und leuchtet in jede Stelle', () => {
    const setup = createTraffic(7, 0.5);
    const state = initTraffic(setup);
    hideAll(setup, state);
    const signals = run(setup, state, 2, true, true);
    expect(signals).toContain('greet');
    expect(state.phase).toBe('greet');
    run(setup, state, GREET, true, true);
    expect(state.phase).toBe('look');
    expect(litZone(state)).toBe(setup.stops[0].zones[0]);
    const all = run(setup, state, 120, true, true);
    expect(all).toContain('walk');
    expect(all).toContain('pass');
    expect(state.outcome).toBe('pass');
    expect(state.found).toBe(0);
    expect(trafficScore(state)).toBeGreaterThanOrEqual(0.6);
    expect(trafficPicks(state)).toEqual([]);
    expect(isDone(state)).toBe(true);
    expect(progress(state)).toBe(1);
  });

  it('findet, was offen liegt: zwei Funde heißen Aussteigen', () => {
    const setup = createTraffic(7, 0.8);
    const state = initTraffic(setup);
    const signals = run(setup, state, 120);
    expect(signals.filter((s) => s === 'found').length).toBeGreaterThanOrEqual(MAX_FOUND);
    expect(state.outcome).toBe('fail');
    expect(state.found).toBe(MAX_FOUND);
    expect(trafficPicks(state)).toContain(`found:${MAX_FOUND}`);
    expect(trafficScore(state)).toBeLessThan(0.5);
    expect(state.items.filter((it) => it.found).length).toBeGreaterThanOrEqual(MAX_FOUND);
  });

  it('ein Fund kostet Misstrauen, aber die Runde geht weiter', () => {
    const setup = createTraffic(11, 0.4);
    const state = initTraffic(setup);
    hideAll(setup, state);
    // Ein Paket zurück auf den Sitz legen, bevor er dort hinleuchtet (danach wieder schlau spielen).
    run(setup, state, 1.8, true, false);
    const victim = state.items.findIndex((it) => it.zone !== null && !it.moving);
    expect(send(setup, state, victim, 'seat')).toBe('ok');
    const before = state.suspicion;
    run(setup, state, GREET + 0.2, true, false);
    expect(state.found).toBe(1);
    const signals = run(setup, state, 120, true, true);
    expect(signals).not.toContain('found');
    expect(state.found).toBe(1);
    expect(state.outcome).toBe('pass');
    expect(state.suspicion).toBeGreaterThan(before);
    expect(trafficPicks(state)).toEqual(['found:1']);
    expect(FOUND_SUS).toBeGreaterThan(0.3);
  });
});

describe('Verkehrskontrolle: Pakete bewegen', () => {
  it('prüft Größe, Platz und ob er gerade hinleuchtet', () => {
    const setup = createTraffic(7, 0.5);
    const state = initTraffic(setup);
    const small = setup.packets.findIndex((p) => p.size === 1);
    const big = setup.packets.findIndex((p) => p.size === 2);
    if (big >= 0) expect(send(setup, state, big, 'glovebox')).toBe('tooBig');
    expect(send(setup, state, small, 'console')).toBe('ok');
    expect(send(setup, state, small, 'trunk')).toBe('busy');
    run(setup, state, 2);
    expect(state.items[small].zone).toBe('console');
    expect(send(setup, state, small, 'console')).toBe('same');
    const other = setup.packets.findIndex((p, i) => p.size === 1 && i !== small);
    if (other >= 0) expect(send(setup, state, other, 'console')).toBe('full');
    // Während er in eine Stelle leuchtet, geht da nichts rein und nichts raus.
    run(setup, state, GREET);
    const lit = litZone(state);
    expect(lit).not.toBeNull();
    const free = state.items.findIndex((it) => it.zone !== null && it.zone !== lit && !it.moving);
    if (free >= 0 && lit) expect(send(setup, state, free, lit)).toBe('seen');
  });

  it('zählt Pakete unterwegs schon zur Stelle', () => {
    const setup = createTraffic(7, 0.5);
    const state = initTraffic(setup);
    const small = setup.packets.findIndex((p) => p.size === 1);
    expect(send(setup, state, small, 'trunk')).toBe('ok');
    expect(packetsIn(state, 'trunk')).toEqual([small]);
    const signals = run(setup, state, 3);
    expect(signals).toContain('stowed');
    expect(state.items[small].moving).toBeNull();
  });

  it('wandert mit der Tastatur durch die liegenden Pakete', () => {
    const setup = createTraffic(7, 0.9);
    const state = initTraffic(setup);
    const first = nextPacket(state, 1);
    expect(first).toBeGreaterThanOrEqual(0);
    state.selected = first;
    const second = nextPacket(state, 1);
    expect(second).not.toBe(first);
    state.items[second].found = true;
    expect(nextPacket(state, 1)).not.toBe(second);
  });
});

describe('Verkehrskontrolle: Puls, Schein, Gas', () => {
  it('bleibt mit Tippen im Takt ruhig und wird ohne zittrig; zittrig schaut er noch einmal', () => {
    const setup = createTraffic(7, 0.5);
    const calm = initTraffic(setup);
    hideAll(setup, calm);
    run(setup, calm, 12, true, true);
    expect(zoneOfPulse(calm.pulse)).toBe('green');
    const nervous = initTraffic(setup);
    // Alles offen liegen lassen und nie tippen: Der Puls geht hoch.
    run(setup, nervous, 20, false);
    expect(nervous.pulse).toBeGreaterThan(calm.pulse);
    // Daneben tippen macht es schlimmer.
    const state = initTraffic(setup);
    state.t = 0.5;
    const before = state.pulse;
    expect(tap(state)).toBe('miss');
    expect(state.pulse).toBeGreaterThan(before);
    expect(tap(state)).toBeNull();
    state.t = 1.02;
    expect(tap(state)).toBe('calm');
    // Sichtbar nervös: eine Station mehr.
    const sweaty = initTraffic(setup);
    hideAll(setup, sweaty);
    run(setup, sweaty, GREET + 0.5, false, true);
    const stops = sweaty.stops.length;
    sweaty.pulse = PULSE_NERVOUS + 1;
    const signals = run(setup, sweaty, 0.2, false);
    expect(signals).toContain('nervous');
    expect(sweaty.stops.length).toBe(stops + 1);
  });

  it('nimmt den Schein nur bei mittlerem Misstrauen', () => {
    const setup = createTraffic(7, 0.5);
    const low = initTraffic(setup);
    low.suspicion = BRIBE_MIN - 0.1;
    expect(bribe(low, BRIBE_LINES)).toBe('low');
    expect(low.outcome).toBeNull();
    expect(low.suspicion).toBeGreaterThan(BRIBE_MIN - 0.1);
    const mid = initTraffic(setup);
    mid.suspicion = (BRIBE_MIN + BRIBE_MAX) / 2;
    expect(bribe(mid, BRIBE_LINES)).toBe('ok');
    expect(mid.outcome).toBe('bribe');
    expect(trafficScore(mid)).toBe(BRIBE_SCORE);
    expect(trafficPicks(mid)).toContain('bribe');
    const high = initTraffic(setup);
    high.suspicion = BRIBE_MAX + 0.2;
    expect(['high', 'fail']).toContain(bribe(high, BRIBE_LINES));
  });

  it('Gas geben beendet sofort mit dem pick flee', () => {
    const setup = createTraffic(7, 0.5);
    const state = initTraffic(setup);
    expect(flee(state, OFFICER_LINES.flee)).toBe(true);
    expect(state.outcome).toBe('flee');
    expect(flee(state, OFFICER_LINES.flee)).toBe(false);
    run(setup, state, 3);
    expect(isDone(state)).toBe(true);
    expect(trafficScore(state)).toBe(FLEE_SCORE);
    expect(trafficPicks(state)).toEqual(['flee']);
  });
});
