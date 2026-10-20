// Zuschauer am Rand des Straßenkampfs (Auftrag 49): ein paar Leute auf dem Gehweg hinter der hinteren Ebene, als
// dunkle Silhouetten mit Randlicht der Laterne. Im Stand wippen sie, einer filmt nachts mit dem Handy (leuchtendes
// Display). Bei harten Treffern, Kontern und wenn einer zu Boden geht, gehen die Arme hoch, sie springen und weichen
// vor der Stelle zurück. Nur Optik: liest den Kampf nicht, die Oberfläche gibt Aufregung und Ort mit (cheer).

import { createRng } from '../../../../../core';
import { type BrawlLayout, LAMPS, toScreen } from './draw';
import { ARENA_W } from './model';

/** Tiefe der Zuschauer (Ebenen: 0 vorn, 1 hinten); so stehen sie auf dem Gehweg hinter der hinteren Ebene. */
export const CROWD_DEPTH = 1.45;
export const CROWD_SCALE = 0.7;

export interface Spectator {
  /** Ort in Metern auf der Bühne. */
  x: number;
  /** Größe (Faktor) und Breite. */
  height: number;
  width: number;
  /** Eigener Takt beim Wippen und eigene Verzögerung beim Jubeln (Sekunden). */
  phase: number;
  delay: number;
  /** Hält ein Handy hoch (filmt), trägt Kapuze bzw. Mütze. */
  phone: boolean;
  hood: boolean;
  /** Ton der Kleidung (aus der Silhouette etwas heller oder dunkler). */
  shade: number;
}

/** Zuschauer aus dem Seed: zwei Grüppchen, nicht mitten unter einer Laterne. */
export function createCrowd(seed: number, count: number): Spectator[] {
  const rng = createRng(seed ^ 0x2c1b3c6d);
  const crowd: Spectator[] = [];
  const centers = [1.6 + rng() * 3, ARENA_W - 2 - rng() * 4];
  for (let i = 0; crowd.length < count && i < count * 8; i++) {
    const center = centers[crowd.length % centers.length];
    const x = center + (rng() - 0.5) * 3.2;
    if (x < 0.6 || x > ARENA_W - 0.6) continue;
    if (crowd.some((s) => Math.abs(s.x - x) < 0.55)) continue;
    if (LAMPS.some((l) => Math.abs(l - x) < 0.35)) continue;
    crowd.push({
      x,
      height: 0.88 + rng() * 0.2,
      width: 0.9 + rng() * 0.3,
      phase: rng() * Math.PI * 2,
      delay: rng() * 0.18,
      phone: rng() < 0.3,
      hood: rng() < 0.4,
      shade: rng(),
    });
  }
  return crowd;
}

export interface Cheer {
  /** Aufregung 0 bis 1 (klingt in der Oberfläche ab) und seit wann (Sekunden der Oberfläche). */
  level: number;
  since: number;
  /** Ort des Treffers in Metern (Zuschauer weichen zurück bzw. lehnen sich hin). */
  x: number;
}

/**
 * Zuschauer zeichnen (vor den Kämpfern, nach der Kulisse). t = Zeit der Oberfläche, night = Laternen an (Randlicht und
 * Handy-Displays), rim = Farbe des Randlichts.
 */
