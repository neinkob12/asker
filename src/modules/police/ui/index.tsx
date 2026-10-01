// Oberfläche der Polizei: Heat im HUD, Abschnitt "Polizei" im Veedel-Panel (mit Verpfeifen) und Hinweise als Toast.

import { useState } from 'preact/hooks';
import { clock, formatPercent } from '../../../core';
import { mapEffects } from '../../../map';
import {
  ActionSheet,
  Button,
  Card,
  Group,
  HudPill,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerHudItem,
  registerSearch,
  registerSlot,
  SegmentMeter,
  soundOnEvent,
  Tag,
  useGame,
  useUi,
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
  nextTierHints,
  OPERATION_TIERS,
  operationTier,
  plannedMajorRaid,
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
        <TierRow />
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

const TIER_COLORS = ['money', 'warn', 'danger'] as const;

/** Stufe als Zeile: "So sieht dich die Polizei: Kleindealer". */
function TierRow() {
  const { state } = useGame();
  const tier = operationTier(state);
  return (
    <ListItem
      value={
        <Tag category={TIER_COLORS[tier.index]} icon={tier.index === 0 ? 'user' : tier.index === 1 ? 'users' : 'crown'}>
          {tier.name}
        </Tag>
      }
    >
      <ItemContent icon="badge" color="law" title="So sieht dich die Polizei" meta={tier.hint} />
    </ListItem>
  );
}

/** Abschnitt "Polizei" im Geschäft: Stufe, was zur nächsten führt, geplante Großrazzia, heißestes Veedel. */
function PoliceCard() {
  const { state } = useGame();
  const ui = useUi();
  const tier = operationTier(state);
  const hints = nextTierHints(state, tier.index);
  const hot = playerHeat(state);
  const major = plannedMajorRaid(state);
  return (
    <Card
      title="Polizei"
      icon="siren"
      color="law"
      status={tier.index >= 2 ? 'bad' : tier.index === 1 ? 'warn' : 'good'}
      summary={tier.name}
      actions={
        hot ? (
          <Button small onClick={() => ui.openPanel('veedel.veedel', { veedelId: hot.veedelId })}>
            Heißestes Veedel
          </Button>
        ) : undefined
      }
    >
      <Group title="Stufe" icon="badge" color="law">
        <List>
          <TierRow />
          {major && (
            <ListItem value={clock.format(major.at)}>
              <ItemContent
                icon="siren"
                color="danger"
                title="Großrazzia geplant"
                meta={major.veedelIds.map(veedelName).join(', ')}
              />
            </ListItem>
          )}
          {hot && (
            <ListItem value={`Heat ${Math.round(hot.heat)}`}>
              <ItemContent icon="flame" color="danger" title={`Am heißesten: ${veedelName(hot.veedelId)}`} />
            </ListItem>
          )}
        </List>
      </Group>
      {hints.length > 0 && (
        <Group
          title={`Zur Stufe ${OPERATION_TIERS[tier.index + 1].name}`}
          icon="trendUp"
          color="warn"
          note="Eines davon reicht. Wer größer wird, bekommt härtere Razzien."
        >
          <List>
            {hints.map((h) => (
              <ListItem key={h.label} value={h.value}>
                <ItemContent icon="arrowUp" color="warn" title={h.label} />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
    </Card>
  );
}

registerSlot('tab:business', { id: 'police.tier', title: 'Polizei', order: 60, component: PoliceCard });
registerSearch({
  id: 'police.search',
  label: 'Polizei',
  order: 60,
  items: (state) => [
    {
      id: 'police.tier',
      title: 'Polizei',
      subtitle: `So sieht dich die Polizei: ${operationTier(state).name}`,
      icon: 'siren',
      keywords: 'Razzia Großrazzia Heat Kripo Stufe',
      run: (ui) => {
        ui.selectTab('business');
        ui.openSection('police.tier');
      },
    },
  ],
});
registerHudItem({ id: 'police.heat', order: 30, placement: 'main', component: HeatHud });
registerSlot('veedel.veedelPanel', { id: 'police.heat', order: 20, component: PoliceSection });

onGameEvent('police.raid', 'police.toast.raid', (payload, ui, state) => {
  if (payload.target !== PLAYER_FACTION) {
    ui.toast(`Razzia bei ${getGang(state, payload.target)?.name ?? payload.target}.`, 'info');
    return;
  }
  const spot = payload.scope === 'spot' && payload.spotId ? getSpot(state, payload.spotId) : undefined;
  const title =
    payload.scope === 'major'
      ? `Großrazzia in ${(payload.veedelIds ?? [payload.veedelId]).map(veedelName).join(', ')}!`
      : spot
        ? `Razzia am ${spot.name}!`
        : `Razzia in ${veedelName(payload.veedelId)}!`;
  ui.toast(payload.empty ? `${title.slice(0, -1)}: niemand da.` : title, payload.empty ? 'info' : 'bad');
});
onGameEvent('police.tierChanged', 'police.toast.tier', (payload, ui) => {
  const tier = OPERATION_TIERS[payload.to];
  ui.toast(`Die Polizei sieht dich jetzt als ${tier.name}.`, payload.to > payload.from ? 'bad' : 'good');
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
