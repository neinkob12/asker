// Nachrichten-App: Chats pro Figur, nach Kontaktart gruppiert (Gangs, Polizei, Lieferanten, Team, Kunden), mit
// Avatar in der Farbe der Kontaktart, ungelesenen Nachrichten, Fristen und Antwort-Optionen als Knöpfe.
// Die Daten kommen aus dem Nachrichtendienst des Kerns; die Aufbereitung steht in messagesModel.ts.
// Welcher Chat offen ist, steht in ui.phone.params.contactId (so öffnen Benachrichtigungen den Chat direkt).

import { useEffect, useRef, useState } from 'preact/hooks';
import { clock, messages } from '../../core';
import {
  Avatar,
  Badge,
  Button,
  ContextMenu,
  Empty,
  Icon,
  IconChip,
  SegmentedControl,
  Stamp,
  SwipeRow,
  Tag,
} from '../components';
import { useGame, useUi } from '../hooks';
import {
  CONTACT_KIND_ICONS,
  CONTACT_KIND_LABELS,
  CONTACT_KIND_TONES,
  chatEntries,
  chatList,
  firstUnread,
  groupChats,
} from './messagesModel';
import { PhoneScreen } from './PhoneScreen';

const APP_ID = 'core.messages';

/** Wie lange ein Kontakt "tippt", bevor die Nachricht erscheint (nur Optik, der Spielzustand steht schon fest). */
const typingMs = (text: string) => Math.min(2200, Math.max(700, 450 + text.length * 22));

function avatarImage(avatar: string | undefined, kind: keyof typeof CONTACT_KIND_ICONS): string {
  return avatar ?? CONTACT_KIND_ICONS[kind];
}

/** Suche in Namen, Kontaktart und letzter Nachricht (ohne Groß/klein). */
function matches(chat: ReturnType<typeof chatList>[number], query: string): boolean {
  const q = query.trim().toLocaleLowerCase('de');
  if (!q) return true;
  return [chat.name, chat.kindLabel, chat.preview].some((text) => text.toLocaleLowerCase('de').includes(q));
}

function ChatList() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const all = chatList(state);
  // Wartet etwas auf Antwort, beginnt die Liste mit "Offen".
  const [filter, setFilter] = useState<'all' | 'open'>(() => (all.some((c) => c.awaitingAnswer) ? 'open' : 'all'));
  const [query, setQuery] = useState('');
  const list = (filter === 'open' ? all.filter((c) => c.awaitingAnswer || c.unread > 0) : all).filter((c) =>
    matches(c, query),
  );
  const groups = groupChats(list);
  const unread = messages.unreadCount(state);
  const openCount = all.filter((c) => c.awaitingAnswer).length;
  const markRead = (contactId: string) => dispatch({ type: 'messages.markRead', payload: { contactId } });
  return (
    <PhoneScreen
      title="Nachrichten"
      subtitle={unread > 0 ? `${unread} ungelesen` : 'Alles gelesen'}
      search={{ value: query, onInput: setQuery, placeholder: 'Chats durchsuchen' }}
    >
      <SegmentedControl
        wide
        aria-label="Filter"
        options={[
          { value: 'all' as const, label: 'Alle' },
          { value: 'open' as const, label: 'Offen', badge: openCount },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {list.length === 0 && (
        <Empty icon={query ? 'search' : 'message'}>
          {query
            ? `Kein Chat passt zu „${query.trim()}“.`
            : filter === 'open'
              ? 'Nichts Offenes. Alle Chats sind erledigt.'
              : 'Noch keine Nachrichten.'}
        </Empty>
      )}
      {groups.map((group) => {
        const tone = CONTACT_KIND_TONES[group.kind];
        return (
          <section key={group.kind} class="msg-group">
            <header class="msg-group__head">
              <IconChip icon={CONTACT_KIND_ICONS[group.kind]} color={tone} solid size="xs" />
              <h3 class="msg-group__title">{group.label}</h3>
              <span class="msg-group__count">{group.items.length}</span>
            </header>
            <ul class="msg-list">
              {group.items.map((c) => (
                <li key={c.contactId}>
                  {/* Wischen: als gelesen markieren (gibt es auch im Kontextmenü, langer Druck oder Rechtsklick) */}
                  <SwipeRow
                    actions={
                      c.unread > 0
                        ? [{ label: 'Gelesen', icon: 'check', color: 'chat', onSelect: () => markRead(c.contactId) }]
                        : []
                    }
                    fullSwipe
                  >
                    <ContextMenu
                      label={`Aktionen für ${c.name}`}
                      actions={[
                        {
                          label: 'Chat öffnen',
                          icon: 'message',
                          onSelect: () => ui.openPhone(APP_ID, { contactId: c.contactId }),
                        },
                        {
                          label: 'Als gelesen markieren',
                          icon: 'check',
                          disabled: c.unread === 0,
                          onSelect: () => markRead(c.contactId),
                        },
                      ]}
                    >
                      <button
                        type="button"
                        class={`msg-row ${c.unread > 0 ? 'is-unread' : ''}`}
                        onClick={() => ui.openPhone(APP_ID, { contactId: c.contactId })}
                        aria-label={`${c.name}, ${c.kindLabel}${c.unread > 0 ? `, ${c.unread} ungelesen` : ''}${c.awaitingAnswer ? ', wartet auf Antwort' : ''}`}
                      >
                        <Avatar name={c.name} image={avatarImage(c.avatar, c.kind)} tone={tone} />
                        <span class="msg-row__main">
                          <span class="msg-row__top">
                            <span class="msg-row__name">{c.name}</span>
                            <time class="msg-row__time">{c.timeLabel}</time>
                          </span>
                          <span class="msg-row__preview">{c.preview}</span>
                          {(c.awaitingAnswer || c.unread > 0) && (
                            <span class="msg-row__status">
                              {c.awaitingAnswer && (
                                <Tag
                                  tone={c.deadlineIn !== undefined && c.deadlineIn < 30 ? 'bad' : 'warn'}
                                  icon="reply"
                                >
                                  Antwort
                                  {c.deadlineIn !== undefined ? ` · ${clock.formatDuration(c.deadlineIn)}` : ''}
                                </Tag>
                              )}
                            </span>
                          )}
                        </span>
                        <Badge count={c.unread} />
                      </button>
                    </ContextMenu>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
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
      leading={
        <Avatar name={name} image={avatarImage(contact?.avatar, kind)} size="sm" tone={CONTACT_KIND_TONES[kind]} />
      }
      onBack={() => ui.openPhone(APP_ID)}
      footer={
        question?.type === 'message' ? (
          <div class="msg-options">
            <span class="msg-question-meta">
              <Tag icon={question.routine ? 'users' : 'crown'} category={question.routine ? 'people' : 'brand'}>
                {question.routine ? 'Routine' : 'Chefsache'}
              </Tag>
              {question.deadlineLabel && (
                <span class={`msg-deadline ${question.urgent ? 'is-urgent' : ''}`}>
                  <Icon name="clock" /> {question.deadlineLabel}
                </span>
              )}
            </span>
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
              {e.via && <small class="msg-via">{e.via}</small>}
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
