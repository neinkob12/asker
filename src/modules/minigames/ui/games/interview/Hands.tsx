// Bewerbungsgespräch (Auftrag 49, Teil E): Unterarme und Hände der Person auf dem Tisch, dazu ihr Becher. Die Haltung
// zeigt den Druck (locker auseinander, angespannt näher beisammen, macht zu: Arme verschränkt) und die Gesten: Finger
// trommeln (Zappeln), Schulterzucken (Hände hoch, offen), Vorbeugen (Arme nach vorn); beim Kratzen am Hals und beim
// Schluck ist die rechte Hand oben am Porträt (Tells.tsx), dann fehlt sie hier bzw. der Becher.
// Ein SVG unter dem Porträt; die Haltungen sind CSS (data-pose, data-cue), nichts rendert pro Bild.
// Haut und Ärmel aus LOOK_COLORS (Inhalt wie im Porträt), Schatten und Glanz als feste, gedeckte Werte.

import { memo } from 'preact/compat';
import type { Look } from '../../../../../core';
import { LOOK_COLORS } from '../../../../../ui';
import type { CueKind, Zone } from './model';

const INK = '#1c1513';
const CUP = '#e9e5dc';
const CUP_SHADE = '#b9b3a6';
const COFFEE = '#3a2418';

/** Farbe heller (k > 1) oder dunkler (k < 1). */
function tint(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Ein Arm (links im Bild): Ärmel vom Ellbogen am Tischrand schräg zur Mitte, Bündchen, Hand mit vier Fingern. */
function Arm(props: { side: 'l' | 'r'; sleeve: string; skin: string }) {
  const { side, sleeve, skin } = props;
  return (
    <g class={`iv-arm is-${side}`}>
      {/* Schatten des Arms auf dem Tisch (zum Licht weg, nach unten). */}
      <path d="M38 9 L64 30" stroke="#000000" stroke-opacity="0.16" stroke-width="13" stroke-linecap="round" />
      {/* Unterarm im Ärmel: am Ellbogen breit, zum Handgelenk schmaler. */}
      <path
        d="M31.5 9.4 L57.1 27.5 L62.9 20.5 L40.5 -1.4 A7 7 0 0 0 31.5 9.4 Z"
        fill={sleeve}
        stroke={tint(sleeve, 0.6)}
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <path d="M33 10 L56.6 26.8" stroke={tint(sleeve, 0.72)} stroke-width="3" stroke-linecap="round" />
      <path
        d="M40.2 0.6 L61.4 20.6"
        stroke={tint(sleeve, 1.32)}
        stroke-width="1.6"
        stroke-linecap="round"
        opacity="0.6"
      />
      <path d="M56 21.4 L63.6 27" stroke={tint(sleeve, 0.55)} stroke-width="5" stroke-linecap="round" />
      <g class="iv-hand">
        <path
          d="M61 23.6 C64.6 21.4 71 22.4 73.4 25.6 C75 28 74.2 32 71 32.8 C67.6 33.6 62.6 32 61 29.4 C59.8 27.6 59.8 25 61 23.6 Z"
          fill={skin}
          stroke={INK}
          stroke-width="0.5"
        />
        <g class="iv-fingers" stroke={tint(skin, 0.74)} stroke-width="0.6" stroke-linecap="round" fill="none">
          <path class="iv-finger is-1" d="M67.4 25.4 L73 26.6" />
          <path class="iv-finger is-2" d="M67 27.6 L73.8 29.2" />
          <path class="iv-finger is-3" d="M66.4 29.8 L72.6 31.6" />
        </g>
        <path d="M62.6 23.8 C65.2 22.6 68.6 22.8 71 24" stroke={tint(skin, 1.18)} stroke-width="0.9" fill="none" />
        <path d="M61.6 28.4 C59.6 30 59.4 32.2 61 32.8" stroke={tint(skin, 0.86)} stroke-width="1.5" fill="none" />
      </g>
    </g>
  );
}

export const Hands = memo(function Hands(props: { look: Look; pose: Zone | 'idle'; cue: CueKind | null }) {
  const { look, pose, cue } = props;
  const skin = LOOK_COLORS.skin[look.skin] ?? LOOK_COLORS.skin[1];
  const sleeve = LOOK_COLORS.top[look.topColor] ?? LOOK_COLORS.top[0];
  return (
    <svg
      class="iv-hands"
      viewBox="0 0 160 60"
      data-pose={pose}
      data-cue={cue ?? 'none'}
      aria-hidden="true"
      focusable="false"
    >
      <g class="iv-cup" transform="translate(-2 6) scale(0.8)">
        <ellipse cx="28" cy="36" rx="9" ry="2.6" fill="#000000" opacity="0.3" />
        <path d="M20 22 L21.4 35 Q28 37.6 34.6 35 L36 22 Z" fill={CUP} stroke={INK} stroke-width="0.6" />
        <path d="M30.6 23 L31.6 35.4" stroke={CUP_SHADE} stroke-width="3" opacity="0.7" />
        <ellipse cx="28" cy="22" rx="8" ry="2.2" fill={CUP_SHADE} stroke={INK} stroke-width="0.6" />
        <ellipse cx="28" cy="22.4" rx="6.4" ry="1.5" fill={COFFEE} />
        <path d="M36 25 q5 1 3.6 6 q-1 2.6 -4.2 2.4" fill="none" stroke={INK} stroke-width="0.7" />
        <path d="M22.4 24 L23.4 33" stroke="#ffffff" stroke-width="1" opacity="0.6" />
      </g>
      <Arm side="l" sleeve={sleeve} skin={skin} />
      <g transform="translate(160 0) scale(-1 1)">
        <Arm side="r" sleeve={sleeve} skin={skin} />
      </g>
    </svg>
  );
});
