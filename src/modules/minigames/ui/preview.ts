// Vorschau für Entwicklung und Screenshots: ?minispiel=<art> (optional &schwer=0.7, &seed=…) öffnet den Rahmen mit
// einer erfundenen Challenge, die nicht im Spielstand liegt. Das Ergebnis wird nur angezeigt, nichts geschickt.

import { clock } from '../../../core';
import { type Challenge, MINIGAME_KIND_IDS, MINIGAME_KINDS, type MinigameKind } from '../index';
import { minigameView } from './registry';

/** ID der Vorschau (echte Challenges zählen ab 1). */
export const PREVIEW_ID = -1;

export function isMinigameKind(value: string | null): value is MinigameKind {
  return value !== null && (MINIGAME_KIND_IDS as string[]).includes(value);
}

/**
 * Erfundene Challenge einer Art für die Vorschau. Mit `hour` (0 bis 23, z.B. aus --uhr der Screenshots) gelten
 * Tageszeit und Stunde von dort statt aus dem Seed (params.phase, params.hour).
 */
export function previewChallenge(kind: MinigameKind, difficulty = 0.5, seed = 1, hour?: number): Challenge {
  const view = minigameView(kind);
  const base = view.previewParams?.(seed) ?? {};
  const params =
    hour === undefined || !Number.isFinite(hour)
      ? base
      : { ...base, phase: clock.dayPhase(Math.floor(hour) * 60), hour: Math.floor(hour) };
  return {
    id: PREVIEW_ID,
    kind,
    origin: { module: 'preview', ref: kind },
    cityId: 'koeln',
    veedelId: 'ehrenfeld',
    seed,
    difficulty: Math.min(1, Math.max(0, difficulty)),
    title: MINIGAME_KINDS[kind].name,
    situation: view.previewSituation ?? 'Vorschau: erfundene Lage, nichts davon zählt.',
    params,
    startedAt: 0,
    deadline: 0,
  };
}

/** Vorschau aus der Adresse lesen (null ohne ?minispiel= oder mit unbekannter Art). */
export function previewFromUrl(search: string): Challenge | null {
  const params = new URLSearchParams(search);
  const kind = params.get('minispiel');
  if (!isMinigameKind(kind)) return null;
  const difficulty = Number(params.get('schwer') ?? 0.5);
  const seed = Number(params.get('seed') ?? 1);
  return previewChallenge(kind, Number.isFinite(difficulty) ? difficulty : 0.5, Number.isFinite(seed) ? seed : 1);
}
