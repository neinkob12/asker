// Verkehrskontrolle (Feedback vom 07.10.2026): Was der Beamte sagt, als reine Daten. Keine Fragen mit Antworten mehr:
// Er kündigt an, wo er hinleuchtet, kommentiert Funde, deine Nerven, den Schein und das Ende.

import type { ZoneId } from './model';

export const OFFICER_LINES = {
  greetDay: ['Guten Tag. Allgemeine Verkehrskontrolle, bleiben Sie bitte sitzen.'],
  greetNight: ['Guten Abend. Allgemeine Verkehrskontrolle, bleiben Sie bitte sitzen.'],
  walk: ['Moment.', 'Bleiben Sie sitzen.', 'Einen Augenblick.'],
  found: ['Was haben wir denn da?', 'Na, sieh mal einer an.', 'Das gehört Ihnen, ja?'],
  fail: ['Aussteigen. Hände aufs Dach.'],
  nervous: ['Alles in Ordnung bei Ihnen? Sie schwitzen.', 'Warum so nervös?'],
  pass: ['Gute Fahrt.', 'In Ordnung. Fahren Sie vorsichtig.'],
  bribeOk: ['Ich hab nichts gesehen. Gute Fahrt.'],
  bribeLow: ['Was soll das denn? Stecken Sie das weg.'],
  bribeHigh: ['Bestechung auch noch? Jetzt reicht es.'],
  flee: ['Hey! Stehen bleiben!'],
} as const;

export type OfficerLine = keyof typeof OFFICER_LINES;

/** Was er sagt, wenn er in eine Stelle leuchtet bzw. sie aufmachen lässt. */
export const LOOK_LINES: Record<ZoneId, readonly string[]> = {
  seat: ['Was liegt da auf dem Sitz?', 'Mal sehen, was vorne so rumliegt.'],
  floor: ['Fußraum hinten.', 'Und da unten?'],
  bench: ['Was ist hinten auf der Bank?', 'Rückbank.'],
  glovebox: ['Handschuhfach bitte.', 'Machen Sie mal das Handschuhfach auf.'],
  console: ['Die Konsole bitte aufmachen.', 'Was ist in der Mittelkonsole?'],
  underDriver: ['Rücken Sie mal den Sitz vor.', 'Unter dem Sitz, bitte.'],
  doorL: ['Und in der Tür?', 'Türfach.'],
  doorR: ['Die Beifahrertür auch.', 'Was ist in dem Türfach?'],
  trunk: ['Kofferraum, bitte.', 'Machen Sie mal hinten auf.'],
  spare: ['Und die Mulde unter der Matte.', 'Reserverad raus, bitte.'],
};
