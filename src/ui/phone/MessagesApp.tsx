// Nachrichten-App: Chats pro Figur, Antwort-Optionen als Knöpfe, ungelesene Nachrichten.
// Die Daten kommen aus dem Nachrichtendienst des Kerns; die Aufbereitung steht in messagesModel.ts.
// Welcher Chat offen ist, steht in ui.phone.params.contactId (so öffnen Benachrichtigungen den Chat direkt).

import { useEffect, useRef, useState } from 'preact/hooks';
import { messages } from '../../core';
import { Avatar, Badge, Button, Empty, Icon, Stamp, Tag } from '../components';
import { useGame, useUi } from '../hooks';
import { CONTACT_KIND_ICONS, CONTACT_KIND_LABELS, chatEntries, chatList, firstUnread } from './messagesModel';
import { PhoneScreen } from './PhoneScreen';

const APP_ID = 'core.messages';

/** Feste Farbe je Kontaktart: Gangs rot, Polizei blau, Team gelb … so erkennt man die Stimme schon an der Farbe. */
const KIND_COLORS: Record<string, string> = {
  customer: '#4dd6c4',
  supplier: '#1cb0f6',
  gang: '#ff4b4b',
  staff: '#ffc800',
  police: '#4a6cf7',
  other: '#a560f0',
};

/** Wie lange ein Kontakt "tippt", bevor die Nachricht erscheint (nur Optik, der Spielzustand steht schon fest). */
const typingMs = (text: string) => Math.min(2200, Math.max(700, 450 + text.length * 22));

function avatarImage(avatar: string | undefined, kind: keyof typeof CONTACT_KIND_ICONS): string {
  return avatar ?? CONTACT_KIND_ICONS[kind];
}

