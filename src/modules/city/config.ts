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
 * Untergrenze des Schnitts im Schlaf (Auftrag 40, Etappe 0): plan.md sagt „hin und wieder ein kleines Minus durch eine
 * Razzia, nichts Schlimmes“. Ein Statthalter führt die Stadt sparsam; lief sie live mit Verlust (München als teure Stadt,
 * die letzten Tage nach dem Übernehmen), bucht sie im Schlaf mindestens 0. Ein Minus gibt es nur durch eine Razzia, und
 * die nur bei einem Schnitt über 0 (der Verlust ist ein Anteil davon): Bei einem Schnitt ≤ 0 bucht der Tag 0, ohne Razzia.
 */
export const SLEEP_AVERAGE_FLOOR = 0;

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
 * (30.000 € je Faktor 1, Hamburg 1,5). Keine Obergrenze: Wer mehr verdient, bringt mehr mit. Berlin (Auftrag 37): mit
 * 39.000 € blieb der Bot bei einem Seed über 30 Tage hängen, mit 45.000 € (wie Hamburg) kam er in 6 bis 14 Tagen durch.
 */
export const START_MONEY_MIN_BY_CITY: Readonly<Record<string, number>> = {
  hamburg: 45_000,
  berlin: 45_000,
  muenchen: 60_000,
  frankfurt: 48_000,
};

/**
 * Faktor auf das Mindest-Startgeld nach der Zahl der Städte, die du schon komplett hast (Auftrag 40, Etappe 0; Index =
 * Zahl, darüber der letzte Wert): Wer mit mehr Städten im Rücken ankommt, bringt mehr mit. Die zweite Stadt bleibt bei 1.
 */
export const START_MONEY_FACTOR_BY_CITIES_DONE: readonly number[] = [1, 1, 1.25, 1.5, 1.75];

/**
 * Was im Schlaf nicht in den Schnitt zählt (Auftrag 36 und 40): einmalige Ausgaben für Wachstum. Der Statthalter baut
 * nicht weiter aus und heuert nicht ständig neu an; das Ergebnis einer schlafenden Stadt ist kein Dauerverlust.
 */
export const SLEEP_EXCLUDED_CATEGORIES: readonly ('expansion' | 'hiring')[] = ['expansion', 'hiring'];

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
    'Deine Leute sind nicht mitgekommen, die braucht dein Statthalter. Hier fängst du bei null an: eigene Leute, ' +
      'und bestellen musst du erst mal selbst.',
    'So fängst du hier an: Erst ein Lager, sonst hast du nichts, wo die Ware hinkommt. Ottensen, St. Georg, ' +
      'Wilhelmsburg, Barmbek oder Harburg, such dir was aus.',
    'Dann ein Spot. Auf dem Kiez ist am meisten los, aber da steht an jeder Tür einer von der Neonkrone. In der Schanze ' +
      'oder in Altona fällst du weniger auf.',
    'Wenn das läuft: Liegeplatz bei uns im Hafen. Zwölftausend, sauber. Dann bestellst du bei Daan aus Amsterdam ' +
      'Container, kiloweise, direkt an den Kai. Bis dahin bringt dir Hein kleine Mengen direkt ins Lager.',
  ],
};

/**
 * Die Anrufe der Städte (Auftrag 36). Hamburg: Fietes Gespräch von oben, Berlin: Dilara (Auftrag 37). München und
 * Frankfurt sind noch Schablonen (rufen erst an, wenn ihr Inhalt da ist); ihre Texte stehen schon, damit die Aufträge 37 bis 39 nur noch
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
      'Deine Crew ist zu Hause geblieben, die braucht dein Statthalter. Hier suchst du dir neue Leute, und bis jemand ' +
        'für dich bestellt, machst du das selbst.',
      'Erst ein Lager: Neukölln, Friedrichshain, Lichtenberg, Wedding oder Schöneberg. Mirko liefert dir hin, der ist ' +
        'hier zu Hause.',
      'Dann eine Ecke. Die Clubs machen Freitagabend auf und Montagfrüh zu, dazwischen brennt die Luft. Unter der Woche ' +
        'läuft es an den Bahnhöfen und in den Parks.',
      'Die Bullen sind entspannt. Die Türsteher und die Kotti-Familie nicht. Leg dich nicht mit allen gleichzeitig an.',
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
      'Willkommen in München. Schön, dass Sie da sind.',
      'Ihre Leute bleiben bei Ihrem Statthalter. Hier stellen Sie neu ein, und bestellen müssen Sie zunächst selbst.',
      'Zuerst ein Lager. Teuer, ich weiß: Giesing ist das günstigste, an der Großmarkthalle in Sendling ist am meisten ' +
        'Platz.',
      'Dann eine ruhige Ecke, nicht gleich am Hauptbahnhof. Die Polizei hier sieht Sie vom ersten Tag an als Händler.',
      'Toni aus Frankfurt liefert auch hierher. Und ein Bekannter aus Verona meldet sich bestimmt, beste Ware über den ' +
        'Brenner. Zur Wiesn brauchen Sie volle Lager.',
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
      'Ihre Leute bleiben, wo sie sind. Hier fangen Sie neu an: eigene Leute, eigene Bestellungen.',
      'Ein Lager zuerst, dann die erste Ecke. Im Bahnhofsviertel ist am meisten los, aber da schaut jeder hin.',
    ],
  },
};

// --- Boss von Deutschland und Verkauf (Auftrag 40) ---

/**
 * Verkaufspreis des Geschäfts: so viele Tagesgewinne aller deiner Städte (Schnitt der letzten SALE_AVERAGE_DAYS
 * abgeschlossenen Tage aus der Kasse, das Ergebnis der Städte vor dem Anteil der Statthalter und ohne Ausbau). Die
 * Statthalter zahlen dich damit aus. Begründung und Messung: docs/architektur.md, Abschnitt „Verkauf und Hafen“.
 */
