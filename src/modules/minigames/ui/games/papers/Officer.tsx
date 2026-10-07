// Der Zöllner hinter der Scheibe: Porträt aus dem Look-System (Face) mit grüner Dienstmütze (hat 'customs'), Aussehen
// fest aus dem Seed, olivgrüne Uniform-Jacke. Ausdruck über eine Kopie des Looks (Mund), wie im Auftrag.

import { useMemo } from 'preact/hooks';
import { type Look, lookFor, type MouthStyle } from '../../../../../core';
import { Face } from '../../../../../ui';

/** Aussehen fest aus dem Seed: ordentlich, kurze Haare bzw. Dutt (passt unter die Mütze), nichts Wildes. */
export function customsLook(seed: number): Look {
  const key = `customs:papers:${seed}`;
  const rolled = lookFor(key);
  return lookFor(key, '', {
    hat: 'customs',
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
    </div>
  );
}
