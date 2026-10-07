// Container packen (Auftrag 44, Teil 7): Anmeldung der Ansicht. Spiel in ContainerGame.tsx, Logik als reines Modell
// (model.ts mit model.test.ts), Zeichnen in draw.ts, Klänge in sounds.ts. Auslöser und Folgen: trade (packing.ts).
// Vorschau: ?minispiel=container (halber Container mit Bananen), &seed=2 (ganzer Container mit Fliesen), &seed=3
// (Kiste ohne Deckladung, Altkleider).

import { formatNumber } from '../../../../../core';
import { packingFactor } from '../../../../trade';
import { registerMinigameView } from '../../registry';
import { ContainerGame } from './ContainerGame';
import { registerPackSounds } from './sounds';
import './container.css';

registerPackSounds();

const PREVIEWS = [
  {
    products: [{ id: 'hash', name: 'Hasch' }],
    size: 'medium',
    cover: 'bananas',
    count: 2,
    grams: 50_000,
    from: 'Tanger',
    port: 'Rotterdam',
    vessel: null,
  },
  {
    products: [
      { id: 'weed', name: 'Gras' },
      { id: 'haze', name: 'Haze' },
    ],
    size: 'full',
    cover: 'tiles',
    count: 1,
    grams: 120_000,
    from: 'Algeciras',
    port: 'Rotterdam',
    vessel: 'MS Mathilde',
  },
  {
    products: [{ id: 'kush', name: 'OG Kush' }],
    size: 'small',
    cover: 'none',
    count: 1,
    grams: 20_000,
    from: 'Westland',
    port: 'Antwerpen',
    vessel: null,
  },
];

/** Zahl aus einem pick wie 'flagged:3' bzw. 'goods:2/4'. */
function pickValue(picks: readonly string[], id: string): string | null {
  const pick = picks.find((p) => p.startsWith(`${id}:`));
  return pick ? pick.slice(id.length + 1) : null;
}

registerMinigameView('container', {
  component: ContainerGame,
  layout: 'stage',
  icon: 'boxes',
  controls: {
    keys: 'Pfeile: Platz, R: drehen, Q/E: Teil wählen, Leertaste: ablegen, Z: zurück, F: fertig.',
    touch: 'Teil unten antippen oder in den Container ziehen, im Container antippen: ablegen.',
    help:
      'Die Ware muss rundherum von Deckladung umgeben sein. An den Türen (rechts) sieht sie jeder, der aufmacht, an ' +
      'der Wand zum Röntgen (oben) leuchtet sie im Scanner, und große zusammenhängende Ware-Blöcke fallen auf. ' +
      'Lücken neben der Ware kosten Tarnung. Ein abgelegtes Teil antippen nimmt es wieder heraus. Gut gepackt senkt ' +
      'die Chance einer Zollkontrolle für alle Container der Bestellung, schlecht gepackt hebt sie.',
  },
  previewParams: (seed) => PREVIEWS[(((seed - 1) % PREVIEWS.length) + PREVIEWS.length) % PREVIEWS.length],
  previewSituation:
    'Der Container mit Hasch aus Tanger geht nach Rotterdam. Du packst den ersten, die Jungs packen den anderen genauso.',
  resultText: ({ score, picks }) => {
    const factor = packingFactor(score);
    const flagged = Number(pickValue(picks, 'flagged') ?? 0);
    const goods = pickValue(picks, 'goods');
    const [placed, total] = (goods ?? '0/0').split('/').map(Number);
    const left =
      total > placed
        ? ` ${total - placed} Ware-${total - placed === 1 ? 'Block liegt' : 'Blöcke liegen'} noch obenauf.`
        : '';
    const seen =
      flagged > 0 ? ` Im Röntgen ${flagged === 1 ? 'leuchtet eine Stelle' : `leuchten ${flagged} Stellen`}.` : '';
    const risk = `Zollrisiko × ${formatNumber(factor, 2)}`;
    if (factor <= 0.75) return `Sauber gepackt: ${risk}.${seen}`;
    if (factor <= 1) return `Ordentlich gepackt: ${risk}.${seen}${left}`;
    return `Schlecht gepackt: ${risk}.${seen}${left}`;
  },
});
