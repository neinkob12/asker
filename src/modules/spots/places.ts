// Wie man sagt, wo etwas passiert (J4): „am Ebertplatz“, „an der Uni-Wiese“, „an den Landungsbrücken“, „auf der
// Theresienwiese“, „in der Kneipe Neusser Straße“. Vorher stand überall fest „am“ vor dem Namen.
//
// Reihenfolge: eigene Wendung des Spots (Feld `at`, für Namen, die keine Regel trifft), dann Namen, die schon mit einer
// Präposition anfangen („Am Weiher“), dann das erste Wort, wenn es ein Lokal oder eine Art Ort ist („Kneipe …“,
// „Club …“, „Ecke …“), dann die Endung des letzten Worts (Straße, Wiese, Brücken …), sonst „am“.
// Rein, ohne Zufall: Es ändert keine Würfelfolge und keinen Spielstand.

/** Was ein Spot dafür braucht. */
export interface SpotPlace {
  name: string;
  /** Eigene Wendung, z.B. „auf dem Tempelhofer Feld“ (geht vor allen Regeln). */
  at?: string;
}

/** Namen, die mit einer Präposition anfangen: „Am Weiher“ → „am Weiher“. */
const LEADING_PREPOSITION = /^(Am|An der|An den|Auf der|Auf dem|Im|In der|Unter den|Vor dem) /;

/** Erstes Wort eines Namens, das sagt, was für ein Ort es ist (auch die Arten eigener Spots, siehe kinds.ts). */
const VENUE_WORDS: Readonly<Record<string, string>> = {
  kneipe: 'in der',
  bar: 'in der',
  'kiez-bar': 'in der',
  halle: 'in der',
  apfelweinwirtschaft: 'in der',
  club: 'im',
  biergarten: 'im',
  wettbüro: 'im',
  'späti-hinterzimmer': 'im',
  park: 'im',
  ecke: 'an der',
};

/** Endungen des letzten Worts: Mehrzahl, Wiesen (auf der), weibliche Wörter (an der), Städte (in der). */
const ENDINGS: readonly (readonly [RegExp, string])[] = [
  [/brücken$/, 'an den'],
  [/(wiese|platte)$/, 'auf der'],
  [/stadt$/, 'in der'],
  [
    /(straße|strasse|allee|gasse|chaussee|promenade|warte|wache|halle|plaza|freiheit|reihe|brauerei|post|messe|bahn|insel|kirche|mühle|brücke|meile|zeile|terrasse|passage|galerie|arena|bühne|schule|siedlung|kaserne)$/,
    'an der',
  ],
];

/** „am Ebertplatz“, „an der Uni-Wiese“ …: wo etwas an diesem Spot passiert (mitten im Satz). */
export function atSpot(spot: SpotPlace): string {
  if (spot.at) return spot.at;
  const name = spot.name.trim();
  const leading = LEADING_PREPOSITION.exec(name);
  if (leading) return name.charAt(0).toLowerCase() + name.slice(1);
  const words = name.split(/\s+/);
  const venue = VENUE_WORDS[words[0].toLowerCase()];
  if (venue && words.length > 1) return `${venue} ${name}`;
  const last = (
    name
      .replace(/\s*\(.*\)\s*$/, '')
      .split(/\s+/)
      .pop() ?? name
  ).toLowerCase();
  for (const [ending, preposition] of ENDINGS) if (ending.test(last)) return `${preposition} ${name}`;
  return `am ${name}`;
}

/** Wie atSpot, aber am Satzanfang: „An der Uni-Wiese …“. */
export function atSpotStart(spot: SpotPlace): string {
  const text = atSpot(spot);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Platzhalter für Texte mit Spot (texts.pick): {spot} der Name, {atSpot} mitten im Satz („Meine Jungs stehen jetzt
 * {atSpot}.“), {AtSpot} am Satzanfang. Nie „am {spot}“ in eine Vorlage schreiben.
 */
export function spotVars(spot: SpotPlace): { spot: string; atSpot: string; AtSpot: string } {
  return { spot: spot.name, atSpot: atSpot(spot), AtSpot: atSpotStart(spot) };
}
