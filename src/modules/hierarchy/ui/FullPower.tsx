// Vollmacht der Rechten Hand im Handy und über der Karte (Auftrag 30):
//   - Übergabe-Dialog über der Kartenfläche (Look "Glas"): die Rechte Hand mit Stufe und Erledigtem, der Deal (80 % für
//     sie, 20 % für dich, täglich um Mitternacht, nur bei Gewinn), was sie ab jetzt zusätzlich tut, dass du jederzeit
//     zurückkommen kannst, das Startpaket (Auftrag 36: neue Rechte Hand, bis zu fünf Leute, Fahrzeuge) und "<Stadt>
//     übergeben und nach <Ziel> fahren" ('city.handOver' mit pack). Nach der Zusage fragt der Kontakt der neuen Stadt
//     selbst im Gespräch, ob du übergibst (ohne Startpaket); wer erst noch etwas regeln oder Leute mitnehmen will, kommt
//     über die Karte unter Geld und Heat oder die Seite der Rechten Hand hierher.
//   - Abschnitt "Vollmacht" auf der Seite der Rechten Hand: Aufgaben mit Vollmacht als Schalter, Beträge, Widerruf.

import { useState } from 'preact/hooks';
import { formatEuro, personLook } from '../../../core';
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
  registerDialog,
  Stepper,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityName, nextCityAfter, packVehicles, startMoneyDue } from '../../city';
import { vehicleName } from '../../fleet';
import { getSpot } from '../../spots';
import { getStaffMember, roleName } from '../../staff';
import {
  cityLabel,
  describeDone,
  describeFullPowerDone,
  FULL_POWER_SHARE,
  FULL_POWER_TASKS,
  fullPowerMissing,
  getRightHand,
  isTaskUnlocked,
  RIGHT_HAND_MAX_RANK,
  RIGHT_HAND_TASKS,
  type RightHandSettings,
  rightHandRank,
  START_PACK_LEADER_MIN_LEVEL,
  START_PACK_MAX_STAFF,
  startPackLeaders,
  startPackRank,
  startPackStaff,
} from '../index';

declare module '../../../ui' {
  interface DialogRegistry {
    /** Übergabe der Stadt cityId; toCityId = wohin es danach geht (Standard: die zugesagte bzw. nächstgelegene). */
    'hierarchy.handover': { cityId: string; toCityId?: string };
  }
}

const SHARE = `${Math.round(FULL_POWER_SHARE * 100)} %`;
const REST = `${Math.round((1 - FULL_POWER_SHARE) * 100)} %`;

