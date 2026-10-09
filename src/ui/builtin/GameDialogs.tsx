// Dialoge des Kerns: neues Spiel, Spielstände, Game Over, Sieg.

import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { GameState } from '../../core';
import {
  AUTOSAVE_SLOT,
  clock,
  GAME_OVER_TEXT,
  type GameMode,
  MANUAL_SLOTS,
  SaveError,
  type SaveInfo,
} from '../../core';
import { Button, Confetti, Dialog, Group, Hint, Icon, IconChip, List, ListItem, Stamp } from '../components';
import { useRuntime } from '../hooks';
import { gameStats } from '../registry';
import type { UiRuntime } from '../runtime';
import { Slot } from '../shell/Slot';
import { loadTestSave, TEST_SAVE_FILES, TEST_SAVE_PHASES } from './testSaves';

declare module '../registry' {
  interface DialogRegistry {
    /** fromSaves: aus den Spielständen geöffnet, Abbrechen führt dorthin zurück (Auftrag 43, N7). */
    'core.newGame': { firstStart?: boolean; fromSaves?: boolean };
    'core.saves': Record<string, never>;
    'core.gameOver': Record<string, never>;
    /** Eine Stadt ist komplett übernommen (Auftrag 30). Ohne Angaben: Köln. */
    'core.won': { cityName?: string; next?: string };
  }
}

const MODES: { mode: GameMode; title: string; text: string; icon: string; color: 'green' | 'red' }[] = [
  {
    mode: 'normal',
    title: 'Normal',
    text: 'Nach einem Game Over darfst du einen älteren Spielstand laden.',
    icon: 'shieldCheck',
    color: 'green',
  },
  {
    mode: 'hardcore',
    title: 'Hardcore',
    text: 'Bei Game Over wird der Spielstand gelöscht. Keine zweite Chance.',
    icon: 'skull',
    color: 'red',
  },
];

export function NewGameDialog(props: { firstStart?: boolean; fromSaves?: boolean }) {
  const runtime = useRuntime();
  const [mode, setMode] = useState<GameMode>('normal');
  const start = () => {
    runtime.session.newGame(mode);
    // Auftrag 46b: Im Modus normal führt das Tutorial durch Köln (Hardcore: alles frei).
    if (mode === 'normal') runtime.session.dispatch({ type: 'tutorial.start', payload: {} });
    runtime.api.closeDialog();
    runtime.api.closePanel();
    runtime.api.closePhone();
    runtime.api.setSpeed(1);
  };
  // Aus den Spielständen geöffnet: Abbrechen führt dorthin zurück, nicht auf die Karte (N7).
  const close = props.firstStart
    ? undefined
    : props.fromSaves
      ? () => runtime.api.openDialog('core.saves', {})
      : runtime.api.closeDialog;
  return (
    <Dialog
      title="Neues Spiel"
      kicker="Köln Tycoon · Neuer Durchgang"
      icon="target"
      onClose={close}
      actions={
        <>
          {close && <Button onClick={close}>Abbrechen</Button>}
          <Button variant="primary" onClick={start}>
            Los geht's
          </Button>
        </>
      }
    >
      <p class="newgame__intro">
        <IconChip icon="moneyBag" color="yellow" size="md" />
        <span>Köln, Freitagabend. Du hast 1.500 € und ein bisschen Ware. Mach was draus.</span>
      </p>
      <div class="mode-choice" role="radiogroup" aria-label="Modus">
        {MODES.map((m) => (
          <label key={m.mode} class={`mode-choice__option ${mode === m.mode ? 'is-active' : ''}`}>
            <input type="radio" name="mode" checked={mode === m.mode} onChange={() => setMode(m.mode)} />
            <IconChip icon={m.icon} color={m.color} size="lg" />
            <strong>{m.title}</strong>
            <span>{m.text}</span>
          </label>
        ))}
      </div>
      {!props.firstStart && (
        <Hint>Das laufende Spiel wird im Autosave ersetzt. Vorher speichern, wenn du es behalten willst.</Hint>
      )}
    </Dialog>
  );
}

/** Spielstand als Datei herunterladen (Spielstände-Dialog und Einstellungen › Verlauf). */
export function exportSaveFile(runtime: UiRuntime): void {
  try {
    const file = runtime.session.exportSave();
    download(file.filename, file.content);
  } catch (error) {
    runtime.api.toast(error instanceof Error ? error.message : 'Das hat nicht geklappt.', 'bad', { log: false });
  }
}

