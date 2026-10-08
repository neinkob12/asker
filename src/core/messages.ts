// Nachrichten: Handy-Nachrichten von Figuren (Kunden, Lieferanten, Gangs, Mitarbeiter).
// Module schicken sie mit messages.send(), die Handy-App (src/ui/phone) zeigt sie an.
// Antwort-Optionen lösen Befehle aus: Der Spieler antwortet über den Befehl 'messages.answer'.
// Gelöschte Chats (Befehle 'messages.delete', 'messages.deleteAll') bleiben im Spielstand, sind aber ausgeblendet:
// `hidden` merkt sich pro Kontakt die letzte ausgeblendete Nachricht. Schreibt die Figur neu, taucht der Chat mit
// den neuen Nachrichten wieder auf.
// Anrufe (Auftrag 30, messages.call): eine Nachricht mit `call` (Zeilen des Gesprächs, klingelt/angenommen/verpasst/
// abgelehnt). Angenommen ('messages.acceptCall') kommen die Zeilen und danach die Antworten (wie jede Frage über
// 'messages.answer'). Klingelt es CALL_RING_MINUTES ohne Annahme, ist er verpasst: Die Figur schreibt kurz und ruft
// CALL_RETRY_MINUTES später noch einmal an, höchstens CALL_MAX_ATTEMPTS-mal; danach (oder nach 'messages.declineCall')
// bleibt der Chat mit denselben Antworten. Klingelnde Anrufe und Rückrufe stehen in `calls` (Kernschema 3).

import { MINUTES_PER_DAY } from './clock';
import { CALL_MAX_ATTEMPTS, CALL_RETRY_MINUTES, CALL_RING_MINUTES, MESSAGE_LIMIT } from './config';
import { type Look, lookFor, personLook, type VoiceSpec, voiceFor } from './looks';
import type { Command, CommandResult, Ctx, GameState } from './types';

export type ContactKind = 'customer' | 'supplier' | 'gang' | 'staff' | 'police' | 'other';

export interface Contact {
  /** Eindeutig über alle Module, Konvention: '<art>:<id>', z.B. 'gang:nord', 'staff:s12'. */
  id: string;
  name: string;
  kind: ContactKind;
  /** Bild-URL oder Emoji, optional. Ohne Bild zeigt das Handy bei Personen ein gezeichnetes Porträt (look). */
  avatar?: string;
  /** Wer das ist, kurz, z.B. "Hamburger Hafen" (Profil, Anruf). Standard: die Art des Kontakts. */
  role?: string;
  /** Ein, zwei Sätze über die Figur (Profil im Handy). */
  about?: string;
  /**
   * Aussehen fürs Porträt, auch nur teilweise (der Rest kommt fest aus der ID, siehe lookFor). Ein leeres Objekt heißt:
   * eine Person mit Gesicht, auch wenn die Art (z.B. 'other') sonst keins bekäme.
   */
  look?: Partial<Look>;
  /** Stimme im Anruf, auch nur teilweise (Rest passend zum Aussehen, siehe voiceFor). */
  voice?: Partial<VoiceSpec>;
}

/** Arten, die immer Personen sind (Gesicht auch ohne eigenes Aussehen). Gangs und 'other' nur mit look. */
const PERSON_KINDS: ReadonlySet<ContactKind> = new Set(['customer', 'supplier', 'staff', 'police']);

/** Aussehen eines Kontakts, null für Nicht-Personen (Gangs, Ticker) und Kontakte mit eigenem Bild. */
export function contactLook(contact: Contact | undefined): Look | null {
  if (!contact) return null;
  if (!contact.look && (contact.avatar || !PERSON_KINDS.has(contact.kind))) return null;
  // Ohne eigenes Aussehen über den Namen wie im Personal (personLook), sonst über die ID.
  return contact.look ? lookFor(contact.id, contact.name, contact.look) : personLook(contact.name);
}

