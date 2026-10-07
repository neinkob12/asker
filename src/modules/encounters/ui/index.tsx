// Oberfläche der Konfrontationen (Auftrag 46d): keine Akte mehr. Jede Konfrontation ist sofort entschieden; was dabei
// herauskam, zeigt eine kurze Ergebnis-Karte im Look "Glas" über der Kartenfläche (am Handy-Bildschirm als Blatt): wer,
// wo, was passiert ist, was es gekostet hat, ein Knopf „Okay“. Keine Entscheidung mehr. Dazu Warnton und ein kurzer
// Blitz über der Karte, wenn es losgeht.

import { formatAmount, formatEuro, type GameState } from '../../../core';
import { mapEffects } from '../../../map';
import { Button, Chips, Icon, MapDialog, onGameEvent, registerDialog, soundOnEvent, useGame, useUi } from '../../../ui';
import { getSpot } from '../../spots';
import { getStaffMember } from '../../staff';
import { getVeedel, veedelName } from '../../veedel';
import { ENCOUNTER_KINDS, type Encounter, type EncounterResultPart, getEncounter, type StakeId } from '../index';
import './encounters.css';

declare module '../../../ui' {
  interface DialogRegistry {
    'encounters.result': { encounterId: number };
  }
}

const STAKE_ICONS: Record<StakeId, string> = {
  goods: 'bag',
  cash: 'moneyBag',
  people: 'users',
  spot: 'store',
  noise: 'megaphone',
};

const PART_STATE: Record<EncounterResultPart['state'], string> = {
  kept: 'gehalten',
  partial: 'teilweise verloren',
  lost: 'verloren',
};

/** Ort ohne Präposition, z.B. "Neumarkt" statt "am Neumarkt". */
function placeName(state: GameState, encounter: Encounter): string {
  const spot = encounter.request.spotId ? getSpot(state, encounter.request.spotId) : undefined;
  if (spot) return spot.name;
  if (encounter.request.veedelId) return veedelName(encounter.request.veedelId);
  return encounter.place.replace(/^(am|an der|in der|im|in|auf der)\s+/i, '');
}

function stampOf(encounter: Encounter): { label: string; tone: 'success' | 'retreat' | 'failure' } {
  const outcome = encounter.outcome ?? 'failure';
  if (encounter.playerKilled) return { label: 'Tot', tone: 'failure' };
  if (outcome === 'success') return { label: 'Erfolg', tone: 'success' };
  if (outcome === 'retreat') return { label: 'Rückzug', tone: 'retreat' };
  return { label: 'Verloren', tone: 'failure' };
}

/** Was es gekostet hat, als Chips: Geld, Ware, Verletzte, Festgenommene, Heat. */
function costChips(state: GameState, encounter: Encounter) {
  const r = encounter.result;
  if (!r) return [];
  const chips: { label: string; icon: string; color: 'danger' | 'warn' | 'money' | 'people' | 'law' }[] = [];
  if (r.money < 0) chips.push({ label: `${formatEuro(r.money)}`, icon: 'moneyBag', color: 'danger' });
  if (r.money > 0) chips.push({ label: `+${formatEuro(r.money)}`, icon: 'moneyBag', color: 'money' });
  if (r.goods < 0) chips.push({ label: `${formatAmount(r.goods)}`, icon: 'bag', color: 'danger' });
  if (r.goods > 0) chips.push({ label: `+${formatAmount(r.goods)}`, icon: 'bag', color: 'money' });
  const name = (id: string) => getStaffMember(state, id)?.name ?? 'Jemand';
  for (const id of r.staffKilled) chips.push({ label: `${name(id)} tot`, icon: 'skull', color: 'danger' });
  for (const id of r.staffInjured) chips.push({ label: `${name(id)} verletzt`, icon: 'bandage', color: 'warn' });
  for (const id of r.staffArrested) chips.push({ label: `${name(id)} festgenommen`, icon: 'siren', color: 'law' });
  if (r.playerInjured && !encounter.playerKilled)
    chips.push({ label: 'Du bist verletzt', icon: 'bandage', color: 'warn' });
  if (r.heat > 0) chips.push({ label: `+${Math.round(r.heat)} Heat`, icon: 'flame', color: 'warn' });
  if (r.opponentLosses > 0) {
    chips.push({ label: `${r.opponentLosses} von ihnen am Boden`, icon: 'users', color: 'people' });
  }
  return chips;
}

function ResultDialog(props: { encounterId: number }) {
  const { state } = useGame();
  const ui = useUi();
  const encounter = getEncounter(state, props.encounterId);
  const close = () => ui.closeDialog();
  if (!encounter || encounter.phase !== 'done') return null;
  const kind = ENCOUNTER_KINDS[encounter.kind];
  const stamp = stampOf(encounter);
  const parts = encounter.result?.parts ?? [];
  return (
    <MapDialog
      label={`${kind?.name ?? 'Konfrontation'}: ${stamp.label}`}
      onClose={close}
      class="enc-result"
      detent="medium"
    >
      <p class="enc-result__kicker">
        {kind?.name ?? 'Konfrontation'} · {placeName(state, encounter)}
      </p>
      <div class="enc-result__head">
        <h2 class="enc-result__title">{encounter.opponent.label}</h2>
        <span class={`enc-stamp is-${stamp.tone}`} role="img" aria-label={`Ergebnis: ${stamp.label}`}>
          {stamp.label}
        </span>
      </div>
      <p class="enc-result__text">{encounter.result?.text}</p>
      <Chips items={costChips(state, encounter)} />
      {parts.length > 0 && (
        <ul class="enc-parts" aria-label="Was auf dem Spiel stand">
          {parts.map((part) => (
            <li key={part.stake} class={`enc-part is-${part.state}`} title={PART_STATE[part.state]}>
              <Icon name={STAKE_ICONS[part.stake]} class="enc-part__icon" />
              <span class="enc-part__text">{part.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div class="enc-result__actions">
        <Button variant="primary" onClick={close}>
          Okay
        </Button>
      </div>
    </MapDialog>
  );
}

registerDialog({
  id: 'encounters.result',
  component: ResultDialog,
  pausesGame: true,
  dismissable: true,
  area: 'map',
  lockPhone: false,
});

// Das Ergebnis kommt sofort nach dem Start (oder nach dem Minispiel) als Karte. Nach dem Tod zeigt der Kern das Ende.
onGameEvent('encounter.resolved', 'encounters.result', (payload, ui, state) => {
  if (state.outcome.gameOver || payload.playerKilled) return;
  ui.openDialog('encounters.result', { encounterId: payload.encounterId });
});
// Konfrontation: Warnton und ein kurzer Blitz über der Karte, bei Gewalt ein Ping am Ort.
soundOnEvent('encounter.started', 'alert');
onGameEvent('encounter.started', 'encounters.fx', (payload, _ui, state) => {
  mapEffects.flash({ strength: 0.3, color: '#ff5a4a' });
  const spot = payload.request.spotId ? getSpot(state, payload.request.spotId) : undefined;
  const where = spot ?? (payload.request.veedelId ? getVeedel(payload.request.veedelId)?.center : undefined);
  if (where) mapEffects.ping(where, { tone: 'bad' });
});
