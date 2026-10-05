// Gründe für Lieferprobleme (Auftrag 23) als Daten, pro Weg: Autobahn aus einer Großstadt, Grenze NL, Schiff, lokal.
// Auftrag 39: Luftfracht über den Frankfurter Flughafen. Je mindestens acht Gründe für Verspätungen, vier für Beschlagnahmen und vier für schlechte Ware. Der Text ist ein
// Satzteil, den der Lieferant in seinem Ton einbaut (voices.ts: {reason}); label ist die kurze Form für Liste und
// Journal. Platzhalter: {road} (Autobahn des Kuriers), {city}, {river}, {port}.
// Die Wahrscheinlichkeiten bleiben im Mittel wie vorher (rollShipmentProblem), nur Gründe und Folgen sind vielfältig.

import type { Supplier } from './index';

export type RouteKind = 'road' | 'border' | 'ship' | 'local' | 'air';

export const ROUTE_NAMES: Readonly<Record<RouteKind, string>> = {
  road: 'Autobahn',
  border: 'Grenze NL',
  ship: 'Schiff',
  local: 'In der Stadt',
  air: 'Luftfracht',
};

/** Was der Spieler bei einer Verspätung entscheiden kann. */
export type DelayChoice = 'detour' | 'partial' | 'redirect';

export interface ProblemReason {
  id: string;
  /** Satzteil für die Nachricht, z.B. "Stau auf der {road}, nichts geht mehr". */
  text: string;
  /** Kurz für Liste und Journal, z.B. "Stau auf der {road}". */
  label: string;
  /** Nur bei Verspätungen: welche Entscheidungen hier Sinn ergeben (fehlt: Umweg und Umleiten). */
  choices?: readonly DelayChoice[];
}

export interface RouteReasons {
  delay: readonly ProblemReason[];
  seize: readonly ProblemReason[];
  badQuality: readonly ProblemReason[];
}

