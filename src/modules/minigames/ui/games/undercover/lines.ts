// Zivi oder Kunde (Auftrag 44, Teil 5): Was die Leute am Spot sagen, als Daten. Ein Satz besteht aus Gruß und Frage;
// die Merkmale „auffallend höflich“, „große Menge“, „sagt Marihuana“ und „fragt nach dem Lieferanten“ stecken im Satz.
// {ware} ist der Name der Ware (Gras, Hasch …), {menge} die Menge mit Einheit.

/** Gruß auf der Straße. */
export const GREETINGS_STREET = ['Ey.', 'Na?', 'Tach.', 'Moin.', 'Yo, alles klar?', 'Hey du.', 'Was geht?'] as const;

/** Gruß, der zu höflich ist. */
export const GREETINGS_POLITE = [
  'Guten Abend, entschuldigen Sie bitte.',
  'Verzeihung, hätten Sie kurz Zeit?',
  'Hallo, ich hoffe, ich störe nicht.',
  'Entschuldigung, darf ich Sie etwas fragen?',
] as const;

/** Frage nach einer kleinen Menge. */
export const ASKS_SMALL = [
  'Haste {menge} {ware}?',
  'Einmal {ware}, {menge}. Wie immer.',
  'Kriegst du {menge} {ware} hin?',
  'Mach mal {menge} {ware}.',
  'Ich brauch {menge} {ware}, schnell.',
] as const;

/** Frage nach einer großen Menge. */
export const ASKS_BIG = [
  'Ich bräuchte {menge} {ware}. Geht das?',
  'Was machst du mir für {menge} {ware}?',
  'Hast du {menge} {ware}? Ich zahl bar.',
] as const;

/** Frage nach dem Lieferanten (angehängt). */
export const ASKS_SUPPLIER = [
  'Woher kriegst du eigentlich das Zeug?',
  'Wer ist denn dein Lieferant?',
  'Für wen arbeitest du so?',
] as const;

/** Statt des Straßennamens der Ware: das Wort aus der Zeitung. */
export const FORMAL_NAMES: Record<string, string> = {
  weed: 'Marihuana',
  haze: 'Marihuana',
  kush: 'Marihuana',
  hash: 'Haschisch',
  edibles: 'Cannabis-Kekse',
  oil: 'Cannabis-Öl',
  vape: 'THC-Liquid',
};
