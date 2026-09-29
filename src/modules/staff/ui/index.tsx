// Oberfläche des Personals: Tab "Personal" mit filterbarer Übersicht, Mitarbeiter-Profil (Akte) als Panel,
// Kurzfassung im Tab "Geschäft", Läufer und Sicherheit im Spot-Panel, Hinweise bei Level-Aufstieg, Haft, Verrat.

import { useState } from 'preact/hooks';
import { formatEuro, formatPercent } from '../../../core';
import {
  Button,
  Card,
  Empty,
  Hint,
  Icon,
  IconChip,
  KeyValue,
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
  dailyWages,
  getStaff,
  getStaffMember,
  isSpecialist,
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
  }
}

type StatusFilter = 'all' | 'active' | 'trouble' | 'former';

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

/** Übersicht: Kennzahlen, Filter nach Status und Veedel, Gruppen nach Rolle mit Porträt, Rolle und Status. */
function StaffOverview() {
  const { state } = useGame();
  const ui = useUi();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [veedel, setVeedel] = useState('');
  const current = getStaff(state);
  const trouble = current.filter((m) => m.status === 'injured' || m.status === 'jailed');
  const source =
    status === 'former' ? [...getStaff(state, { status: 'quit' }), ...getStaff(state, { status: 'dead' })] : current;
  const veedelIds = [...new Set(current.map((m) => staffVeedel(state, m)).filter((v): v is string => !!v))].sort();
  const shown = source.filter((m) => {
    if (status === 'active' && m.status !== 'active') return false;
    if (status === 'trouble' && m.status !== 'injured' && m.status !== 'jailed') return false;
    if (veedel === NO_VEEDEL && staffVeedel(state, m)) return false;
    if (veedel && veedel !== NO_VEEDEL && staffVeedel(state, m) !== veedel) return false;
    return true;
  });
  const groups = ROLE_GROUPS.map((g) => ({ ...g, members: shown.filter(g.match) })).filter((g) => g.members.length > 0);
  return (
    <div class="staff-overview">
      <div class="staff-summary">
        <div class="staff-summary__item">
          <IconChip icon="users" color="people" size="sm" />
          <strong>{current.length}</strong>
          <span>Team</span>
        </div>
        <div class="staff-summary__item">
          <IconChip icon="coinEuro" color="money" size="sm" />
          <strong>{formatEuro(dailyWages(state))}</strong>
          <span>Lohn/Tag</span>
        </div>
        <div class="staff-summary__item">
          <IconChip
            icon={trouble.length > 0 ? 'alert' : 'checkCircle'}
            color={trouble.length > 0 ? 'warn' : 'money'}
            size="sm"
          />
          <strong>{trouble.length}</strong>
          <span>Ausfälle</span>
        </div>
      </div>
      {current.length > 0 && (
        <SegmentedControl
          wide
          aria-label="Status"
          options={[
            { value: 'all' as StatusFilter, label: 'Alle' },
            { value: 'active' as StatusFilter, label: 'Aktiv' },
            { value: 'trouble' as StatusFilter, label: 'Ausgefallen', badge: trouble.length },
            { value: 'former' as StatusFilter, label: 'Ehemalige' },
          ]}
          value={status}
          onChange={setStatus}
        />
      )}
      {veedelIds.length > 1 && (
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
      {groups.length === 0 ? (
        <Empty
          icon="users"
          action={
            current.length === 0 ? (
              <Button variant="primary" onClick={() => ui.openPhone('recruiting.contacts')}>
                Kontakte öffnen
              </Button>
            ) : undefined
          }
        >
          {current.length === 0
            ? 'Noch niemand im Team. Läufer heuerst du direkt an einem Spot an, Bewerber findest du bei den Kontakten.'
            : 'Niemand passt zum Filter.'}
        </Empty>
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
      <SpecialistBonuses />
    </div>
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

/** Kurzfassung im Tab "Geschäft". */
function StaffSummary() {
  const { state } = useGame();
  const ui = useUi();
  const staff = getStaff(state);
  const active = staff.filter((m) => m.status === 'active').length;
  return (
    <Card
      title="Personal"
      icon="users"
      color="people"
      status={staff.length === 0 ? 'idle' : active < staff.length ? 'warn' : 'good'}
      summary={staff.length === 0 ? 'niemand' : `${active} aktiv`}
      actions={
        <Button small onClick={() => ui.selectTab('staff')}>
          Öffnen
        </Button>
      }
    >
      {staff.length === 0 ? (
        <Empty>
          Noch keine Leute. Klick auf einen Spot, um dort einen Läufer anzuheuern. Was er kostet, hängt vom Spot ab.
        </Empty>
      ) : (
        <>
          <KeyValue label="Leute" value={`${active} aktiv, ${staff.length - active} fallen aus`} />
          <KeyValue label="Löhne" value={`${formatEuro(dailyWages(state))} pro Tag`} />
        </>
      )}
    </Card>
  );
}

/** Läufer und Sicherheit im Spot-Panel. */
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
  const profile = (m: StaffMember) => (
    <Button variant="link" onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
      {m.name}
    </Button>
  );
  return (
    <div class="runner-box">
      {runner ? (
        <span>
          {profile(runner)} (Level {runner.level}) bedient hier automatisch.
        </span>
      ) : (
        <>
          {absent && (
            <span>
              {profile(absent)} ist {STATUS_NAMES[absent.status]} und kommt danach zurück, wenn der Spot frei ist.
            </span>
          )}
          <div class="spot-staff__row">
            <span>{absent ? 'Bis dahin:' : 'Kein Läufer.'}</span>
            <Button
              disabled={state.wallet.dirty < hireCost}
              onClick={() => dispatch({ type: 'staff.hireRunner', payload: { spotId: props.spotId } })}
            >
              Anheuern ({formatEuro(hireCost)})
            </Button>
          </div>
          <Hint>Danach {formatEuro(RUNNER_DAILY_WAGE)} Lohn pro Tag. Der Preis hängt vom Spot ab.</Hint>
        </>
      )}
      {!runner && free('runner').length > 0 && (
        <div class="spot-staff__free">
          <span>Freie Läufer:</span>
          {free('runner').map((m) => (
            <Button key={m.id} small onClick={() => assign(m.id)}>
              {m.name}
            </Button>
          ))}
        </div>
      )}
      {guard ? (
        <span>Sicherheit: {profile(guard)} passt hier auf.</span>
      ) : (
        free('security').length > 0 && (
          <div class="spot-staff__free">
            <span>Sicherheit herholen:</span>
            {free('security').map((m) => (
              <Button key={m.id} small onClick={() => assign(m.id)}>
                {m.name}
              </Button>
            ))}
          </div>
        )
      )}
    </div>
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
registerSlot('tab:business', { id: 'staff.runners', order: 20, component: StaffSummary });
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
