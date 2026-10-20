// Zivi oder Kunde (Auftrag 44, Teil 5): Was man an einer Person sieht, gezeichnet. Über dem Porträt (Face, gleiches
// 64er-Raster) der Knopf im Ohr, das Kabel am Kragen und Kopfhörer um den Hals. Seit Auftrag 48 (Teil E) die ganze
// Figur: Unter dem Porträt Rumpf, Arme mit Händen, Beine und Schuhe (Body), dazu, was jemand dabei hat (Bierdose, Handy,
// Kleingeld, Sporttasche, Hund, E-Roller) und die Beule am Gürtel. Kleidungs- und Hautfarben sind Inhalt wie im
// Porträt (LOOK_COLORS); Linien, Glanz und Schatten feste, gedeckte Werte.

import { memo } from 'preact/compat';
import type { Look } from '../../../../../core';
import { LOOK_COLORS } from '../../../../../ui';
import type { Person } from './model';

const TOP = LOOK_COLORS.top;
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

/** Farbe heller (k > 1) oder dunkler (k < 1). */
function tint(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

const CAN = '#c9ccd2';
const CAN_BAND = '#b33b2e';
const SCREEN = '#9fd0ff';
const COIN = '#d9b25a';
const BAG = '#2b2f3a';
const DOG = '#8a6a48';
const SCOOTER = '#3a3d45';

/** Hand als weiche Form mit Glanz oben und Schatten unten (cx, cy Mitte). */
function Hand(props: { x: number; y: number; skin: string; open?: boolean }) {
  const { x, y, skin, open } = props;
  return (
    <g class="uc-hand">
      <ellipse cx={x} cy={y} rx={open ? 4.4 : 3.5} ry={open ? 3 : 4.3} fill={skin} stroke={INK} stroke-width="0.4" />
      <path
        d={`M${x - 2.4} ${y - 2} Q${x} ${y - 3.6} ${x + 2.4} ${y - 2}`}
        stroke={tint(skin, 1.2)}
        stroke-width="0.8"
        fill="none"
      />
      {!open && (
        <path d={`M${x - 1.6} ${y + 1.6} L${x + 1.8} ${y + 2.2}`} stroke={tint(skin, 0.75)} stroke-width="0.6" />
      )}
    </g>
  );
}

/**
 * Unter dem Porträt (gleiches Raster, x 0 bis 64 wie Face, y 0 = Unterkante des Porträts): Rumpf, Arme, Hände, Beine,
 * Schuhe und was jemand dabei hat. viewBox mit Rand links (Hund) und rechts (E-Roller).
 */
export const Body = memo(function Body(props: { person: Person }) {
  const { person } = props;
  const { look, shows } = person;
  const top = TOP[look.topColor] ?? TOP[0];
  const dark = tint(top, 0.68);
  const light = tint(top, 1.28);
  const skin = LOOK_COLORS.skin[look.skin] ?? LOOK_COLORS.skin[1];
  const jeans = JEANS[person.index % JEANS.length];
  const bulky = look.top === 'puffer';
  // Schultern wie im Porträt: Ärmel außen, dazwischen der Rumpf.
  const lo = bulky ? 3 : 6;
  const li = bulky ? 14 : 15;
  const shoe = person.shoes;
  const sole = shoe === 'new' ? '#ffffff' : shoe === 'worn' ? '#8d8a82' : '#d9d6cf';
  const upper = shoe === 'new' ? '#f4f4f2' : shoe === 'worn' ? '#6f6b63' : '#30323a';
  const phone = !!shows.phone;
  const coins = !!shows.coins;
  // Bierdose in der freien Hand (rechts, sonst links).
  const beerRight = !!shows.beer && !phone;
  const beerLeft = !!shows.beer && phone && !coins;
  const g = `uc-shade-${person.index}`;
  const sleeve = (side: 1 | -1) => {
    const m = (x: number) => (side === 1 ? x : 64 - x);
    return `M${m(lo)} 0 L${m(li)} 0 L${m(li + 0.6)} 29.6 L${m(lo + 2.4)} 31 Q${m(lo + 0.4)} 16 ${m(lo)} 0 Z`;
  };
  return (
    <svg class="uc-body" viewBox="-24 0 112 84" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />
          <stop offset="0.45" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="1" stop-color="#000000" stop-opacity="0.38" />
        </linearGradient>
      </defs>
      <ellipse class="uc-body__ground" cx="32" cy="80.6" rx="27" ry="3.2" />
      {shows.scooter && (
        <g class="uc-body__scooter">
          <path d="M58 78.6 L84 78.6" stroke={SCOOTER} stroke-width="2.2" stroke-linecap="round" />
          <path d="M82.6 78 L79.4 26" stroke={SCOOTER} stroke-width="1.8" stroke-linecap="round" />
          <path d="M74 25.4 L86 26.6" stroke={INK} stroke-width="2" stroke-linecap="round" />
          <circle cx="60.6" cy="80.4" r="2.8" fill={INK} />
          <circle cx="82.4" cy="80.4" r="2.8" fill={INK} />
          <path d="M80.4 40 L81.6 58" stroke="#5ec46f" stroke-width="0.9" opacity="0.8" />
        </g>
      )}
      {/* Beine und Schuhe: stehen fest, Nervöse treten von einem Fuß auf den anderen. */}
      <g class={`uc-legs${shows.feet ? ' is-feet' : ''}`}>
        <path class="uc-leg is-l" d="M16.4 23 L31.4 23 L30.2 71.6 L19.6 71.6 Z" fill={jeans} />
        <path class="uc-leg is-r" d="M32.6 23 L47.6 23 L44.4 71.6 L33.8 71.6 Z" fill={jeans} />
        <path d="M31.4 23 L32.6 23 L32 40 Z" fill="#000000" opacity="0.35" />
        <path d="M40 24 L42.4 70" stroke="#000000" stroke-opacity="0.22" stroke-width="3" />
        <path d="M21 25 L22.4 70" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" />
        {[1, -1].map((side) => (
          <g
            key={`${side}-${shoe}`}
            class={`uc-shoe ${side === 1 ? 'is-l' : 'is-r'}${shoe === 'plain' ? '' : ' uc-body__shoes'}`}
            transform={side === 1 ? undefined : 'translate(64 0) scale(-1 1)'}
          >
            <path d="M19 71 L30.6 71 Q31.6 74.6 30.8 77.8 L13.6 77.8 Q12.8 74.4 19 71 Z" fill={upper} />
            <rect x="13" y="77.4" width="18.4" height="2.6" rx="1.2" fill={sole} />
            {shoe === 'new' && (
              <g>
                <path d="M16 74.2 Q21 72.4 27 73" stroke="#ffffff" stroke-width="1" fill="none" />
                <path d="M27.4 74.6 L29.6 76.6" stroke="#c9a33c" stroke-width="1.2" />
                <circle cx="17.6" cy="75.4" r="0.7" fill="#ffffff" />
              </g>
            )}
            {shoe === 'worn' && (
              <path d="M17 75 L19 76 M22.4 73.4 L23.4 75 M27.6 75.6 L29.4 75" stroke="#3d3a35" stroke-width="0.7" />
            )}
          </g>
        ))}
      </g>
      {/* Oberkörper: atmet und verlagert das Gewicht (CSS). */}
      <g class="uc-upper">
        <path d={`M${li - 1} 0 L${65 - li} 0 L49.4 22.6 Q32 25.4 14.6 22.6 Z`} fill={top} />
        <path d={`M${li - 1} 0 L${65 - li} 0 L49.4 22.6 Q32 25.4 14.6 22.6 Z`} fill={`url(#${g})`} />
        <path d="M14.6 22.4 Q32 25.2 49.4 22.4" stroke={dark} stroke-width="1.4" fill="none" />
        {look.top === 'jacket' || look.top === 'leather' || look.top === 'bomber' || look.top === 'puffer' ? (
          <path d="M32 0 L32 24.6" stroke={dark} stroke-width="0.9" />
        ) : (
          <path d="M22 4 Q32 7 42 4" stroke={dark} stroke-width="0.6" fill="none" opacity="0.6" />
        )}
        {shows.belt && (
          <g class="uc-body__bulge">
            <path d="M40.6 13.6 Q47 12 50.6 15.6 Q51.6 21.6 46.4 23 Q41.6 22.4 40.6 18 Z" fill={top} />
            <path
              d="M41.6 21 Q46.6 23.4 50 18.6"
              stroke="#000000"
              stroke-opacity="0.4"
              stroke-width="0.9"
              fill="none"
            />
            <path
              d="M43 15 Q46.6 14.2 49.4 16.4"
              stroke="#ffffff"
              stroke-opacity="0.25"
              stroke-width="0.9"
              fill="none"
            />
          </g>
        )}
        {shows.bag && (
          <g class="uc-body__bag">
            <path d="M12 0 L49 17" stroke={BAG} stroke-width="2.4" />
            <path d="M12 -0.6 L49 16.4" stroke="#ffffff" stroke-opacity="0.12" stroke-width="0.8" />
            <rect x="45" y="14" width="21" height="14" rx="4" fill={BAG} stroke={INK} stroke-width="0.5" />
            <path d="M47 18 L64 18" stroke="#8b8f99" stroke-width="0.6" />
            <path d="M48 24 Q55.5 26.6 63 24" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1.2" fill="none" />
          </g>
        )}
        {/* Linker Arm (im Bild links): hängt, oder hält Kleingeld vor dem Bauch. */}
        <g class="uc-arm is-l">
          {coins ? (
            <g>
              <path d={`M${lo} 0 L${li} 0 L${li + 1} 14 L${lo + 2} 16 Z`} fill={top} />
              <path d={`M${lo + 1} 0 L${lo + 2} 16`} stroke={light} stroke-opacity="0.35" stroke-width="1.2" />
              <path d="M10 14.6 L23 11.8" stroke={top} stroke-width="7.6" stroke-linecap="round" />
              <path d="M10.6 17.6 L23 14.8" stroke={dark} stroke-width="1.6" stroke-linecap="round" />
              <Hand x={25.6} y={12.2} skin={skin} open />
              <g class="uc-body__coins">
                <ellipse cx="24.2" cy="10.6" rx="1.5" ry="0.8" fill={COIN} stroke={INK} stroke-width="0.3" />
                <ellipse cx="26.8" cy="11.2" rx="1.5" ry="0.8" fill={COIN} stroke={INK} stroke-width="0.3" />
                <ellipse cx="25.6" cy="9.8" rx="1.5" ry="0.8" fill={tint(COIN, 1.15)} stroke={INK} stroke-width="0.3" />
              </g>
            </g>
          ) : (
            <g>
              <path d={sleeve(1)} fill={top} />
              <path d={`M${lo + 1} 1 L${lo + 2.6} 29`} stroke={light} stroke-opacity="0.35" stroke-width="1.4" />
              <path d={`M${lo + 2.2} 29.6 L${li + 0.6} 28.4`} stroke={dark} stroke-width="1.6" />
              {beerLeft && <Beer x={(lo + li) / 2 + 1} y={39.4} />}
              <Hand x={(lo + li) / 2 + 1} y={33.6} skin={skin} />
            </g>
          )}
        </g>
        {/* Rechter Arm: hängt (mit Dose), oder hält das Handy vor sich. */}
        <g class="uc-arm is-r">
          {phone ? (
            <g>
              <path d={`M${64 - li} 0 L${64 - lo} 0 L${62 - lo} 16 L${63 - li} 14 Z`} fill={top} />
              <path d={`M${63 - lo} 0 L${62 - lo} 16`} stroke={dark} stroke-opacity="0.6" stroke-width="1.4" />
              <path d="M54 14.6 L41 11.8" stroke={top} stroke-width="7.6" stroke-linecap="round" />
              <path d="M53.4 17.6 L41 14.8" stroke={dark} stroke-width="1.6" stroke-linecap="round" />
              <Hand x={38.6} y={12.4} skin={skin} />
              <g class="uc-body__phone">
                <rect x="35.4" y="5.6" width="6.4" height="10" rx="1.2" fill={INK} />
                <rect x="36.2" y="6.6" width="4.8" height="8" rx="0.6" fill={SCREEN} />
                <path d="M36.6 8 L40.4 8 M36.6 9.8 L39.6 9.8" stroke="#ffffff" stroke-width="0.5" opacity="0.8" />
              </g>
            </g>
          ) : (
            <g>
              <path d={sleeve(-1)} fill={top} />
              <path d={sleeve(-1)} fill="#000000" opacity="0.18" />
              <path d={`M${61.8 - lo} 29.6 L${63.4 - li} 28.4`} stroke={dark} stroke-width="1.6" />
              {beerRight && <Beer x={63 - (lo + li) / 2} y={39.4} />}
              <Hand x={63 - (lo + li) / 2} y={33.6} skin={skin} />
            </g>
          )}
        </g>
      </g>
      {shows.dog && (
        <g class="uc-body__dog">
          <path d={`M-6 66 Q2 50 ${(lo + li) / 2 + 1} 37`} stroke={INK} stroke-width="0.6" fill="none" />
          <ellipse cx="-12" cy="72" rx="9" ry="5" fill={DOG} />
          <path class="uc-body__tail" d="M-20 70 Q-25 64 -23 61" stroke={DOG} stroke-width="2.2" fill="none" />
          <path d="M-18 74 L-18.6 80 M-14 75 L-14 80.6 M-8 75 L-8 80.6 M-5 74 L-4.4 80" stroke={DOG} stroke-width="2" />
          <ellipse cx="-4" cy="64.6" rx="4.6" ry="4" fill={DOG} />
          <path d="M-0.6 65 Q2.4 66 2 67.6 Q-0.4 68.4 -2 67" fill={tint(DOG, 0.8)} />
          <path d="M-7 61.6 L-8.4 66 L-5.6 64.4 Z" fill={tint(DOG, 0.6)} />
          <circle cx="-2.6" cy="63.4" r="0.6" fill={INK} />
          <path d="M-7.6 67.6 Q-4 69.4 -0.8 67.8" stroke="#c24a3a" stroke-width="0.9" fill="none" />
          <path d="M-18 69 Q-12 66.6 -6 68.6" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1.4" fill="none" />
        </g>
      )}
    </svg>
  );
});

/** Bierdose in der Hand (Mitte der Hand). */
function Beer(props: { x: number; y: number }) {
  const { x, y } = props;
  return (
    <g class="uc-body__beer">
      <rect x={x - 2.7} y={y - 6.4} width="5.4" height="9.4" rx="1.1" fill={CAN} stroke={INK} stroke-width="0.35" />
      <rect x={x - 2.7} y={y - 2.6} width="5.4" height="3" fill={CAN_BAND} />
      <path d={`M${x - 1.6} ${y - 6} L${x - 1.6} ${y + 2.4}`} stroke="#ffffff" stroke-width="0.6" opacity="0.7" />
    </g>
  );
}
