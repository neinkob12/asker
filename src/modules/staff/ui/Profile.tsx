// Mitarbeiter-Profil, gestaltet wie eine Akte: Porträt, Werte, Laufbahn, Bilanz und Aktionen.
// Andere Module hängen eigene Abschnitte über den Slot 'staff.profile' an (z.B. Beförderung zum Leutnant).

import { useState } from 'preact/hooks';
import { clock, formatEuro, lookTraits, personLook } from '../../../core';
import {
  Button,
  Chip,
  Chips,
  Disclosure,
  Empty,
  Group,
  ItemContent,
  KeyValue,
  List,
  ListItem,
  ProgressBar,
  Select,
  Slot,
  Stepper,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { bribeFactor, cityName } from '../../city';
import { getWarehouses } from '../../goods';
import { getSpots } from '../../spots';
import {
  activeRunnerAt,
  assignmentLabel,
  bailCost,
  expectedWage,
  getStaffMember,
  isAbsent,
  isEmployed,
  isGoodSpecialist,
  levelProgress,
  MAX_LEVEL,
  RELATIONS,
  ROLE_INFO,
  relationLabel,
  relationsOf,
  roleName,
  SPECIALIST_GOOD_STAT,
  STAT_NAMES,
  type StaffAssignment,
  type StaffMember,
  securityAt,
  specialistEffectLabel,
  specialistEffectsOf,
  specialistProvider,
  TRAITS,
  traitName,
  wageDue,
} from '../index';
import { AbsenceSheet } from './absence';
import { effectChips, ORIGIN_NAMES, Portrait, relationLook, StatBars, StatusTag, traitChips } from './common';

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
      {/* Aussehen wie im Porträt (ohne das Alter, das steht oben schon) */}
      <Chips class="staff-file__look">
        {lookTraits(personLook(m.name, m.age))
          .slice(1)
          .map((trait) => (
            <Chip key={trait}>{trait}</Chip>
          ))}
      </Chips>

      <PeopleSection member={m} />
      <EffectsSection member={m} />

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
        {employed && isAbsent(m) && <KeyValue label="Kostet gerade" value={`${formatEuro(wageDue(state, m))} / Tag`} />}
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

/**
 * Eigenschaften als Chips (Auftrag 34), was sie bewirken in „Mehr dazu“, darunter die Beziehungen zu Leuten im Team
 * (Tipp öffnet deren Akte).
 */
function PeopleSection(props: { member: StaffMember }) {
  const { state } = useGame();
  const ui = useUi();
  const m = props.member;
  const relations = relationsOf(state, m.id);
  if ((m.traits ?? []).length === 0 && relations.length === 0) return null;
  return (
    <>
      {(m.traits ?? []).length > 0 && (
        <Group title="Eigenschaften" icon="sparkles" color="people">
          <Chips items={traitChips(m)} />
          <Disclosure>
            {(m.traits ?? []).map((t) => (
              <p key={t}>
                <strong>{traitName(t, m.name)}:</strong> {TRAITS[t].hint}
              </p>
            ))}
          </Disclosure>
        </Group>
      )}
      {relations.length > 0 && (
        <Group title="Beziehungen" icon="users" color="people" count={relations.length}>
          <List>
            {relations.map(({ other, kind }) => (
              <ListItem key={other.id} onClick={() => ui.openPanel('staff.profile', { staffId: other.id })}>
                <ItemContent
                  {...relationLook(kind)}
                  title={relationLabel(kind, other.name)}
                  tags={[{ label: RELATIONS[kind].name, ...relationLook(kind) }]}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
    </>
  );
}

/**
 * Wirkung eines Spezialisten (Auftrag 46e): Chips, in „Mehr dazu“ je ein Satz, und ob gerade jemand anderes der Rolle
 * in der Stadt wirkt (pro Stadt zählt die beste Person, mehrere stapeln nicht).
 */
function EffectsSection(props: { member: StaffMember }) {
  const { state } = useGame();
  const m = props.member;
  const lines = specialistEffectsOf(m);
  if (lines.length === 0) return null;
  const city = m.cityId ?? 'koeln';
  const active = specialistProvider(state, lines[0].key, city);
  const employed = isEmployed(state, m.id);
  const good = isGoodSpecialist(m);
  return (
    <Group
      title="Wirkung"
      icon="scale"
      color="law"
      value={good ? 'gut' : 'normal'}
      note={
        !employed
          ? undefined
          : m.status !== 'active'
            ? `${m.name} fällt gerade aus und wirkt nicht.`
            : active && active.id !== m.id
              ? `Gerade wirkt ${active.name}: Pro Stadt zählt die beste Person dieser Rolle.`
              : undefined
      }
    >
      <Chips items={effectChips(state, m)} />
      <Disclosure>
        {lines.map((line) => (
          <p key={line.key}>
            <strong>{specialistEffectLabel(line)}:</strong> {line.def.hint}.
          </p>
        ))}
        <p>
          Wie stark, hängt von den Schlüsselwerten ab (
          {ROLE_INFO[m.role].keyStats.map((k) => STAT_NAMES[k]).join(' und ')}
          ): „gut“ ab einem Mittel von {SPECIALIST_GOOD_STAT}. Es wirkt nur in {cityName(city)}, und nur eine Person pro
          Rolle.
        </p>
      </Disclosure>
    </Group>
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
    m.assignment?.kind === 'transport' ||
    m.assignment?.kind === 'travel';
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
      {m.status === 'jailed' && bribeFactor(m.cityId) !== 1 && (
        <p class="ui-hint">
          {bribeFactor(m.cityId) < 1
            ? `In ${cityName(m.cityId)} kennt man sich: Kaution ein Viertel günstiger.`
            : `In ${cityName(m.cityId)} gibt es nichts geschenkt: Kaution 20 % teurer.`}
        </p>
      )}
      {canMove && <MoveControl member={m} />}
      <TravelHint member={m} />
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
            ? `In Haft kostet ${m.name} ${formatEuro(wageDue(state, { ...m, status: 'jailed', jailSupport: true }))} am Tag und hält dicht.`
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

/**
 * Unterwegs in eine andere Stadt (nur noch aus alten Spielständen): wann die Person ankommt. Leute in eine andere Stadt
 * schicken geht seit dem Feedback vom 05.10.2026 nicht mehr, sie bleiben in der Stadt, in der du sie angeheuert hast.
 */
function TravelHint(props: { member: StaffMember }) {
  const m = props.member;
  if (m.assignment?.kind !== 'travel') return null;
  return (
    <p class="ui-hint">
      Unterwegs nach {cityName(m.assignment.targetId)}, Ankunft {clock.formatTime(m.busyUntil)}.
    </p>
  );
}

/** Versetzen: Läufer an Spots, Sicherheit an Spots oder in Lager. */
function MoveControl(props: { member: StaffMember }) {
  const { state, dispatch } = useGame();
  const m = props.member;
  const targets: { key: string; label: string; assignment: StaffAssignment }[] = [];
  // Versetzen nur innerhalb der Stadt, in der die Person ist (Auftrag 30).
  for (const spot of getSpots(state, m.cityId)) {
    const other = m.role === 'runner' ? activeRunnerAt(state, spot.id) : securityAt(state, { spotId: spot.id })[0];
    const taken = other && other.id !== m.id ? ` (${other.name})` : '';
    targets.push({
      key: `spot:${spot.id}`,
      label: `${spot.name}${taken}`,
      assignment: { kind: 'spot', targetId: spot.id },
    });
  }
  if (m.role === 'security') {
    for (const w of getWarehouses(state, m.cityId)) {
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
