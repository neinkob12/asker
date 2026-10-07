// Straßenkampf (Auftrag 44, Teil 2): Anmeldung der Ansicht. Spiel in BrawlGame.tsx, Logik als reines Modell
// (model.ts mit model.test.ts), Zeichnen in draw.ts, eigene Klänge in sounds.ts.

import { registerMinigameView } from '../../registry';
import { BrawlGame } from './BrawlGame';
import { registerBrawlSounds } from './sounds';
import './brawl.css';

registerBrawlSounds();

/** Picks zählen (z.B. down:2 → 2). */
function countOf(picks: readonly string[], prefix: string): number {
  return picks.reduce((sum, p) => (p.startsWith(prefix) ? sum + (Number(p.slice(prefix.length)) || 0) : sum), 0);
}

const PREVIEW_SETTINGS = ['spot', 'street', 'warehouse', 'meeting'];
const PREVIEW_PHASES = ['night', 'dusk', 'night', 'day', 'dawn'];
const PREVIEW_WEATHER = ['rain', 'clear', 'snow', 'cloudy', 'storm'];
const PREVIEW_INTENTS = [
  { id: 'grabGoods', label: 'Sie gehen auf die Ware', stake: 'goods' },
  { id: 'knife', label: 'Einer zieht ein Messer', stake: 'people' },
  { id: 'emptyTill', label: 'Sie räumen die Kasse', stake: 'cash' },
  { id: 'bruiserUp', label: 'Der Schläger baut sich auf', stake: null },
  { id: 'noise', label: 'Es wird laut', stake: 'noise' },
];

registerMinigameView('brawl', {
  component: BrawlGame,
  layout: 'stage',
  icon: 'fist',
  controls: {
    keys: '←/→ laufen, ↑/↓ Ebene, J Schlag, K hart, L Block, Leertaste ausweichen, 1–3 Crew.',
    touch: 'Steuerkreuz links, rechts Schlag, Hart, Block (halten) und Ausweichen.',
    help:
      'Gegner kündigen ihren Angriff mit einem Zeichen über dem Kopf an, das Messer blinkt rot. Blockst du oder ' +
      'weichst du im letzten Moment aus, ist das ein Konter: Zeitlupe, und dein nächster Treffer zählt doppelt. ' +
      'Der Anführer blockt leichte Schläge, ein harter bricht seine Deckung. Treffen kann nur, wer in derselben ' +
      'Ebene steht. Deine Crew kämpft mit; ihre Spezialzüge liegen auf 1 bis 3. Läuft die Uhr ab, kommt die Polizei.',
  },
  // Vorschau: Mit &seed= wechseln Ort, Tageszeit, Wetter und Absicht (seed 1: Spot bei Nacht im Regen).
  previewParams: (seed) => ({
    setting: PREVIEW_SETTINGS[(seed - 1) % PREVIEW_SETTINGS.length],
    phase: PREVIEW_PHASES[(seed - 1) % PREVIEW_PHASES.length],
    weather: PREVIEW_WEATHER[(seed - 1) % PREVIEW_WEATHER.length],
    place: 'am Ebertplatz',
    opponent: {
      label: 'Schäl Sick',
      strength: 55,
      count: 3 + ((seed - 1) % 2),
      roles: ['leader', 'nervous', 'bruiser', 'bruiser'].slice(0, 3 + ((seed - 1) % 2)),
    },
    intent: PREVIEW_INTENTS[(seed - 1) % PREVIEW_INTENTS.length],
    crew: [
      {
        id: 'preview:kalle',
        name: 'Kalle Brück',
        stats: { speed: 45, caution: 50, strength: 72, charisma: 30 },
        condition: 'ok',
        move: 'block',
        age: 33,
      },
      {
        id: 'preview:aylin',
        name: 'Aylin Demir',
        stats: { speed: 78, caution: 40, strength: 44, charisma: 71 },
        condition: 'ok',
        move: 'secondTalk',
        age: 24,
      },
    ],
    player: { stats: { strength: 60, speed: 55, caution: 50, charisma: 50 }, condition: 'ok' },
    clock: 4,
  }),
  previewSituation: 'Schäl Sick stürmt den Spot am Ebertplatz. Drei gegen euch, einer will an die Ware.',
  resultText: ({ won, picks }) => {
    const down = countOf(picks, 'down:');
    const fled = countOf(picks, 'fled:');
    // Ohne picks (Rechte Hand, Entwicklung): nur das Ergebnis.
    if (picks.length === 0) return won ? 'Ihr setzt euch durch.' : 'Sie setzen sich durch.';
    if (picks.includes('ko'))
      return 'Du gehst zu Boden. Deine Leute ziehen dich raus, die anderen behalten die Oberhand.';
    const parts: string[] = [];
    if (down > 0) parts.push(`${down} am Boden`);
    if (fled > 0) parts.push(`${fled} abgehauen`);
    const tally = parts.length > 0 ? `${parts.join(', ')}.` : 'Keiner von ihnen liegt.';
    if (picks.includes('grabbed')) return `${tally} Aber einer ist mit der Beute weg.`;
    if (picks.includes('sirens')) return `${tally} Dann kommen die Sirenen, alle rennen.`;
    return won ? `${tally} Die Straße gehört euch.` : `${tally} Das ist noch nicht vorbei.`;
  },
});
