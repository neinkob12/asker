// Oberfläche der Konfrontationen: ein Dialog, der sich bei jeder neuen Konfrontation öffnet und das Spiel pausiert.
// Erst die Entscheidung "selbst hin oder nicht", dann Runden mit Handlungen, am Ende das Ergebnis.
// Dazu eine Warnung im HUD, falls eine Konfrontation offen ist, der Dialog aber nicht (z.B. nach dem Laden).

import { formatAmount, formatEuro, formatPercent } from '../../../core';
import {
  Button,
  Dialog,
  Hint,
  onGameEvent,
  ProgressBar,
  registerDialog,
  registerHudItem,
  useGame,
  useUi,
} from '../../../ui';
import {
  actionChance,
  activeEncounters,
  availableActions,
  ENCOUNTER_KINDS,
  type Encounter,
  type EncounterOutcome,
  getEncounter,
  getEncounterAction,
  type Participant,
  pendingEncounter,
} from '../index';
import './encounters.css';

declare module '../../../ui' {
  interface DialogRegistry {
    'encounters.encounter': { encounterId: number };
  }
}

const OUTCOME_TITLE: Record<EncounterOutcome, string> = {
  success: 'Geschafft',
  failure: 'Verloren',
  retreat: 'Rückzug',
};

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

function ParticipantRow(props: { p: Participant }) {
  const { p } = props;
  const s = p.stats;
  return (
    <li class={`enc-person enc-person--${p.killed ? 'dead' : p.condition}`}>
      <span class="enc-person__name">{p.isPlayer ? 'Du' : p.name}</span>
      <span class="enc-person__state">{conditionText(p)}</span>
      <span class="enc-person__stats" title="Kraft · Tempo · Charisma · Vorsicht">
        K{s.strength} T{s.speed} C{s.charisma} V{s.caution}
      </span>
    </li>
  );
}