function ChatList() {
  const { state } = useGame();
  const ui = useUi();
  const all = chatList(state);
  // Wartet etwas auf Antwort, beginnt die Liste mit "Offen".
  const [filter, setFilter] = useState<'all' | 'open'>(() => (all.some((c) => c.awaitingAnswer) ? 'open' : 'all'));
  const list = filter === 'open' ? all.filter((c) => c.awaitingAnswer || c.unread > 0) : all;
  const unread = messages.unreadCount(state);
  const openCount = all.filter((c) => c.awaitingAnswer).length;
  return (
    <PhoneScreen title="Nachrichten" subtitle={unread > 0 ? `${unread} ungelesen` : 'Alles gelesen'}>
      <div class="msg-filter" role="tablist" aria-label="Filter">
        <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
          Alle
        </button>
        <button type="button" role="tab" aria-selected={filter === 'open'} onClick={() => setFilter('open')}>
          Offen
          {openCount > 0 && <span class="msg-filter__count">{openCount}</span>}
        </button>
      </div>
      {list.length === 0 && (
        <Empty icon="message">{filter === 'open' ? 'Nichts Offenes.' : 'Noch keine Nachrichten.'}</Empty>
      )}
      <ul class="msg-list">
        {list.map((c) => (
          <li key={c.contactId}>
            <button
              type="button"
              class={`msg-list__item ${c.unread > 0 ? 'is-unread' : ''}`}
              onClick={() => ui.openPhone(APP_ID, { contactId: c.contactId })}
            >
              <Avatar name={c.name} image={avatarImage(c.avatar, c.kind)} color={KIND_COLORS[c.kind]} />
              <span class="msg-list__main">
                <span class="msg-list__top">
                  <span class="msg-list__name">{c.name}</span>
                  <span class="msg-list__time">{c.timeLabel}</span>
                </span>
                <span class="msg-list__bottom">
                  <span class="msg-list__preview">{c.preview}</span>
                  {c.awaitingAnswer && (
                    <span class="msg-reply-sticker">
                      <Icon name="reply" /> Antwort!
                    </span>
                  )}
                  <Badge count={c.unread} />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PhoneScreen>
  );
}

function Chat(props: { contactId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const contactId = props.contactId;
  const contact = messages.contact(state, contactId);
  // Erste ungelesene Nachricht beim Öffnen merken (danach wird der Chat als gelesen markiert).
  const [firstUnreadId] = useState(() => firstUnread(state, contactId));
  const unread = messages.unreadCount(state, contactId);
  const over = state.outcome.gameOver !== null;
  const entries = chatEntries(state, contactId, firstUnreadId);
  const bottom = useRef<HTMLDivElement>(null);

  // Nachrichten, die schon beim Öffnen da waren, erscheinen sofort; neue tippt der Kontakt erst ("…").
  const [revealed, setRevealed] = useState<Set<string>>(
    () => new Set(entries.filter((e) => e.type === 'message').map((e) => e.key)),
  );
  const hidden = (e: (typeof entries)[number]) =>
    e.type === 'message' && e.from === 'contact' && !e.message.silent && !revealed.has(e.key);
  const firstHidden = entries.find(hidden);
  const hiddenKey = firstHidden?.key;
  const hiddenText = firstHidden?.type === 'message' ? firstHidden.message.text : '';

  useEffect(() => {
    if (!hiddenKey) return;
    const timer = setTimeout(() => setRevealed((set) => new Set(set).add(hiddenKey)), typingMs(hiddenText));
    return () => clearTimeout(timer);
  }, [hiddenKey, hiddenText]);

  useEffect(() => {
    if (unread > 0 && !over) dispatch({ type: 'messages.markRead', payload: { contactId } });
  }, [contactId, unread, over, dispatch]);

  const shown = firstHidden ? entries.slice(0, entries.indexOf(firstHidden)) : entries;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [shown.length, hiddenKey]);

  // Die offene Frage steht unten als Antwort-Blatt, nicht mitten im Verlauf.
  const question = [...shown].reverse().find((e) => e.type === 'message' && e.options.length > 0);
  const name = contact?.name ?? contactId;
  const kind = contact?.kind ?? 'other';
  return (
    <PhoneScreen
      class="msg-chat"
      title={name}
      subtitle={<Tag icon={CONTACT_KIND_ICONS[kind]}>{CONTACT_KIND_LABELS[kind]}</Tag>}
      leading={<Avatar name={name} image={avatarImage(contact?.avatar, kind)} size="sm" color={KIND_COLORS[kind]} />}
      onBack={() => ui.openPhone(APP_ID)}
      backLabel="Chats"
      footer={
        question?.type === 'message' ? (
          <div class="msg-options">
            {question.deadlineLabel && (
              <span class={`msg-deadline ${question.urgent ? 'is-urgent' : ''}`}>
                <Icon name="clock" /> {question.deadlineLabel}
              </span>
            )}
            {question.options.map((o, i) => (
              <Button
                key={o.id}
                wide
                big
                variant={i === 0 ? 'primary' : 'default'}
                onClick={() =>
                  dispatch({ type: 'messages.answer', payload: { messageId: question.message.id, optionId: o.id } })
                }
              >
                {o.label}
              </Button>
            ))}
          </div>
        ) : undefined
      }
    >
      <ol class={`msg-bubbles msg-bubbles--${kind}`}>
        {shown.map((e) => {
          if (e.type === 'day') {
            return (
              <li key={e.key} class="msg-sep">
                {e.label}
              </li>
            );
          }
          if (e.type === 'unread') {
            return (
              <li key={e.key} class="msg-sep msg-sep--unread">
                Neu
              </li>
            );
          }
          return (
            <li key={e.key} class={`msg-bubble msg-bubble--${e.from} ${e.options.length > 0 ? 'is-open' : ''}`}>
              <p>{e.message.text}</p>
              <time>{e.time}</time>
              {e.options.length > 0 && (
                <Stamp size="sm" tone="bad" rotate={-8} class="msg-bubble__stamp">
                  Antwort!
                </Stamp>
              )}
              {e.expired && <em class="msg-expired">Keine Antwort mehr möglich.</em>}
            </li>
          );
        })}
        {firstHidden && (
          <li class="msg-bubble msg-bubble--contact msg-typing" aria-label={`${name} tippt`}>
            <span />
            <span />
            <span />
          </li>
        )}
      </ol>
      {entries.length === 0 && <Empty>Noch nichts geschrieben.</Empty>}
      <div ref={bottom} />
    </PhoneScreen>
  );
}

export function MessagesApp() {
  const ui = useUi();
  const contactId =
    ui.state.phone.app === APP_ID ? (ui.state.phone.params?.contactId as string | undefined) : undefined;
  return contactId ? <Chat key={contactId} contactId={contactId} /> : <ChatList />;
}