function download(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function describe(info: SaveInfo | undefined, unreadable: boolean): string {
  if (!info) return unreadable ? 'unlesbar (beschädigt oder neuere Version)' : 'leer';
  const mode = info.mode === 'hardcore' ? ' · Hardcore' : '';
  return `${clock.formatLong(info.time)}${mode}${info.gameOver ? ' · Game Over' : ''}`;
}

export function SavesDialog() {
  const runtime = useRuntime();
  const { session, api } = runtime;
  const [version, refresh] = useState(0);
  // version erzwingt das Neulesen nach Speichern oder Löschen.
  const saves = useMemo(() => session.listSaves(), [session, version]);
  const bySlot = new Map(saves.map((s) => [s.slot, s]));
  // Plätze mit Daten, die das Spiel nicht lesen kann, nicht als leer zeigen (Speichern sichert sie vorher).
  const unreadable = useMemo(
    () =>
      new Set(
        [AUTOSAVE_SLOT, ...MANUAL_SLOTS].filter(
          (slot) => !saves.some((s) => s.slot === slot) && session.saves.unreadable(slot),
        ),
      ),
    [session, saves],
  );
  const hasGame = session.state !== null && !session.sim?.isOver;

  const guard = (fn: () => void, success: string) => () => {
    try {
      fn();
      api.toast(success, 'good');
      refresh((n) => n + 1);
    } catch (error) {
      api.toast(error instanceof Error ? error.message : 'Das hat nicht geklappt.', 'bad');
    }
  };
  const loadAndClose = (slot: string) =>
    guard(() => {
      session.load(slot);
      api.closePanel();
      api.closeDialog();
    }, 'Spielstand geladen.');

  const [importError, setImportError] = useState<string | null>(null);
  const [loadingTest, setLoadingTest] = useState<string | null>(null);
  const onTestSave = (id: string) => {
    setImportError(null);
    setLoadingTest(id);
    loadTestSave(session, id)
      .then((info) => {
        api.closePanel();
        api.closeDialog();
        api.toast(`Test-Spielstand "${info.title}" geladen.`, 'good');
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Laden fehlgeschlagen.';
        setImportError(message);
        api.toast(message, 'bad');
      })
      .finally(() => setLoadingTest(null));
  };
  const onImport = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImportError(null);
    file
      .text()
      .then((text) => {
        session.importSave(text);
        api.closePanel();
        api.closeDialog();
        api.toast('Spielstand importiert.', 'good');
      })
      .catch((error) => {
        // Der Fehler gehört in den Dialog: Das Banner liegt am Desktop unter dem Schleier des Dialogs.
        const message = error instanceof SaveError ? error.message : 'Import fehlgeschlagen.';
        setImportError(message);
        api.toast(message, 'bad');
      })
      .finally(() => {
        // Dieselbe Datei muss sich noch einmal wählen lassen (sonst löst onChange nicht aus).
        input.value = '';
      });
  };

  return (
    <Dialog title="Spielstände" icon="save" onClose={api.closeDialog} size="wide">
      <List>
        {[AUTOSAVE_SLOT, ...MANUAL_SLOTS].map((slot, i) => {
          const info = bySlot.get(slot);
          return (
            <ListItem
              key={slot}
              aside={
                <div class="ui-segmented">
                  {slot !== AUTOSAVE_SLOT && (
                    <Button small disabled={!hasGame} onClick={guard(() => session.save(slot), 'Gespeichert.')}>
                      Speichern
                    </Button>
                  )}
                  <Button small disabled={!info} onClick={loadAndClose(slot)}>
                    Laden
                  </Button>
                  {slot !== AUTOSAVE_SLOT && (
                    <Button
                      small
                      variant="danger"
                      disabled={!info}
                      onClick={guard(() => session.deleteSave(slot), 'Gelöscht.')}
                    >
                      Löschen
                    </Button>
                  )}
                </div>
              }
            >
              <strong>{slot === AUTOSAVE_SLOT ? 'Autosave' : `Speicherplatz ${i}`}</strong>
              <div class="ui-hint">{describe(info, unreadable.has(slot))}</div>
            </ListItem>
          );
        })}
      </List>
      <h3 class="saves-heading">Test-Spielstände</h3>
      {TEST_SAVE_PHASES.map((phase) => {
        const saves = TEST_SAVE_FILES.filter((t) => t.phase === phase.id);
        return (
          <Group
            key={phase.id}
            title={phase.title}
            icon={phase.icon}
            color={phase.color}
            count={saves.length}
            collapsible
            open={false}
            class="saves-phase"
          >
            <List>
              {saves.map((t) => (
                <ListItem
                  key={t.id}
                  aside={
                    <Button small disabled={loadingTest !== null} onClick={() => onTestSave(t.id)}>
                      {loadingTest === t.id ? 'Lädt …' : 'Laden'}
                    </Button>
                  }
                >
                  <strong>{t.title}</strong>
                  <div class="ui-hint">{t.text}</div>
                </ListItem>
              ))}
            </List>
          </Group>
        );
      })}
      <Hint>
        Vom Bot gespielt, zum Ausprobieren. Laden überschreibt den Autosave und zählt nicht für die Bestenliste.
      </Hint>
      <div class="saves-actions">
        <Button disabled={!session.state} onClick={() => exportSaveFile(runtime)}>
          Exportieren
        </Button>
        <label class="ui-button">
          Importieren
          <input type="file" accept="application/json,.json" hidden onChange={onImport} />
        </label>
        <Button variant="primary" onClick={() => api.openDialog('core.newGame', { fromSaves: true })}>
          Neues Spiel
        </Button>
      </div>
      {importError && <Hint icon="alert">{importError}</Hint>}
    </Dialog>
  );
}

