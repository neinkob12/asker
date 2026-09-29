// Oberfläche der Polizei: Heat im HUD, Abschnitt "Polizei" im Veedel-Panel (mit Verpfeifen) und Hinweise als Toast.

import { clock, formatPercent } from '../../../core';
import { mapEffects } from '../../../map';
import {
  Button,
  Card,
  Hint,
  HudPill,
  KeyValue,
  onGameEvent,
  ProgressBar,
  registerHudItem,
  registerSlot,
  SegmentMeter,
  soundOnEvent,
  useGame,
} from '../../../ui';
import { getGang } from '../../gangs';
import { getSpot } from '../../spots';
import { getStaffMember } from '../../staff';
import { controllerOf, PLAYER_FACTION } from '../../territory';
import { getVeedel, veedelName } from '../../veedel';
import {
  activeTipOff,
  CHECK_THRESHOLD,
  canSnitch,
  getHeat,
  heatLevel,
  MAX_HEAT,
  playerHeat,
  RAID_THRESHOLD,
} from '../index';
import './island';
import './police.css';

const TONE = { calm: 'accent', watchful: 'warn', hot: 'bad', manhunt: 'bad' } as const;

/** Heat im HUD: das heißeste Veedel, in dem der Spieler gerade aktiv ist. */
function HeatHud() {
  const { state } = useGame();
  const hottest = playerHeat(state);
  const heat = hottest?.heat ?? 0;
  const level = heatLevel(heat);
  const title = hottest
    ? `Heat in ${veedelName(hottest.veedelId)} (heißestes Veedel, in dem du aktiv bist)`
    : 'Du bist gerade in keinem Veedel aktiv.';
  return (
    <HudPill
      class="hud-heat"
      icon="flame"
      color={level.id === 'calm' ? 'green' : level.id === 'watchful' ? 'yellow' : 'red'}
      label="Heat"
      value={level.label}
      tone={level.id === 'calm' ? undefined : TONE[level.id]}
      title={title}
    >
      <SegmentMeter value={heat / MAX_HEAT} segments={5} label="Heat" size="sm" />
    </HudPill>
  );
}

/** Abschnitt im Veedel-Panel: Heat, was droht, Verpfeifen der Gang, die hier herrscht. */
function PoliceSection(props: { veedelId: string }) {
  const { state, dispatch } = useGame();
  const heat = getHeat(state, props.veedelId);
  const level = heatLevel(heat);
  const owner = controllerOf(state, props.veedelId);
  const gang = owner && owner !== PLAYER_FACTION ? getGang(state, owner) : undefined;
  const tip = activeTipOff(state, props.veedelId);
  const snitch = gang ? canSnitch(state, gang.id) : null;
  const risk =
    heat >= RAID_THRESHOLD
      ? 'Razzien und Kontrollen möglich.'
      : heat >= CHECK_THRESHOLD
        ? `Kontrollen möglich, Razzien ab ${RAID_THRESHOLD}.`
        : `Ruhig. Kontrollen ab ${CHECK_THRESHOLD}, Razzien ab ${RAID_THRESHOLD}.`;
  return (
    <Card title="Polizei" actions={<span class={`police-level police-level--${level.id}`}>{level.label}</span>}>
      <KeyValue label="Heat" value={`${Math.round(heat)} von ${MAX_HEAT}`} />
      <ProgressBar value={heat / MAX_HEAT} tone={TONE[level.id]} label="Heat" />
      <Hint>
        {risk} Verkäufe und Gewalt treiben den Heat, mit der Zeit kühlt es ab. Polizeipräsenz:{' '}
        {formatPercent(getVeedel(props.veedelId)?.policePresence ?? 1)}.
      </Hint>
      {tip && (
        <Hint>
          Hinweis gegen {getGang(state, tip.gangId)?.name ?? tip.gangId} läuft bis {clock.format(tip.until)}.
        </Hint>
      )}
      {gang && snitch && (
        <div class="police-snitch">
          <Button
            variant="danger"
            disabled={!snitch.ok}
            title={snitch.ok ? 'Heat und Razzien in allen Veedeln der Gang' : snitch.reason}
            onClick={() => dispatch({ type: 'police.snitch', payload: { gangId: gang.id } })}
          >
            {gang.name} verpfeifen
          </Button>
          {!snitch.ok && <span class="ui-hint">{snitch.reason}</span>}
        </div>
      )}
    </Card>
  );
}

registerHudItem({ id: 'police.heat', order: 30, placement: 'main', component: HeatHud });
registerSlot('veedel.veedelPanel', { id: 'police.heat', order: 20, component: PoliceSection });

onGameEvent('police.raid', 'police.toast.raid', (payload, ui, state) => {
  if (payload.target === PLAYER_FACTION) ui.toast(`Razzia in ${veedelName(payload.veedelId)}!`, 'bad');
  else ui.toast(`Razzia bei ${getGang(state, payload.target)?.name ?? payload.target}.`, 'info');
});
// Blaulicht am Ort der Razzia bzw. Kontrolle, Sirene nur, wenn es dich trifft.
onGameEvent('police.raid', 'police.fx.raid', (payload, _ui, state) => {
  const spot = payload.spotId ? getSpot(state, payload.spotId) : undefined;
  const where = spot ?? getVeedel(payload.veedelId)?.center;
  if (where) mapEffects.blueLight(where, { label: 'Razzia', durationMs: 9000 });
});
onGameEvent('police.check', 'police.fx.check', (payload, _ui, state) => {
  const spot = payload.spotId ? getSpot(state, payload.spotId) : undefined;
  const where = spot ?? getVeedel(payload.veedelId)?.center;
  if (where) mapEffects.blueLight(where, { label: 'Kontrolle', durationMs: 5000, size: 0.7 });
});
soundOnEvent('police.raid', 'siren', { when: (p) => p.target === PLAYER_FACTION && !p.empty });
soundOnEvent('police.check', 'siren', { volume: 0.5, throttleMs: 4000 });
onGameEvent('police.check', 'police.toast.check', (payload, ui) => {
  ui.toast(`Kontrolle in ${veedelName(payload.veedelId)}.`, 'bad');
});
onGameEvent('police.arrest', 'police.toast.arrest', (payload, ui, state) => {
  ui.toast(`${getStaffMember(state, payload.staffId)?.name ?? 'Jemand'} wurde festgenommen.`, 'bad');
});
