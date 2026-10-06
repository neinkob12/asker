// Gedächtnis der Gangs (Auftrag 34): Jede Gang merkt sich, was du ihr angetan oder für sie getan hast, als Liste von
// Erinnerungen mit Wirkung und Verfall (MEMORIES in config.ts). Die Summe (memoryScore) macht Waffenstillstand und
// Bündnis teurer oder billiger, die stärkste Erinnerung taucht in ihren Nachrichten auf, die Gangs-App zeigt sie als
// Chips. Das Gedächtnis hängt an der Gang, nicht an der Stadt, und überlebt Stadtwechsel (für die Hafen-Phase).

import { type Ctx, type GameState, texts } from '../../core';
import {
  MEMORIES,
  MEMORY_LIMIT,
  MEMORY_MENTION_AT,
  MEMORY_PRICE_DIVISOR,
  MEMORY_PRICE_RANGE,
  type MemoryKind,
} from './config';
import { formalVoice } from './texts';

export interface GangMemory {
  kind: MemoryKind;
  /** Wirkung beim Entstehen (aufsummiert, wenn es öfter passiert). */
  effect: number;
  at: number;
  /** Verblasst bis hier (Spielminute), null = nie. */
  until: number | null;
}

/** Was eine Gang sagt, wenn sie sich auf eine Erinnerung bezieht (Platzhalter {gang}). */
export const MEMORY_TEXTS: Record<MemoryKind, readonly string[]> = {
  snitched: [
    'Und dass du uns bei den Bullen verpfiffen hast, haben wir nicht vergessen.',
    'Wir wissen, wer gesungen hat.',
    'Verpfiffen hast du uns. Das merkt man sich.',
  ],
  agreementBroken: [
    'Dein Wort ist nichts wert, das hast du bewiesen.',
    'Mit dir Abmachungen? Hatten wir schon.',
    'Du hast uns einmal reingelegt. Ein zweites Mal gibt es nicht.',
  ],
  spotRaided: [
    'Unser Spot, deine Leute. Das vergessen wir nicht.',
    'Du hast uns überfallen. Die Rechnung kommt noch.',
    'Wer bei uns einsteigt, kriegt das zurück.',
  ],
  raidRepelled: [
    'Letztes Mal hattest du Glück.',
    'Dass du uns letztens abgewehrt hast, macht dich nicht unverwundbar.',
    'Einmal hast du uns abgewehrt. Einmal.',
  ],
  takeover: [
    'Das Veedel, das du uns abgenommen hast, holen wir uns wieder.',
    'Du sitzt auf unserem Pflaster. Noch.',
    'Wir haben nicht vergessen, wem das Veedel mal gehört hat.',
  ],
  threatened: [
    'Du hast uns gedroht. Schlechte Idee.',
    'Drohungen von dir merken wir uns.',
    'Wer uns droht, steht auf einer Liste.',
  ],
  chasedOff: [
    'Dass deine Leute uns verjagt haben, war nicht klug.',
    'Verjagt hast du uns. Wir kommen wieder.',
    'Deine Türsteher haben uns weggeschickt. Merken wir uns.',
  ],
  hunted: ['Du hast Leute auf uns gehetzt.', 'Deine Jagd auf uns hat keiner vergessen.', 'Wer uns jagt, wird gejagt.'],
  blackmailRefused: [
    'Du zahlst nicht? Wissen wir inzwischen.',
    'Stur bist du. Das haben wir gelernt.',
    'Letztes Mal hast du nicht gezahlt. Mal sehen.',
  ],
  warAgainst: [
    'Im Krieg hast du dich gegen uns gestellt.',
    'Du hast unseren Feinden geholfen. Wir wissen das.',
    'Auf welcher Seite du standest, wissen wir.',
  ],
  tributePaid: [
    'Du hast immer pünktlich gezahlt. Das rechnen wir dir an.',
    'Zuverlässig warst du bisher.',
    'Du zahlst, wir halten uns zurück. So soll es bleiben.',
  ],
  ceasefire: [
    'Der Waffenstillstand mit dir hat gehalten.',
    'Mit dir kann man reden, das hat man gesehen.',
    'Unser letzter Frieden war gut für beide.',
  ],
  deal: [
    'Unsere letzten Deals liefen sauber.',
    'Mit dir macht man Geschäfte, das wissen wir.',
    'Du hast fair gekauft. Das zählt.',
  ],
  blackmailPaid: [
    'Letztes Mal hast du gezahlt. Kluger Mensch.',
    'Du weißt, wann man zahlt.',
    'Du hast verstanden, wie das läuft.',
  ],
  favor: [
    'Du hast uns einen Gefallen getan. Das vergessen wir nicht.',
    'Wir stehen noch in deiner Schuld.',
    'Dein Gefallen neulich hat geholfen.',
  ],
  warned: [
    'Du hast auf unsere Warnung gehört.',
    'Unser Tipp neulich hat dir geholfen, oder?',
    'Du hörst zu, wenn wir was sagen. Gut.',
  ],
  warHelp: [
    'Im Krieg warst du an unserer Seite.',
    'Wer uns im Krieg hilft, ist Freund.',
    'Deine Hilfe gegen unsere Feinde bleibt unvergessen.',
  ],
};

