// Lesbare Schrift- oder Symbolfarbe auf einer beliebigen Hex-Farbe (z.B. der Farbe einer Gang): Weiß oder ein fast
// schwarzes Blau, je nachdem, was mehr Kontrast hat (WCAG-Kontrastverhältnis).

const LIGHT = '#ffffff';
const DARK = '#0e1116';

function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Kontrastverhältnis zweier Hex-Farben (1 bis 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Weiß oder Fast-Schwarz, was auf der Farbe besser lesbar ist. */
export function readableOn(background: string): string {
  return contrastRatio(LIGHT, background) >= contrastRatio(DARK, background) ? LIGHT : DARK;
}
