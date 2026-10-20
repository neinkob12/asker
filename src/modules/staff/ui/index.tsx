// Oberfläche des Personals: Tab "Personal" mit Team-Tabelle, Problemfällen und Seiten je Gruppe, Mitarbeiter-Profil (Akte) als Panel,
// Läufer und Sicherheit im Spot-Panel, Hinweise bei Level-Aufstieg, Haft, Verrat.

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { formatEuro, type GameState, withPeriod } from '../../../core';
import {
  ActionSheet,
  Button,
  type CategoryColor,
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
  Slot,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityOfSpot, isBusinessSold } from '../../city';
import { playerSpot } from '../../customers';
import { isCapo, isLieutenant, isRightHand } from '../../hierarchy';
import { getSpots, isSpotOpen } from '../../spots';
import { tutorialAllows, tutorialAllowsRole, tutorialLockText } from '../../tutorial';
import {
  activeRunnerAt,
  assignmentLabel,
  bailCost,
  DRIVER_HIRE_COST,
  getStaff,
  getStaffMember,
  isAbsent,
  isFarmRole,
  isGoodSpecialist,
  isSpecialist,
  RUNNER_DAILY_WAGE,
  RUNNER_HIRE_COST,
  RUNNER_HIRE_COST_MAX,
  RUNNER_HIRE_COST_MIN,
  roleName,
  runnerAt,
  runnerHireCost,
  SECURITY_HIRE_COST,
  STATUS_NAMES,
  type StaffMember,
  type StaffRole,
  securityAt,
  specialistProvider,
  wageDue,
} from '../index';
import { AbsenceSheet, talkHint } from './absence';
import { effectChips, Portrait, ROLE_ICONS, ROLE_TONES, StatusTag, traitChips } from './common';
import { StaffProfile } from './Profile';
import './staff.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'staff.profile': { staffId: string };
    /** Alle Leute einer Gruppe (Tipp auf eine Zeile der Tabelle „Dein Team“). */
    'staff.role': { group: StaffGroupId };
  }
  interface SlotRegistry {
    /** Abschnitte im Mitarbeiter-Profil (z.B. Beförderung). */
    'staff.profile': { staffId: string };
    /** Personal als Baum (Ansicht "Aufbau" im Tab "Leute"): Boss, Rechte Hand, Leutnants, Spots ohne Leutnant. */
    'staff.tree': Record<string, never>;
  }
}

/**
 * Gruppen der Personal-App (Umbau 13.10.2026): Führung (Rechte Hand, Capos, Leutnants) und je Rolle. Wer Leutnant
 * oder Rechte Hand ist, steht nur unter Führung, nicht noch einmal bei seiner Rolle.
 */
export type StaffGroupId = 'lead' | 'runner' | 'driver' | 'security' | 'lawyer' | 'accountant' | 'policeContact';

interface StaffGroupDef {
  id: StaffGroupId;
  label: string;
  icon: string;
  color: CategoryColor;
  /** Rolle(n) der Gruppe; Führung hat keine. */
  roles?: readonly StaffRole[];
  /** Hinweis auf der Seite der Gruppe. */
  note?: string;
}

const STAFF_GROUPS: readonly StaffGroupDef[] = [
  { id: 'lead', label: 'Leutnants', icon: 'crown', color: 'brand' },
  {
    id: 'runner',
    label: 'Läufer',
    icon: 'runner',
    color: 'people',
    roles: ['runner', 'courier'],
    note: 'Läufer heuerst du direkt am Spot an.',
  },
  { id: 'driver', label: 'Fahrer', icon: 'truck', color: 'goods', roles: ['driver'] },
  {
    id: 'security',
    label: 'Sicherheit',
    icon: 'shield',
    color: 'danger',
    roles: ['security'],
    note: 'Sicherheit heuerst du direkt am Spot an. In ein Lager versetzt du sie über die Akte.',
  },
  { id: 'lawyer', label: 'Anwälte', icon: 'scale', color: 'law', roles: ['lawyer'] },
  { id: 'accountant', label: 'Buchhalter', icon: 'clipboard', color: 'money', roles: ['accountant'] },
  { id: 'policeContact', label: 'Polizei-Kontakte', icon: 'badge', color: 'law', roles: ['policeContact'] },
];

