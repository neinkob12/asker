// Wendungen für Lagernamen (Auftrag 43, L3): „in der Halle Cargo City“, „ins Lager Ehrenfeld“, „aus dem Keller Sülz“
// statt fest „im“/„ins“ vor jedem Namen („ins Halle Cargo City“). Das Geschlecht kommt aus dem ersten Wort des Namens.

export type WarehouseGender = 'm' | 'f' | 'n';

/** Erstes Wort eines Lagernamens → Geschlecht. Unbekannt: sächlich (wie „Lager“). */
const GENDER: Readonly<Record<string, WarehouseGender>> = {
  Lager: 'n',
  Bootshaus: 'n',
  Depot: 'n',
  Garage: 'f',
  Halle: 'f',
  Werkstatt: 'f',
  Remise: 'f',
  Scheune: 'f',
  Wohnung: 'f',
  Keller: 'm',
  Clubkeller: 'm',
  Hinterhof: 'm',
  Schuppen: 'm',
  Laden: 'm',
  Hafen: 'm',
  Container: 'm',
};

export function warehouseGender(name: string): WarehouseGender {
  return GENDER[name.split(' ')[0]] ?? 'n';
}

const FORMS = {
  /** wo: „in der Halle X“ */
  in: { m: 'im', f: 'in der', n: 'im' },
  /** wohin: „in die Halle X“ */
  into: { m: 'in den', f: 'in die', n: 'ins' },
  /** woher: „aus der Halle X“ */
  from: { m: 'aus dem', f: 'aus der', n: 'aus dem' },
  /** bei: „bei der Halle X“ */
  at: { m: 'beim', f: 'bei der', n: 'beim' },
  /** zu: „zur Halle X“ */
  to: { m: 'zum', f: 'zur', n: 'zum' },
  /** von: „von der Halle X“ */
  of: { m: 'vom', f: 'von der', n: 'vom' },
} as const;

export type WarehouseForm = keyof typeof FORMS;

/** Name mit Präposition und Artikel, z.B. warehousePlace('Halle Kalk', 'into') = „in die Halle Kalk“. */
export function warehousePlace(name: string, form: WarehouseForm): string {
  return `${FORMS[form][warehouseGender(name)]} ${name}`;
}

/**
 * Artikel und Possessiv vor einem Platzhalter (z.B. {warehouse}) passend zum Namen. Die Vorlagen sind für ein männliches
 * Wort geschrieben („dein Keller“, „im Keller“, „vom Keller“); für „Garage“ wird daraus „deine Garage“, „in der
 * Garage“, „von der Garage“, für „Lager“ „das Lager“ statt „der Lager“.
 */
const DECLINE: Readonly<Record<string, { f: string; n: string }>> = {
  der: { f: 'die', n: 'das' },
  den: { f: 'die', n: 'das' },
  dem: { f: 'der', n: 'dem' },
  dein: { f: 'deine', n: 'dein' },
  deinen: { f: 'deine', n: 'dein' },
  deinem: { f: 'deiner', n: 'deinem' },
  deines: { f: 'deiner', n: 'deines' },
  ihr: { f: 'ihre', n: 'ihr' },
  ihren: { f: 'ihre', n: 'ihr' },
  ihrem: { f: 'ihrer', n: 'ihrem' },
  ihres: { f: 'ihrer', n: 'ihres' },
  im: { f: 'in der', n: 'im' },
  am: { f: 'an der', n: 'am' },
  vom: { f: 'von der', n: 'vom' },
  zum: { f: 'zur', n: 'zum' },
  beim: { f: 'bei der', n: 'beim' },
};

export function fitArticles(template: string, placeholder: string, name: string): string {
  const gender = warehouseGender(name);
  if (gender === 'm') return template;
  const pattern = new RegExp(`(^|[^\\p{L}])(\\p{L}+) \\{${placeholder}\\}`, 'gu');
  return template.replace(pattern, (match, lead: string, word: string) => {
    const forms = DECLINE[word.toLowerCase()];
    if (!forms) return match;
    const replaced = forms[gender];
    const cased = word[0] === word[0].toUpperCase() ? replaced[0].toUpperCase() + replaced.slice(1) : replaced;
    return `${lead}${cased} {${placeholder}}`;
  });
}
