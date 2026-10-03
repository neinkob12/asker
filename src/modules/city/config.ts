// Einstellbare Werte der Städte (Auftrag 30). Daten der Städte selbst: data.ts.

import type { Contact } from '../../core';

/** Der Hafenarbeiter aus Hamburg, der nach "Köln komplett" anruft. Name frei erfunden. */
export const HARBOR_CALLER: Contact = {
  id: 'other:hamburg-harbor',
  name: 'Fiete Lührs',
  kind: 'other',
  role: 'Hamburger Hafen',
  about:
    'Vorarbeiter am Burchardkai, seit dreißig Jahren im Hafen. Kennt jeden Zöllner beim Vornamen und jeden Container, der nicht aufgemacht wird.',
  look: {
    feminine: false,
    age: 58,
    skin: 1,
    hair: 'short',
    hairColor: 5,
    beard: 'full',
    glasses: 'none',
    hat: 'skipper',
    top: 'raincoat',
    topColor: 0,
    extra: 'none',
  },
  voice: { pitch: 0.7, rate: 0.88 },
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
  ready: 'Gut. Dann gib Köln ab, am besten gleich. Du hast doch jemanden dafür.',
  /** Nach "ready", mit Namen der Rechten Hand ({name}): was die Übergabe bedeutet. */
  handoverDeal:
    '{name}, hab ich gehört. Köln läuft dann ohne dich: achtzig Prozent vom Tagesgewinn für {name}, der Rest für dich. Und du kannst jederzeit zurück.',
  handoverAsk: 'Also: Übergibst du jetzt und kommst rüber?',
  /** Übergeben und losgefahren. */
  handoverDone: 'Sauber. Fahr über die A1, ich warte am Kai. Und fahr anständig, die blitzen gern hinter Bremen.',
  /** "Ich regel vorher noch was": Die Übergabe geht dann über die Karte unter Geld und Heat. */
  handoverLater: 'Mach. Aber lass mich nicht ewig warten. Wenn du so weit bist, regel die Übergabe und komm.',
  notReady: 'Langsam. Bring erst dein Haus in Ordnung. Ich schreib dir, was mir fehlt.',
  later: 'Überleg es dir. Ich meld mich.',
  stay: 'Schade. Das Angebot steht. Schreib mir, wenn du es dir anders überlegst.',
  reminder: 'Fiete hier. Hamburg wartet nicht ewig. Was ist nun?',
  houseReady: 'Wie ich höre, ist dein Haus jetzt in Ordnung. Ich ruf dich gleich an.',
} as const;

/** Schlafmodus: So viele live gespielte Tage gehen in den Schnitt der Tageszusammenfassung. */
export const SLEEP_AVERAGE_DAYS = 7;

/** Schlafmodus: Das Ergebnis schwankt um den Schnitt, zwischen diesen Faktoren (ctx.random). */
export const SLEEP_FACTOR_MIN = 0.85;
export const SLEEP_FACTOR_MAX = 1.15;

/** Welche Stadt nach der Übergabe einer Stadt an die Rechte Hand frei wird (Auftrag 30: Köln → Hamburg). */
export const NEXT_CITY: Readonly<Record<string, string>> = { koeln: 'hamburg' };

/** Dein Auto auf der A1 (Stadttempo bis zur Autobahn, wie bei der Logistik "du selbst"). */
export const PLAYER_CITY_SPEED = 380;

/** Fiete nach deiner ersten Ankunft in Hamburg (Chat): was zuerst zu tun ist. */
export const WELCOME_TEXTS: Readonly<Record<string, readonly string[]>> = {
  hamburg: [
    'Moin. Da bist du ja. Willkommen an der Elbe.',
    'So fängst du hier an: Erst ein Lager, sonst hast du nichts, wo die Ware hinkommt. Ottensen, St. Georg, ' +
      'Wilhelmsburg, Barmbek oder Harburg, such dir was aus.',
    'Dann ein Spot. Auf dem Kiez ist am meisten los, aber da steht an jeder Tür einer von der Neonkrone. In der Schanze ' +
      'oder in Altona fällst du weniger auf.',
    'Wenn das läuft: Liegeplatz bei uns im Hafen. Zwölftausend, sauber. Dann bestellst du bei Hein Container, ' +
      'kiloweise, direkt an den Kai. Bis dahin liefert dir Toni aus Frankfurt.',
  ],
};
