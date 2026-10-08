// Regressionstests zum Bugreview der Bestenliste (Modul, Oberfläche und Server api/leaderboard.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_VEEDEL, POST, parseEntry } from '../../../../api/leaderboard';
import type { GameState } from '../../../core';
import { createTestGame } from '../../../core/testing';
import { cleanPlayerName, PLAYER_NAME_MAX } from '../../../ui';
import { HARBOR_CITY } from '../../city';
import { getProduct } from '../../goods';
import { OWN_ORIGINS, type TradeShipment } from '../../trade';
import { allVeedel } from '../../veedel';
import { HARBOR_GOODS_SHARE } from '../config';
import { netWorth } from '../index';
import { submit } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const valid = {
  runId: 'run_abc123',
  name: 'Jakob',
  score: 1000,
  days: 4,
  veedel: 1,
  outcome: 'running',
  mode: 'normal',
  title: '',
  quests: 0,
};

/** Hat der Text ein halbes Ersatzpaar (kaputtes Zeichen)? */
const lonely = (text: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);

describe('Vermögen zählt Ware im Hafen, am Kai und im Ausfuhrlager', () => {
  it('Hafen-Lager, Container am Kai und Ausfuhrlager heben das Vermögen', () => {
    const sim = createTestGame();
    sim.advance(1);
    sim.state.modules.goods.stock = {};
    const before = netWorth(sim.state);
    const weed = getProduct('weed')?.basePrice ?? 0;
    const hash = getProduct('hash')?.basePrice ?? 0;
    expect(weed).toBeGreaterThan(0);
    const trade = sim.state.modules.trade;
    trade.ports = [HARBOR_CITY];
    trade.stock[HARBOR_CITY] = { weed: { amount: 100_000, quality: 0.6 } };
    expect(netWorth(sim.state)).toBe(Math.round(before + 100_000 * weed * HARBOR_GOODS_SHARE));
    // Der Rest eines Containers wartet am Kai (Lager voll): Er gehört dir schon.
    const quay: TradeShipment = {
      id: 9001,
      producerId: 'marokko',
      productId: 'hash',
      amount: 20_000,
      quality: 0.6,
      size: 'small',
      portId: HARBOR_CITY,
      orderedAt: 0,
      arrivesAt: 0,
      status: 'quay',
      quaySince: 0,
      cover: 'none',
      vesselId: null,
    };
    // Auf See zählt er (wie eine Lieferung unterwegs) noch nicht.
    trade.shipments = [{ ...quay, id: 9002, status: 'sea' }, quay];
    const withQuay = before + (100_000 * weed + 20_000 * hash) * HARBOR_GOODS_SHARE;
    expect(netWorth(sim.state)).toBe(Math.round(withQuay));
    // Eigene Ernte im Ausfuhrlager (Auftrag 42).
    trade.origins[OWN_ORIGINS[0].id] = { weed: { amount: 10_000, quality: 0.7, pack: 1 } };
    expect(netWorth(sim.state)).toBe(Math.round(withQuay + 10_000 * weed * HARBOR_GOODS_SHARE));
    expect(HARBOR_GOODS_SHARE).toBeLessThan(1);
  });
});

describe('Veedel-Obergrenze kappt Spieler mit allen Veedeln nicht', () => {
  it('alle Veedel aller Städte kommen ungekappt an', () => {
    const all = allVeedel().length;
    expect(all).toBeGreaterThan(50);
    expect(all).toBeLessThanOrEqual(MAX_VEEDEL);
    expect(parseEntry({ ...valid, veedel: 60 }, 0)?.veedel).toBe(60);
    expect(parseEntry({ ...valid, veedel: all }, 0)?.veedel).toBe(all);
    expect(parseEntry({ ...valid, veedel: 1e6 }, 0)?.veedel).toBe(MAX_VEEDEL);
  });
});

