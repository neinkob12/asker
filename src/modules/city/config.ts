// Einstellbare Werte der Städte (Auftrag 30 und 36). Daten der Städte selbst: data.ts.

import type { Contact } from '../../core';

/** Der Hafenarbeiter aus Hamburg, der nach "<Stadt> komplett" anruft. Name frei erfunden. */
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
    face: 'square',
    brows: 'heavy',
    eyes: 'heavy',
    mouth: 'hard',
    extra: 'none',
  },
  voice: { pitch: 0.7, rate: 0.88 },
};

/**
 * So viele Spielminuten nach "<Stadt> komplett" ruft die nächstgelegene freie Stadt an (nicht während einer
 * Konfrontation, sonst danach).
 */
export const OFFER_CALL_DELAY = 30;

/**
 * Die übrigen freien Städte melden sich danach der Reihe nach per Chat (Auftrag 36), je so viele Spielminuten nach der
 * vorigen. Ein Tipp auf ihre Karte in der Deutschland-Ansicht (oder "Ruf mich an" im Chat) holt den Anruf sofort.
 */
export const OFFER_NEXT_DELAY = 6 * 60;

/** "Ich brauch noch Zeit": So viele Spieltage später meldet er sich per Chat. */
export const OFFER_REMINDER_DAYS = 7;

/**
 * Wie man über eine Stadt redet ("bei euch am Rhein"): für die Platzhalter {fromPlace} und {place} in den Texten.
 * Fehlt eine Stadt, steht "in <Stadt>".
 */
export const CITY_PLACE: Readonly<Record<string, string>> = {
  koeln: 'am Rhein',
  hamburg: 'an der Elbe',
  berlin: 'an der Spree',
  muenchen: 'an der Isar',
  frankfurt: 'am Main',
};

/** Was eine Stadt im Anruf und im Chat sagt. Platzhalter: {from} (die Stadt, die du komplett hast), {fromPlace},
 * {name} (Rechte Hand), {share} (ihr Anteil), {road} (Autobahn dorthin). */
export interface OfferTexts {
  summary: string;
  missed: string;
  gaveUp: string;
  ready: string;
  /** Nach "ready", mit Namen der Rechten Hand ({name}) und ihrem Anteil ({share}): was die Übergabe bedeutet. */
  handoverDeal: string;
  handoverAsk: string;
  /** Übergeben und losgefahren. */
  handoverDone: string;
  /** "Ich regel vorher noch was": Die Übergabe geht dann über die Karte unter Geld und Heat. */
  handoverLater: string;
  notReady: string;
  later: string;
  stay: string;
  reminder: string;
  houseReady: string;
  /** Wenn sich die Stadt erst per Chat meldet (nicht als erste): ein Satz, danach "Ruf mich an". */
  pitch: string;
}

export interface CityOffer {
  /** Das Gespräch, Zeile für Zeile. */
  lines: readonly string[];
  texts: OfferTexts;
  /** Antwort "Ich komme" im Anruf. */
  come: string;
  /** Nach der ersten Ankunft (Chat): was zuerst zu tun ist. */
  welcome: readonly string[];
}

/** Das Gespräch, Zeile für Zeile: hanseatisch knapp, realistisch und düster. */
export const OFFER_LINES: readonly string[] = [
  'Moin. Fiete Lührs, Hamburger Hafen. Wir kennen uns nicht.',
  'Aber ich weiß, wer du bist. Ganz {from}, alle zwölf Veedel. Das spricht sich rum, bis an die Elbe.',
  'Bei uns am Kai läuft was. Container, die keiner aufmacht, wenn man die richtigen Leute kennt.',
  'Ich such jemanden mit Format. Große Mengen. Reiche Kundschaft, an der Elbchaussee und auf dem Kiez.',
  'Mach dir nichts vor: Zoll und Polizei sind hier wacher als bei euch {fromPlace}.',
  'Und eins noch. Wer führt {from}, wenn du weg bist?',
  'Ohne eine Rechte Hand, die alles im Griff hat, brauchst du gar nicht erst anzufangen.',
  'Also. Was ist?',
];

