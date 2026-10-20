// Razzia-Lauf: Texturen aus dem Canvas (Beton, Ziegel, Wellblech, Holz, Asphalt, Pflaster, Lichtkegel, Funken).
// Einmal pro Szene gezeichnet, nie pro Bild. Math.random ist hier erlaubt (nur Optik).

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

function texture(c: HTMLCanvasElement, repeat = true, color = true): CanvasTexture {
  const tex = new CanvasTexture(c);
  if (repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  if (color) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Körnung und Flecken: viele kleine, halbdurchsichtige Punkte. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.7})`;
    const s = Math.random() < 0.9 ? 1.5 : 3;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function stains(g: CanvasRenderingContext2D, w: number, h: number, count: number, color: string): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 10 + Math.random() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Hallenboden: Estrich mit Flecken, Fugen und gelber Markierung. Eine Kachel = 4 × 4 m. */
export function concreteTexture(): CanvasTexture {
  const S = 512;
  const { c, g } = canvas(S, S);
  if (g) {
    g.fillStyle = '#7d7a73';
    g.fillRect(0, 0, S, S);
    stains(g, S, S, 26, 'rgba(40,36,30,0.22)');
    stains(g, S, S, 10, 'rgba(255,250,235,0.08)');
    grain(g, S, S, 9000, 0.09);
    g.strokeStyle = 'rgba(30,28,24,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, S / 2);
    g.lineTo(S, S / 2);
    g.moveTo(S / 2, 0);
    g.lineTo(S / 2, S);
    g.stroke();
    // Reifenspuren.
    g.strokeStyle = 'rgba(20,18,16,0.12)';
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(0, S * 0.7);
    g.bezierCurveTo(S * 0.3, S * 0.62, S * 0.6, S * 0.82, S, S * 0.74);
    g.stroke();
  }
  return texture(c);
}

/** Gelbe Sicherheitsmarkierung mit schwarzen Streifen (Rand am Tor). */
export function hazardTexture(): CanvasTexture {
  const { c, g } = canvas(256, 32);
  if (g) {
    g.fillStyle = '#e8b820';
    g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#1b1a18';
    for (let x = -32; x < 256; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 32);
      g.fill();
    }
    grain(g, 256, 32, 900, 0.18);
  }
  return texture(c);
}

/** Hallenwand: unten Kalksandstein, darüber Wellblech; eine Kachel = 4 m breit, 5 m hoch. */
export function wallTexture(): CanvasTexture {
  const W = 512;
  const H = 640;
  const { c, g } = canvas(W, H);
  if (g) {
    const split = H * 0.52;
    // Wellblech oben.
    for (let x = 0; x < W; x += 16) {
      const grad = g.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, '#4f5a5f');
      grad.addColorStop(0.5, '#6d797e');
      grad.addColorStop(1, '#465055');
      g.fillStyle = grad;
      g.fillRect(x, 0, 16, split);
    }
    stains(g, W, split, 8, 'rgba(90,60,30,0.18)');
    // Steine unten.
    g.fillStyle = '#9b958a';
    g.fillRect(0, split, W, H - split);
    g.strokeStyle = 'rgba(50,46,40,0.55)';
    g.lineWidth = 2;
    const bh = 32;
    for (let y = split, row = 0; y < H; y += bh, row++) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = row % 2 ? 0 : 64; x < W; x += 128) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + bh);
        g.stroke();
      }
    }
    stains(g, W, H, 12, 'rgba(30,28,24,0.16)');
    grain(g, W, H, 9000, 0.07);
    // Sockel.
    g.fillStyle = 'rgba(30,30,30,0.45)';
    g.fillRect(0, H - 18, W, 18);
  }
  return texture(c);
}

/** Rolltor: waagerechte Lamellen. */
export function shutterTexture(): CanvasTexture {
  const { c, g } = canvas(128, 256);
  if (g) {
    for (let y = 0; y < 256; y += 16) {
      const grad = g.createLinearGradient(0, y, 0, y + 16);
      grad.addColorStop(0, '#9aa3a8');
      grad.addColorStop(0.45, '#c7ced2');
      grad.addColorStop(1, '#5d666b');
      g.fillStyle = grad;
      g.fillRect(0, y, 128, 16);
    }
    grain(g, 128, 256, 1200, 0.1);
  }
  return texture(c);
}

/** Holz (Paletten, Regalböden, Bodenklappe). */
export function woodTexture(): CanvasTexture {
  const { c, g } = canvas(256, 128);
  if (g) {
    g.fillStyle = '#a47a4a';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${60 + Math.random() * 30},${40 + Math.random() * 20},20,${0.15 + Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * 128;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + (Math.random() - 0.5) * 8, 170, y + (Math.random() - 0.5) * 8, 256, y);
      g.stroke();
    }
    grain(g, 256, 128, 2000, 0.08);
  }
  return texture(c);
}

/** Asphalt bzw. Gehweg-Pflaster. */
export function streetTexture(kind: 'asphalt' | 'paving'): CanvasTexture {
  const S = 512;
  const { c, g } = canvas(S, S);
  if (g) {
    g.fillStyle = kind === 'asphalt' ? '#3b3d40' : '#8c867b';
    g.fillRect(0, 0, S, S);
    if (kind === 'paving') {
      g.strokeStyle = 'rgba(40,36,30,0.5)';
      g.lineWidth = 2;
      for (let y = 0; y < S; y += 64) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(S, y);
        g.stroke();
        for (let x = (y / 64) % 2 ? 32 : 0; x < S; x += 64) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 64);
          g.stroke();
        }
      }
    }
    stains(g, S, S, 18, 'rgba(0,0,0,0.2)');
    grain(g, S, S, 14000, kind === 'asphalt' ? 0.14 : 0.08);
  }
  return texture(c);
}

/** Weicher Fleck (Partikel, Lichtschein): weiß, nach außen durchsichtig. */
export function softDot(): CanvasTexture {
  const { c, g } = canvas(64, 64);
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return texture(c, false);
}

/** Lichtkegel aus einem Fenster: oben hell, nach unten auslaufend, an den Rändern weich. */
export function beamTexture(): CanvasTexture {
  const { c, g } = canvas(64, 256);
  if (g) {
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,255,255,0.9)');
    v.addColorStop(0.7, 'rgba(255,255,255,0.25)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.3, 'rgba(0,0,0,1)');
    h.addColorStop(0.7, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
  }
  return texture(c, false);
}

/** Etikett auf einem Paket: Farbe der Ware, Symbol in dunkel (glyph zeichnet der Aufrufer). */
export function labelTexture(
  color: string,
  drawGlyph: (g: CanvasRenderingContext2D, s: number) => void,
): CanvasTexture {
  const { c, g } = canvas(128, 128);
  if (g) {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    const shade = g.createLinearGradient(0, 0, 128, 128);
    shade.addColorStop(0, 'rgba(255,255,255,0.25)');
    shade.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = shade;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(250,246,236,0.92)';
    g.fillRect(22, 22, 84, 84);
    g.save();
    g.translate(64, 64);
    g.strokeStyle = '#1d1b18';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    drawGlyph(g, 52);
    g.restore();
    grain(g, 128, 128, 500, 0.08);
  }
  return texture(c, false);
}

/** Klebeband-Folie eines Pakets (Grundfarbe mit Bändern). */
export function wrapTexture(color: string): CanvasTexture {
  const { c, g } = canvas(128, 128);
  if (g) {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 52, 128, 24);
    g.fillRect(52, 0, 24, 128);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 14; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 30 + Math.random() * 40, 2);
    grain(g, 128, 128, 700, 0.1);
  }
  return texture(c, false);
}

/** Schnitt durch den Boden (vorn unter der Halle): Estrich, Kies, Erde mit Steinen. Eine Kachel = 4 m × 2,4 m. */
export function groundTexture(): CanvasTexture {
  const W = 512;
  const H = 300;
  const { c, g } = canvas(W, H);
  if (g) {
    const layers: [number, string][] = [
      [0.12, '#55524c'],
      [0.3, '#4a4339'],
      [1, '#3a2e24'],
    ];
    let y0 = 0;
    for (const [to, color] of layers) {
      g.fillStyle = color;
      g.fillRect(0, y0, W, to * H - y0);
      y0 = to * H;
    }
    for (let i = 0; i < 160; i++) {
      const y = H * (0.14 + Math.random() * 0.86);
      g.fillStyle = `rgba(${120 + Math.random() * 60},${110 + Math.random() * 40},${90 + Math.random() * 30},0.35)`;
      g.beginPath();
      g.ellipse(
        Math.random() * W,
        y,
        2 + Math.random() * 6,
        1.5 + Math.random() * 4,
        Math.random() * 3,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    grain(g, W, H, 6000, 0.12);
    const shade = g.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = shade;
    g.fillRect(0, 0, W, H);
  }
  return texture(c);
}

/** Himmel hinter allem: senkrechter Verlauf (oben dunkler). */
export function skyTexture(top: string, horizon: string): CanvasTexture {
  const { c, g } = canvas(16, 256);
  if (g) {
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, top);
    v.addColorStop(1, horizon);
    g.fillStyle = v;
    g.fillRect(0, 0, 16, 256);
  }
  return texture(c, false);
}
