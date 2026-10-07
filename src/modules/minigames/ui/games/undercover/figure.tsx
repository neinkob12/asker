// Zivi oder Kunde (Auftrag 44, Teil 5): Was man an einer Person sieht, gezeichnet. Über dem Porträt (Face, gleiches
// 64er-Raster) der Knopf im Ohr, das Kabel am Kragen und Kopfhörer um den Hals; am unteren Kartenrand Jacke, Gürtel
// (mit Beule) und Schuhe (nagelneu, ausgelatscht oder normal). Kleidungsfarben sind Inhalt wie im Porträt, deshalb
// feste, gedeckte Werte hier (dieselben wie TOP in src/ui/components/Face.tsx); die Linien und Glanzlichter auch.

import { memo } from 'preact/compat';
import type { Look } from '../../../../../core';
import type { Person } from './model';

/** Wie TOP in Face.tsx (TOP_COLOR_NAMES im Kern): Dunkelblau, Schwarz, Grau, Oliv, Weinrot, Senfgelb, Weiß, Petrol. */
const TOP = ['#22304c', '#1b1b20', '#565c66', '#4f5a3e', '#672632', '#bf9834', '#e4e0d8', '#1d575c'];
const JEANS = ['#2c3a55', '#25262b', '#3b4a63', '#4a4740'];
const INK = '#141210';
const BUD = '#d8d4cc';
const CABLE = '#e9e6df';
const PHONES = '#2a2b30';

/** Halbe Kopfbreite wie in Face.tsx (Kopfform, Frauen etwas schmaler): für die Lage der Ohren. */
const HEAD_RX: Record<Look['face'], number> = { oval: 11.6, square: 11.9, narrow: 10.6, round: 12.4 };

function earX(look: Look): number {
  const rx = (HEAD_RX[look.face] ?? 11.6) - (look.feminine ? 0.6 : 0);
  return 32 + 11.4 * (rx / 11.6);
}

/** Über dem Porträt: Knopf im Ohr (rechts im Bild), Kabel am Kragen, Kopfhörer um den Hals. */
export const PortraitMarks = memo(function PortraitMarks(props: { person: Person }) {
  const { shows, look } = props.person;
  const x = earX(look);
  return (
    <svg class="uc-marks" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {shows.headphones && (
        <g>
          <path d="M22.6 47.6 Q32 55.4 41.4 47.6" fill="none" stroke={PHONES} stroke-width="1.8" />
          <rect x="19.6" y="43.2" width="5.2" height="6.8" rx="2.2" fill={PHONES} />
          <rect x="39.2" y="43.2" width="5.2" height="6.8" rx="2.2" fill={PHONES} />
          <rect x="20.6" y="44.2" width="1.6" height="4.6" rx="0.8" fill="#5c5f68" />
        </g>
      )}
      {shows.ear && (
        <g class="uc-marks__bud">
          <path
            d={`M${(x + 0.4).toFixed(1)} 31.4 C${(x + 2.8).toFixed(1)} 35 ${(x + 0.2).toFixed(1)} 38 ${(x + 1.6).toFixed(1)} 41.6 S${(x - 0.6).toFixed(1)} 46 ${(x + 0.8).toFixed(1)} 50`}
            fill="none"
            stroke={CABLE}
            stroke-width="0.7"
            stroke-dasharray="1.1 0.5"
            opacity="0.9"
          />
          <circle cx={x} cy="29.8" r="1.7" fill={BUD} stroke={INK} stroke-width="0.4" />
          <circle cx={x - 0.5} cy="29.3" r="0.5" fill="#ffffff" opacity="0.8" />
        </g>
      )}
      {shows.collar && (
        <g>
          <path
            d="M38.2 47 C40.4 49.4 36.6 51.4 39 53.6 S36.8 57.4 39.4 59.6 S37.6 62.6 38.8 64"
            fill="none"
            stroke={CABLE}
            stroke-width="0.9"
            stroke-dasharray="1.2 0.45"
          />
          <rect x="36.4" y="45.2" width="3.4" height="2.6" rx="0.7" fill={INK} stroke={CABLE} stroke-width="0.4" />
          <circle cx="38.1" cy="46.5" r="0.55" fill="#e0453a" />
        </g>
      )}
    </svg>
  );
});

/** Unterer Kartenrand: Jackensaum, Gürtel (mit Beule unter der Jacke), Beine und Schuhe. */
export const LowerBody = memo(function LowerBody(props: { person: Person }) {
  const { person } = props;
  const top = TOP[person.look.topColor] ?? TOP[0];
  const jeans = JEANS[person.index % JEANS.length];
  const bulge = !!person.shows.belt;
  const shoe = person.shoes;
  const sole = shoe === 'new' ? '#ffffff' : shoe === 'worn' ? '#8d8a82' : '#d9d6cf';
  const upper = shoe === 'new' ? '#f4f4f2' : shoe === 'worn' ? '#6f6b63' : '#30323a';
  return (
    <svg class="uc-body" viewBox="0 0 200 64" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      {/* Beine */}
      <path d="M66 0 L98 0 L96 46 L74 46 Z" fill={jeans} />
      <path d="M102 0 L134 0 L126 46 L104 46 Z" fill={jeans} />
      <path d="M98 0 L102 0 L101 20 Z" fill="#000000" opacity="0.25" />
      {/* Jackensaum und Gürtel */}
      <path d="M58 -2 L142 -2 L144 12 Q100 16 56 12 Z" fill={top} />
      <path d="M58 11 Q100 15 142 11" stroke="#000000" stroke-opacity="0.28" stroke-width="1.5" fill="none" />
      {bulge && (
        <g>
          <path d="M120 6 Q131 4 138 9 Q140 17 131 19 Q122 18 120 12 Z" fill={top} />
          <path d="M122 16 Q131 19 137 13" stroke="#000000" stroke-opacity="0.35" stroke-width="1.2" fill="none" />
          <path d="M126 9 Q131 8 135 11" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.2" fill="none" />
        </g>
      )}
      {/* Schuhe */}
      {[
        { x: 60, flip: false },
        { x: 104, flip: true },
      ].map(({ x, flip }) => (
        <g key={x} transform={flip ? `translate(${x + 36} 0) scale(-1 1)` : `translate(${x} 0)`}>
          <path d="M2 50 Q4 42 14 42 L26 42 Q36 44 38 52 L38 56 L2 56 Z" fill={upper} />
          <rect x="1" y="55" width="38" height="5" rx="2" fill={sole} />
          {shoe === 'new' && (
            <g>
              <path d="M8 46 Q16 43 26 44" stroke="#ffffff" stroke-width="1.6" fill="none" opacity="0.95" />
              <path d="M28 47 L33 52" stroke="#c9a33c" stroke-width="2" />
              <circle cx="11" cy="48" r="1.2" fill="#ffffff" />
            </g>
          )}
          {shoe === 'worn' && (
            <g stroke="#3d3a35" stroke-width="1" fill="none" opacity="0.8">
              <path d="M10 48 L14 50 M20 46 L22 49 M30 50 L33 49" />
              <path d="M4 58 L12 58" stroke="#5a564f" />
            </g>
          )}
          {shoe === 'plain' && (
            <path d="M10 46 Q18 44 26 45" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.2" />
          )}
        </g>
      ))}
    </svg>
  );
});
