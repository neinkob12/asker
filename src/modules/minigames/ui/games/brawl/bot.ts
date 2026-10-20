// Test-Bot für den Straßenkampf: spielt wie ein Mensch mit Reaktionszeit (nur für Tests und Messungen, kein Teil des
// Spiels). Er läuft zum nächsten Gegner, wechselt die Ebene, schlägt zwei leicht und einen hart, und auf eine Ansage
// reagiert er nach `reaction` Sekunden: geübt mit Block im letzten Moment (Konter), sonst mit gehaltenem Block.

import { type BrawlInput, type BrawlSetup, type BrawlState, isIn, playerOf, stepBrawl } from './model';

export interface BrawlBot {
  /** Reaktionszeit auf eine Ansage in Spielsekunden. */
  reaction: number;
  /**
   * parry: wartet mit dem Block auf den letzten Moment (Konter); hold: hält den Block, weicht aber der Flamme und dem
   * Messer aus; none: wehrt sich gar nicht (drückt nur Schlag).
   */
  defense: 'parry' | 'hold' | 'none';
}

export const BOT_SKILLED: BrawlBot = { reaction: 0.25, defense: 'parry' };
export const BOT_CASUAL: BrawlBot = { reaction: 0.4, defense: 'hold' };
export const BOT_MASHER: BrawlBot = { reaction: 0.4, defense: 'none' };

export interface BotRun {
  end: BrawlState['end'];
  /** Echte Sekunden bis zum Ende. */
  seconds: number;
  /** Anteil Leben des Spielers am Ende. */
  hp: number;
}

export function playBrawl(setup: BrawlSetup, state: BrawlState, bot: BrawlBot, dt = 1 / 60, limit = 120): BotRun {
  const seen = new Map<string, number>();
  let swings = 0;
  let pause = 0;
  let clock = 0;
  while (!state.end && clock < limit) {
    const p = playerOf(state);
    const input: BrawlInput = { dx: 0 };
    // Ansagen gegen dich: seit wann sichtbar, wie lange noch.
    let threat: { left: number; heavy: boolean } | null = null;
    for (const f of state.fighters) {
      if (f.side !== 'foe' || (f.state !== 'windup' && f.state !== 'strike')) {
        seen.delete(f.id);
        continue;
      }
      if (!seen.has(f.id)) seen.set(f.id, state.time);
      const near = Math.abs(f.x - p.x) < 1.9 && f.lane === p.lane && f.facing === (p.x > f.x ? 1 : -1);
      if (!near || state.time - (seen.get(f.id) ?? 0) < bot.reaction) continue;
      const left = f.state === 'windup' ? f.dur - f.t : 0;
      if (!threat || left < threat.left) threat = { left, heavy: f.attack !== 'light' };
    }
    if (threat && bot.defense === 'parry') input.block = threat.left < 0.14;
    else if (threat && bot.defense === 'hold') {
      if (!threat.heavy) input.block = true;
      else if (threat.left < 0.2) input.dodge = true;
    } else {
      let target = null as null | (typeof state.fighters)[number];
      for (const f of state.fighters) {
        if (f.side !== 'foe' || !isIn(f) || f.state === 'run' || f.state === 'down') continue;
        const d = Math.abs(f.x - p.x) + (f.lane === p.lane ? 0 : 0.8);
        if (!target || d < Math.abs(target.x - p.x) + (target.lane === p.lane ? 0 : 0.8)) target = f;
      }
      if (target) {
        const dist = target.x - p.x;
        if (target.lane !== p.lane) input.lane = target.lane < p.lane ? 1 : -1;
        if (Math.abs(dist) > 1.0) input.dx = dist > 0 ? 1 : -1;
        else if (pause <= 0) {
          swings += 1;
          if (swings % 3 === 0) input.heavy = true;
          else input.light = true;
          pause = 0.28;
        }
      }
    }
    pause -= dt;
    stepBrawl(setup, state, dt, input);
    clock += dt;
  }
  const p = playerOf(state);
  return { end: state.end, seconds: state.clock, hp: p.hp / p.maxHp };
}
