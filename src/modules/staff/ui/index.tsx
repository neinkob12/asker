// Oberfläche des Personals: Tab "Personal" mit filterbarer Übersicht, Mitarbeiter-Profil (Akte) als Panel,
// Läufer und Sicherheit im Spot-Panel, Hinweise bei Level-Aufstieg, Haft, Verrat.

import { useState } from 'preact/hooks';
import { formatEuro, formatPercent, type GameState, withPeriod } from '../../../core';
import {
  Button,
  Chips,
  ContextMenu,
  Empty,
  Group,
  Hint,
  Icon,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerAdvisor,
  registerGameStat,
  registerPanel,
  registerSearch,
  registerSlot,
  registerTab,
  SegmentedControl,
  Slot,
  SummaryTiles,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityOfSpot, isBusinessSold } from '../../city';
import { playerSpot } from '../../customers';
import { getSpots, isSpotOpen } from '../../spots';
import {
  activeRunnerAt,
  assignmentLabel,
  bonus,
  bonusProvider,
  DRIVER_HIRE_COST,
  getStaff,
  getStaffMember,
  isAbsent,
  isFarmRole,
  isSpecialist,
  payrollDue,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
  RUNNER_HIRE_COST_MAX,
  RUNNER_HIRE_COST_MIN,
  roleName,
  runnerAt,
  runnerHireCost,
  STATUS_NAMES,
  type StaffMember,
  securityAt,
} from '../index';
import { AbsenceSheet, AbsentGroup } from './absence';
import { Portrait, ROLE_ICONS, ROLE_TONES, StatusTag, traitChips } from './common';
import { StaffProfile } from './Profile';
import './staff.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'staff.profile': { staffId: string };
  }
  interface SlotRegistry {
    /** Abschnitte im Mitarbeiter-Profil (z.B. Beförderung). */
    'staff.profile': { staffId: string };
    /** Personal als Baum (Ansicht "Aufbau" im Tab "Leute"): Boss, Rechte Hand, Leutnants, Spots ohne Leutnant. */
    'staff.tree': Record<string, never>;
  }
}

/** Filter oben: alle (als Aufbau) oder eine Rolle. */
type RoleFilter = 'all' | 'runner' | 'driver' | 'security' | 'specialist';

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'runner', label: 'Läufer' },
  { value: 'driver', label: 'Fahrer' },
  { value: 'security', label: 'Sicherheit' },
  { value: 'specialist', label: 'Spezialisten' },
];

/** Gruppen je Rolle (oder alle Spezialisten), gleiche Symbole wie im Porträt. */
const ROLE_GROUPS: { id: RoleFilter; label: string; icon: string; match: (m: StaffMember) => boolean }[] = [
  { id: 'runner', label: 'Läufer', icon: 'runner', match: (m) => m.role === 'runner' || m.role === 'courier' },
  { id: 'driver', label: 'Fahrer', icon: 'truck', match: (m) => m.role === 'driver' },
  { id: 'security', label: 'Sicherheit', icon: 'shield', match: (m) => m.role === 'security' },
  { id: 'specialist', label: 'Spezialisten', icon: 'scale', match: (m) => isSpecialist(m.role) },
];

export function StaffRow(props: { member: StaffMember }) {
  const { state } = useGame();
  const ui = useUi();
  const [confirm, setConfirm] = useState(false);
  const m = props.member;
  const employed = m.leftAt === null;
  const place = m.assignment ? assignmentLabel(state, m.assignment) : null;
  // Langer Druck (oder Rechtsklick): Akte, Einsatzort; Entlassen nur nach Bestätigung im Aktionsblatt.
  return (
    <>
      <ContextMenu
        label={`Aktionen für ${m.name}`}
        disabled={!employed}
        actions={[
          { label: 'Akte öffnen', icon: 'idCard', onSelect: () => ui.openPanel('staff.profile', { staffId: m.id }) },
          ...(m.assignment?.kind === 'spot'
            ? [
                {
                  label: place ?? 'Zum Spot',
                  icon: 'pin',
                  onSelect: () =>
                    m.assignment?.targetId && ui.openPanel('spots.spot', { spotId: m.assignment.targetId }),
                },
              ]
            : []),
          {
            label: isAbsent(m) ? 'Was tun …' : 'Entlassen …',
            icon: 'userMinus',
            destructive: !isAbsent(m),
            onSelect: () => setConfirm(true),
          },
        ]}
      >
        <StaffRowItem member={m} />
      </ContextMenu>
      <AbsenceSheet member={m} open={confirm} onClose={() => setConfirm(false)} />
    </>
  );
}

