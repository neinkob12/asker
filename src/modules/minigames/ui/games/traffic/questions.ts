// Verkehrskontrolle (Auftrag 47): Fragen und Antworten als reine Daten. Jede Antwort behauptet etwas (claims) und
// passt oder passt nicht zu dem, was der Beamte sehen kann (Uhrzeit, Kennzeichen, Fahrzeug, was hinten liegt) und zu
// dem, was du vorher gesagt hast (story). fits() gibt null zurück, wenn alles passt, sonst den Satz, mit dem er den
// Widerspruch aufspießt. Neue Fragen und Antworten sind nur Daten.

export type Vehicle = 'transporter' | 'kombi' | 'limousine';
export type Visible = 'kartons' | 'werkzeug' | 'taschen' | 'nichts';

/** Was der Beamte sieht, bevor du den Mund aufmachst. */
export interface Evidence {
  /** Stunde 0 bis 23. */
  hour: number;
  /** Kennzeichen aus dieser Stadt? */
  plateHome: boolean;
  /** Name der Stadt auf dem Kennzeichen und der Stadt, in der die Kontrolle ist. */
  plateCity: string;
  homeCity: string;
  vehicle: Vehicle;
  /** Was durch die Scheibe hinten zu sehen ist. */
  visible: Visible;
}

export type FactKey = 'from' | 'to' | 'owner' | 'cargo' | 'purpose';

/** Was du bisher behauptet hast. */
export type Story = Partial<Record<FactKey, string>>;

export interface AnswerDef {
  text: string;
  claims: Story;
  /** null = passt; sonst der Satz des Beamten. */
  fits: (ev: Evidence, story: Story) => string | null;
}

export interface QuestionDef {
  id: string;
  fact: FactKey;
  /** Nachfrage: nur, wenn du zu dieser Sache schon etwas gesagt hast. */
  repeat?: boolean;
  ask: (ev: Evidence, story: Story) => string;
  answers: AnswerDef[];
}

export const VEHICLE_NAMES: Record<Vehicle, string> = {
  transporter: 'Transporter',
  kombi: 'Kombi',
  limousine: 'Limousine',
};

export const VISIBLE_NAMES: Record<Visible, string> = {
  kartons: 'Umzugskartons',
  werkzeug: 'Werkzeug',
  taschen: 'Reisetaschen',
  nichts: 'nichts',
};

/** Adjektiv zur Stadt (Kennzeichen), wo es nicht einfach Name + „er“ heißt. */
const PLATE_ADJECTIVES: Record<string, string> = {
  München: 'Münchner',
};

/** „Kölner“, „Münchner“ …: Adjektiv zum Namen der Stadt auf dem Kennzeichen. */
export function plateAdjective(city: string): string {
  return PLATE_ADJECTIVES[city] ?? `${city}er`;
}

/** Die Stadt in der Antwort „gerade angekommen“; in dieser Stadt selbst passt die Antwort nicht. */
const ARRIVED_FROM = 'Hamburg';

const FROM_NAMES: Record<string, string> = {
  arbeit: 'von der Arbeit',
  kumpel: 'von einem Kumpel',
  club: 'aus dem Club',
  baumarkt: 'vom Baumarkt',
  flughafen: 'vom Flughafen',
  fremd: 'aus einer anderen Stadt',
};
const TO_NAMES: Record<string, string> = {
  home: 'nach Hause',
  arbeit: 'zur Arbeit',
  kumpel: 'zu einem Kumpel',
  club: 'in den Club',
  flughafen: 'zum Flughafen',
  baustelle: 'zur Baustelle',
};

const night = (h: number) => h >= 22 || h <= 5;
const office = (h: number) => h >= 7 && h <= 19;
const hourText = (h: number) =>
  `um ${h} Uhr${night(h) ? ' nachts' : h < 12 ? ' morgens' : h < 18 ? ' nachmittags' : ' abends'}`;

