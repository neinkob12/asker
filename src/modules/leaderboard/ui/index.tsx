// Oberfläche der Bestenliste: Ergebnis an den Server schicken (bei Game Over, Sieg und zu jedem neuen Spieltag, damit
// alle, die spielen, auch drinstehen), Liste im Game-Over-Bildschirm und als Seite im Handy, Name in den Einstellungen.
// Der Server ist api/leaderboard.ts (nur auf Vercel). Lokal (localhost) bleibt die Liste aus, ohne Fehler.

import { useEffect, useState } from 'preact/hooks';
import { formatEuro, type GameState } from '../../../core';
import {
  Button,
  type ChipSpec,
  Group,
  getPlayerName,
  Hint,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  PLAYER_NAME_MAX,
  registerPanel,
  registerSearch,
  registerSlot,
  setPlayerName,
  TextField,
  useGame,
  useUi,
} from '../../../ui';
import { milestoneTitle } from '../../territory';
import { runSummary } from '../index';
import './leaderboard.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'leaderboard.board': Record<string, never>;
  }
}

const ENDPOINT = '/api/leaderboard';

/** Eintrag, wie ihn der Server ausliefert: ohne runId (die bleibt geheim, den eigenen Platz nennt `me`). */
interface Entry {
  name: string;
  score: number;
  days: number;
  veedel: number;
  outcome: 'bankrupt' | 'killed' | 'won' | 'running';
  mode: 'normal' | 'hardcore';
  title: string | null;
  quests: number;
  /** Komplett übernommene Städte (Auftrag 30, fehlt bei älteren Einträgen). */
  cities?: number;
  /** Wert des Rangs (Auftrag 36, fehlt bei älteren Einträgen). */
  rank?: number;
}

interface Board {
  entries: Entry[];
  total: number;
  me: { rank: number } | null;
}

/** Geheimes Token pro Durchgang: Der Server speichert nur den Hash und lässt nur damit Änderungen am Eintrag zu. */
const tokens = new Map<string, string>();
const TOKEN_KEY = 'kt:lb-token:';

function token(runId: string): string {
  const known = tokens.get(runId);
  if (known) return known;
  let value: string | null = null;
  try {
    value = window.localStorage.getItem(TOKEN_KEY + runId);
  } catch {
    // Kein Speicher (privates Fenster): Das Token gilt dann nur, solange die Seite offen ist.
  }
  if (!value) {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      window.localStorage.setItem(TOKEN_KEY + runId, value);
    } catch {
      // siehe oben
    }
  }
  tokens.set(runId, value);
  return value;
}

/** Nur online (Vercel): lokal gibt es keinen Server, ?bestenliste=1 erzwingt ihn zum Ausprobieren. */
function enabled(): boolean {
  const host = window.location.hostname;
  const forced = new URLSearchParams(window.location.search).get('bestenliste') === '1';
  return forced || !(host === 'localhost' || host === '127.0.0.1' || host === '' || host.endsWith('.local'));
}

/** Wie lange die Bestenliste auf eine Antwort wartet: Ohne Antwort zeigt der Bildschirm sonst ewig "lädt …". */
const TIMEOUT_MS = 10_000;
const timeout = () =>
  typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined;

/** Übermittlungen, die gerade laufen (der Bildschirm wartet darauf), und was zuletzt ankam (nichts doppelt schicken). */
const inFlight = new Map<string, Promise<void>>();
const lastSent = new Map<string, string>();
/** Was gerade unterwegs ist, und der neuere Stand, der währenddessen kam (geht danach hinterher). */
const sending = new Map<string, string>();
const queued = new Map<string, string>();

export function submit(state: GameState): Promise<void> {
  // Test-Spielstände (meta.scenario) hat der Bot gespielt: Sie kommen nicht in die Bestenliste.
  if (!enabled() || state.meta.scenario) return Promise.resolve();
  const summary = runSummary(state);
  const runId = summary.runId;
  const body = JSON.stringify({
    ...summary,
    token: token(runId),
    name: getPlayerName(),
    // Titel ist der Rang (Auftrag 36); ohne Rang der Meilenstein „Boss von Köln“ (Auftrag 46d: früher aus den Quests).
    title: summary.title || milestoneTitle(state),
  });
  return send(runId, body);
}

