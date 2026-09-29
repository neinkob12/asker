// Oberflächen des Kerns: Geld und Uhr im HUD, Tabs "Geschäft" und "Ereignisse", Spielstand- und
// Einstellungs-Dialoge, die Handy-Apps Nachrichten, Musik und Einstellungen, Benachrichtigungen und Sounds
// für die Ereignisse des Kerns.

import { clock, formatEuro, messages, wallet } from '../../core';
import { islandCountdown } from '../phone/DynamicIsland';
import { MessagesApp } from '../phone/MessagesApp';
import { MusicApp } from '../phone/MusicApp';
import { chatList, messageNotification } from '../phone/messagesModel';
import { SettingsApp } from '../phone/SettingsApp';
import {
  onGameEvent,
  registerAdvisor,
  registerDialog,
  registerGameStat,
  registerHudItem,
  registerLiveActivity,
  registerPhoneApp,
  registerTab,
} from '../registry';
import { AlertsApp } from '../shell/AlertCenter';
import { soundOnEvent } from '../sound';
import { MoneyHud } from './CoreHud';
import { GameOverDialog, NewGameDialog, SavesDialog, WonDialog } from './GameDialogs';
import { JournalTab } from './JournalTab';
import { SettingsDialog } from './Settings';

/** Ab diesem Betrag erscheint eine Einnahme kurz in der Dynamic Island. */
const ISLAND_EARN_MIN = 150;

declare module '../registry' {
  interface DialogRegistry {
    'core.settings': Record<string, never>;
  }
}

export function registerBuiltins(): void {
  registerHudItem({ id: 'core.money', order: 10, placement: 'main', component: MoneyHud });

  // "Geschäft" sammelt Abschnitte der Module über den Slot 'tab:business'.
  registerTab({ id: 'business', title: 'Geschäft', order: 10, icon: 'briefcase', layout: 'rows' });
  registerTab({ id: 'journal', title: 'Ereignisse', order: 90, component: JournalTab, icon: 'list' });

  registerDialog({ id: 'core.newGame', component: NewGameDialog, pausesGame: true, dismissable: false });
  registerDialog({ id: 'core.saves', component: SavesDialog, pausesGame: true });
  registerDialog({ id: 'core.settings', component: SettingsDialog });
  registerDialog({ id: 'core.gameOver', component: GameOverDialog, dismissable: false });
  registerDialog({ id: 'core.won', component: WonDialog, pausesGame: true });

  registerPhoneApp({
    id: 'core.messages',
    name: 'Nachrichten',
    icon: 'message',
    order: 10,
    color: 'var(--color-accent-strong)',
    component: MessagesApp,
    badge: (state) => messages.unreadCount(state),
    chrome: 'none',
  });
  registerPhoneApp({
    id: 'core.alerts',
    name: 'Meldungen',
    icon: 'bell',
    order: 50,
    color: 'var(--color-warn)',
    component: AlertsApp,
    chrome: 'none',
  });
  registerPhoneApp({
    id: 'core.music',
    name: 'Musik',
    icon: 'music',
    order: 80,
    color: 'var(--color-dirty)',
    component: MusicApp,
  });
  registerPhoneApp({
    id: 'core.settings',
    name: 'Einstellungen',
    icon: 'sliders',
    order: 90,
    color: 'var(--color-muted)',
    component: SettingsApp,
  });

  // Wartet ein Chat auf Antwort, ist das die dringendste Empfehlung.
  registerAdvisor({
    id: 'core.answer',
    advise: (state) => {
      const open = chatList(state).filter((c) => c.awaitingAnswer);
      if (open.length === 0) return null;
      const first = open[0];
      return {
        id: 'core.answer',
        priority: 90,
        icon: 'message',
        title: open.length === 1 ? `${first.name} wartet auf Antwort` : `${open.length} Chats warten auf Antwort`,
        text: 'Manche Antworten haben eine Frist.',
        actionLabel: 'Antworten',
        action: (ui) => ui.openPhone('core.messages', open.length === 1 ? { contactId: first.contactId } : undefined),
      };
    },
  });

  // Dynamic Island: Chats, deren Antwort eine Frist hat.
  registerLiveActivity({
    id: 'core.deadlines',
    activities: (state) =>
      chatList(state)
        .filter((c) => c.awaitingAnswer && c.deadline !== undefined && c.deadline > state.time)
        .map((c) => ({
          id: `core.deadline.${c.contactId}`,
          priority: 75,
          icon: 'message',
          tone: 'warn',
          leading: 'Antwort',
          trailing: islandCountdown((c.deadline ?? state.time) - state.time),
          title: `${c.name} wartet auf Antwort`,
          detail: `Frist bis ${clock.formatTime(c.deadline ?? state.time)}`,
          open: (ui) => ui.openPhone('core.messages', { contactId: c.contactId }),
        })),
  });

  registerGameStat({
    id: 'core.days',
    order: 10,
    icon: 'calendar',
    label: 'Überlebte Tage',
    value: (state) => String(clock.day(state.time)),
  });
  registerGameStat({
    id: 'core.money',
    order: 15,
    icon: 'moneyBag',
    label: 'Schwarzgeld am Ende',
    value: (state) => formatEuro(Math.round(wallet.balance(state, 'dirty'))),
  });

  onGameEvent('game.over', 'core.gameOver', (_payload, ui) => ui.openDialog('core.gameOver', {}));
  onGameEvent('campaign.won', 'core.won', (_payload, ui) => ui.openDialog('core.won', {}));

  // Neue Nachricht: Banner mit Vibrieren und Ton (ist der Chat gerade offen, nur ein leiser Ton).
  onGameEvent('message.received', 'core.messageNotification', (payload, ui, state) => {
    const notification = messageNotification(state, payload.messageId);
    if (notification) ui.notify({ ...notification, sound: 'message' });
  });

  // Große Einnahmen (Deals, Großhandel, Geldwäsche) kurz in der Dynamic Island. Straßenverkäufe zählen in den
  // Umsatz des Tages (Kundschaft), sonst stünde die Island abends dauernd auf "+… €".
  onGameEvent('wallet.changed', 'core.islandEarn', (payload, ui) => {
    if (payload.amount >= ISLAND_EARN_MIN) {
      ui.pulseIsland({
        kind: `earn.${payload.kind}`,
        amount: payload.amount,
        icon: payload.kind === 'clean' ? 'euro' : 'moneyBag',
        tone: 'accent',
        text: '',
      });
    }
  });

  soundOnEvent('game.over', 'gameOver');
  soundOnEvent('campaign.won', 'win');
  soundOnEvent('wallet.changed', 'cash', {
    when: (p) => p.kind === 'dirty' && p.amount > 0,
    throttleMs: 1200,
    volume: 0.7,
  });
  soundOnEvent('message.answered', 'tap');
}