/** Stimme eines Kontakts im Anruf (auch für Nicht-Personen, dann neutral aus der ID). */
export function contactVoice(contact: Contact | undefined, contactId = contact?.id ?? ''): VoiceSpec {
  const look = contactLook(contact) ?? lookFor(contactId, contact?.name ?? '', contact?.look);
  return voiceFor(contactId, look, contact?.voice);
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
  /**
   * Routine: Die Rechte Hand darf diese Frage für dich beantworten (Aufgabe "Aufträge und Handy"). Fehlt die
   * Kennzeichnung, ist es Chefsache (Gangs, Polizei, Großhandel über ihrem Limit, Leute mit Frist).
   */
  routine?: boolean;
  /** Antwort im Namen von jemandem (z.B. "Rechte Hand"), nur bei from 'player'. */
  via?: string;
  /** Anruf statt Textnachricht (Auftrag 30). text ist dann eine kurze Zusammenfassung für die Chat-Liste. */
  call?: CallInfo;
  /** Modul, das die Nachricht geschickt hat. */
  source: string;
}

export type CallStatus = 'ringing' | 'accepted' | 'missed' | 'declined';

export interface CallInfo {
  /** Was die Figur am Telefon sagt, Zeile für Zeile (erscheint als Sprechblasen). */
  lines: string[];
  state: CallStatus;
  /** Bis wann es klingelt (Spielminute). */
  ringUntil: number;
  /** Der wievielte Versuch (ab 1). */
  attempt: number;
  /** Letzter Versuch: Verpasst bleibt er als Chat mit Antworten stehen. */
  final: boolean;
  /** Antwortfrist nach dem Gespräch (Spielminuten), siehe PlaceCall. */
  expiresIn?: number;
  missedText?: string;
  gaveUpText?: string;
}

/** Ein Rückruf, der noch aussteht (nach einem verpassten Anruf). */
export interface CallRetry {
  at: number;
  attempt: number;
  call: PlaceCall;
  /** Modul, das angerufen hat. */
  source: string;
}

export interface MessagesState {
  contacts: Record<string, Contact>;
  /** Älteste zuerst. */
  list: Message[];
  /** Gelöschte Chats: Kontakt → ID der letzten ausgeblendeten Nachricht (alles bis dahin ist weg). */
  hidden: Record<string, number>;
  /** Anrufe: welche gerade klingeln (Nachrichten-IDs) und welche Rückrufe ausstehen. */
  calls: { ringing: number[]; retries: CallRetry[] };
  /**
   * Abgelegt (Auftrag 43): Chats, deren letzte Nachricht höchstens diese ID hat, stehen in der Liste eingeklappt unter
   * `label` (z.B. „Frühere Städte“ nach dem Verkauf). Schreibt die Figur neu, ist der Chat wieder oben.
   */
  archive?: { upTo: number; label: string };
}

/** Anruf einer Figur (messages.call). */
export interface PlaceCall {
  contact: Contact;
  /** Das Gespräch, Zeile für Zeile. */
  lines: string[];
  /** Antworten am Ende des Gesprächs (wie bei einer Frage im Chat). */
  options?: MessageOption[];
  /** Antwortfrist nach Gesprächsende in Spielminuten (ohne: keine Frist). */
  expiresIn?: number;
  /** Kurz für die Chat-Liste, Standard "Anruf". */
  summary?: string;
  /** Was die Figur nach einem verpassten Anruf schreibt. */
  missedText?: string;
  /** Was sie schreibt, wenn sie es aufgibt (letzter Versuch verpasst). */
  gaveUpText?: string;
}

export interface SendMessage {
  contact: Contact;
  text: string;
  options?: MessageOption[];
  /** Antwortfrist in Spielminuten. */
  expiresIn?: number;
  /** Still zustellen: ungelesen im Handy, aber ohne Banner (für Routine-Nachrichten). */
  silent?: boolean;
  /** Routine: Die Rechte Hand darf antworten. Ohne Angabe Chefsache. */
  routine?: boolean;
}

