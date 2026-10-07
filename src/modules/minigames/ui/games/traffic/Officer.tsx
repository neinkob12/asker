// Der Beamte am Fenster: Porträt aus dem Look-System (Face) mit Polizeimütze (hat 'police'), Aussehen fest aus dem
// Seed, Uniform-Jacke. Das Funkgerät an der Schulter liegt als eigenes SVG im selben 64er-Raster über dem Gesicht.
// Ausdruck über eine Kopie des Looks (Mund), wie im Auftrag.

import { useMemo } from 'preact/hooks';
import { type Look, lookFor, type MouthStyle } from '../../../../../core';
import { Face } from '../../../../../ui';

/** Funkgerät: Inhalt wie Kleidung in Face.tsx, fester Wert. */
const RADIO = '#0b0c10';

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

export function Officer(props: { look: Look; mouth: MouthStyle; class?: string }) {
  const look = useMemo(() => ({ ...props.look, mouth: props.mouth }), [props.look, props.mouth]);
  return (
    <div class={`traffic-officer ${props.class ?? ''}`}>
      <Face look={look} />
      <svg class="traffic-officer__cap" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        {/* Funkgerät an der linken Schulter (Bildrechts) */}
        <rect x="45" y="50" width="6" height="9" rx="1.5" fill={RADIO} />
        <rect x="46.5" y="47" width="1.2" height="4" fill={RADIO} />
      </svg>
    </div>
  );
}
