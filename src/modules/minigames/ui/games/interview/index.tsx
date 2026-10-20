// Bewerbungsgespräch (Auftrag 44, Teil 9; Lügendetektor seit dem Feedback vom 07.10.2026, eigene Fragen und Druck
// seit Auftrag 48): Anmeldung der Ansicht. Spiel in InterviewGame.tsx, Logik als reines Modell (model.ts mit model.test.ts), Fragen und Antworten als
// Daten in recruiting (interview.ts), Zeichen als Overlay (Tells.tsx), Klänge in sounds.ts. Auslöser und Folgen:
// recruiting ('recruiting.interview', Ereignis 'minigame.finished').
// Vorschau: ?minispiel=interview (Läufer mit zwei Eigenschaften), &seed=2 (gerade Seeds: Sicherheit, Level 2, eine
// Eigenschaft schon bekannt), &schwer=0.9 (kurze Zeichen, viele Gesten, schmale Zone, die wandert).

import { personLook, voiceFor } from '../../../../../core';
import { TRAITS, type TraitId, traitName } from '../../../../staff';
import { registerMinigameView } from '../../registry';
import { InterviewGame } from './InterviewGame';
import { ROUNDS } from './model';
import { registerInterviewSounds } from './sounds';
import './interview.css';

registerInterviewSounds();

function previewPerson(seed: number) {
  const even = seed % 2 === 0;
  const name = even ? 'Dragan K.' : 'Nico R.';
  const age = even ? 34 : 22;
  return {
    candidateId: 'preview',
    name,
    age,
    role: even ? 'security' : 'runner',
    roleName: even ? 'Sicherheit' : 'Läufer',
    level: even ? 2 : 1,
    traits: (even ? ['hothead', 'loyal', 'drinker'] : ['drinker', 'charmer']) as TraitId[],
    known: (even ? ['loyal'] : []) as TraitId[],
    voice: voiceFor(`recruit:preview:${seed}`, personLook(name, age)),
  };
}

registerMinigameView('interview', {
  component: InterviewGame,
  layout: 'stage',
  icon: 'message',
  controls: {
    keys: '1 bis 3: Frage wählen. F oder ↑ halten: Blick halten (Druck). Leertaste: Zeichen!',
    touch: 'Frage antippen. Links „Blick halten“ (oder die Person) gedrückt halten, rechts „Zeichen!“ tippen.',
    help:
      'Drei Runden. Du wählst jedes Mal eine von drei Fragen; die Karte sagt, was sie prüft. Während die Person ' +
      'antwortet, steuerst du den Druck: Blick halten lässt den Ring steigen, loslassen sinken. In der hellen Zone ' +
      'ist sie angespannt, und verrät die Antwort etwas, zeigt sie deutlich Zeichen: Blick weg, Schwitzen, Zappeln, ' +
      'Kratzen am Hals, nervöses Grinsen. Tipp dann sofort. Darunter huschen die Zeichen nur vorbei, darüber macht ' +
      'sie zu und bricht ab. Nicken, ein Schluck, Schulterzucken oder Vorbeugen sind harmlos: Tippen ist ein ' +
      'Fehlalarm, zwei verderben die Runde. Genug Zeichen erwischt: Die Eigenschaft kommt in die Akte. Antwortet ' +
      'sie unauffällig, weißt du: nichts von dem, was die Frage prüft. Zwei von drei Runden richtig: Dazu zeigt sich ' +
      'ein Wert, den du vorher nicht sahst.',
  },
  previewParams: (seed) => previewPerson(seed),
  previewSituation: 'Nico R., 22, will als Läufer bei dir anfangen. Drei Fragen, du entscheidest welche.',
  resultText: ({ won, score, picks }, challenge) => {
    const traits = Array.isArray(challenge.params.traits) ? (challenge.params.traits as string[]) : [];
    const known = Array.isArray(challenge.params.known) ? (challenge.params.known as string[]) : [];
    const name = typeof challenge.params.name === 'string' ? challenge.params.name : '';
    const learned = picks.filter((p): p is TraitId => p in TRAITS && traits.includes(p) && !known.includes(p));
    const right = Math.round(score * ROUNDS);
    const what = learned.length > 0 ? ` Erkannt: ${learned.map((t) => traitName(t, name)).join(', ')}.` : '';
    if (won) return `${right} von ${ROUNDS} Runden richtig gelesen.${what} Dazu zeigt sich ein Wert.`;
    return right > 0
      ? `Nur ${right} von ${ROUNDS} Runden richtig gelesen.${what}`
      : 'Nichts herausgefunden. Die Person bleibt ein Rätsel.';
  },
});