export function drawCrowd(
  ctx: CanvasRenderingContext2D,
  layout: BrawlLayout,
  cam: number,
  crowd: readonly Spectator[],
  t: number,
  cheer: Cheer,
  night: boolean,
  rim: string,
): void {
  const body = night ? '#1c1a26' : '#3a3c46';
  for (const s of crowd) {
    const at = toScreen(layout, cam, s.x, CROWD_DEPTH);
    // Kleiner als die Kämpfer (weiter weg, auf dem Gehweg).
    const ppm = layout.ppm * at.scale * s.height * CROWD_SCALE;
    if (at.x < -ppm || at.x > layout.width + ppm) continue;
    // Aufregung kommt mit eigener Verzögerung an, nah am Treffer stärker.
    const near = Math.max(0.35, 1 - Math.abs(s.x - cheer.x) / 8);
    const since = t - cheer.since - s.delay;
    const hype = since < 0 ? 0 : cheer.level * near;
    const jump = hype > 0.2 ? Math.abs(Math.sin((since + s.phase) * 9)) * hype * ppm * 0.16 : 0;
    // Zurückweichen bzw. hinlehnen zum Treffer.
    const side = Math.sign(s.x - cheer.x) || 1;
    const lean = (hype * 0.18 + Math.sin(t * 1.3 + s.phase) * 0.03) * side;
    const x = at.x;
    const y = at.y - jump;
    const w = ppm * 0.17 * s.width;
    ctx.save();
    ctx.translate(x, y);
    // Schatten am Boden (bleibt unten, auch beim Springen).
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, jump, w * 1.6, ppm * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(lean);
    const tone = Math.round(s.shade * 14);
    ctx.fillStyle = night ? `rgb(${24 + tone}, ${22 + tone}, ${33 + tone})` : body;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineCap = 'round';
    // Beine.
    ctx.lineWidth = w * 0.7;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, 0);
    ctx.lineTo(-w * 0.35, -ppm * 0.85);
    ctx.moveTo(w * 0.45, 0);
    ctx.lineTo(w * 0.35, -ppm * 0.85);
    ctx.stroke();
    // Rumpf (Jacke, unten etwas breiter).
    ctx.beginPath();
    ctx.moveTo(-w * 1.05, -ppm * 0.8);
    ctx.quadraticCurveTo(-w * 1.2, -ppm * 1.25, -w * 0.95, -ppm * 1.42);
    ctx.lineTo(w * 0.95, -ppm * 1.42);
    ctx.quadraticCurveTo(w * 1.2, -ppm * 1.25, w * 1.05, -ppm * 0.8);
    ctx.closePath();
    ctx.fill();
    // Kopf (mit Kapuze runder).
    const hr = ppm * (s.hood ? 0.135 : 0.115);
    ctx.beginPath();
    ctx.arc(0, -ppm * 1.42 - hr * 0.95, hr, 0, Math.PI * 2);
    ctx.fill();
    // Arme: im Stand hängend bzw. verschränkt, beim Jubeln hoch (V), wer filmt, hält das Handy vor sich.
    ctx.lineWidth = w * 0.55;
    const up = Math.min(1, hype * 1.6);
    const shoulderY = -ppm * 1.36;
    for (const dir of [-1, 1]) {
      const filming = s.phone && dir === 1 && up < 0.5;
      const hx = filming ? w * 0.6 : dir * w * (1.3 + up * 0.6) + Math.sin(t * 11 + s.phase + dir) * up * w * 0.3;
      const hy = filming ? -ppm * 1.55 : shoulderY + ppm * (0.55 - up * 1.15);
      ctx.beginPath();
      ctx.moveTo(dir * w * 0.85, shoulderY);
      ctx.quadraticCurveTo(dir * w * 1.3, (shoulderY + hy) / 2 + ppm * 0.05, hx, hy);
      ctx.stroke();
      if (filming && night) {
        // Leuchtendes Display (kalt) mit kleinem Schein.
        ctx.fillStyle = 'rgba(170, 205, 255, 0.22)';
        ctx.beginPath();
        ctx.arc(hx, hy - ppm * 0.04, ppm * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cfe2ff';
        ctx.fillRect(hx - ppm * 0.03, hy - ppm * 0.1, ppm * 0.06, ppm * 0.11);
        ctx.fillStyle = night ? `rgb(${24 + tone}, ${22 + tone}, ${33 + tone})` : body;
      }
    }
    // Randlicht der Laterne bzw. des Himmels oben an Kopf und Schultern.
    ctx.strokeStyle = rim;
    ctx.globalAlpha = night ? 0.5 : 0.25;
    ctx.lineWidth = Math.max(1, ppm * 0.025);
    ctx.beginPath();
    ctx.arc(0, -ppm * 1.42 - hr * 0.95, hr * 0.92, Math.PI * 1.1, Math.PI * 1.75);
    ctx.moveTo(-w * 0.9, -ppm * 1.42);
    ctx.lineTo(w * 0.3, -ppm * 1.42);
    ctx.stroke();
    ctx.restore();
  }
}
