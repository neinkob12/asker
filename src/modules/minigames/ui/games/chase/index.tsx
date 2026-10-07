// Verfolgungsjagd (Auftrag 44, Teil 1; neu nach dem Feedback vom 07.10.2026 als Arcade-Rennspiel von hinten):
// Anmeldung der Ansicht. Spiel in ChaseGame.tsx, Logik als reines Modell (model.ts mit model.test.ts), Zeichnen im
// Canvas (draw.ts), Funk in radio.ts, Ton in sounds.ts. Eigene Bühne (layout 'stage'): Die Karte bleibt unberührt.

import { startEncounter } from '../../../../encounters';
import { getSpots } from '../../../../spots';
import { getVeedel } from '../../../../veedel';
import { registerMinigameView } from '../../registry';
import { ChaseGame } from './ChaseGame';
import { registerChaseSounds } from './sounds';
import './chase.css';

registerChaseSounds();

registerMinigameView('chase', {
  component: ChaseGame,
  layout: 'stage',
  icon: 'siren',
  controls: {
    keys: '←/→ Spur wechseln, ↑ Vollgas, ↓ oder Leertaste bremsen, Umschalt Turbo, X Ware raus.',
    touch: 'Pfeile oder Wischen wechseln die Spur, Gas und Bremse halten, Turbo tippen.',
    help:
      'Drei Spuren, dichter Verkehr, die Streifen im Rückspiegel. Weich dem Verkehr aus: Auffahren kostet Tempo und ' +
      'Schaden, dann holen sie auf und rammen dich. Der Balken „Abhängen“ füllt sich, solange die nächste Streife weit ' +
      'hinter dir liegt, und leert sich, wenn sie dir im Nacken sitzt. Voll: Du biegst in die Tiefgarage ab. ' +
      'Straßensperren lassen eine Spur frei. Der Turbo lädt langsam nach. Ware aus dem Fenster: Turbo voll, die ' +
      'Streifen zögern, die Ware ist weg. Gefasst, wenn die Karre kaputt ist, sie dich stellen oder die Zeit abläuft.',
  },
  previewParams: (seed) => ({
    clock: 4,
    phase: seed % 3 === 0 ? 'night' : seed % 3 === 1 ? 'dusk' : 'day',
    weather: seed % 4 === 2 ? 'rain' : 'clear',
    stakes: { ids: ['goods', 'people'], money: 0, goods: 120 },
  }),
  previewSituation: 'Kontrolle am Spot. Du springst in die Karre, die Streife hängt dir schon im Nacken.',
  resultText: ({ won, picks }, challenge) => {
    const dumped = picks.includes('dumped') ? ' Die Ware liegt auf der Straße.' : '';
    if (won) {
      const check = challenge.params.encounterKind === 'vehicleCheck' ? ' Die Ladung ist durch.' : '';
      return `Abgehängt. Rein in die Tiefgarage, Motor aus. Die Sirenen fahren vorbei.${check}${dumped}`;
    }
    const how = picks.includes('time')
      ? 'Zu lange gebraucht: Die Verstärkung hat dich eingekreist.'
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
