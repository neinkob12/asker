// Oberfläche des Personals: Tab "Personal" mit filterbarer Übersicht, Mitarbeiter-Profil (Akte) als Panel,
// Läufer und Sicherheit im Spot-Panel, Hinweise bei Level-Aufstieg, Haft, Verrat.

import { useState } from 'preact/hooks';
import { formatEuro, formatPercent } from '../../../core';
import {
  Button,
  ContextMenu,
  Empty,
  Group,
  Hint,
  Icon,
  IconChip,
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
  Select,
  Slot,
  SummaryTiles,
  useGame,
  useUi,
} from '../../../ui';
import { getSpots } from '../../spots';
import { veedelName } from '../../veedel';
import {
  activeRunnerAt,
  assignmentLabel,
  bonus,
  bonusProvider,
  getStaff,
  getStaffMember,
  isAbsent,
  isSpecialist,
  payrollDue,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
  roleName,
  runnerAt,
  runnerHireCost,
  STATUS_NAMES,
  type StaffMember,
  securityAt,
  staffVeedel,
} from '../index';
import { AbsenceSheet, AbsentGroup } from './absence';
import { Portrait, StatusTag } from './common';
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

type View = 'tree' | 'all' | 'former';

/** Gruppen der Übersicht: eine Rolle (oder alle Spezialisten) pro Gruppe, gleiche Symbole wie im Porträt. */
const ROLE_GROUPS: { id: string; label: string; icon: string; match: (m: StaffMember) => boolean }[] = [
  { id: 'runner', label: 'Läufer', icon: 'runner', match: (m) => m.role === 'runner' },
  { id: 'courier', label: 'Kuriere', icon: 'bike', match: (m) => m.role === 'courier' },
  { id: 'driver', label: 'Fahrer', icon: 'truck', match: (m) => m.role === 'driver' },
  { id: 'security', label: 'Sicherheit', icon: 'shield', match: (m) => m.role === 'security' },
  { id: 'specialist', label: 'Spezialisten', icon: 'scale', match: (m) => isSpecialist(m.role) },
];

const NO_VEEDEL = '-';

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
    <ListItem onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
      <div class="staff-row">
        <Portrait person={m} />
        <div class="staff-row__main">
          <strong>{m.name}</strong>
          <span class="staff-row__meta">
            {roleName(m.role)} · Level {m.level}
          </span>
          <span class="staff-row__meta">
            <Icon name={employed && (m.assignment ?? m.returnTo) ? 'pin' : 'clock'} />
            {employed ? assignmentLabel(state, m.assignment ?? m.returnTo) : 'ausgeschieden'}
          </span>
        </div>
        <StatusTag status={m.status} />
      </div>
    </ListItem>
  );
}

/**
 * Übersicht: Kennzahlen und drei Ansichten. "Aufbau" zeigt das Personal als Baum (Boss, Rechte Hand, Leutnants mit
 * Spots, Spots ohne Leutnant: Slot 'staff.tree' der Hierarchie), darunter "Fällt aus", freie Leute, Spezialisten und
 * Weitere. "Alle" zeigt alle nach Rolle (mit Veedel-Filter), "Ehemalige" wer gegangen ist.
 */
