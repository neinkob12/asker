// Messung der Simulation ohne Oberfläche (`npm run perf:sim`): Der Bot spielt mehrere Spieltage, gemessen werden
// ms pro Spieltag, Zeit pro Modul-Tick, pro Ereignis-Handler und pro Befehl. Läuft nur mit PERF=1, weil Zeitmessung
// auf CI-Rechnern flattert. Umgebung: PERF_DAYS (Standard 20), PERF_SEED (11), PERF_SAVE=<pfad> schreibt den Endstand
// als Spielstand-Datei für `npm run perf:browser`. Bericht und Hotspots: docs/perf/2026-10-messung.md.
// Leitplanke: Mit den Standardwerten schlägt die Messung fehl, wenn ein Spieltag mehr als doppelt so lange dauert wie
// der Richtwert unten (Auftrag 30, Etappe 0).

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSaveFile, serializeSave } from '../core/persistence';
import { createTestGame } from '../core/testing';
import { newBotStats, playFor, snapshot } from './bot';

const DAY = 1440;

/**
 * Richtwert: ms pro Spieltag im Mittel (Bot, Seed 11, 20 Tage), gemessen nach Auftrag 30, Etappe 0 (vorher etwa 120,
 * nachher etwa 86 auf der Entwicklungsmaschine). Die Messung schlägt fehl, wenn es mehr als doppelt so lange dauert: Das
 * ist eine grobe Verschlechterung, kein Rauschen. Läuft nur mit PERF=1 (lokal), CI-Rechner messen zu unruhig.
 */
const REFERENCE_MS_PER_DAY = 90;
const ALLOWED_FACTOR = 2;

type Timed = (...args: unknown[]) => unknown;
interface Bucket {
  ms: Record<string, number>;
  calls: Record<string, number>;
}

function bucket(): Bucket {
  return { ms: {}, calls: {} };
}

/** Umhüllt eine Funktion und zählt ihre Laufzeit in den Eimer. */
function timed(b: Bucket, key: string, fn: Timed): Timed {
  return (...args) => {
    const t0 = performance.now();
    const result = fn(...args);
    b.ms[key] = (b.ms[key] ?? 0) + performance.now() - t0;
    b.calls[key] = (b.calls[key] ?? 0) + 1;
    return result;
  };
}

function table(title: string, b: Bucket, limit: number): string[] {
  const total = Object.values(b.ms).reduce((a, v) => a + v, 0);
  const rows = Object.entries(b.ms)
    .sort((a, c) => c[1] - a[1])
    .slice(0, limit)
    .map(
      ([key, ms]) =>
        `${key.padEnd(44)} ${ms.toFixed(0).padStart(6)} ms  ${String(b.calls[key]).padStart(6)}x  ${((ms / b.calls[key]) * 1000).toFixed(1).padStart(8)} µs/Aufruf`,
    );
  return [`=== ${title} (${total.toFixed(0)} ms) ===`, ...rows];
}

const avg = (values: number[]) => values.reduce((a, v) => a + v, 0) / Math.max(1, values.length);

describe('Performance der Simulation', () => {
  it.skipIf(!process.env.PERF)(
    'misst ms pro Spieltag, Modul-Ticks, Ereignis-Handler und Befehle',
    () => {
      const days = Number(process.env.PERF_DAYS ?? 20);
      const sim = createTestGame({ seed: Number(process.env.PERF_SEED ?? 11) });
      const stats = newBotStats();
      const ticks = bucket();
      const handlers = bucket();
      const commands = bucket();

      // Die Simulation hält Ticks, Ereignis-Handler und Befehle in eigenen Tabellen; die werden hier umhüllt.
      const internals = sim as unknown as {
        modules: { id: string; tick?: Timed }[];
        eventHandlers: Map<string, { moduleId: string; handler: Timed }[]>;
        commandOwners: Map<string, { moduleId: string; handler: Timed }>;
      };
      for (const m of internals.modules) if (m.tick) m.tick = timed(ticks, m.id, m.tick);
      for (const [type, list] of internals.eventHandlers)
        for (const entry of list) entry.handler = timed(handlers, `${entry.moduleId} <- ${type}`, entry.handler);
      for (const [type, owner] of internals.commandOwners) owner.handler = timed(commands, type, owner.handler);

      const out: string[] = ['=== ms pro Spieltag (Bot spielt) ==='];
      const perDay: number[] = [];
      let before: Record<string, number> = {};
      for (let d = 1; d <= days; d++) {
        const t0 = performance.now();
        playFor(sim, DAY, stats);
        const ms = performance.now() - t0;
        perDay.push(ms);
        const s = sim.state;
        const topTicks = Object.entries(ticks.ms)
          .map(([k, v]) => [k, v - (before[k] ?? 0)] as const)
          .sort((a, c) => c[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k}=${v.toFixed(0)}`)
          .join(' ');
        before = { ...ticks.ms };
        const snap = snapshot(s);
        out.push(
          `Tag ${String(d).padStart(2)}: ${ms.toFixed(0).padStart(5)} ms | msgs=${s.messages.list.length} orders=${s.modules.customers.orders.length} staff=${snap.staff} spots=${snap.spots} ltn=${snap.lieutenants} json=${(JSON.stringify(s).length / 1024).toFixed(0)} kB | Ticks: ${topTicks}`,
        );
        if (s.outcome.gameOver) {
          out.push(`GAME OVER: ${JSON.stringify(s.outcome.gameOver)}`);
          break;
        }
      }
      out.push(
        `Mittel Tag 1-5: ${avg(perDay.slice(0, 5)).toFixed(0)} ms, letzte 5 Tage: ${avg(perDay.slice(-5)).toFixed(0)} ms, gesamt ${avg(perDay).toFixed(0)} ms/Tag = ${(avg(perDay) / DAY).toFixed(3)} ms/Schritt, Bot-Befehle ${stats.commands}`,
      );
      out.push(...table('Modul-Ticks', ticks, 12));
      out.push(...table('Ereignis-Handler, Top 15', handlers, 15));
      out.push(...table('Befehle, Top 12', commands, 12));
      console.log(out.join('\n'));

      // Leitplanke: nur für die Standard-Messung (20 Tage, Seed 11), sonst passt der Richtwert nicht.
      if (days === 20 && (process.env.PERF_SEED ?? '11') === '11') {
        expect(
          avg(perDay),
          `Simulation langsamer als ${ALLOWED_FACTOR}× Richtwert (${REFERENCE_MS_PER_DAY} ms/Tag)`,
        ).toBeLessThan(REFERENCE_MS_PER_DAY * ALLOWED_FACTOR);
      }

      if (process.env.PERF_SAVE) {
        writeFileSync(process.env.PERF_SAVE, serializeSave(createSaveFile(sim.state, 'perf', 0)));
        console.log(`Spielstand geschrieben: ${process.env.PERF_SAVE}`);
      }
    },
    600_000,
  );
});