function StaffRowItem(props: { member: StaffMember }) {
  const { state } = useGame();
  const ui = useUi();
  const m = props.member;
  const employed = m.leftAt === null;
  return (
    <ListItem
      onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}
      value={employed ? `${formatEuro(m.wage)}/Tag` : undefined}
    >
      <div class="staff-row">
        <Portrait person={m} />
        <div class="staff-row__main">
          <strong>{m.name}</strong>
          <span class="staff-row__meta">
            <Icon name={employed && (m.assignment ?? m.returnTo) ? 'pin' : 'clock'} />
            {employed ? assignmentLabel(state, m.assignment ?? m.returnTo) : 'ausgeschieden'}
          </span>
          <Chips
            items={[
              { label: roleName(m.role), icon: ROLE_ICONS[m.role], color: ROLE_TONES[m.role] },
              { label: `Level ${m.level}` },
              ...traitChips(m),
            ]}
          >
            {m.status !== 'active' && <StatusTag status={m.status} />}
          </Chips>
        </div>
      </div>
    </ListItem>
  );
}

/**
 * Übersicht: Kennzahlen, darunter ein Filter als Segment (Alle, Läufer, Fahrer, Sicherheit, Spezialisten). "Alle"
 * zeigt das Personal als Aufbau (Boss, Rechte Hand, Leutnants mit Spots, Spots ohne Leutnant: Slot 'staff.tree' der
 * Hierarchie), darunter "Fällt aus", freie Leute, Spezialisten, Weitere, Anheuern und Ehemalige. Eine Rolle zeigt
 * nur ihre Leute. Darunter hängt "Leute finden" (recruiting, Slot 'tab:staff').
 */
function StaffOverview() {
  const { state } = useGame();
  const [filter, setFilter] = useState<RoleFilter>('all');
  // Das Personal folgt der aktiven Stadt (Auftrag 30); wer in einer anderen Stadt ist, steht unten extra.
  const city = activeCity(state);
  // Arbeiter und Gärtner auf den Fincas (Auftrag 42) stehen in der App Handel bei ihrer Finca, nicht hier.
  const everyone = getStaff(state).filter((m) => !isFarmRole(m.role));
  const current = everyone.filter((m) => m.cityId === city);
  const elsewhere = everyone.filter((m) => m.cityId !== city);
  const absent = current.filter(isAbsent);
  const former = [...getStaff(state, { status: 'quit' }), ...getStaff(state, { status: 'dead' })].filter(
    (m) => !isFarmRole(m.role) && m.cityId === city,
  );
  const group = ROLE_GROUPS.find((g) => g.id === filter);
  // Aufbau: Wer nicht im Baum steht (Leutnants, Rechte Hand, an Spots) und nicht ausfällt.
  const free = current.filter((m) => m.status === 'active' && !m.assignment && !isSpecialist(m.role));
  const specialists = current.filter((m) => isSpecialist(m.role) && !isAbsent(m));
  const others = current.filter(
    (m) =>
      !isAbsent(m) &&
      (m.assignment?.kind === 'warehouse' ||
        m.assignment?.kind === 'delivery' ||
        m.assignment?.kind === 'transport' ||
        m.assignment?.kind === 'travel'),
  );
  return (
    <div class="staff-overview">
      <SummaryTiles
        items={[
          { icon: 'users', color: 'people', value: String(current.length), label: 'Team' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(payrollDue(state)), label: 'Lohn/Tag' },
          {
            icon: absent.length > 0 ? 'alert' : 'checkCircle',
            color: absent.length > 0 ? 'warn' : 'money',
            value: String(absent.length),
            label: 'Ausfälle',
          },
        ]}
      />
      <Group title="Dein Team" icon="users" color="people" count={current.length}>
        <SegmentedControl wide aria-label="Rolle" options={ROLE_FILTERS} value={filter} onChange={setFilter} />
      </Group>
      {current.length === 0 && filter === 'all' ? (
        <Empty icon="users">Noch niemand im Team. Läufer heuerst du am Spot an oder stellst unten jemanden ein.</Empty>
      ) : group ? (
        <>
          <PeopleGroup
            title={group.label}
            icon={group.icon}
            members={current.filter(group.match)}
            empty={`Niemand mit der Rolle ${group.label}.`}
          />
          {group.id === 'driver' && <HireGroup />}
          <PeopleGroup title="Ehemalige" icon="clock" members={former.filter(group.match)} />
        </>
      ) : (
        <>
          <Slot name="staff.tree" props={{}} />
          <AbsentGroup members={absent} />
          <PeopleGroup title="Frei" icon="user" members={free} note="Ohne Einsatz, Leutnants holen sich freie Leute." />
          <PeopleGroup title="Spezialisten" icon="scale" members={specialists} />
          <PeopleGroup title="Weitere" icon="truck" members={others} note="Lager, Lieferungen und Fahrten." />
          <SpecialistBonuses />
          <HireGroup />
          {elsewhere.length > 0 && (
            // Auftrag 43: nur die Zahl, keine Akten mit Aktionen. Die Leute gehören dem Statthalter ihrer Stadt.
            <Group
              title="In anderen Städten"
              icon="building"
              color="system"
              value={`${elsewhere.length} Leute`}
              note="Arbeiten dort für deine Statthalter. Wechsel die Stadt, um sie zu sehen."
            />
          )}
          <PeopleGroup title="Ehemalige" icon="clock" members={former} />
        </>
      )}
    </div>
  );
}

