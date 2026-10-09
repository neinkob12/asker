// Schnittstelle der Tour (Auftrag 46a). Verbindlich für die Inhalte (46c) und das Modul tutorial (46b).

import type { Contact, GameEvents, GameState } from '../../core';
import type { ChipColor } from '../components';
import type { UiState } from '../runtime';
import type { TourAnchor } from './anchors';

/**
 * Wie es nach einem Schritt weitergeht: Weiter-Knopf, ein Ereignis, eine Bedingung am Spielzustand oder eine an der
 * Oberfläche (`ui`: z.B. der Spieler hat im Handy eine bestimmte Seite geöffnet; geprüft nach jeder Änderung).
 */
export type TourWait =
  | 'next'
  | { event: keyof GameEvents }
  | { state: (state: GameState) => boolean }
  | { ui: (ui: UiState) => boolean };

export type TourPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export interface TourStep {
  id: string;
  /** Anker aus TOUR_ANCHORS; ohne Anker steht die Box mittig. */
  anchor?: TourAnchor;
  /**
   * Trägt derselbe Anker an mehreren Elementen (die Kundenanzeige an jedem Spot), wählt der Schlüssel das Element
   * (`data-tour-key`, z.B. die Spot-ID). Ohne Schlüssel nimmt die Tour das erste sichtbare.
   */
  anchorKey?: string;
  /** Ein, zwei Sätze. Mehr nicht. */
  text: string;
  title?: string;
  /** Wer spricht: Kontakt mit look und voice (Peter). Ohne Sprecher eine neutrale Box. */
  speaker?: Contact;
  /** Vor dem Schritt ausführen, z.B. ui.openPhone('tab:staff') oder die Karte auf einen Spot fahren. */
  before?: () => void | Promise<void>;
  /**
   * 'next' (Standard): Weiter-Knopf. Sonst muss der Spieler selbst etwas tun: Die Box zeigt keinen Weiter-Knopf,
   * der Anker bleibt bedienbar, alles andere ist gesperrt; weiter geht es, sobald das Ereignis kommt oder die
   * Bedingung am Spielzustand bzw. an der Oberfläche gilt.
   */
  waitFor?: TourWait;
  /** Lage der Box zum Anker, Standard automatisch (wo Platz ist). */
  placement?: TourPlacement;
  /** Farbe der Umrandung, Standard 'brand'. */
  tint?: ChipColor;
}

export interface TourDef {
  id: string;
  steps: readonly TourStep[];
  /** Uhr anhalten (Standard true); Tempo wird am Ende wiederhergestellt. */
  pause?: boolean;
  /** Darf übersprungen werden (kleiner Knopf, Standard false). */
  skippable?: boolean;
}

/**
 * Wie eine Tour endet: 'done' (alle Schritte), 'skipped' (Überspringen bzw. `skip()`), 'reset' (neues oder geladenes
 * Spiel: Die Tour gehörte zum alten, nichts davon gilt für das neue).
 */
export type TourOutcome = 'done' | 'skipped' | 'reset';

/** `ui.tour.*`: Touren starten und beenden. Die Tour ist reine Oberfläche, nichts davon steht im Spielstand. */
export interface TourApi {
  /** Tour starten. Läuft schon eine, wird die neue eingereiht und startet, sobald die laufende zu Ende ist. */
  start(def: TourDef): Promise<TourOutcome>;
  /** ID der laufenden Tour, sonst null. */
  active(): string | null;
  /** Beendet die laufende Tour (Ergebnis 'skipped'); eine eingereihte startet danach. */
  skip(): void;
}