/** Steht die Person in der Führung (Rechte Hand, Capo, Leutnant)? */
function isLead(state: GameState, m: StaffMember): boolean {
  return isRightHand(state, m.id) || isCapo(state, m.id) || isLieutenant(state, m.id);
}

/** Gruppe einer Person. */
function groupOf(state: GameState, m: StaffMember): StaffGroupId {
  if (isLead(state, m)) return 'lead';
  return STAFF_GROUPS.find((g) => g.roles?.includes(m.role))?.id ?? 'runner';
}

/** Posten oder Rolle als Wort (für die Kacheln). */
function positionName(state: GameState, m: StaffMember): string {
  if (isRightHand(state, m.id)) return 'Rechte Hand';
  if (isCapo(state, m.id)) return 'Capo';
  if (isLieutenant(state, m.id)) return 'Leutnant';
  return roleName(m.role);
}

/** Aktuelle Leute der Stadt, in der du bist (ohne Fincas: die stehen in der App Handel bei ihrer Finca). */
function cityTeam(state: GameState): StaffMember[] {
  const city = activeCity(state);
  return getStaff(state).filter((m) => !isFarmRole(m.role) && m.cityId === city);
}

/** Zeigt die Tabelle diese Gruppe? Mit Leuten immer, sonst nur, wenn das Tutorial sie schon kennt. */
function groupShown(state: GameState, group: StaffGroupDef, count: number): boolean {
  if (count > 0 || group.id === 'runner') return true;
  if (group.id === 'lead') return tutorialAllows(state, 'staff.lieutenants');
  return (group.roles ?? []).some((role) => tutorialAllowsRole(state, role));
}

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
 * Startseite der Personal-App (Umbau 13.10.2026): oben dein Team als Tabelle (Rolle, Anzahl, Lohn pro Tag, Summe),
 * ein Tipp auf eine Zeile öffnet die Seite der Gruppe mit allen Leuten. Darunter bis zu acht Problemfälle als Kacheln
 * (in Haft zuerst, dann die mit der niedrigsten bekannten Loyalität). Darunter hängt die Rekrutierung
 * („Bewerber“, Slot 'tab:staff').
 */
function StaffOverview() {
  const { state } = useGame();
  const ui = useUi();
  const team = cityTeam(state);
  const city = activeCity(state);
  const elsewhere = getStaff(state).filter((m) => !isFarmRole(m.role) && m.cityId !== city).length;
  const rows = STAFF_GROUPS.map((group) => {
    const members = team.filter((m) => groupOf(state, m) === group.id);
    return { group, count: members.length, wages: members.reduce((sum, m) => sum + wageDue(state, m), 0) };
  }).filter((row) => groupShown(state, row.group, row.count));
  const total = rows.reduce((sum, row) => sum + row.wages, 0);
  return (
    <div class="staff-overview">
      <Group
        title="Dein Team"
        icon="users"
        color="people"
        note={
          // Auftrag 43: Leute anderer Städte nur als Zahl, sie gehören dem Statthalter ihrer Stadt.
          elsewhere > 0 ? `Dazu ${elsewhere === 1 ? '1 Person' : `${elsewhere} Leute`} in anderen Städten.` : undefined
        }
      >
        <div class="staff-table">
          <div class="staff-table__head" aria-hidden="true">
            <span>Rolle</span>
            <span>Leute</span>
            <span>Lohn/Tag</span>
            <span />
          </div>
          {rows.map(({ group, count, wages }) => (
            <button
              key={group.id}
              type="button"
              class="staff-table__row"
              aria-label={`${group.label}: ${count}, ${formatEuro(wages)} Lohn pro Tag`}
              onClick={() => ui.openPanel('staff.role', { group: group.id })}
            >
              <span class="staff-table__role">
                <span
                  class="staff-table__icon"
                  style={{ '--role-tone': `var(--cat-${group.color})` } as JSX.CSSProperties}
                >
                  <Icon name={group.icon} />
                </span>
                {group.label}
              </span>
              <span class="staff-table__num">{count}</span>
              <span class="staff-table__num">{formatEuro(wages)}</span>
              <Icon name="chevronRight" />
            </button>
          ))}
          <div class="staff-table__total">
            <span>Gesamt/Tag</span>
            <span class="staff-table__num">{team.length}</span>
            <span class="staff-table__num">{formatEuro(total)}</span>
            <span />
          </div>
        </div>
      </Group>
      <ProblemTiles team={team} />
    </div>
  );
}

