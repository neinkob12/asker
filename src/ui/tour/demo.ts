// Demo-Tour (Auftrag 46a): ?tour=demo zeigt den Baukasten über HUD, Handy (öffnet die Personal-App) und Karte.
// Nur zum Ausprobieren und für die Screenshots; die echten Touren je Stufe kommen mit Auftrag 46c.

import type { Contact } from '../../core';
import type { UiApi } from '../runtime';
import { isMobileLayout } from '../shell/layout';
import type { TourDef } from './types';

/**
 * Sprecher der Demo: sieht aus wie Peter (quests/config.ts), damit die Box so wirkt wie später im Spiel. Die
 * Oberfläche importiert keine Module, deshalb hier eine eigene Kopie des Aussehens.
 */
export const DEMO_SPEAKER: Contact = {
  id: 'tour:peter',
  name: 'Peter',
  kind: 'other',
  role: 'Dein alter Kontakt',
  look: {
    feminine: false,
    age: 41,
    skin: 2,
    hair: 'short',
    hairColor: 1,
    beard: 'stubble',
    glasses: 'none',
    hat: 'cap',
    top: 'tracksuit',
    topColor: 1,
    face: 'square',
    brows: 'hard',
    eyes: 'rings',
    mouth: 'smirk',
    teeth: 'gold',
    mouthItem: 'toothpick',
    chain: 'thick',
  },
  voice: { pitch: 0.92, rate: 1.06 },
};

export function demoTour(ui: UiApi): TourDef {
  const speaker = DEMO_SPEAKER;
  return {
    id: 'demo',
    skippable: true,
    steps: [
      {
        id: 'money',
        anchor: 'hud.money',
        speaker,
        text: 'Das ist dein Schwarzgeld. Damit zahlst du alles, was nicht aufs Konto darf.',
      },
      {
        id: 'heat',
        anchor: 'hud.heat',
        speaker,
        tint: 'danger',
        text: 'Die Heat zeigt, wie genau die Polizei hinschaut. Steigt sie, kommen Kontrollen.',
      },
      {
        id: 'clock',
        anchor: 'hud.clock',
        speaker,
        text: 'Die Uhr. Solange ich rede, steht sie.',
      },
      {
        id: 'speed',
        anchor: 'hud.speed',
        speaker,
        text: 'Hier stellst du das Tempo ein. Pause, wenn du nachdenken willst.',
      },
      {
        id: 'phone',
        anchor: 'phone',
        speaker,
        before: () => {
          ui.showPhone();
          ui.openPhone(null);
        },
        text: 'Dein Handy. Alles, was du tust, läuft hier drüber.',
      },
      {
        // Im neuen Spiel stehen erst Nachrichten und Einstellungen auf dem Handy (Handy Schritt für Schritt).
        id: 'messages-app',
        anchor: 'phone.app.core.messages',
        speaker,
        tint: 'chat',
        text: 'Nachrichten. Hier melden sich Peter, deine Lieferanten und die Gangs.',
      },
      {
        id: 'staff-screen',
        anchor: 'phone.screen',
        speaker,
        tint: 'people',
        before: () => ui.openPhone('tab:staff'),
        text: 'Die App Personal: Hier stehen deine Leute. Noch ist niemand da.',
      },
      {
        id: 'map',
        anchor: 'map',
        speaker,
        tint: 'place',
        before: () => {
          ui.openPhone(null);
          // Am Handy-Bildschirm deckt das Handy die Karte zu.
          if (isMobileLayout()) ui.closePhone();
        },
        text: 'Und das ist Köln. Deine Spots stehen auf der Karte.',
      },
    ],
  };
}
