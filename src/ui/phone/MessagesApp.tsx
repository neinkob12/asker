// Nachrichten-App: Chats pro Figur, Antwort-Optionen als Knöpfe, ungelesene Nachrichten.
// Die Daten kommen aus dem Nachrichtendienst des Kerns; die Aufbereitung steht in messagesModel.ts.
// Welcher Chat offen ist, steht in ui.phone.params.contactId (so öffnen Benachrichtigungen den Chat direkt).

import { useEffect, useRef, useState } from 'preact/hooks';
import { messages } from '../../core';
import { Avatar, Badge, Button, Empty, Icon, Tag } from '../components';
import { useGame, useUi } from '../hooks';
import { CONTACT_KIND_ICONS, CONTACT_KIND_LABELS, chatEntries, chatList, firstUnread } from './messagesModel';
import { PhoneScreen } from './PhoneScreen';

const APP_ID = 'core.messages';

function avatarImage(avatar: string | undefined, kind: keyof typeof CONTACT_KIND_ICONS): string {
  return avatar ?? CONTACT_KIND_ICONS[kind];
}

function ChatList() {
  const { state } = useGame();
  const ui = useUi();
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const all = chatList(state);
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
              <Avatar name={c.name} image={avatarImage(c.avatar, c.kind)} />
              <span class="msg-list__main">
                <span class="msg-list__top">
                  <span class="msg-list__name">{c.name}</span>
                  <span class="msg-list__time">{c.timeLabel}</span>
                </span>
                <span class="msg-list__bottom">
                  <span class="msg-list__preview">{c.preview}</span>
                  {c.awaitingAnswer && <Icon name="clock" class="msg-list__waiting" title="Wartet auf Antwort" />}
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
  const count = entries.length;

  useEffect(() => {
    if (unread > 0 && !over) dispatch({ type: 'messages.markRead', payload: { contactId } });
  }, [contactId, unread, over, dispatch]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const name = contact?.name ?? contactId;
  const kind = contact?.kind ?? 'other';
  return (
    <PhoneScreen
      class="msg-chat"
      title={name}
      subtitle={<Tag icon={CONTACT_KIND_ICONS[kind]}>{CONTACT_KIND_LABELS[kind]}</Tag>}
      leading={<Avatar name={name} image={avatarImage(contact?.avatar, kind)} size="sm" />}
      onBack={() => ui.openPhone(APP_ID)}
    >
      <ol class="msg-bubbles">
        {entries.map((e) => {
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
                <div class="msg-options">
                  {e.deadlineLabel && (
                    <span class={`msg-deadline ${e.urgent ? 'is-urgent' : ''}`}>
                      <Icon name="clock" /> {e.deadlineLabel}
                    </span>
                  )}
                  {e.options.map((o) => (
                    <Button
                      key={o.id}
                      wide
                      onClick={() =>
                        dispatch({ type: 'messages.answer', payload: { messageId: e.message.id, optionId: o.id } })
                      }
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              )}
              {e.expired && <em class="msg-expired">Keine Antwort mehr möglich.</em>}
            </li>
          );
        })}
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