/** Höchstens so viele Problemfälle als Kacheln. */
const PROBLEM_TILES = 8;
/** Unbekannte Loyalität zählt beim Sortieren wie ein mittlerer Wert (sonst verriete die Liste, was du nicht weißt). */
const UNKNOWN_LOYALTY = 50;

const knownLoyalty = (m: StaffMember): number | null => (m.knownStats.includes('loyalty') ? m.stats.loyalty : null);

/** Problemfälle: wer in Haft sitzt, dann die mit der niedrigsten Loyalität, alle Rollen. */
function problemCases(team: readonly StaffMember[]): StaffMember[] {
  const loyalty = (m: StaffMember) => knownLoyalty(m) ?? UNKNOWN_LOYALTY;
  return [...team]
    .sort(
      (a, b) =>
        Number(b.status === 'jailed') - Number(a.status === 'jailed') ||
        loyalty(a) - loyalty(b) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, PROBLEM_TILES);
}

function ProblemTiles(props: { team: readonly StaffMember[] }) {
  // Das i klappt die Erklärung auf (ein Tooltip beim Drüberfahren gab es am Handy nicht, Feedback 13.10.2026).
  const [info, setInfo] = useState(false);
  const problems = problemCases(props.team);
  if (problems.length === 0) {
    return <Empty icon="users">Noch niemand im Team. Läufer und Sicherheit heuerst du direkt am Spot an.</Empty>;
  }
  return (
    <Group
      title="Problemfälle"
      icon="alert"
      color="warn"
      value={
        <button
          type="button"
          class={`staff-info${info ? ' is-open' : ''}`}
          aria-expanded={info}
          aria-label="Was bedeuten die Zahlen?"
          onClick={() => setInfo(!info)}
        >
          <Icon name="info" />
        </button>
      }
    >
      {info && (
        <p class="staff-info__text">
          Die Zahl ist die Loyalität von 100. In Haft steht vorne, dann die niedrigste Loyalität.
        </p>
      )}
      <div class="staff-tiles">
        {problems.map((m) => (
          <ProblemTile key={m.id} member={m} />
        ))}
      </div>
    </Group>
  );
}

