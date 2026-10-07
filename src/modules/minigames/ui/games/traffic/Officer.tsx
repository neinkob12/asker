// Der Beamte am Fenster: Porträt aus dem Look-System (Face), Aussehen fest aus dem Seed, Uniform-Jacke. Die
// Polizeimütze (Schirmmütze mit Stern) und das Funkgerät an der Schulter liegen als eigenes SVG im selben 64er-Raster
// über dem Gesicht (Face hat keine Polizeimütze). Ausdruck über eine Kopie des Looks (Mund), wie im Auftrag.

import { useMemo } from 'preact/hooks';
import { type Look, lookFor, type MouthStyle } from '../../../../../core';
import { Face } from '../../../../../ui';

/** Uniform: Inhalt wie Kleidung in Face.tsx, feste Werte. */
const CAP = '#1f2a44';
const CAP_BAND = '#141b2e';
const VISOR = '#08090c';
const STAR = '#d9b24a';
const RADIO = '#0b0c10';

/** Aussehen fest aus dem Seed: kurze Haare bzw. Dutt (passt unter die Mütze), dunkelblaue Jacke, nichts Wildes. */
export function officerLook(seed: number): Look {
  const key = `police:traffic:${seed}`;
  const rolled = lookFor(key);
  return lookFor(key, '', {
    hat: 'none',
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

export function Officer(props: { look: Look; mouth: MouthStyle; class?: string }) {
  const look = useMemo(() => ({ ...props.look, mouth: props.mouth }), [props.look, props.mouth]);
  return (
    <div class={`traffic-officer ${props.class ?? ''}`}>
      <Face look={look} />
      <svg class="traffic-officer__cap" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        {/* Funkgerät an der linken Schulter (Bildrechts) */}
        <rect x="45" y="50" width="6" height="9" rx="1.5" fill={RADIO} />
        <rect x="46.5" y="47" width="1.2" height="4" fill={RADIO} />
        {/* Mütze: Deckel, Band mit Stern, Schirm */}
        <path d="M16.2 14.6 Q14.6 7.4 32 6.2 Q49.4 7.4 47.8 14.6 Q32 12.4 16.2 14.6 Z" fill={CAP} />
        <path d="M19 12.6 Q32 10.2 45 12.6 L45.2 17.6 Q32 15.6 18.8 17.6 Z" fill={CAP_BAND} />
        <circle cx="32" cy="13.9" r="2.3" fill={STAR} />
        <circle cx="32" cy="13.9" r="1.1" fill={CAP_BAND} />
        <path d="M19.4 17.2 Q32 14.8 44.6 17.2 Q40 21.4 32 21.2 Q24 21.4 19.4 17.2 Z" fill={VISOR} />
        <path d="M22 18 Q32 16.4 42 18" stroke="rgba(255,255,255,0.18)" stroke-width="0.6" fill="none" />
      </svg>
    </div>
  );
}
