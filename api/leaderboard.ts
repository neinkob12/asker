// Bestenliste für alle Spieler (Vercel Function, Auftrag 29). Speicher: Upstash Redis über die REST-Schnittstelle,
// angelegt in Vercel unter Storage (setzt KV_REST_API_URL und KV_REST_API_TOKEN bzw. UPSTASH_REDIS_REST_*).
//
//   GET  /api/leaderboard?runId=…   → { entries: PublicEntry[] (beste zuerst, ohne runId), total,
//                                       me: { rank, entry } | null }
//   POST /api/leaderboard           ← { runId, token, name, score, days, veedel, outcome, mode, title?, quests, cities?,
//                                       rank? }  (title = Rang des Spielers, rank = sein Wert, Auftrag 36)
//                                   → { rank: number | null, total }   (429 bei zu vielen Anfragen, 403 bei falschem Token)
//
// Ein Durchgang (runId) steht nur einmal in der Liste, mit seinem besten Ergebnis. Schutz, soweit er mit einem
// Spiel ohne Konten geht:
//  - Die runId ist geheim (GET liefert sie nicht aus, der eigene Eintrag steht in `me`), und jeder Durchgang hat ein
//    Token, das der Client beim ersten Eintrag erzeugt. Der Server merkt sich nur dessen SHA-256-Hash; wer eine
//    runId mit anderem Token schickt, bekommt 403 und kann Name, Titel und Wert nicht überschreiben. Einträge von
//    vor dieser Änderung haben noch kein Token: Das erste, das kommt, wird übernommen.
//  - Drosselung pro IP (festes Zeitfenster in Redis), gegen Fluten mit erfundenen Durchgängen.
//  - Obergrenze fürs Vermögen pro gespieltem Tag. Das beweist nichts (die Tage meldet der Client selbst), begrenzt
//    aber den Schaden. Wer will, kann schummeln, für eine Freundesgruppe reicht das.

const BOARD = 'kt:lb';
const RUNS = 'kt:runs';
const LIMIT = 50;
/** So viele Einträge bleiben gespeichert (die Liste zeigt nur LIMIT): Wer spammt, füllt den Speicher nicht endlos. */
const KEEP = 500;
const TOKENS = 'kt:tokens';
/**
 * Mehr Vermögen als so viel pro gespieltem Tag nehmen wir nicht an: Der Wert wird darauf gekappt. Gemessen: Der Bot
 * kommt in den ersten gut 20 Tagen auf rund 1.000 € Vermögen pro Tag (Test-Spielstand „Köln fast komplett“: 64.000 €
 * an Tag 23, davon 50.000 € geschenkt), der Umsatz liegt bei 5.000 € pro Tag. Mit 250.000 € pro Tag liegt die Grenze
 * rund 50-mal darüber: Ein echter Durchgang stößt nie daran, ein erfundener "Tag 1, 100 Mio." schon.
 */
export const MAX_SCORE_PER_DAY = 250_000;
/** Absolute Obergrenze, egal wie viele Tage gemeldet werden. */
export const MAX_SCORE = 100_000_000;
/** Drosselung: höchstens so viele Einträge pro IP und Zeitfenster. Ein Spieler schickt höchstens alle ~1,2 Minuten (Tempo 4) einen. */
export const RATE_LIMIT = 120;
export const RATE_WINDOW_SECONDS = 600;

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
  /** Komplett übernommene Städte (Auftrag 30, optional: ältere Spielstände schicken es nicht). */
  cities?: number;
  /** Wert des Rangs zum Titel (Auftrag 36, optional: ältere Spielstände schicken es nicht). */
  rank?: number;
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

/**
 * Gültige Titel (Ränge des Spielers, Auftrag 36, `src/modules/city/ranks.ts`) in ihrer Reihenfolge. Der Wert eines
 * Rangs (`rank`) ist Platz × 10, bei „Boss von <Stadt>“ plus die Zahl der weiteren kompletten Städte.
 */
export const RANK_TITLES: readonly (string | RegExp)[] = [
  'Kleindealer',
  'Händler',
  'Großhändler',
  'Boss von Köln',
  /^Boss von (Hamburg|Berlin|München|Frankfurt)$/,
  'Boss von Deutschland',
  'Importeur',
  'Produzent',
];

/** Platz eines Titels in RANK_TITLES, null für einen unbekannten Titel. */
export function rankStep(title: string): number | null {
  const step = RANK_TITLES.findIndex((t) => (typeof t === 'string' ? t === title : t.test(title)));
  return step < 0 ? null : step;
}

/** Höchstes Vermögen, das für so viele gespielte Tage angenommen wird. */
export function maxScore(days: number): number {
  return Math.min(MAX_SCORE, MAX_SCORE_PER_DAY * days);
}

