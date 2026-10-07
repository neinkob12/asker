// Der Zöllner hinter der Scheibe: Porträt aus dem Look-System (Face), Aussehen fest aus dem Seed, olivgrüne Uniform-Jacke. Die
// grüne Dienstmütze mit Zoll-Emblem liegt als eigenes SVG im selben 64er-Raster über dem Gesicht (Face hat keine
// Dienstmütze). Ausdruck über eine Kopie des Looks (Mund), wie im Auftrag.

import { useMemo } from 'preact/hooks';
import { type Look, lookFor, type MouthStyle } from '../../../../../core';
import { Face } from '../../../../../ui';

/** Uniform des Zolls: Inhalt wie Kleidung in Face.tsx, feste Werte. */
const CAP = '#2c4a3a';
const CAP_BAND = '#1b2f25';
const VISOR = '#0b0d0c';
const EMBLEM = '#d9b24a';

/** Aussehen fest aus dem Seed: ordentlich, kurze Haare bzw. Dutt (passt unter die Mütze), nichts Wildes. */
export function customsLook(seed: number): Look {
  const key = `customs:papers:${seed}`;
  const rolled = lookFor(key);
  return lookFor(key, '', {
    hat: 'none',
    hair: rolled.feminine ? 'bun' : rolled.age > 50 ? 'buzz' : 'short',
    top: 'jacket',
    topColor: 3,
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

export function CustomsOfficer(props: { look: Look; mouth: MouthStyle }) {
  const look = useMemo(() => ({ ...props.look, mouth: props.mouth }), [props.look, props.mouth]);
  return (
    <div class="papers-officer">
      <Face look={look} />
      <svg class="papers-officer__cap" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M16.2 14.6 Q14.6 7.4 32 6.2 Q49.4 7.4 47.8 14.6 Q32 12.4 16.2 14.6 Z" fill={CAP} />
        <path d="M19 12.6 Q32 10.2 45 12.6 L45.2 17.6 Q32 15.6 18.8 17.6 Z" fill={CAP_BAND} />
        {/* Emblem: Kranz mit Stern */}
        <circle cx="32" cy="13.9" r="2.6" fill="none" stroke={EMBLEM} stroke-width="0.9" />
        <circle cx="32" cy="13.9" r="1" fill={EMBLEM} />
        <path d="M19.4 17.2 Q32 14.8 44.6 17.2 Q40 21.4 32 21.2 Q24 21.4 19.4 17.2 Z" fill={VISOR} />
        <path d="M22 18 Q32 16.4 42 18" stroke="rgba(255,255,255,0.18)" stroke-width="0.6" fill="none" />
      </svg>
    </div>
  );
}