/**
 * Dieselben Zeilen für Gangs, die siezen (Auftrag 43, K3: „Sie werden es nicht kommen sehen. Im Krieg hast du dich …“).
 * Welche Gang siezt, ergibt sich aus ihren eigenen Texten (formalVoice in texts.ts).
 */
export const MEMORY_TEXTS_FORMAL: Record<MemoryKind, readonly string[]> = {
  snitched: [
    'Und dass Sie uns bei der Polizei angezeigt haben, ist nicht vergessen.',
    'Wir wissen, wer geredet hat.',
    'Sie haben uns verraten. Das merkt man sich.',
  ],
  agreementBroken: [
    'Ihr Wort ist nichts wert, das haben Sie bewiesen.',
    'Abmachungen mit Ihnen? Hatten wir schon.',
    'Sie haben uns einmal hintergangen. Ein zweites Mal gibt es nicht.',
  ],
  spotRaided: [
    'Unser Platz, Ihre Leute. Das vergessen wir nicht.',
    'Sie haben uns überfallen lassen. Die Rechnung kommt noch.',
    'Wer bei uns einsteigt, bekommt das zurück.',
  ],
  raidRepelled: [
    'Beim letzten Mal hatten Sie Glück.',
    'Dass Sie uns neulich abgewehrt haben, macht Sie nicht unverwundbar.',
    'Einmal haben Sie uns abgewehrt. Einmal.',
  ],
  takeover: [
    'Das Viertel, das Sie uns abgenommen haben, holen wir uns zurück.',
    'Sie sitzen auf unserem Grund. Noch.',
    'Wir haben nicht vergessen, wem das Viertel einmal gehört hat.',
  ],
  threatened: [
    'Sie haben uns gedroht. Keine gute Idee.',
    'Ihre Drohungen merken wir uns.',
    'Wer uns droht, steht auf einer Liste.',
  ],
  chasedOff: [
    'Dass Ihre Leute uns verjagt haben, war nicht klug.',
    'Sie haben uns vertrieben. Wir kommen wieder.',
    'Ihre Türsteher haben uns abgewiesen. Das merken wir uns.',
  ],
  hunted: [
    'Sie haben Leute auf uns angesetzt.',
    'Ihre Jagd auf uns hat niemand vergessen.',
    'Wer uns jagt, wird gejagt.',
  ],
  blackmailRefused: [
    'Sie zahlen nicht? Das wissen wir inzwischen.',
    'Stur sind Sie. Das haben wir gelernt.',
    'Beim letzten Mal haben Sie nicht gezahlt. Wir werden sehen.',
  ],
  warAgainst: [
    'Im Krieg haben Sie sich gegen uns gestellt.',
    'Sie haben unseren Feinden geholfen. Das wissen wir.',
    'Auf welcher Seite Sie standen, wissen wir.',
  ],
  tributePaid: [
    'Sie haben immer pünktlich gezahlt. Das rechnen wir Ihnen an.',
    'Zuverlässig waren Sie bisher.',
    'Sie zahlen, wir halten uns zurück. So soll es bleiben.',
  ],
  ceasefire: [
    'Der Waffenstillstand mit Ihnen hat gehalten.',
    'Mit Ihnen kann man reden, das hat man gesehen.',
    'Unser letzter Frieden war gut für beide Seiten.',
  ],
  deal: [
    'Unsere letzten Geschäfte liefen sauber.',
    'Mit Ihnen macht man Geschäfte, das wissen wir.',
    'Sie haben fair gekauft. Das zählt.',
  ],
  blackmailPaid: [
    'Beim letzten Mal haben Sie gezahlt. Klug.',
    'Sie wissen, wann man zahlt.',
    'Sie haben verstanden, wie das läuft.',
  ],
  favor: [
    'Sie haben uns einen Gefallen getan. Das vergessen wir nicht.',
    'Wir stehen noch in Ihrer Schuld.',
    'Ihr Gefallen neulich hat geholfen.',
  ],
  warned: [
    'Sie haben auf unsere Warnung gehört.',
    'Unser Hinweis neulich hat Ihnen geholfen, nicht wahr?',
    'Sie hören zu, wenn wir etwas sagen. Gut.',
  ],
  warHelp: [
    'Im Krieg standen Sie an unserer Seite.',
    'Wer uns im Krieg hilft, ist ein Freund.',
    'Ihre Hilfe gegen unsere Feinde bleibt unvergessen.',
  ],
};