export const OFFER_TEXTS: OfferTexts = {
  summary: 'Anruf aus dem Hamburger Hafen',
  missed: 'Fiete hier, Hamburger Hafen. Ich ruf nochmal an. Geh ran.',
  gaveUp: 'Ich hab dir alles gesagt. Wenn du willst: Du weißt, wo du mich findest.',
  ready: 'Gut. Dann gib {from} ab, am besten gleich. Du hast doch jemanden dafür.',
  handoverDeal:
    '{name}, hab ich gehört. {from} läuft dann ohne dich: {share} vom Tagesgewinn für {name}, der Rest für dich. Und du kannst jederzeit zurück.',
  handoverAsk: 'Also: Übergibst du jetzt und kommst rüber?',
  handoverDone:
    'Sauber. Fahr über die {road}, ich warte am Kai. Und fahr anständig, die blitzen gern auf der Autobahn.',
  handoverLater: 'Mach. Aber lass mich nicht ewig warten. Wenn du so weit bist, regel die Übergabe und komm.',
  notReady: 'Langsam. Bring erst dein Haus in Ordnung. Ich schreib dir, was mir fehlt.',
  later: 'Überleg es dir. Ich meld mich.',
  stay: 'Schade. Das Angebot steht. Schreib mir, wenn du es dir anders überlegst.',
  reminder: 'Fiete hier. Hamburg wartet nicht ewig. Was ist nun?',
  houseReady: 'Wie ich höre, ist dein Haus jetzt in Ordnung. Ich ruf dich gleich an.',
  pitch:
    'Moin. Fiete Lührs, Hamburger Hafen. Bei uns am Kai läuft was, Container kiloweise. Wenn du reden willst, ruf ich dich an.',
};

/** Schlafmodus: So viele live gespielte Tage gehen in den Schnitt der Tageszusammenfassung. */
export const SLEEP_AVERAGE_DAYS = 7;

/** Schlafmodus: Das Ergebnis schwankt um den Schnitt, zwischen diesen Faktoren (ctx.random). */
export const SLEEP_FACTOR_MIN = 0.85;
export const SLEEP_FACTOR_MAX = 1.15;

/**
 * Startgeld (Auftrag 36): Bei der Übergabe gibt dir der Statthalter so viele Tagesgewinne der Stadt mit (Schnitt der
 * letzten live gespielten Tage, wie im Schlaf), als Umbuchung aus der Kasse der Stadt, nicht als Gewinn (sein Anteil
 * bleibt davon unberührt). Stellschraube für das Tempo der späteren Städte, zusammen mit FULL_POWER_SHARE
 * (hierarchy/config.ts) und dem Startpaket.
 */
export const HANDOVER_START_MONEY_DAYS = 10;

/**
 * Mindest-Startgeld pro Zielstadt (Planungs-Session nach dem Review): Unter etwa 40.000 € blieb der Bot in Hamburg
 * hängen, mit 45.000 € kam er in 13 bis 17 Tagen durch. Für die weiteren Städte nach ihrem propertyFactor skaliert
 * (30.000 € je Faktor 1, Hamburg 1,5). Keine Obergrenze: Wer mehr verdient, bringt mehr mit.
 */
export const START_MONEY_MIN_BY_CITY: Readonly<Record<string, number>> = {
  hamburg: 45_000,
  berlin: 39_000,
  muenchen: 54_000,
  frankfurt: 48_000,
};

/**
 * Boss von Deutschland erst mit so vielen kompletten Städten (plan.md: alle spielbaren, Frankfurt optional, also
 * mindestens vier). Solange weniger Städte spielbar sind, gibt es den Rang nicht.
 */
export const GERMANY_MIN_CITIES = 4;

/**
 * Razzia im Schlaf (Auftrag 36): An so vielen von 100 Tagen trifft es eine schlafende Stadt. Das Tagesergebnis halbiert
 * sich (SLEEP_RAID_HALF_CHANCE) oder wird leicht negativ (ein Anteil SLEEP_RAID_LOSS_MIN bis _MAX vom Schnitt), der
 * Statthalter schreibt eine Zeile. Keine Veedel gehen verloren, niemand ruft dich zurück.
 */
export const SLEEP_RAID_CHANCE = 0.03;
export const SLEEP_RAID_HALF_CHANCE = 0.6;
export const SLEEP_RAID_LOSS_MIN = 0.1;
export const SLEEP_RAID_LOSS_MAX = 0.3;