function send(runId: string, body: string): Promise<void> {
  // Game Over meldet über die Reaktion und über den Bildschirm: Läuft schon eine Übermittlung, wartet der zweite darauf.
  // Ein neuerer Stand (z.B. Game Over, während der Tagesbeginn noch unterwegs ist) geht danach hinterher, statt
  // verloren zu gehen; die laufende Übermittlung endet erst mit ihm.
  const running = inFlight.get(runId);
  if (running) {
    if (sending.get(runId) === body) queued.delete(runId);
    else queued.set(runId, body);
    return running;
  }
  if (lastSent.get(runId) === body) return Promise.resolve();
  const request = fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    signal: timeout(),
  })
    .then((response) => {
      if (response.ok) lastSent.set(runId, body);
    })
    .catch(() => undefined)
    .then(() => {
      inFlight.delete(runId);
      sending.delete(runId);
      const next = queued.get(runId);
      queued.delete(runId);
      return next === undefined ? undefined : send(runId, next);
    });
  inFlight.set(runId, request);
  sending.set(runId, body);
  return request;
}

async function load(runId: string): Promise<Board> {
  await inFlight.get(runId);
  const response = await fetch(`${ENDPOINT}?runId=${encodeURIComponent(runId)}`, { signal: timeout() });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as Board;
}

const OUTCOME: Record<Entry['outcome'], ChipSpec> = {
  bankrupt: { label: 'pleite', color: 'warn', icon: 'wallet' },
  killed: { label: 'getötet', color: 'danger', icon: 'skull' },
  won: { label: 'gewonnen', color: 'brand', icon: 'crown' },
  running: { label: 'spielt noch', color: 'money', icon: 'play' },
};

function entryTags(e: Entry): ChipSpec[] {
  const tags: ChipSpec[] = [
    { label: `Tag ${e.days}`, color: 'system', icon: 'calendar' },
    { label: `${e.veedel} Veedel`, color: 'place', icon: 'flag' },
    OUTCOME[e.outcome],
  ];
  if ((e.cities ?? 0) > 1) tags.push({ label: `${e.cities} Städte`, color: 'place', icon: 'building' });
  if (e.mode === 'hardcore') tags.push({ label: 'Hardcore', color: 'danger', icon: 'skull' });
  if (e.title) tags.push({ label: e.title, color: 'brand', icon: 'crown' });
  return tags;
}

function rankIcon(rank: number): { icon: string; color: 'brand' | 'system' | 'goods' | 'warn' } {
  if (rank === 1) return { icon: 'trophy', color: 'brand' };
  if (rank === 2) return { icon: 'medal', color: 'system' };
  if (rank === 3) return { icon: 'medal', color: 'warn' };
  return { icon: 'user', color: 'system' };
}

