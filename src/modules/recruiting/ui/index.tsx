// Oberfläche der Rekrutierung (Auftrag 27): zwei Gruppen im Personal. "Könntest du einstellen" zeigt Bewerber und
// Kontakte als eine Zeile pro Person (Avatar, Rolle als Chip, Level, Handgeld, Ablauf; Lohn rechts), nach Rolle
// filterbar; ein Tipp öffnet ein Blatt mit Werten, Hintergrund und Einstellen. "Leute finden" ist das Rumfragen mit
// Rollenwahl, das vorher sagt, was es kostet und was es bringt.

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
  SegmentedControl,
  Select,
  Sheet,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity } from '../../city';
import { getSpots } from '../../spots';
import {
  canHireRole,
  isSpecialist,
  roleName,
  runnerAt,
  STAT_KEYS,
  STAT_NAMES,
  type StaffRole,
  TRAITS,
  type TraitId,
  traitName,
} from '../../staff';
import { tutorialAllowsRole } from '../../tutorial';
import {
  type Candidate,
  canInterview,
  getContacts,
  getPool,
  knownTraits,
  SEARCH_ROLES,
  type SearchRole,
  SOURCE_NAMES,
  searchPreview,
} from '../index';
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

type RoleFilter = 'all' | 'runner' | 'driver' | 'security' | 'specialist';

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'runner', label: 'Läufer' },
  { value: 'driver', label: 'Fahrer' },
  { value: 'security', label: 'Sicherheit' },
  { value: 'specialist', label: 'Spezialisten' },
];

function matchesFilter(c: Candidate, filter: RoleFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'specialist') return isSpecialist(c.role);
  if (filter === 'runner') return c.role === 'runner' || c.role === 'courier';
  return c.role === filter;
}

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