/** Kennzahlen des Spiels für den Ergebnis-Bildschirm, einzeln einfahrend. */
function EndingStats(props: { state: GameState | null }) {
  const state = props.state;
  if (!state) return null;
  const rows: { id: string; icon: string; label: string; value: string }[] = [];
  for (const stat of gameStats.list()) {
    try {
      rows.push({ id: stat.id, icon: stat.icon, label: stat.label, value: stat.value(state) });
    } catch (error) {
      console.error(`Kennzahl "${stat.id}"`, error);
    }
  }
  if (rows.length === 0) return null;
  return (
    <ul class="ending-stats">
      {rows.map((r, i) => (
        <li key={r.id} style={{ '--i': i }}>
          <Icon name={r.icon} />
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </li>
      ))}
    </ul>
  );
}

export function GameOverDialog() {
  const runtime = useRuntime();
  const { session, api } = runtime;
  const autosave = useMemo(() => session.saves.read(AUTOSAVE_SLOT), [session]);
  const over = session.state?.outcome.gameOver;
  if (!over) return null;
  const hardcore = session.state?.meta.mode === 'hardcore';
  const canContinue = !hardcore && autosave && !autosave.state.outcome.gameOver;
  const killed = over.reason === 'killed';
  return (
    <Dialog
      title="Game Over"
      icon="skull"
      tone="bad"
      kicker={clock.formatLong(over.time)}
      class="ui-dialog--ending"
      actions={
        <>
          {!hardcore && (
            <Button icon="save" onClick={() => api.openDialog('core.saves', {})}>
              Spielstand laden
            </Button>
          )}
          {canContinue && (
            <Button
              icon="undo"
              onClick={() => {
                session.load(AUTOSAVE_SLOT);
                api.closeDialog();
              }}
            >
              Letzter Autosave
            </Button>
          )}
          <Button variant="primary" icon="refresh" onClick={() => api.openDialog('core.newGame', { firstStart: true })}>
            Neues Spiel
          </Button>
        </>
      }
    >
      <div class="ending">
        <Stamp tone="bad" size="lg" rotate={-7} icon={killed ? 'skull' : 'wallet'} class="ending__stamp">
          {killed ? 'Erledigt' : 'Pleite'}
        </Stamp>
        <p class="ending__reason">{over.detail ?? GAME_OVER_TEXT[over.reason]}</p>
        <EndingStats state={session.state} />
        <Slot name="core.ending" props={{ kind: 'over' }} />
        <Hint>
          {hardcore ? 'Hardcore: Dein Spielstand wurde gelöscht.' : 'Du kannst einen älteren Spielstand laden.'}
        </Hint>
      </div>
    </Dialog>
  );
}

export function WonDialog(props: { cityName?: string; next?: string }) {
  const { api, session } = useRuntime();
  const city = props.cityName ?? 'Köln';
  return (
    <Dialog
      title={`${city} komplett`}
      icon="crown"
      kicker="Stadt übernommen"
      class="ui-dialog--won"
      onClose={api.closeDialog}
      actions={
        <Button variant="success" icon="play" onClick={api.closeDialog}>
          Weiter
        </Button>
      }
    >
      <Confetti />
      <div class="ending">
        <Stamp tone="accent" size="lg" rotate={-5} icon="crown" class="ending__stamp">
          Komplett
        </Stamp>
        <p class="ending__reason">
          Alle Veedel in {city} hören auf dein Kommando. {props.next ?? 'Das Spiel geht im Endlosmodus weiter.'}
        </p>
        <EndingStats state={session.state} />
        <Slot name="core.ending" props={{ kind: 'won' }} />
      </div>
    </Dialog>
  );
}