function memoriesOf(ctx: Ctx, gangId: string): GangMemory[] {
  const g = ctx.state.modules.gangs;
  g.memories ??= {};
  g.memories[gangId] ??= [];
  return g.memories[gangId];
}

/** Anteil, der von einer Erinnerung noch wirkt (1 frisch, 0 verblasst). */
function strength(m: GangMemory, now: number): number {
  if (m.until === null) return 1;
  const days = MEMORIES[m.kind].days;
  const total = days === null ? 1 : days * 1440;
  return Math.max(0, Math.min(1, (m.until - now) / total));
}

/** Erinnerungen einer Gang, die noch wirken (stärkste zuerst), mit ihrer aktuellen Wirkung. */
export function gangMemories(
  state: GameState,
  gangId: string,
): { kind: MemoryKind; value: number; at: number; until: number | null }[] {
  return (state.modules.gangs?.memories?.[gangId] ?? [])
    .map((m) => ({ kind: m.kind, value: Math.round(m.effect * strength(m, state.time)), at: m.at, until: m.until }))
    .filter((m) => m.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || b.at - a.at);
}

/** Summe der Erinnerungen: wie die Gang über dich denkt (negativ = Groll, positiv = Wohlwollen). */
export function memoryScore(state: GameState, gangId: string): number {
  return gangMemories(state, gangId).reduce((sum, m) => sum + m.value, 0);
}

/** Faktor auf die Preise für Waffenstillstand und Bündnis (Groll macht teurer, Wohlwollen billiger). */
export function memoryPriceFactor(state: GameState, gangId: string): number {
  const raw = 1 - memoryScore(state, gangId) / MEMORY_PRICE_DIVISOR;
  return Math.max(MEMORY_PRICE_RANGE[0], Math.min(MEMORY_PRICE_RANGE[1], raw));
}

/** Eine Erinnerung anlegen; gleiche Erinnerungen summieren sich (bis stack × Wirkung) und fangen neu an zu verblassen. */
export function remember(ctx: Ctx, gangId: string, kind: MemoryKind): void {
  if (!ctx.state.modules.gangs?.gangs[gangId]) return;
  const info = MEMORIES[kind];
  const list = memoriesOf(ctx, gangId);
  const until = info.days === null ? null : ctx.now + info.days * 1440;
  const existing = list.find((m) => m.kind === kind);
  if (existing) {
    const left = Math.round(existing.effect * strength(existing, ctx.now));
    const cap = Math.abs(info.effect * info.stack);
    existing.effect = Math.sign(info.effect) * Math.min(cap, Math.abs(left + info.effect));
    existing.at = ctx.now;
    existing.until = until;
  } else {
    list.push({ kind, effect: info.effect, at: ctx.now, until });
  }
  if (list.length > MEMORY_LIMIT) {
    list.sort((a, b) => Math.abs(b.effect * strength(b, ctx.now)) - Math.abs(a.effect * strength(a, ctx.now)));
    list.length = MEMORY_LIMIT;
  }
  ctx.emit('gang.remembered', { gangId, kind, effect: info.effect });
}

/** Um Mitternacht: verblasste Erinnerungen fallen weg (alle Städte, das Gedächtnis schläft nicht). */
export function forgetFaded(ctx: Ctx): void {
  const all = ctx.state.modules.gangs?.memories;
  if (!all) return;
  for (const gangId of Object.keys(all)) {
    all[gangId] = all[gangId].filter((m) => m.until === null || m.until > ctx.now);
  }
}

/**
 * Satz, mit dem sich eine Nachricht der Gang auf ihre stärkste Erinnerung bezieht (leer, wenn nichts Starkes da ist).
 * Text-Helfer, damit derselbe Satz nicht direkt wiederkommt.
 */
export function memoryLine(ctx: Ctx, gangId: string): string {
  const strongest = gangMemories(ctx.state, gangId)[0];
  if (!strongest || Math.abs(strongest.value) < MEMORY_MENTION_AT) return '';
  // Wer siezt, erinnert sich auch per Sie (Auftrag 43, K3).
  return formalVoice(gangId)
    ? texts.pick(ctx, `gang:memory:formal:${strongest.kind}`, MEMORY_TEXTS_FORMAL[strongest.kind])
    : texts.pick(ctx, `gang:memory:${strongest.kind}`, MEMORY_TEXTS[strongest.kind]);
}
