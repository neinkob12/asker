// Text-Helfer (Auftrag 23): wählt aus einer Liste von Varianten, ohne die zuletzt benutzten pro Schlüssel sofort zu
// wiederholen, und ersetzt Platzhalter wie {boss}, {veedel}. Das Gedächtnis liegt im Spielstand (state.texts), der
// Zufall kommt aus ctx.random(), beides bleibt also deterministisch und überlebt Speichern und Laden.
//
//   texts.pick(ctx, `gang:${gang.id}:warning`, GANG_VOICES.nord.warning, { boss, veedel })
//
// Schlüssel: '<art>:<wer>:<anlass>', z.B. 'gang:nord:warning', 'supplier:frankfurt:delay:road', 'staff:wage'.

import type { Ctx } from './types';

export interface TextsState {
  /** Zuletzt benutzte Varianten pro Schlüssel (Index in der Liste, neueste zuletzt). */
  recent: Record<string, number[]>;
}

/** Variablen für Platzhalter. Fehlt eine, bleibt der Platzhalter stehen (Tests finden ihn). */
export type TextVars = Readonly<Record<string, string | number>>;

export function createTextsState(): TextsState {
  return { recent: {} };
}

/** Platzhalter {name} ersetzen. */
export function fillText(template: string, vars: TextVars = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

/** Wie viele der zuletzt benutzten Varianten gesperrt sind: etwa die Hälfte der Liste, höchstens drei. */
export function textMemorySize(count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, 3, Math.max(1, Math.floor(count / 2)));
}

/** Index einer Variante wählen (ohne die zuletzt benutzten) und merken. */
function pickIndex(ctx: Ctx, key: string, count: number): number {
  if (count <= 1) return 0;
  const memory = textMemorySize(count);
  const store = textsOf(ctx);
  const recent = (store.recent[key] ?? []).filter((i) => i >= 0 && i < count).slice(-memory);
  const free: number[] = [];
  for (let i = 0; i < count; i++) if (!recent.includes(i)) free.push(i);
  const index = free[Math.floor(ctx.random() * free.length)] ?? 0;
  store.recent[key] = [...recent, index].slice(-memory);
  return index;
}

function textsOf(ctx: Ctx): TextsState {
  // Ältere Zustände aus Tests ohne Kernfeld: lazily anlegen (Spielstände bekommen es per Migration).
  const state = ctx.state as { texts?: TextsState };
  state.texts ??= createTextsState();
  return state.texts;
}

export const texts = {
  /**
   * Eine Variante wählen, die unter diesem Schlüssel nicht gerade erst kam, und die Platzhalter füllen.
   * Leere Liste: leerer Text.
   */
  pick(ctx: Ctx, key: string, variants: readonly string[], vars: TextVars = {}): string {
    if (variants.length === 0) return '';
    return fillText(variants[pickIndex(ctx, key, variants.length)], vars);
  },
  /** Wie pick, aber für beliebige Einträge (z.B. Gründe mit Text und Wirkung). */
  pickItem<T>(ctx: Ctx, key: string, items: readonly T[]): T {
    return items[pickIndex(ctx, key, items.length)];
  },
  fill: fillText,
};
