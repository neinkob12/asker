// Oberflächen des Kerns: Geld und Uhr im HUD, Spielstand-Dialoge, die Handy-Apps Nachrichten und Einstellungen
// (mit Ton und Musik, Wetter, Verlauf), die Verlauf-Seite, Benachrichtigungen und Sounds für die Ereignisse des Kerns.

import { clock, formatEuro, messages, wallet } from '../../core';
import { islandCountdown } from '../phone/islandModel';
import { MessagesApp } from '../phone/MessagesApp';
import { chatList, messageNotification } from '../phone/messagesModel';
import { SettingsApp } from '../phone/SettingsApp';
import {
  onGameEvent,
  registerAdvisor,
  registerDialog,
  registerGameStat,
  registerHudItem,
  registerLiveActivity,
  registerMapLayerOption,
  registerPhoneApp,
  registerSearch,
} from '../registry';
import { soundOnEvent } from '../sound';
import { MoneyHud } from './CoreHud';
import { GameOverDialog, NewGameDialog, SavesDialog, WonDialog } from './GameDialogs';
import { HistoryApp } from './HistoryApp';
import { IntroDialog } from './IntroDialog';

/** Ab diesem Betrag erscheint eine Einnahme kurz in der Dynamic Island. */
const ISLAND_EARN_MIN = 150;

export function registerBuiltins(): void {
  registerHudItem({ id: 'core.money', order: 10, placement: 'main', component: MoneyHud });
  // Menü "Ebenen" der Kartensteuerung: Überwachungs-Overlay als Schalter (pro Gerät gemerkt).
  registerMapLayerOption({
    id: 'core.overlay',
    order: 90,
    group: 'Anzeige',
    label: 'Überwachung',
    icon: 'scan',
    toggle: true,
    active: (ui) => ui.overlay,
    select: (api, ui) => api.setOverlay(!ui.overlay),
  });

  registerDialog({ id: 'core.intro', component: IntroDialog, pausesGame: true, dismissable: false });
  registerDialog({ id: 'core.newGame', component: NewGameDialog, pausesGame: true, dismissable: false });
  registerDialog({ id: 'core.saves', component: SavesDialog, pausesGame: true });
  registerDialog({ id: 'core.gameOver', component: GameOverDialog, dismissable: false });
  registerDialog({ id: 'core.won', component: WonDialog, pausesGame: true });

  registerPhoneApp({
    id: 'core.messages',
    name: 'Nachrichten',
    icon: 'message',
    order: 10,
    color: 'chat',
    component: MessagesApp,
    badge: (state) => messages.unreadCount(state),
    chrome: 'none',
  });
  // Verlauf (Journal, Meldungen, Aufträge): Abschnitt in den Einstellungen, als ganze Seite nur per openPhone.
  registerPhoneApp({
    id: 'core.history',
    name: 'Verlauf',
    icon: 'journal',
    order: 80,
    color: 'log',
    component: HistoryApp,
    chrome: 'none',
    hidden: true,
  });
  registerPhoneApp({
    id: 'core.settings',
    name: 'Einstellungen',
    icon: 'gear',
    order: 90,
    color: 'system',
    component: SettingsApp,
    badge: (_state, ui) => ui.alerts.filter((a) => !a.read).length,
  });
  registerSearch({
    id: 'core.settings',
    label: 'Einstellungen',
    order: 90,
    items: () => [
      {
        id: 'history',
        title: 'Verlauf',
        subtitle: 'Ereignisse, Meldungen und Aufträge, dazu Spielstand exportieren',
        icon: 'journal',
        keywords: 'ereignisse meldungen journal historie log export',
        run: (ui) => ui.openPhone('core.history'),
      },
      {
        id: 'weather',
        title: 'Wetter',
        subtitle: 'Vorhersage in den Einstellungen',
        icon: 'cloudSun',
        keywords: 'regen sonne vorhersage',
        run: (ui) => ui.openPhone('core.settings'),
      },
    ],
  });

  // Wartet ein Chat auf Antwort, ist das die dringendste Empfehlung.
  registerAdvisor({
    id: 'core.answer',
    advise: (state) => {
      const open = chatList(state).filter((c) => c.awaitingAnswer);
      if (open.length === 0) return null;
      const first = open[0];
      // Dringend (Zeile auf dem Startbildschirm) nur mit Frist, sonst ein normaler Rat für die Suche.
      const urgent = open.some((c) => c.deadline !== undefined);
      return {
        id: 'core.answer',
        priority: urgent ? 90 : 60,
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

  // Neue Nachricht: Banner mit Vibrieren und Ton nur, wenn eine Antwort mit Frist erwartet wird (Auftrag 26); alles
  // andere still (Badge an der App, Mitteilungszentrale). Ist der Chat gerade offen, nur ein leiser Ton.
  onGameEvent('message.received', 'core.messageNotification', (payload, ui, state) => {
    const notification = messageNotification(state, payload.messageId);
    if (!notification) return;
    const message = messages.get(state, payload.messageId);
    const urgent = !!message && messages.canAnswer(state, message) && message.expiresAt !== undefined;
    ui.notify({ ...notification, sound: 'message', urgent });
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
