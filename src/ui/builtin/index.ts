// Oberflächen des Kerns: Geld und Uhr im HUD, Tabs "Geschäft" und "Ereignisse", Spielstand-Dialoge,
// Nachrichten-App und Reaktionen auf Spielende und neue Nachrichten.

import { messages } from '../../core';
import { MessagesApp } from '../phone/MessagesApp';
import { onGameEvent, registerDialog, registerHudItem, registerPhoneApp, registerTab } from '../registry';
import { ClockHud, MoneyHud } from './CoreHud';
import { GameOverDialog, NewGameDialog, SavesDialog, WonDialog } from './GameDialogs';
import { JournalTab } from './JournalTab';

export function registerBuiltins(): void {
  registerHudItem({ id: 'core.money', order: 10, component: MoneyHud });
  registerHudItem({ id: 'core.clock', order: 90, component: ClockHud });

  // "Geschäft" sammelt Abschnitte der Module über den Slot 'tab:business'.
  registerTab({ id: 'business', title: 'Geschäft', order: 10 });
  registerTab({ id: 'journal', title: 'Ereignisse', order: 90, component: JournalTab });

  registerDialog({ id: 'core.newGame', component: NewGameDialog, pausesGame: true, dismissable: false });
  registerDialog({ id: 'core.saves', component: SavesDialog, pausesGame: true });
  registerDialog({ id: 'core.gameOver', component: GameOverDialog, dismissable: false });
  registerDialog({ id: 'core.won', component: WonDialog, pausesGame: true });

  registerPhoneApp({
    id: 'core.messages',
    name: 'Nachrichten',
    icon: '💬',
    order: 10,
    component: MessagesApp,
    badge: (state) => messages.unreadCount(state),
  });

  onGameEvent('game.over', 'core.gameOver', (_payload, ui) => ui.openDialog('core.gameOver', {}));
  onGameEvent('campaign.won', 'core.won', (_payload, ui) => ui.openDialog('core.won', {}));
  onGameEvent('message.received', 'core.messageToast', (payload, ui, state) => {
    const contact = messages.contact(state, payload.contactId);
    ui.toast(`Neue Nachricht von ${contact?.name ?? 'Unbekannt'}`, 'info');
  });
}
