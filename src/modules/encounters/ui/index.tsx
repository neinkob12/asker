// Oberfläche der Konfrontationen im Look "Glas" mit leichtem Noir-Anteil: eine Akte über der Kartenfläche (nicht
// über dem Handy; das ist solange abgedunkelt und gesperrt, das Spiel pausiert). Am Handy-Bildschirm dieselbe Akte als
// Blatt (Sheet, große Höhe). Ablauf: Briefing "Wie gehst du vor?" mit den Wegen des Anlasses (selbst hin, Leute machen
// lassen, Verstärkung, freikaufen, Bullen rufen, Spot räumen), dann Runden mit Handlungen, am Ende ein Stempel.
// Dazu eine Warnung im HUD, falls eine Konfrontation offen ist, die Akte aber nicht (z.B. nach dem Laden).
// Die Schriften DM Serif Display und Courier Prime gibt es nur hier (--font-file*).

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { formatAmount, formatEuro, type GameState, personLook } from '../../../core';
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
import { getStaffMember, roleName } from '../../staff';
import { getVeedel, veedelName } from '../../veedel';
import {
  AGGRESSION_FIGHT,
  activeEncounters,
  availableActions,
  availableMoves,
  BACKUP_MAX_PEOPLE,
  type BriefingOption,
  briefingOptions,
  CREW_MAX,
  type CrewCandidate,
  crewCandidates,
  ENCOUNTER_KINDS,
  type Encounter,
  type EncounterMode,
  type EncounterResultPart,
  type FoeRole,
  type GaugeShift,
  getEncounter,
  getEncounterAction,
  getIntent,
  type Participant,
  pendingEncounter,
  previewShift,
  RETREAT_AT,
  ROLE_NAMES,
  requestCity,
  type ShiftPreview,
  SPECIAL_MOVES,
  type StakeId,
  stakeName,
  suggestedCrew,
} from '../index';
import './island';
import './encounters.css';

declare module '../../../ui' {
  interface DialogRegistry {
    'encounters.encounter': { encounterId: number };
  }
}

/** Lage in einem Wort, aus den Zeigern. */
function moodText(encounter: Encounter): string {
  if (encounter.brawl) return 'Schlägerei';
  if (encounter.resolve < RETREAT_AT + 15) return 'Sie wackeln';
  if (encounter.aggression >= AGGRESSION_FIGHT - 15) return 'Kurz vorm Zuschlagen';
  if (encounter.resolve >= 70) return 'Sie bleiben hart';
  return 'Offen';
}

const STAKE_ICONS: Record<StakeId, string> = {
  goods: 'bag',
  cash: 'moneyBag',
  people: 'users',
  spot: 'store',
  noise: 'megaphone',
};

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
  const { state } = useGame();
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
            <Avatar
              name={lead?.isPlayer ? 'Du' : (lead?.name ?? '?')}
              image={lead?.isPlayer ? 'user' : undefined}
              look={lead && !lead.isPlayer ? personLook(lead.name, getStaffMember(state, lead.id)?.age) : null}
            />
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
// Lagebrett: Absicht, Polizei-Uhr, zwei Zeiger, Gegner mit Rollen, Einsätze

