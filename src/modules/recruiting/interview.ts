// Bewerbungsgespräch (Auftrag 44, Teil 9): Fragen als Daten. Jede Frage prüft zwei bis drei Eigenschaften (probes).
// Hat die Person eine davon, verrät ihre Antwort sie (answers[trait]); sonst antwortet sie unauffällig (neutral). Im
// Minispiel wählt der Spieler je Runde eine von drei Fragen und tippt danach an, was die Antwort verrät.
// mood ist der Ausdruck im Gesicht, während die Person antwortet.

import type { MouthStyle } from '../../core';
import type { TraitId } from '../staff';

export interface InterviewQuestion {
  id: string;
  /** Stichwort auf der Karte, z.B. „Druck“. */
  topic: string;
  /** Symbol (Icon) zur Frage. */
  icon: string;
  /** Was du fragst. */
  text: string;
  /** Eigenschaften, die diese Frage aufdecken kann (2 bis 3). */
  probes: readonly TraitId[];
  /** Antwort je Eigenschaft (eine Variante je Eintrag). */
  answers: Partial<Record<TraitId, readonly string[]>>;
  /** Unauffällige Antworten, wenn keine der Eigenschaften passt. */
  neutral: readonly string[];
}

/** Ausdruck im Gesicht, wenn die Antwort eine Eigenschaft verrät. */
export const TRAIT_MOOD: Record<TraitId, MouthStyle> = {
  family: 'neutral',
  drinker: 'tired',
  gambler: 'smirk',
  ambitious: 'smirk',
  coward: 'tired',
  braggart: 'grin',
  loyal: 'neutral',
  hothead: 'hard',
  charmer: 'grin',
  nimble: 'grin',
};

