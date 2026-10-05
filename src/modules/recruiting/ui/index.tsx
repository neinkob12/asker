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
  ItemContent,
  List,
  ListItem,
  registerSlot,
  SegmentedControl,
  Sheet,
  useGame,
} from '../../../ui';
import { isSpecialist, roleName, STAT_KEYS, STAT_NAMES, type StaffRole, TRAITS, traitName } from '../../staff';
import {
  type Candidate,
  getContacts,
  getPool,
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

/** Eine Person als Zeile: Avatar, Name, Rolle und Level als Chips, Handgeld, Ablauf; Lohn rechts. */
function CandidateRow(props: { candidate: Candidate; onOpen: () => void }) {
  const { state } = useGame();
  const c = props.candidate;
  const left = c.expiresAt - state.time;
  const look = ROLE_LOOK[c.role];
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
              { label: `noch ${clock.formatDuration(left)}`, icon: 'timer', color: left < 6 * 60 ? 'warn' : 'system' },
            ]}
          />
        </span>
      </span>
    </ListItem>
  );
}

/** Blatt mit allem zu einer Person: Werte (bekannte als Zahl), Hintergrund, Konditionen, Einstellen oder Ablehnen. */
function CandidateSheet(props: { candidate: Candidate | null; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const c = props.candidate;
  const look = c ? ROLE_LOOK[c.role] : ROLE_LOOK.runner;
  return (
    <Sheet open={!!c} onClose={props.onClose} title={c?.name ?? ''} detents={['medium', 'large']}>
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
          {(c.traits ?? []).length > 0 && (
            <Group title="Eigenschaften" icon="sparkles" color="people">
              <Chips
                items={(c.traits ?? []).map((t) => ({
                  label: traitName(t, c.name),
                  icon: TRAITS[t].icon,
                  color: TRAITS[t].tone === 'good' ? 'money' : TRAITS[t].tone === 'bad' ? 'danger' : 'warn',
                  title: TRAITS[t].hint,
                }))}
              />
              <Disclosure>
                {(c.traits ?? []).map((t) => (
                  <p key={t}>
                    <strong>{traitName(t, c.name)}:</strong> {TRAITS[t].hint}
                  </p>
                ))}
              </Disclosure>
            </Group>
          )}
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
          <div class="rc-sheet__actions">
            <Button
              variant="primary"
              disabled={state.wallet.dirty < c.hireCost}
              onClick={() => {
                if (dispatch({ type: 'recruiting.hire', payload: { candidateId: c.id } }).ok) props.onClose();
              }}
            >
              Einstellen ({formatEuro(c.hireCost)})
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                dispatch({ type: 'recruiting.decline', payload: { candidateId: c.id } });
                props.onClose();
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
  const [openId, setOpenId] = useState<string | null>(null);
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
          ...SEARCH_ROLES.map((r) => ({ value: r.value, label: r.label.replace(' suchen', '') })),
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