export const PROBLEM_REASONS: Readonly<Record<RouteKind, RouteReasons>> = {
  road: {
    delay: [
      { id: 'jam', text: 'Stau auf der {road}, nichts geht mehr', label: 'Stau auf der {road}' },
      { id: 'crash', text: 'Unfall am Kreuz vor {city}, alles dicht', label: 'Unfall am Autobahnkreuz' },
      {
        id: 'breakdown',
        text: 'Panne, der Wagen steht auf dem Standstreifen',
        label: 'Panne',
        choices: ['detour', 'partial', 'redirect'],
      },
      {
        id: 'sick',
        text: 'Der Fahrer ist krank, ein Ersatzmann fährt los',
        label: 'Fahrer krank',
        choices: ['partial', 'redirect'],
      },
      {
        id: 'check',
        text: 'Kontrolle an der Raststätte, der Fahrer muss warten',
        label: 'Kontrolle an der Raststätte',
      },
      { id: 'works', text: 'Baustelle auf der {road}, nur noch eine Spur', label: 'Baustelle auf der {road}' },
      { id: 'fuel', text: 'Zivilstreife an der Tankstelle, der Fahrer wartet ab', label: 'Tankstellen-Kontrolle' },
      { id: 'closure', text: 'Vollsperrung nach einem Lkw-Brand', label: 'Vollsperrung' },
      { id: 'speed', text: 'Blitzer-Marathon, der Fahrer fährt extra brav', label: 'Blitzer-Marathon' },
    ],
    seize: [
      { id: 'dragnet', text: 'Schleierfahndung auf der {road}', label: 'Schleierfahndung' },
      { id: 'civil', text: 'Eine Zivilstreife hat den Wagen rausgewunken', label: 'Zivilstreife' },
      { id: 'dog', text: 'Spürhund auf dem Rastplatz', label: 'Spürhund' },
      { id: 'talk', text: 'Der Fahrer hat sich bei der Kontrolle verplappert', label: 'Fahrer verplappert' },
    ],
    badQuality: [
      { id: 'damp', text: 'Die Ware ist auf der Fahrt feucht geworden', label: 'feucht geworden' },
      { id: 'cut', text: 'Mein Zwischenhändler hat gestreckt', label: 'gestreckt' },
      { id: 'batch', text: 'Jemand hat die falsche Charge eingepackt', label: 'falsche Charge' },
      { id: 'heat', text: 'Die Hitze im Kofferraum hat der Ware nicht gutgetan', label: 'zu warm gelagert' },
    ],
  },
  border: {
    delay: [
      { id: 'venlo', text: 'Grenzkontrolle bei Venlo, Schlange bis zum Horizont', label: 'Grenzkontrolle Venlo' },
      { id: 'elten', text: 'Stau am Übergang Elten', label: 'Stau an der Grenze' },
      { id: 'kaiserberg', text: 'Stau vor dem Kreuz Kaiserberg', label: 'Stau Kreuz Kaiserberg' },
      {
        id: 'switch',
        text: 'Der Fahrer musste in Venlo das Auto wechseln',
        label: 'Autowechsel in Venlo',
        choices: ['partial', 'redirect'],
      },
      { id: 'marechaussee', text: 'Die Marechaussee kontrolliert jeden zweiten Wagen', label: 'Marechaussee' },
      { id: 'crash', text: 'Unfall auf der {road} hinter der Grenze', label: 'Unfall hinter der Grenze' },
      {
        id: 'breakdown',
        text: 'Panne kurz hinter Nijmegen',
        label: 'Panne bei Nijmegen',
        choices: ['detour', 'partial', 'redirect'],
      },
      {
        id: 'dogwait',
        text: 'Zöllner mit Hund auf dem Parkplatz, der Fahrer wartet ab',
        label: 'Zoll auf dem Parkplatz',
      },
    ],
    seize: [
      { id: 'customs', text: 'Der Zoll hat den Wagen an der Grenze auseinandergenommen', label: 'Zoll an der Grenze' },
      { id: 'dog', text: 'Spürhund bei Venlo', label: 'Spürhund bei Venlo' },
      { id: 'dragnet', text: 'Schleierfahndung kurz hinter der Grenze', label: 'Schleierfahndung' },
      { id: 'xray', text: 'Röntgenkontrolle am Übergang', label: 'Röntgen an der Grenze' },
    ],
    badQuality: [
      { id: 'old', text: 'Die Ware lag zu lange im Lager vom Coffeeshop', label: 'zu lange gelagert' },
      { id: 'grower', text: 'Mein Grower hat geschlampt', label: 'schlampig angebaut' },
      { id: 'damp', text: 'Im Versteck unter der Rückbank ist sie feucht geworden', label: 'feucht geworden' },
      { id: 'early', text: 'Zu früh geerntet', label: 'zu früh geerntet' },
    ],
  },
  ship: {
    delay: [
      {
        id: 'lowwater',
        text: 'Niedrigwasser auf dem {river}, das Schiff darf nur halb laden',
        label: 'Niedrigwasser',
        choices: ['partial'],
      },
      { id: 'flood', text: 'Hochwasser auf dem {river}, das Schiff muss warten', label: 'Hochwasser' },
      { id: 'strike', text: 'Hafenstreik in Rotterdam', label: 'Hafenstreik' },
      { id: 'customs', text: 'Der Zoll in Rotterdam prüft jeden zweiten Container', label: 'Zoll in Rotterdam' },
      { id: 'fog', text: 'Nebel auf dem {river}, das Schiff liegt fest', label: 'Nebel' },
      {
        id: 'misloaded',
        text: 'Der Container wurde falsch verladen und steht noch am Terminal',
        label: 'falsch verladen',
        choices: ['partial'],
      },
      { id: 'engine', text: 'Maschinenschaden am Schiff', label: 'Maschinenschaden' },
      { id: 'crane', text: 'Der Containerkran im {port} ist kaputt', label: 'Kran kaputt' },
    ],
    seize: [
      { id: 'xray', text: 'Der Zoll hat den Container geröntgt', label: 'Container geröntgt' },
      { id: 'dogs', text: 'Spürhunde am Terminal', label: 'Spürhunde am Terminal' },
      { id: 'tip', text: 'Jemand hat dem Zoll einen Hinweis gegeben', label: 'Hinweis an den Zoll' },
      { id: 'sample', text: 'Stichprobe am Kai, ausgerechnet unser Container', label: 'Stichprobe' },
    ],
    badQuality: [
      { id: 'damp', text: 'Feuchtigkeit im Container', label: 'Feuchtigkeit' },
      { id: 'reefer', text: 'Der Kühlcontainer ist ausgefallen', label: 'Kühlung ausgefallen' },
      { id: 'long', text: 'Die Ware lag zu lange im Hafen', label: 'zu lange im Hafen' },
      { id: 'pallets', text: 'Die Paletten wurden vertauscht', label: 'Paletten vertauscht' },
    ],
  },
  local: {
    delay: [
      { id: 'works', text: 'Baustelle in der Innenstadt, alles umgeleitet', label: 'Baustelle' },
      { id: 'parade', text: 'Straßensperrung wegen eines Umzugs', label: 'Straßensperrung' },
      { id: 'patrol', text: 'Streife an der Ecke, der Fahrer dreht erst mal eine Runde', label: 'Streife an der Ecke' },
      {
        id: 'flat',
        text: 'Platten am Fahrrad',
        label: 'Platten',
        choices: ['partial', 'redirect'],
      },
      { id: 'rush', text: 'Der Fahrer steckt im Feierabendverkehr', label: 'Feierabendverkehr' },
      { id: 'grandma', text: 'Der Fahrer musste noch schnell zur Oma', label: 'Fahrer privat verhindert' },
      { id: 'parking', text: 'Ewige Parkplatzsuche', label: 'Parkplatzsuche' },
      { id: 'bridge', text: 'Die Brücke ist dicht', label: 'Brücke dicht' },
    ],
    seize: [
      { id: 'light', text: 'Eine Streife hat den Fahrer an der Ampel rausgezogen', label: 'Streife an der Ampel' },
      { id: 'civil', text: 'Zivilbullen standen vor dem Haus', label: 'Zivilbullen' },
      { id: 'bag', text: 'Der Fahrer wurde mit der Tasche erwischt', label: 'mit der Tasche erwischt' },
      { id: 'neighbour', text: 'Ein Nachbar hat die Polizei gerufen', label: 'Nachbar hat angerufen' },
    ],
    badQuality: [
      { id: 'cut', text: 'Mein Kumpel hat gestreckt', label: 'gestreckt' },
      { id: 'cellar', text: 'Zu feucht gelagert im Keller', label: 'feucht gelagert' },
      { id: 'old', text: 'Alte Ware aus dem Versteck', label: 'alte Ware' },
      { id: 'wrong', text: 'Falsches Tütchen erwischt', label: 'falsches Tütchen' },
    ],
  },
  air: {
    delay: [
      { id: 'late', text: 'Die Maschine aus Toronto hat Verspätung', label: 'Flug verspätet' },
      { id: 'fog', text: 'Nebel über dem Rhein-Main-Gebiet, die Maschinen kreisen', label: 'Nebel am Flughafen' },
      { id: 'strike', text: 'Warnstreik beim Bodenpersonal', label: 'Warnstreik' },
      { id: 'shift', text: 'Schichtwechsel beim Zoll, keiner gibt die Fracht frei', label: 'Schichtwechsel beim Zoll' },
      {
        id: 'split',
        text: 'Die Sendung wurde auf zwei Flüge aufgeteilt',
        label: 'auf zwei Flüge verteilt',
        choices: ['partial'],
      },
      { id: 'scanner', text: 'Der Röntgenscanner in der Halle ist ausgefallen', label: 'Scanner ausgefallen' },
      { id: 'night', text: 'Nachtflugverbot, die Maschine landet erst morgens', label: 'Nachtflugverbot' },
      {
        id: 'van',
        text: 'Der Transporter von der Cargo City steht im Stau am Kreuz',
        label: 'Stau am Frankfurter Kreuz',
        choices: ['detour', 'partial', 'redirect'],
      },
    ],
    seize: [
      { id: 'dog', text: 'Spürhund in der Frachthalle', label: 'Spürhund in der Halle' },
      { id: 'xray', text: 'Der Zoll hat das Paket geröntgt', label: 'Paket geröntgt' },
      { id: 'sample', text: 'Stichprobe beim Zoll, ausgerechnet unsere Kiste', label: 'Stichprobe' },
      { id: 'tip', text: 'Jemand am Terminal hat geredet', label: 'Hinweis vom Terminal' },
    ],
    badQuality: [
      { id: 'pressure', text: 'Im Frachtraum war es zu kalt, die Ware ist brüchig', label: 'im Frachtraum gelitten' },
      { id: 'repack', text: 'Beim Umpacken in der Halle ist was durcheinandergekommen', label: 'falsch umgepackt' },
      { id: 'sender', text: 'Der Absender hat die zweite Wahl geschickt', label: 'zweite Wahl' },
      { id: 'wait', text: 'Die Kiste stand zwei Tage im Zolllager', label: 'zu lange im Zolllager' },
    ],
  },
};

