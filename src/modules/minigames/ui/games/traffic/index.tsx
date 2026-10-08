// Verkehrskontrolle (Auftrag 44, Teil 4; seit Auftrag 47 ein Gespräch mit Widersprüchen aus dem Auto in 3D):
// Anmeldung der Ansicht. Spiel in TrafficGame.tsx, Logik als reines Modell (model.ts mit model.test.ts), Fragen und
// Antworten als Daten (questions.ts), 3D-Szene in scene.ts, Klänge in sounds.ts. Auslöser und Folgen: encounters
// (vehicleCheck, applyTraffic in encounters/minigames.ts).
// Vorschau: ?minispiel=traffic (Nacht mit Regen), &seed=2 (gerade Seeds: Tag, trocken).

import { formatEuro } from '../../../../../core';
import { registerMinigameView } from '../../registry';
import { registerTrafficSounds } from './sounds';
import { TrafficGame } from './TrafficGame';
import './traffic.css';

registerTrafficSounds();

registerMinigameView('traffic', {
  component: TrafficGame,
  layout: 'stage',
  icon: 'siren',
  controls: {
    keys: '1 bis 3: Antwort wählen. G Gas geben, B Schein zustecken.',
    touch: 'Eine der drei Antworten antippen. Unten: Gas geben oder Schein.',
    help:
      'Du sitzt am Steuer, der Beamte steht am Fenster und fragt: Woher, wohin, wessen Wagen, was hinten drin ist. ' +
      'Zu jeder Frage passt genau eine Antwort zu dem, was er sieht (Uhrzeit, Kennzeichen, Fahrzeug, die Ladung ' +
      'hinter der Scheibe; steht links im Bild) und zu dem, was du vorher gesagt hast. Fliegt ein Widerspruch auf, ' +
      'steigt das Misstrauen; beim zweiten musst du aussteigen. Er fragt auch mal nach, was du eben gesagt hast. Lange ' +
      'überlegen macht ihn ungeduldig. Der Schein klappt nur bei mittlerem Misstrauen, Gas geben heißt Verfolgungsjagd.',
  },
  previewParams: (seed) => ({
    encounterKind: 'vehicleCheck',
    setting: 'street',
    phase: seed % 2 === 0 ? 'day' : 'night',
    weather: seed % 2 === 0 ? 'clear' : 'rain',
    hour: seed % 2 === 0 ? 15 : 1,
    place: 'in Ehrenfeld',
    opponent: { label: 'Die Streife', strength: 50, count: 2, roles: ['leader', 'nervous'] },
    stakes: { ids: ['goods', 'people', 'noise'], money: 0, goods: 400 },
    bribeCost: 1100,
    clock: 3,
  }),
  previewSituation: 'Kelle raus in Ehrenfeld. Die Streife winkt den Transporter raus. Hinten drin: 400 g Ware.',
  resultLabel: ({ picks }) => {
    if (picks.includes('flee')) return { label: 'Gas!', tone: 'warn', icon: 'car' };
    if (picks.includes('bribe')) return { label: 'Bestochen', tone: 'warn', icon: 'money' };
    return undefined;
  },
  resultText: ({ won, picks }, challenge) => {
    if (picks.includes('flee')) return 'Du trittst aufs Gas. Jetzt musst du sie abhängen.';
    if (picks.includes('bribe')) {
      const cost = Number(challenge.params.bribeCost);
      return Number.isFinite(cost) && cost > 0
        ? `Ein Schein über ${formatEuro(cost)}, und er hat nichts gesehen.`
        : 'Ein Schein, und er hat nichts gesehen.';
    }
    const noted = picks.some((p) => p.startsWith('lies:'));
    if (won)
      return noted
        ? '„Gute Fahrt.“ Aber er hat sich das Kennzeichen notiert.'
        : '„Gute Fahrt.“ Deine Geschichte hat gehalten.';
    return '„Aussteigen. Hände aufs Dach.“ Die Ladung fliegt auf.';
  },
});