describe('Namen ohne kaputte Zeichen und ohne verschluckte Umbrüche', () => {
  const emojiName = `${'a'.repeat(19)}😀`;
  it('Server: Umbruch und Tab werden ein Leerzeichen, gekürzt nach Codepunkten', () => {
    expect(parseEntry({ ...valid, name: 'Jakob\nMüller' }, 0)?.name).toBe('Jakob Müller');
    expect(parseEntry({ ...valid, name: 'Jakob\t\r\nMüller' }, 0)?.name).toBe('Jakob Müller');
    expect(parseEntry({ ...valid, name: 'Ja​kob' }, 0)?.name).toBe('Jakob');
    const kept = parseEntry({ ...valid, name: emojiName }, 0)?.name ?? '';
    expect(kept).toBe(emojiName);
    expect(lonely(kept)).toBe(false);
    const cut = parseEntry({ ...valid, name: `${'a'.repeat(20)}😀` }, 0)?.name ?? '';
    expect(cut).toBe('a'.repeat(20));
    expect(parseEntry({ ...valid, name: `${'b'.repeat(19)}😀😀` }, 0)?.name).toBe(emojiName.replace(/a/g, 'b'));
  });

  it('Client: cleanPlayerName kürzt genauso', () => {
    expect(PLAYER_NAME_MAX).toBe(20);
    expect(cleanPlayerName('Jakob\tMüller')).toBe('Jakob Müller');
    expect(cleanPlayerName(' Jakob\nMüller ')).toBe('Jakob Müller');
    expect(cleanPlayerName('Ja​kob')).toBe('Jakob');
    expect(cleanPlayerName(emojiName)).toBe(emojiName);
    expect(lonely(cleanPlayerName(`${'c'.repeat(19)}😀😀`))).toBe(false);
    expect(cleanPlayerName(`${'a'.repeat(20)}😀`)).toBe('a'.repeat(20));
  });
});

// --- Oberfläche: Übermittlung ---

interface Pending {
  body: Record<string, unknown>;
  resolve: (response: { ok: boolean }) => void;
}

/** Steuerbares fetch: Jede Anfrage wartet, bis der Test sie beantwortet. */
function controlledFetch(): { calls: Pending[]; fetch: (url: string, init: RequestInit) => Promise<{ ok: boolean }> } {
  const calls: Pending[] = [];
  return {
    calls,
    fetch: (_url, init) =>
      new Promise((resolve) => {
        calls.push({ body: JSON.parse(String(init.body)) as Record<string, unknown>, resolve });
      }),
  };
}

function stubBrowser(fetch: unknown): void {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    location: { hostname: 'koeln-tycoon.example', search: '' },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    crypto: globalThis.crypto,
  });
  vi.stubGlobal('fetch', fetch);
}

