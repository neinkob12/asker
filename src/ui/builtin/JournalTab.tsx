import { clock, journal } from '../../core';
import { Card, Empty } from '../components';
import { useGame } from '../hooks';

/** Das Ereignis-Log (Journal des Kerns). */
export function JournalTab() {
  const { state } = useGame();
  const entries = journal.entries(state);
  return (
    <Card title="Ereignisse" class="journal">
      {entries.length === 0 && <Empty>Noch nichts passiert.</Empty>}
      <ul class="journal__list">
        {entries.map((e) => (
          <li key={e.id} class={`journal__entry journal__entry--${e.kind}`}>
            <time>{clock.formatTime(e.time)}</time> {e.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
