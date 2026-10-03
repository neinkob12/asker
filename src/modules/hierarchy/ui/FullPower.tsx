// Vollmacht der Rechten Hand im Handy und über der Karte (Auftrag 30):
//   - Übergabe-Dialog über der Kartenfläche (Look "Glas"): die Rechte Hand mit Stufe und Erledigtem, der Deal (80 % für
//     sie, 20 % für dich, täglich um Mitternacht, nur bei Gewinn), was sie ab jetzt zusätzlich tut, dass du jederzeit
//     zurückkommen kannst, und "Köln übergeben und nach Hamburg fahren". Er öffnet sich nach der Zusage an Fiete, sobald
//     das Gespräch vorbei ist und kein anderer Dialog offen ist; sonst über die Seite der Rechten Hand.
//   - Abschnitt "Vollmacht" auf der Seite der Rechten Hand: Aufgaben mit Vollmacht als Schalter, Beträge, Widerruf.

import { useEffect, useState } from 'preact/hooks';
import { formatEuro } from '../../../core';
import {
  ActionSheet,
  Avatar,
  Button,
  Chip,
  Chips,
  Group,
  Icon,
  ItemContent,
  List,
  ListItem,
  MapDialog,
  onGameEvent,
  registerDialog,
  registerSlot,
  Stepper,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { getStaffMember } from '../../staff';
import {
  cityLabel,
  describeDone,
  describeFullPowerDone,
  FULL_POWER_SHARE,
  FULL_POWER_TASKS,
  fullPowerMissing,
  getRightHand,
  RIGHT_HAND_MAX_RANK,
  type RightHandSettings,
  rightHandRank,
} from '../index';

declare module '../../../ui' {
  interface DialogRegistry {
    'hierarchy.handover': { cityId: string };
  }
}

const SHARE = `${Math.round(FULL_POWER_SHARE * 100)} %`;
const REST = `${Math.round((1 - FULL_POWER_SHARE) * 100)} %`;

/** Übergabe einer Stadt an die Rechte Hand (über der Karte, am Handy-Bildschirm als Blatt). */
function HandoverDialog(props: { cityId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const rh = getRightHand(state);
  const m = rh ? getStaffMember(state, rh.staffId) : undefined;
  const city = cityLabel(props.cityId);
  const missing = fullPowerMissing(state, props.cityId);
  const close = () => ui.closeDialog();
  const done = rh ? describeDone(rh.done) : '';
  const handOver = () => {
    if (!dispatch({ type: 'hierarchy.grantFullPower', payload: { cityId: props.cityId } }).ok) return;
    close();
    // Mit der Übergabe ist Hamburg frei: Karte und Handy wechseln dorthin (die Fahrt über die A1 kommt mit Etappe 5).
    dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
  };
  return (
    <MapDialog label={`${city} übergeben`} onClose={close} class="handover" detent="large">
      <p class="handover__kicker">Übergabe</p>
      <h2 class="handover__title">{city} übergeben</h2>
      {m && rh ? (
        <div class="handover__who">
          <Avatar name={m.name} tone="brand" size="lg" />
          <div class="handover__who-text">
            <strong>{m.name}</strong>
            <Chips>
              <Chip color="brand" icon="medal">
                Stufe {rightHandRank(state)}/{RIGHT_HAND_MAX_RANK}
              </Chip>
              <Chip color="people" icon="heart">
                Loyalität {Math.round(m.stats.loyalty)}
              </Chip>
            </Chips>
            {done && <span class="handover__done">Zuletzt: {done}.</span>}
          </div>
        </div>
      ) : null}
      <div class="handover__deal">
        <div class="handover__deal-part">
          <span class="handover__label is-brand">Sie</span>
          <strong>{SHARE}</strong>
        </div>
        <div class="handover__deal-part">
          <span class="handover__label is-money">Du</span>
          <strong>{REST}</strong>
        </div>
        <p class="handover__deal-text">
          vom Tagesgewinn in {city} laut Kasse, täglich um Mitternacht, nur bei Gewinn. Ein Konto für alle Städte.
        </p>
      </div>
      <p class="handover__label">Ab jetzt macht sie auch</p>
      <Chips>
        {FULL_POWER_TASKS.map((t) => (
          <Chip key={t.key} color="brand" icon={t.icon}>
            {t.name}
          </Chip>
        ))}
      </Chips>
      <p class="handover__note">
        <Icon name="refresh" /> Du kannst jederzeit nach {city} schauen und eingreifen. Die Vollmacht lässt sich
        zurücknehmen, das kränkt sie aber.
      </p>
      {missing.length > 0 && (
        <ul class="handover__missing">
          {missing.map((line) => (
            <li key={line}>
              <Icon name="alertCircle" /> {line}
            </li>
          ))}
        </ul>
      )}
      <div class="handover__actions">
        <Button variant="subtle" onClick={close}>
          Später
        </Button>
        <Button variant="primary" icon="car" disabled={missing.length > 0} onClick={handOver}>
          {city} übergeben und nach Hamburg fahren
        </Button>
      </div>
    </MapDialog>
  );
}

registerDialog({
  id: 'hierarchy.handover',
  component: HandoverDialog,
  area: 'map',
  pausesGame: true,
  lockPhone: false,
});

/** Zusage an Fiete: Die Übergabe öffnet sich, sobald das Gespräch vorbei und kein anderer Dialog offen ist. */
let pendingHandover: { runId: string; cityId: string } | null = null;

onGameEvent('city.offerAccepted', 'hierarchy.handover', (_payload, _ui, state) => {
  pendingHandover = { runId: state.meta.runId, cityId: 'koeln' };
});

function HandoverOpener() {
  const { state } = useGame();
  const ui = useUi();
  const pending = pendingHandover && pendingHandover.runId === state.meta.runId ? pendingHandover : null;
  const busy = !!ui.state.dialog || !!ui.state.call;
  useEffect(() => {
    if (!pending || busy) return;
    const timer = window.setTimeout(() => {
      if (pendingHandover !== pending) return;
      pendingHandover = null;
      ui.openDialog('hierarchy.handover', { cityId: pending.cityId });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [pending, busy]);
  return null;
}

registerSlot('map.overlay', { id: 'hierarchy.handoverOpener', order: 99, component: HandoverOpener });

/** Abschnitt "Vollmacht" auf der Seite der Rechten Hand. */
export function FullPowerSection(props: { offered: boolean }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [confirm, setConfirm] = useState(false);
  const rh = getRightHand(state);
  if (!rh) return null;
  const fp = rh.fullPower;
  const configure = (settings: Partial<RightHandSettings>) =>
    dispatch({ type: 'hierarchy.configureRightHand', payload: { settings } });
  if (!fp) {
    if (!props.offered) return null;
    const missing = fullPowerMissing(state, 'koeln');
    return (
      <Group
        title="Vollmacht"
        icon="crown"
        color="brand"
        note={
          missing.length === 0
            ? `Sie ist bereit, Köln allein zu führen (für ${SHARE} vom Tagesgewinn).`
            : `Es fehlt noch: ${missing.join(' ')}`
        }
      >
        <List>
          <ListItem onClick={() => ui.openDialog('hierarchy.handover', { cityId: 'koeln' })}>
            <ItemContent icon="crown" color="brand" title="Köln übergeben …" meta="Übergabe ansehen" />
          </ListItem>
        </List>
      </Group>
    );
  }
  const done = describeFullPowerDone(fp.done);
  return (
    <>
      <Group
        title={`Vollmacht über ${cityLabel(fp.cityId)}`}
        icon="crown"
        color="brand"
        value={SHARE}
        note={`Sie führt ${cityLabel(fp.cityId)} allein und bekommt ${SHARE} vom Tagesgewinn, nur bei Gewinn.${done ? ` Seit dem Bericht: ${done}.` : ''}`}
      >
        {FULL_POWER_TASKS.map((t) => (
          <Toggle
            key={t.key}
            icon={t.icon}
            label={t.name}
            hint={t.hint}
            checked={rh.settings.fullPowerTasks[t.key]}
            onChange={(v) => configure({ fullPowerTasks: { ...rh.settings.fullPowerTasks, [t.key]: v } })}
          />
        ))}
        <List>
          <ListItem
            aside={
              <Stepper
                label="Schutzgeld bis"
                value={rh.settings.protectionMax}
                min={0}
                max={50000}
                step={500}
                format={(v) => formatEuro(v)}
                onChange={(protectionMax) => configure({ protectionMax })}
              />
            }
          >
            <ItemContent icon="handshake" color="danger" title="Schutzgeld bis" />
          </ListItem>
          <ListItem
            aside={
              <Stepper
                label="Deals bis"
                value={rh.settings.dealMax}
                min={0}
                max={100000}
                step={1000}
                format={(v) => formatEuro(v)}
                onChange={(dealMax) => configure({ dealMax })}
              />
            }
          >
            <ItemContent icon="package" color="goods" title="Deals bis" />
          </ListItem>
          <ListItem
            aside={
              <Stepper
                label="Ausbau pro Tag"
                value={rh.settings.expansionBudgetPerDay}
                min={0}
                max={50000}
                step={1000}
                format={(v) => formatEuro(v)}
                onChange={(expansionBudgetPerDay) => configure({ expansionBudgetPerDay })}
              />
            }
          >
            <ItemContent icon="building" color="place" title="Ausbau pro Tag" />
          </ListItem>
        </List>
      </Group>
      <div class="lt-actions">
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Vollmacht widerrufen …
        </Button>
      </div>
      <ActionSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Vollmacht widerrufen?"
        message="Dann entscheidest du in der Stadt wieder alles selbst und sie bekommt keinen Anteil mehr. Das kostet Loyalität, und sie ist eine Woche verstimmt."
        actions={[
          {
            label: 'Widerrufen',
            destructive: true,
            onSelect: () => dispatch({ type: 'hierarchy.revokeFullPower', payload: {} }),
          },
        ]}
      />
    </>
  );
}
