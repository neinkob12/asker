// Razzia-Countdown (Auftrag 44, Teil 3): Anmeldung der Ansicht. Spiel in StashGame.tsx, Logik als reines Modell
// (model.ts mit model.test.ts), Zeichnen in draw.ts, Klänge in sounds.ts. Auslöser und Folgen: police (stash.ts).
// Vorschau: ?minispiel=stash (Lager mit Tresor), &seed=2 (gerade Seeds: Razzia am Spot, die Straße).

import { formatPercent } from '../../../../../core';
import { STASH_MAX } from '../../../../police';
import { registerMinigameView } from '../../registry';
import { StashGame } from './StashGame';
import { registerStashSounds } from './sounds';
import './stash.css';

registerStashSounds();

/** Zählt Pakete aus den picks (z.B. 'vault:2', 'drain:1', 'left:3'). */
function countPicks(picks: readonly string[]): { hidden: number; wet: number; left: number } {
  let hidden = 0;
  let wet = 0;
  let left = 0;
  for (const pick of picks) {
    const [id, n] = pick.split(':');
    const count = Number(n) || 0;
    if (id === 'left') left += count;
    else {
      hidden += count;
      if (id === 'drain') wet += count;
    }
  }
  return { hidden, wet, left };
}

registerMinigameView('stash', {
  component: StashGame,
  layout: 'stage',
  icon: 'siren',
  controls: {
    keys: '←/→ Paket wählen, Zahlentaste: ins Versteck. Maus: ziehen.',
    touch: 'Paket in ein Versteck ziehen oder antippen, dann das Versteck.',
    help:
      'Du trägst immer nur ein Paket, große sind langsamer. Jedes Versteck hat seinen Platz: der Schacht nur für ' +
      'Kleines, der Tresor nur mit Ausbau. Der Gully ist schnell, aber die Ware wird nass und ist weniger wert. ' +
      'Kurz vor Schluss steht die Streife vor dem Tor, dann sind Kofferraum und Gully zu. Was offen liegt, ist weg.',
  },
  previewParams: (seed) =>
    seed % 2 === 0
      ? {
          scope: 'spot',
          setting: 'street',
          place: 'am Zülpicher Platz',
          lots: [
            { productId: 'weed', name: 'Gras', amount: 15, unit: 'g', grams: 15, quality: 0.6, value: 165 },
            { productId: 'hash', name: 'Hasch', amount: 9, unit: 'g', grams: 9, quality: 0.5, value: 90 },
            { productId: 'edibles', name: 'Edibles', amount: 4, unit: 'Stück', grams: 20, quality: 0.6, value: 60 },
          ],
          money: 180,
          minutes: 180,
          tip: 'Ömer (Büdchen am Ring)',
        }
      : {
          scope: 'veedel',
          setting: 'warehouse',
          place: 'in Ehrenfeld',
          warehouse: { id: 'ehrenfeld', name: 'Bahnhof Ehrenfeld', vault: 1, cover: 0 },
          lots: [
            { productId: 'weed', name: 'Gras', amount: 1400, unit: 'g', grams: 1400, quality: 0.6, value: 15400 },
            { productId: 'kush', name: 'OG Kush', amount: 350, unit: 'g', grams: 350, quality: 0.8, value: 6300 },
            { productId: 'hash', name: 'Hasch', amount: 500, unit: 'g', grams: 500, quality: 0.5, value: 5000 },
            { productId: 'edibles', name: 'Edibles', amount: 80, unit: 'Stück', grams: 400, quality: 0.6, value: 1200 },
          ],
          money: 2400,
          minutes: 180,
          tip: 'Ömer (Büdchen am Ring)',
        },
  previewSituation:
    'Tipp von Ömer (Büdchen am Ring): Um 14:30 kommt die Razzia in Ehrenfeld. Im Lager liegt noch Ware.',
  resultText: ({ won, score, picks }) => {
    const { wet, left } = countPicks(picks);
    const share = Math.min(STASH_MAX, score);
    const extra = [wet > 0 ? `${wet} nass` : '', left > 0 ? `${left} gefunden` : ''].filter(Boolean).join(', ');
    const tail = extra ? ` (${extra})` : '';
    if (won)
      return `Gerettet: ${formatPercent(score)} nach Wert${tail}. Die Razzia nimmt ${formatPercent(share)} weniger mit.`;
    if (score > 0) return `Nur ${formatPercent(score)} gerettet${tail}. Was offen lag, nehmen sie mit.`;
    return 'Nichts versteckt. Was die Bullen finden, ist weg.';
  },
});
