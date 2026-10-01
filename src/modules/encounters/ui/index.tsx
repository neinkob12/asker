// Oberfläche der Konfrontationen im Look "Glas" mit leichtem Noir-Anteil: eine Akte über der Kartenfläche (nicht
// über dem Handy; das ist solange abgedunkelt und gesperrt, das Spiel pausiert). Am Handy-Bildschirm dieselbe Akte als
// Blatt (Sheet, große Höhe). Ablauf: Briefing "Wie gehst du vor?" mit den Wegen des Anlasses (selbst hin, Leute machen
// lassen, Verstärkung, freikaufen, Bullen rufen, Spot räumen), dann Runden mit Handlungen, am Ende ein Stempel.
// Dazu eine Warnung im HUD, falls eine Konfrontation offen ist, die Akte aber nicht (z.B. nach dem Laden).
// Die Schriften DM Serif Display und Courier Prime gibt es nur hier (--font-file*).

import type { ComponentChildren } from 'preact';
import { formatAmount, formatEuro, formatPercent, type GameState } from '../../../core';
import { mapEffects } from '../../../map';
import {
  Avatar,
  Button,
  Icon,
  onGameEvent,
  registerDialog,
  registerHudItem,
  Sheet,
  soundOnEvent,
  useGame,
  useIsMobile,
  useUi,
} from '../../../ui';
import { getSpot } from '../../spots';
import { getVeedel, veedelName } from '../../veedel';
import {
  actionChance,
  activeEncounters,
  availableActions,
  BACKUP_MAX_PEOPLE,
  type BriefingOption,
  briefingOptions,
  ENCOUNTER_KINDS,
  type Encounter,
  type EncounterMode,
  getEncounter,
  getEncounterAction,
  type Participant,
  pendingEncounter,
} from '../index';
import './island';
import './encounters.css';

declare module '../../../ui' {
  interface DialogRegistry {
    'encounters.encounter': { encounterId: number };
  }
}

function edgeText(edge: number): string {
  if (edge >= 75) return 'Ihr habt die Oberhand';
  if (edge >= 50) return 'Offen, leicht für euch';
  if (edge >= 30) return 'Es kippt';
  return 'Kurz vorm Verlieren';
}

function conditionText(p: Participant): string {
  if (p.killed) return 'tot';
  if (p.condition === 'down') return 'außer Gefecht';
  if (p.condition === 'injured') return 'verletzt';
  return 'fit';
}

/** Ort ohne Präposition, z.B. "Neumarkt" statt "am Neumarkt". */
function placeName(state: GameState, encounter: Encounter): string {
  const spot = encounter.request.spotId ? getSpot(state, encounter.request.spotId) : undefined;
  if (spot) return spot.name;
  if (encounter.request.veedelId) return veedelName(encounter.request.veedelId);
  return encounter.place.replace(/^(am|an der|in der|im|in|auf der)\s+/i, '');
}

/** Reiter der Akte: "Akte 0912 · Neumarkt · Runde 1 von 5". */
function fileTab(state: GameState, encounter: Encounter): string {
  const number = String(encounter.id % 10000).padStart(4, '0');
  const stage =
    encounter.phase === 'briefing'
      ? 'Briefing'
      : encounter.phase === 'done'
        ? 'Abgeschlossen'
        : `Runde ${Math.min(encounter.round + 1, encounter.maxRounds)} von ${encounter.maxRounds}`;
  return `Akte ${number} · ${placeName(state, encounter)} · ${stage}`;
}

function stakesText(encounter: Encounter): string | null {
  const stakes = encounter.request.stakes;
  if (!stakes || (!stakes.money && !stakes.goods)) return null;
  const parts: string[] = [];
  if (stakes.money) parts.push(formatEuro(stakes.money));
  if (stakes.goods) parts.push(formatAmount(stakes.goods));
  return parts.join(' und ');
}

// ---------------------------------------------------------------------------------------------
// Kopf: Kicker, Titel, Lage, Polaroids

function Polaroid(props: { side: 'own' | 'foe'; name: string; caption: ComponentChildren; avatar: ComponentChildren }) {
  return (
    <figure class={`enc-polaroid enc-polaroid--${props.side}`}>
      <div class="enc-polaroid__photo">{props.avatar}</div>
      <figcaption>
        <strong>{props.name}</strong>
        <span>{props.caption}</span>
      </figcaption>
    </figure>
  );
}