/** Kachel einer Person: Bild, Level, Loyalität; in Haft mit Gitter und „Freikaufen“, immer mit „Feuern“. */
function ProblemTile(props: { member: StaffMember }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [firing, setFiring] = useState(false);
  const m = props.member;
  const jailed = m.status === 'jailed';
  const loyalty = knownLoyalty(m);
  const bail = jailed ? bailCost(state, m.id) : 0;
  const tone = loyalty === null ? 'unknown' : loyalty < 30 ? 'bad' : loyalty < 50 ? 'warn' : 'ok';
  return (
    <div class={`staff-tile${jailed ? ' is-jailed' : ''}`}>
      <button
        type="button"
        class="staff-tile__open"
        title={`${m.name}, ${positionName(state, m)}`}
        aria-label={`${m.name}, ${positionName(state, m)}, Level ${m.level}, Loyalität ${loyalty ?? 'unbekannt'}${jailed ? ', in Haft' : ''}`}
        onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}
      >
        <span class="staff-tile__face">
          <Portrait person={m} />
          {jailed && <span class="staff-tile__bars" aria-hidden="true" />}
        </span>
        <span class="staff-tile__level">Lvl. {m.level}</span>
        {/* Loyalität als „8/100“; was die Zahl ist, sagt das i im Kopf der Gruppe. */}
        <span class={`staff-tile__loyalty is-${tone}`}>
          {loyalty ?? '?'}
          <small>/100</small>
        </span>
      </button>
      <div class="staff-tile__actions">
        {jailed && (
          <button
            type="button"
            class="staff-tile__action is-bail"
            disabled={state.wallet.dirty < bail}
            title={`Freikaufen (${formatEuro(bail)})`}
            aria-label={`${m.name} freikaufen für ${formatEuro(bail)}`}
            onClick={() => dispatch({ type: 'staff.bail', payload: { staffId: m.id } })}
          >
            <Icon name="unlock" />
          </button>
        )}
        <button
          type="button"
          class="staff-tile__action is-fire"
          title="Feuern"
          aria-label={`${m.name} feuern`}
          onClick={() => setFiring(true)}
        >
          <Icon name="userMinus" />
        </button>
      </div>
      <ActionSheet
        open={firing}
        onClose={() => setFiring(false)}
        title={`${m.name} feuern?`}
        message={talkHint(m)}
        actions={[
          {
            label: 'Feuern',
            icon: 'userMinus',
            destructive: true,
            onSelect: () => dispatch({ type: 'staff.fire', payload: { staffId: m.id } }),
          },
        ]}
      />
    </div>
  );
}

/**
 * Seite einer Gruppe (Tipp auf eine Zeile der Tabelle): alle Leute dieser Gruppe wie bisher als Liste, dazu was zur
 * Gruppe gehört (Aufbau bei der Führung, Fahrer anheuern, Wirkung der Spezialisten) und die Ehemaligen.
 */
function StaffGroupPage(props: { group: StaffGroupId }) {
  const { state } = useGame();
  const group = STAFF_GROUPS.find((g) => g.id === props.group) ?? STAFF_GROUPS[1];
  if (group.id === 'lead') {
    return (
      <div class="staff-overview">
        <Slot name="staff.tree" props={{}} />
      </div>
    );
  }
  const city = activeCity(state);
  const members = cityTeam(state).filter((m) => groupOf(state, m) === group.id);
  const former = [...getStaff(state, { status: 'quit' }), ...getStaff(state, { status: 'dead' })].filter(
    (m) => m.cityId === city && group.roles?.includes(m.role),
  );
  const specialist = group.roles?.some((role) => isSpecialist(role)) ?? false;
  return (
    <div class="staff-overview">
      <PeopleGroup
        title={group.label}
        icon={group.icon}
        members={members}
        note={group.note}
        empty={`Niemand mit der Rolle ${roleName(group.roles?.[0] ?? 'runner')}.`}
      />
      {group.id === 'driver' && <HireGroup />}
      {specialist && <SpecialistBonuses />}
      <PeopleGroup title="Ehemalige" icon="clock" members={former} />
    </div>
  );
}

