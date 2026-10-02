// Mitarbeiter-Profil, gestaltet wie eine Akte: Porträt, Werte, Laufbahn, Bilanz und Aktionen.
// Andere Module hängen eigene Abschnitte über den Slot 'staff.profile' an (z.B. Beförderung zum Leutnant).

import { useState } from 'preact/hooks';
import { clock, formatEuro } from '../../../core';
import { Button, Empty, KeyValue, ProgressBar, Select, Slot, Stepper, Toggle, useGame } from '../../../ui';
import { getWarehouses } from '../../goods';
import { getSpots } from '../../spots';
import {
  activeRunnerAt,
  assignmentLabel,
  bailCost,
  effectiveWage,
  expectedWage,
  getStaffMember,
  isAbsent,
  isEmployed,
  JAIL_WAGE_FACTOR,
  levelProgress,
  MAX_LEVEL,
  roleName,
  type StaffAssignment,
  type StaffMember,
  securityAt,
} from '../index';
import { AbsenceSheet } from './absence';
import { ORIGIN_NAMES, Portrait, StatBars, StatusTag } from './common';

export function StaffProfile(props: { staffId: string }) {
  const { state } = useGame();
  const m = getStaffMember(state, props.staffId);
  if (!m) return <Empty>Keine Akte gefunden.</Empty>;
  const employed = isEmployed(state, m.id);
  const progress = levelProgress(m.level, m.xp);
  const expected = expectedWage(state, m.id);
  return (
    <article class="staff-file">
      <header class="staff-file__head">
        <Portrait person={m} size="lg" />
        <div class="staff-file__id">
          <span class="staff-file__label">Akte {m.id.toUpperCase()}</span>
          <strong class="staff-file__name">{m.name}</strong>
          <span>
            {roleName(m.role)}, {m.age} Jahre
          </span>
          <span class="staff-file__level">
            Level {m.level}
            {m.level < MAX_LEVEL && (
              <span class="ui-hint">
                {' '}
                ({progress.current}/{progress.needed} Erfahrung)
              </span>
            )}
          </span>
          <ProgressBar value={progress.fraction} label="Erfahrung" />
        </div>
        <StatusTag status={m.status} />
      </header>

      {m.background && <p class="staff-file__background">{m.background}</p>}

      <section class="staff-file__section">
        <KeyValue label="Herkunft" value={ORIGIN_NAMES[m.origin]} />
        <KeyValue label="Dabei seit" value={clock.format(m.hiredAt)} />
        {employed ? (
          <KeyValue label="Einsatz" value={assignmentLabel(state, m.assignment)} />
        ) : (
          <KeyValue label="Ausgeschieden" value={m.leftAt !== null ? clock.format(m.leftAt) : '–'} />
        )}
        {(m.status === 'jailed' || m.status === 'injured') && m.statusUntil !== null && (
          <KeyValue
            label={m.status === 'jailed' ? 'In Haft bis' : 'Fällt aus bis'}
            value={`${clock.format(m.statusUntil)} (noch ${clock.formatDuration(m.statusUntil - state.time)})`}
          />
        )}
        <KeyValue
          label="Lohn"
          value={
            <>
              {formatEuro(m.wage)} / Tag <span class="ui-hint">(erwartet {formatEuro(expected)})</span>
            </>
          }
        />
        {employed && isAbsent(m) && <KeyValue label="Kostet gerade" value={`${formatEuro(effectiveWage(m))} / Tag`} />}
      </section>

      <section class="staff-file__section">
        <h3 class="staff-file__title">Werte</h3>
        <StatBars stats={m.stats} known={m.knownStats} role={m.role} />
      </section>

      <section class="staff-file__section">
        <h3 class="staff-file__title">Bilanz</h3>
        <KeyValue label="Verkäufe" value={m.record.sales} />
        <KeyValue label="Umsatz" value={formatEuro(m.record.revenue)} />
        <KeyValue label="Festnahmen" value={m.record.arrests} />
      </section>

      {employed && <ProfileActions member={m} />}
      {employed && <Slot name="staff.profile" props={{ staffId: m.id }} />}

      <section class="staff-file__section">
        <h3 class="staff-file__title">Laufbahn</h3>
        <ol class="staff-career">
          {[...m.career].reverse().map((c, i) => (
            <li key={`${c.time}-${i}`}>
              <time>{clock.format(c.time)}</time> {c.text}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function ProfileActions(props: { member: StaffMember }) {
  const { state, dispatch } = useGame();
  const m = props.member;
  const [confirmFire, setConfirmFire] = useState(false);
  const isLieutenant = m.assignment?.kind === 'veedel' || m.returnTo?.kind === 'veedel';
  // Die Rechte Hand (Büro, auch auf einer Lieferung) und wer gerade auf Fahrt ist, wird nicht versetzt.
  const busy =
    m.assignment?.kind === 'office' ||
    m.returnTo?.kind === 'office' ||
    m.assignment?.kind === 'delivery' ||
    m.assignment?.kind === 'transport';
  const canMove = (m.role === 'runner' || m.role === 'security') && m.status === 'active' && !isLieutenant && !busy;
  const cost = m.status === 'jailed' ? bailCost(state, m.id) : 0;
  return (
    <section class="staff-file__section staff-file__actions">
      <h3 class="staff-file__title">Aktionen</h3>
      {m.status === 'jailed' && (
        <Button
          variant="primary"
          wide
          disabled={state.wallet.dirty < cost}
          onClick={() => dispatch({ type: 'staff.bail', payload: { staffId: m.id } })}
        >
          Kaution zahlen ({formatEuro(cost)})
        </Button>
      )}
      {canMove && <MoveControl member={m} />}
      <div class="staff-file__row">
        <span>Lohn</span>
        <Stepper
          label="Lohn"
          value={m.wage}
          min={0}
          step={10}
          format={(wage) => `${formatEuro(wage)}/Tag`}
          onChange={(wage) => dispatch({ type: 'staff.setWage', payload: { staffId: m.id, wage } })}
        />
      </div>
      <Toggle
        icon="jail"
        label="Stillhaltegeld in Haft"
        hint={
          m.jailSupport
            ? `In Haft kostet ${m.name} ${formatEuro(Math.round(m.wage * JAIL_WAGE_FACTOR))} am Tag und hält dicht.`
            : 'Kostet in Haft nichts, aber wer nichts kriegt, wird sauer und redet eher.'
        }
        checked={m.jailSupport}
        onChange={(enabled) => dispatch({ type: 'staff.setJailSupport', payload: { staffId: m.id, enabled } })}
      />
      <Button variant="danger" wide onClick={() => setConfirmFire(true)}>
        {isAbsent(m) ? 'Ersetzen oder entlassen …' : 'Entlassen …'}
      </Button>
      <AbsenceSheet member={m} open={confirmFire} onClose={() => setConfirmFire(false)} />
    </section>
  );
}

/** Versetzen: Läufer an Spots, Sicherheit an Spots oder in Lager. */
function MoveControl(props: { member: StaffMember }) {
  const { state, dispatch } = useGame();
  const m = props.member;
  const targets: { key: string; label: string; assignment: StaffAssignment }[] = [];
  for (const spot of getSpots(state)) {
    const other = m.role === 'runner' ? activeRunnerAt(state, spot.id) : securityAt(state, { spotId: spot.id })[0];
    const taken = other && other.id !== m.id ? ` (${other.name})` : '';
    targets.push({
      key: `spot:${spot.id}`,
      label: `${spot.name}${taken}`,
      assignment: { kind: 'spot', targetId: spot.id },
    });
  }
  if (m.role === 'security') {
    for (const w of getWarehouses(state)) {
      targets.push({ key: `warehouse:${w.id}`, label: w.name, assignment: { kind: 'warehouse', targetId: w.id } });
    }
  }
  const current = m.assignment ? `${m.assignment.kind}:${m.assignment.targetId}` : '';
  const [choice, setChoice] = useState(current || targets[0]?.key || '');
  const target = targets.find((t) => t.key === choice);
  return (
    <div class="staff-file__row">
      <Select
        label="Einsatzort"
        value={choice}
        options={targets.map((t) => ({ value: t.key, label: t.label }))}
        onChange={setChoice}
      />
      <span class="staff-file__buttons">
        <Button
          small
          disabled={!target || choice === current}
          onClick={() =>
            target && dispatch({ type: 'staff.assign', payload: { staffId: m.id, assignment: target.assignment } })
          }
        >
          Versetzen
        </Button>
        {m.assignment && (
          <Button
            small
            variant="subtle"
            onClick={() => dispatch({ type: 'staff.assign', payload: { staffId: m.id, assignment: null } })}
          >
            Abziehen
          </Button>
        )}
      </span>
    </div>
  );
}