/** Anheuern ohne Bewerber: Fahrer für Hafen und Umlagern (die Logistik braucht sie), Läufer am Spot. */
function HireGroup() {
  const { state, dispatch } = useGame();
  const drivers = getStaff(state, { role: 'driver', cityId: activeCity(state) }).length;
  return (
    <Group
      title="Anheuern"
      icon="userPlus"
      color="people"
      note="Läufer heuerst du am Spot an, alle anderen unten bei „Könntest du einstellen“."
    >
      <List>
        <ListItem
          action
          disabled={state.wallet.dirty < DRIVER_HIRE_COST}
          value={formatEuro(DRIVER_HIRE_COST)}
          onClick={() => dispatch({ type: 'staff.hireDriver', payload: {} })}
        >
          <ItemContent
            icon="truck"
            color="goods"
            title="Fahrer anheuern"
            meta={
              drivers === 0
                ? 'Holt Schiffsware am Hafen ab und lagert um. Ohne Fahrer fährst du selbst.'
                : `${drivers} ${drivers === 1 ? 'Fahrer' : 'Fahrer'} im Team`
            }
          />
        </ListItem>
      </List>
    </Group>
  );
}

/** Gruppe von Leuten (Frei, Spezialisten, Weitere, eine Rolle …); leer = nichts, außer ein Leertext ist gewünscht. */
function PeopleGroup(props: { title: string; icon: string; members: StaffMember[]; note?: string; empty?: string }) {
  if (props.members.length === 0 && !props.empty) return null;
  return (
    <Group title={props.title} icon={props.icon} color="people" count={props.members.length} note={props.note}>
      {props.members.length === 0 ? (
        <Empty icon="users">{props.empty}</Empty>
      ) : (
        <List>
          {props.members.map((m) => (
            <StaffRow key={m.id} member={m} />
          ))}
        </List>
      )}
    </Group>
  );
}

function SpecialistBonuses() {
  const { state } = useGame();
  const lines: string[] = [];
  const lawyer = bonusProvider(state, 'bailDiscount');
  if (lawyer) {
    lines.push(
      `${lawyer.name}: Kaution −${formatPercent(bonus(state, 'bailDiscount'))}, Haft −${formatPercent(bonus(state, 'jailReduction'))}`,
    );
  }
  const accountant = bonusProvider(state, 'launderingFeeDiscount');
  if (accountant) {
    lines.push(`${accountant.name}: Geldwäsche-Gebühr −${formatPercent(bonus(state, 'launderingFeeDiscount'))}`);
  }
  const contact = bonusProvider(state, 'raidWarning');
  if (contact) {
    lines.push(`${contact.name}: warnt zu ${formatPercent(bonus(state, 'raidWarning'))} vor Razzien`);
  }
  if (lines.length === 0)
    return <Hint>Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt) geben Boni, jeweils in ihrer Stadt.</Hint>;
  return (
    <div class="staff-bonuses">
      {lines.map((l) => (
        <Hint key={l}>{l}</Hint>
      ))}
    </div>
  );
}

