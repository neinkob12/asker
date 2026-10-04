import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../../core/testing';
import { addHeat } from '../../police';
import { allVeedel } from '../../veedel';
import { HEAT_BUCKET, heatBucket, veedelSignature } from './mapSignature';

describe('Veedel-Ebene: Signatur', () => {
  it('rundet Heat auf Stufen', () => {
    expect(heatBucket(0)).toBe(0);
    expect(heatBucket(HEAT_BUCKET / 2 - 0.1)).toBe(0);
    expect(heatBucket(7)).toBe(HEAT_BUCKET);
    expect(heatBucket(100)).toBe(100);
  });

  it('ignoriert Heat in der Kontroll-Ansicht und kleine Schwankungen in der Heat-Ansicht', () => {
    const sim = createTestGame();
    const id = allVeedel()[0].id;
    const control = veedelSignature(sim.state, 'control');
    const heat = veedelSignature(sim.state, 'heat');
    addHeat(sim.ctx('police'), id, 1);
    expect(veedelSignature(sim.state, 'control')).toBe(control);
    // Ein Punkt Heat bleibt in derselben Stufe (Ausgangswert 0 → Stufe 0).
    expect(veedelSignature(sim.state, 'heat')).toBe(heat);
    addHeat(sim.ctx('police'), id, 20);
    expect(veedelSignature(sim.state, 'heat')).not.toBe(heat);
    expect(veedelSignature(sim.state, 'control')).toBe(control);
  });
});
