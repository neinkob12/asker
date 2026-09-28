// Muster für die 3D-Gebäude: dunkle Fassade mit Fenstern. Nachts brennt in vielen Fenstern Licht.
// Das Muster wird im Browser auf ein Canvas gezeichnet und bei Änderungen mit updateImage ausgetauscht.

const SIZE = 64;
const CELL = 8;

/** Feste Pseudo-Zufallswerte je Fenster, damit immer dieselben Fenster zuerst angehen. */
const WINDOW_SEEDS = (() => {
  const values: number[] = [];
  let s = 0x2f6b1a;
  for (let i = 0; i < (SIZE / CELL) ** 2; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    values.push((s >>> 8) / 0xffffff);
  }
  return values;
})();

const WARM = ['#ffcf73', '#ffd98f', '#ffb85c', '#ffe3a8'];
const COOL = '#a9c8ff';

/** Zeichnet das Fenstermuster. lit = Anteil beleuchteter Fenster (0–1). */
export function drawWindows(wall: string, lit: number): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = wall;
  g.fillRect(0, 0, SIZE, SIZE);
  // Geschosskanten
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let y = 0; y < SIZE; y += CELL) g.fillRect(0, y, SIZE, 1);
  const cols = SIZE / CELL;
  for (let i = 0; i < WINDOW_SEEDS.length; i++) {
    const x = (i % cols) * CELL + 2;
    const y = Math.floor(i / cols) * CELL + 2;
    const r = WINDOW_SEEDS[i];
    const on = r < lit * 0.42;
    if (on) {
      // Etwa jedes neunte Fenster flimmert kühl (Fernseher, Bildschirm).
      g.fillStyle = (i * 7) % 9 === 0 ? COOL : WARM[i % WARM.length];
      g.globalAlpha = 0.7 + ((i * 13) % 10) / 40;
      g.fillRect(x, y, 4, 5);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = 'rgba(160, 190, 230, 0.07)';
      g.fillRect(x, y, 4, 5);
    }
  }
  return g.getImageData(0, 0, SIZE, SIZE);
}

export const WINDOWS_PIXEL_RATIO = 1;