function Head(props: { encounter: Encounter }) {
  const { encounter } = props;
  const kind = ENCOUNTER_KINDS[encounter.kind];
  const stakes = stakesText(encounter);
  const lead = encounter.participants.find((p) => p.isPlayer) ?? encounter.participants[0];
  const others = encounter.participants.length - (lead ? 1 : 0);
  const o = encounter.opponent;
  return (
    <header class="enc-head">
      <div class="enc-head__text">
        <p class="enc-kicker">
          Konfrontation ·{' '}
          {stakes
            ? `Einsatz ${stakes}`
            : encounter.request.veedelId
              ? veedelName(encounter.request.veedelId)
              : encounter.place}
        </p>
        <h2 class="enc-title" id="enc-title">
          {kind?.name ?? 'Konfrontation'}
        </h2>
        <p class="enc-situation">{encounter.situation}</p>
      </div>
      <div class="enc-polaroids">
        <Polaroid
          side="own"
          name={lead ? (lead.isPlayer ? 'Du' : lead.name.split(' ')[0]) : 'Niemand'}
          avatar={
            <Avatar name={lead?.isPlayer ? 'Du' : (lead?.name ?? '?')} image={lead?.isPlayer ? 'user' : undefined} />
          }
          caption={
            lead ? (
              <>
                {conditionText(lead)} · Kraft {lead.stats.strength}
                {others > 0 ? ` · +${others}` : ''}
              </>
            ) : (
              'keiner vor Ort'
            )
          }
        />
        <span class="enc-vs" aria-hidden="true">
          VS
        </span>
        <Polaroid
          side="foe"
          name={o.label.replace(/^(Die|Der|Das)\s+/, '')}
          avatar={<Icon name="skull" />}
          caption={
            <>
              {o.count} von {o.startCount} · Kraft {o.strength}
            </>
          }
        />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------------------------
// Kräftebalken

function Forces(props: { encounter: Encounter }) {
  const { encounter } = props;
  const edge = Math.round(encounter.edge);
  const present = encounter.participants.some((p) => p.isPlayer && p.condition !== 'down');
  return (
    <section class="enc-forces" aria-label="Kräfteverhältnis">
      <div class="enc-forces__labels">
        <span class="enc-forces__own">Deine Seite {edge} %</span>
        <span class="enc-forces__edge">{edgeText(edge)}</span>
        <span class="enc-forces__foe">
          {encounter.opponent.label} {100 - edge} %
        </span>
      </div>
      <div class="enc-forces__bar" aria-hidden="true">
        <span class="enc-forces__fill" style={{ width: `${edge}%` }} />
      </div>
      {encounter.phase !== 'briefing' && (
        <p class="enc-forces__where">
          <Icon name={present ? 'pin' : 'phone'} />
          {present ? 'Du bist vor Ort' : 'Du gibst Anweisungen per Handy'}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Briefing: Wie gehst du vor?

interface ModeView {
  icon: string;
  title: string;
  tag: (o: BriefingOption) => string;
  tone: 'danger' | 'money' | 'dirty' | 'place' | 'warn';
  text: (encounter: Encounter, state: GameState) => string;
}

const MODES: Record<EncounterMode, ModeView> = {
  self: {
    icon: 'swords',
    title: 'Selbst hin',
    tag: () => 'Tod möglich',
    tone: 'danger',
    text: () => 'Du fährst hin. Bessere Chancen und alle Handlungen, aber es kann dich erwischen.',
  },
  crew: {
    icon: 'shieldCheck',
    title: 'Leute machen lassen',
    tag: () => 'Sicher',
    tone: 'money',
    text: (e) =>
      e.participants.length > 0
        ? 'Du bleibst weg und gibst Anweisungen per Handy. Weniger Handlungen.'
        : 'Niemand von euch ist dort. Die Sache läuft ohne dich.',
  },
  backup: {
    icon: 'users',
    title: 'Verstärkung schicken',
    tag: (o) => `−${formatEuro(o.cost)}`,
    tone: 'dirty',
    text: () => `Bis zu ${BACKUP_MAX_PEOPLE} freie Leute fahren hin. Ihr startet stärker, du bleibst weg.`,
  },
  payoff: {
    icon: 'moneyBag',
    title: 'Sofort freikaufen',
    tag: (o) => `−${formatEuro(o.cost)}`,
    tone: 'dirty',
    text: () => 'Ein Umschlag, sie ziehen ab. Sicher, aber sie nehmen dich danach weniger ernst.',
  },
  tipoff: {
    icon: 'siren',
    title: 'Anonym die Bullen rufen',
    tag: () => '+ Heat',
    tone: 'place',
    text: (e) =>
      `Blaulicht ${e.place}, alle rennen. Heat im Veedel steigt, etwas Ware bleibt bei der Durchsuchung liegen.`,
  },
  abandon: {
    icon: 'bag',
    title: 'Ware retten, Spot räumen',
    tag: () => 'Ware weg',
    tone: 'warn',
    text: () => 'Ihr packt die Ware ein und verschwindet. Die Kasse bleibt liegen.',
  },
};

function Briefing(props: { encounter: Encounter }) {
  const { state, dispatch } = useGame();
  const { encounter } = props;
  const options = briefingOptions(state, encounter);
  const join = (mode: EncounterMode) =>
    dispatch({ type: 'encounters.join', payload: { encounterId: encounter.id, mode } });
  return (
    <section class="enc-brief">
      <h3 class="enc-question">Wie gehst du vor?</h3>
      <div class="enc-grid">
        {options.map((option) => {
          const view = MODES[option.mode];
          return (
            <button
              key={option.mode}
              type="button"
              class={`enc-way is-${view.tone}`}
              disabled={!option.ok}
              onClick={() => join(option.mode)}
              title={option.ok ? undefined : option.reason}
            >
              <span class="enc-way__top">
                <Icon name={view.icon} class="enc-way__icon" />
                <span class="enc-way__tag">{view.tag(option)}</span>
              </span>
              <strong class="enc-way__title">{view.title}</strong>
              <span class="enc-way__text">{option.ok ? view.text(encounter, state) : option.reason}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Runden

const ACTION_ICONS: Record<string, string> = {
  fight: 'fist',
  intimidate: 'megaphone',
  hold: 'shield',
  negotiate: 'handshake',
  bribe: 'moneyBag',
  flee: 'runner',
  dump: 'trash',
};

function Rounds(props: { encounter: Encounter }) {
  const { state, dispatch } = useGame();
  const { encounter } = props;
  const actions = availableActions(encounter);
  const act = (actionId: string) =>
    dispatch({ type: 'encounters.act', payload: { encounterId: encounter.id, actionId } });
  return (
    <section class="enc-rounds">
      <div class="enc-grid">
        {actions.map((id) => {
          const action = getEncounterAction(encounter.kind, id);
          if (!action) return null;
          const chance = actionChance(encounter, id);
          const cost = action.costsBribe ? encounter.bribeCost : 0;
          const level = chance >= 0.6 ? 'good' : chance < 0.35 ? 'bad' : 'mid';
          const broke = cost > state.wallet.dirty;
          return (
            <button key={id} type="button" class={`enc-act is-${level}`} disabled={broke} onClick={() => act(id)}>
              <span class="enc-act__top">
                <Icon name={ACTION_ICONS[id] ?? 'bolt'} class="enc-act__icon" />
                <span class="enc-act__chance">{formatPercent(chance)}</span>
              </span>
              <strong class="enc-act__title">{action.label}</strong>
              <span class="enc-act__bar" aria-hidden="true">
                <span style={{ width: `${Math.round(chance * 100)}%` }} />
              </span>
              <span class="enc-act__hint">{action.hint}</span>
              {cost > 0 && <span class="enc-act__cost">Kostet {formatEuro(cost)}</span>}
            </button>
          );
        })}
      </div>
      {!encounter.playerPresent && (
        <button
          type="button"
          class="enc-auto"
          onClick={() => dispatch({ type: 'encounters.auto', payload: { encounterId: encounter.id } })}
        >
          <Icon name="dice" /> Deine Leute entscheiden lassen (auswürfeln)
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Ergebnis und Verlauf

function Result(props: { encounter: Encounter; onClose: () => void }) {
  const { encounter } = props;
  const outcome = encounter.outcome ?? 'failure';
  const stamp =
    outcome === 'success' ? 'Erfolg' : outcome === 'retreat' ? 'Rückzug' : encounter.playerKilled ? 'Tot' : 'Verloren';
  return (
    <section class={`enc-result is-${outcome}`}>
      <span class="enc-stamp" role="img" aria-label={`Ergebnis: ${stamp}`}>
        {stamp}
      </span>
      <div class="enc-result__text">
        {encounter.playerKilled && <p class="enc-result__dead">Du bist tot.</p>}
        <p>{encounter.result?.text}</p>
        <button type="button" class="enc-close" onClick={props.onClose}>
          Akte schließen
        </button>
      </div>
    </section>
  );
}

function Log(props: { encounter: Encounter }) {
  const log = props.encounter.log;
  if (log.length === 0) return null;
  return (
    <ol class="enc-log" aria-label="Verlauf">
      {log.map((entry) => {
        const label = getEncounterAction(props.encounter.kind, entry.actionId)?.label;
        return (
          <li key={`${entry.round}-${entry.actionId}`} class={entry.success ? 'is-good' : 'is-bad'}>
            {label ? (
              <>
                Runde {entry.round}, {label} ({formatPercent(entry.chance)}) {entry.success ? '✓' : '✗'}{' '}
              </>
            ) : null}
            {entry.text}
          </li>
        );
      })}
    </ol>
  );
}

/** Inhalt der Akte (gleich für die Karte am Desktop und das Blatt am Handy-Bildschirm). */
function FileBody(props: { encounter: Encounter; onClose: () => void }) {
  const { encounter } = props;
  return (
    <div class={`enc enc--${encounter.phase}`}>
      <Head encounter={encounter} />
      <Forces encounter={encounter} />
      {encounter.phase === 'briefing' && <Briefing encounter={encounter} />}
      {encounter.phase === 'rounds' && <Rounds encounter={encounter} />}
      {encounter.phase === 'done' && <Result encounter={encounter} onClose={props.onClose} />}
      <Log encounter={encounter} />
    </div>
  );
}

function EncounterDialog(props: { encounterId: number }) {
  const { state } = useGame();
  const ui = useUi();
  const mobile = useIsMobile();
  const encounter = getEncounter(state, props.encounterId);
  const close = () => {
    const next = activeEncounters(state).find((e) => e.id !== props.encounterId);
    if (next) ui.openDialog('encounters.encounter', { encounterId: next.id });
    else ui.closeDialog();
  };
  if (mobile) {
    // Am Handy-Bildschirm: Blatt mit großer Höhe. Zuziehen legt die Akte nur weg (Warnung im HUD holt sie zurück).
    return (
      <Sheet
        open
        onClose={close}
        detents={['large']}
        initial="large"
        class="enc-sheet"
        title={encounter ? fileTab(state, encounter) : 'Konfrontation'}
      >
        {encounter ? <FileBody encounter={encounter} onClose={close} /> : <p>Diese Konfrontation ist vorbei.</p>}
      </Sheet>
    );
  }
  return (
    <div class="enc-overlay" role="dialog" aria-modal="true" aria-labelledby="enc-title">
      <div class="enc-file">
        <div class="enc-file__tab">{encounter ? fileTab(state, encounter) : 'Akte'}</div>
        <div class="enc-file__inner">
          {encounter ? (
            <FileBody encounter={encounter} onClose={close} />
          ) : (
            <div class="enc">
              <p class="enc-situation">Diese Konfrontation ist vorbei.</p>
              <button type="button" class="enc-close" onClick={close}>
                Akte schließen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Warnung im HUD, wenn eine Konfrontation auf dich wartet, die Akte aber zu ist. */
function PendingHud() {
  const { state } = useGame();
  const ui = useUi();
  const pending = pendingEncounter(state);
  if (!pending || ui.state.dialog?.id === 'encounters.encounter') return null;
  return (
    <Button
      variant="danger"
      icon="siren"
      class="enc-hud"
      onClick={() => ui.openDialog('encounters.encounter', { encounterId: pending.id })}
    >
      {ENCOUNTER_KINDS[pending.kind]?.name ?? 'Konfrontation'}
    </Button>
  );
}

registerDialog({
  id: 'encounters.encounter',
  component: EncounterDialog,
  pausesGame: true,
  dismissable: false,
  area: 'map',
});
registerHudItem({ id: 'encounters.pending', order: 50, placement: 'alert', component: PendingHud });
onGameEvent('encounter.started', 'encounters.open', (payload, ui, state) => {
  if (state.outcome.gameOver) return;
  ui.openDialog('encounters.encounter', { encounterId: payload.encounterId });
});
// Konfrontation: Warnton und ein kurzer Blitz über der Karte, bei Gewalt ein Ping am Ort.
soundOnEvent('encounter.started', 'alert');
onGameEvent('encounter.started', 'encounters.fx', (payload, _ui, state) => {
  mapEffects.flash({ strength: 0.3, color: '#ff5a4a' });
  const spot = payload.request.spotId ? getSpot(state, payload.request.spotId) : undefined;
  const where = spot ?? (payload.request.veedelId ? getVeedel(payload.request.veedelId)?.center : undefined);
  if (where) mapEffects.ping(where, { tone: 'bad' });
});