export const QUESTIONS: QuestionDef[] = [
  {
    id: 'from',
    fact: 'from',
    ask: () => 'Wo kommen Sie gerade her?',
    answers: [
      {
        text: 'Von der Arbeit.',
        claims: { from: 'arbeit' },
        fits: (ev) => (night(ev.hour) ? `Von der Arbeit? ${capital(hourText(ev.hour))}?` : null),
      },
      { text: 'Von einem Kumpel.', claims: { from: 'kumpel' }, fits: () => null },
      {
        text: 'Aus dem Club.',
        claims: { from: 'club' },
        fits: (ev) => (night(ev.hour) || ev.hour === 6 ? null : `Aus dem Club? ${capital(hourText(ev.hour))}?`),
      },
      {
        text: 'Vom Baumarkt.',
        claims: { from: 'baumarkt' },
        fits: (ev) =>
          !office(ev.hour) && ev.hour !== 20
            ? 'Der Baumarkt hat um die Zeit zu.'
            : ev.visible === 'taschen'
              ? 'Vom Baumarkt, und hinten liegen Reisetaschen?'
              : null,
      },
      {
        text: 'Vom Flughafen.',
        claims: { from: 'flughafen' },
        fits: (ev) =>
          ev.visible === 'werkzeug' || ev.visible === 'kartons'
            ? `Vom Flughafen, mit ${VISIBLE_NAMES[ev.visible]} hinten drin?`
            : null,
      },
      {
        text: `Aus ${ARRIVED_FROM}, gerade angekommen.`,
        claims: { from: 'fremd' },
        fits: (ev) =>
          ev.homeCity === ARRIVED_FROM
            ? `Aus ${ARRIVED_FROM}? Wir sind hier in ${ARRIVED_FROM}.`
            : ev.plateHome
              ? `Aus ${ARRIVED_FROM}, mit ${plateAdjective(ev.homeCity)} Kennzeichen?`
              : null,
      },
    ],
  },
  {
    id: 'to',
    fact: 'to',
    ask: () => 'Und wohin wollen Sie?',
    answers: [
      { text: 'Nach Hause.', claims: { to: 'home' }, fits: () => null },
      {
        text: 'Zur Arbeit.',
        claims: { to: 'arbeit' },
        fits: (ev, story) =>
          story.from === 'arbeit'
            ? 'Von der Arbeit zur Arbeit?'
            : night(ev.hour) || (ev.hour > 10 && ev.hour < 13)
              ? `Zur Arbeit? ${capital(hourText(ev.hour))}?`
              : null,
      },
      {
        text: 'Zu einem Kumpel.',
        claims: { to: 'kumpel' },
        fits: (_ev, story) => (story.from === 'kumpel' ? 'Vom Kumpel zum Kumpel?' : null),
      },
      {
        text: 'In den Club.',
        claims: { to: 'club' },
        fits: (ev, story) =>
          story.from === 'club'
            ? 'Vom Club in den Club?'
            : !(ev.hour >= 21 || ev.hour <= 2)
              ? `In den Club? ${capital(hourText(ev.hour))}?`
              : (story.cargo ?? ev.visible) === 'kartons'
                ? 'Mit Umzugskartons in den Club?'
                : null,
      },
      {
        text: 'Zum Flughafen.',
        claims: { to: 'flughafen' },
        fits: (ev, story) =>
          story.from === 'flughafen'
            ? 'Vom Flughafen zum Flughafen?'
            : ev.visible === 'werkzeug'
              ? 'Zum Flughafen mit Werkzeug hinten drin?'
              : null,
      },
      {
        text: 'Zur Baustelle.',
        claims: { to: 'baustelle' },
        fits: (ev) =>
          ev.vehicle === 'limousine'
            ? 'Zur Baustelle in der Limousine?'
            : night(ev.hour) && ev.visible !== 'werkzeug'
              ? `Zur Baustelle ${hourText(ev.hour)}, ohne Werkzeug?`
              : null,
      },
    ],
  },
  {
    id: 'owner',
    fact: 'owner',
    ask: (ev) => `Ist das Ihr ${VEHICLE_NAMES[ev.vehicle]}?`,
    answers: [
      {
        text: 'Ja, meiner.',
        claims: { owner: 'own' },
        fits: (ev) =>
          ev.plateHome ? null : `Ihrer? Mit ${plateAdjective(ev.plateCity)} Kennzeichen, und Sie wohnen hier?`,
      },
      { text: 'Von einem Kumpel geliehen.', claims: { owner: 'kumpel' }, fits: () => null },
      {
        text: 'Firmenwagen.',
        claims: { owner: 'firma' },
        fits: (ev, story) =>
          ev.vehicle === 'limousine'
            ? 'Firmenwagen? Ohne Beschriftung, in der Limousine?'
            : story.from === 'club'
              ? 'Mit dem Firmenwagen in den Club?'
              : null,
      },
      {
        text: 'Mietwagen.',
        claims: { owner: 'miete' },
        fits: (ev) =>
          ev.plateHome && ev.vehicle !== 'transporter' ? 'Mietwagen mit Kennzeichen von hier? Welche Firma?' : null,
      },
    ],
  },
  {
    id: 'cargo',
    fact: 'cargo',
    ask: () => 'Was haben Sie hinten drin?',
    // Er hat hinten reingeschaut: Die Antwort, die zum Sichtbaren passt, passt immer. Widersprüche zwischen Ladung und
    // Geschichte (Kartons und Club, Werkzeug und Flughafen, Taschen und Umzug) fallen schon bei der Antwort auf, die
    // sie behauptet; hier gäbe es sonst keine passende Antwort mehr.
    answers: [
      {
        text: 'Umzugskartons.',
        claims: { cargo: 'kartons' },
        fits: (ev) => (ev.visible !== 'kartons' ? `Ich sehe aber ${VISIBLE_NAMES[ev.visible]}.` : null),
      },
      {
        text: 'Werkzeug.',
        claims: { cargo: 'werkzeug' },
        fits: (ev) => (ev.visible !== 'werkzeug' ? `Ich sehe aber ${VISIBLE_NAMES[ev.visible]}.` : null),
      },
      {
        text: 'Taschen, Klamotten.',
        claims: { cargo: 'taschen' },
        fits: (ev) => (ev.visible !== 'taschen' ? `Ich sehe aber ${VISIBLE_NAMES[ev.visible]}.` : null),
      },
      {
        text: 'Nichts.',
        claims: { cargo: 'nichts' },
        fits: (ev) => (ev.visible !== 'nichts' ? `Nichts? Und was sind das für ${VISIBLE_NAMES[ev.visible]}?` : null),
      },
    ],
  },
  {
    id: 'purpose',
    fact: 'purpose',
    ask: (ev) => (night(ev.hour) ? 'Was machen Sie um die Zeit noch unterwegs?' : 'Was haben Sie heute vor?'),
    answers: [
      {
        text: 'Einem Kumpel beim Umzug helfen.',
        claims: { purpose: 'umzug' },
        fits: (ev, story) =>
          night(ev.hour)
            ? `Umzug ${hourText(ev.hour)}?`
            : (story.cargo ?? ev.visible) !== 'kartons'
              ? 'Umzug ohne einen einzigen Karton?'
              : null,
      },
      {
        text: 'Lieferung für die Firma.',
        claims: { purpose: 'lieferung' },
        fits: (ev, story) =>
          story.owner === 'kumpel'
            ? 'Lieferung für die Firma mit dem Wagen vom Kumpel?'
            : ev.vehicle === 'limousine'
              ? 'Lieferung in der Limousine?'
              : night(ev.hour) && ev.hour !== 5
                ? `Lieferung ${hourText(ev.hour)}?`
                : null,
      },
      { text: 'Freunde besuchen.', claims: { purpose: 'freunde' }, fits: () => null },
      {
        text: 'Einen Kumpel vom Club abholen.',
        claims: { purpose: 'club' },
        fits: (ev, story) =>
          !(ev.hour >= 22 || ev.hour <= 5)
            ? `Vom Club abholen ${hourText(ev.hour)}?`
            : story.to === 'arbeit' || story.to === 'baustelle'
              ? `Sie wollten doch ${TO_NAMES[story.to]}?`
              : (story.cargo ?? ev.visible) === 'kartons'
                ? 'Mit Umzugskartons einen Kumpel vom Club abholen?'
                : null,
      },
      {
        text: 'Nachtschicht auf der Baustelle.',
        claims: { purpose: 'nachtschicht' },
        fits: (ev, story) =>
          !(ev.hour >= 19 || ev.hour <= 6)
            ? 'Nachtschicht? Es ist noch hell.'
            : (story.cargo ?? ev.visible) !== 'werkzeug'
              ? 'Nachtschicht ohne Werkzeug?'
              : null,
      },
    ],
  },
  // Nachfragen: dieselbe Sache noch einmal, die Antwort muss zur ersten passen.
  {
    id: 'from2',
    fact: 'from',
    repeat: true,
    ask: () => 'Noch mal, damit ich das richtig habe: Wo kommen Sie her?',
    answers: [
      { text: 'Von der Arbeit, sagte ich doch.', claims: { from: 'arbeit' }, fits: () => null },
      { text: 'Von meinem Kumpel.', claims: { from: 'kumpel' }, fits: () => null },
      { text: 'Aus dem Club.', claims: { from: 'club' }, fits: () => null },
      { text: 'Vom Baumarkt.', claims: { from: 'baumarkt' }, fits: () => null },
      { text: 'Vom Flughafen.', claims: { from: 'flughafen' }, fits: () => null },
      { text: `Aus ${ARRIVED_FROM}.`, claims: { from: 'fremd' }, fits: () => null },
    ],
  },
  {
    id: 'to2',
    fact: 'to',
    repeat: true,
    ask: () => 'Und Sie wollten wohin genau?',
    answers: [
      { text: 'Nach Hause.', claims: { to: 'home' }, fits: () => null },
      { text: 'Zur Arbeit.', claims: { to: 'arbeit' }, fits: () => null },
      { text: 'Zu einem Kumpel.', claims: { to: 'kumpel' }, fits: () => null },
      { text: 'In den Club.', claims: { to: 'club' }, fits: () => null },
      { text: 'Zum Flughafen.', claims: { to: 'flughafen' }, fits: () => null },
      { text: 'Zur Baustelle.', claims: { to: 'baustelle' }, fits: () => null },
    ],
  },
];