function Sides(props: { encounter: Encounter }) {
  const { encounter } = props;
  const o = encounter.opponent;
  return (
    <div class="enc-sides">
      <section class="enc-side">
        <h3 class="enc-side__title">Deine Seite</h3>
        {encounter.participants.length === 0 ? (
          <p class="enc-side__empty">Niemand vor Ort.</p>
        ) : (
          <ul class="enc-people">
            {encounter.participants.map((p) => (
              <ParticipantRow key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>
      <section class="enc-side enc-side--enemy">
        <h3 class="enc-side__title">{o.label}</h3>
        <p class="enc-enemy">
          <strong>{o.count}</strong> von {o.startCount} stehen
          {o.down > 0 ? `, ${o.down} am Boden` : ''}
        </p>
        <p class="enc-enemy">Kampfkraft {o.strength}</p>
      </section>
    </div>
  );
}

function Stakes(props: { encounter: Encounter }) {
  const stakes = props.encounter.request.stakes;
  if (!stakes || (!stakes.money && !stakes.goods)) return null;
  const parts = [];
  if (stakes.money) parts.push(formatEuro(stakes.money));
  if (stakes.goods) parts.push(formatAmount(stakes.goods));
  return <p class="enc-stakes">Es geht um: {parts.join(' und ')}</p>;
}

function Log(props: { encounter: Encounter }) {
  const log = props.encounter.log;
  if (log.length === 0) return null;
  return (
    <ol class="enc-log" aria-label="Verlauf">
      {[...log].reverse().map((entry) => {
        const label = getEncounterAction(props.encounter.kind, entry.actionId)?.label;
        return (
          <li key={entry.round} class={`enc-log__entry ${entry.success ? 'is-good' : 'is-bad'}`}>
            {label && (
              <span class="enc-log__head">
                Runde {entry.round}: {label} ({formatPercent(entry.chance)}) {entry.success ? '✓' : '✗'}
              </span>
            )}
            <span>{entry.text}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Briefing(props: { encounter: Encounter }) {
  const { dispatch } = useGame();
  const { encounter } = props;
  const hasCrew = encounter.participants.length > 0;
  const join = (present: boolean) =>
    dispatch({ type: 'encounters.join', payload: { encounterId: encounter.id, present } });
  return (
    <div class="enc-choices">
      <p class="enc-question">Gehst du selbst hin?</p>
      <Button variant="danger" wide class="enc-choice" onClick={() => join(true)}>
        <strong>Selbst hin</strong>
        <small>Bessere Chancen und mehr Möglichkeiten. Du kannst dabei sterben.</small>
      </Button>
      <Button wide class="enc-choice" onClick={() => join(false)}>
        <strong>{hasCrew ? 'Deine Leute machen lassen' : 'Nicht eingreifen'}</strong>
        <small>
          {hasCrew
            ? 'Du bleibst sicher und gibst Anweisungen per Handy. Weniger Möglichkeiten.'
            : 'Niemand von euch ist dort. Die Sache läuft ohne dich.'}
        </small>
      </Button>
    </div>
  );
}

function Actions(props: { encounter: Encounter }) {
  const { state, dispatch } = useGame();
  const { encounter } = props;
  const actions = availableActions(encounter);
  const act = (actionId: string) =>
    dispatch({ type: 'encounters.act', payload: { encounterId: encounter.id, actionId } });
  return (
    <div class="enc-choices">
      {!encounter.participants.some((p) => p.isPlayer && p.condition !== 'down') && (
        <Hint>Du bist nicht vor Ort. Deine Leute bekommen deine Anweisungen per Handy.</Hint>
      )}
      {actions.map((id) => {
        const action = getEncounterAction(encounter.kind, id);
        if (!action) return null;
        const chance = actionChance(encounter, id);
        const cost = action.costsBribe ? encounter.bribeCost : 0;
        return (
          <Button
            key={id}
            wide
            class="enc-choice"
            disabled={cost > state.wallet.dirty}
            onClick={() => act(id)}
            variant={id === 'fight' ? 'danger' : 'default'}
          >
            <span class="enc-choice__row">
              <strong>{action.label}</strong>
              <span class={`enc-chance ${chance >= 0.6 ? 'is-good' : chance < 0.35 ? 'is-bad' : ''}`}>
                {formatPercent(chance)}
              </span>
            </span>
            <small>
              {action.hint}
              {cost > 0 ? ` Kostet ${formatEuro(cost)}.` : ''}
            </small>
          </Button>
        );
      })}
      {!encounter.playerPresent && (
        <Button
          variant="subtle"
          wide
          onClick={() => dispatch({ type: 'encounters.auto', payload: { encounterId: encounter.id } })}
        >
          Deine Leute entscheiden lassen (auswürfeln)
        </Button>
      )}
    </div>
  );
}

function Result(props: { encounter: Encounter }) {
  const { encounter } = props;
  const outcome = encounter.outcome ?? 'failure';
  return (
    <div class={`enc-result enc-result--${outcome}`}>
      <p class="enc-result__title">{encounter.playerKilled ? 'Du bist tot.' : OUTCOME_TITLE[outcome]}</p>
      <p>{encounter.result?.text}</p>
    </div>
  );
}

function EncounterDialog(props: { encounterId: number }) {
  const { state } = useGame();
  const ui = useUi();
  const encounter = getEncounter(state, props.encounterId);
  const close = () => {
    const next = activeEncounters(state).find((e) => e.id !== props.encounterId);
    if (next) ui.openDialog('encounters.encounter', { encounterId: next.id });
    else ui.closeDialog();
  };
  if (!encounter) {
    return (
      <Dialog title="Konfrontation" onClose={close}>
        <p>Diese Konfrontation ist vorbei.</p>
      </Dialog>
    );
  }
  const kind = ENCOUNTER_KINDS[encounter.kind];
  const done = encounter.phase === 'done';
  const edge = encounter.edge;
  return (
    <Dialog
      title={<span class="enc-title">{kind?.name ?? 'Konfrontation'}</span>}
      actions={
        done ? (
          <Button variant="primary" onClick={close}>
            Weiter
          </Button>
        ) : undefined
      }
    >
      <div class={`enc enc--${encounter.phase}`}>
        <p class="enc-meta">
          {encounter.place}
          {encounter.phase !== 'briefing'
            ? ` · Runde ${Math.min(encounter.round + (done ? 0 : 1), encounter.maxRounds)} von ${encounter.maxRounds}`
            : ''}
        </p>
        <p class="enc-situation">{encounter.situation}</p>
        <Stakes encounter={encounter} />
        <Sides encounter={encounter} />
        {encounter.phase !== 'briefing' && (
          <div class="enc-edge">
            <span class="enc-edge__label">Lage</span>
            <ProgressBar value={edge / 100} tone={edge < 30 ? 'bad' : edge < 50 ? 'warn' : 'accent'} label="Lage" />
            <span class="enc-edge__text">{edgeText(edge)}</span>
          </div>
        )}
        {encounter.phase === 'briefing' && <Briefing encounter={encounter} />}
        {encounter.phase === 'rounds' && <Actions encounter={encounter} />}
        {done && <Result encounter={encounter} />}
        <Log encounter={encounter} />
      </div>
    </Dialog>
  );
}

/** Warnung im HUD, wenn eine Konfrontation auf dich wartet, der Dialog aber zu ist. */
function PendingHud() {
  const { state } = useGame();
  const ui = useUi();
  const pending = pendingEncounter(state);
  if (!pending || ui.state.dialog?.id === 'encounters.encounter') return null;
  return (
    <Button
      small
      variant="danger"
      class="enc-hud"
      onClick={() => ui.openDialog('encounters.encounter', { encounterId: pending.id })}
    >
      ⚠ {ENCOUNTER_KINDS[pending.kind]?.name ?? 'Konfrontation'}
    </Button>
  );
}

registerDialog({ id: 'encounters.encounter', component: EncounterDialog, pausesGame: true, dismissable: false });
registerHudItem({ id: 'encounters.pending', order: 50, component: PendingHud });
onGameEvent('encounter.started', 'encounters.open', (payload, ui, state) => {
  if (state.outcome.gameOver) return;
  ui.openDialog('encounters.encounter', { encounterId: payload.encounterId });
});
