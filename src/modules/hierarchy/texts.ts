// Varianten der Meldungen von Leutnants (Auftrag 23), gewählt mit texts.pick (keine direkte Wiederholung).
// Platzhalter: {veedel}, {what} (z.B. "den Spot" oder "3 Spots"), {wage}.

export const HIERARCHY_TEXTS = {
  /** Gehaltswunsch eines unzufriedenen Leutnants. */
  wageRequest: [
    'Chef, ich halte {what} für dich zusammen und krieg {wage} am Tag. Das reicht so nicht.',
    '{wage} am Tag für {what}? Andere zahlen mehr. Ich sag’s nur.',
    'Ich mach hier die ganze Arbeit an {what}. Mit {wage} am Tag komm ich nicht hin.',
    'Wir müssen über Geld reden. {wage} für {what} ist zu wenig, das weißt du.',
    'Die Jungs an {what} fragen mich, ob ich mehr krieg als sie. Bei {wage} schäm ich mich fast.',
  ],
  /** Leutnant zieht nach dem Tipp des Polizei-Kontakts seine Leute ab. */
  raidPulled: [
    'Tipp vom Polizei-Kontakt: Razzia in {veedel}. Alle runter von der Straße.',
    'Hab’s gehört, {veedel} wird hochgenommen. Meine Leute sind weg.',
    'Razzia in {veedel} angekündigt. Ich hab alle abgezogen, keiner steht mehr da.',
    'Die Bullen kommen nach {veedel}. Leute sind runter, Ware ist versteckt.',
    '{veedel} ist geräumt. Wenn die Razzia kommt, finden die nur Tauben.',
  ],
  /** Leutnant schickt seine Leute nach dem Abtauchen zurück. */
  backToWork: [
    'In {veedel} ist die Luft wieder rein, zurück an die Arbeit.',
    '{veedel} ist wieder ruhig. Meine Leute stehen wieder.',
    'Die Streifen in {veedel} sind weg. Wir machen weiter.',
    'Alles klar in {veedel}. Zurück an die Spots.',
    'Hab mich in {veedel} umgesehen: sauber. Die Jungs sind wieder draußen.',
  ],
} as const;
