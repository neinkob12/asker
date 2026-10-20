// Gesicht des Beamten als Textur in der 3D-Szene (Auftrag 48): Das Porträt aus dem Look-System (Face, ohne Mütze;
// die Mütze ist 3D) wird je Ausdruck einmal als SVG gezeichnet, in ein Canvas gemalt und liegt als Fläche vor dem
// Kopf. So bekommt es das Licht der Szene (Blaulicht, Taschenlampe, Laterne), Nebel und Tiefe und sitzt auf dem Hals.
// Ausdrücke: ruhig, zweifelnd, hart, grinsend, zufrieden, blinzelnd. Nur Optik.

import { h, render } from 'preact';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Look } from '../../../../../core';
import { Face } from '../../../../../ui';

export type Expression = 'calm' | 'doubt' | 'hard' | 'smirk' | 'grin' | 'blink';

export const EXPRESSIONS: readonly Expression[] = ['calm', 'doubt', 'hard', 'smirk', 'grin', 'blink'];

/** Ausschnitt des 64er-Porträts, der auf die Fläche kommt (Stirn bis Kinn, Ohren inklusive). */
export const FACE_CROP = { x: 12, y: 9, size: 40 };

const SIZE = 256;

/** Der Look je Ausdruck: Mund, Augen und Brauen. */
function lookFor(base: Look, expression: Expression): Look {
  const plain: Look = { ...base, hat: 'none' };
  switch (expression) {
    case 'doubt':
      return { ...plain, mouth: 'tired', eyes: 'narrow', brows: 'hard' };
    case 'hard':
      return { ...plain, mouth: 'hard', eyes: 'narrow', brows: 'heavy' };
    case 'smirk':
      return { ...plain, mouth: 'smirk' };
    case 'grin':
      return { ...plain, mouth: 'grin' };
    case 'blink':
      return { ...plain, mouth: 'neutral', eyes: 'heavy' };
    default:
      return { ...plain, mouth: 'neutral' };
  }
}

/** SVG-Text des Porträts (Preact zeichnet synchron in ein loses Element). */
function faceSvg(look: Look): string {
  const box = document.createElement('div');
  render(h(Face, { look }), box);
  const svg = box.querySelector('svg');
  if (!svg) return '';
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(SIZE));
  svg.setAttribute('height', String(SIZE));
  svg.setAttribute('viewBox', `${FACE_CROP.x} ${FACE_CROP.y} ${FACE_CROP.size} ${FACE_CROP.size}`);
  const text = new XMLSerializer().serializeToString(svg);
  render(null, box);
  return text;
}

export interface FaceTextures {
  get(expression: Expression): CanvasTexture;
  dispose(): void;
}

/**
 * Texturen aller Ausdrücke. Sie sind sofort da (leer und durchsichtig) und füllen sich, sobald die Bilder geladen sind.
 * Ohne DOM (Tests) bleiben sie leer.
 */
export function createFaceTextures(base: Look): FaceTextures {
  const textures = new Map<Expression, CanvasTexture>();
  const urls: string[] = [];
  for (const expression of EXPRESSIONS) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    textures.set(expression, tex);
    const svg = faceSvg(lookFor(base, expression));
    if (!svg) continue;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    urls.push(url);
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      // Unten (Hals, Kragen des Porträts) weich ausblenden: Dort übernimmt der Körper in der Szene.
      ctx.globalCompositeOperation = 'destination-in';
      const fade = ctx.createLinearGradient(0, SIZE * 0.72, 0, SIZE * 0.98);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'source-over';
      tex.needsUpdate = true;
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  return {
    get: (expression) => textures.get(expression) ?? (textures.get('calm') as CanvasTexture),
    dispose: () => {
      for (const tex of textures.values()) tex.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}
