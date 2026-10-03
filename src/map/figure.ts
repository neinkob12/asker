// Kleine Figur als SDF-Sprite für Symbol-Ebenen (Leute an Spots, Auftrag 31): Kopf und Körper, einmal im Browser als
// Abstandsfeld gerechnet (wie TinySDF: Kante bei 0,75), damit MapLibre sie in jeder Farbe (icon-color) und mit Rand
// (icon-halo) scharf zeichnet. Keine HTML-Marker.
//
//   const image = ensureFigureImage(map);   // 'kt-figure'
//   map.addLayer({ type: 'symbol', layout: { 'icon-image': image, … }, paint: { 'icon-color': ['get', 'color'] } });

import type { Map as MapLibreMap } from 'maplibre-gl';

export const FIGURE_IMAGE = 'kt-figure';
/** Größe in logischen Pixeln (Breite × Höhe) bei icon-size 1; das Bild hat die doppelte Auflösung. */
export const FIGURE_SIZE = { width: 24, height: 36 } as const;
const RATIO = 2;
/** Reichweite des Abstandsfelds in Bildpixeln (TinySDF: radius) und Lage der Kante (cutoff). */
const RADIUS = 8;
const CUTOFF = 0.25;

/** Vorzeichenbehafteter Abstand zur Figur in logischen Pixeln (negativ innen), Ursprung oben links. */
function figureDistance(x: number, y: number): number {
  // Kopf
  const head = Math.hypot(x - 12, y - 8) - 4.6;
  // Körper als Kapsel von den Schultern bis zu den Füßen
  const top = 16.5;
  const bottom = 31;
  const cy = Math.min(bottom, Math.max(top, y));
  const body = Math.hypot(x - 12, y - cy) - 5.4;
  return Math.min(head, body);
}

/** Abstandsfeld der Figur als RGBA (weiß, Alpha = Abstand), wie MapLibre es für sdf: true erwartet. */
export function figureSdf(): { width: number; height: number; data: Uint8Array } {
  const width = FIGURE_SIZE.width * RATIO;
  const height = FIGURE_SIZE.height * RATIO;
  const data = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const d = figureDistance((px + 0.5) / RATIO, (py + 0.5) / RATIO) * RATIO;
      const alpha = Math.round(Math.min(255, Math.max(0, 255 - 255 * (d / RADIUS + CUTOFF))));
      const i = (py * width + px) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
  }
  return { width, height, data };
}

/** Figur einmal pro Karte anmelden, gibt die Bild-ID für icon-image zurück. */
export function ensureFigureImage(map: MapLibreMap): string {
  if (!map.hasImage(FIGURE_IMAGE)) map.addImage(FIGURE_IMAGE, figureSdf(), { sdf: true, pixelRatio: RATIO });
  return FIGURE_IMAGE;
}