/** Was der Statthalter nach einer Razzia im Schlaf schreibt ({city}, {amount}). */
export const SLEEP_RAID_TEXTS = {
  half: [
    'Bericht aus {city}: Razzia heute, zwei Spots dicht bis Mittag. Halber Tag, {amount} für uns. Alles im Griff.',
    'Bericht aus {city}: Die Bullen waren da, wir haben einen Teil der Ware verloren. Nur {amount} heute. Läuft wieder.',
  ],
  loss: [
    'Bericht aus {city}: Razzia im Lager. Ware weg, Anwalt bezahlt, unterm Strich {amount} minus. Keiner sitzt.',
    'Bericht aus {city}: Großer Einsatz heute, alles stand still. {amount} minus. Morgen läuft es wieder.',
  ],
} as const;

/**
 * Die Städte nach Köln (Auftrag 36: Reihenfolge frei). Nach "<Stadt> komplett" melden sich die noch freien davon,
 * die nächstgelegene zuerst. Schablonen (template in CITIES) bleiben gesperrt und erscheinen als „bald“.
 */
export const NEXT_CITY: readonly string[] = ['hamburg', 'berlin', 'muenchen', 'frankfurt'];

/** Dein Auto auf der Autobahn (Stadttempo bis zur Autobahn, wie bei der Logistik "du selbst"). */
export const PLAYER_CITY_SPEED = 380;

/** Der Kontakt einer Stadt nach deiner ersten Ankunft (Chat): was zuerst zu tun ist. */
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

/**
 * Die Anrufe der Städte (Auftrag 36). Hamburg: Fietes Gespräch von oben. Berlin, München und Frankfurt sind noch
 * Schablonen (rufen erst an, wenn ihr Inhalt da ist); ihre Texte stehen schon, damit die Aufträge 37 bis 39 nur noch
 * Daten liefern.
 */