/** Ein paar Runden Mikrotasks, damit die Kette nach einer Antwort weiterläuft. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('Game-Over-Stand geht nicht verloren, wenn eine Übermittlung noch läuft', () => {
  it('Game Over während des Tagesbeginns: Der Endstand geht danach hinterher', async () => {
    const control = controlledFetch();
    stubBrowser(control.fetch);
    const sim = createTestGame({ seed: 65 });
    sim.advance(1);
    const running = sim.state;
    running.meta.runId = 'run_b065_a';
    const over: GameState = structuredClone(running);
    over.outcome.gameOver = { reason: 'bankrupt', time: over.time };

    // Tagesbeginn: Die Anfrage ist unterwegs.
    const first = submit(running);
    expect(control.calls).toHaveLength(1);
    expect(control.calls[0].body.outcome).toBe('running');
    // Game Over meldet zweimal (Reaktion und Bildschirm), während die erste noch läuft.
    const second = submit(over);
    const third = submit(over);
    expect(control.calls).toHaveLength(1);

    let done = false;
    void second.then(() => {
      done = true;
    });
    control.calls[0].resolve({ ok: true });
    await settle();
    // Genau eine Nachmeldung mit dem Endstand, und wer wartet, wartet auch auf sie.
    expect(control.calls).toHaveLength(2);
    expect(control.calls[1].body.outcome).toBe('bankrupt');
    expect(done).toBe(false);
    control.calls[1].resolve({ ok: true });
    await Promise.all([first, second, third]);
    expect(done).toBe(true);
    // Schon angekommen: kein drittes Mal.
    await submit(over);
    expect(control.calls).toHaveLength(2);
  });

  it('derselbe Stand zweimal, während er unterwegs ist: nur eine Anfrage', async () => {
    const control = controlledFetch();
    stubBrowser(control.fetch);
    const sim = createTestGame({ seed: 66 });
    sim.advance(1);
    sim.state.meta.runId = 'run_b065_b';
    sim.state.outcome.gameOver = { reason: 'killed', time: sim.state.time };
    const a = submit(sim.state);
    const b = submit(sim.state);
    expect(control.calls).toHaveLength(1);
    // Auch wenn die erste scheitert, schickt die zweite Meldung nicht dasselbe noch einmal hinterher.
    control.calls[0].resolve({ ok: false });
    await Promise.all([a, b]);
    expect(control.calls).toHaveLength(1);
  });
});

// --- Server: nur verbessern, atomar ---

type Command = (string | number)[];

/** Kleiner Ersatz für Upstash Redis (REST-Pipeline): nur die Befehle, die die Bestenliste schickt. */
function fakeUpstash() {
  const counters = new Map<string, number>();
  const hashes = new Map<string, Map<string, string>>();
  const board = new Map<string, number>();
  const commands: Command[] = [];
  const hash = (key: string) => {
    let h = hashes.get(key);
    if (!h) {
      h = new Map();
      hashes.set(key, h);
    }
    return h;
  };
  const ranked = () => [...board.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([id]) => id);
  const run = (cmd: Command): unknown => {
    commands.push(cmd);
    const [name, ...args] = cmd;
    const s = args.map(String);
    switch (name) {
      case 'INCR': {
        const n = (counters.get(s[0]) ?? 0) + 1;
        counters.set(s[0], n);
        return n;
      }
      case 'EXPIRE':
        return 1;
      case 'HSETNX': {
        const h = hash(s[0]);
        if (h.has(s[1])) return 0;
        h.set(s[1], s[2]);
        return 1;
      }
      case 'HGET':
        return hash(s[0]).get(s[1]) ?? null;
      case 'HSET':
        hash(s[0]).set(s[1], s[2]);
        return 1;
      case 'HDEL':
        for (const f of s.slice(1)) hash(s[0]).delete(f);
        return 1;
      case 'ZSCORE':
        return board.has(s[1]) ? String(board.get(s[1])) : null;
      case 'ZADD':
        board.set(s[2], Number(s[1]));
        return 1;
      case 'ZREM':
        for (const m of s.slice(1)) board.delete(m);
        return 1;
      case 'ZCARD':
        return board.size;
      case 'ZRANGE': {
        const list = ranked();
        const stop = Number(s[2]);
        return list.slice(Number(s[1]), stop < 0 ? list.length + stop + 1 : stop + 1);
      }
      case 'ZREVRANK': {
        const index = ranked().reverse().indexOf(s[1]);
        return index < 0 ? null : index;
      }
      case 'EVAL': {
        // Das Skript der Bestenliste, in einem Schritt: nur schreiben, wenn nicht schlechter.
        const [script, , boardKey, runsKey, score, runId, entry] = s;
        expect(script).toContain('ZSCORE');
        expect(boardKey).toBe('kt:lb');
        expect(runsKey).toBe('kt:runs');
        const old = board.get(runId);
        if (old !== undefined && Number(score) < old) return 0;
        board.set(runId, Number(score));
        hash(runsKey).set(runId, entry);
        return 1;
      }
      default:
        throw new Error(`Befehl ${String(name)} kennt der Ersatz nicht.`);
    }
  };
  const fetch = async (_url: string, init: RequestInit) => {
    // Erst nach einer Pause antworten: So überlappen gleichzeitige Einträge wie im echten Netz.
    await new Promise((resolve) => setTimeout(resolve, 1));
    const results = (JSON.parse(String(init.body)) as Command[]).map((cmd) => ({ result: run(cmd) }));
    return new Response(JSON.stringify(results), { status: 200 });
  };
  return { fetch, commands, board, details: (runId: string) => hash('kt:runs').get(runId) };
}

function post(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request('https://koeln-tycoon.example/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify(body),
    }),
  );
}

describe('Punkteprüfung und Schreiben in einem Schritt', () => {
  const token = 'tok_b118_0123456789abcdef';
  const run = { ...valid, runId: 'run_b118', token, days: 10 };

  it('nur verbessern, gleich gut aktualisiert die Angaben, schlechter ändert nichts', async () => {
    const upstash = fakeUpstash();
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example');
    vi.stubEnv('KV_REST_API_TOKEN', 'geheim');
    vi.stubGlobal('fetch', upstash.fetch);
    expect((await post({ ...run, score: 100 })).status).toBe(200);
    expect(upstash.board.get('run_b118')).toBe(100);
    // Gleichzeitig ein besserer und ein schlechterer Stand: Der bessere bleibt stehen, auch in den Angaben.
    const [a, b] = await Promise.all([post({ ...run, score: 200 }), post({ ...run, score: 150 })]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(upstash.board.get('run_b118')).toBe(200);
    expect(JSON.parse(upstash.details('run_b118') ?? '{}').score).toBe(200);
    // Gleich gut (Game Over mit dem Spitzenwert): Der Ausgang wird übernommen.
    await post({ ...run, score: 200, outcome: 'bankrupt' });
    expect(JSON.parse(upstash.details('run_b118') ?? '{}').outcome).toBe('bankrupt');
    // Lesen und Schreiben laufen nie getrennt (sonst kann der schlechtere nach dem besseren schreiben).
    const names = upstash.commands.map((c) => c[0]);
    expect(names).not.toContain('ZSCORE');
    expect(names).not.toContain('ZADD');
    expect(names.filter((n) => n === 'EVAL')).toHaveLength(4);
  });
});
