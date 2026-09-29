// Ereignisse: das Journal des Kerns als Zeitachse, nach Tagen gegliedert. Jeder Eintrag hat eine Marke mit Symbol
// (Gutes, Ärger, Info), damit man Ärger sieht, ohne die Farbe zu brauchen. Bewusst kein Einstellungs-Look:
// keine Gruppenkästen, sondern eine durchgehende Linie mit Uhrzeiten.

import { useState } from 'preact/hooks';
import { clock, type JournalKind, journal } from '../../core';
import { Empty, Icon, SegmentedControl } from '../components';
import { useGame } from '../hooks';
import { groupByDay } from './journalModel';

const KIND_ICONS: Record<JournalKind, string> = { good: 'checkCircle', bad: 'alertCircle', info: 'info' };
const KIND_LABELS: Record<JournalKind, string> = { good: 'Gutes', bad: 'Ärger', info: 'Info' };

type Filter = 'all' | 'good' | 'bad';

/** Das Ereignis-Log (Journal des Kerns). */
export function JournalTab() {
  const { state } = useGame();
  const [filter, setFilter] = useState<Filter>('all');
  const entries = journal.entries(state);
  const bad = entries.filter((e) => e.kind === 'bad').length;
  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
  return (
    <div class="journal">
      <SegmentedControl
        wide
        aria-label="Filter"
        options={[
          { value: 'all' as Filter, label: 'Alle' },
          { value: 'good' as Filter, label: 'Gutes' },
          { value: 'bad' as Filter, label: 'Ärger', badge: bad },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {shown.length === 0 && (
        <Empty icon="newspaper">
          {entries.length === 0 ? 'Noch nichts passiert.' : 'Dazu gibt es keine Einträge.'}
        </Empty>
      )}
      {groupByDay(shown).map((group) => (
        <section key={group.day} class="journal__day">
          <h3 class="journal__day-head">
            {clock.weekdayName(group.time)} · Tag {group.day}
          </h3>
          <ol class="journal__list">
            {group.entries.map((e) => (
              <li key={e.id} class={`journal__entry journal__entry--${e.kind}`}>
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
