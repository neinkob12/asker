// Nachrichten: Handy-Nachrichten von Figuren (Kunden, Lieferanten, Gangs, Mitarbeiter).
// Module schicken sie mit messages.send(), die Handy-App (src/ui/phone) zeigt sie an.
// Antwort-Optionen lösen Befehle aus: Der Spieler antwortet über den Befehl 'messages.answer'.
// Gelöschte Chats (Befehle 'messages.delete', 'messages.deleteAll') bleiben im Spielstand, sind aber ausgeblendet:
// `hidden` merkt sich pro Kontakt die letzte ausgeblendete Nachricht. Schreibt die Figur neu, taucht der Chat mit
// den neuen Nachrichten wieder auf.

import { MESSAGE_LIMIT } from './config';
import type { Command, CommandResult, Ctx, GameState } from './types';

export type ContactKind = 'customer' | 'supplier' | 'gang' | 'staff' | 'police' | 'other';

export interface Contact {
  /** Eindeutig über alle Module, Konvention: '<art>:<id>', z.B. 'gang:nord', 'staff:s12'. */
  id: string;
  name: string;
  kind: ContactKind;
  /** Bild-URL oder Emoji, optional. */
  avatar?: string;
}

export interface MessageOption {
  id: string;
  /** Beschriftung des Buttons. */
  label: string;
  /** Befehl, der beim Antworten ausgeführt wird. Schlägt er fehl, gilt die Nachricht als unbeantwortet. */
  command?: Command;
  /** Text, der als Antwort des Spielers im Chat erscheint. Standard: label. */
  reply?: string;
}

export interface Message {
  id: number;
  contactId: string;
  time: number;
  from: 'contact' | 'player';
  text: string;
  read: boolean;
  options?: MessageOption[];
  /** ID der gewählten Option. */
  answer?: string;
  /** Ab dann kann nicht mehr geantwortet werden. */
  expiresAt?: number;
  expired?: boolean;
  /** Still: nur Badge, kein Banner und kein Vibrieren (z.B. viele kleine Routine-Nachrichten). */
  silent?: boolean;
  /** Modul, das die Nachricht geschickt hat. */
  source: string;
}

export interface MessagesState {
  contacts: Record<string, Contact>;
  /** Älteste zuerst. */
  list: Message[];
  /** Gelöschte Chats: Kontakt → ID der letzten ausgeblendeten Nachricht (alles bis dahin ist weg). */
  hidden: Record<string, number>;
}

export interface SendMessage {
  contact: Contact;
  text: string;
  options?: MessageOption[];
  /** Antwortfrist in Spielminuten. */
  expiresIn?: number;
  /** Still zustellen: ungelesen im Handy, aber ohne Banner (für Routine-Nachrichten). */
  silent?: boolean;
}

export interface MessageThread {
  contact: Contact;
  last: Message;
  unread: number;
}

declare module './types' {
  interface GameCommands {
    'messages.answer': { messageId: number; optionId: string };
    'messages.markRead': { contactId: string };
    /** Alle Chats als gelesen markieren. */
    'messages.markAllRead': Record<string, never>;
    /** Chat löschen (ausblenden). Offene Fragen darin gelten als erledigt, ohne Antwort. */
    'messages.delete': { contactId: string };
    'messages.deleteAll': Record<string, never>;
  }
  interface GameEvents {
    'message.received': { messageId: number; contactId: string; source: string };
    'message.answered': { messageId: number; contactId: string; optionId: string; source: string };
    'message.expired': { messageId: number; contactId: string; source: string };
  }
}

export function createMessagesState(): MessagesState {
  return { contacts: {}, list: [], hidden: {} };
}

/** Ist die Nachricht in einem gelöschten Chat (ausgeblendet)? */
function isHidden(state: GameState, m: Message): boolean {
  return m.id <= (state.messages.hidden[m.contactId] ?? 0);
}

