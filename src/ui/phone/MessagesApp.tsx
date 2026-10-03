// Nachrichten-App: oben die zuletzt aktiven Kontakte als Avatare, darunter die Chats pro Figur, nach Kontaktart
// gruppiert (Gangs, Polizei, Lieferanten, Team, Kunden), kompakt (eine Zeile plus Vorschau), mit Avatar in der
// Farbe der Kontaktart, ungelesenen Nachrichten und Fristen. "Alle gelesen" in der Leiste, Löschen per Wischen oder
// Kontextmenü, "Alle löschen" im Menü (Aktionsblatt); bei offener Frist erst eine Rückfrage. Im Chat stehen die
// Antwort-Optionen als Knöpfe unten.
// Die Daten kommen aus dem Nachrichtendienst des Kerns; die Aufbereitung steht in messagesModel.ts.
// Welcher Chat offen ist, steht in ui.phone.params.contactId (so öffnen Benachrichtigungen den Chat direkt).

import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clock, messages } from '../../core';
import {
  ActionSheet,
  Avatar,
  Badge,
  Button,
  type CategoryColor,
  ContextMenu,
  Empty,
  Icon,
  IconButton,
  IconChip,
  SegmentedControl,
  Stamp,
  SwipeRow,
  Tag,
} from '../components';
import { useGame, useUi } from '../hooks';
import {
  type ChatListItem,
  CONTACT_KIND_ICONS,
  CONTACT_KIND_LABELS,
  CONTACT_KIND_TONES,
  chatEntries,
  chatList,
  firstUnread,
  groupChats,
  recentContacts,
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

/** Die zuletzt aktiven Kontakte als Avatare in einer Reihe; ein Tipp öffnet den Chat. */
function RecentRow(props: { chats: ChatListItem[] }) {
  const ui = useUi();
  if (props.chats.length < 2) return null;
  return (
    <ul class="msg-recent" aria-label="Zuletzt">
      {props.chats.map((c) => (
        <li key={c.contactId}>
          <button
            type="button"
            class="msg-recent__item"
            onClick={() => ui.openPhone(APP_ID, { contactId: c.contactId })}
            aria-label={`${c.name}${c.unread > 0 ? `, ${c.unread} ungelesen` : ''}`}
            title={c.name}
          >
            <Avatar name={c.name} image={avatarImage(c.avatar, c.kind)} tone={CONTACT_KIND_TONES[c.kind]} />
            <span class="msg-recent__name">{c.name.split(' ')[0]}</span>
            <Badge count={c.unread} />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface RowActions {
  open: (contactId: string) => void;
  markRead: (contactId: string) => void;
  askOrRemove: (contactId: string) => void;
}

/** Felder einer Chat-Zeile, die man sieht: Nur wenn sich eines davon ändert, wird die Zeile neu gezeichnet. */
const ROW_FIELDS = [
  'contactId',
  'name',
  'kind',
  'kindLabel',
  'preview',
  'timeLabel',
  'unread',
  'awaitingAnswer',
  'deadlineIn',
  'avatar',
] as const satisfies readonly (keyof ChatListItem)[];

/**
 * Eine Zeile der Chat-Liste mit Wischaktionen und Kontextmenü. Memoisiert: Die Liste wird bei jedem Neuzeichnen
 * (zehnmal pro Sekunde) neu berechnet, die meisten Zeilen ändern sich dabei nicht.
 */
const ChatRow = memo(
  function ChatRow(props: { chat: ChatListItem; tone: CategoryColor; actions: { current: RowActions } }) {
    const c = props.chat;
    const act = () => props.actions.current;
    return (
      /* Wischen: Löschen und Gelesen (gibt es auch im Kontextmenü, langer Druck oder Rechtsklick) */
      <SwipeRow
        actions={[
          { label: 'Löschen', icon: 'trash', color: 'danger', onSelect: () => act().askOrRemove(c.contactId) },
          ...(c.unread > 0
            ? [
                {
                  label: 'Gelesen',
                  icon: 'check',
                  color: 'chat' as const,
                  onSelect: () => act().markRead(c.contactId),
                },
              ]
            : []),
        ]}
      >
        <ContextMenu
          label={`Aktionen für ${c.name}`}
          actions={[
            { label: 'Chat öffnen', icon: 'message', onSelect: () => act().open(c.contactId) },
            {
              label: 'Als gelesen markieren',
              icon: 'check',
              disabled: c.unread === 0,
              onSelect: () => act().markRead(c.contactId),
            },
            { label: 'Chat löschen', icon: 'trash', destructive: true, onSelect: () => act().askOrRemove(c.contactId) },
          ]}
        >
          <button
            type="button"
            class={`msg-row ${c.unread > 0 ? 'is-unread' : ''}`}
            onClick={() => act().open(c.contactId)}
            aria-label={`${c.name}, ${c.kindLabel}${c.unread > 0 ? `, ${c.unread} ungelesen` : ''}${c.awaitingAnswer ? ', wartet auf Antwort' : ''}`}
          >
            <Avatar name={c.name} image={avatarImage(c.avatar, c.kind)} tone={props.tone} />
            <span class="msg-row__main">
              <span class="msg-row__top">
                <span class="msg-row__name">{c.name}</span>
                {c.awaitingAnswer && (
                  <Tag tone={c.deadlineIn !== undefined && c.deadlineIn < 30 ? 'bad' : 'warn'} icon="reply">
                    {c.deadlineIn !== undefined ? clock.formatDuration(c.deadlineIn) : 'Antwort'}
                  </Tag>
                )}
                <time class="msg-row__time">{c.timeLabel}</time>
              </span>
              <span class="msg-row__preview">{c.preview}</span>
            </span>
            <Badge count={c.unread} />
          </button>
        </ContextMenu>
      </SwipeRow>
    );
  },
  (a, b) => a.tone === b.tone && a.actions === b.actions && ROW_FIELDS.every((k) => a.chat[k] === b.chat[k]),
);

function ChatList() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const all = chatList(state);
  // Wartet etwas auf Antwort, beginnt die Liste mit "Offen".
  const [filter, setFilter] = useState<'all' | 'open'>(() => (all.some((c) => c.awaitingAnswer) ? 'open' : 'all'));
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'all' | string | null>(null);
  const list = (filter === 'open' ? all.filter((c) => c.awaitingAnswer || c.unread > 0) : all).filter((c) =>
    matches(c, query),
  );
  const groups = groupChats(list);
  const unread = messages.unreadCount(state);
  const openCount = all.filter((c) => c.awaitingAnswer).length;
  const withDeadline = all.filter((c) => messages.hasOpenDeadline(state, c.contactId));
  const markRead = (contactId: string) => dispatch({ type: 'messages.markRead', payload: { contactId } });
  const markAllRead = () => dispatch({ type: 'messages.markAllRead', payload: {} });
  const remove = (contactId: string) => dispatch({ type: 'messages.delete', payload: { contactId } });
  const removeAll = () => dispatch({ type: 'messages.deleteAll', payload: {} });
  // Löschen: Chats mit offener Frist erst nachfragen, alle anderen sofort (es gibt sie nach dem nächsten Schreiben wieder).
  const askOrRemove = (contactId: string) => {
    if (messages.hasOpenDeadline(state, contactId)) setConfirm(contactId);
    else remove(contactId);
  };
  // Für die Zeilen (memoisiert, siehe ChatRow): immer dieselbe Hülle, die Funktionen darin sind die aktuellen.
  const rowActions = useRef<RowActions>({ open: () => {}, markRead, askOrRemove });
  rowActions.current = {
    open: (contactId) => ui.openPhone(APP_ID, { contactId }),
    markRead,
    askOrRemove,
  };
  const confirmChat = confirm && confirm !== 'all' ? all.find((c) => c.contactId === confirm) : undefined;
  // Beim Ausblenden des Blatts sind Chat und Anzahl schon weg: Der Titel darf nicht zu "Alle 0 Chats" umspringen.
  const confirmCopy = useRef({ count: all.length, name: '' });
  if (confirm === 'all') confirmCopy.current.count = all.length;
  else if (confirmChat) confirmCopy.current.name = confirmChat.name;
  return (
    <PhoneScreen
      title="Nachrichten"
      subtitle={unread > 0 ? `${unread} ungelesen` : 'Alles gelesen'}
      search={{ value: query, onInput: setQuery, placeholder: 'Chats durchsuchen' }}
      actions={
        all.length > 0 && (
          <>
            <Button small variant="subtle" icon="checkCircle" disabled={unread === 0} onClick={markAllRead}>
              Alle gelesen
            </Button>
            <IconButton icon="more" label="Mehr" onClick={() => setMenu(true)} />
          </>
        )
      }
    >
      <RecentRow chats={recentContacts(all)} />
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
                  <ChatRow chat={c} tone={tone} actions={rowActions} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title="Nachrichten"
        actions={[
          { label: 'Alle als gelesen markieren', icon: 'checkCircle', disabled: unread === 0, onSelect: markAllRead },
          { label: 'Alle Chats löschen …', icon: 'trash', destructive: true, onSelect: () => setConfirm('all') },
        ]}
      />
      <ActionSheet
        open={confirm === 'all'}
        onClose={() => setConfirm(null)}
        title={`${confirmCopy.current.count === 1 ? 'Einen Chat' : `Alle ${confirmCopy.current.count} Chats`} löschen?`}
        message={
          withDeadline.length > 0
            ? `${withDeadline.map((c) => c.name).join(', ')} ${withDeadline.length === 1 ? 'wartet' : 'warten'} noch auf eine Antwort mit Frist. Gelöschte Chats kommen wieder, sobald jemand neu schreibt.`
            : 'Gelöschte Chats kommen wieder, sobald jemand neu schreibt.'
        }
        actions={[{ label: 'Alle löschen', icon: 'trash', destructive: true, onSelect: removeAll }]}
      />
      <ActionSheet
        open={!!confirmChat}
        onClose={() => setConfirm(null)}
        title={`Chat mit ${confirmCopy.current.name} löschen?`}
        message="Hier wartet noch eine Frage mit Frist auf deine Antwort. Löschen heißt: keine Antwort."
        actions={[
          {
            label: 'Trotzdem löschen',
            icon: 'trash',
            destructive: true,
            onSelect: () => confirmChat && remove(confirmChat.contactId),
          },
        ]}
      />
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

  // Die offene Frage steht unten als Antwort-Blatt, nicht mitten im Verlauf. Sind es mehrere, kommt die mit der frühesten
  // Frist zuerst (sonst läuft die ältere ab, während man die neuere beantwortet).
  const openQuestions = shown.filter((e) => e.type === 'message' && e.options.length > 0);
  const question = [...openQuestions].sort(
    (a, b) =>
      (a.type === 'message' ? (a.message.expiresAt ?? Number.POSITIVE_INFINITY) : 0) -
        (b.type === 'message' ? (b.message.expiresAt ?? Number.POSITIVE_INFINITY) : 0) ||
      (b.type === 'message' ? b.message.id : 0) - (a.type === 'message' ? a.message.id : 0),
  )[0];
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
      // Eine Seite zurück zur Liste: openPhone(APP_ID) räumte nebenbei alle Nachrichten-Mitteilungen weg.
      onBack={() => ui.back()}
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
              {openQuestions.length > 1 && <span class="msg-deadline">{openQuestions.length - 1} weitere offen</span>}
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
