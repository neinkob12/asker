// Oberflächen des Kerns: Geld und Uhr im HUD, Spielstand-Dialoge, die Handy-Apps Nachrichten und Einstellungen
// (mit Ton und Musik, Wetter, Verlauf), die Verlauf-Seite und Sounds für die Ereignisse des Kerns.

import { audio } from '../../audio';
import { clock, formatEuro, messages, wallet } from '../../core';
import { registerContactProfile } from '../phone/ContactProfile';
import { MessagesApp } from '../phone/MessagesApp';
import { chatList } from '../phone/messagesModel';
import { SettingsApp } from '../phone/SettingsApp';
import {
  onGameEvent,
  registerAdvisor,
  registerDialog,
  registerGameStat,
  registerHudItem,
  registerMapLayerOption,
  registerPhoneApp,
  registerSearch,
} from '../registry';
import { soundOnEvent } from '../sound';
import { MoneyHud } from './CoreHud';
import { GameOverDialog, NewGameDialog, SavesDialog, WonDialog } from './GameDialogs';
import { HistoryApp } from './HistoryApp';
import { IntroDialog } from './IntroDialog';

/** Eine Frist unter dieser Zahl Spielminuten macht die Antwort dringend (Zeile auf dem Startbildschirm). */
const URGENT_REPLY_MINUTES = 120;

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

  // Beim ersten Start gibt es kein Zurück; aus den Einstellungen (Intro) bzw. den Spielständen schließt Esc (N7).
  registerDialog({ id: 'core.intro', component: IntroDialog, pausesGame: true, dismissable: (p) => !!p.replay });
  registerDialog({
    id: 'core.newGame',
    component: NewGameDialog,
    pausesGame: true,
    dismissable: (p) => !p.firstStart,
  });
  registerDialog({ id: 'core.saves', component: SavesDialog, pausesGame: true });
  registerDialog({ id: 'core.gameOver', component: GameOverDialog, dismissable: false });
  registerDialog({ id: 'core.won', component: WonDialog, pausesGame: true });

  registerContactProfile();
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
      // Der Chat mit der frühesten Frist zuerst, dann die ohne Frist.
      const open = chatList(state)
        .filter((c) => c.awaitingAnswer)
        .sort((a, b) => (a.deadline ?? Number.POSITIVE_INFINITY) - (b.deadline ?? Number.POSITIVE_INFINITY));
      if (open.length === 0) return null;
      const first = open[0];
      // Dringend (Zeile auf dem Startbildschirm) nur, wenn eine Frist bald abläuft; ein Bewerber mit zwei Tagen Zeit
      // verdrängt sonst "Ware am Kai gefährdet" oder "Löhne nicht gedeckt".
      const urgent = open.some((c) => c.deadlineIn !== undefined && c.deadlineIn <= URGENT_REPLY_MINUTES);
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

  // Anrufe (Auftrag 30): Klingelt es, klappt das Handy auf (das Klingeln selbst zeigt CallScreen im Handy).
  onGameEvent('call.ringing', 'core.callRinging', (_payload, ui) => ui.showPhone());
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
  onGameEvent('campaign.won', 'core.won', (payload, ui) => {
    const props: { cityName?: string; next?: string } = {};
    if (payload.cityName) props.cityName = payload.cityName;
    if (payload.next) props.next = payload.next;
    ui.openDialog('core.won', props);
  });

  // Neue Nachricht (Auftrag 46d: kein Banner mehr, nur das Badge an der App): Ein kurzer Ton, wenn eine Antwort mit
  // Frist erwartet wird, damit die Frage nicht ungehört verstreicht. Anrufe klingeln selbst (CallScreen).
  onGameEvent('message.received', 'core.messageSound', (payload, _ui, state) => {
    const message = messages.get(state, payload.messageId);
    if (!message || message.call || message.silent) return;
    if (messages.canAnswer(state, message) && message.expiresAt !== undefined) audio.play('message');
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
