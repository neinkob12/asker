// Gemalte Texturen der Verkehrskontrolle (Auftrag 48), alle im Code als CanvasTexture, nichts wird geladen: Jacke mit
// Reflexstreifen und Schriftzug, Tropfen und Rinnsale auf der Scheibe (Farbe und Glanzlicht getrennt, damit das
// Blaulicht in den Tropfen aufblitzt), Fassade gegenüber, Stoff des Dachhimmels, weicher Lichtfleck (Laterne,
// Taschenlampe, Blendung), Lichtkegel, Geldschein. Fester Zufall aus dem Seed, damit jedes Bild gleich aussieht.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { createRng } from '../../../../../core';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c: HTMLCanvasElement, srgb = true, repeat = false): CanvasTexture {
  const tex = new CanvasTexture(c);
  if (srgb) tex.colorSpace = SRGBColorSpace;
  if (repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  tex.anisotropy = 4;
  return tex;
}

/** Körnung: helle und dunkle Pünktchen über eine Fläche (Stoff, Putz). */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.8})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

/**
 * Jacke: Grundfarbe mit Stoffkörnung und Nähten, zwei silberne Reflexstreifen, vorn ein kleiner, hinten ein großer
 * Schriftzug „POLIZEI“. u läuft einmal um den Körper (vorn bei 0,5), v von der Hüfte (0) bis zum Kragen (1).
 * emissive: nur die Streifen und die Schrift (leuchten im Licht wie Reflexfolie).
 */
