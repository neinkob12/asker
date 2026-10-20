// Aussehen des Beamten am Fenster aus dem Look-System, fest aus dem Seed (Stimme, Gesicht in faceTexture.ts, Hautton und
// Jacke in der 3D-Figur). Seit Auftrag 48 ist das Porträt eine Textur in der Szene statt HTML über dem Bild.

import { type Look, lookFor } from '../../../../../core';

/** Aussehen fest aus dem Seed: kurze Haare bzw. Dutt (passt unter die Mütze), dunkelblaue Jacke, nichts Wildes. */
export function officerLook(seed: number): Look {
  const key = `police:traffic:${seed}`;
  const rolled = lookFor(key);
  return lookFor(key, '', {
    hat: 'police',
    hair: rolled.feminine ? 'bun' : rolled.age > 50 ? 'buzz' : 'short',
    top: 'jacket',
    topColor: 0,
    glasses: rolled.glasses === 'sun' ? 'none' : rolled.glasses,
    tattoo: 'none',
    teeth: 'none',
    mouthItem: 'none',
    earring: 'none',
    chain: 'none',
    mask: 'none',
    scar: 'none',
    bruise: false,
    mouth: 'neutral',
  });
}
