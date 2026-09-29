// Oberfläche der Rekrutierung: Kontakte-App im Spiel-Handy (Kontakte und Bewerber) und ein Abschnitt im
// Tab "Personal", der auf die App verweist.

import { useState } from 'preact/hooks';
import { clock, formatEuro } from '../../../core';
import { Button, Card, Empty, Hint, registerPhoneApp, registerSlot, Tabs, useGame, useUi } from '../../../ui';
import { roleName, STAT_KEYS, STAT_NAMES } from '../../staff';
import { type Candidate, getContacts, getPool, SEARCH_COST, SOURCE_NAMES, searchReadyAt } from '../index';
import './recruiting.css';

const APP_ID = 'recruiting.contacts';

function initials(name: string): string {
  const words = name.split(' ').filter((w) => !w.startsWith('„'));
  return `${words[0]?.[0] ?? '?'}${words.length > 1 ? (words[words.length - 1][0] ?? '') : ''}`.toUpperCase();
}

function CandidateCard(props: { candidate: Candidate }) {
  const { state, dispatch } = useGame();
  const c = props.candidate;
  const left = c.expiresAt - state.time;
  return (
    <li class={`rc-card rc-card--${c.source}`}>
      <header class="rc-card__head">
        <span class="rc-card__avatar" aria-hidden="true">
          {initials(c.name)}
        </span>
        <span class="rc-card__who">
          <strong>{c.name}</strong>
          <span class="ui-hint">
            {c.age}, {roleName(c.role)}, Level {c.level}
          </span>
        </span>
        <span class="rc-card__source">{SOURCE_NAMES[c.source]}</span>
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
          small
          variant="primary"
          disabled={state.wallet.dirty < c.hireCost}
          onClick={() => dispatch({ type: 'recruiting.hire', payload: { candidateId: c.id } })}
        >
          Einstellen
        </Button>
        <Button
          small
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
  const [tab, setTab] = useState(contacts.length > 0 ? 'contacts' : 'pool');
  const list = tab === 'contacts' ? contacts : pool;
  return (
    <div class="rc-app">
      <h3 class="rc-app__title">Kontakte</h3>
      <Tabs
        tabs={[
          { id: 'contacts', label: 'Kontakte', badge: contacts.length },
          { id: 'pool', label: `Bewerber (${pool.length})` },
        ]}
        active={tab}
        onChange={setTab}
      />
      {list.length === 0 ? (
        <Empty>
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
  color: '#2f855a',
  component: ContactsApp,
  badge: (state) => getContacts(state).length,
});
registerSlot('tab:staff', { id: 'recruiting.section', order: 30, component: RecruitingSection });
