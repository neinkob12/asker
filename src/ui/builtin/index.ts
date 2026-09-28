// Oberflächen des Kerns: Geld und Uhr im HUD, Tabs "Geschäft" und "Ereignisse", Spielstand- und
// Einstellungs-Dialoge, die Handy-Apps Nachrichten, Musik und Einstellungen, Benachrichtigungen und Sounds
// für die Ereignisse des Kerns.

import { messages } from '../../core';
import { MessagesApp } from '../phone/MessagesApp';
import { MusicApp } from '../phone/MusicApp';
import { messageNotification } from '../phone/messagesModel';
import { SettingsApp } from '../phone/SettingsApp';
import { onGameEvent, registerDialog, registerHudItem, registerPhoneApp, registerTab } from '../registry';
import { soundOnEvent } from '../sound';
import { ClockHud, MoneyHud } from './CoreHud';
import { GameOverDialog, NewGameDialog, SavesDialog, WonDialog } from './GameDialogs';
import { JournalTab } from './JournalTab';
import { SettingsDialog } from './Settings';

declare module '../registry' {
  interface DialogRegistry {
    'core.settings': Record<string, never>;
  }
}

export function registerBuiltins(): void {
  registerHudItem({ id: 'core.money', order: 10, component: MoneyHud });
  registerHudItem({ id: 'core.clock', order: 90, component: ClockHud });

  // "Geschäft" sammelt Abschnitte der Module über den Slot 'tab:business'.
  registerTab({ id: 'business', title: 'Geschäft', order: 10, icon: 'briefcase' });
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
    id: 'core.music',
    name: 'Musik',
    icon: 'music',
    order: 80,
    color: '#7a3db8',
    component: MusicApp,
  });
  registerPhoneApp({
    id: 'core.settings',
    name: 'Einstellungen',
    icon: 'sliders',
    order: 90,
    color: '#3a4656',
    component: SettingsApp,
  });

  onGameEvent('game.over', 'core.gameOver', (_payload, ui) => ui.openDialog('core.gameOver', {}));
  onGameEvent('campaign.won', 'core.won', (_payload, ui) => ui.openDialog('core.won', {}));

  // Neue Nachricht: Banner mit Vibrieren und Ton (ist der Chat gerade offen, nur ein leiser Ton).
  onGameEvent('message.received', 'core.messageNotification', (payload, ui, state) => {
    const notification = messageNotification(state, payload.messageId);
    if (notification) ui.notify({ ...notification, sound: 'message' });
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