/** Übergabe einer Stadt an die Rechte Hand (über der Karte, am Handy-Bildschirm als Blatt). */
function HandoverDialog(props: { cityId: string; toCityId?: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const rh = getRightHand(state, props.cityId);
  const m = rh ? getStaffMember(state, rh.staffId) : undefined;
  const city = cityLabel(props.cityId);
  const to = props.toCityId ?? nextCityAfter(state, props.cityId);
  const missing = fullPowerMissing(state, props.cityId);
  const close = () => ui.closeDialog();
  const done = rh ? describeDone(rh.done) : '';
  const leaders = startPackLeaders(state, props.cityId);
  const people = startPackStaff(state, props.cityId);
  // Fahrzeuge mit fester Route bleiben (sonst fiele die Route aus).
  const vehicles = packVehicles(state, props.cityId);
  const startMoney = to ? startMoneyDue(state, props.cityId, to) : 0;
  // Vorschlag: die beste neue Rechte Hand, sonst niemand; Leute und Fahrzeuge wählt man selbst.
  const [leaderId, setLeaderId] = useState<string | null>(leaders[0]?.id ?? null);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [vehicleIds, setVehicleIds] = useState<number[]>([]);
  const toggleStaff = (id: string) =>
    setStaffIds((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length < START_PACK_MAX_STAFF ? [...list, id] : list,
    );
  const toggleVehicle = (id: number) =>
    setVehicleIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  // Übergeben und sofort in die nächste Stadt fahren (Ankunft: sie wird aktiv), mit Startpaket, in einem Befehl.
  const handOver = () => {
    // Keine Stadt mehr frei (die übrigen sind noch Schablonen): nur die Vollmacht, du bleibst.
    if (!to) {
      if (dispatch({ type: 'hierarchy.grantFullPower', payload: { cityId: props.cityId } }).ok) close();
      return;
    }
    const pack = {
      leaderId: leaders.some((l) => l.id === leaderId) ? leaderId : null,
      staffIds: staffIds.filter((id) => people.some((p) => p.id === id)),
      vehicleIds: vehicleIds.filter((id) => vehicles.some((v) => v.id === id)),
    };
    if (dispatch({ type: 'city.handOver', payload: { cityId: props.cityId, toCityId: to, pack } }).ok) close();
  };
  return (
    <MapDialog label={`${city} übergeben`} onClose={close} class="handover" detent="large">
      <p class="handover__kicker">Übergabe</p>
      <h2 class="handover__title">{city} übergeben</h2>
      {m && rh ? (
        <div class="handover__who">
          <Avatar name={m.name} look={personLook(m.name, m.age)} tone="brand" size="lg" />
          <div class="handover__who-text">
            <strong>{m.name}</strong>
            <Chips>
              <Chip color="brand" icon="medal">
                Stufe {rightHandRank(state, props.cityId)}/{RIGHT_HAND_MAX_RANK}
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
      {to && (
        <Group
          title={`Startpaket für ${cityName(to)}`}
          icon="package"
          color="people"
          value={
            startMoney > 0
              ? `+${formatEuro(startMoney)}`
              : `${(leaderId ? 1 : 0) + staffIds.length + vehicleIds.length}`
          }
          note={
            startMoney > 0
              ? `Startgeld vom Statthalter: ${formatEuro(startMoney)}. Das Vertrauen deiner Lieferanten kommt ohnehin mit.`
              : 'Das Vertrauen deiner Lieferanten kommt ohnehin mit.'
          }
        >
          <List>
            {leaders.length === 0 ? (
              <ListItem>
                <ItemContent
                  icon="crown"
                  color="brand"
                  title="Keine neue Rechte Hand"
                  meta={`Ein Capo, sonst ein Leutnant ab Level ${START_PACK_LEADER_MIN_LEVEL}, kann mitkommen und dort Rechte Hand werden.`}
                />
              </ListItem>
            ) : (
              [...leaders, null].map((l) => (
                <ListItem
                  key={l?.id ?? 'none'}
                  active={leaderId === (l?.id ?? null)}
                  onClick={() => setLeaderId(l?.id ?? null)}
                  aside={<Icon name={leaderId === (l?.id ?? null) ? 'checkCircle' : 'plusCircle'} />}
                >
                  {l ? (
                    <ItemContent
                      icon="crown"
                      color="brand"
                      title={`${l.name} als Rechte Hand`}
                      tags={[
                        { label: `Level ${l.level}`, color: 'people' },
                        { label: `Stufe ${startPackRank(l.level)}`, color: 'brand' },
                      ]}
                    />
                  ) : (
                    <ItemContent icon="crown" title="Ohne neue Rechte Hand" />
                  )}
                </ListItem>
              ))
            )}
          </List>
        </Group>
      )}
      {to && people.length > 0 && (
        <Group
          title="Leute"
          icon="user"
          color="people"
          value={`${staffIds.length}/${START_PACK_MAX_STAFF}`}
          collapsible
          open={false}
        >
          <List>
            {people.map((p) => (
              <ListItem
                key={p.id}
                active={staffIds.includes(p.id)}
                onClick={() => toggleStaff(p.id)}
                aside={<Icon name={staffIds.includes(p.id) ? 'checkCircle' : 'plusCircle'} />}
              >
                <ItemContent
                  icon="user"
                  color="people"
                  title={p.name}
                  tags={[
                    { label: roleName(p.role) },
                    { label: `Level ${p.level}` },
                    p.assignment?.kind === 'spot'
                      ? { label: `am Spot ${getSpot(state, p.assignment.targetId)?.name ?? ''}`, color: 'place' }
                      : null,
                  ]}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      {to && vehicles.length > 0 && (
        <Group title="Fahrzeuge" icon="car" color="goods" value={`${vehicleIds.length}`}>
          <List>
            {vehicles.map((v) => (
              <ListItem
                key={v.id}
                active={vehicleIds.includes(v.id)}
                onClick={() => toggleVehicle(v.id)}
                aside={<Icon name={vehicleIds.includes(v.id) ? 'checkCircle' : 'plusCircle'} />}
              >
                <ItemContent icon="car" color="goods" title={vehicleName(state, v.id)} />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
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
        <Button variant="primary" icon={to ? 'car' : 'crown'} disabled={missing.length > 0} onClick={handOver}>
          {to ? `${city} übergeben und nach ${cityName(to)} fahren` : `${city} übergeben`}
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
    const here = activeCity(state);
    const missing = fullPowerMissing(state, here);
    // Aufgaben, die schon frei sind, aber aus: für die Vollmacht mit einem Tipp alle an.
    const off = RIGHT_HAND_TASKS.filter((t) => !rh.settings[t.key] && isTaskUnlocked(state, t.key));
    return (
      <Group
        title="Vollmacht"
        icon="crown"
        color="brand"
        note={
          missing.length === 0
            ? `Sie ist bereit, ${cityName(here)} allein zu führen (für ${SHARE} vom Tagesgewinn).`
            : `Es fehlt noch: ${missing.join(' ')}`
        }
      >
        <List>
          {off.length > 0 && (
            <ListItem onClick={() => configure(Object.fromEntries(off.map((t) => [t.key, true])))}>
              <ItemContent
                icon="checkCircle"
                color="brand"
                title={off.length === 1 ? `${off[0].name} einschalten` : 'Alle Aufgaben einschalten'}
                meta="Für die Vollmacht muss alles laufen"
              />
            </ListItem>
          )}
          <ListItem onClick={() => ui.openDialog('hierarchy.handover', { cityId: here })}>
            <ItemContent icon="crown" color="brand" title={`${cityName(here)} übergeben …`} meta="Übergabe ansehen" />
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
