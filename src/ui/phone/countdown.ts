// Restzeit in groben Stunden für ruhige Anzeigen (Fahrt-Karte, Kai), ohne DOM (getestet in countdown.test.ts).

/**
 * Restzeit in Spielminuten, knapp: nur volle Stunden, aufgerundet ("2 Std."), unter einer Stunde "< 1 Std.". Minuten
 * laufen im Spiel schnell (bei 1× fünf pro Sekunde); der Wert soll ruhig stehen und nur einmal pro Spielstunde springen.
 * Aufgerundet heißt: "2 Std." sind höchstens zwei, nie mehr.
 */
export function hourCountdown(minutes: number): string {
  const m = Math.max(0, minutes);
  if (m < 60) return '< 1 Std.';
  return `${Math.ceil(m / 60)} Std.`;
}
