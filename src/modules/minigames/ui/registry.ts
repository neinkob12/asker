// Ansichten der Minispiele: Jede Art meldet ihr Spiel hier an (games/<art>/index.tsx, automatisch geladen):
//
//   registerMinigameView('safe', { component: SafeGame, controls: { keys: '…', touch: '…' }, layout: 'stage' })
//
// layout 'stage': eigene Bühne über der abgedunkelten Karte; 'map': die Karte bleibt sichtbar (Verfolgungsjagd).
// Arten ohne Ansicht zeigen einen schlichten Platzhalter (der nie im Spiel erscheint, weil sie nicht scharf sind).

import type { ComponentType } from 'preact';
import type { Challenge, MinigameKind } from '../index';
import { Placeholder } from './games/placeholder';

/** Vertrag für jedes Spiel. */
export interface MinigameViewProps {
  /** seed, difficulty, params (je Art). */
  challenge: Challenge;
  /** Vorschau ohne Spielstand (?minispiel=<art>): nichts wird geschickt. */
  preview: boolean;
  /**
   * Läuft das Spiel? false während Einleitung, 3-2-1 und Ergebnis (das Spiel steht dann als Bild dahinter): keine
   * Bildschleife, keine Tasten, keine Zeit.
   */
  running: boolean;
  /** Einmal aufrufen (Score 0 bis 1, picks je Art), dann zeigt der Rahmen das Ergebnis. */
  onFinish(score: number, picks?: string[]): void;
}

export interface MinigameControls {
  /** Steuerung mit der Tastatur, ein kurzer Satz, z.B. „←/→ drehen (Umschalt: fein), Leertaste einrasten“. */
  keys: string;
  /** Steuerung mit dem Finger, ein kurzer Satz. */
  touch: string;
  /** Mehr Erklärung (steht hinter „Mehr dazu“). */
  help?: string;
}

export interface MinigameView {
  component: ComponentType<MinigameViewProps>;
  controls: MinigameControls;
  layout: 'map' | 'stage';
  /** Symbol (Name aus Icon) für Einleitung und Hinweis im HUD. */
  icon?: string;
  /** Erfundene params für die Vorschau (?minispiel=<art>), aus einem Seed. */
  previewParams?: (seed: number) => Record<string, unknown>;
  /** Situation in der Vorschau. */
  previewSituation?: string;
  /** Ein Satz unter dem Stempel: was das Ergebnis bedeutet. */
  resultText?: (result: { won: boolean; score: number; picks: readonly string[] }, challenge: Challenge) => string;
}

const views = new Map<MinigameKind, MinigameView>();

/** Ansicht einer Art anmelden (ersetzt eine frühere, z.B. beim Neuladen im Entwicklungsserver). */
export function registerMinigameView(kind: MinigameKind, view: MinigameView): void {
  views.set(kind, view);
}

/** Ansicht einer Art; ohne angemeldete Ansicht der Platzhalter. */
export function minigameView(kind: MinigameKind): MinigameView {
  return (
    views.get(kind) ?? {
      component: Placeholder,
      controls: { keys: 'Noch keine Steuerung.', touch: 'Noch keine Steuerung.' },
      layout: 'stage',
      icon: 'hourglass',
    }
  );
}

/** Hat die Art eine fertige Ansicht? */
export function hasMinigameView(kind: MinigameKind): boolean {
  return views.has(kind);
}