/** Liste mit Laden, Fehler und eigenem Platz. */
function BoardView(props: { limit?: number; submitFirst?: boolean; quietFail?: boolean }) {
  const { state } = useGame();
  const runId = state.meta.runId;
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const off = !enabled();
  useEffect(() => {
    if (off) return;
    let alive = true;
    if (props.submitFirst) submit(state);
    load(runId)
      .then((b) => alive && setBoard(b))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [runId]);

  // Lokal ist die Liste bewusst aus (kein Server): kein Fehler, nur ein neutraler Hinweis.
  if (off) return props.quietFail ? null : <Hint>Die Bestenliste gibt es nur in der Online-Version.</Hint>;
  if (failed) return props.quietFail ? null : <Hint>Die Bestenliste ist gerade nicht erreichbar.</Hint>;
  if (!board) return <p class="lb__loading">Bestenliste lädt …</p>;
  if (board.entries.length === 0) return <Hint>Noch niemand drin. Du bist der Erste.</Hint>;
  const entries = board.entries.slice(0, props.limit ?? board.entries.length);
  return (
    <div class="lb">
      {board.me && (
        <p class="lb__me">
          Dein Platz: <strong>{board.me.rank}</strong> von {board.total}
        </p>
      )}
      <List class="lb__list">
        {entries.map((e, i) => {
          const rank = i + 1;
          const icon = rankIcon(rank);
          return (
            <ListItem key={rank} value={formatEuro(e.score)}>
              <span class={`lb__row ${board.me?.rank === rank ? 'is-me' : ''}`}>
                <span class="lb__rank">{rank}</span>
                <ItemContent icon={icon.icon} color={icon.color} title={e.name} tags={entryTags(e)} />
              </span>
            </ListItem>
          );
        })}
      </List>
    </div>
  );
}

function EndingBoard() {
  const { state } = useGame();
  return (
    <div class="lb-ending">
      <h3 class="lb-ending__title">Bestenliste</h3>
      {state.meta.scenario && <Hint>Test-Spielstand: Dieses Ergebnis kommt nicht in die Bestenliste.</Hint>}
      {/* Test-Spielstand: keine zweite Meldung über eine nicht erreichbare Liste (Auftrag 43, M10). */}
      <BoardView limit={10} submitFirst quietFail={!!state.meta.scenario} />
    </div>
  );
}

function BoardPage() {
  return (
    <Group title="Alle Spieler" icon="trophy" color="brand" note="Gerankt nach dem höchsten Vermögen im Durchgang.">
      <BoardView />
    </Group>
  );
}

function PlayerSettings() {
  const ui = useUi();
  const [name, setName] = useState(getPlayerName());
  const [saved, setSaved] = useState(false);
  const save = () => {
    setPlayerName(name);
    setName(getPlayerName());
    setSaved(true);
  };
  return (
    <div class="lb-settings">
      <TextField
        label="Dein Name in der Bestenliste"
        value={name}
        maxLength={PLAYER_NAME_MAX}
        onInput={(v) => {
          setName(v);
          setSaved(false);
        }}
        onSubmit={save}
      />
      <div class="lb-settings__actions">
        <Button small variant="primary" onClick={save} disabled={saved || name.trim() === getPlayerName()}>
          {saved ? 'Gespeichert' : 'Speichern'}
        </Button>
        <Button small icon="trophy" onClick={() => ui.openPanel('leaderboard.board', {})}>
          Bestenliste
        </Button>
        <Button small icon="play" onClick={() => ui.openDialog('core.intro', { replay: true })}>
          Intro
        </Button>
      </div>
    </div>
  );
}

registerSlot('core.ending', { id: 'leaderboard.ending', order: 10, component: EndingBoard });
registerSlot('core.settings', {
  id: 'leaderboard.player',
  title: 'Spieler',
  icon: 'trophy',
  color: 'brand',
  order: 5,
  component: PlayerSettings,
});
registerPanel({ id: 'leaderboard.board', title: () => 'Bestenliste', component: BoardPage });
registerSearch({
  id: 'leaderboard.search',
  label: 'Bestenliste',
  order: 6,
  items: () => [
    {
      id: 'leaderboard.board',
      title: 'Bestenliste',
      subtitle: 'Alle Spieler, nach Vermögen',
      icon: 'trophy',
      keywords: 'Highscore Rangliste Leaderboard Freunde Platz',
      run: (ui) => ui.openPanel('leaderboard.board', {}),
    },
  ],
});

// Ergebnis schicken: am Ende und zu jedem neuen Spieltag (so stehen auch alle drin, die noch spielen).
onGameEvent('game.over', 'leaderboard.over', (_payload, _ui, state) => {
  submit(state);
});
onGameEvent('campaign.won', 'leaderboard.won', (_payload, _ui, state) => {
  submit(state);
});
// Neuer Rang (Auftrag 36): gleich mit dem neuen Titel in die Liste.
onGameEvent('player.rankUp', 'leaderboard.rank', (_payload, _ui, state) => {
  submit(state);
});
onGameEvent('clock.dayStarted', 'leaderboard.day', (_payload, _ui, state) => {
  if (!state.outcome.gameOver) submit(state);
});