function StaffOverview() {
  const { state } = useGame();
  const ui = useUi();
  const [view, setView] = useState<View>('tree');
  const [veedel, setVeedel] = useState('');
  const current = getStaff(state);
  const absent = current.filter(isAbsent);
  const former = [...getStaff(state, { status: 'quit' }), ...getStaff(state, { status: 'dead' })];
  const veedelIds = [...new Set(current.map((m) => staffVeedel(state, m)).filter((v): v is string => !!v))].sort();
  const source = view === 'former' ? former : current;
  const shown = source.filter((m) => {
    if (view !== 'all') return true;
    if (veedel === NO_VEEDEL && staffVeedel(state, m)) return false;
    if (veedel && veedel !== NO_VEEDEL && staffVeedel(state, m) !== veedel) return false;
    return true;
  });
  const groups = ROLE_GROUPS.map((g) => ({
    ...g,
    members: shown.filter((m) => (view === 'former' || !isAbsent(m)) && g.match(m)),
  })).filter((g) => g.members.length > 0);
  // Aufbau: Wer nicht im Baum steht (Leutnants, Rechte Hand, an Spots) und nicht ausfällt.
  const free = current.filter((m) => m.status === 'active' && !m.assignment && !isSpecialist(m.role));
  const specialists = current.filter((m) => isSpecialist(m.role) && !isAbsent(m));
  const others = current.filter(
    (m) =>
      !isAbsent(m) &&
      (m.assignment?.kind === 'warehouse' || m.assignment?.kind === 'delivery' || m.assignment?.kind === 'transport'),
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
      {(current.length > 0 || former.length > 0) && (
        <SegmentedControl
          wide
          aria-label="Ansicht"
          options={[
            { value: 'tree' as View, label: 'Aufbau', badge: absent.length },
            { value: 'all' as View, label: 'Alle' },
            { value: 'former' as View, label: 'Ehemalige' },
          ]}
          value={view}
          onChange={setView}
        />
      )}
      {current.length === 0 && view !== 'former' ? (
        <Empty
          icon="users"
          action={
            <Button variant="primary" onClick={() => ui.openPhone('recruiting.contacts')}>
              Kontakte öffnen
            </Button>
          }
        >
          Noch niemand im Team. Läufer heuerst du direkt an einem Spot an, Bewerber findest du bei den Kontakten.
        </Empty>
      ) : view === 'tree' ? (
        <>
          <Slot name="staff.tree" props={{}} />
          <AbsentGroup members={absent} />
          <PeopleGroup title="Frei" icon="user" members={free} note="Ohne Einsatz. Leutnants holen sich freie Leute." />
          <PeopleGroup title="Spezialisten" icon="scale" members={specialists} />
          <PeopleGroup title="Weitere" icon="truck" members={others} note="Lager, Lieferungen und Fahrten." />
          <SpecialistBonuses />
        </>
      ) : (
        <>
          {view === 'all' && veedelIds.length > 1 && (
            <Select
              wide
              label="Veedel"
              value={veedel}
              options={[
                { value: '', label: 'Alle Veedel' },
                ...veedelIds.map((id) => ({ value: id, label: veedelName(id) })),
                { value: NO_VEEDEL, label: 'Ohne Einsatz' },
              ]}
              onChange={setVeedel}
            />
          )}
          {view === 'all' && <AbsentGroup members={absent} />}
          {groups.length === 0 ? (
            <Empty icon="users">{view === 'former' ? 'Noch niemand ist gegangen.' : 'Niemand passt zum Filter.'}</Empty>
          ) : (
            groups.map((g) => (
              <section key={g.id} class="staff-group">
                <header class="staff-group__head">
                  <IconChip icon={g.icon} color="people" solid size="xs" />
                  <h3 class="staff-group__title">{g.label}</h3>
                  <span class="staff-group__count">{g.members.length}</span>
                </header>
                <List>
                  {g.members.map((m) => (
                    <StaffRow key={m.id} member={m} />
                  ))}
                </List>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

/** Gruppe von Leuten im Aufbau (Frei, Spezialisten, Weitere), leer = nichts. */
function PeopleGroup(props: { title: string; icon: string; members: StaffMember[]; note?: string }) {
  if (props.members.length === 0) return null;
  return (
    <Group title={props.title} icon={props.icon} color="people" count={props.members.length} note={props.note}>
      <List>
        {props.members.map((m) => (
          <StaffRow key={m.id} member={m} />
        ))}
      </List>
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
  if (lines.length === 0) return <Hint>Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt) geben Boni.</Hint>;
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
    getStaff(state, { role, status: 'active' }).filter((m) => !m.assignment);
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
    >
      <List>
        {runner && (
          <ListItem onClick={() => open(runner)}>
            <ItemContent
              icon="runner"
              color="people"
              title={runner.name}
              meta={`Läufer · Level ${runner.level} · bedient hier automatisch`}
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
              <ItemContent icon="runner" color="people" title={m.name} meta={`freier Läufer · Level ${m.level}`} />
            </ListItem>
          ))}
        {guard ? (
          <ListItem onClick={() => open(guard)}>
            <ItemContent icon="shield" color="people" title={guard.name} meta="Sicherheit · passt hier auf" />
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
  // Kurz, damit alle Tabs in die Seitenleiste passen.
  title: 'Leute',
  order: 30,
  badge: (state) => getStaff(state, { status: 'jailed' }).length,
});
registerSlot('tab:staff', { id: 'staff.overview', order: 10, component: StaffOverview });
registerSlot('spots.spotPanel', { id: 'staff.runner', order: 50, component: SpotStaff });
registerPanel({
  id: 'staff.profile',
  title: (props, state) => getStaffMember(state, props.staffId)?.name ?? 'Akte',
  component: StaffProfile,
});

onGameEvent('staff.levelUp', 'staff.levelUp', (payload, ui, state) => {
  const m = getStaffMember(state, payload.staffId);
  if (m) ui.toast(`${m.name} ist jetzt Level ${payload.level}.`, 'good');
});
// Festnahmen meldet schon die Polizei, hier nur Verletzungen.
onGameEvent('staff.statusChanged', 'staff.status', (payload, ui, state) => {
  const m = getStaffMember(state, payload.staffId);
  if (!m) return;
  if (payload.to === 'injured') ui.toast(`${m.name} ist verletzt.`, 'bad');
});
onGameEvent('staff.betrayed', 'staff.betrayed', (payload, ui, state) => {
  const m = getStaffMember(state, payload.staffId);
  if (m) ui.toast(`Ärger mit ${m.name}. Schau ins Journal.`, 'bad');
});

// Empfehlungen, Suche und Statistik
registerAdvisor({
  id: 'staff.hireRunner',
  advise: (state) => {
    const spot = getSpots(state)[0];
    if (!spot || getStaff(state).length > 0) return null;
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

registerSearch({
  id: 'staff.search',
  label: 'Leute',
  order: 30,
  items: (state) =>
    getStaff(state).map((m) => ({
      id: m.id,
      title: m.name,
      subtitle: `${roleName(m.role)} · Level ${m.level}`,
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