/** Anheuern ohne Bewerber: Fahrer für Hafen und Umlagern (die Logistik braucht sie), Läufer am Spot. */
function HireGroup() {
  const { state, dispatch } = useGame();
  const drivers = getStaff(state, { role: 'driver', cityId: activeCity(state) }).length;
  return (
    <Group
      data-tour="staff.hire"
      title="Anheuern"
      icon="userPlus"
      color="people"
      note="Fahrer von der Straße sind sofort da. Bessere findest du unter „Bewerber“."
    >
      <List>
        {/* Auftrag 46b: Fahrer gibt es im Tutorial erst mit dem Hafen. */}
        {tutorialAllowsRole(state, 'driver') && (
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
        )}
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

/**
 * Wirkung der Spezialisten im Personal-Kopf (Auftrag 46e): pro Rolle die Person, die in der Stadt wirkt, mit ihren
 * Chips (Zoll, Heat, Kontrollen; Verhaftungen, Haft, Kaution; Erlös, Löhne). Ohne Spezialisten ein Satz.
 */
function SpecialistBonuses() {
  const { state } = useGame();
  const ui = useUi();
  const city = activeCity(state);
  const providers = (['seizure', 'arrests', 'revenue'] as const)
    .map((key) => specialistProvider(state, key, city))
    .filter((m): m is StaffMember => !!m);
  if (providers.length === 0) {
    return (
      <Hint icon="scale">
        Spezialisten wirken in ihrer Stadt: Der Polizei-Kontakt hält Zoll, Heat und Kontrollen klein, der Anwalt holt
        deine Leute raus, der Buchhalter bringt mehr Erlös und spart Löhne.
      </Hint>
    );
  }
  return (
    <Group title="Wirkung der Spezialisten" icon="scale" color="law" count={providers.length}>
      <List>
        {providers.map((m) => (
          <ListItem key={m.id} onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
            <ItemContent
              icon={ROLE_ICONS[m.role]}
              color="law"
              title={m.name}
              meta={isGoodSpecialist(m) ? `${roleName(m.role)}, gut` : roleName(m.role)}
              tags={effectChips(state, m)}
            />
          </ListItem>
        ))}
      </List>
    </Group>
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
  // Feedback 16.10.2026: Im Tutorial erst nach „Drei Kunden bedienen“, bis dahin ausgegraut mit Schloss.
  const runnerLocked = tutorialLockText(state, 'staff.runners');
  const free = (role: 'runner' | 'security') =>
    getStaff(state, { role, status: 'active', cityId: cityOfSpot(state, props.spotId) }).filter((m) => !m.assignment);
  const assign = (staffId: string) =>
    dispatch({ type: 'staff.assign', payload: { staffId, assignment: { kind: 'spot', targetId: props.spotId } } });
  const open = (m: StaffMember) => ui.openPanel('staff.profile', { staffId: m.id });
  return (
    <Group
      data-tour="spot.runner"
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
          : `Von der Straße steht sofort jemand hier, der den Spot kennt: Das Handgeld richtet sich nach Andrang und Preisen (${formatEuro(RUNNER_HIRE_COST_MIN)} bis ${formatEuro(RUNNER_HIRE_COST_MAX)}). Läufer und Sicherheit gibt es nur hier am Spot.`
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
                variant={runnerLocked ? 'default' : 'primary'}
                {...(runnerLocked ? { icon: 'lock' } : {})}
                disabled={!!runnerLocked || state.wallet.dirty < hireCost}
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
              meta={runnerLocked ?? 'Ein Läufer verkauft hier für dich.'}
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
          <>
            {/* Sicherheit gibt es seit dem Umbau der Personal-App nur noch hier am Spot. */}
            {tutorialAllowsRole(state, 'security') && (
              <ListItem
                aside={
                  <Button
                    small
                    disabled={state.wallet.dirty < SECURITY_HIRE_COST}
                    onClick={() => dispatch({ type: 'staff.hireSecurity', payload: { spotId: props.spotId } })}
                  >
                    Anheuern ({formatEuro(SECURITY_HIRE_COST)})
                  </Button>
                }
              >
                <ItemContent
                  icon="shield"
                  color="danger"
                  title="Keine Sicherheit"
                  meta="Passt auf Ware und Kasse auf."
                />
              </ListItem>
            )}
            {free('security').map((m) => (
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
            ))}
          </>
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
  // Nach dem Verkauf gehören die Leute den Statthaltern; Arbeiter für Fincas stellst du im Anbau ein. Am Anfang kommt
  // die App mit Peters Quest.
  hiddenWhen: (state) => isBusinessSold(state),
});
registerSlot('tab:staff', { id: 'staff.overview', order: 10, component: StaffOverview });
registerSlot('spots.spotPanel', { id: 'staff.runner', order: 50, component: SpotStaff });
registerPanel({
  id: 'staff.role',
  title: (props) => STAFF_GROUPS.find((g) => g.id === props.group)?.label ?? 'Personal',
  component: StaffGroupPage,
});
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
