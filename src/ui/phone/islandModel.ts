// Reine Funktionen der Dynamic Island (ohne DOM, getestet in islandModel.test.ts).

/**
 * Restzeit in Spielminuten, knapp für die Island: nur volle Stunden, aufgerundet ("2 Std."), unter einer Stunde
 * "< 1 Std.". Minuten laufen im Spiel schnell (bei 1× fünf pro Sekunde); der Wert in der Island soll ruhig stehen und
 * nur einmal pro Spielstunde springen. Aufgerundet heißt: "2 Std." sind höchstens zwei, nie mehr.
 */
export function islandCountdown(minutes: number): string {
  const m = Math.max(0, minutes);
  if (m < 60) return '< 1 Std.';
  return `${Math.ceil(m / 60)} Std.`;
}
