// Spitzen der Simulation (Auftrag 50, „Flüssiger“): Welche Schritte eines Spieltags dauern am längsten, und welche
// Modul-Ticks und Ereignis-Handler stecken darin? Läuft nur mit PERF=1 (`PERF=1 npx vitest run spikes.bench`).
// Ein Schritt über etwa 8 ms ist am Handy (etwa 4× langsamer) ein sichtbarer Ruck bei 30 Bildern pro Sekunde.

import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { discoverModules } from '../core/discover';
import { loadSimulation, parseSaveFile } from '../core/persistence';
import { prewarmRoadNetwork, roadNetworkIds } from '../modules/roads';

const DAY = 1440;
const SAVES = (process.env.PERF_SAVES ?? 'koeln-komplett,boss-von-hamburg,deutschland').split(',');

type Timed = (...args: unknown[]) => unknown;

describe('Spitzen der Simulation', () => {
  it.skipIf(!process.env.PERF)(
    'zeigt die längsten Schritte eines Spieltags je Test-Spielstand',
    () => {
      const out: string[] = [];
      for (const name of SAVES) {
        const file = parseSaveFile(readFileSync(`public/spielstaende/${name}.json`, 'utf8'));
        const sim = loadSimulation(file.state, discoverModules());
        let current: Record<string, number> = {};
        const wrap = (key: string, fn: Timed): Timed => {
          return (...args) => {
            const t0 = performance.now();
            const result = fn(...args);
            current[key] = (current[key] ?? 0) + performance.now() - t0;
            return result;
          };
        };
        const internals = sim as unknown as {
          modules: { id: string; tick?: Timed }[];
          eventHandlers: Map<string, { moduleId: string; handler: Timed }[]>;
          commandOwners: Map<string, { moduleId: string; handler: Timed }>;
        };
        for (const m of internals.modules) if (m.tick) m.tick = wrap(`tick ${m.id}`, m.tick);
        for (const [type, list] of internals.eventHandlers)
          for (const entry of list) entry.handler = wrap(`${entry.moduleId} <- ${type}`, entry.handler);
        for (const [type, owner] of internals.commandOwners) owner.handler = wrap(`cmd ${type}`, owner.handler);
        // Wie die Oberfläche (roads/ui): Straßennetze vorab bauen. PERF_PREWARM=0 zeigt die Spitzen ohne.
        if (process.env.PERF_PREWARM !== '0') for (const id of roadNetworkIds()) prewarmRoadNetwork(id);
        sim.advance(Number(process.env.PERF_WARM_MINUTES ?? 2 * 60));
        const steps: { ms: number; time: number; parts: Record<string, number> }[] = [];
        for (let i = 0; i < DAY && !sim.isOver; i++) {
          current = {};
          const time = sim.state.time;
          const t0 = performance.now();
          sim.step();
          steps.push({ ms: performance.now() - t0, time, parts: current });
        }
        const sorted = [...steps].sort((a, b) => b.ms - a.ms);
        const over = (limit: number) => steps.filter((s) => s.ms > limit).length;
        out.push(
          `=== ${name}: Mittel ${(steps.reduce((a, s) => a + s.ms, 0) / steps.length).toFixed(2)} ms, über 4 ms: ${over(4)}, über 8 ms: ${over(8)} ===`,
        );
        for (const s of sorted.slice(0, 8)) {
          const minute = s.time % DAY;
          const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
          const parts = Object.entries(s.parts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([k, v]) => `${k} ${v.toFixed(1)}`)
            .join(' | ');
          out.push(`  ${s.ms.toFixed(1).padStart(5)} ms um ${clock}: ${parts}`);
        }
      }
      console.log(out.join('\n'));
    },
    600_000,
  );
});
