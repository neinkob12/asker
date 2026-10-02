// Oberfläche der Rekrutierung: Abschnitt "Leute finden" im Personal (Kontakte, die sich melden, und Bewerber zum
// Einstellen, dazu Rumfragen). Seit Auftrag 26 keine eigene Kontakte-App mehr.

import { useState } from 'preact/hooks';
import { clock, formatEuro } from '../../../core';
import { Avatar, Button, Empty, Group, registerSlot, SegmentedControl, Tag, useGame } from '../../../ui';
import { roleName, STAT_KEYS, STAT_NAMES } from '../../staff';
import { type Candidate, getContacts, getPool, SEARCH_COST, SOURCE_NAMES, searchReadyAt } from '../index';
import './recruiting.css';

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

/** Abschnitt "Leute finden" im Personal (seit Auftrag 26 statt einer eigenen Kontakte-App): Kontakte und Bewerber. */
function RecruitingSection() {
  const { state } = useGame();
  const contacts = getContacts(state);
  const pool = getPool(state);
  const [tab, setTab] = useState<'contacts' | 'pool'>(contacts.length > 0 ? 'contacts' : 'pool');
  const list = tab === 'contacts' ? contacts : pool;
  return (
    <Group
      title="Leute finden"
      icon="userPlus"
      color="people"
      count={contacts.length + pool.length}
      note="Vor der Einstellung siehst du nur einen Teil der Werte. Den Rest merkst du mit der Zeit. Loyale Leute, Stammkunden und das Milieu empfehlen dir manchmal wen."
      class="rc-app"
    >
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
      <SearchButton />
    </Group>
  );
}

registerSlot('tab:staff', { id: 'recruiting.section', title: 'Leute finden', order: 30, component: RecruitingSection });
