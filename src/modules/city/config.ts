// Einstellbare Werte der Städte (Auftrag 30). Daten der Städte selbst: data.ts.

import type { Contact } from '../../core';

/** Der Hafenarbeiter aus Hamburg, der nach "Köln komplett" anruft. Name frei erfunden. */
export const HARBOR_CALLER: Contact = {
  id: 'other:hamburg-harbor',
  name: 'Fiete Lührs',
  kind: 'other',
  avatar: '⚓',
};

/** So viele Spielminuten nach "Köln komplett" ruft er an (nicht während einer Konfrontation, sonst danach). */
export const OFFER_CALL_DELAY = 30;

/** "Ich brauch noch Zeit": So viele Spieltage später meldet er sich per Chat. */
export const OFFER_REMINDER_DAYS = 7;

/** Das Gespräch, Zeile für Zeile: hanseatisch knapp, realistisch und düster. */
export const OFFER_LINES: readonly string[] = [
  'Moin. Fiete Lührs, Hamburger Hafen. Wir kennen uns nicht.',
  'Aber ich weiß, wer du bist. Ganz Köln, alle zwölf Veedel. Das spricht sich rum, bis an die Elbe.',
  'Bei uns am Kai läuft was. Container, die keiner aufmacht, wenn man die richtigen Leute kennt.',
  'Ich such jemanden mit Format. Große Mengen. Reiche Kundschaft, an der Elbchaussee und auf dem Kiez.',
  'Mach dir nichts vor: Zoll und Polizei sind hier wacher als bei euch am Rhein.',
  'Und eins noch. Wer führt Köln, wenn du weg bist?',
  'Ohne eine Rechte Hand, die alles im Griff hat, brauchst du gar nicht erst anzufangen.',
  'Also. Was ist?',
];

export const OFFER_TEXTS = {
  summary: 'Anruf aus dem Hamburger Hafen',
  missed: 'Fiete hier, Hamburger Hafen. Ich ruf nochmal an. Geh ran.',
  gaveUp: 'Ich hab dir alles gesagt. Wenn du willst: Du weißt, wo du mich findest.',
  ready: 'Gut. Regel die Übergabe in Köln. Dann sehen wir uns am Kai.',
  notReady: 'Langsam. Bring erst dein Haus in Ordnung. Ich schreib dir, was mir fehlt.',
  later: 'Überleg es dir. Ich meld mich.',
  stay: 'Schade. Das Angebot steht. Schreib mir, wenn du es dir anders überlegst.',
  reminder: 'Fiete hier. Hamburg wartet nicht ewig. Was ist nun?',
  houseReady: 'Wie ich höre, ist dein Haus jetzt in Ordnung. Ich ruf dich gleich an.',
} as const;
