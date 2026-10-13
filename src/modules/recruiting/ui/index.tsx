// Oberfläche der Rekrutierung im Personal: „Könntest du einstellen“ zeigt bis zu acht Leute als Kacheln (Bild, Name,
// Rolle, Level, Handgeld und Lohn); ein Tipp öffnet ein Blatt mit Werten, Hintergrund und Einstellen. Läufer und
// Sicherheit gibt es hier nicht mehr (die heuerst du am Spot an), das Rumfragen („Leute finden“) ist vorerst aus.

import { useState } from 'preact/hooks';
import { clock, formatEuro, personLook } from '../../../core';
import {
  Avatar,
  Button,
  Chips,
  Disclosure,
  Empty,
  Group,
  Hint,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerSlot,
  Sheet,
  useGame,
  useUi,
} from '../../../ui';
import {
  canHireRole,
  roleName,
  STAT_KEYS,
  STAT_NAMES,
  type StaffRole,
  TRAITS,
  type TraitId,
  traitName,
} from '../../staff';
import { type Candidate, canInterview, getContacts, getPool, knownTraits, SOURCE_NAMES } from '../index';
import './recruiting.css';

/** Symbol und Farbe je Rolle (wie im Personal). */
const ROLE_LOOK: Record<StaffRole, { icon: string; color: 'people' | 'goods' | 'danger' | 'law' | 'money' }> = {
  runner: { icon: 'runner', color: 'people' },
  courier: { icon: 'bike', color: 'goods' },
  driver: { icon: 'truck', color: 'goods' },
  security: { icon: 'shield', color: 'danger' },
  lawyer: { icon: 'scale', color: 'law' },
  accountant: { icon: 'clipboard', color: 'money' },
  policeContact: { icon: 'badge', color: 'law' },
  worker: { icon: 'leaf', color: 'goods' },
  gardener: { icon: 'flask', color: 'goods' },
};

/** Chip einer Eigenschaft (Farbe nach gut, schlecht oder beides). */
function traitChip(t: TraitId, name: string) {
  return {
    label: traitName(t, name),
    icon: TRAITS[t].icon,
    color:
      TRAITS[t].tone === 'good'
        ? ('money' as const)
        : TRAITS[t].tone === 'bad'
          ? ('danger' as const)
          : ('warn' as const),
    title: TRAITS[t].hint,
  };
}

/**
 * Eigenschaften im Blatt (Auftrag 44, Teil 9): nur die im Gespräch erkannten, sonst „?“ (wie bei den Werten). Dazu
 * „Gespräch führen“ (einmal je Person), das das Bewerbungsgespräch als Minispiel startet.
 */
function Traits(props: { candidate: Candidate; onInterview: () => void }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const c = props.candidate;
  const known = knownTraits(c);
  const hidden = (c.traits ?? []).length - known.length;
  const allowed = canInterview(state, c);
  const note = c.interviewed
    ? 'Gespräch geführt. Den Rest merkst du nach der Einstellung.'
    : hidden > 0
      ? 'Was in der Person steckt, zeigt erst ein Gespräch.'
      : undefined;
  return (
    <Group title="Eigenschaften" icon="sparkles" color="people" note={note}>
      <Chips
        items={[
          ...known.map((t) => traitChip(t, c.name)),
          ...Array.from({ length: hidden }, () => ({
            label: '?',
            icon: 'sparkles',
            color: 'system' as const,
            title: 'Noch unbekannt',
          })),
        ]}
      />
      {known.length > 0 && (
        <Disclosure>
          {known.map((t) => (
            <p key={t}>
              <strong>{traitName(t, c.name)}:</strong> {TRAITS[t].hint}
            </p>
          ))}
        </Disclosure>
      )}
      {!c.interviewed && allowed.ok && (
        <List>
          <ListItem
            action
            onClick={() => {
              const started = dispatch({ type: 'recruiting.interview', payload: { candidateId: c.id } });
              if (!started.ok) return;
              // Das Gespräch läuft über der Karte: Blatt und Handy gehen zu.
              props.onInterview();
              reopenAfterInterview = c.id;
              ui.closePhone();
            }}
          >
            <ItemContent icon="message" color="chat" title="Gespräch führen" meta="Drei Fragen, einmal pro Person" />
          </ListItem>
        </List>
      )}
    </Group>
  );
}

