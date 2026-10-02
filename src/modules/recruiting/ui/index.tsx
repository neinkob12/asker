// Oberfläche der Rekrutierung: Kontakte-App im Spiel-Handy (Kontakte und Bewerber) und ein Abschnitt im
// Tab "Personal", der auf die App verweist.

import { useState } from 'preact/hooks';
import { clock, formatEuro } from '../../../core';
import {
  Avatar,
  Button,
  Card,
  Empty,
  Hint,
  registerPhoneApp,
  registerSlot,
  SegmentedControl,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
import { roleName, STAT_KEYS, STAT_NAMES } from '../../staff';
import { type Candidate, getContacts, getPool, SEARCH_COST, SOURCE_NAMES, searchReadyAt } from '../index';
import './recruiting.css';

const APP_ID = 'recruiting.contacts';

function CandidateCard(props: { candidate: Candidate }) {
  const { state, dispatch } = useGame();
  const c = props.candidate;
  const left = c.expiresAt - state.time;
  return (
    <li class={`rc-card rc-card--${c.source}`}>
      <header class="rc-card__head">
        <Avatar name={c.name} image={c.portrait ?? undefined} tone="people" />
        <span class="rc-card__who">
          <strong>{c.name}</strong>
          <span class="ui-hint">
            {c.age}, {roleName(c.role)}, Level {c.level}
          </span>
        </span>
        <Tag category={c.source === 'pool' ? 'system' : 'brand'} icon={c.source === 'pool' ? 'inbox' : 'star'}>
          {SOURCE_NAMES[c.source]}
        </Tag>
      </header>
      <p class="rc-card__text">
        {c.note} {c.background}
      </p>
      <ul class="rc-card__stats" aria-label="Werte">
        {STAT_KEYS.map((k) => (
          <li key={k} class={c.visibleStats[k] === undefined ? 'is-hidden' : ''}>
            {STAT_NAMES[k]} <strong>{c.visibleStats[k] ?? '?'}</strong>
          </li>
        ))}
      </ul>
      <p class="ui-hint rc-card__terms">
        {formatEuro(c.wage)} pro Tag · Handgeld {formatEuro(c.hireCost)} · noch {clock.formatDuration(left)}
      </p>
      <div class="rc-card__actions">
        <Button
          variant="primary"
          disabled={state.wallet.dirty < c.hireCost}
          onClick={() => dispatch({ type: 'recruiting.hire', payload: { candidateId: c.id } })}
        >
          Einstellen
        </Button>
        <Button
          variant="subtle"
          onClick={() => dispatch({ type: 'recruiting.decline', payload: { candidateId: c.id } })}
        >
          Ablehnen
        </Button>
      </div>
    </li>
  );
}

function SearchButton() {
  const { state, dispatch } = useGame();
  const readyAt = searchReadyAt(state);
  const waiting = readyAt > state.time;
  return (
    <Button
      wide
      disabled={waiting || state.wallet.dirty < SEARCH_COST}
      onClick={() => dispatch({ type: 'recruiting.search', payload: {} })}
    >
      {waiting ? `Wieder rumfragen ab ${clock.formatTime(readyAt)}` : `Rumfragen (${formatEuro(SEARCH_COST)})`}
    </Button>
  );
}

/** Kontakte-App im Spiel-Handy. */
function ContactsApp() {
  const { state } = useGame();
  const contacts = getContacts(state);
  const pool = getPool(state);
  const [tab, setTab] = useState<'contacts' | 'pool'>(contacts.length > 0 ? 'contacts' : 'pool');
  const list = tab === 'contacts' ? contacts : pool;
  return (
    <div class="rc-app">
      <SegmentedControl
        wide
        aria-label="Ansicht"
        options={[
          { value: 'contacts', label: 'Kontakte', badge: contacts.length },
          { value: 'pool', label: `Bewerber (${pool.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {list.length === 0 ? (
        <Empty icon="userPlus">
          {tab === 'contacts'
            ? 'Niemand meldet sich gerade. Loyale Leute empfehlen dir manchmal wen, auch Stammkunden und das Milieu.'
            : 'Keine Bewerber. Neue kommen alle paar Stunden, oder du fragst rum.'}
        </Empty>
      ) : (
        <ul class="rc-list">
          {list.map((c) => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </ul>
      )}
      {tab === 'pool' && <SearchButton />}
      <Hint>Vor der Einstellung siehst du nur einen Teil der Werte. Den Rest merkst du mit der Zeit.</Hint>
    </div>
  );
}

/** Abschnitt im Tab "Personal". */
function RecruitingSection() {
  const { state } = useGame();
  const ui = useUi();
  const contacts = getContacts(state).length;
  const pool = getPool(state).length;
  return (
    <Card
      title="Leute finden"
      actions={
        <Button small onClick={() => ui.openPhone(APP_ID)}>
          Kontakte-App
        </Button>
      }
    >
      <Hint>
        {pool} {pool === 1 ? 'Bewerber wartet' : 'Bewerber warten'}
        {contacts > 0 ? `, ${contacts} ${contacts === 1 ? 'Kontakt' : 'Kontakte'} (oft besser)` : ''}.
      </Hint>
      <SearchButton />
    </Card>
  );
}

registerPhoneApp({
  id: APP_ID,
  name: 'Kontakte',
  icon: 'users',
  order: 25,
  color: 'people',
  component: ContactsApp,
  badge: (state) => getContacts(state).length,
  hidden: true,
});
registerSlot('tab:staff', { id: 'recruiting.section', order: 30, component: RecruitingSection });
