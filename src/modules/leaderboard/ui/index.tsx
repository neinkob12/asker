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
import { completedQuests, questTitle } from '../../quests';
import { runSummary } from '../index';
import './leaderboard.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'leaderboard.board': Record<string, never>;
  }
}

const ENDPOINT = '/api/leaderboard';

interface Entry {
  runId: string;
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
}

interface Board {
  entries: Entry[];
  total: number;
  me: { rank: number } | null;
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

function submit(state: GameState): Promise<void> {
  if (!enabled()) return Promise.resolve();
  const summary = runSummary(state);
  const runId = summary.runId;
  // Game Over meldet über die Reaktion und über den Bildschirm: Läuft schon eine Übermittlung, wartet der zweite darauf.
  const running = inFlight.get(runId);
  if (running) return running;
  const body = JSON.stringify({
    ...summary,
    name: getPlayerName(),
    title: questTitle(state),
    quests: completedQuests(state).length,
  });
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
    .finally(() => inFlight.delete(runId));
  inFlight.set(runId, request);
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
function BoardView(props: { limit?: number; submitFirst?: boolean }) {
  const { state } = useGame();
  const runId = state.meta.runId;
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled()) {
      setFailed(true);
      return;
    }
    let alive = true;
    if (props.submitFirst) submit(state);
    load(runId)
      .then((b) => alive && setBoard(b))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [runId]);

  if (failed) return <Hint>Die Bestenliste ist gerade nicht erreichbar.</Hint>;
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
            <ListItem key={e.runId} value={formatEuro(e.score)}>
              <span class={`lb__row ${e.runId === runId ? 'is-me' : ''}`}>
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
  return (
    <div class="lb-ending">
      <h3 class="lb-ending__title">Bestenliste</h3>
      <BoardView limit={10} submitFirst />
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
onGameEvent('clock.dayStarted', 'leaderboard.day', (_payload, _ui, state) => {
  if (!state.outcome.gameOver) submit(state);
});