/** Fluss pro Stadt für Schiffsgründe. */
const RIVER_BY_CITY: Readonly<Record<string, string>> = { koeln: 'Rhein', hamburg: 'Elbe', frankfurt: 'Main' };

/**
 * Weg eines Lieferanten in eine Stadt, wo er von der Regel abweicht (sonst: Hafen = Schiff, alle anderen Autobahn).
 * Kalle beliefert Köln aus Kalk, Hein Hamburg und Toni Frankfurt aus der Stadt, Daan kommt über die Grenze, Kofi
 * schickt Luftfracht über den Frankfurter Flughafen.
 */
export const SUPPLIER_ROUTES: Readonly<Record<string, Readonly<Record<string, RouteKind>>>> = {
  koeln: { koeln: 'local' },
  hamburg: { hamburg: 'local' },
  frankfurt: { frankfurt: 'local' },
  amsterdam: { koeln: 'border', hamburg: 'border', frankfurt: 'border' },
  flughafen: { frankfurt: 'air' },
};

/** Weg der Lieferung (supplier so, wie er in der Stadt auftritt). */
export function routeKindOf(supplier: Pick<Supplier, 'id' | 'kind'>, cityId: string): RouteKind {
  if (supplier.kind === 'port') return 'ship';
  return SUPPLIER_ROUTES[supplier.id]?.[cityId] ?? 'road';
}

export type ProblemKind = keyof RouteReasons;

/** Grund nachschlagen (unbekannt: der erste der Liste). */
export function findReason(route: RouteKind, kind: ProblemKind, id: string | undefined): ProblemReason {
  const list = PROBLEM_REASONS[route][kind];
  return list.find((r) => r.id === id) ?? list[0];
}

/** Platzhalter eines Grundes. */
export function reasonVars(
  supplier: Pick<Supplier, 'via'>,
  cityId: string,
  cityName: string,
  portName: string,
): Record<string, string> {
  return {
    road: supplier.via?.[cityId] ?? 'Autobahn',
    city: cityName,
    river: RIVER_BY_CITY[cityId] ?? 'Rhein',
    port: portName,
  };
}