/** Läufer und Sicherheit im Spot-Panel: wer hier arbeitet, Anheuern, freie Leute herholen. */
function SpotStaff(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const runner = activeRunnerAt(state, props.spotId);
  // In Haft oder verletzt: Der Spot ist frei, bis die Person zurückkommt.
  const absent = runner ? undefined : runnerAt(state, props.spotId);
  const guard = securityAt(state, { spotId: props.spotId })[0];
  const hireCost = runnerHireCost(state, props.spotId);
  const free = (role: 'runner' | 'security') =>
    getStaff(state, { role, status: 'active', cityId: cityOfSpot(state, props.spotId) }).filter((m) => !m.assignment);
  const assign = (staffId: string) =>
    dispatch({ type: 'staff.assign', payload: { staffId, assignment: { kind: 'spot', targetId: props.spotId } } });
  const open = (m: StaffMember) => ui.openPanel('staff.profile', { staffId: m.id });
  return (
    <Group
      title="Personal"
      icon="users"
      color="people"
      note={
        runner
          ? undefined
          : `Nach dem Anheuern ${formatEuro(RUNNER_DAILY_WAGE)} Lohn pro Tag. Der Preis hängt vom Spot ab.`
      }
      // J10: Warum der Läufer hier mehr Handgeld kostet als ein Bewerber im Personal.
      more={
        runner
          ? undefined
          : `Von der Straße steht sofort jemand hier, der den Spot kennt: Das Handgeld richtet sich nach Andrang und Preisen (${formatEuro(RUNNER_HIRE_COST_MIN)} bis ${formatEuro(RUNNER_HIRE_COST_MAX)}). Bewerber unter Personal, „Könntest du einstellen“, kosten meist weniger, dafür wartest du, bis jemand Passendes kommt.`
      }
    >
      <List>
        {runner && (
          <ListItem onClick={() => open(runner)}>
            <ItemContent
              icon="runner"
              color="people"
              title={runner.name}
              meta="bedient hier automatisch"
              tags={[{ label: 'Läufer', icon: 'runner', color: 'people' }, { label: `Level ${runner.level}` }]}
            />
          </ListItem>
        )}
        {absent && (
          <ListItem onClick={() => open(absent)}>
            <ItemContent
              icon="runner"
              color="warn"
              title={absent.name}
              meta={`ist ${STATUS_NAMES[absent.status]}, kommt danach zurück`}
            />
          </ListItem>
        )}
        {!runner && (
          <ListItem
            aside={
              <Button
                small
                variant="primary"
                disabled={state.wallet.dirty < hireCost}
                onClick={() => dispatch({ type: 'staff.hireRunner', payload: { spotId: props.spotId } })}
              >
                Anheuern ({formatEuro(hireCost)})
              </Button>
            }
          >
            <ItemContent
              icon="userPlus"
              color="people"
              title={absent ? 'Bis dahin' : 'Kein Läufer'}
              meta="Ein Läufer verkauft hier für dich."
            />
          </ListItem>
        )}
        {!runner &&
          free('runner').map((m) => (
            <ListItem
              key={m.id}
              aside={
                <Button small onClick={() => assign(m.id)}>
                  Hinstellen
                </Button>
              }
            >
              <ItemContent
                icon="runner"
                color="people"
                title={m.name}
                tags={[{ label: 'freier Läufer', icon: 'runner', color: 'people' }, { label: `Level ${m.level}` }]}
              />
            </ListItem>
          ))}
        {guard ? (
          <ListItem onClick={() => open(guard)}>
            <ItemContent
              icon="shield"
              color="people"
              title={guard.name}
              meta="passt hier auf"
              tags={[{ label: 'Sicherheit', icon: 'shield', color: 'danger' }]}
            />
          </ListItem>
        ) : (
          free('security').map((m) => (
            <ListItem
              key={m.id}
              aside={
                <Button small onClick={() => assign(m.id)}>
                  Herholen
                </Button>
              }
            >
              <ItemContent icon="shield" color="people" title={m.name} meta="freie Sicherheit" />
            </ListItem>
          ))
        )}
      </List>
    </Group>
  );
}

registerTab({
  id: 'staff',
  title: 'Personal',
  order: 30,
  // Nur die Stadt, in der du bist (Auftrag 43: in Rotterdam stand die Zahl aller Inhaftierten Deutschlands).
  badge: (state) => getStaff(state, { status: 'jailed', cityId: activeCity(state) }).length,
  // Nach dem Verkauf gehören die Leute den Statthaltern; Arbeiter für Fincas stellst du im Anbau ein.
  hiddenWhen: isBusinessSold,
});
registerSlot('tab:staff', { id: 'staff.overview', order: 10, component: StaffOverview });
registerSlot('spots.spotPanel', { id: 'staff.runner', order: 50, component: SpotStaff });
registerPanel({
  id: 'staff.profile',
  title: (props, state) => getStaffMember(state, props.staffId)?.name ?? 'Akte',
  component: StaffProfile,
});

