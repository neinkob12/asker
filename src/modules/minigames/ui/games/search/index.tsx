// Bude durchsuchen (Auftrag 44, Teil 6): Anmeldung der Ansicht. Spiel in SearchGame.tsx, Logik als reines Modell
// (model.ts mit model.test.ts), Lage in layout.ts, Zeichnen in draw.ts, Klänge in sounds.ts. Auslöser und Folgen:
// gangs (search.ts). Vorschau: ?minispiel=search (seed 1 bei Nacht, &seed=2 bei Tag, &seed=3 in der Dämmerung).

import { formatEuro } from '../../../../../core';
import { registerMinigameView } from '../../registry';
import { SearchGame } from './SearchGame';
import { registerSearchSounds } from './sounds';
import './search.css';

registerSearchSounds();

/** Wie viel in der Bude lag (params.max aus gangs), sonst 0. */
function maxOf(params: Record<string, unknown>): number {
  const max = Number(params.max);
  return Number.isFinite(max) && max > 0 ? max : 0;
}

/** Zahl aus einem pick wie found:2 (sonst 0). */
function countOf(picks: readonly string[], prefix: string): number {
  const pick = picks.find((p) => p.startsWith(prefix));
  return pick ? Number(pick.slice(prefix.length)) || 0 : 0;
}

const PREVIEW_PHASES = ['night', 'day', 'dusk'];

registerMinigameView('search', {
  component: SearchGame,
  layout: 'stage',
  icon: 'search',
  controls: {
    keys: 'Pfeile wählen, Leertaste durchsuchen. Oder mit der Maus klicken.',
    touch: 'Antippen, was du durchsuchen willst. Ziehen führt die Taschenlampe.',
    help:
      'In drei bis fünf Verstecken liegt Geld. Was verrutscht aussieht oder Kratzer hat, lohnt sich oft, aber nicht ' +
      'immer. Geschirr, Mikrowelle und Co. können klirren: Ist der Lärm-Balken voll, ruft der Nachbar die Polizei, ' +
      'dann bleiben nur noch Sekunden. Nach 30 Sekunden steht der Schuldner wieder vor der Tür.',
  },
  previewParams: (seed) => ({
    max: 1560,
    gang: 'Schäl Sick',
    phase: PREVIEW_PHASES[(seed - 1) % PREVIEW_PHASES.length],
  }),
  previewSituation: 'Er hat nicht alles rausgerückt. In seiner Bude liegen noch bis zu 1.560 €, bevor er zurück ist.',
  resultText: ({ won, score, picks }, challenge) => {
    const max = maxOf(challenge.params);
    const amount = formatEuro(Math.round(max * score));
    const found = countOf(picks, 'found:');
    const hidden = countOf(picks, 'hidden:');
    const where = hidden > 0 ? ` (${found} von ${hidden} Verstecken)` : '';
    if (won) return max > 0 ? `${amount} gefunden${where}.` : `Gefunden${where}.`;
    if (picks.includes('noise')) return `Nur ${amount}${where}. Die Nachbarn haben alles gehört: Heat im Veedel.`;
    return score > 0 ? `Nur ${amount} gefunden${where}. Der Rest bleibt versteckt.` : 'Nichts gefunden.';
  },
});
