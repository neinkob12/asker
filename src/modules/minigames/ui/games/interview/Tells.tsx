// Bewerbungsgespräch (Lügendetektor): Zeichen und Gesten als Overlay über dem Porträt (gleiches 64er-Raster wie Face):
// Schweißtropfen an der Schläfe, die Hand am Hals, Zappeln (Kopf wackelt, CSS), Blick weg (Kopf dreht sich, CSS),
// nervöses Grinsen (Mund im Look), Nicken, Schluck aus dem Becher, Schulterzucken, Vorbeugen (CSS am Porträt).
// Hautfarben wie in Face.tsx (LOOK_COLORS), alles andere feste, gedeckte Werte (Inhalt, keine Bedeutung).

import { memo } from 'preact/compat';
import type { Look } from '../../../../../core';
import { LOOK_COLORS } from '../../../../../ui';
import type { CueKind } from './model';

const INK = '#1c1513';
const DROP = '#bfe3ff';
const CUP = '#e9e5dc';

/** Halbe Kopfbreite wie in Face.tsx (Kopfform, Frauen etwas schmaler): für die Lage der Schläfe. */
const HEAD_RX: Record<Look['face'], number> = { oval: 11.6, square: 11.9, narrow: 10.6, round: 12.4 };

export const TellMarks = memo(function TellMarks(props: { kind: CueKind; look: Look }) {
  const { kind, look } = props;
  const skin = LOOK_COLORS.skin[look.skin] ?? LOOK_COLORS.skin[1];
  const rx = (HEAD_RX[look.face] ?? 11.6) - (look.feminine ? 0.6 : 0);
  const temple = 32 + rx * 0.82;
  return (
    <svg class={`iv-tell iv-tell--${kind}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {kind === 'sweat' && (
        <g class="iv-tell__sweat">
          <path d={`M${temple} 20 q-1.6 2.6 0 4 q1.6-1.4 0-4z`} fill={DROP} stroke={INK} stroke-width="0.3" />
          <path
            class="iv-tell__drop2"
            d={`M${temple - 1.8} 25 q-1.2 2 0 3.1 q1.2-1.1 0-3.1z`}
            fill={DROP}
            stroke={INK}
            stroke-width="0.3"
          />
          <path d={`M${64 - temple} 22 q1.6 2.6 0 4 q-1.6-1.4 0-4z`} fill={DROP} stroke={INK} stroke-width="0.3" />
        </g>
      )}
      {kind === 'scratch' && (
        <g class="iv-tell__hand">
          {/* Unterarm von rechts unten, Hand am Hals. */}
          <path d="M60 64 L50 50" stroke={skin} stroke-width="6" stroke-linecap="round" />
          <circle cx="44" cy="46" r="4.6" fill={skin} stroke={INK} stroke-width="0.4" />
          <path
            d="M41 42.6 l-1.2-3.4 M43.6 41.6 l-0.6-3.8 M46.2 41.8 l0.4-3.6 M48.4 43.4 l1.6-3"
            stroke={skin}
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </g>
      )}
      {kind === 'sip' && (
        <g class="iv-tell__cup">
          <path d="M22 50 L25 64 L39 64 L42 50 Z" fill={CUP} stroke={INK} stroke-width="0.5" />
          <ellipse cx="32" cy="50" rx="10" ry="2.4" fill="#d4cfc4" stroke={INK} stroke-width="0.5" />
          <path d="M42 54 q6 1 4 7" fill="none" stroke={INK} stroke-width="0.6" />
          <path d="M16 64 L26 52" stroke={skin} stroke-width="5.5" stroke-linecap="round" />
        </g>
      )}
    </svg>
  );
});
