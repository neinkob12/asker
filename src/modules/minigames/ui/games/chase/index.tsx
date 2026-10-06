// Verfolgungsjagd (Auftrag 44, Teil 1): Anmeldung der Ansicht. Spiel in ChaseGame.tsx, Logik als reines Modell
// (model.ts und net.ts mit model.test.ts), Darstellung in scene.ts (WebGL-Ebene) und draw.ts, Ton in sounds.ts.

import { startEncounter } from '../../../../encounters';
import { getSpots } from '../../../../spots';
import { getVeedel } from '../../../../veedel';
import { registerMinigameView } from '../../registry';
import { ChaseGame } from './ChaseGame';
import { registerChaseSounds } from './sounds';
import './map';
import './chase.css';

registerChaseSounds();

registerMinigameView('chase', {
  component: ChaseGame,
  layout: 'map',
  icon: 'siren',
  controls: {
    keys: '←/→ Abbiegung wählen, ↑ Vollgas, ↓ oder Leertaste bremsen, Umschalt Turbo, X Ware raus.',
    touch: 'Pfeile oder Wischen wählen die Abbiegung, Gas gibt der Wagen selbst. Bremse halten, Turbo halten.',
    help:
      'Du fährst auf echten Straßen: Die Abbiegung wählst du vor der Kreuzung, die Skizze unten zeigt, wohin es geht. ' +
      'Zu schnell in die Kurve, und der Wagen rutscht. Im Stand die Bremse halten: wenden. ' +
      'Um die Ecke biegen bricht den Sichtkontakt. Ohne Sichtkontakt füllt sich der Ring, nach 8 Sekunden bist du weg. ' +
      'Im Versteck (goldener Ring, Pfeil am Rand) geht es sofort, wenn dich keiner sieht. ' +
      'Später kommen Straßensperren und ein Hubschrauber mit Scheinwerfer. Ware aus dem Fenster: kurz schneller, ' +
      'die Streifen zögern, die Ware ist weg.',
  },
  previewParams: () => ({ clock: 4, stakes: { ids: ['goods', 'people'], money: 0, goods: 120 } }),
  previewSituation: 'Kontrolle am Spot. Du springst in den Wagen, die Streife ist direkt hinter dir.',
  resultText: ({ won, picks }, challenge) => {
    const dumped = picks.includes('dumped') ? ' Die Ware liegt auf der Straße.' : '';
    if (won) {
      const how = picks.includes('hideout') ? 'Rein ins Versteck, Motor aus. Die Sirenen fahren vorbei.' : 'Abgehängt.';
      const check = challenge.params.encounterKind === 'vehicleCheck' ? ' Die Ladung ist durch.' : '';
      return `${how}${check}${dumped}`;
    }
    const how = picks.includes('time')
      ? 'Zu lange gebraucht: Sie haben dich eingekreist.'
      : 'Blaulicht von allen Seiten. Gefasst.';
    return `${how}${dumped}`;
  },
});

// Nur im Dev-Build: den echten Weg auslösen (Konsole oder Playwright), z.B. window.koeln.dev.verfolgung():
// Kontrolle am ersten Spot, du selbst dabei, die Polizeiflucht startet die Verfolgungsjagd. verkehrskontrolle(): Du
// fährst selbst, „Gas geben“ in der Akte startet die Jagd.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const sim = () => {
    const current = window.koeln?.session.sim;
    if (!current) throw new Error('Kein Spiel geladen.');
    return current;
  };
  const dev = {
    verfolgung: () => {
      const s = sim();
      const spot = getSpots(s.state)[0];
      if (!spot) return;
      startEncounter(s.ctx('police'), {
        kind: 'policeChase',
        veedelId: spot.veedelId,
        spotId: spot.id,
        playerPresent: true,
        opponent: { label: 'Polizei', strength: getVeedel(spot.veedelId)?.policePresence ?? 1 },
        origin: { module: 'police', ref: 'check' },
      });
      s.step();
    },
    verkehrskontrolle: () => {
      const s = sim();
      const spot = getSpots(s.state)[0];
      if (!spot) return;
      startEncounter(s.ctx('logistics'), {
        kind: 'vehicleCheck',
        veedelId: spot.veedelId,
        playerPresent: true,
        origin: { module: 'dev', ref: 'kontrolle' },
      });
      s.step();
    },
  };
  const holder = window as unknown as { koeln?: { dev?: Record<string, () => void> } };
  holder.koeln = { ...holder.koeln, dev: { ...holder.koeln?.dev, ...dev } };
}