export const messages = {
  /** Nachricht an den Spieler schicken. Gibt die Nachrichten-ID zurück. */
  send(ctx: Ctx, msg: SendMessage): number {
    const state = ctx.state.messages;
    state.contacts[msg.contact.id] = { ...msg.contact };
    const message: Message = {
      id: ctx.nextId(),
      contactId: msg.contact.id,
      time: ctx.now,
      from: 'contact',
      text: msg.text,
      read: false,
      source: ctx.moduleId,
    };
    if (msg.options?.length) message.options = msg.options.map((o) => ({ ...o }));
    if (msg.expiresIn !== undefined) message.expiresAt = ctx.now + msg.expiresIn;
    if (msg.silent) message.silent = true;
    state.list.push(message);
    if (state.list.length > MESSAGE_LIMIT) state.list.splice(0, state.list.length - MESSAGE_LIMIT);
    ctx.emit('message.received', { messageId: message.id, contactId: message.contactId, source: message.source });
    return message.id;
  },

  get(state: GameState, messageId: number): Message | undefined {
    return state.messages.list.find((m) => m.id === messageId);
  },

  contact(state: GameState, contactId: string): Contact | undefined {
    return state.messages.contacts[contactId];
  },

  /** Alle sichtbaren Nachrichten mit einer Figur, älteste zuerst (ohne die eines gelöschten Chats). */
  thread(state: GameState, contactId: string): Message[] {
    return state.messages.list.filter((m) => m.contactId === contactId && !isHidden(state, m));
  },

  /** Chats, neueste zuerst (gelöschte nur, wenn die Figur danach wieder geschrieben hat). */
  threads(state: GameState): MessageThread[] {
    const byContact = new Map<string, MessageThread>();
    for (const m of state.messages.list) {
      const contact = state.messages.contacts[m.contactId];
      if (!contact || isHidden(state, m)) continue;
      const t = byContact.get(m.contactId) ?? { contact, last: m, unread: 0 };
      t.last = m;
      if (!m.read) t.unread++;
      byContact.set(m.contactId, t);
    }
    return [...byContact.values()].sort((a, b) => b.last.time - a.last.time || b.last.id - a.last.id);
  },

  unreadCount(state: GameState, contactId?: string): number {
    return state.messages.list.filter(
      (m) => !m.read && (!contactId || m.contactId === contactId) && !isHidden(state, m),
    ).length;
  },

  /** Wartet in diesem Chat eine Frage mit Frist auf Antwort? (Für die Rückfrage vor dem Löschen.) */
  hasOpenDeadline(state: GameState, contactId: string): boolean {
    return messages.thread(state, contactId).some((m) => messages.canAnswer(state, m) && m.expiresAt !== undefined);
  },

  /** Kann auf diese Nachricht noch geantwortet werden? */
  canAnswer(state: GameState, message: Message): boolean {
    return (
      !!message.options?.length && !message.answer && !message.expired && (message.expiresAt ?? Infinity) > state.time
    );
  },
};

// Befehle und Ablauf des Nachrichtendienstes, werden vom Kern registriert.

export function answerMessage(ctx: Ctx, payload: { messageId: number; optionId: string }): CommandResult {
  const message = messages.get(ctx.state, payload.messageId);
  if (!message) return { ok: false, reason: 'Nachricht gibt es nicht mehr.' };
  if (!messages.canAnswer(ctx.state, message)) return { ok: false, reason: 'Darauf kannst du nicht mehr antworten.' };
  const option = message.options?.find((o) => o.id === payload.optionId);
  if (!option) return { ok: false, reason: 'Unbekannte Antwort.' };
  if (option.command) {
    const result = ctx.dispatch(option.command, { actor: 'player' });
    if (!result.ok) return result;
  }
  message.answer = option.id;
  message.read = true;
  ctx.state.messages.list.push({
    id: ctx.nextId(),
    contactId: message.contactId,
    time: ctx.now,
    from: 'player',
    text: option.reply ?? option.label,
    read: true,
    source: 'core',
  });
  ctx.emit('message.answered', {
    messageId: message.id,
    contactId: message.contactId,
    optionId: option.id,
    source: message.source,
  });
  return { ok: true };
}

export function markThreadRead(ctx: Ctx, payload: { contactId: string }): CommandResult {
  for (const m of ctx.state.messages.list) if (m.contactId === payload.contactId) m.read = true;
  return { ok: true };
}

export function markAllRead(ctx: Ctx): CommandResult {
  for (const m of ctx.state.messages.list) m.read = true;
  return { ok: true };
}

/** Chat ausblenden: alles bis zur letzten Nachricht gilt als gelöscht und gelesen. */
function hideThread(state: GameState, contactId: string): void {
  let last = 0;
  for (const m of state.messages.list) {
    if (m.contactId !== contactId) continue;
    m.read = true;
    if (m.id > last) last = m.id;
  }
  if (last > 0) state.messages.hidden[contactId] = last;
}

export function deleteThread(ctx: Ctx, payload: { contactId: string }): CommandResult {
  if (!ctx.state.messages.contacts[payload.contactId]) return { ok: false, reason: 'Diesen Chat gibt es nicht.' };
  hideThread(ctx.state, payload.contactId);
  return { ok: true };
}

export function deleteAllThreads(ctx: Ctx): CommandResult {
  for (const contactId of Object.keys(ctx.state.messages.contacts)) hideThread(ctx.state, contactId);
  return { ok: true };
}

/** Abgelaufene Antwortfristen markieren. Läuft jeden Schritt. */
export function expireMessages(ctx: Ctx): void {
  for (const m of ctx.state.messages.list) {
    if (m.expired || m.answer || m.expiresAt === undefined || m.expiresAt > ctx.now) continue;
    m.expired = true;
    ctx.emit('message.expired', { messageId: m.id, contactId: m.contactId, source: m.source });
  }
}
