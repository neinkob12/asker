// Formatierung für Texte in Journal, Nachrichten und UI.

export function formatEuro(amount: number): string {
  return `${Math.round(amount).toLocaleString('de-DE')} €`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Menge mit Einheit, z.B. "40 g" oder "1,5 kg". */
export function formatAmount(amount: number, unit = 'g'): string {
  if (unit === 'g' && Math.abs(amount) >= 1000) return `${formatNumber(amount / 1000, amount % 1000 === 0 ? 0 : 1)} kg`;
  return `${formatNumber(amount)} ${unit}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}