/** Geheimes Token eines Durchgangs (vom Client erzeugt). null = fehlt oder hat die falsche Form. */
export function parseToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const token = (body as Record<string, unknown>).token;
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : null;
}

/** SHA-256 des Tokens als Hex: Nur das steht in Redis. */
export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Eintrag für die Antwort: ohne runId (sonst könnte jeder fremde Durchgänge ansprechen). */
export type PublicEntry = Omit<Entry, 'runId'>;

export function publicEntry(entry: Entry): PublicEntry {
  const { runId: _runId, ...rest } = entry;
  return rest;
}

/** Rang (1 = Platz eins) aus der Antwort von ZREVRANK; null, wenn der Eintrag nicht (mehr) in der Liste steht. */
export function toRank(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw + 1 : null;
}

/** IP des Aufrufers (Vercel setzt x-forwarded-for bzw. x-real-ip selbst). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
  return ip.slice(0, 64);
}

/** Schlüssel des Zählers: IP + Nummer des Zeitfensters (festes Fenster, läuft von selbst ab). */
export function rateKey(ip: string, now: number): string {
  return `kt:rl:${ip}:${Math.floor(now / (RATE_WINDOW_SECONDS * 1000))}`;
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
  const score = clampInt(b.score, 0, maxScore(days));
  if (score === null) return null;
  const outcome = OUTCOMES.find((o) => o === b.outcome);
  if (!outcome) return null;
  // Nur bekannte Titel, und der Wert muss zum Titel passen (sonst fällt er weg).
  const rawTitle = cleanText(b.title, 40);
  const step = rawTitle ? rankStep(rawTitle) : null;
  const title = step === null ? '' : rawTitle;
  const cities = b.cities === undefined ? null : clampInt(b.cities, 0, 20);
  const rawRank = b.rank === undefined ? null : clampInt(b.rank, 0, 1000);
  const rank = rawRank !== null && step !== null && Math.floor(rawRank / 10) === step ? rawRank : null;
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
    ...(cities !== null ? { cities } : {}),
    ...(rank !== null ? { rank } : {}),
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
    const entries = details
      .map(parseStored)
      .filter((e): e is Entry => e !== null)
      .map(publicEntry);
    const myRank = toRank(rank);
    const mine = parseStored(own);
    const me = myRank !== null ? { rank: myRank, entry: mine ? publicEntry(mine) : null } : null;
    return json({ entries, total: Number(total) || 0, me });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const now = Date.now();
  try {
    const key = rateKey(clientIp(request.headers), now);
    const [count] = await redis([
      ['INCR', key],
      ['EXPIRE', key, RATE_WINDOW_SECONDS * 2],
    ]);
    if (Number(count) > RATE_LIMIT) {
      return Response.json(
        { error: 'Zu viele Einträge, bitte später wieder.' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(RATE_WINDOW_SECONDS) } },
      );
    }
  } catch (error) {
    return failure(error);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Kein JSON.' }, 400);
  }
  const entry = parseEntry(body, now);
  const token = parseToken(body);
  if (!entry || !token) return json({ error: 'Eintrag ungültig.' }, 400);
  try {
    const hash = await hashToken(token);
    // Das erste Token eines Durchgangs wird festgehalten (HSETNX ist atomar); danach muss es passen.
    const [claimed, stored, existing] = await redis([
      ['HSETNX', TOKENS, entry.runId, hash],
      ['HGET', TOKENS, entry.runId],
      ['ZSCORE', BOARD, entry.runId],
    ]);
    if (Number(claimed) !== 1 && stored !== hash) return json({ error: 'Nicht dein Durchgang.' }, 403);
    const old = existing === null || existing === undefined ? null : Number(existing);
    // Derselbe Durchgang: nur verbessern (nach Game Over einen alten Stand laden zählt nicht doppelt).
    if (old === null || entry.score >= old) {
      await redis([
        ['ZADD', BOARD, entry.score, entry.runId],
        ['HSET', RUNS, entry.runId, JSON.stringify(entry)],
      ]);
    }
    // Alles unterhalb der besten KEEP Einträge wegwerfen (auch die Details und Tokens).
    const [outside] = await redis([['ZRANGE', BOARD, 0, -(KEEP + 1)]]);
    if (Array.isArray(outside) && outside.length > 0) {
      await redis([
        ['ZREM', BOARD, ...(outside as string[])],
        ['HDEL', RUNS, ...(outside as string[])],
        ['HDEL', TOKENS, ...(outside as string[])],
      ]);
    }
    const [rank, total] = await redis([
      ['ZREVRANK', BOARD, entry.runId],
      ['ZCARD', BOARD],
    ]);
    // Wer gerade abgeschnitten wurde, steht nicht mehr in der Liste: dann kein Rang (statt fälschlich Platz 1).
    return json({ rank: toRank(rank), total: Number(total) || 0 });
  } catch (error) {
    return failure(error);
  }
}
