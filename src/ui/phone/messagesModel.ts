// Ansicht der Nachrichten-App als reine Daten (ohne DOM, getestet in messagesModel.test.ts):
// Chat-Liste, Verlauf eines Chats mit Tagestrennern, Antwort-Optionen und Fristen, Benachrichtigungen.
// Die Nachrichten selbst verwaltet der Nachrichtendienst im Kern (src/core/messages.ts).

import { type ContactKind, clock, type GameState, type Message, messages } from '../../core';
import type { CategoryColor } from '../components';
import { memoState } from '../stateMemo';

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  customer: 'Kunde',
  supplier: 'Lieferant',
  gang: 'Gang',
  staff: 'Team',
  police: 'Polizei',
  other: 'Kontakt',
};

/** Icon je Kontaktart (Name aus dem Icon-Set). */
export const CONTACT_KIND_ICONS: Record<ContactKind, string> = {
  customer: 'user',
  supplier: 'truck',
  gang: 'skull',
  staff: 'users',
  police: 'shield',
  other: 'message',
};

/** Bedeutungsfarbe je Kontaktart (dieselbe wie die App dazu: Gangs rot, Lieferanten braun, Team türkis …). */
export const CONTACT_KIND_TONES: Record<ContactKind, CategoryColor> = {
  customer: 'money',
  supplier: 'goods',
  gang: 'danger',
  staff: 'people',
  police: 'law',
  other: 'system',
};

/** Überschrift der Gruppe in der Chat-Liste. */
export const CONTACT_KIND_PLURALS: Record<ContactKind, string> = {
  gang: 'Gangs',
  police: 'Polizei',
  supplier: 'Lieferanten',
  staff: 'Team',
  customer: 'Kunden',
  other: 'Kontakte',
};

/** Reihenfolge der Gruppen: erst Bedrohliches, dann Geschäft und Team, dann Kunden. */
export const CONTACT_KIND_ORDER: readonly ContactKind[] = ['gang', 'police', 'supplier', 'staff', 'customer', 'other'];

export interface ChatListItem {
  contactId: string;
  name: string;
  kind: ContactKind;
  kindLabel: string;
  avatar?: string;
  /** Vorschau der letzten Nachricht, eigene mit "Du: ". */
  preview: string;
  /** Zeit der letzten Nachricht: heute "21:34", sonst Wochentag oder "Tag 3". */
  timeLabel: string;
  unread: number;
  /** Wartet eine Nachricht auf Antwort? */
  awaitingAnswer: boolean;
  /** Früheste Antwortfrist unter den offenen Nachrichten. */
  deadline?: number;
  /** Verbleibende Spielminuten bis zur Frist (nur mit deadline). */
  deadlineIn?: number;
}

export interface ChatGroup {
  kind: ContactKind;
  label: string;
  items: ChatListItem[];
  /** Chats der Gruppe, die auf Antwort warten. */
  open: number;
  /** Ungelesene Nachrichten in der Gruppe. */
  unread: number;
}

/** Chats nach Kontaktart gruppiert (feste Reihenfolge, leere Gruppen entfallen). Innerhalb bleibt die Reihenfolge. */
export function groupChats(list: readonly ChatListItem[]): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const kind of CONTACT_KIND_ORDER) {
    const items = list.filter((c) => c.kind === kind);
    if (items.length === 0) continue;
    groups.push({
      kind,
      label: CONTACT_KIND_PLURALS[kind],
      items,
      open: items.filter((c) => c.awaitingAnswer).length,
      unread: items.reduce((sum, c) => sum + c.unread, 0),
    });
  }
  return groups;
}

export type ChatEntry =
  | { type: 'day'; key: string; label: string }
  | { type: 'unread'; key: string }
  | {
      type: 'message';
      key: string;
      message: Message;
      from: 'contact' | 'player';
      time: string;
      /** Antwort-Optionen, wenn noch geantwortet werden kann. */
      options: { id: string; label: string }[];
      /** "Antwort bis 21:30 (noch 45 Min.)" */
      deadlineLabel?: string;
      /** Frist bald um (unter 30 Spielminuten)? */
      urgent: boolean;
      expired: boolean;
      /** Gewählte Antwort (Beschriftung), falls beantwortet. */
      answeredWith?: string;
      /** Wer im Namen des Spielers geantwortet hat (z.B. "Rechte Hand"). */
      via?: string;
      /** Offene Frage: Routine (die Rechte Hand darf antworten) oder Chefsache. */
      routine?: boolean;
    };

/** Zeit relativ zu jetzt: heute nur Uhrzeit, gestern "Gestern", sonst Wochentag (diese Woche) oder "Tag n". */
export function timeLabel(time: number, now: number): string {
  const days = clock.day(now) - clock.day(time);
  if (days <= 0) return clock.formatTime(time);
  if (days === 1) return 'Gestern';
  if (days < 7) return clock.weekdayName(time, true);
  return `Tag ${clock.day(time)}`;
}

