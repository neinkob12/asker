// Tresor knacken (Auftrag 44, Teil 0): Anmeldung der Ansicht. Vorbild für die anderen Minispiele: Spiel in einer
// eigenen Komponente (SafeGame.tsx), Logik als reines Modell (model.ts mit model.test.ts), Zeichnen getrennt (draw.ts).

import { formatEuro } from '../../../../../core';
import { registerMinigameView } from '../../registry';
import { SafeGame } from './SafeGame';
import './safe.css';

/** Wie viel im Tresor liegt (params.max aus gangs), sonst 0. */
function maxOf(params: Record<string, unknown>): number {
  const max = Number(params.max);
  return Number.isFinite(max) && max > 0 ? max : 0;
}

registerMinigameView('safe', {
  component: SafeGame,
  layout: 'stage',
  icon: 'lock',
  controls: {
    keys: '←/→ drehen (Umschalt: fein), Leertaste: einrasten.',
    touch: 'Am Rad drehen oder Pfeile halten, dann „Einrasten“.',
    help:
      'Drei Zahlen: erst nach rechts auf die erste, dann nach links auf die zweite, dann wieder nach rechts. ' +
      'Je näher du bist, desto lauter klickt es, das Rad zittert und das Stethoskop schlägt aus. ' +
      'Falsch einrasten kostet Sekunden.',
  },
  previewParams: () => ({ max: 2400, gang: 'Schäl Sick' }),
  previewSituation: 'Im Hinterzimmer von Schäl Sick steht ein alter Stahltresor. Drin: bis zu 2.400 €.',
  resultText: ({ won, score }, challenge) => {
    const max = maxOf(challenge.params);
    if (won) return max > 0 ? `Geknackt: ${formatEuro(Math.round(max * score))} gehören dir.` : 'Geknackt.';
    return 'Der Tresor hält. Der Alarm geht los, ihr müsst raus.';
  },
});