/** Pfeile an einem Zeiger: Spanne der Wirkung einer Handlung (schwacher bis starker Wurf). */
function arrows(preview: ShiftPreview | null, key: keyof GaugeShift): { from: number; to: number } | null {
  if (!preview) return null;
  const a = preview.weak[key];
  const b = preview.strong[key];
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** "−7 bis −22": erst die schwache, dann die starke Wirkung (nach Betrag). */
function shiftText(range: { from: number; to: number }): string {
  const sign = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
  const [a, b] = Math.abs(range.from) <= Math.abs(range.to) ? [range.from, range.to] : [range.to, range.from];
  return a === b ? sign(a) : `${sign(a)} bis ${sign(b)}`;
}

function Gauge(props: {
  label: string;
  value: number;
  /** Schwelle mit Bedeutung (Schlägerei ab, Abzug unter). */
  mark: number;
  markLabel: string;
  tone: 'danger' | 'place';
  preview: { from: number; to: number } | null;
}) {
  const { value, preview } = props;
  const lo = preview ? Math.max(0, Math.min(100, value + preview.from)) : value;
  const hi = preview ? Math.max(0, Math.min(100, value + preview.to)) : value;
  const dir = preview ? (preview.from + preview.to < 0 ? 'down' : preview.from + preview.to > 0 ? 'up' : 'flat') : null;
  return (
    <div class={`enc-gauge is-${props.tone}`}>
      <div class="enc-gauge__head">
        <span class="enc-gauge__label">{props.label}</span>
        <span class="enc-gauge__value">
          {value}
          {preview && dir !== 'flat' && (
            <span class={`enc-gauge__shift is-${dir}`}>
              <Icon name={dir === 'down' ? 'arrowDown' : 'arrowUp'} />
              {shiftText(preview)}
            </span>
          )}
        </span>
      </div>
      <div class="enc-gauge__bar" aria-hidden="true">
        <span class="enc-gauge__fill" style={{ width: `${value}%` }} />
        {preview && (
          <span class="enc-gauge__ghost" style={{ left: `${Math.min(lo, hi)}%`, width: `${Math.abs(hi - lo) + 1}%` }} />
        )}
        <span class="enc-gauge__mark" style={{ left: `${props.mark}%` }} title={props.markLabel} />
      </div>
      <span class="enc-gauge__hint">{props.markLabel}</span>
    </div>
  );
}

function Foes(props: { encounter: Encounter }) {
  const order: FoeRole[] = ['leader', 'nervous', 'bruiser'];
  const foes = [...props.encounter.foes].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  if (foes.length === 0) return null;
  return (
    <ul class="enc-foes" aria-label="Gegenseite">
      {foes.map((foe, i) => (
        <li key={`${foe.role}-${i}`} class={`enc-foe is-${foe.state}`}>
          <Icon name={foe.role === 'leader' ? 'crown' : foe.role === 'nervous' ? 'eye' : 'fist'} />
          {ROLE_NAMES[foe.role]}
          {foe.state !== 'in' && <span class="enc-foe__state">{foe.state === 'down' ? 'am Boden' : 'weg'}</span>}
        </li>
      ))}
    </ul>
  );
}

function Stakes(props: { encounter: Encounter; interactive: boolean }) {
  const { dispatch } = useGame();
  const { encounter } = props;
  const kind = ENCOUNTER_KINDS[encounter.kind];
  const target = getIntent(encounter.intent)?.stake;
  if (encounter.stakes.length === 0) return null;
  return (
    <fieldset class="enc-stakes">
      <legend class="enc-stakes__legend">Schützen</legend>
      {encounter.stakes.map((stake) => {
        const guarded = encounter.protect === stake.id;
        const name = stakeName(kind, stake.id);
        return (
          <button
            key={stake.id}
            type="button"
            class={`enc-stake${guarded ? ' is-guarded' : ''}${target === stake.id ? ' is-target' : ''}`}
            aria-pressed={guarded}
            disabled={!props.interactive}
            title={guarded ? `${name} wird geschützt` : `${name} schützen`}
            onClick={() =>
              dispatch({ type: 'encounters.protect', payload: { encounterId: encounter.id, stake: stake.id } })
            }
          >
            <Icon name={guarded ? 'shieldCheck' : STAKE_ICONS[stake.id]} />
            <span class="enc-stake__name">{name}</span>
            {stake.damage > 0 && (
              <span class="enc-stake__damage" title={`${stake.damage} % verloren`}>
                −{stake.damage} %
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

function Board(props: { encounter: Encounter; preview: ShiftPreview | null; interactive: boolean }) {
  const { encounter, preview } = props;
  const intent = getIntent(encounter.intent);
  const kind = ENCOUNTER_KINDS[encounter.kind];
  const present = encounter.participants.some((p) => p.isPlayer && p.condition !== 'down');
  const police = (kind?.clockOutcome ?? 'retreat') === 'failure';
  return (
    <section class="enc-board" aria-label="Lage">
      <div class="enc-board__top">
        {intent && encounter.phase === 'rounds' ? (
          <p class="enc-intent" aria-live="polite">
            <Icon name={intent.icon} />
            <span class="enc-intent__label">{intent.label}</span>
            {intent.stake && <span class="enc-intent__target">auf {stakeName(kind, intent.stake)}</span>}
          </p>
        ) : (
          <p class="enc-intent is-mood">{moodText(encounter)}</p>
        )}
        <p class={`enc-clock${encounter.clock <= 1 ? ' is-urgent' : ''}`} title="Polizei-Uhr">
          <Icon name="siren" />
          {police ? 'Verstärkung' : 'Streife'} in {Math.max(0, encounter.clock)}{' '}
          {encounter.clock === 1 ? 'Runde' : 'Runden'}
        </p>
      </div>
      <div class="enc-gauges">
        <Gauge
          label="Aggression"
          value={encounter.aggression}
          mark={AGGRESSION_FIGHT}
          markLabel={`ab ${AGGRESSION_FIGHT} Schlägerei`}
          tone="danger"
          preview={arrows(preview, 'aggression')}
        />
        <Gauge
          label="Entschlossenheit"
          value={encounter.resolve}
          mark={RETREAT_AT}
          markLabel={`unter ${RETREAT_AT} ziehen sie ab`}
          tone="place"
          preview={arrows(preview, 'resolve')}
        />
      </div>
      <Foes encounter={encounter} />
      <Stakes encounter={encounter} interactive={props.interactive} />
      {encounter.phase === 'rounds' && (
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

/** Wege, bei denen jemand hingeht (dort zählt die Crew). */
const CREW_MODES: readonly EncounterMode[] = ['self', 'crew', 'backup'];

function CrewPicker(props: { candidates: CrewCandidate[]; chosen: string[]; onToggle: (id: string) => void }) {
  const { state } = useGame();
  const { candidates, chosen } = props;
  const taxi = candidates.filter((c) => chosen.includes(c.id)).reduce((sum, c) => sum + c.cost, 0);
  return (
    <section class="enc-crew-pick" aria-label="Wer geht hin?">
      <h3 class="enc-question">
        Wer geht hin?{' '}
        <span class="enc-question__note">
          {chosen.length} von {CREW_MAX}
          {taxi > 0 ? ` · Taxi ${formatEuro(taxi)}` : ''}
        </span>
      </h3>
      <ul class="enc-crew-list">
        {candidates.map((c) => {
          const on = chosen.includes(c.id);
          const full = !on && chosen.length >= CREW_MAX;
          const move = c.move ? SPECIAL_MOVES[c.move] : null;
          return (
            <li key={c.id}>
              <button
                type="button"
                class={`enc-crew-cand${on ? ' is-on' : ''}`}
                aria-pressed={on}
                disabled={full}
                onClick={() => props.onToggle(c.id)}
              >
                <Avatar name={c.name} look={personLook(c.name, getStaffMember(state, c.id)?.age)} size="sm" />
                <span class="enc-crew-cand__text">
                  <strong>{c.name}</strong>
                  <span class="enc-crew-cand__tags">
                    <span class="enc-chip">{roleName(c.role)}</span>
                    <span class="enc-chip">Kraft {c.strength}</span>
                    {move && (
                      <span class="enc-chip is-move" title={move.hint}>
                        <Icon name={move.icon} />
                        {move.label}
                      </span>
                    )}
                    <span class={`enc-chip${c.atSite ? ' is-site' : ''}`}>
                      {c.atSite ? 'vor Ort' : `Taxi ${formatEuro(c.cost)}`}
                    </span>
                  </span>
                </span>
                <Icon name={on ? 'checkCircle' : 'plusCircle'} class="enc-crew-cand__check" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Briefing(props: { encounter: Encounter }) {
  const { state, dispatch } = useGame();
  const { encounter } = props;
  const options = briefingOptions(state, encounter);
  const cityId = requestCity(state, encounter.request);
  const candidates = crewCandidates(state, encounter, cityId);
  const [chosen, setChosen] = useState<string[]>(() => suggestedCrew(state, encounter, cityId));
  const toggle = (id: string) =>
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, CREW_MAX)));
  const withCrew = options.some((o) => CREW_MODES.includes(o.mode)) && candidates.length > 0;
  const join = (mode: EncounterMode) =>
    dispatch({
      type: 'encounters.join',
      payload: { encounterId: encounter.id, mode, ...(withCrew && CREW_MODES.includes(mode) ? { crew: chosen } : {}) },
    });
  return (
    <section class="enc-brief">
      {withCrew && <CrewPicker candidates={candidates} chosen={chosen} onToggle={toggle} />}
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

/** Crew in den Runden: Porträts, Zustand und Spezialzug (einmal pro Konfrontation). */
function Crew(props: { encounter: Encounter }) {
  const { state, dispatch } = useGame();
  const { encounter } = props;
  const ready = availableMoves(encounter);
  if (encounter.participants.length === 0) return null;
  return (
    <ul class="enc-crew" aria-label="Deine Leute">
      {encounter.participants.map((p) => {
        const move = p.move ? SPECIAL_MOVES[p.move] : null;
        const canUse = ready.some((m) => m.participantId === p.id);
        return (
          <li key={p.id} class={`enc-crew__member is-${p.killed ? 'dead' : p.condition}`}>
            <Avatar
              name={p.isPlayer ? 'Du' : p.name}
              image={p.isPlayer ? 'user' : undefined}
              look={p.isPlayer ? null : personLook(p.name, getStaffMember(state, p.id)?.age)}
              size="sm"
            />
            <span class="enc-crew__text">
              <strong>{p.isPlayer ? 'Du' : p.name.split(' ')[0]}</strong>
              <span>{conditionText(p)}</span>
            </span>
            {move &&
              (canUse ? (
                <button
                  type="button"
                  class="enc-move"
                  title={move.hint}
                  onClick={() =>
                    dispatch({
                      type: 'encounters.special',
                      payload: { encounterId: encounter.id, participantId: p.id },
                    })
                  }
                >
                  <Icon name={move.icon} />
                  {move.label}
                </button>
              ) : (
                <span class={`enc-chip is-move${p.moveUsed ? ' is-used' : ''}`} title={move.hint}>
                  <Icon name={move.icon} />
                  {move.label}
                  {p.moveUsed ? ' · genutzt' : move.passive ? ' · bereit' : ''}
                </span>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// Runden

const ACTION_ICONS: Record<string, string> = {
  fight: 'fist',
  intimidate: 'crown',
  talkNervous: 'message',
  negotiate: 'handshake',
  hold: 'hourglass',
  bluff: 'phone',
  bribe: 'moneyBag',
  callCops: 'siren',
  flee: 'runner',
  run: 'runner',
  speedOff: 'car',
  dump: 'trash',
  papers: 'idCard',
  distract: 'message',
  giveUp: 'package',
};

function ActionShift(props: { preview: ShiftPreview }) {
  const items: { key: keyof GaugeShift; label: string }[] = [
    { key: 'aggression', label: 'Aggr.' },
    { key: 'resolve', label: 'Entschl.' },
  ];
  return (
    <span class="enc-act__shift">
      {items.map(({ key, label }) => {
        const range = arrows(props.preview, key);
        if (!range || (range.from === 0 && range.to === 0)) return null;
        const dir = range.from + range.to < 0 ? 'down' : 'up';
        return (
          <span key={key} class={`enc-act__arrow is-${key}-${dir}`}>
            <Icon name={dir === 'down' ? 'arrowDown' : 'arrowUp'} />
            {label} {shiftText(range)}
          </span>
        );
      })}
    </span>
  );
}

function Rounds(props: { encounter: Encounter; onPreview: (actionId: string | null) => void }) {
  const { state, dispatch } = useGame();
  const { encounter, onPreview } = props;
  const actions = availableActions(encounter);
  const intent = getIntent(encounter.intent);
  const act = (actionId: string) => {
    onPreview(null);
    dispatch({ type: 'encounters.act', payload: { encounterId: encounter.id, actionId } });
  };
  return (
    <section class="enc-rounds">
      <div class="enc-grid">
        {actions.map((id) => {
          const action = getEncounterAction(encounter.kind, id);
          if (!action) return null;
          const preview = previewShift(encounter, action, id);
          const cost = action.costsBribe ? encounter.bribeCost : 0;
          const answers = intent?.counters?.includes(id) || (intent?.stake && action.shields === intent.stake);
          const good = preview.mid.resolve + Math.max(0, preview.mid.aggression) / 2;
          const level = action.ends ? 'mid' : good <= -10 ? 'good' : good > 0 ? 'bad' : 'mid';
          const broke = cost > state.wallet.dirty;
          return (
            <button
              key={id}
              type="button"
              class={`enc-act is-${level}`}
              disabled={broke}
              onClick={() => act(id)}
              onMouseEnter={() => onPreview(id)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(id)}
              onBlur={() => onPreview(null)}
            >
              <span class="enc-act__top">
                <Icon name={ACTION_ICONS[id] ?? 'bolt'} class="enc-act__icon" />
                {answers && <span class="enc-act__answer">wendet ab</span>}
              </span>
              <strong class="enc-act__title">{action.label}</strong>
              {action.ends ? (
                <span class="enc-act__shift">
                  <span class="enc-act__arrow">Sofort vorbei</span>
                </span>
              ) : (
                <ActionShift preview={preview} />
              )}
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
        <ResultParts encounter={encounter} />
        <button type="button" class="enc-close" onClick={props.onClose}>
          Akte schließen
        </button>
      </div>
    </section>
  );
}

const PART_STATE: Record<EncounterResultPart['state'], string> = {
  kept: 'gehalten',
  partial: 'teilweise verloren',
  lost: 'verloren',
};

/** Teil-Ergebnisse pro Einsatz als Chips: gehalten, teilweise, verloren. */
function ResultParts(props: { encounter: Encounter }) {
  const parts = props.encounter.result?.parts ?? [];
  const kind = ENCOUNTER_KINDS[props.encounter.kind];
  if (parts.length === 0) return null;
  return (
    <ul class="enc-parts" aria-label="Teil-Ergebnisse">
      {parts.map((part) => (
        <li key={part.stake} class={`enc-part is-${part.state}`} title={PART_STATE[part.state]}>
          <Icon name={STAKE_ICONS[part.stake]} />
          <span class="enc-part__name">{stakeName(kind, part.stake)}</span>
          <span class="enc-part__text">{part.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Log(props: { encounter: Encounter }) {
  const log = props.encounter.log;
  if (log.length === 0) return null;
  return (
    <ol class="enc-log" aria-label="Verlauf">
      {log.map((entry) => {
        const label = getEncounterAction(props.encounter.kind, entry.actionId)?.label;
        const intent = getIntent(entry.intent)?.label;
        return (
          <li key={`${entry.round}-${entry.actionId}`} class={entry.success ? 'is-good' : 'is-bad'}>
            {label ? (
              <>
                Runde {entry.round}
                {intent ? ` (${intent})` : ''}, {label}
                {entry.shift
                  ? ` · Aggr. ${signed(entry.shift.aggression)}, Entschl. ${signed(entry.shift.resolve)}`
                  : ''}
                :{' '}
              </>
            ) : null}
            {entry.text}
          </li>
        );
      })}
    </ol>
  );
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0';
}

/** Inhalt der Akte (gleich für die Karte am Desktop und das Blatt am Handy-Bildschirm). */
function FileBody(props: { encounter: Encounter; onClose: () => void }) {
  const { encounter } = props;
  const [hover, setHover] = useState<string | null>(null);
  const action = hover && encounter.phase === 'rounds' ? getEncounterAction(encounter.kind, hover) : undefined;
  const preview = action && !action.ends && hover ? previewShift(encounter, action, hover) : null;
  return (
    <div class={`enc enc--${encounter.phase}${encounter.playerPresent ? '' : ' enc--remote'}`}>
      <Head encounter={encounter} />
      {encounter.phase !== 'done' && (
        <Board encounter={encounter} preview={preview} interactive={encounter.phase === 'rounds'} />
      )}
      {encounter.phase === 'briefing' && <Briefing encounter={encounter} />}
      {encounter.phase === 'rounds' && <Crew encounter={encounter} />}
      {encounter.phase === 'rounds' && <Rounds encounter={encounter} onPreview={setHover} />}
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