export function jacketTextures(color: string, bands: readonly number[]): { map: CanvasTexture; glow: CanvasTexture } {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const [e, ectx] = canvas(W, H);
  const rnd = createRng(0x51ac);
  if (ctx && ectx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    // Falten: weiche senkrechte Schatten, unten am Bund dunkler.
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W;
      const g = ctx.createLinearGradient(x - 18, 0, x + 18, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, `rgba(0,0,0,${0.08 + rnd() * 0.1})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 18, 0, 36, H);
    }
    const hem = ctx.createLinearGradient(0, H, 0, H * 0.8);
    hem.addColorStop(0, 'rgba(0,0,0,0.35)');
    hem.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hem;
    ctx.fillRect(0, H * 0.8, W, H * 0.2);
    grain(ctx, W, H, rnd, 9000, 0.06);
    // Reißverschluss vorn.
    ctx.fillStyle = 'rgba(10,12,16,0.7)';
    ctx.fillRect(W * 0.5 - 1.5, 0, 3, H * 0.92);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, W, H);
    for (const v of bands) {
      const y = H * (1 - v);
      for (const [g, fill] of [
        [ctx, '#b9c2cc'],
        [ectx, '#ffffff'],
      ] as const) {
        g.fillStyle = fill;
        g.fillRect(0, y - 7, W, 14);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 0; x < W; x += 6) ctx.fillRect(x, y - 7, 1, 14);
    }
    // Schriftzug: vorn klein links auf der Brust, hinten groß.
    const text = (g: CanvasRenderingContext2D, fill: string) => {
      g.fillStyle = fill;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 15px sans-serif';
      g.fillText('POLIZEI', W * 0.44, H * 0.22);
      g.font = '800 34px sans-serif';
      g.fillText('POLIZEI', W * 0.0, H * 0.3);
      g.fillText('POLIZEI', W * 1.0, H * 0.3);
    };
    text(ctx, '#d9dee4');
    text(ectx, '#ffffff');
  }
  return { map: texture(c), glow: texture(e) };
}

/**
 * Regen auf der Scheibe: Tropfen (Farbe: dunkler Rand, durchsichtige Mitte, heller Rand oben) und ihr Glanzlicht
 * getrennt (glints): Das Glanzlicht färbt die Szene pro Bild in der Farbe des Blaulichts.
 */
export function dropTextures(seed: number, streaks: boolean): { map: CanvasTexture; glints: CanvasTexture } {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [e, ectx] = canvas(S, S);
  const rnd = createRng(seed ^ (streaks ? 0x7713 : 0x51a3));
  if (ctx && ectx) {
    ctx.clearRect(0, 0, S, S);
    // Ein Hauch Beschlag über der ganzen Scheibe.
    ctx.fillStyle = 'rgba(160,175,195,0.07)';
    ctx.fillRect(0, 0, S, S);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, S, S);
    const drop = (x: number, y: number, rx: number, ry: number) => {
      const g = ctx.createRadialGradient(x, y + ry * 0.2, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(210,225,240,0.10)');
      g.addColorStop(0.7, 'rgba(40,55,75,0.30)');
      g.addColorStop(1, 'rgba(15,20,30,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Glanzlicht: Sichel oben links und ein Punkt unten rechts (Licht durch den Tropfen).
      for (const g2 of [ctx, ectx]) {
        g2.fillStyle = g2 === ctx ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)';
        g2.beginPath();
        g2.ellipse(x - rx * 0.32, y - ry * 0.38, rx * 0.34, ry * 0.2, -0.5, 0, Math.PI * 2);
        g2.fill();
        g2.fillStyle = g2 === ctx ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)';
        g2.beginPath();
        g2.arc(x + rx * 0.3, y + ry * 0.42, Math.max(0.6, rx * 0.16), 0, Math.PI * 2);
        g2.fill();
      }
    };
    if (streaks) {
      // Rinnsale: schmale, leicht schlängelnde Bahnen mit einem dicken Tropfen vorn.
      for (let i = 0; i < 16; i++) {
        let x = rnd() * S;
        let y = rnd() * S;
        const w = 1.4 + rnd() * 2.2;
        const len = 60 + rnd() * 180;
        ctx.strokeStyle = 'rgba(30,45,65,0.35)';
        ectx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = w;
        ectx.lineWidth = w * 0.4;
        ctx.beginPath();
        ectx.beginPath();
        ctx.moveTo(x, y);
        ectx.moveTo(x - w * 0.3, y);
        for (let k = 0; k < len; k += 8) {
          y += 8;
          x += (rnd() - 0.5) * 2.4;
          ctx.lineTo(x, y);
          ectx.lineTo(x - w * 0.3, y);
        }
        ctx.stroke();
        ectx.stroke();
        drop(x, y + w, w * 1.6, w * 2);
      }
    } else {
      for (let i = 0; i < 520; i++) {
        const r = 0.8 + rnd() ** 4 * 4.5;
        drop(rnd() * S, rnd() * S, r * (0.8 + rnd() * 0.3), r);
      }
    }
  }
  const map = texture(c, true, true);
  const glints = texture(e, true, true);
  return { map, glints };
}

/**
 * Fassaden gegenüber: Altbau mit Sockel, Gesimsen, kleinen Fenstern mit Rahmen und Fensterbank, unten ein Laden mit
 * Schaufenster. Eine Kachel = eine Hausbreite × fünf Geschosse. emissive: Fenster und Schaufenster (nachts an).
 */
export function facadeTextures(seed: number, night: boolean): { map: CanvasTexture; glow: CanvasTexture } {
  const W = 256;
  const H = 320;
  const [c, ctx] = canvas(W, H);
  const [e, ectx] = canvas(W, H);
  const rnd = createRng(seed ^ 0xfa5a);
  if (ctx && ectx) {
    ctx.fillStyle = '#d8d0c2';
    ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, rnd, 5000, 0.07);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, W, H);
    const floors = 5;
    const fh = H / floors;
    for (let f = 0; f < floors; f++) {
      const y0 = f * fh;
      // Gesims unter jedem Geschoss.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y0 + fh - 5, W, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, y0 + fh - 7, W, 2);
      if (f === floors - 1) {
        // Laden: dunkles Schaufenster mit Markise.
        ctx.fillStyle = '#20262c';
        ctx.fillRect(18, y0 + 14, W - 36, fh - 22);
        if (night) {
          // Schaufenster: warmes Licht von oben, Regale als dunkle Streifen, Tür in der Mitte.
          const shop = ectx.createLinearGradient(0, y0 + 14, 0, y0 + fh - 8);
          shop.addColorStop(0, '#d9a868');
          shop.addColorStop(1, '#4a3018');
          ectx.fillStyle = shop;
          ectx.fillRect(18, y0 + 14, W - 36, fh - 22);
          ectx.fillStyle = 'rgba(0,0,0,0.55)';
          for (let r = 0; r < 3; r++) ectx.fillRect(18, y0 + 26 + r * 12, W - 36, 3);
          ectx.fillRect(W / 2 - 14, y0 + 14, 28, fh - 22);
        }
        ctx.fillStyle = '#7a2f2a';
        ctx.fillRect(12, y0 + 6, W - 24, 9);
        continue;
      }
      for (let i = 0; i < 4; i++) {
        const x = 18 + i * ((W - 36) / 4) + 8;
        const w = (W - 36) / 4 - 16;
        const y = y0 + 12;
        const h = fh - 26;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
        ctx.fillStyle = '#2b3440';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 2, y + 2, w - 4, h * 0.3);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x - 4, y + h + 2, w + 8, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + w / 2 - 1, y, 2, h);
        const lit = night && rnd() < 0.5;
        if (lit) {
          // Licht hinter Gardinen: oben heller, unten dunkler, je Fenster etwas anders.
          const warm = rnd() < 0.75;
          const grad = ectx.createLinearGradient(0, y, 0, y + h);
          grad.addColorStop(0, warm ? '#ffd8a0' : '#c7dbff');
          grad.addColorStop(1, warm ? '#7a4a20' : '#3a4a70');
          ectx.fillStyle = grad;
          ectx.fillRect(x, y, w, h);
          ectx.fillStyle = 'rgba(0,0,0,0.6)';
          ectx.fillRect(x + w / 2 - 1, y, 2, h);
        }
      }
    }
  }
  const map = texture(c, true, true);
  const glow = texture(e, true, true);
  return { map, glow };
}

/** Stoff: feine Körnung für Dachhimmel und Türverkleidung (als Rauheit und Farbe). */
export function fabricTexture(seed: number): CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rnd = createRng(seed ^ 0xfab1);
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, S, S);
    grain(ctx, S, S, rnd, 4000, 0.12);
  }
  return texture(c, true, true);
}

/** Weicher, runder Lichtfleck (Laterne, Linse der Taschenlampe, Blaulicht im Nebel). */
export function glowSprite(): CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  if (ctx) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return texture(c, false);
}

/** Lichtkegel: hell an der Spitze, nach hinten und zu den Rändern weich auslaufend (für Laterne und Lampe). */
export function beamTexture(): CanvasTexture {
  const W = 64;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  if (ctx) {
    const along = ctx.createLinearGradient(0, 0, 0, H);
    along.addColorStop(0, 'rgba(255,255,255,0.9)');
    along.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    along.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = along;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-in';
    const across = ctx.createLinearGradient(0, 0, W, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)');
    across.addColorStop(0.5, 'rgba(0,0,0,1)');
    across.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, W, H);
  }
  return texture(c, false);
}

/** Geldschein (für den Schein zustecken): grünlich mit Rand, Zahl und Muster. */
export function banknoteTexture(): CanvasTexture {
  const W = 128;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  if (ctx) {
    ctx.fillStyle = '#7fa37a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(30,60,35,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = 'rgba(30,60,35,0.75)';
    ctx.font = '800 26px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('100', 12, H / 2);
    ctx.beginPath();
    ctx.arc(W * 0.72, H / 2, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240,240,220,0.5)';
    ctx.fill();
  }
  return texture(c);
}
