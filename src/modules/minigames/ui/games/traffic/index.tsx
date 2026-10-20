// Verkehrskontrolle (Auftrag 44, Teil 4; seit Auftrag 47 ein Gespräch mit Widersprüchen aus dem Auto in 3D):
// Anmeldung der Ansicht. Spiel in TrafficGame.tsx, Logik als reines Modell (model.ts mit model.test.ts, Schwierigkeit
// in model.balance.test.ts), Fragen und Antworten als Daten (questions.ts), 3D-Szene in scene.ts (Beamter officer.ts,
// Gesicht faceTexture.ts, Texturen textures.ts), Klänge in sounds.ts. Auslöser und Folgen: encounters (vehicleCheck,
// applyTraffic in encounters/minigames.ts).
// Vorschau: ?minispiel=traffic (Regen, Tageszeit der Spieluhr), &seed=2 (gerade Seeds: trocken).

import { formatEuro } from '../../../../../core';
import { lazyView } from '../../kit/lazyView';
import { registerMinigameView } from '../../registry';
import { registerTrafficSounds } from './sounds';
import './traffic.css';

registerTrafficSounds();

registerMinigameView('traffic', {
  // three.js erst beim Start laden (eigenes Paket).
  component: lazyView(() => import('./TrafficGame').then((m) => m.TrafficGame)),
  layout: 'stage',
  icon: 'siren',
  controls: {
    keys: '1 bis 3: Antwort wählen. G Gas geben, B Schein zustecken.',
    touch: 'Eine der drei Antworten antippen. Unten: Gas geben oder Schein.',
    help:
      'Du sitzt am Steuer, der Beamte steht am Fenster und fragt: Woher, wohin, wessen Wagen, was hinten drin ist. ' +
      'Zu jeder Frage passt eine Antwort zu dem, was er sieht (Uhrzeit, Kennzeichen, Fahrzeug, die Ladung hinter ' +
      'der Scheibe) und zu dem, was du schon gesagt hast; beides steht links im Bild. Fliegt ein Widerspruch auf, ' +
      'leuchtet auf, woran es hing, und das Misstrauen steigt; beim zweiten oder bei vollem Misstrauen musst du ' +
      'aussteigen. Er fragt nach und stellt Fallen („Sie kamen doch vom Baumarkt?“): Dann gilt, was du wirklich ' +
      'gesagt hast. Unter seiner Frage läuft die Geduld ab: Wer lange zögert, macht ihn misstrauisch, wer schweigt, ' +
      'fliegt auf. Der Schein klappt nur bei mittlerem Misstrauen, Gas geben heißt Verfolgungsjagd.',
  },
  previewParams: (seed) => ({
    encounterKind: 'vehicleCheck',
    setting: 'street',
    // Ohne Stunde und Tageszeit nimmt das Spiel die Spieluhr (sonst passten Bild und Uhr nicht zusammen); --uhr der
    // Screenshots setzt beides.
    weather: seed % 2 === 0 ? 'clear' : 'rain',
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
