import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../../core/testing';
import { getSpots } from '../index';
import { MAX_CUSTOMERS_PER_SPOT, MAX_FIGURES, patrolRounds, phaseOf, planFigures } from './peopleModel';

const everywhere = () => true;

describe('Leute an Spots', () => {
  it('Läufer am Spot und wartende Kunden werden Figuren, höchstens vier Kunden pro Spot', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty += 5000;
    const spot = getSpots(sim.state)[0];
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: spot.id } }).ok).toBe(true);
    // Viele Wartende am selben Spot (Kunden kommen von allein; hier gezielt dazugelegt).
    const waiting = sim.state.modules.customers.waiting;
    const template = waiting[0] ?? null;
    for (let i = 0; i < 7; i++) {
      waiting.push({
        ...(template ?? ({} as (typeof waiting)[number])),
        id: 900 + i,
        spotId: spot.id,
        expiresAt: sim.state.time + 60,
      } as (typeof waiting)[number]);
    }
    const figures = planFigures(sim.state, spot, everywhere).filter((f) => f.spotId === spot.id);
    expect(figures.filter((f) => f.kind === 'staff')).toHaveLength(1);
    expect(figures.filter((f) => f.kind === 'customer')).toHaveLength(MAX_CUSTOMERS_PER_SPOT);
    // Personal links, Kundschaft rechts vom Schild.
    for (const f of figures) expect(Math.sign(f.offset[0])).toBe(f.kind === 'staff' ? -1 : 1);
    // Gleiche Lage: gleiche Figuren (stabile Schlüssel und Phasen).
    expect(planFigures(sim.state, spot, everywhere)).toEqual(planFigures(sim.state, spot, everywhere));
  });

  it('nur Spots im Ausschnitt und höchstens das Limit', () => {
    const sim = createTestGame();
    const waiting = sim.state.modules.customers.waiting;
    const spots = getSpots(sim.state);
    let id = 1000;
    for (const spot of spots) {
      for (let i = 0; i < 4; i++) waiting.push({ id: id++, spotId: spot.id, expiresAt: sim.state.time + 60 } as never);
    }
    expect(planFigures(sim.state, spots[0], () => false)).toHaveLength(0);
    const all = planFigures(sim.state, spots[0], everywhere);
    expect(all.length).toBeLessThanOrEqual(MAX_FIGURES);
    expect(planFigures(sim.state, spots[0], everywhere, 5)).toHaveLength(5);
    // Nächster Spot zur Mitte zuerst.
    expect(all[0].spotId).toBe(spots[0].id);
  });

  it('Streife nur in Veedeln mit Heat über der Kontrollschwelle', () => {
    const sim = createTestGame();
    const heat = sim.state.modules.police.heat as Record<string, number>;
    for (const key of Object.keys(heat)) heat[key] = 0;
    expect(patrolRounds(sim.state)).toHaveLength(0);
    const spot = getSpots(sim.state)[0];
    heat[spot.veedelId] = 80;
    const rounds = patrolRounds(sim.state);
    expect(rounds.map((r) => r.veedelId)).toEqual([spot.veedelId]);
    expect(rounds[0].spots.length).toBeGreaterThan(0);
  });

  it('Phase aus dem Schlüssel, ohne Zufall', () => {
    expect(phaseOf('staff:a')).toBe(phaseOf('staff:a'));
    expect(phaseOf('staff:a')).not.toBe(phaseOf('staff:b'));
    expect(phaseOf('x')).toBeGreaterThanOrEqual(0);
    expect(phaseOf('x')).toBeLessThan(Math.PI * 2);
  });
});
