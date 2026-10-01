// Oberfläche der Polizei: Heat im HUD, Abschnitt "Polizei" im Veedel-Panel (mit Verpfeifen) und Hinweise als Toast.

import { useState } from 'preact/hooks';
import { clock, formatPercent } from '../../../core';
import { mapEffects } from '../../../map';
import {
  ActionSheet,
  Group,
  HudPill,
  ItemContent,
  List,
  ListItem,
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
      color={level.id === 'calm' ? 'money' : level.id === 'watchful' ? 'warn' : 'danger'}
      label="Heat"
      value={level.label}
      tone={level.id === 'calm' ? undefined : TONE[level.id]}
      title={title}
    >
      <SegmentMeter value={heat / MAX_HEAT} segments={5} label="Heat" size="sm" />
    </HudPill>
  );
}

/**
 * Abschnitt im Veedel-Panel: Heat, was droht, Verpfeifen der Gang, die hier herrscht. Verpfeifen hat Folgen (die Gang
 * kann erfahren, wer gesungen hat) und wird deshalb im Aktionsblatt bestätigt.
 */
function PoliceSection(props: { veedelId: string }) {
  const { state, dispatch } = useGame();
  const [confirm, setConfirm] = useState(false);
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
    <Group
      title="Polizei"
      icon="siren"
      color="law"
      note={`Verkäufe und Gewalt treiben den Heat, mit der Zeit kühlt es ab. Polizeipräsenz: ${formatPercent(getVeedel(props.veedelId)?.policePresence ?? 1)}.`}
    >
      <List>
        <ListItem value={`${Math.round(heat)} von ${MAX_HEAT}`}>
          <ItemContent icon="flame" color={level.id === 'calm' ? 'money' : 'danger'} title={level.label} meta={risk}>
            <ProgressBar value={heat / MAX_HEAT} tone={TONE[level.id]} label="Heat" />
          </ItemContent>
        </ListItem>
        {tip && (
          <ListItem value={`bis ${clock.format(tip.until)}`}>
            <ItemContent
              icon="megaphone"
              color="law"
              title="Hinweis läuft"
              meta={`gegen ${getGang(state, tip.gangId)?.name ?? tip.gangId}`}
            />
          </ListItem>
        )}
        {gang && snitch && (
          <ListItem action disabled={!snitch.ok} onClick={() => setConfirm(true)}>
            <ItemContent
              icon="megaphone"
              color="danger"
              title={`${gang.name} verpfeifen`}
              meta={snitch.ok ? 'Heat und Razzien in allen Veedeln der Gang' : snitch.reason}
            />
          </ListItem>
        )}
      </List>
      {gang && (
        <ActionSheet
          open={confirm}
          onClose={() => setConfirm(false)}
          title={`${gang.name} verpfeifen?`}
          message="Die Polizei macht Razzien bei der Gang. Gut vernetzte Gangs erfahren eher, wer gesungen hat."
          actions={[
            {
              label: 'Verpfeifen',
              destructive: true,
              onSelect: () => dispatch({ type: 'police.snitch', payload: { gangId: gang.id } }),
            },
          ]}
        />
      )}
    </Group>
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
