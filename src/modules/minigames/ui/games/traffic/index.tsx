// Verkehrskontrolle (Auftrag 44, Teil 4): Anmeldung der Ansicht. Spiel in TrafficGame.tsx, Logik als reines Modell
// (model.ts mit model.test.ts), Fragen und Sätze des Beamten als Daten (questions.ts), Zeichnen in draw.ts, Klänge in
// sounds.ts. Auslöser und Folgen: encounters (vehicleCheck, applyTraffic in encounters/minigames.ts).
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
    keys: '1 bis 4 antworten, Leertaste im Takt: ruhig bleiben. G Gas geben, B Schein.',
    touch: 'Antwort antippen, Herz im Takt tippen. Unten: Gas geben oder Schein.',
    help:
      'Jede Frage hat eine Frist, Schweigen ist verdächtig. Was du sagst, muss zusammenpassen: Er fragt später noch ' +
      'einmal nach und leuchtet in den Laderaum. Tippst du im ruhigen Takt (wenn der Ring das Herz trifft), bleibt ' +
      'dein Puls unten; zittrig merkt er alles. Der Schein klappt nur bei mittlerem Misstrauen, Gas geben heißt ' +
      'Verfolgungsjagd. Bleibt das Misstrauen am Ende unter der Linie: „Gute Fahrt“.',
  },
  previewParams: (seed) => ({
    encounterKind: 'vehicleCheck',
    setting: 'street',
    phase: seed % 2 === 0 ? 'day' : 'night',
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
    const lies = picks.find((p) => p.startsWith('lies:'));
    if (won) return lies ? '„Gute Fahrt.“ Knapp: Er hat sich etwas notiert.' : '„Gute Fahrt.“ Die Ladung bleibt zu.';
    return '„Aussteigen, Kofferraum auf!“ Die Ladung fliegt auf.';
  },
});
