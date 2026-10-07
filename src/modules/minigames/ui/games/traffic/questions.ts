// Verkehrskontrolle (Auftrag 44, Teil 4): Fragen des Beamten und Antworten als reine Daten. Jede Antwort hat ein
// Grund-Misstrauen (sus, 0 bis 1) und, wo es später zählt, eine Behauptung (claim): Fragt der Beamte noch einmal nach
// („Wo kamen Sie nochmal her?“), muss dieselbe Behauptung kommen. fits verbindet Behauptungen über Fragen hinweg (Vom
// Großmarkt kommen und Gemüse geladen haben passt, Umzugskartons nicht). Neue Fragen sind nur Daten.

export type Topic = 'origin' | 'destination' | 'cargo' | 'drink' | 'papers' | 'vehicle' | 'nervous';

/** Wie die Antwort klingt: ruhig, ausweichend (etwas verdächtig) oder frech (sehr verdächtig). */
export type Tone = 'calm' | 'evasive' | 'rude';

export interface AnswerDef {
  id: string;
  text: string;
  /** Misstrauen, das die Antwort allein bringt (vor Puls und Zusammenhang). */
  sus: number;
  tone: Tone;
  /** Behauptung, die der Beamte sich merkt (für Rückfragen und den Blick in den Laderaum). */
  claim?: string;
  /** Passt zu diesen Behauptungen bei einer anderen Frage (sonst ist es ein kleiner Widerspruch). */
  fits?: { topic: Topic; claims: readonly string[] };
}

export interface QuestionDef {
  id: string;
  topic: Topic;
  /** {gruss} wird je nach Tageszeit „Guten Tag“ bzw. „Guten Abend“. */
  text: string;
  answers: readonly AnswerDef[];
  /** Kann der Beamte das später noch einmal fragen? Text der Rückfrage. */
  recheck?: string;
  /** Kommt immer (Woher, Was ist hinten drin). */
  always?: boolean;
  /** Kommt nur, wenn der Puls hoch ist (der Beamte sieht dich schwitzen), dann als nächste Frage. */
  whenNervous?: boolean;
}