/**
 * Chat-Liste, neueste zuerst. Einmal pro Spielstand gerechnet (Nachrichten-App, Empfehlung "Antworten",
 * Island-Fristen und Menü fragen alle), nicht verändern.
 */
export const chatList: (state: GameState) => ChatListItem[] = memoState(computeChatList);

function computeChatList(state: GameState): ChatListItem[] {
  return messages.threads(state).map((thread) => {
    const history = messages.thread(state, thread.contact.id);
    const open = history.filter((m) => messages.canAnswer(state, m));
    const deadlines = open.map((m) => m.expiresAt).filter((t): t is number => t !== undefined);
    const item: ChatListItem = {
      contactId: thread.contact.id,
      name: thread.contact.name,
      kind: thread.contact.kind,
      kindLabel: CONTACT_KIND_LABELS[thread.contact.kind] ?? 'Kontakt',
      preview: `${thread.last.from === 'player' ? `${thread.last.via ?? 'Du'}: ` : ''}${thread.last.text}`,
      timeLabel: timeLabel(thread.last.time, state.time),
      unread: thread.unread,
      awaitingAnswer: open.length > 0,
    };
    if (thread.contact.avatar) item.avatar = thread.contact.avatar;
    if (deadlines.length > 0) {
      item.deadline = Math.min(...deadlines);
      item.deadlineIn = item.deadline - state.time;
    }
    return item;
  });
}

/** Die zuletzt aktiven Kontakte (höchstens `limit`) für die Reihe oben in der Liste, neueste zuerst. */
export function recentContacts(list: readonly ChatListItem[], limit = 5): ChatListItem[] {
  return list.slice(0, limit);
}

/**
 * Verlauf eines Chats. firstUnreadId: erste ungelesene Nachricht beim Öffnen (davor kommt ein
 * "Neu"-Trenner); die App merkt sie sich, weil der Chat beim Öffnen sofort als gelesen markiert wird.
 */
export function chatEntries(state: GameState, contactId: string, firstUnreadId?: number | null): ChatEntry[] {
  const entries: ChatEntry[] = [];
  let lastDay = -1;
  const list = messages.thread(state, contactId);
  for (const m of list) {
    const day = clock.day(m.time);
    if (day !== lastDay) {
      lastDay = day;
      entries.push({ type: 'day', key: `day-${day}`, label: `${clock.weekdayName(m.time)} · Tag ${day}` });
    }
    if (firstUnreadId !== undefined && firstUnreadId !== null && m.id === firstUnreadId) {
      entries.push({ type: 'unread', key: 'unread' });
    }
    const answerable = messages.canAnswer(state, m);
    const remaining = m.expiresAt !== undefined ? m.expiresAt - state.time : undefined;
    const answered = m.answer ? m.options?.find((o) => o.id === m.answer)?.label : undefined;
    const entry: ChatEntry = {
      type: 'message',
      key: `m-${m.id}`,
      message: m,
      from: m.from,
      time: clock.formatTime(m.time),
      options: answerable ? (m.options ?? []).map((o) => ({ id: o.id, label: o.label })) : [],
      urgent: answerable && remaining !== undefined && remaining < 30,
      expired: !!m.options?.length && !m.answer && (m.expired === true || (remaining !== undefined && remaining <= 0)),
    };
    if (answerable && m.expiresAt !== undefined && remaining !== undefined) {
      entry.deadlineLabel = `Antwort bis ${clock.formatTime(m.expiresAt)} (noch ${clock.formatDuration(remaining)})`;
    }
    if (answered) entry.answeredWith = answered;
    if (m.via) entry.via = m.via;
    if (answerable) entry.routine = !!m.routine;
    entries.push(entry);
  }
  return entries;
}

/** Erste ungelesene Nachricht eines Chats (für den "Neu"-Trenner). */
export function firstUnread(state: GameState, contactId: string): number | null {
  return messages.thread(state, contactId).find((m) => !m.read)?.id ?? null;
}

export interface MessageNotification {
  title: string;
  text: string;
  icon: string;
  appId: 'core.messages';
  params: { contactId: string };
}

/** Banner für eine neu eingegangene Nachricht. */
export function messageNotification(state: GameState, messageId: number): MessageNotification | null {
  const message = messages.get(state, messageId);
  if (!message || message.silent) return null;
  const contact = messages.contact(state, message.contactId);
  const answer = messages.canAnswer(state, message) ? ' · Antwort erwartet' : '';
  return {
    title: `${contact?.name ?? 'Unbekannt'}${answer}`,
    text: message.text,
    icon: contact?.avatar ?? CONTACT_KIND_ICONS[contact?.kind ?? 'other'],
    appId: 'core.messages',
    params: { contactId: message.contactId },
  };
}