export const INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: 'cops',
    topic: 'Druck',
    icon: 'siren',
    text: 'Was machst du, wenn die Bullen kommen?',
    probes: ['coward', 'hothead', 'nimble'],
    answers: {
      coward: [
        'Ehrlich? Ich bin weg, bevor die aus dem Wagen sind. Die Ware nehm ich mit, keine Sorge.',
        'Ich, äh … ich lass alles fallen und geh ganz normal weiter. Ganz normal. Glaub ich.',
      ],
      hothead: [
        'Kommt drauf an, wie die mich anquatschen. Ich lass mich nicht rumschubsen, von keinem.',
        'Die sollen erst mal kommen. Einer hat mich mal am Kragen gepackt, der hat das bereut.',
      ],
      nimble: [
        'Bis die ausgestiegen sind, ist der Kram im Gully und ich bin zwei Straßen weiter.',
        'Ich hab immer drei Wege im Kopf. Zack, Hinterhof, über den Zaun, fertig.',
      ],
    },
    neutral: [
      'Ruhig bleiben, nix sagen, Anwalt anrufen. Wie man das halt macht.',
      'Dann bin ich ein ganz normaler Typ, der auf den Bus wartet.',
    ],
  },
  {
    id: 'firstPay',
    topic: 'Geld',
    icon: 'coins',
    text: 'Was machst du mit deinem ersten Lohn?',
    probes: ['family', 'gambler', 'drinker'],
    answers: {
      family: [
        'Die Kleine braucht neue Schuhe, und die Miete ist auch noch offen. Viel bleibt da nicht.',
        'Geht nach Hause. Da warten drei Mäuler, die essen wollen.',
      ],
      gambler: [
        'Ich hab da so ein System beim Pferderennen. Das klappt diesmal, ich spür das.',
        'Erst mal ein paar Leuten was zurückgeben. Und dann vielleicht ein, zwei Runden Poker.',
      ],
      drinker: [
        'Erst mal einen ausgeben, oder drei. Man muss ja feiern, wenn es läuft.',
        'Die Kneipe an der Ecke hat noch einen Deckel von mir offen. Der wird bezahlt.',
      ],
    },
    neutral: ['Sparen. Ich will irgendwann was Eigenes.', 'Weiß noch nicht. Erst mal schauen, was übrig bleibt.'],
  },
  {
    id: 'evening',
    topic: 'Freizeit',
    icon: 'moon',
    text: 'Wie sieht bei dir ein freier Abend aus?',
    probes: ['drinker', 'gambler', 'family'],
    answers: {
      drinker: [
        'Kiosk, zwei Halbe, dann die Kneipe. Morgens weiß ich manchmal nicht mehr ganz genau.',
        'Mit den Jungs um die Häuser. Wer zuerst umfällt, zahlt.',
      ],
      gambler: [
        'Hinterzimmer, Karten, ein bisschen was auf dem Tisch. Ohne Einsatz macht es keinen Spaß.',
        'Ich sitz an den Automaten am Bahnhof. Irgendwann muss der ja mal ausschütten.',
      ],
      family: [
        'Kinder ins Bett bringen, dann mit meiner Frau auf dem Sofa. Mehr brauch ich nicht.',
        'Ich koch für alle, und sonntags kommt meine Mutter. Ruhig halt.',
      ],
    },
    neutral: ['Kicken, Playstation, nichts Besonderes.', 'Ich hab nicht so viele freie Abende.'],
  },
  {
    id: 'future',
    topic: 'Zukunft',
    icon: 'rocket',
    text: 'Wo siehst du dich in einem Jahr?',
    probes: ['ambitious', 'loyal', 'family'],
    answers: {
      ambitious: [
        'Nicht mehr an der Ecke. Ich will einen eigenen Spot, und dann noch einen.',
        'Ganz ehrlich? Da, wo du jetzt sitzt. Nichts für ungut.',
      ],
      loyal: [
        'Hier. Wenn du mich nimmst, bleib ich. So bin ich erzogen.',
        'Bei dem, der mir eine Chance gibt. Ich vergess sowas nicht.',
      ],
      family: [
        'Mit genug auf der Seite, dass die Kinder nicht so anfangen müssen wie ich.',
        'Irgendwo, wo meine Familie sicher ist. Dafür mach ich das alles.',
      ],
    },
    neutral: ['Mal sehen. Ich plan nicht so weit.', 'Hauptsache nicht im Knast, oder?'],
  },
  {
    id: 'station',
    topic: 'Revier',
    icon: 'badge',
    text: 'Du wirst eingesackt. Was sagst du auf dem Revier?',
    probes: ['loyal', 'braggart', 'coward'],
    answers: {
      loyal: [
        'Nichts. Kein Wort, egal wie lange die mich da sitzen lassen.',
        'Ich hab schon mal achtzehn Monate gemacht und keinen Namen gesagt.',
      ],
      braggart: [
        'Ich erzähl denen, mit wem sie sich anlegen. Die sollen ruhig wissen, wer hinter mir steht.',
        'Die Bullen? Mit denen red ich locker. Ich weiß, wie man mit denen spricht.',
      ],
      coward: [
        'Kommt drauf an, was die mir anbieten. Ich geh nicht für andere in den Bau.',
        'Ich, äh … ich hoffe einfach, das passiert nicht. Ich bin nicht so gut unter Druck.',
      ],
    },
    neutral: ['Nach meinem Anwalt fragen. Und dann warten.', 'Ich kenn meine Rechte.'],
  },
  {
    id: 'trouble',
    topic: 'Kunden',
    icon: 'users',
    text: 'Ein Kunde macht Stress am Spot. Und jetzt?',
    probes: ['hothead', 'charmer', 'coward'],
    answers: {
      hothead: [
        'Einmal frag ich nett. Beim zweiten Mal liegt er.',
        'Der macht keinen Stress mehr, glaub mir. Das regel ich schnell.',
      ],
      charmer: [
        'Ich lach mit ihm, geb ihm ein bisschen recht, und am Ende kauft er doppelt.',
        'Mit Stress kann ich gut. Fünf Minuten reden, und der ist mein bester Kumpel.',
      ],
      coward: [
        'Dann ruf ich wen. Ich bin eher der Verkäufer, nicht der Türsteher.',
        'Ich geb ihm, was er will, und er soll gehen. Ärger brauch ich nicht.',
      ],
    },
    neutral: ['Ruhig bleiben, Ansage machen, fertig.', 'Kommt drauf an, was er will.'],
  },
  {
    id: 'lastJob',
    topic: 'Vorher',
    icon: 'briefcase',
    text: 'Warum bist du bei deinem letzten Job raus?',
    probes: ['hothead', 'drinker', 'ambitious'],
    answers: {
      hothead: [
        'Der Chef hat mich angeschrien. Ich hab zurückgeschrien. Und dann war da noch die Sache mit seiner Nase.',
        'Kollege hat mich blöd angemacht. Lassen wir das.',
      ],
      drinker: [
        'Bin ein paar Mal zu spät gekommen. Na gut, öfter. Montags ist halt schwer.',
        'Die haben gesagt, ich riech nach Fahne. Um zehn Uhr morgens. Übertrieben, oder?',
      ],
      ambitious: [
        'Da ging nichts mehr voran. Ich will nicht ewig derselbe sein.',
        'Die haben mich unterschätzt. Ich wollte mehr Verantwortung, die nicht.',
      ],
    },
    neutral: ['Laden hat zugemacht.', 'War nur für den Sommer.'],
  },
  {
    id: 'friends',
    topic: 'Klappe',
    icon: 'message',
    text: 'Was erzählst du deinen Kumpels, wo du arbeitest?',
    probes: ['braggart', 'loyal', 'charmer'],
    answers: {
      braggart: [
        'Dass ich jetzt bei den Großen bin. Die sollen ruhig staunen.',
        'Die wissen eh alles. Wir haben keine Geheimnisse, ich und meine Jungs.',
      ],
      loyal: [
        'Gar nichts. Was hier läuft, bleibt hier.',
        'Lagerjob. Mehr müssen die nicht wissen, und mehr sag ich nicht.',
      ],
      charmer: [
        'Irgendwas Nettes. Die Leute glauben mir, wenn ich lächle.',
        'Ich erzähl eine schöne Geschichte, und am Ende wollen alle bei mir einkaufen.',
      ],
    },
    neutral: ['Dass ich Arbeit hab. Reicht doch.', 'Ich hab nicht so viele Kumpels.'],
  },
  {
    id: 'rush',
    topic: 'Tempo',
    icon: 'bolt',
    text: 'Freitagnacht, zwanzig Leute wollen gleichzeitig was. Wie läuft das?',
    probes: ['nimble', 'charmer', 'ambitious'],
    answers: {
      nimble: [
        'Geld, Ware, nächster. In zehn Minuten sind alle durch.',
        'Ich zähl im Kopf und geb schon raus, während der nächste noch sucht. Schnell bin ich.',
      ],
      charmer: [
        'Die warten gern bei mir. Ich mach Sprüche, die lachen, keiner wird ungeduldig.',
        'Jeder kriegt ein Lächeln und einen Namen. Die kommen wieder, versprochen.',
      ],
      ambitious: [
        'Dann zeig ich dir, dass ich mehr kann als ein Spot. Gib mir zwei.',
        'Freitag ist mein Tag. Da will ich zeigen, was ich draufhab.',
      ],
    },
    neutral: ['Einer nach dem anderen. Wie immer.', 'Stress halt. Geht schon.'],
  },
  {
    id: 'rival',
    topic: 'Treue',
    icon: 'handshake',
    text: 'Die Konkurrenz bietet dir mehr Geld. Was machst du?',
    probes: ['loyal', 'gambler', 'ambitious'],
    answers: {
      loyal: [
        'Ich sag denen, wo sie sich das hinstecken können. Wer mich nimmt, hat mich.',
        'Geld ist nicht alles. Ich wechsel nicht die Seiten.',
      ],
      gambler: [
        'Ich hab Schulden, Chef. Wenn die richtig zahlen … ich sag nur, es wär schwer.',
        'Wie viel mehr? Nur so aus Interesse. Ich hab da noch was offen bei ein paar Leuten.',
      ],
      ambitious: [
        'Ich würd mit dir reden. Und dann erwarte ich, dass du nachlegst.',
        'Dann weißt du, was ich wert bin. Sag mir, was du drauflegst.',
      ],
    },
    neutral: ['Ich würd erst mal fragen, wer das ist.', 'Kommt drauf an, wie die so sind.'],
  },
];

export function interviewQuestion(id: string): InterviewQuestion | undefined {
  return INTERVIEW_QUESTIONS.find((q) => q.id === id);
}
