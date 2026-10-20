// Test-Bot für den Tresor: spielt wie ein Mensch mit Reaktionszeit (nur für Tests und Messungen, kein Teil des Spiels).
// Er hält die Taste in die verlangte Richtung, hört den satten Klick (die Zahl in der richtigen Richtung überfahren),
// lässt nach `reaction` Sekunden los, merkt sich die Zahl, die beim Klick unter der Marke stand (mit `misread` Strichen
// Unsicherheit), tippt Strich für Strich dorthin zurück und rastet ein. Ein Tipp dauert `tap` Sekunden.

import { createRng } from '../../../../../core';
import {
  advance,
  confirm,
  dialDistance,
  dialNumber,
  HOLD_SPEED,
  requiredDir,
  type SafeSetup,
  type SafeState,
  turn,
  turnHeld,
  wrap,
} from './model';

export interface SafeBot {
  /** Reaktionszeit auf den Klick in Sekunden. */
  reaction: number;
  /** So viele Striche liegt er beim Merken der Zahl daneben (abwechselnd + und −, 0 = genau). */
  misread: number;
  /** Sekunden pro Tipp beim Zurückkorrigieren. */
  tap: number;
  /** So oft erkennt er richtig, ob es die echte Zahl oder ein Störklick war (Ton, Stethoskop). */
  ear: number;
}

export const SAFE_BOT_GOOD: SafeBot = { reaction: 0.25, misread: 0, tap: 0.14, ear: 0.9 };
export const SAFE_BOT_WEAK: SafeBot = { reaction: 0.5, misread: 2, tap: 0.22, ear: 0.6 };

export interface SafeRun {
  opened: boolean;
  seconds: number;
  mistakes: number;
}

/** Spielt einen Tresor durch (dt in Sekunden), höchstens limit Sekunden. bot null = keine Eingabe. */
export function playSafe(setup: SafeSetup, state: SafeState, bot: SafeBot | null, dt = 1 / 60, limit = 90): SafeRun {
  const random = createRng(setup.combo[0] * 7919 + setup.start);
  let clock = 0;
  let heard = -1;
  let heardAt = -1;
  let goal = -1;
  let wait = 0;
  let tries = 0;
  while (!state.done && clock < limit) {
    clock += dt;
    if (advance(setup, state, dt) || !bot) continue;
    if (wait > 0) {
      wait -= dt;
      continue;
    }
    const dir = requiredDir(state.step);
    if (goal < 0) {
      if (heard >= 0 && clock - heardAt >= bot.reaction) {
        // Loslassen: die gehörte Zahl ist das Ziel (merkt sie sich mit etwas Unsicherheit).
        const off =
          bot.misread === 0 ? 0 : (tries % 2 === 0 ? 1 : -1) * bot.misread * ((tries >> 1) % 2 === 0 ? 1 : 0.5);
        // Hakt das Rad noch, steht es genau richtig (loslassen genügt).
        goal = state.caught > 0 ? state.pos : wrap(Math.round(heard + off));
        heard = -1;
        continue;
      }
      // Halten: dreht mit Haltetempo (das Rad hakt an der Zahl, siehe turnHeld).
      const held = turnHeld(setup, state, dir * HOLD_SPEED * dt);
      // Hakt es, entscheidet das Ohr: echte Zahl (loslassen) oder Störklick (weiterdrehen); das Ohr irrt sich manchmal.
      const right = random() < bot.ear;
      const sure = held.caught === 'target' ? right : held.caught === 'decoy' ? !right : false;
      if (heard < 0 && sure) {
        heard = dialNumber(state.pos);
        heardAt = clock;
      }
      continue;
    }
    // Zurück bzw. weiter zur gemerkten Zahl tippen, dann einrasten.
    const d = dialDistance(state.pos, goal);
    if (d >= 0.5) {
      const forward = dialDistance(wrap(state.pos + 1), goal) < d;
      turn(state, forward ? 1 : -1);
      wait = bot.tap;
      continue;
    }
    const result = confirm(setup, state);
    tries += 1;
    goal = -1;
    wait = 0.3;
    if (result === 'locked' || result === 'opened') tries = 0;
  }
  return { opened: state.opened, seconds: clock, mistakes: state.mistakes };
}
