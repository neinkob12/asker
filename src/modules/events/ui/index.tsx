// Oberfläche der Stadt-Events (Auftrag 30, Etappe 7): Chip über der Karte, solange in der aktiven Stadt ein Event läuft
// (Glas-Karte mit Wirkung und Ende), und in den Revieren der Abschnitt "Stadtleben" mit den nächsten Terminen und dem
// Charakter der Stadt (Klüngel bzw. kühl und korrekt).

import { useEffect } from 'preact/hooks';
import { clock, type GameState, MINUTES_PER_DAY } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Button,
  Card,
  type ChipSpec,
  Chips,
  Disclosure,
  Group,
  HudPill,
  IconChip,
  ItemContent,
  List,
  ListItem,
  MapDialog,
  onGameEvent,
  popupMayOpen,
  registerDialog,
  registerHudItem,
  registerSlot,
  useGame,
  useIsMobile,
  useUi,
} from '../../../ui';
import { activeCity, bribeFactor, cityName, relationFactor } from '../../city';
import { saleInfluenceFactor } from '../../territory';
import { tutorialAllows } from '../../tutorial';
import { veedelName } from '../../veedel';
import {
  activeEvents,
  CITY_EVENTS,
  type CityEventDef,
  eventDemand,
  eventEnd,
  getEventDef,
  nextEventStart,
  upcomingEvents,
} from '../index';
import './events.css';
import { eventsLayer } from './map';

declare module '../../../ui' {
  interface DialogRegistry {
    /** Pop-up zum Start eines Stadt-Events (Auftrag 46e). */
    'events.started': { eventId: string };
  }
}

const percent = (factor: number) => `${factor > 1 ? '+' : '−'}${Math.round(Math.abs(factor - 1) * 100)} %`;

/** Wirkung als Chips (keine Aufzählung mit Punkten). */
function effectChips(def: CityEventDef): ChipSpec[] {
  const e = def.effects;
  const chips: ChipSpec[] = [];
  if (e.demand) {
    const demand = eventDemand(def);
    chips.push({
      label: `Kundschaft × ${factorText(demand)}`,
      icon: 'users',
      color: demand > 1 ? 'money' : 'warn',
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
  const soon = upcomingEvents(state, cityId, 21);
  // Große Feste (Zyklus, z.B. Wiesn) stehen auch drin, wenn sie weiter weg sind (Auftrag 43, L8).
  const later = CITY_EVENTS.filter(
    (def) => def.cityId === cityId && def.schedule.kind === 'cycle' && !soon.some((e) => e.def.id === def.id),
  )
    .map((def) => ({ def, start: nextEventStart(def, state.time), running: false }))
    .filter((e): e is { def: CityEventDef; start: number; running: false } => e.start !== null);
  const next = [...soon, ...later];
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

// --- Pop-up zum Start (Auftrag 46e): statt der Nachricht vom Kiosk ein Glas-Dialog mit „Ware bestellen“ ---

/** Ein Satz, was das Event fürs Geschäft heißt (mehr Kunden, höhere Preise, mehr Polizei). */
function meaning(def: CityEventDef): string {
  const demand = eventDemand(def);
  const parts: string[] = [];
  if (demand > 1) parts.push(`${factorText(demand)}-mal so viel Kundschaft`);
  if (demand < 1) parts.push('weniger Kundschaft');
  if (def.effects.checks && def.effects.checks > 1) parts.push('mehr Kontrollen');
  if (def.effects.checks && def.effects.checks < 1) parts.push('weniger Kontrollen');
  if (def.effects.noRaids) parts.push('keine Razzien');
  if (def.effects.gangRaids && def.effects.gangRaids > 1) parts.push('Gangs unterwegs');
  if (parts.length === 0) return def.text;
  const where = def.area.veedel ? def.area.veedel.map(veedelName).join(', ') : 'an den Spots im Gebiet';
  return `${where}: ${parts.join(', ')}.`;
}

function EventStartDialog(props: { eventId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const def = getEventDef(props.eventId);
  if (!def) return null;
  const close = () => ui.closeDialog();
  const order = () => {
    ui.closeDialog();
    ui.openPhone('suppliers.app');
  };
  const demand = eventDemand(def);
  return (
    <MapDialog label={def.name} onClose={close} class="events-start" detent="medium">
      <div class="events-start__head">
        <IconChip icon={def.icon} color="place" size="lg" />
        <div class="events-start__title">
          <p class="events-start__kicker">Stadt-Event · {remaining(state, def)}</p>
          <h2 class="events-start__name">{def.name}</h2>
        </div>
      </div>
      <p class="events-start__line">{meaning(def)}</p>
      <Chips items={effectChips(def)} />
      <div class="events-start__actions">
        {demand > 1 && (
          <Button variant="primary" icon="truck" onClick={order}>
            Ware bestellen
          </Button>
        )}
        <Button variant={demand > 1 ? 'subtle' : 'primary'} onClick={close}>
          Okay
        </Button>
      </div>
    </MapDialog>
  );
}

interface PendingStart {
  runId: string;
  eventId: string;
  shown: boolean;
}

/** Starts, die noch kein Pop-up hatten (nur Oberfläche). */
const pendingStarts: PendingStart[] = [];

/** Öffnet das Pop-up zum nächsten Start, sobald der Spieler frei ist (kein Dialog, kein Menü, Handy zu am Handy-Bildschirm). */
function EventStartOpener() {
  const ui = useUi();
  const { state } = useGame();
  const mobile = useIsMobile();
  const pending = pendingStarts.find((p) => !p.shown && p.runId === state.meta.runId) ?? null;
  // Erst, wenn der Spieler frei ist (kein Dialog, kein Menü, am Handy-Bildschirm das Handy zu): popupMayOpen.
  const free = popupMayOpen(ui.state, mobile);
  useEffect(() => {
    if (!pending || !free) return;
    const timer = window.setTimeout(() => {
      if (pending.shown || !popupMayOpen(ui.state, mobile)) return;
      pending.shown = true;
      ui.openDialog('events.started', { eventId: pending.eventId });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pending, free, mobile, ui]);
  return null;
}

// Start eines Events in der Stadt, in der du bist: Pop-up (Auftrag 46e), dazu der Eintrag im Verlauf. Im Tutorial
// erst, wenn es die Lieferanten-App gibt (der Knopf „Ware bestellen“ führt dorthin); vorher stört es nur.
onGameEvent('events.started', 'events.startedToast', (payload, ui, state) => {
  ui.toast(`${getEventDef(payload.eventId)?.name ?? 'Event'} in ${cityName(payload.cityId)}.`, 'info');
  if (payload.cityId !== activeCity(state) || !tutorialAllows(state, 'app.suppliers')) return;
  pendingStarts.push({ runId: state.meta.runId, eventId: payload.eventId, shown: false });
  while (pendingStarts.length > 6) pendingStarts.shift();
});

registerDialog({ id: 'events.started', component: EventStartDialog, area: 'map', pausesGame: true, lockPhone: false });
registerSlot('map.overlay', { id: 'events.startOpener', order: 15, component: EventStartOpener });

registerMapLayer(eventsLayer);
