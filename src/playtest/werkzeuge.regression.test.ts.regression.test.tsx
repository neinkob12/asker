// Regressionstests zu Befunden aus dem Bugreview (Werkzeuge: Test-Spielstände und ihr Bauskript).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type GameState, parseSaveFile } from '../core';
import { buildMinigameSave } from './minigameSaves';

/** Summe aller sauberen Buchungen der Kasse (über alle Tage und Kategorien). */
function bookedClean(state: GameState): number {
  let sum = 0;
  for (const day of state.modules.finance.days) {
    for (const split of Object.values(day.categories)) sum += split?.clean ?? 0;
  }
  return sum;
}

describe('Test-Stand Verkehrskontrolle bucht das zweite Lager so, wie das Konto es bezahlt', () => {
  it('Kasse und Konto ändern sich beim sauberen Geld um denselben Betrag', { timeout: 60_000 }, () => {
    const base = parseSaveFile(readFileSync('public/spielstaende/boss-von-koeln.json', 'utf8')).state;
    const state = buildMinigameSave('traffic', {
      koeln: () => base,
      harbor: () => {
        throw new Error('Die Verkehrskontrolle braucht die Hafen-Phase nicht.');
      },
    });
    expect(state.modules.goods.owned.length).toBeGreaterThan(base.modules.goods.owned.length);
    expect(bookedClean(state) - bookedClean(base)).toBeCloseTo(state.wallet.clean - base.wallet.clean, 6);
  });
});

describe('Bauskript der Test-Spielstände bricht bei unbekannter Kennung ab', () => {
  it('Tippfehler endet mit Fehlercode und nennt die gültigen Kennungen', { timeout: 60_000 }, () => {
    const run = spawnSync(process.execPath, ['scripts/build-test-saves.mjs', 'koeln-komplet'], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('koeln-komplet');
    expect(run.stderr).toContain('koeln-komplett');
  });
});
