// Oberfläche des Personals: Tab "Personal" mit filterbarer Übersicht, Mitarbeiter-Profil (Akte) als Panel,
// Kurzfassung im Tab "Geschäft", Läufer und Sicherheit im Spot-Panel, Hinweise bei Level-Aufstieg, Haft, Verrat.

import { useState } from 'preact/hooks';
import { formatEuro, formatPercent } from '../../../core';
import {
  Button,
  Card,
  Empty,
  Hint,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  registerPanel,
  registerSlot,
  registerTab,
  Select,
  useGame,
  useUi,
} from '../../../ui';
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
  roleName,
  runnerAt,
  runnerHireCost,
  STATUS_NAMES,
  type StaffMember,
  securityAt,
  staffVeedel,
} from '../index';
import { Portrait, StatusStamp } from './common';
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

type RoleFilter = 'all' | 'runner' | 'courier' | 'security' | 'specialist';
type StatusFilter = 'all' | 'active' | 'injured' | 'jailed' | 'former';

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'Typ' },
  { value: 'runner', label: 'Läufer' },
  { value: 'courier', label: 'Kuriere' },
  { value: 'security', label: 'Sicherheit' },
  { value: 'specialist', label: 'Spezialisten' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Status' },
  { value: 'active', label: 'Aktiv' },
  { value: 'injured', label: 'Verletzt' },
  { value: 'jailed', label: 'In Haft' },
  { value: 'former', label: 'Gekündigt' },
];

const NO_VEEDEL = '-';

function matchesRole(m: StaffMember, filter: RoleFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'specialist') return isSpecialist(m.role);
  return m.role === filter;
}

export function StaffRow(props: { member: StaffMember }) {
  const { state } = useGame();
  const ui = useUi();
  const m = props.member;
  return (
    <ListItem onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
      <div class="staff-row">
        <Portrait person={m} />
        <div class="staff-row__main">
          <strong>{m.name}</strong>
          <span class="ui-hint">
            {roleName(m.role)} · Level {m.level} ·{' '}
            {m.leftAt === null ? assignmentLabel(state, m.assignment ?? m.returnTo) : 'ausgeschieden'}
          </span>
        </div>
        <StatusStamp status={m.status} />
      </div>
    </ListItem>
  );
}

/** Personal-Übersicht, filterbar nach Typ, Status und Veedel. */
function StaffOverview() {
  const { state } = useGame();
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [veedel, setVeedel] = useState('');
  const current = getStaff(state);
  const source =
    status === 'former' ? [...getStaff(state, { status: 'quit' }), ...getStaff(state, { status: 'dead' })] : current;
  const veedelIds = [...new Set(current.map((m) => staffVeedel(state, m)).filter((v): v is string => !!v))].sort();
  const shown = source.filter((m) => {
    if (!matchesRole(m, role)) return false;
    if (status !== 'all' && status !== 'former' && m.status !== status) return false;
    if (veedel === NO_VEEDEL && staffVeedel(state, m)) return false;
    if (veedel && veedel !== NO_VEEDEL && staffVeedel(state, m) !== veedel) return false;
    return true;
  });
  const jailed = current.filter((m) => m.status === 'jailed').length;
  return (
    <Card title="Personal" class="staff-overview">
      <p class="ui-hint">
        {current.length} {current.length === 1 ? 'Person' : 'Leute'}
        {jailed > 0 ? `, ${jailed} in Haft` : ''} · Löhne {formatEuro(dailyWages(state))} pro Tag
      </p>
      <div class="staff-filters">
        <Select label="Typ" value={role} options={ROLE_FILTERS} onChange={setRole} />
        <Select label="Status" value={status} options={STATUS_FILTERS} onChange={setStatus} />
        <Select
          label="Veedel"
          value={veedel}
          options={[
            { value: '', label: 'Veedel' },
            ...veedelIds.map((id) => ({ value: id, label: veedelName(id) })),
            { value: NO_VEEDEL, label: 'Ohne Einsatz' },
          ]}
          onChange={setVeedel}
        />
      </div>
      {shown.length === 0 ? (
        <Empty>
          {current.length === 0
            ? 'Noch niemand. Läufer heuerst du direkt am Spot an, Bewerber und Kontakte findest du im Handy.'
            : 'Niemand passt zum Filter.'}
        </Empty>
      ) : (
        <List>
          {shown.map((m) => (
            <StaffRow key={m.id} member={m} />
          ))}
        </List>
      )}
      <SpecialistBonuses />
    </Card>
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