/** Antwort im Namen von jemandem (Rechte Hand): Die Option gilt als gewählt, ihr Befehl läuft nicht noch einmal. */
export interface AnswerAs {
  messageId: number;
  optionId: string;
  /** Wer geantwortet hat, z.B. "Rechte Hand". */
  via: string;
  /** Text der Antwort im Chat. Standard: reply bzw. label der Option. */
  reply?: string;
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
    /** Klingelnden Anruf annehmen (danach kommen die Zeilen und die Antworten). */
    'messages.acceptCall': { messageId: number };
    /** Klingelnden Anruf ablehnen: Die Figur ruft nicht noch einmal an, die Antworten bleiben im Chat. */
    'messages.declineCall': { messageId: number };
  }
  interface GameEvents {
    'message.received': { messageId: number; contactId: string; source: string };
    'message.answered': { messageId: number; contactId: string; optionId: string; source: string; via?: string };
    'message.expired': { messageId: number; contactId: string; source: string };
    /** Ein Anruf klingelt (auch ein Rückruf). */
    'call.ringing': { messageId: number; contactId: string; source: string; attempt: number };
    'call.accepted': { messageId: number; contactId: string; source: string };
    'call.declined': { messageId: number; contactId: string; source: string };
    /** Nicht angenommen. final: Es kommt kein Rückruf mehr. */
    'call.missed': { messageId: number; contactId: string; source: string; final: boolean };
  }
}

export function createMessagesState(): MessagesState {
  return { contacts: {}, list: [], hidden: {}, calls: { ringing: [], retries: [] } };
}

const MISSED_TEXT = 'Hab versucht dich zu erreichen. Ich ruf später nochmal an.';
const GAVE_UP_TEXT = 'Ich erreich dich nicht. Lies das hier, wenn du Zeit hast.';

/** Einen Anruf klingeln lassen (Versuch attempt). Gibt die Nachrichten-ID zurück. */
function ring(ctx: Ctx, call: PlaceCall, attempt: number, source: string): number {
  const state = ctx.state.messages;
  state.contacts[call.contact.id] = { ...call.contact };
  const message: Message = {
    id: ctx.nextId(),
    contactId: call.contact.id,
    time: ctx.now,
    from: 'contact',
    text: call.summary ?? 'Anruf',
    read: false,
    silent: true,
    source,
    call: {
      lines: [...call.lines],
      state: 'ringing',
      ringUntil: ctx.now + CALL_RING_MINUTES,
      attempt,
      final: attempt >= CALL_MAX_ATTEMPTS,
    },
  };
  const info = message.call as CallInfo;
  if (call.expiresIn !== undefined) info.expiresIn = call.expiresIn;
  if (call.missedText) info.missedText = call.missedText;
  if (call.gaveUpText) info.gaveUpText = call.gaveUpText;
  if (call.options?.length) message.options = call.options.map((o) => ({ ...o }));
  state.list.push(message);
  if (state.list.length > MESSAGE_LIMIT) state.list.splice(0, state.list.length - MESSAGE_LIMIT);
  state.calls.ringing.push(message.id);
  ctx.emit('message.received', { messageId: message.id, contactId: message.contactId, source });
  ctx.emit('call.ringing', { messageId: message.id, contactId: message.contactId, source, attempt });
  return message.id;
}

/** Alles, um einen Anruf noch einmal zu machen (Rückruf), steht in der Nachricht selbst. */
function planOf(state: GameState, message: Message): PlaceCall {
  const contact = state.messages.contacts[message.contactId] ?? {
    id: message.contactId,
    name: message.contactId,
    kind: 'other' as const,
  };
  const call = message.call;
  const plan: PlaceCall = { contact, lines: [...(call?.lines ?? [])], summary: message.text };
  if (message.options) plan.options = message.options.map((o) => ({ ...o }));
  if (call?.expiresIn !== undefined) plan.expiresIn = call.expiresIn;
  if (call?.missedText) plan.missedText = call.missedText;
  if (call?.gaveUpText) plan.gaveUpText = call.gaveUpText;
  return plan;
}

