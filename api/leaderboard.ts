// Bestenliste für alle Spieler (Vercel Function, Auftrag 29). Speicher: Upstash Redis über die REST-Schnittstelle,
// angelegt in Vercel unter Storage (setzt KV_REST_API_URL und KV_REST_API_TOKEN bzw. UPSTASH_REDIS_REST_*).
//
//   GET  /api/leaderboard?runId=…   → { entries: Entry[] (beste zuerst), total, me: { rank, entry } | null }
//   POST /api/leaderboard           ← { runId, name, score, days, veedel, outcome, mode, title?, quests }
//                                   → { rank, total }
//
// Ein Durchgang (runId) steht nur einmal in der Liste, mit seinem besten Ergebnis. Grobe Plausibilitätsprüfung,
// mehr nicht: Wer will, kann schummeln, für eine Freundesgruppe reicht das.

const BOARD = 'kt:lb';
const RUNS = 'kt:runs';
const LIMIT = 50;
/** So viele Einträge bleiben gespeichert (die Liste zeigt nur LIMIT): Wer spammt, füllt den Speicher nicht endlos. */
const KEEP = 500;
/** Mehr Vermögen als so viel pro gespieltem Tag ist nicht möglich: Der Wert wird darauf gekappt. */
const MAX_SCORE_PER_DAY = 2_000_000;

export interface Entry {
  runId: string;
  name: string;
  score: number;
  days: number;
  veedel: number;
  outcome: 'bankrupt' | 'killed' | 'won' | 'running';
  mode: 'normal' | 'hardcore';
  title: string | null;
  quests: number;
  /** Zeitpunkt des Eintrags (ms seit 1970). */
  at: number;
}

const OUTCOMES = ['bankrupt', 'killed', 'won', 'running'] as const;

function clampInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

/** Prüft und bereinigt einen Eintrag. null = unbrauchbar. */
export function parseEntry(body: unknown, now: number): Entry | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const runId = cleanText(b.runId, 64);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(runId)) return null;
  const days = clampInt(b.days, 1, 100_000);
  const veedel = clampInt(b.veedel, 0, 50);
  const quests = clampInt(b.quests ?? 0, 0, 100);
  if (days === null || veedel === null || quests === null) return null;
  const score = clampInt(b.score, 0, Math.min(100_000_000, MAX_SCORE_PER_DAY * days));
  if (score === null) return null;
  const outcome = OUTCOMES.find((o) => o === b.outcome);
  if (!outcome) return null;
  const title = cleanText(b.title, 40);
  return {
    runId,
    name: cleanText(b.name, 20) || 'Anonym',
    score,
    days,
    veedel,
    outcome,
    mode: b.mode === 'hardcore' ? 'hardcore' : 'normal',
    title: title || null,
    quests,
    at: now,
  };
}

// --- Redis (Upstash REST) ---

type RedisCommand = (string | number)[];

function redisConfig(): { url: string; token: string } | null {
  const env = process.env;
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(commands: RedisCommand[]): Promise<unknown[]> {
  const config = redisConfig();
  if (!config) throw new Error('Kein Speicher eingerichtet (Upstash Redis in Vercel unter Storage anlegen).');
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error(`Speicher antwortet mit ${response.status}`);
  const results = (await response.json()) as { result?: unknown; error?: string }[];
  return results.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Fehler des Speichers: ins Log, nach außen nur ein allgemeiner Text (keine Interna des Dienstes). */
function failure(error: unknown): Response {
  console.error('Bestenliste', error);
  return json({ error: 'Die Bestenliste ist gerade nicht erreichbar.' }, 503);
}

function parseStored(raw: unknown): Entry | null {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Entry;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const runId = new URL(request.url).searchParams.get('runId') ?? '';
    const [ids, total, rank, own] = await redis([
      ['ZREVRANGE', BOARD, 0, LIMIT - 1],
      ['ZCARD', BOARD],
      ['ZREVRANK', BOARD, runId || '-'],
      ['HGET', RUNS, runId || '-'],
    ]);
    const list = Array.isArray(ids) ? (ids as string[]) : [];
    const details = list.length > 0 ? ((await redis([['HMGET', RUNS, ...list]]))[0] as unknown[]) : [];
    const entries = details.map(parseStored).filter((e): e is Entry => e !== null);
    const me = typeof rank === 'number' ? { rank: rank + 1, entry: parseStored(own) } : null;
    return json({ entries, total: Number(total) || 0, me });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Kein JSON.' }, 400);
  }
  const entry = parseEntry(body, Date.now());
  if (!entry) return json({ error: 'Eintrag ungültig.' }, 400);
  try {
    const [existing] = await redis([['ZSCORE', BOARD, entry.runId]]);
    const old = existing === null || existing === undefined ? null : Number(existing);
    // Derselbe Durchgang: nur verbessern (nach Game Over einen alten Stand laden zählt nicht doppelt).
    if (old === null || entry.score >= old) {
      await redis([
        ['ZADD', BOARD, entry.score, entry.runId],
        ['HSET', RUNS, entry.runId, JSON.stringify(entry)],
      ]);
    }
    // Alles unterhalb der besten KEEP Einträge wegwerfen (auch die Details).
    const [outside] = await redis([['ZRANGE', BOARD, 0, -(KEEP + 1)]]);
    if (Array.isArray(outside) && outside.length > 0) {
      await redis([
        ['ZREM', BOARD, ...(outside as string[])],
        ['HDEL', RUNS, ...(outside as string[])],
      ]);
    }
    const [rank, total] = await redis([
      ['ZREVRANK', BOARD, entry.runId],
      ['ZCARD', BOARD],
    ]);
    return json({ rank: Number(rank) + 1, total: Number(total) || 0 });
  } catch (error) {
    return failure(error);
  }
}