export const QUESTIONS: readonly QuestionDef[] = [
  {
    id: 'origin',
    topic: 'origin',
    always: true,
    text: '{gruss}. Allgemeine Verkehrskontrolle. Wo kommen Sie gerade her?',
    recheck: 'Wo kamen Sie nochmal her?',
    answers: [
      { id: 'work', text: 'Von der Arbeit. Spätschicht.', sus: 0.03, tone: 'calm', claim: 'work' },
      { id: 'friend', text: 'Hab einem Kumpel beim Umzug geholfen.', sus: 0.04, tone: 'calm', claim: 'move' },
      { id: 'market', text: 'Vom Großmarkt, Ware abholen.', sus: 0.05, tone: 'calm', claim: 'market' },
      { id: 'why', text: 'Warum wollen Sie das wissen?', sus: 0.2, tone: 'rude', claim: 'none' },
    ],
  },
  {
    id: 'destination',
    topic: 'destination',
    text: 'Und wo soll es hingehen?',
    recheck: 'Wohin wollten Sie nochmal?',
    answers: [
      { id: 'home', text: 'Nach Hause, ins Bett.', sus: 0.03, tone: 'calm', claim: 'home' },
      {
        id: 'shop',
        text: 'Zum Laden, ausliefern.',
        sus: 0.05,
        tone: 'calm',
        claim: 'shop',
        fits: { topic: 'origin', claims: ['market', 'work'] },
      },
      { id: 'girlfriend', text: 'Zu meiner Freundin.', sus: 0.05, tone: 'calm', claim: 'friend' },
      { id: 'see', text: 'Mal schauen. Bisschen rumfahren.', sus: 0.18, tone: 'evasive', claim: 'none' },
    ],
  },
  {
    id: 'cargo',
    topic: 'cargo',
    always: true,
    text: 'Was haben Sie hinten drin?',
    recheck: 'Was war hinten drin, sagten Sie?',
    answers: [
      {
        id: 'tools',
        text: 'Werkzeug und Kram von der Baustelle.',
        sus: 0.04,
        tone: 'calm',
        claim: 'tools',
        fits: { topic: 'origin', claims: ['work'] },
      },
      {
        id: 'boxes',
        text: 'Umzugskartons.',
        sus: 0.04,
        tone: 'calm',
        claim: 'boxes',
        fits: { topic: 'origin', claims: ['move'] },
      },
      {
        id: 'veg',
        text: 'Gemüse vom Großmarkt.',
        sus: 0.04,
        tone: 'calm',
        claim: 'veg',
        fits: { topic: 'origin', claims: ['market'] },
      },
      { id: 'empty', text: 'Nichts. Der ist leer.', sus: 0, tone: 'calm', claim: 'empty' },
    ],
  },
  {
    id: 'drink',
    topic: 'drink',
    text: 'Haben Sie heute schon was getrunken?',
    answers: [
      { id: 'no', text: 'Nein, nichts.', sus: 0.03, tone: 'calm' },
      { id: 'water', text: 'Nur Wasser. Ich fahr doch.', sus: 0.02, tone: 'calm' },
      { id: 'beer', text: 'Ein Bier, aber vor Stunden.', sus: 0.1, tone: 'evasive' },
      { id: 'blow', text: 'Pusten Sie doch selbst.', sus: 0.25, tone: 'rude' },
    ],
  },
  {
    id: 'papers',
    topic: 'papers',
    text: 'Führerschein und Fahrzeugschein, bitte.',
    answers: [
      { id: 'here', text: 'Hier, bitte.', sus: 0, tone: 'calm' },
      { id: 'glovebox', text: 'Moment, liegt irgendwo im Handschuhfach …', sus: 0.08, tone: 'evasive' },
      { id: 'home', text: 'Hab ich zu Hause vergessen.', sus: 0.22, tone: 'evasive' },
    ],
  },
  {
    id: 'vehicle',
    topic: 'vehicle',
    text: 'Ist das Ihr Wagen?',
    answers: [
      {
        id: 'company',
        text: 'Firmenwagen.',
        sus: 0.03,
        tone: 'calm',
        claim: 'company',
        fits: { topic: 'origin', claims: ['work', 'market'] },
      },
      { id: 'rented', text: 'Gemietet, für heute.', sus: 0.05, tone: 'calm', claim: 'rented' },
      { id: 'brother', text: 'Von meinem Schwager geliehen.', sus: 0.09, tone: 'evasive', claim: 'borrowed' },
      { id: 'obvious', text: 'Sieht man doch.', sus: 0.18, tone: 'rude', claim: 'none' },
    ],
  },
  {
    id: 'nervous',
    topic: 'nervous',
    whenNervous: true,
    text: 'Sie schwitzen ja. Alles in Ordnung?',
    answers: [
      { id: 'day', text: 'Langer Tag, sonst nichts.', sus: 0.04, tone: 'calm' },
      { id: 'warm', text: 'Mir ist nur warm.', sus: 0.07, tone: 'calm' },
      { id: 'cops', text: 'Polizei macht mich halt nervös.', sus: 0.15, tone: 'evasive' },
    ],
  },
];

/** Was der Beamte sagt (je Anlass mehrere, fest gewählt aus Seed und Frage). */
export const OFFICER_LINES = {
  calm: ['Mhm.', 'Gut.', 'Aha.', 'Na schön.'],
  evasive: ['So, so.', 'Interessant.', 'Aha. Wenn Sie meinen.'],
  rude: ['Werden Sie mal nicht frech.', 'Den Ton lassen Sie mal stecken.'],
  shaky: ['Sie zittern ja.', 'Ganz ruhig. Warum so nervös?'],
  mismatch: ['Hm. Passt nicht ganz zusammen, oder?', 'Komische Kombination.'],
  contradiction: ['Eben haben Sie noch was anderes gesagt.', 'Vorhin klang das aber anders.'],
  consistent: ['Mhm. Hatten Sie gesagt.', 'Stimmt, ja.'],
  silent: ['Hallo? Ich hab Sie was gefragt.', 'Ich warte.'],
  flashlightEmpty: ['Leer, ja? Und was sind das für Kisten?'],
  flashlightOk: ['Mhm. Sieht ordentlich aus.', 'Na gut.'],
  flashlightShaky: ['Und warum zucken Sie, wenn ich da reinleuchte?'],
  radio: ['Zentrale, einmal Halterabfrage, bitte.', 'Ich lass mal das Kennzeichen laufen.'],
  papers: ['Moment.'],
  bribeLow: ['Was soll das denn? Stecken Sie das weg.'],
  bribeHigh: ['Bestechung auch noch? Jetzt reicht es.'],
  bribeOk: ['Ich hab nichts gesehen. Gute Fahrt.'],
  pass: ['Gute Fahrt.', 'Dann weiter. Gute Fahrt.'],
  fail: ['Aussteigen. Kofferraum auf!'],
} as const;

export type OfficerLine = keyof typeof OFFICER_LINES;