/** Eine Person als Zeile: Avatar, Name, Rolle und Level als Chips, Handgeld, Ablauf; Lohn rechts. */
function CandidateRow(props: { candidate: Candidate; onOpen: () => void }) {
  const { state } = useGame();
  const c = props.candidate;
  const left = c.expiresAt - state.time;
  const look = ROLE_LOOK[c.role];
  const known = knownTraits(c);
  const hidden = (c.traits ?? []).length - known.length;
  return (
    <ListItem onClick={props.onOpen} value={`${formatEuro(c.wage)}/Tag`}>
      <span class="ui-item">
        <Avatar
          name={c.name}
          image={c.portrait ?? undefined}
          look={personLook(c.name, c.age)}
          tone={look.color}
          size="md"
        />
        <span class="ui-item__main">
          <span class="ui-item__title">{c.name}</span>
          <Chips
            class="ui-item__tags"
            items={[
              { label: roleName(c.role), icon: look.icon, color: look.color },
              { label: `Level ${c.level}` },
              { label: `Handgeld ${formatEuro(c.hireCost)}`, icon: 'coins', color: 'money' },
              c.source !== 'pool' && { label: SOURCE_NAMES[c.source], icon: 'star', color: 'brand' },
              ...known.map((t) => traitChip(t, c.name)),
              hidden > 0 && { label: '?', icon: 'sparkles', color: 'system', title: 'Eigenschaften noch unbekannt' },
              { label: `noch ${clock.formatDuration(left)}`, icon: 'timer', color: left < 6 * 60 ? 'warn' : 'system' },
            ]}
          />
        </span>
      </span>
    </ListItem>
  );
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

/** Auswahl „ohne Einsatz“ beim Einstellen eines Läufers. */
const NO_SPOT = '';

/**
 * Blatt mit allem zu einer Person: Werte (bekannte als Zahl), Hintergrund, Konditionen, Einstellen oder Ablehnen.
 * Läufer kommen gleich an einen Spot ohne Läufer (J10: vorher standen sie „Frei: ohne Einsatz“ und kosteten Lohn).
 */
function CandidateSheet(props: { candidate: Candidate | null; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const [spotChoice, setSpotChoice] = useState<string | null>(null);
  const c = props.candidate;
  const look = c ? ROLE_LOOK[c.role] : ROLE_LOOK.runner;
  const freeSpots =
    c?.role === 'runner' ? getSpots(state, activeCity(state)).filter((spot) => !runnerAt(state, spot.id)) : [];
  // Ohne eigene Wahl der erste freie Spot; eine Wahl, die nicht mehr frei ist, fällt darauf zurück.
  const spotId =
    spotChoice === NO_SPOT || freeSpots.some((spot) => spot.id === spotChoice)
      ? (spotChoice as string)
      : (freeSpots[0]?.id ?? NO_SPOT);
  const close = () => {
    setSpotChoice(null);
    props.onClose();
  };
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
          {freeSpots.length > 0 && (
            <Group
              title="Einsatz"
              icon="pin"
              color="place"
              note={spotId === NO_SPOT ? 'Ohne Spot verkauft niemand, der Lohn läuft trotzdem.' : undefined}
            >
              <List>
                <ListItem>
                  <ItemContent icon="runner" color="people" title="Steht dann">
                    <Select
                      wide
                      label="Spot"
                      value={spotId}
                      options={[
                        ...freeSpots.map((spot) => ({ value: spot.id, label: spot.name })),
                        { value: NO_SPOT, label: 'Erst mal ohne Einsatz' },
                      ]}
                      onChange={setSpotChoice}
                    />
                  </ItemContent>
                </ListItem>
              </List>
            </Group>
          )}
          {/* Auftrag 46e: nur ein Buchhalter pro Stadt, der Grund steht dabei. */}
          {!roleCheck.ok && <Hint icon="alert">{roleCheck.reason}</Hint>}
          <div class="rc-sheet__actions">
            <Button
              variant="primary"
              disabled={state.wallet.dirty < c.hireCost || !roleCheck.ok}
              onClick={() => {
                const assignment = spotId === NO_SPOT ? null : { kind: 'spot' as const, targetId: spotId };
                const hired = dispatch({
                  type: 'recruiting.hire',
                  payload: assignment ? { candidateId: c.id, assignment } : { candidateId: c.id },
                });
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

/** Gruppe "Könntest du einstellen": Kontakte zuerst (sie sind besser und laufen schneller ab), dann die Bewerber. */
function Candidates() {
  const { state } = useGame();
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [openId, setOpenId] = useState<string | null>(() => {
    // Zurück vom Bewerbungsgespräch: gleich wieder beim Blatt.
    const back = reopenAfterInterview;
    reopenAfterInterview = null;
    return back;
  });
  const all = [...getContacts(state), ...getPool(state)];
  const list = all.filter((c) => matchesFilter(c, filter));
  const open = all.find((c) => c.id === openId) ?? null;
  return (
    <Group
      title="Könntest du einstellen"
      icon="userPlus"
      color="people"
      count={all.length}
      note={all.length > 0 ? 'Ein Tipp zeigt Werte und Hintergrund.' : undefined}
      more="Bewerber melden sich auf deinen Aushang, Kontakte kommen über loyale Leute, Stammkunden und das Milieu und sind oft besser. Mit eigenen Veedeln und gutem Ruf warten mehr Leute. Wer zu lange wartet, sieht sich anderswo um."
    >
      <SegmentedControl wide aria-label="Rolle" options={ROLE_FILTERS} value={filter} onChange={setFilter} />
      {list.length === 0 ? (
        <Empty icon="userPlus">
          {all.length === 0
            ? 'Gerade niemand. Neue Bewerber kommen alle paar Stunden, oder du fragst unten rum.'
            : 'Niemand mit dieser Rolle. Frag unten gezielt rum.'}
        </Empty>
      ) : (
        <List>
          {list.map((c) => (
            <CandidateRow key={c.id} candidate={c} onOpen={() => setOpenId(c.id)} />
          ))}
        </List>
      )}
      <CandidateSheet candidate={open} onClose={() => setOpenId(null)} />
    </Group>
  );
}

/** Gruppe "Leute finden": Rumfragen mit Rollenwahl, vorher steht, was es kostet und bringt. */
function Search() {
  const { state, dispatch } = useGame();
  const [role, setRole] = useState<SearchRole | 'any'>('any');
  const wanted = role === 'any' ? undefined : role;
  const preview = searchPreview(state, wanted);
  const short = state.wallet.dirty < preview.cost;
  return (
    <Group
      title="Leute finden"
      icon="search"
      color="brand"
      note={
        preview.waiting
          ? `Du hast gerade erst rumgefragt, wieder ab ${clock.formatTime(preview.readyAt)}.`
          : `Kostet ${formatEuro(preview.cost)} und bringt etwa ${preview.count} Leute (${preview.roleLabel}).`
      }
    >
      <SegmentedControl
        wide
        aria-label="Wen suchst du?"
        options={[
          { value: 'any' as const, label: 'Egal wen' },
          // Auftrag 46b: Im Tutorial nur Rollen, die seine Stufe schon kennt.
          ...SEARCH_ROLES.filter((r) => tutorialAllowsRole(state, r.value)).map((r) => ({
            value: r.value,
            label: r.label.replace(' suchen', ''),
          })),
        ]}
        value={role}
        onChange={setRole}
      />
      <List>
        <ListItem
          action
          disabled={preview.waiting || short}
          value={formatEuro(preview.cost)}
          onClick={() => dispatch({ type: 'recruiting.search', payload: wanted ? { role: wanted } : {} })}
        >
          <ItemContent
            icon="megaphone"
            color="brand"
            title={wanted ? SEARCH_ROLES.find((r) => r.value === wanted)?.label : 'Rumfragen'}
            meta={short ? 'Nicht genug Schwarzgeld' : `etwa ${preview.count} neue Bewerber, sofort`}
          />
        </ListItem>
      </List>
    </Group>
  );
}

function RecruitingSection() {
  return (
    <div class="rc-app">
      <Candidates />
      <Search />
    </div>
  );
}

registerSlot('tab:staff', { id: 'recruiting.section', title: 'Leute finden', order: 30, component: RecruitingSection });
