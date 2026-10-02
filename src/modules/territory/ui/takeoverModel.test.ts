import { describe, expect, it } from 'vitest';
import { isFirstTakeover, newMemory } from './takeoverModel';

describe('Veedel übernommen: Dialog nur beim ersten Mal', () => {
  it('jedes Veedel zeigt den Dialog einmal, ein Rückgewinn nicht', () => {
    const memory = newMemory();
    expect(isFirstTakeover(memory, 'run-1', 'kalk')).toBe(true);
    expect(isFirstTakeover(memory, 'run-1', 'kalk')).toBe(false);
    expect(isFirstTakeover(memory, 'run-1', 'ehrenfeld')).toBe(true);
    expect(isFirstTakeover(memory, 'run-1', 'kalk')).toBe(false);
  });

  it('ein neues Spiel fängt von vorn an', () => {
    const memory = newMemory();
    expect(isFirstTakeover(memory, 'run-1', 'kalk')).toBe(true);
    expect(isFirstTakeover(memory, 'run-2', 'kalk')).toBe(true);
    expect(isFirstTakeover(memory, 'run-2', 'kalk')).toBe(false);
  });
});