// Banner nur für Leute der Stadt, in der du bist (Auftrag 43).
const here = (state: GameState, m: { cityId?: string }) => (m.cityId ?? 'koeln') === activeCity(state);
onGameEvent('staff.levelUp', 'staff.levelUp', (payload, ui, state) => {
  const m = getStaffMember(state, payload.staffId);
  if (m && here(state, m)) ui.toast(`${m.name} ist jetzt Level ${payload.level}.`, 'good');
});
// Festnahmen meldet schon die Polizei, hier nur Verletzungen.
onGameEvent('staff.statusChanged', 'staff.status', (payload, ui, state) => {
  const m = getStaffMember(state, payload.staffId);
  if (!m || !here(state, m)) return;
  if (payload.to === 'injured') ui.toast(`${m.name} ist verletzt.`, 'bad', { urgent: false });
});
onGameEvent('staff.betrayed', 'staff.betrayed', (payload, ui, state) => {
  const m = getStaffMember(state, payload.staffId);
  if (m && here(state, m))
    ui.toast(`${withPeriod(`Ärger mit ${m.name}`)} Schau in den Verlauf.`, 'bad', { urgent: false });
});

// Empfehlungen, Suche und Statistik
registerAdvisor({
  id: 'staff.hireRunner',
  advise: (state) => {
    // Pro Stadt (Auftrag 43): In einer neuen Stadt fängst du wieder ohne Leute an.
    const spot = getSpots(state, activeCity(state))[0];
    if (!spot || getStaff(state, { cityId: activeCity(state) }).length > 0) return null;
    return {
      id: 'staff.firstRunner',
      priority: 60,
      icon: 'runner',
      title: 'Läufer anheuern',
      text: 'Ein Läufer verkauft für dich an einem Spot, dann musst du nicht mehr selbst hin.',
      cost: RUNNER_HIRE_COST,
      actionLabel: 'Zum Spot',
      highlight: '.spot-marker',
      action: (ui) => {
        ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
        ui.openPanel('spots.spot', { spotId: spot.id });
      },
    };
  },
});

// J10: Wer über die Bewerber kam, stand „Frei: ohne Einsatz“ herum und kostete Lohn, ohne dass es jemand sagte.
registerAdvisor({
  id: 'staff.idleRunner',
  advise: (state) => {
    const cityId = activeCity(state);
    const idle = getStaff(state, { role: 'runner', status: 'active', cityId }).find((m) => !m.assignment);
    if (!idle) return null;
    // Nur, wenn es einen Spot gibt, an dem noch niemand steht (sonst holt ihn sich ein Leutnant).
    if (!getSpots(state, cityId).some((spot) => !runnerAt(state, spot.id))) return null;
    return {
      id: 'staff.idleRunner',
      priority: 72,
      icon: 'runner',
      title: `${idle.name} an einen Spot stellen`,
      text: `${idle.name} ist ohne Einsatz: Ohne Spot verkauft niemand, der Lohn läuft trotzdem (${formatEuro(idle.wage)} am Tag).`,
      actionLabel: 'Zur Akte',
      action: (ui) => ui.openPanel('staff.profile', { staffId: idle.id }),
    };
  },
});

// Auftrag 43, K8: Ein freigeschalteter Spot ohne Läufer verliert Kundschaft, und kein Rat sagte es (der Rat „Läufer
// anheuern“ kommt nur, solange du noch gar keine Leute hast).
registerAdvisor({
  id: 'staff.spotWithoutRunner',
  advise: (state) => {
    const cityId = activeCity(state);
    if (getStaff(state, { cityId }).length === 0) return null;
    // Wer ohne Einsatz herumsteht, meldet staff.idleRunner.
    if (getStaff(state, { role: 'runner', status: 'active', cityId }).some((m) => !m.assignment)) return null;
    const here = playerSpot(state);
    const spot = getSpots(state, cityId).find(
      (s) => s.id !== here && !runnerAt(state, s.id) && isSpotOpen(s, state.time),
    );
    if (!spot) return null;
    return {
      id: 'staff.spotWithoutRunner',
      priority: 64,
      icon: 'runner',
      title: `${spot.name} hat keinen Läufer`,
      text: 'Dort geht die Kundschaft wieder. Am Spot einen Läufer anheuern oder jemanden hinstellen.',
      actionLabel: 'Zum Spot',
      action: (ui) => {
        ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
        ui.openPanel('spots.spot', { spotId: spot.id });
      },
    };
  },
});

registerSearch({
  id: 'staff.search',
  label: 'Personal',
  order: 30,
  items: (state) =>
    getStaff(state, { cityId: activeCity(state) }).map((m) => ({
      id: m.id,
      title: m.name,
      subtitle: `${roleName(m.role)}, Level ${m.level}`,
      icon: 'user',
      run: (ui) => ui.openPanel('staff.profile', { staffId: m.id }),
    })),
});

registerGameStat({
  id: 'staff.count',
  order: 40,
  icon: 'users',
  label: 'Leute im Team',
  value: (state) => String(getStaff(state).length),
});
