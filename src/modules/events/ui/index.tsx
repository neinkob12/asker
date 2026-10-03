// Oberfläche der Stadt-Events (Auftrag 30, Etappe 7): Chip über der Karte, solange in der aktiven Stadt ein Event läuft
// (Glas-Karte mit Wirkung und Ende), und in den Revieren der Abschnitt "Stadtleben" mit den nächsten Terminen und dem
// Charakter der Stadt (Klüngel bzw. kühl und korrekt).

import { clock, type GameState, MINUTES_PER_DAY } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Card,
  type ChipSpec,
  Chips,
  Disclosure,
  Group,
  HudPill,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerHudItem,
  registerSlot,
  useGame,
} from '../../../ui';
import { activeCity, bribeFactor, cityName, relationFactor } from '../../city';
import { saleInfluenceFactor } from '../../territory';
import { activeEvents, type CityEventDef, eventEnd, getEventDef, upcomingEvents } from '../index';
import './events.css';
import { eventsLayer } from './map';

const percent = (factor: number) => `${factor > 1 ? '+' : '−'}${Math.round(Math.abs(factor - 1) * 100)} %`;

/** Wirkung als Chips (keine Aufzählung mit Punkten). */
function effectChips(def: CityEventDef): ChipSpec[] {
  const e = def.effects;
  const chips: ChipSpec[] = [];
  if (e.demand) {
    chips.push({
      label: `Kundschaft × ${factorText(e.demand)}`,
      icon: 'users',
      color: e.demand > 1 ? 'money' : 'warn',
    });
  }
  if (e.checks)
    chips.push({ label: `Kontrollen ${percent(e.checks)}`, icon: 'siren', color: e.checks > 1 ? 'danger' : 'law' });
  if (e.heatPerSale) chips.push({ label: `Heat ${percent(e.heatPerSale)}`, icon: 'flame', color: 'law' });
  if (e.noRaids) chips.push({ label: 'keine Razzien', icon: 'shieldCheck', color: 'money' });
  if (e.gangRaids) chips.push({ label: `Überfälle ${percent(e.gangRaids)}`, icon: 'swords', color: 'danger' });
  return chips;
}

/** "noch 3 Tage" bzw. "bis 22:00". */
function remaining(state: GameState, def: CityEventDef): string {
  const end = eventEnd(def, state.time);
  const minutes = end - state.time;
  if (minutes > MINUTES_PER_DAY) return `noch ${Math.ceil(minutes / MINUTES_PER_DAY)} Tage`;
  return `bis ${clock.formatTime(end)}`;
}

const factorText = (factor: number) => String(factor).replace('.', ',');

function EventChip() {
  const { state } = useGame();
  const running = activeEvents(state, activeCity(state)).filter(
    (e) => e.effects.demand !== undefined || e.effects.noRaids,
  );
  if (running.length === 0) return null;
  const [first] = running;
  return (
    <HudPill
      icon={first.icon}
      color="place"
      label={running.length > 1 ? `Event +${running.length - 1}` : 'Event'}
      value={first.name}
      title={first.text}
      details={
        <div class="events-card">
          {running.map((def) => (
            <div key={def.id} class="events-card__item">
              <strong>{def.name}</strong>
              <span class="events-card__time">{remaining(state, def)}</span>
              <p>{def.text}</p>
              <Chips items={effectChips(def)} />
            </div>
          ))}
        </div>
      }
    />
  );
}

registerHudItem({ id: 'events.chip', order: 6, placement: 'more', icon: 'party', component: EventChip });

/** Charakter der Stadt (Klüngel bzw. kühl und korrekt), Werte aus CITIES. */
function characterText(cityId: string): { title: string; text: string } {
  const relation = relationFactor(cityId);
  const bribe = bribeFactor(cityId);
  const share = Math.round(Math.abs(1 - bribe) * 100);
  if (relation > 1) {
    return {
      title: 'Kölscher Klüngel',
      text:
        `Hier kennt jeder jeden: Vertrauen bei Lieferanten und Beziehungen zu Gangs wachsen schneller ` +
        `(× ${factorText(relation)}), Freikaufen und Kaution kosten ${share} % weniger, und dein Kontakt bei der ` +
        'Polizei warnt öfter vor Razzien.',
    };
  }
  const influence = saleInfluenceFactor(cityId);
  return {
    title: 'Kühl und korrekt',
    text:
      `Gefallen gibt es nur gegen Bezahlung: Vertrauen und Beziehungen wachsen langsamer (× ${factorText(relation)}), ` +
      `Freikaufen und Kaution kosten ${share} % mehr.` +
      (influence < 1
        ? ` Und die Gangs sitzen fester: Ein Verkauf bringt hier nur ${Math.round(influence * 100)} % Einfluss.`
        : ''),
  };
}

function CityLife() {
  const { state } = useGame();
  const cityId = activeCity(state);
  const next = upcomingEvents(state, cityId, 21);
  const character = characterText(cityId);
  return (
    <Card
      title="Stadtleben"
      icon="calendar"
      color="place"
      summary={next.find((e) => e.running)?.def.name ?? cityName(cityId)}
    >
      <Group title="Feste und Spiele" icon="party" color="place" count={next.length}>
        {next.length === 0 ? (
          <p class="ui-hint">In den nächsten drei Wochen steht nichts an.</p>
        ) : (
          <List>
            {next.map(({ def, start, running }) => (
              <ListItem
                key={`${def.id}-${start}`}
                value={running ? remaining(state, def) : `${clock.weekdayName(start, true)}, Tag ${clock.day(start)}`}
              >
                <ItemContent
                  icon={def.icon}
                  color={running ? 'money' : 'place'}
                  title={def.name}
                  tags={effectChips(def)}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Group>
      <Disclosure label={character.title} icon="handshake">
        {character.text}
      </Disclosure>
    </Card>
  );
}

registerSlot('tab:territory', { id: 'events.cityLife', title: 'Stadtleben', order: 25, component: CityLife });

// Start eines Events: still in den Verlauf (Routine), die Ankündigung kam schon per Handy.
onGameEvent('events.started', 'events.startedToast', (payload, ui) => {
  ui.toast(`${getEventDef(payload.eventId)?.name ?? 'Event'} in ${cityName(payload.cityId)}.`, 'info');
});

registerMapLayer(eventsLayer);
