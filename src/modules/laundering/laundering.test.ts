import { describe, expect, it } from 'vitest';
import { loadSimulation, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getHeat } from '../police';
import { enlist, generateProfile } from '../staff';
import { LAUNDERING_CHANNELS } from './config';
import {
  amountInProgress,
  batchProgress,
  canUnlockChannel,
  channelFee,
  channelFree,
  getBatches,
  getLaunderingStats,
  isChannelUnlocked,
  launderingCapacity,
  launderingDuration,
} from './index';

const kiosk = LAUNDERING_CHANNELS[0];
const laundromat = LAUNDERING_CHANNELS[1];
const construction = LAUNDERING_CHANNELS[2];

describe('laundering', () => {
  it('wäscht Schwarzgeld über Zeit und gegen Gebühr zu sauberem Geld (Kumpel mit Kiosk)', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1000 } }).ok).toBe(true);
    // Das Schwarzgeld ist sofort weg, sauberes Geld gibt es erst, wenn die Wäsche fertig ist.
    expect(sim.state.wallet).toEqual({ dirty: START_DIRTY_MONEY - 1000, clean: 0 });
    expect(amountInProgress(sim.state)).toBe(1000);
    const [batch] = getBatches(sim.state);
    expect(batch.channel).toBe('kiosk');
    const duration = launderingDuration(1000);
    expect(batch.readyAt - batch.startedAt).toBe(duration);

    sim.advance(duration / 2);
    expect(batchProgress(sim.state, batch)).toBeCloseTo(0.5);
    expect(sim.state.wallet.clean).toBe(0);

    sim.advance(duration / 2);
    const fee = Math.round(1000 * kiosk.fee);
    expect(sim.state.wallet.clean).toBe(1000 - fee);
    expect(getBatches(sim.state)).toHaveLength(0);
    expect(getLaunderingStats(sim.state)).toMatchObject({ totalLaundered: 1000, totalFees: fee });
    expect(eventsOfType(events, 'laundering.completed')[0].payload).toMatchObject({
      amount: 1000,
      fee,
      channel: 'kiosk',
    });
  });

  it('größere Beträge brauchen länger, teurere Wege sind schneller', () => {
    expect(launderingDuration(5000)).toBeGreaterThan(launderingDuration(500));
    expect(launderingDuration(2000, 'construction')).toBeGreaterThan(launderingDuration(2000, 'kiosk'));
    expect(construction.fee).toBeLessThan(laundromat.fee);
    expect(laundromat.fee).toBeLessThan(kiosk.fee);
  });

  it('nicht mehr waschen als da ist oder als der Weg gleichzeitig verträgt', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1e9 } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: -5 } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 50 } }).ok).toBe(false);
    sim.state.wallet.dirty = kiosk.capacity * 2;
    expect(launderingCapacity(sim.state)).toBe(kiosk.capacity);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: kiosk.capacity } }).ok).toBe(true);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 100 } })).toEqual({
      ok: false,
      reason: 'Mehr geht gerade nicht, frei sind noch 0 €.',
    });
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 100, channel: 'laundromat' } }).ok).toBe(
      false,
    );
  });

  it('Waschsalon freischalten mit Schwarzgeld, Bauunternehmer braucht Ruf oder Reviere', () => {
    const sim = createTestGame();
    expect(isChannelUnlocked(sim.state, 'laundromat')).toBe(false);
    expect(canUnlockChannel(sim.state, 'laundromat').ok).toBe(true);
    expect(sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'laundromat', pay: 'clean' } }).ok).toBe(
      false,
    );
    sim.state.wallet.dirty = 10000;
    expect(sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'laundromat', pay: 'dirty' } }).ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(10000 - (laundromat.unlock?.dirty ?? 0));
    expect(isChannelUnlocked(sim.state, 'laundromat')).toBe(true);
    expect(launderingCapacity(sim.state)).toBe(kiosk.capacity + laundromat.capacity);
    expect(sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'laundromat', pay: 'dirty' } }).ok).toBe(
      false,
    );
    const locked = canUnlockChannel(sim.state, 'construction');
    expect(locked.ok).toBe(false);
    expect(locked.ok ? '' : locked.reason).toMatch(/Ruf|Veedel/);
    sim.state.modules.territory.controller.ehrenfeld = 'player';
    sim.state.modules.territory.controller.nippes = 'player';
    expect(canUnlockChannel(sim.state, 'construction').ok).toBe(true);
  });

  it('ohne Weg nimmt der Befehl den billigsten freien Weg und teilt große Beträge auf', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 40000;
    sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'laundromat', pay: 'dirty' } });
    // Mittlerer Betrag: passt in den Waschsalon, der ist billiger als der Kiosk.
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 4000 } }).ok).toBe(true);
    expect(getBatches(sim.state)[0].channel).toBe('laundromat');
    expect(channelFee(sim.state, 'laundromat')).toBe(laundromat.fee);
    // Mehr, als in den Waschsalon noch passt: der Rest geht zum Kiosk.
    const free = channelFree(sim.state, 'laundromat');
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: free + 1000 } }).ok).toBe(true);
    expect(getBatches(sim.state).map((b) => b.channel)).toEqual(['laundromat', 'laundromat', 'kiosk']);
    expect(amountInProgress(sim.state, 'kiosk')).toBe(1000);
  });

  it('zu viel auf einmal über den Waschsalon bringt Heat in Ehrenfeld', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 40000;
    sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'laundromat', pay: 'dirty' } });
    const before = getHeat(sim.state, laundromat.veedelId);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 5000, channel: 'laundromat' } }).ok).toBe(
      true,
    );
    expect(getHeat(sim.state, laundromat.veedelId)).toBe(before);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 5000, channel: 'laundromat' } }).ok).toBe(
      true,
    );
    expect(getHeat(sim.state, laundromat.veedelId)).toBeGreaterThan(before);
  });

  it('migriert Version 1 (sofortige Wäsche) und Version 2 (ohne Wege)', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.laundering = { totalLaundered: 500, totalFees: 100 };
    raw.moduleVersions.laundering = 1;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.laundering).toEqual({
      totalLaundered: 500,
      totalFees: 100,
      batches: [],
      unlocked: ['kiosk'],
    });
    const batch = { id: 7, amount: 4000, fee: 800, startedAt: 10, readyAt: 500 };
    raw.modules.laundering = { totalLaundered: 500, totalFees: 100, batches: [batch] };
    raw.moduleVersions.laundering = 2;
    const loaded2 = loadSimulation(raw, sim.modules);
    // Eine laufende Wäsche über der Kiosk-Grenze bleibt gültig und läuft zu Ende.
    expect(loaded2.state.modules.laundering.batches).toEqual([{ ...batch, channel: 'kiosk' }]);
    expect(loaded2.state.modules.laundering.unlocked).toEqual(['kiosk']);
  });
  it('kaputte Befehle werden abgelehnt: kein Wurf, kein Gratis-Einstieg, kein NaN', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 10000;
    const before = structuredClone(sim.state.wallet);
    // Ein unbekannter Bezahlweg machte den Preis undefined, der Weg war gratis und das Journal schrieb "NaN €".
    const free = sim.dispatch({
      type: 'laundering.unlock',
      payload: { channel: 'laundromat', pay: 'bitcoin' as never },
    });
    expect(free.ok).toBe(false);
    expect(isChannelUnlocked(sim.state, 'laundromat')).toBe(false);
    expect(sim.state.journal.some((e) => e.text.includes('NaN'))).toBe(false);
    // Ein unbekannter Weg warf bis zum Aufrufer durch.
    expect(sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'casino' as never, pay: 'dirty' } }).ok).toBe(
      false,
    );
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 500, channel: 'casino' as never } }).ok).toBe(
      false,
    );
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: Number.NaN } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: Number.POSITIVE_INFINITY } }).ok).toBe(false);
    expect(sim.state.wallet).toEqual(before);
    expect(getBatches(sim.state)).toHaveLength(0);
  });

  it('mit Buchhalter kosten alle Wege gleich viel: ohne Wegangabe geht kleines Geld zum schnellen Kiosk', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 40000;
    sim.state.modules.laundering.unlocked = ['kiosk', 'laundromat', 'construction'];
    const ctx = sim.ctx('staff');
    const accountant = enlist(ctx, generateProfile(ctx, 'accountant', { level: 5 }), { origin: 'pool' });
    accountant.stats.caution = 50;
    // Der Rabatt drückt alle drei Wege auf die Mindestgebühr ...
    expect(new Set(LAUNDERING_CHANNELS.map((c) => channelFee(sim.state, c.id))).size).toBe(1);
    // ... dann entscheidet die Dauer, nicht die Grundgebühr: Der Bauunternehmer bräuchte über zwölf Stunden und bringt
    // ab 15.000 € Heat, der Kiosk ist gleich billig, viel schneller und ohne Risiko.
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 2500 } }).ok).toBe(true);
    expect(getBatches(sim.state)[0].channel).toBe('kiosk');
  });
});