export const CITY_OFFERS: Readonly<Record<string, CityOffer>> = {
  hamburg: { lines: OFFER_LINES, texts: OFFER_TEXTS, come: 'Ich komme nach Hamburg', welcome: WELCOME_TEXTS.hamburg },
  berlin: {
    lines: [
      'Hey. Dilara hier, ich mach Türen in Friedrichshain. Du kennst mich nicht.',
      'Aber die Leute reden. Ganz {from}, jedes Viertel. Das kommt bis an die Spree.',
      'Hier hört die Nacht nicht auf. Freitag bis Montag früh, und alle wollen was.',
      'Es gibt mehr Ecken, als du Leute hast. Und mehr Gangs, als dir lieb ist.',
      'Die Bullen sind entspannt. Die Gangs nicht.',
      'Und: Wer macht {from}, wenn du hier bist?',
      'Ohne jemanden, der das allein kann, fang gar nicht erst an.',
      'Also. Bock?',
    ],
    texts: {
      summary: 'Anruf aus einem Berliner Club',
      missed: 'Dilara, Berlin. Ich ruf nochmal an.',
      gaveUp: 'Okay. Du weißt, wo die Nacht ist.',
      ready: 'Gut. Dann gib {from} ab, und zwar bald.',
      handoverDeal:
        '{name} also. {from} läuft ohne dich: {share} vom Tagesgewinn für {name}, der Rest für dich. Zurück kannst du immer.',
      handoverAsk: 'Übergibst du jetzt und kommst?',
      handoverDone: 'Nice. Komm über die Autobahn, ich stell dich an der Tür vor.',
      handoverLater: 'Klar. Aber die Nacht wartet nicht ewig.',
      notReady: 'Nee, so nicht. Erst dein Laden in {from}. Ich schreib dir, was fehlt.',
      later: 'Denk drüber nach. Ich meld mich.',
      stay: 'Schade. Wenn du es dir anders überlegst: Schreib.',
      reminder: 'Dilara hier. Berlin wartet. Und?',
      houseReady: 'Hab gehört, dein Laden läuft. Ich ruf gleich an.',
      pitch: 'Dilara, Clubs in Friedrichshain. In Berlin hört die Nacht nicht auf. Wenn du reden willst, ruf ich an.',
    },
    come: 'Ich komme nach Berlin',
    welcome: [
      'Da bist du. Willkommen in Berlin.',
      'Erst ein Lager, dann eine Ecke. Am Wochenende brennt hier die Luft, plan das ein.',
    ],
  },
  muenchen: {
    lines: [
      'Grüß Gott. Leitner, Immobilien in Schwabing. Wir kennen uns nicht.',
      'Aber man hört von Ihnen. Ganz {from}. Respekt.',
      'Meine Kunden fragen nicht nach dem Preis. Sie fragen nach Qualität und Ruhe.',
      'Lager und Personal sind hier teuer. Dafür zahlt die Kundschaft auch.',
      'Und die Polizei ist nicht wie {fromPlace}. Hier wird hingeschaut.',
      'Wer führt {from}, wenn Sie hier sind?',
      'Ohne eine Rechte Hand, die das allein kann, brauchen Sie gar nicht kommen.',
      'Also. Interesse?',
    ],
    texts: {
      summary: 'Anruf aus München',
      missed: 'Leitner, München. Ich versuche es später noch einmal.',
      gaveUp: 'Gut. Sie wissen, wo Sie mich finden.',
      ready: 'Schön. Dann übergeben Sie {from}, am besten gleich.',
      handoverDeal:
        '{name}, sagt man mir. {from} läuft dann ohne Sie: {share} vom Tagesgewinn für {name}, der Rest für Sie. Zurück können Sie jederzeit.',
      handoverAsk: 'Übergeben Sie jetzt und kommen?',
      handoverDone: 'Wunderbar. Nehmen Sie die Autobahn, ich erwarte Sie in Schwabing.',
      handoverLater: 'Natürlich. Aber lassen Sie mich nicht zu lange warten.',
      notReady: 'Nicht so schnell. Erst {from} in Ordnung bringen. Ich schreibe Ihnen, was fehlt.',
      later: 'Überlegen Sie es sich. Ich melde mich.',
      stay: 'Schade. Das Angebot steht.',
      reminder: 'Leitner hier. München wartet nicht ewig.',
      houseReady: 'Wie ich höre, ist alles in Ordnung. Ich rufe gleich an.',
      pitch: 'Leitner, Immobilien in Schwabing. Meine Kunden zahlen jeden Preis. Wenn Sie reden wollen, rufe ich an.',
    },
    come: 'Ich komme nach München',
    welcome: [
      'Willkommen in München.',
      'Ein Lager zuerst. Teuer, ich weiß. Dann eine ruhige Ecke, nicht gleich am Hauptbahnhof.',
    ],
  },
  frankfurt: {
    lines: [
      'Hallo. Okafor, Fracht am Flughafen. Wir kennen uns nicht.',
      'Aber ich lese die Zahlen. Ganz {from}, das ist ordentlich.',
      'Hier landet jeden Tag mehr, als der Zoll aufmachen kann. Klein, schnell, teuer.',
      'Die Kunden sitzen in Bankentürmen. Und im Bahnhofsviertel die anderen.',
      'Der Zoll hier ist scharf. Schärfer als {fromPlace}.',
      'Wer macht {from}, wenn Sie hier sind?',
      'Ohne jemanden, der das allein führt, rechnet sich das nicht.',
      'Also?',
    ],
    texts: {
      summary: 'Anruf vom Frankfurter Flughafen',
      missed: 'Okafor, Frankfurt. Ich rufe wieder an.',
      gaveUp: 'In Ordnung. Sie wissen, wo ich bin.',
      ready: 'Gut. Dann übergeben Sie {from}, möglichst gleich.',
      handoverDeal:
        '{name}, nehme ich an. {from} läuft ohne Sie: {share} vom Tagesgewinn für {name}, der Rest für Sie. Zurück geht immer.',
      handoverAsk: 'Übergeben Sie jetzt und kommen?',
      handoverDone: 'Gut. Nehmen Sie die Autobahn, wir sehen uns am Main.',
      handoverLater: 'Verstanden. Aber Fracht wartet nicht.',
      notReady: 'Noch nicht. Erst {from}. Ich schreibe Ihnen, was fehlt.',
      later: 'Überlegen Sie es sich. Ich melde mich.',
      stay: 'Schade. Das Angebot gilt.',
      reminder: 'Okafor hier. Frankfurt wartet nicht ewig.',
      houseReady: 'Alles in Ordnung, höre ich. Ich rufe gleich an.',
      pitch:
        'Okafor, Fracht am Flughafen. Hier landet mehr, als der Zoll aufmachen kann. Wenn Sie reden wollen, rufe ich an.',
    },
    come: 'Ich komme nach Frankfurt',
    welcome: [
      'Willkommen in Frankfurt.',
      'Ein Lager zuerst, dann die erste Ecke. Im Bahnhofsviertel ist am meisten los, aber da schaut jeder hin.',
    ],
  },
};
