// Verkehrskontrolle (Auftrag 44, Teil 4; neu nach dem Feedback vom 07.10.2026 als „Verstecken und Nerven“, ohne Fragen
// und Antworten): Anmeldung der Ansicht. Spiel in TrafficGame.tsx, Logik als reines Modell (model.ts mit
// model.test.ts), Sätze des Beamten als Daten (lines.ts), Zeichnen von oben in draw.ts, Klänge in sounds.ts. Auslöser
// und Folgen: encounters (vehicleCheck, applyTraffic in encounters/minigames.ts).
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
    keys: '←/→ Paket wählen, 1 bis 7 Stelle, Leertaste im Takt: ruhig bleiben. G Gas geben, B Schein.',
    touch: 'Paket antippen und Stelle wählen (oder ziehen), Herz im Takt tippen. Unten: Gas geben oder Schein.',
    help:
      'Er geht mit der Taschenlampe ums Auto und leuchtet Station für Station in ein, zwei Stellen: rot umrandet, ' +
      'wo das Licht gerade ist, gelb, wo es gleich hinkommt. Was dann dort liegt, ist gefunden; beim zweiten Fund musst du ' +
      'aussteigen. Räum die Pakete in Stellen, die er nicht mehr oder noch nicht prüft (wo er schon war, ist es sicher). ' +
      'Tippst du im ruhigen Takt (wenn der Ring das Herz trifft), bleibt dein Puls unten; zittrig steigt das Misstrauen, ' +
      'und er schaut noch einmal nach. Der Schein klappt nur bei mittlerem Misstrauen, Gas geben heißt Verfolgungsjagd.',
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
    const found = picks.find((p) => p.startsWith('found:'));
    if (won)
      return found ? '„Gute Fahrt.“ Knapp: Ein Päckchen hat er eingesackt.' : '„Gute Fahrt.“ Er hat nichts gefunden.';
    return '„Aussteigen. Hände aufs Dach.“ Die Ladung fliegt auf.';
  },
});