/**
 * Nach dem Bewerbungsgespräch (Minispiel über der Karte) geht das Handy wieder beim Blatt dieser Person auf: Dort steht,
 * was man erkannt hat.
 */
let reopenAfterInterview: string | null = null;

onGameEvent('minigame.finished', 'recruiting.reopen', (payload, ui) => {
  if (payload.origin.module !== 'recruiting' || payload.origin.ref !== reopenAfterInterview) return;
  if (payload.by === 'timeout') {
    reopenAfterInterview = null;
    return;
  }
  ui.openPhone('tab:staff');
});

/** Blatt mit allem zu einer Person: Werte (bekannte als Zahl), Hintergrund, Konditionen, Einstellen oder Ablehnen. */
function CandidateSheet(props: { candidate: Candidate | null; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const c = props.candidate;
  const look = c ? ROLE_LOOK[c.role] : ROLE_LOOK.runner;
  const close = () => props.onClose();
  const roleCheck = c ? canHireRole(state, c.role) : { ok: true as const };
  return (
    <Sheet open={!!c} onClose={close} title={c?.name ?? ''} detents={['medium', 'large']}>
      {c && (
        <div class="rc-sheet">
          <header class="rc-sheet__head">
            <Avatar
              name={c.name}
              image={c.portrait ?? undefined}
              look={personLook(c.name, c.age)}
              tone={look.color}
              size="lg"
            />
            <Chips
              items={[
                { label: roleName(c.role), icon: look.icon, color: look.color },
                { label: `Level ${c.level}` },
                { label: `${c.age} Jahre`, icon: 'user' },
                {
                  label: SOURCE_NAMES[c.source],
                  icon: c.source === 'pool' ? 'inbox' : 'star',
                  color: c.source === 'pool' ? 'system' : 'brand',
                },
              ]}
            />
          </header>
          <p class="rc-sheet__text">
            {c.note} {c.background}
          </p>
          <Traits candidate={c} onInterview={close} />
          <Group
            title="Werte"
            icon="gauge"
            color="people"
            note="Was du vorher siehst. Den Rest merkst du mit der Zeit."
          >
            <Chips
              items={STAT_KEYS.map((k) => ({
                label: `${STAT_NAMES[k]} ${c.visibleStats[k] ?? '?'}`,
                color: c.visibleStats[k] === undefined ? 'system' : (c.visibleStats[k] ?? 0) >= 60 ? 'money' : 'people',
              }))}
            />
          </Group>
          <Group title="Konditionen" icon="coinEuro" color="money">
            <List>
              <ListItem value={`${formatEuro(c.wage)}/Tag`}>
                <ItemContent icon="coinEuro" color="money" title="Lohn" />
              </ListItem>
              <ListItem value={formatEuro(c.hireCost)}>
                <ItemContent icon="coins" color="dirty" title="Handgeld" meta="einmalig bei der Einstellung" />
              </ListItem>
              <ListItem value={clock.formatTime(c.expiresAt)}>
                <ItemContent
                  icon="timer"
                  color="warn"
                  title="Zu haben bis"
                  meta={`noch ${clock.formatDuration(c.expiresAt - state.time)}`}
                />
              </ListItem>
            </List>
          </Group>
          {/* Auftrag 46e: nur ein Buchhalter pro Stadt, der Grund steht dabei. */}
          {!roleCheck.ok && <Hint icon="alert">{roleCheck.reason}</Hint>}
          <div class="rc-sheet__actions">
            <Button
              variant="primary"
              disabled={state.wallet.dirty < c.hireCost || !roleCheck.ok}
              onClick={() => {
                const hired = dispatch({ type: 'recruiting.hire', payload: { candidateId: c.id } });
                if (hired.ok) close();
              }}
            >
              Einstellen ({formatEuro(c.hireCost)})
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                dispatch({ type: 'recruiting.decline', payload: { candidateId: c.id } });
                close();
              }}
            >
              Ablehnen
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Höchstens so viele Leute als Kacheln. */
const CANDIDATE_TILES = 8;

/** Läufer und Sicherheit stellst du am Spot ein; alte Stände können sie noch unter den Bewerbern haben. */
const AT_SPOT_ONLY: readonly StaffRole[] = ['runner', 'courier', 'security'];

/** Eine Person als Kachel: Bild, Name, Rolle, Level, Handgeld und Lohn. */
function CandidateTile(props: { candidate: Candidate; onOpen: () => void }) {
  const c = props.candidate;
  const look = ROLE_LOOK[c.role];
  return (
    <button
      type="button"
      class="rc-tile"
      aria-label={`${c.name}, ${roleName(c.role)}, Level ${c.level}, Handgeld ${formatEuro(c.hireCost)}, Lohn ${formatEuro(c.wage)} pro Tag`}
      onClick={props.onOpen}
    >
      <Avatar
        name={c.name}
        image={c.portrait ?? undefined}
        look={personLook(c.name, c.age)}
        tone={look.color}
        size="lg"
      />
      <span class="rc-tile__name">{c.name}</span>
      <Chips
        class="rc-tile__tags"
        items={[{ label: roleName(c.role), icon: look.icon, color: look.color }, { label: `L${c.level}` }]}
      />
      <span class="rc-tile__cost">
        <strong>{formatEuro(c.hireCost)}</strong>
        <span>{formatEuro(c.wage)}/Tag</span>
      </span>
    </button>
  );
}

/** Gruppe "Könntest du einstellen": Kontakte zuerst (sie sind besser und laufen schneller ab), dann die Bewerber. */
function Candidates() {
  const { state } = useGame();
  const [openId, setOpenId] = useState<string | null>(() => {
    // Zurück vom Bewerbungsgespräch: gleich wieder beim Blatt.
    const back = reopenAfterInterview;
    reopenAfterInterview = null;
    return back;
  });
  const all = [...getContacts(state), ...getPool(state)].filter((c) => !AT_SPOT_ONLY.includes(c.role));
  const shown = all.slice(0, CANDIDATE_TILES);
  const open = all.find((c) => c.id === openId) ?? null;
  return (
    <Group
      title="Könntest du einstellen"
      icon="userPlus"
      color="people"
      count={all.length}
      note={all.length > 0 ? 'Ein Tipp zeigt Werte und Hintergrund. Oben das Handgeld, darunter der Lohn.' : undefined}
      more="Bewerber melden sich auf deinen Aushang, Kontakte kommen über loyale Leute, Stammkunden und das Milieu und sind oft besser. Mit eigenen Veedeln und gutem Ruf warten mehr Leute. Wer zu lange wartet, sieht sich anderswo um."
    >
      {shown.length === 0 ? (
        <Empty icon="userPlus">Gerade niemand. Neue Bewerber kommen alle paar Stunden.</Empty>
      ) : (
        <div class="rc-tiles">
          {shown.map((c) => (
            <CandidateTile key={c.id} candidate={c} onOpen={() => setOpenId(c.id)} />
          ))}
        </div>
      )}
      <CandidateSheet candidate={open} onClose={() => setOpenId(null)} />
    </Group>
  );
}

registerSlot('tab:staff', {
  id: 'recruiting.section',
  title: 'Könntest du einstellen',
  order: 30,
  component: Candidates,
});
