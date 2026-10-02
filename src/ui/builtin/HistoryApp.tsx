// Verlauf: Journal des Kerns, Meldungen der Oberfläche und die Historie der Aufträge als eine Zeitachse nach Tagen,
// mit Filter (Alles, Geld, Leute, Polizei, Gangs, Aufträge). Als Abschnitt in den Einstellungen (die letzten
// Einträge) und als eigene Seite (alles, dazu "Spielstand exportieren"). Jeder Eintrag hat eine Marke mit Symbol
// (Gutes, Ärger, Info), damit man Ärger sieht, ohne die Farbe zu brauchen. Bewusst kein Einstellungs-Look:
// keine Gruppenkästen, sondern eine durchgehende Linie mit Uhrzeiten.

import { useEffect, useState } from 'preact/hooks';
import { clock, formatEuro, type JournalKind } from '../../core';
import { Button, Empty, Icon, SegmentedControl } from '../components';
import { useRuntime } from '../hooks';
import { PhoneScreen } from '../phone/PhoneScreen';
import { exportSaveFile } from './GameDialogs';
import {
  filterHistory,
  groupByDay,
  HISTORY_FILTERS,
  type HistoryEntry,
  type HistoryFilter,
  type HistoryOrder,
  historyEntries,
} from './historyModel';

const KIND_ICONS: Record<JournalKind, string> = { good: 'checkCircle', bad: 'alertCircle', info: 'info' };
const KIND_LABELS: Record<JournalKind, string> = { good: 'Gutes', bad: 'Ärger', info: 'Info' };

/** Wie viele Einträge der Abschnitt in den Einstellungen zeigt. */
const SECTION_LIMIT = 8;

/** Alle Einträge des Verlaufs (die Aufträge liest der Kern nur als Daten aus dem Zustand von customers). */
function useHistory(): HistoryEntry[] {
  const { state, ui } = useRuntime();
  if (!state) return [];
  const customers = (state.modules as unknown as Record<string, { orders?: HistoryOrder[] } | undefined>).customers;
  return historyEntries(state, ui.alerts, customers?.orders ?? [], formatEuro);
}

function Timeline(props: { entries: HistoryEntry[]; empty: string }) {
  if (props.entries.length === 0) return <Empty icon="journal">{props.empty}</Empty>;
  return (
    <div class="journal">
      {groupByDay(props.entries).map((group) => (
        <section key={group.day} class="journal__day">
          <h3 class="journal__day-head">
            {clock.weekdayName(group.time)} · Tag {group.day}
          </h3>
          <ol class="journal__list">
            {group.entries.map((e) => (
              <li key={e.key} class={`journal__entry journal__entry--${e.kind}`}>
                <time class="journal__time">{clock.formatTime(e.time)}</time>
                <span class="journal__mark" role="img" aria-label={KIND_LABELS[e.kind]}>
                  <Icon name={KIND_ICONS[e.kind]} />
                </span>
                <p class="journal__text">{e.text}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Filter(props: { value: HistoryFilter; onChange: (f: HistoryFilter) => void }) {
  return (
    <SegmentedControl
      wide
      aria-label="Rubrik"
      options={HISTORY_FILTERS}
      value={props.value}
      onChange={props.onChange}
    />
  );
}

/** Abschnitt in den Einstellungen: die letzten Einträge, Filter, Weg zur ganzen Seite und zum Export. */
export function HistorySection() {
  const runtime = useRuntime();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const entries = filterHistory(useHistory(), filter);
  return (
    <div class="history-section">
      <Filter value={filter} onChange={setFilter} />
      <Timeline
        entries={entries.slice(0, SECTION_LIMIT)}
        empty={filter === 'all' ? 'Noch nichts passiert.' : 'Dazu gibt es keine Einträge.'}
      />
      <div class="history-section__actions">
        <Button icon="list" onClick={() => runtime.api.openPhone('core.history')}>
          {entries.length > SECTION_LIMIT ? `Alle ${entries.length} Einträge` : 'Verlauf öffnen'}
        </Button>
        <Button icon="download" onClick={() => exportSaveFile(runtime)}>
          Spielstand exportieren
        </Button>
      </div>
    </div>
  );
}

/** Eigene Seite mit allem (öffnet sich aus den Einstellungen, dem Menü über der Karte und von Banner-Meldungen). */
export function HistoryApp() {
  const runtime = useRuntime();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const entries = filterHistory(useHistory(), filter);
  // Beim Verlassen gelten die Meldungen als gelesen (der Zähler am Menü verschwindet).
  useEffect(() => () => runtime.api.markAlertsRead(), [runtime]);
  return (
    <PhoneScreen
      title="Verlauf"
      actions={
        <Button small variant="subtle" icon="download" onClick={() => exportSaveFile(runtime)}>
          Exportieren
        </Button>
      }
    >
      <div class="history-page">
        <Filter value={filter} onChange={setFilter} />
        <Timeline
          entries={entries}
          empty={filter === 'all' ? 'Noch nichts passiert.' : 'Dazu gibt es keine Einträge.'}
        />
      </div>
    </PhoneScreen>
  );
}
