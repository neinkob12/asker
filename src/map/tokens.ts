// Farbwerte aus den Design-Tokens für Karten-Layer. MapLibre versteht weder CSS-Variablen noch light-dark(); die
// Karte ist immer dunkel, also gilt die Dunkelvariante eines light-dark(hell, dunkel)-Tokens.

/** Dunkelvariante eines Werts: bei light-dark(a, b) der zweite Teil, sonst der Wert selbst. */
export function darkVariant(value: string): string {
  const v = value.trim();
  const match = /^light-dark\((.*)\)$/s.exec(v);
  if (!match) return v;
  let depth = 0;
  for (let i = 0; i < match[1].length; i++) {
    const ch = match[1][i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) return darkVariant(match[1].slice(i + 1));
  }
  return v;
}

/** Farbe eines Design-Tokens (z.B. '--gold') als echter Farbwert; fehlt das Token, gilt fallback. */
export function mapToken(name: string, fallback: string): string {
  const value = darkVariant(getComputedStyle(document.documentElement).getPropertyValue(name));
  return value || fallback;
}