/** Ist die Nachricht in einem gelöschten Chat (ausgeblendet)? */
function isHidden(state: GameState, m: Message): boolean {
  return m.id <= (state.messages.hidden[m.contactId] ?? 0);
}

/**
 * Sichtbare Nachrichten nach Kontakt, gemerkt pro Stand der Liste. Die Oberfläche fragt zehnmal pro Sekunde nach allen
 * Chats; ohne Index filterte jede Frage die ganze Liste (Kontakte × Nachrichten). Die Liste wächst nur hinten und
 * verliert vorne (MESSAGE_LIMIT), deshalb erkennt man eine Änderung an Länge, erster und letzter ID; gelöschte Chats
 * an `hidden`. Gelesen, beantwortet und abgelaufen stehen in den Nachrichten selbst und werden live gelesen.
 */
interface MessageIndex {
  list: Message[];
  length: number;
  first: number;
  last: number;
  hiddenCount: number;
  hiddenSum: number;
  byContact: Map<string, Message[]>;
}

const indexes = new WeakMap<MessagesState, MessageIndex>();

function messageIndex(state: GameState): MessageIndex {
  const s = state.messages;
  const list = s.list;
  let hiddenCount = 0;
  let hiddenSum = 0;
  for (const id in s.hidden) {
    hiddenCount++;
    hiddenSum += s.hidden[id];
  }
  const first = list[0]?.id ?? 0;
  const last = list[list.length - 1]?.id ?? 0;
  const cached = indexes.get(s);
  if (
    cached &&
    cached.list === list &&
    cached.length === list.length &&
    cached.first === first &&
    cached.last === last &&
    cached.hiddenCount === hiddenCount &&
    cached.hiddenSum === hiddenSum
  ) {
    return cached;
  }
  const byContact = new Map<string, Message[]>();
  for (const m of list) {
    if (isHidden(state, m)) continue;
    const thread = byContact.get(m.contactId);
    if (thread) thread.push(m);
    else byContact.set(m.contactId, [m]);
  }
  const index = { list, length: list.length, first, last, hiddenCount, hiddenSum, byContact };
  indexes.set(s, index);
  return index;
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
    if (msg.routine) message.routine = true;
    state.list.push(message);
    if (state.list.length > MESSAGE_LIMIT) state.list.splice(0, state.list.length - MESSAGE_LIMIT);
    ctx.emit('message.received', { messageId: message.id, contactId: message.contactId, source: message.source });
    return message.id;
  },

  /**
   * Eine Figur ruft an (Auftrag 30). Es klingelt CALL_RING_MINUTES; angenommen kommen die Zeilen und danach die
   * Antworten, verpasst ruft sie später noch einmal an (siehe oben). Gibt die Nachrichten-ID zurück.
   */
  call(ctx: Ctx, call: PlaceCall): number {
    return ring(ctx, call, 1, ctx.moduleId);
  },

  /**
   * Anrufe einer Figur beenden (Auftrag 42): Es klingelt nicht mehr, geplante Rückrufe fallen weg. Für Angebote, die
   * der Spieler inzwischen anders angenommen hat (z.B. per Knopf in einer App). Die Nachricht bleibt im Chat.
   */
  cancelCalls(ctx: Ctx, contactId: string): void {
    const calls = ctx.state.messages.calls;
    for (const id of [...calls.ringing]) {
      const message = messages.get(ctx.state, id);
      if (message?.contactId !== contactId) continue;
      if (message.call) message.call.state = 'declined';
      stopRinging(ctx.state, id);
    }
    calls.retries = calls.retries.filter((r) => r.call.contact.id !== contactId);
  },

  /** Klingelt gerade ein Anruf? (der älteste zuerst) */
  ringingCalls(state: GameState): Message[] {
    const ids = state.messages.calls?.ringing ?? [];
    return ids.map((id) => messages.get(state, id)).filter((m): m is Message => m?.call?.state === 'ringing');
  },

  get(state: GameState, messageId: number): Message | undefined {
    return state.messages.list.find((m) => m.id === messageId);
  },

  contact(state: GameState, contactId: string): Contact | undefined {
    return state.messages.contacts[contactId];
  },

  /** Alle sichtbaren Nachrichten mit einer Figur, älteste zuerst (ohne die eines gelöschten Chats). */
  thread(state: GameState, contactId: string): Message[] {
    return [...(messageIndex(state).byContact.get(contactId) ?? [])];
  },

  /** Chats, neueste zuerst (gelöschte nur, wenn die Figur danach wieder geschrieben hat). */
  threads(state: GameState): MessageThread[] {
    const result: MessageThread[] = [];
    for (const [contactId, list] of messageIndex(state).byContact) {
      const contact = state.messages.contacts[contactId];
      if (!contact) continue;
      let unread = 0;
      for (const m of list) if (!m.read) unread++;
      result.push({ contact, last: list[list.length - 1], unread });
    }
    return result.sort((a, b) => b.last.time - a.last.time || b.last.id - a.last.id);
  },

  unreadCount(state: GameState, contactId?: string): number {
    const index = messageIndex(state);
    let unread = 0;
    if (contactId) {
      for (const m of index.byContact.get(contactId) ?? []) if (!m.read) unread++;
      return unread;
    }
    for (const list of index.byContact.values()) for (const m of list) if (!m.read) unread++;
    return unread;
  },

  /**
   * Hat die Figur heute (am laufenden Spieltag) schon geschrieben oder angerufen? Auftrag 46d: Gangs und Polizei
   * melden sich höchstens einmal am Tag von selbst. Zählt auch Nachrichten in gelöschten Chats.
   */
  sentToday(state: GameState, contactId: string): boolean {
    const dayStart = Math.floor(state.time / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    const list = state.messages.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.time < dayStart) break;
      if (m.contactId === contactId && m.from === 'contact') return true;
    }
    return false;
  },

  /** Wartet in diesem Chat eine Frage mit Frist auf Antwort? (Für die Rückfrage vor dem Löschen.) */
  hasOpenDeadline(state: GameState, contactId: string): boolean {
    const list = messageIndex(state).byContact.get(contactId) ?? [];
    return list.some((m) => messages.canAnswer(state, m) && m.expiresAt !== undefined);
  },

  /**
   * Kann auf diese Nachricht noch geantwortet werden? Bei einem Anruf erst, wenn er angenommen oder abgelehnt ist bzw.
   * der letzte Versuch verpasst wurde (vorher klingelt es, oder es kommt noch ein Rückruf).
   */
  canAnswer(state: GameState, message: Message): boolean {
    if (!message.options?.length || message.answer || message.expired) return false;
    if ((message.expiresAt ?? Infinity) <= state.time) return false;
    const call = message.call;
    if (!call) return true;
    return call.state === 'accepted' || call.state === 'declined' || (call.state === 'missed' && call.final);
  },

  /**
   * Eine offene Frage zurückziehen, weil sie sich erledigt hat (z.B. der Container ist längst abgeholt). Sie zeigt dann
   * "Keine Antwort mehr möglich" und zählt nicht mehr als offen. Kein Ereignis, keine Antwort im Chat.
   */
  retract(ctx: Ctx, messageId: number): void {
    const message = messages.get(ctx.state, messageId);
    if (message && messages.canAnswer(ctx.state, message)) message.expired = true;
  },

  /**
   * Alle offenen Fragen zurückziehen, auf die der Test zutrifft: Die Sache wurde auf anderem Weg erledigt (z.B. ein
   * Bewerber über die App eingestellt, ein Lieferant freigeschaltet), die Frage im Chat wäre sonst bis zum Ablauf
   * noch zu sehen und führte ins Leere.
   */
  retractWhere(ctx: Ctx, test: (message: Message) => boolean): void {
    for (const message of ctx.state.messages.list) {
      if (messages.canAnswer(ctx.state, message) && test(message)) message.expired = true;
    }
  },

  /** Alle Chats bis jetzt ablegen (eingeklappt unter `label`), z.B. beim Verkauf des Geschäfts. */
  archive(ctx: Ctx, label: string): void {
    const list = ctx.state.messages.list;
    const upTo = list.length > 0 ? list[list.length - 1].id : 0;
    ctx.state.messages.archive = { upTo, label };
  },

  /** Ist der Chat abgelegt (seine letzte Nachricht liegt vor dem Ablegen)? */
  isArchived(state: GameState, lastMessageId: number): boolean {
    const archive = state.messages.archive;
    return archive !== undefined && lastMessageId <= archive.upTo;
  },

  /** Offene Fragen, die als Routine gekennzeichnet sind (die Rechte Hand darf sie beantworten). */
  openRoutine(state: GameState): Message[] {
    return state.messages.list.filter((m) => m.routine && messages.canAnswer(state, m) && !isHidden(state, m));
  },

  /**
   * Eine offene Frage im Namen von jemandem beantworten (z.B. die Rechte Hand sagt einem Kunden zu). Der Aufrufer hat
   * den Befehl der Option schon selbst ausgeführt; hier wird nur die Antwort im Chat festgehalten. false, wenn die
   * Nachricht nicht mehr offen ist oder die Option fehlt.
   */
  answerAs(ctx: Ctx, answer: AnswerAs): boolean {
    const message = messages.get(ctx.state, answer.messageId);
    if (!message || !messages.canAnswer(ctx.state, message) || isHidden(ctx.state, message)) return false;
    const option = message.options?.find((o) => o.id === answer.optionId);
    if (!option) return false;
    message.answer = option.id;
    message.read = true;
    ctx.state.messages.list.push({
      id: ctx.nextId(),
      contactId: message.contactId,
      time: ctx.now,
      from: 'player',
      text: answer.reply ?? option.reply ?? option.label,
      read: true,
      via: answer.via,
      source: 'core',
    });
    ctx.emit('message.answered', {
      messageId: message.id,
      contactId: message.contactId,
      optionId: option.id,
      source: message.source,
      via: answer.via,
    });
    return true;
  },
};

