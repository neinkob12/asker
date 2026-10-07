// Zivi oder Kunde (Auftrag 44, Teil 5): Anmeldung der Ansicht. Spiel in UndercoverGame.tsx, Logik als reines Modell
// (model.ts mit model.test.ts), Merkmale und Sätze als Daten (tells.ts, lines.ts), Zeichnungen in figure.tsx, Klänge
// in sounds.ts. Auslöser und Folgen: police (undercover.ts). Vorschau: ?minispiel=undercover (nachts am Zülpicher
// Platz), &seed=2 (gerade Seeds: tagsüber an der Venloer Straße), &schwer=0.9 (4 s pro Karte, weniger Eindeutiges).

import { registerMinigameView } from '../../registry';
import { countPick } from './model';
import { registerUndercoverSounds } from './sounds';
import { UndercoverGame } from './UndercoverGame';
import './undercover.css';

registerUndercoverSounds();

const GOODS = [
  { productId: 'weed', name: 'Gras', unit: 'g' },
  { productId: 'hash', name: 'Hasch', unit: 'g' },
  { productId: 'edibles', name: 'Edibles', unit: 'Stück' },
];

function people(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

registerMinigameView('undercover', {
  component: UndercoverGame,
  layout: 'stage',
  icon: 'eye',
  controls: {
    keys: '→ verkaufen, ← abwimmeln (oder D und A).',
    touch: 'Karte nach rechts wischen: verkaufen, nach links: abwimmeln.',
    help:
      'Unter den Leuten sind Zivilfahnder. Schau auf das, was du siehst: Ein verdächtiges Merkmal kann Zufall sein, ' +
      'zwei sind ein Zivi. Knopf im Ohr, Kabel am Kragen und eine Beule am Gürtel sieht man fast nur bei Zivis. ' +
      'Wer zu lange wartet, geht wieder. Verkaufst du an einen Zivi, kommt gleich die Kontrolle.',
  },
  previewParams: (seed) =>
    seed % 2 === 0
      ? {
          spotId: 'venloer',
          spot: 'Venloer Straße',
          place: 'an der Venloer Straße',
          veedel: 'Ehrenfeld',
          kind: 'corner',
          hour: 15,
          goods: GOODS,
          customers: 7,
          zivis: 1,
          heat: 30,
        }
      : {
          spotId: 'zuelpicher',
          spot: 'Zülpicher Platz',
          place: 'am Zülpicher Platz',
          veedel: 'Kwartier Latäng',
          kind: 'corner',
          hour: 23,
          goods: GOODS,
          customers: 9,
          zivis: 2,
          heat: 55,
        },
  previewSituation:
    'Kwartier Latäng ist heiß: Unter den nächsten 9 Leuten am Zülpicher Platz sind 2 Zivis. Verkauf nur an echte Kunden.',
  resultText: ({ picks }) => {
    const soldZivi = countPick(picks, 'soldZivi');
    const spotted = countPick(picks, 'spotted');
    const away = countPick(picks, 'turnedAway');
    const missed = countPick(picks, 'missed');
    if (soldZivi > 0) {
      return `Du hast an ${soldZivi === 1 ? 'einen Zivi' : `${soldZivi} Zivis`} verkauft. Gleich gibt es eine Kontrolle.`;
    }
    const lost =
      away > 0
        ? ` ${away === 1 ? 'Ein echter Kunde ist' : `${away} echte Kunden sind`} leer ausgegangen, das kostet Ruf.`
        : '';
    if (missed === 0 && spotted > 0) return `Alle Zivis erkannt. Sie ziehen ab, das Veedel kühlt ab.${lost}`;
    return `${people(spotted, 'Zivi', 'Zivis')} erkannt, ${missed} durchgerutscht. Die bleiben dran.${lost}`;
  },
});