/** Nachfrage: passt nur, was zur ersten Antwort passt (die Antwort selbst kennt ihre claims). */
export function repeatContradiction(def: QuestionDef, answer: AnswerDef, story: Story): string | null {
  const said = story[def.fact];
  if (!said) return null;
  const claim = answer.claims[def.fact];
  if (claim === said) return null;
  const names = def.fact === 'from' ? FROM_NAMES : TO_NAMES;
  return `Vorhin sagten Sie, Sie ${def.fact === 'to' ? 'wollen' : 'kommen'} ${names[said] ?? said}.`;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Was der Beamte sonst sagt. */
export const OFFICER_LINES = {
  greetDay: ['Guten Tag. Allgemeine Verkehrskontrolle. Führerschein und Fahrzeugschein bitte.'],
  greetNight: ['Guten Abend. Allgemeine Verkehrskontrolle. Führerschein und Fahrzeugschein bitte.'],
  ok: ['Mhm.', 'Gut.', 'In Ordnung.', 'Aha.'],
  hit: ['Das passt nicht zusammen.', 'Jetzt überlegen Sie mal.', 'Soso.'],
  walk: ['Moment, ich schau mal hinten rein.', 'Bleiben Sie sitzen, ich gucke mal nach hinten.'],
  radio: ['Einen Augenblick, ich gebe das Kennzeichen durch.', 'Moment. Zentrale, Kennzeichen-Abfrage.'],
  slow: ['Das ist keine schwere Frage.', 'Na? So lange überlegen?'],
  pass: ['Gute Fahrt.', 'In Ordnung. Fahren Sie vorsichtig.'],
  passNoted: ['Gute Fahrt. Ich notier mir das Kennzeichen trotzdem.'],
  fail: ['Aussteigen. Hände aufs Dach.', 'So, das reicht. Aussteigen, bitte.'],
  bribeOk: ['Ich hab nichts gesehen. Gute Fahrt.'],
  bribeLow: ['Was soll das denn? Stecken Sie das weg.'],
  bribeHigh: ['Bestechung auch noch? Jetzt reicht es.'],
  flee: ['Hey! Stehen bleiben!'],
} as const;