// Befehle und Ablauf des Nachrichtendienstes, werden vom Kern registriert.

export function answerMessage(ctx: Ctx, payload: { messageId: number; optionId: string }): CommandResult {
  const message = messages.get(ctx.state, payload.messageId);
  if (!message) return { ok: false, reason: 'Nachricht gibt es nicht mehr.' };
  if (!messages.canAnswer(ctx.state, message)) return { ok: false, reason: 'Darauf kannst du nicht mehr antworten.' };
  const option = message.options?.find((o) => o.id === payload.optionId);
  if (!option) return { ok: false, reason: 'Unbekannte Antwort.' };
  // Die Antwort steht vor dem, was der Befehl auslöst (die Reaktion des Kontakts kommt danach); scheitert er, nimmt
  // sie nichts mit zurück.
  const reply: Message = {
    id: ctx.nextId(),
    contactId: message.contactId,
    time: ctx.now,
    from: 'player',
    text: option.reply ?? option.label,
    read: true,
    source: 'core',
  };
  ctx.state.messages.list.push(reply);
  // Beantwortet gilt die Frage schon, während der Befehl läuft: Zieht er sie selbst zurück (retractWhere, z.B.
  // einstellen oder freischalten), darf sie nicht zugleich beantwortet und abgelaufen sein.
  message.answer = option.id;
  if (option.command) {
    let result: CommandResult;
    try {
      result = ctx.dispatch(option.command, { actor: 'player' });
    } catch (error) {
      delete message.answer;
      ctx.state.messages.list = ctx.state.messages.list.filter((m) => m !== reply);
      throw error;
    }
    if (!result.ok) {
      delete message.answer;
      ctx.state.messages.list = ctx.state.messages.list.filter((m) => m !== reply);
      return result;
    }
  }
  message.read = true;
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

/**
 * Chat ausblenden: alles bis zur letzten Nachricht gilt als gelöscht und gelesen. Offene Fragen darin sind erledigt,
 * ohne Antwort (wie abgelaufen): Sonst lebten sie unsichtbar weiter, mit Auftrag, Island und Zähler, aber ohne Knöpfe.
 */
function hideThread(ctx: Ctx, contactId: string): void {
  const state = ctx.state;
  let last = 0;
  // Ausstehende Rückrufe dieser Figur entfallen: Sonst klingelte es aus einem gelöschten Chat wieder.
  const calls = state.messages.calls;
  if (calls) calls.retries = calls.retries.filter((r) => r.call.contact.id !== contactId);
  for (const m of state.messages.list) {
    if (m.contactId !== contactId) continue;
    m.read = true;
    if (m.id > last) last = m.id;
    // Ein klingelnder Anruf endet wie ein abgelehnter (kein Rückruf); die Antworten darin erledigen sich unten.
    if (m.call?.state === 'ringing') {
      m.call.state = 'declined';
      stopRinging(state, m.id);
      ctx.emit('call.declined', { messageId: m.id, contactId: m.contactId, source: m.source });
    }
    if (messages.canAnswer(state, m)) {
      m.expired = true;
      ctx.emit('message.expired', { messageId: m.id, contactId: m.contactId, source: m.source });
    }
  }
  if (last > 0) state.messages.hidden[contactId] = last;
}

export function deleteThread(ctx: Ctx, payload: { contactId: string }): CommandResult {
  if (!ctx.state.messages.contacts[payload.contactId]) return { ok: false, reason: 'Diesen Chat gibt es nicht.' };
  hideThread(ctx, payload.contactId);
  return { ok: true };
}

export function deleteAllThreads(ctx: Ctx): CommandResult {
  for (const contactId of Object.keys(ctx.state.messages.contacts)) hideThread(ctx, contactId);
  return { ok: true };
}

// Fristen laufen selten ab, geprüft wird aber jede Spielminute: Gemerkt wird die nächste Frist, solange sich die
// Liste nicht ändert (neue Nachrichten, siehe messageIndex). Nur eine Abkürzung, das Ergebnis bleibt dasselbe.
const nextExpiry = new WeakMap<MessagesState, { list: Message[]; length: number; last: number; at: number }>();

/** Das Gespräch ist zu Ende (angenommen, abgelehnt, zuletzt verpasst): ab jetzt läuft die Antwortfrist. */
function openAnswers(ctx: Ctx, message: Message): void {
  const expiresIn = message.call?.expiresIn;
  if (expiresIn !== undefined && message.options?.length) {
    message.expiresAt = ctx.now + expiresIn;
    // Die neue Frist kann vor der gemerkten nächsten liegen: Merkzettel von expireMessages verwerfen.
    nextExpiry.delete(ctx.state.messages);
  }
}

function stopRinging(state: GameState, messageId: number): void {
  const calls = state.messages.calls;
  calls.ringing = calls.ringing.filter((id) => id !== messageId);
}

export function acceptCall(ctx: Ctx, payload: { messageId: number }): CommandResult {
  const message = messages.get(ctx.state, payload.messageId);
  if (message?.call?.state !== 'ringing') return { ok: false, reason: 'Da klingelt nichts mehr.' };
  message.call.state = 'accepted';
  message.read = true;
  stopRinging(ctx.state, message.id);
  openAnswers(ctx, message);
  ctx.emit('call.accepted', { messageId: message.id, contactId: message.contactId, source: message.source });
  return { ok: true };
}

export function declineCall(ctx: Ctx, payload: { messageId: number }): CommandResult {
  const message = messages.get(ctx.state, payload.messageId);
  if (message?.call?.state !== 'ringing') return { ok: false, reason: 'Da klingelt nichts mehr.' };
  message.call.state = 'declined';
  stopRinging(ctx.state, message.id);
  openAnswers(ctx, message);
  ctx.emit('call.declined', { messageId: message.id, contactId: message.contactId, source: message.source });
  return { ok: true };
}

/**
 * Jede Spielminute: Anrufe, die zu lange klingeln, sind verpasst (Figur schreibt kurz, ruft später noch einmal an,
 * höchstens CALL_MAX_ATTEMPTS-mal), fällige Rückrufe klingeln. Läuft nur über die Listen in `calls`, nicht über alle
 * Nachrichten.
 */
export function processCalls(ctx: Ctx): void {
  const calls = ctx.state.messages.calls;
  if (!calls || (calls.ringing.length === 0 && calls.retries.length === 0)) return;
  for (const id of [...calls.ringing]) {
    const message = messages.get(ctx.state, id);
    if (message?.call?.state !== 'ringing') {
      stopRinging(ctx.state, id);
      continue;
    }
    if (message.call.ringUntil > ctx.now) continue;
    const call = message.call;
    call.state = 'missed';
    stopRinging(ctx.state, id);
    const plan = planOf(ctx.state, message);
    const contact = plan.contact;
    const send = (text: string) => {
      const reply: Message = {
        id: ctx.nextId(),
        contactId: contact.id,
        time: ctx.now,
        from: 'contact',
        text,
        read: false,
        silent: true,
        source: message.source,
      };
      ctx.state.messages.list.push(reply);
      ctx.emit('message.received', { messageId: reply.id, contactId: contact.id, source: message.source });
    };
    if (call.final) {
      openAnswers(ctx, message);
      send(call.gaveUpText ?? GAVE_UP_TEXT);
    } else {
      calls.retries.push({
        at: ctx.now + CALL_RETRY_MINUTES,
        attempt: call.attempt + 1,
        call: plan,
        source: message.source,
      });
      send(call.missedText ?? MISSED_TEXT);
    }
    const list = ctx.state.messages.list;
    if (list.length > MESSAGE_LIMIT) list.splice(0, list.length - MESSAGE_LIMIT);
    ctx.emit('call.missed', { messageId: id, contactId: contact.id, source: message.source, final: call.final });
  }
  const due = calls.retries.filter((r) => r.at <= ctx.now);
  if (due.length === 0) return;
  calls.retries = calls.retries.filter((r) => r.at > ctx.now);
  for (const retry of due) ring(ctx, retry.call, retry.attempt, retry.source);
}

/** Abgelaufene Antwortfristen markieren. Läuft jeden Schritt. */
export function expireMessages(ctx: Ctx): void {
  const s = ctx.state.messages;
  const list = s.list;
  const last = list[list.length - 1]?.id ?? 0;
  const known = nextExpiry.get(s);
  if (known && known.list === list && known.length === list.length && known.last === last && known.at > ctx.now) {
    return;
  }
  let at = Number.POSITIVE_INFINITY;
  for (const m of list) {
    if (m.expired || m.answer || m.expiresAt === undefined) continue;
    if (m.expiresAt > ctx.now) {
      at = Math.min(at, m.expiresAt);
      continue;
    }
    m.expired = true;
    ctx.emit('message.expired', { messageId: m.id, contactId: m.contactId, source: m.source });
  }
  nextExpiry.set(s, { list, length: list.length, last, at });
}
