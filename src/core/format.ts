// Formatierung für Texte in Journal, Nachrichten und UI.

// Ein Intl.NumberFormat je Nachkommastellen, einmal angelegt: toLocaleString baut bei jedem Aufruf intern ein neues
// (das kostete im Spiel ein paar Prozent der Rechenzeit, HUD-Zähler und Listen formatieren ständig).
const FORMATS: Intl.NumberFormat[] = [];

function numberFormat(digits: number): Intl.NumberFormat {
  let format = FORMATS[digits];
  if (!format) {
    format = new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    FORMATS[digits] = format;
  }
  return format;
}

/** Negative Null ("-0", "-0,0") gibt es nicht: -0,4 € wird als "0 €" gezeigt, nicht als "-0 €". */
const NEGATIVE_ZERO = /^[-\u2212]([0,.]+)$/;

export function formatEuro(amount: number): string {
  return `${formatNumber(Math.round(amount) || 0)} €`;
}

export function formatNumber(value: number, digits = 0): string {
  const text = numberFormat(digits).format(value);
  const match = NEGATIVE_ZERO.exec(text);
  return match ? match[1] : text;
}

/** Menge mit Einheit, z.B. "40 g" oder "1,5 kg". */
export function formatAmount(amount: number, unit = 'g'): string {
  if (unit === 'g' && Math.abs(amount) >= 1000) return `${formatNumber(amount / 1000, amount % 1000 === 0 ? 0 : 1)} kg`;
  return `${formatNumber(amount)} ${unit}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}
