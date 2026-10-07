// Papiere fälschen (Auftrag 44, Teil 8): Anmeldung der Ansicht. Spiel in PapersGame.tsx, Logik als reines Modell
// (model.ts mit model.test.ts), Papiere, Firmen und Sätze des Zöllners als Daten (data.ts), Tisch in draw.ts, Klänge in
// sounds.ts. Auslöser und Folgen: encounters (customsCheck, applyPapers in encounters/minigames.ts).
// Vorschau: ?minispiel=papers (Autobahn, Tag), &seed=2 (Kai in Rotterdam, Nacht).

import { clock, formatEuro } from '../../../../../core';
import { registerMinigameView } from '../../registry';
import { PapersGame } from './PapersGame';
import { registerPapersSounds } from './sounds';
import './papers.css';

registerPapersSounds();

registerMinigameView('papers', {
  component: PapersGame,
  layout: 'stage',
  icon: 'clipboard',
  controls: {
    keys: 'Pfeile: Zeile, Eingabe: umschreiben, 1 bis 4: Wert. B Schein, G aufgeben.',
    touch: 'Zeile antippen, richtigen Wert wählen. Oben die Reiter der Papiere.',
    help:
      'Der Zöllner liest ein Papier nach dem anderen, sein Finger wandert die Zeilen runter. Was auf einem Papier ' +
      'anders steht als auf den beiden anderen, auf der Waage, im Kalender oder auf dem Kennzeichen, musst du ' +
      'umschreiben, bevor er dort ankommt. Der Ausfuhrstempel muss zur Herkunft passen. Findet er zwei Fehler, ' +
      'macht er die Ladung auf. Den Schein nimmt er erst, wenn er schon etwas gefunden hat; vorher zählt er als ' +
      'Fehler. Aufgeben heißt: Die Ware bleibt da, festgenommen wird niemand.',
  },
  previewParams: (seed) => {
    const port = seed % 2 === 0;
    return {
      encounterKind: 'customsCheck',
      setting: port ? 'port' : 'autobahn',
      phase: port ? 'night' : 'day',
      weather: 'clear',
      place: port ? 'in Rotterdam' : 'auf der A1 bei Münster',
      opponent: { label: 'Der Zoll', strength: 62, count: 3, roles: ['leader', 'nervous'] },
      stakes: { ids: ['goods', 'people'], money: 0, goods: port ? 40_000 : 1200 },
      bribeCost: port ? 2400 : 1350,
      clock: 5,
      time: clock.at(12, port ? 2 : 14, 20),
    };
  },
  previewSituation:
    'Zollkontrolle auf der A1 bei Münster. Der Zoll winkt den Transporter auf den Parkplatz. Hinten drin: 1,2 kg Ware.',
  resultText: ({ won, picks }, challenge) => {
    const port = challenge.params.setting === 'port';
    if (picks.includes('bribe')) {
      const cost = Number(challenge.params.bribeCost);
      return Number.isFinite(cost) && cost > 0
        ? `${formatEuro(cost)} zwischen den Papieren. Stempel, weiter.`
        : 'Ein Schein zwischen den Papieren. Stempel, weiter.';
    }
    if (picks.includes('giveUp')) return 'Du lässt die Ladung stehen und gehst. Festgenommen wird niemand.';
    const hits = Number(picks.find((p) => p.startsWith('hits:'))?.slice(5) ?? 0);
    if (won) {
      const go = port ? 'Der Container geht raus.' : 'Die Fahrt geht weiter.';
      return hits > 0 ? `Abgefertigt. Knapp: Einen Fehler hat er gesehen. ${go}` : `Abgefertigt. ${go}`;
    }
    return port ? 'Zwei Fehler. Der Zoll öffnet den Container.' : 'Zwei Fehler. Der Zoll lässt die Ladung öffnen.';
  },
});