export const SALE_PROFIT_DAYS = 90;
export const SALE_AVERAGE_DAYS = 7;
/** Untergrenze des Verkaufspreises (falls die letzten Tage schlecht liefen, z.B. viele Razzien). */
export const SALE_PRICE_MIN = 1_000_000;
/**
 * Rotterdam (Liegeplatz, Halle, Leute und Kunden von Jansen) kostet diesen Anteil des Verkaufspreises. Mit dem Bot
 * eingestellt (Auftrag 40): Bei drei Vierteln blieb die erste Woche im Hafen so knapp, dass Bestellungen platzten; mit
 * 0,65 bleibt etwa ein Monat Tagesgewinn als Startkapital, genug für die ersten Container, nicht für alle Kunden.
 */
export const ROTTERDAM_SHARE = 0.65;
/** So viele Spielminuten nach „Boss von Deutschland“ ruft Jansen an. */
export const SALE_CALL_DELAY = 6 * 60;
/** „Noch nicht“: So viele Spieltage später meldet er sich wieder. */
export const SALE_REMINDER_DAYS = 3;
/** Der Ort im Ausland, an dem die Hafen-Phase spielt. */
export const HARBOR_CITY = 'rotterdam';

/** Jansens Anruf, Zeile für Zeile ({price} Verkaufspreis, {rotterdam} sein Preis, {rest} was dir bleibt). */
export const SALE_CALL_LINES: readonly string[] = [
  'Jansen hier. Rotterdam. Du kennst mich, ich hab dir Container in den Niehler Hafen geschickt.',
  'Ganz Deutschland, hab ich gehört. Respekt. Das hat vor dir keiner geschafft.',
  'Ich hör auf. Vierzig Jahre Hafen reichen. Mein Liegeplatz, meine Halle, meine Leute, meine Kunden: alles zu haben.',
  'Deine Statthalter wollen dich auszahlen. {price} für alles, was du in Deutschland hast. Sie laufen sowieso allein.',
  'Ich will {rotterdam}. Dann bleiben dir {rest}, und du bist Lieferant für alle. Auch für deine alten Leute.',
  'Kein Spot mehr, keine Läufer. Container, Zoll, Kunden. Großes Geschäft.',
  'Also. Kommst du nach Rotterdam?',
];

export const SALE_TEXTS = {
  summary: 'Anruf aus Rotterdam',
  missed: 'Jansen, Rotterdam. Ich ruf nochmal an. Geh ran, es lohnt sich.',
  gaveUp: 'Mein Angebot steht. Schreib mir, wenn du so weit bist.',
  accept: 'Verkaufen und nach Rotterdam',
  later: 'Noch nicht',
  reminder: 'Jansen hier. Rotterdam wartet. Deine Statthalter auch. {price} für Deutschland, {rotterdam} für mich.',
  laterReply: 'Gut. Überleg es dir. Ich meld mich in ein paar Tagen.',
  done: 'Abgemacht. Fahr rüber, ich zeig dir die Halle. Die ersten Kunden rufen an, sobald du da bist.',
  statthalter:
    'Wir haben gerechnet, {name} und die anderen Statthalter. {price} für alles, bar. Du hast es aufgebaut, wir führen es weiter.',
} as const;
