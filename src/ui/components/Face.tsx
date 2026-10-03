// Gezeichnetes Porträt einer Figur aus ihrem Aussehen (Look aus dem Kern, src/core/looks.ts): Kopf, Haare, Bart,
// Brille, Mütze, Kleidung, Extras. Flache Formen in einem 64er-Raster, damit es klein im Chat und groß im Profil
// gleich gut aussieht. Der Kreis drumherum (Bedeutungsfarbe) kommt vom Avatar.
// Haut-, Haar- und Kleidungsfarben sind Inhalt (wie Fotos), keine Bedeutungsfarben: deshalb feste Werte hier.

import { memo } from 'preact/compat';
import type { Look } from '../../core';

const SKIN = ['#f3d2b5', '#e6b896', '#cf9a72', '#ad7650', '#8a5536', '#603a25'];
const HAIR = ['#1c1716', '#3a271b', '#68462b', '#d2ad62', '#a9472a', '#9b9b9b', '#e8e5de'];
/** Passend zu TOP_COLOR_NAMES im Kern: Dunkelblau, Schwarz, Grau, Oliv, Weinrot, Senfgelb, Weiß, Petrol. */
const TOP = ['#24324f', '#1d1d22', '#5d6470', '#556043', '#6e2a35', '#c9a13a', '#e9e6df', '#1f5e63'];
const INK = '#221a18';
const GOLD = '#e2b64a';

/** Farbe abdunkeln (factor < 1) oder aufhellen (> 1). */
function tint(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

function HairBack(props: { look: Look; color: string }) {
  const { look, color } = props;
  if (look.hat === 'hood') return null;
  switch (look.hair) {
    case 'long':
      return (
        <path
          d="M18.5 28 Q18 13 32 13 Q46 13 45.5 28 L46.5 45 Q41 47 39 42 L25 42 Q23 47 17.5 45 Z"
          fill={tint(color, 0.85)}
        />
      );
    case 'afro':
      return <circle cx="32" cy="22" r="16.5" fill={color} />;
    case 'bun':
      return <circle cx="32" cy="10.8" r="5.4" fill={color} />;
    case 'ponytail':
      return <ellipse cx="44.5" cy="33" rx="3.6" ry="9" fill={tint(color, 0.85)} transform="rotate(-14 44.5 33)" />;
    default:
      return null;
  }
}

function HairFront(props: { look: Look; color: string }) {
  const { look, color } = props;
  if (look.hat === 'hood' && look.hair !== 'long') return null;
  switch (look.hair) {
    case 'bald':
      // Ältere mit Glatze: ein Haarkranz an den Seiten.
      return look.age >= 45 ? (
        <g fill={color}>
          <path d="M20.4 30 Q20 24 22.4 21.5 Q22.2 26 23 30 Z" />
          <path d="M43.6 30 Q44 24 41.6 21.5 Q41.8 26 41 30 Z" />
        </g>
      ) : (
        <path d="M26 17.5 Q30 16 33 16.4" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.4" fill="none" />
      );
    case 'buzz':
      return (
        <path
          d="M20.6 25.5 Q21 15.4 32 15.2 Q43 15.4 43.4 25.5 Q40.5 18.6 32 18.4 Q23.5 18.6 20.6 25.5 Z"
          fill={color}
          opacity="0.85"
        />
      );
    case 'short':
      return <path d="M20.3 27 Q19.5 14.2 32 14 Q44.5 14.2 43.7 27 Q42 20 32 19.6 Q24 19.8 20.3 27 Z" fill={color} />;
    case 'side':
      return (
        <path
          d="M20.3 27.5 Q19 14 32 14 Q45 14 43.7 27.5 Q43 21 39.5 19.4 Q31 22.6 22.2 21 Q20.8 23.8 20.3 27.5 Z"
          fill={color}
        />
      );
    case 'slick':
      return (
        <g>
          <path d="M20.6 25 Q20 13.8 32 13.6 Q44 13.8 43.4 25 Q41 17.8 32 17.4 Q23 17.8 20.6 25 Z" fill={color} />
          <path d="M27 15.6 Q32 14.6 37 15.6" stroke="#ffffff" stroke-opacity="0.3" stroke-width="0.9" fill="none" />
        </g>
      );
    case 'curly':
      return (
        <g fill={color}>
          {[
            [21, 22],
            [23, 17.5],
            [27, 14.8],
            [32, 13.8],
            [37, 14.8],
            [41, 17.5],
            [43, 22],
            [29.5, 18],
            [34.5, 18],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.6" />
          ))}
        </g>
      );
    case 'afro':
      return <path d="M19.8 26 Q19 13 32 13 Q45 13 44.2 26 Q41 18.8 32 18.6 Q23 18.8 19.8 26 Z" fill={color} />;
    default:
      // Lang, Zopf, Dutt: Pony vorne.
      return (
        <path
          d="M20.3 29 Q19.5 14 32 14 Q44.5 14 43.7 29 Q42.4 19.4 33.5 18.6 Q27 21.8 21.6 21.6 Q20.6 25 20.3 29 Z"
          fill={color}
        />
      );
  }
}

function Beard(props: { look: Look; color: string }) {
  const { look, color } = props;
  const moustache = <path d="M27.4 36.4 Q32 34.2 36.6 36.4 Q34.2 37.3 32 36.5 Q29.8 37.3 27.4 36.4 Z" fill={color} />;
  switch (look.beard) {
    case 'stubble':
      return (
        <path
          d="M21.4 30.5 Q22 41.6 32 42 Q42 41.6 42.6 30.5 Q41 37.2 37 37.6 Q32 36 27 37.6 Q23 37.2 21.4 30.5 Z"
          fill={color}
          opacity="0.38"
        />
      );
    case 'full':
      return (
        <g>
          <path
            d="M20.8 27.5 Q20.4 44.5 32 45.4 Q43.6 44.5 43.2 27.5 Q42 35.4 38 36.6 Q32 34.6 26 36.6 Q22 35.4 20.8 27.5 Z"
            fill={color}
          />
          {moustache}
        </g>
      );
    case 'moustache':
      return moustache;
    case 'goatee':
      return (
        <g>
          {moustache}
          <path d="M29.4 39 Q32 44 34.6 39 Q32 40.4 29.4 39 Z" fill={color} />
        </g>
      );
    default:
      return null;
  }
}

function Glasses(props: { look: Look }) {
  switch (props.look.glasses) {
    case 'round':
      return (
        <g stroke={INK} stroke-width="1.1" fill="#ffffff" fill-opacity="0.12">
          <circle cx="27.4" cy="29" r="3.4" />
          <circle cx="36.6" cy="29" r="3.4" />
          <path d="M30.8 28.6 Q32 27.8 33.2 28.6" fill="none" />
        </g>
      );
    case 'square':
      return (
        <g stroke={INK} stroke-width="1.1" fill="#ffffff" fill-opacity="0.12">
          <rect x="23.6" y="26.4" width="7.4" height="5.4" rx="1.2" />
          <rect x="33" y="26.4" width="7.4" height="5.4" rx="1.2" />
          <path d="M31 28.4 L33 28.4" fill="none" />
        </g>
      );
    case 'sun':
      return (
        <g>
          <path
            d="M23 26.6 H31 Q31 32.4 27 32.4 Q23 32.4 23 26.6 Z M33 26.6 H41 Q41 32.4 37 32.4 Q33 32.4 33 26.6 Z"
            fill="#15171c"
          />
          <path d="M31 27.4 L33 27.4" stroke="#15171c" stroke-width="1.2" />
          <path d="M24.6 28 L26.4 28 M34.6 28 L36.4 28" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.8" />
        </g>
      );
    default:
      return null;
  }
}

function Hat(props: { look: Look; top: string }) {
  switch (props.look.hat) {
    case 'cap': {
      const cap = tint(props.top, 1.15);
      return (
        <g>
          <path d="M19.8 22.4 Q20 11.4 32 11.4 Q44 11.4 44.2 22.4 Z" fill={cap} />
          <path d="M19 21.8 Q32 19.6 45.6 22.6 Q48.4 24.8 44 24.4 Q32 22.8 19.4 23.8 Z" fill={tint(cap, 0.75)} />
          <circle cx="32" cy="11.8" r="1.1" fill={tint(cap, 0.7)} />
        </g>
      );
    }
    case 'beanie': {
      const wool = tint(props.top, 1.2);
      return (
        <g>
          <path d="M19.6 23.6 Q19.4 10.6 32 10.6 Q44.6 10.6 44.4 23.6 Z" fill={wool} />
          <rect x="19" y="20.4" width="26" height="4.6" rx="2" fill={tint(wool, 0.82)} />
        </g>
      );
    }
    case 'skipper':
      // Elbsegler: dunkelblaue Mütze mit schwarzem Lackschirm und Abzeichen.
      return (
        <g>
          <path d="M19.4 20.6 Q18.8 12.8 32 12.2 Q45.2 12.8 44.6 20.6 L44 22 L20 22 Z" fill="#1f2a44" />
          <rect x="19.8" y="19.6" width="24.4" height="2.6" fill="#141b2e" />
          <path d="M20.2 21.8 Q32 20.4 43.8 21.8 Q43 25.4 32 24.6 Q21 25.4 20.2 21.8 Z" fill="#0d0d10" />
          <path d="M24 22.6 Q32 21.8 38 22.4" stroke="#ffffff" stroke-opacity="0.3" stroke-width="0.7" fill="none" />
          <circle cx="32" cy="16.8" r="1.6" fill={GOLD} />
        </g>
      );
    default:
      return null;
  }
}

function Top(props: { look: Look; color: string; skin: string }) {
  const { look, color } = props;
  const dark = tint(color, 0.78);
  const body = <path d="M6 64 C7 52 17 45.6 32 45.6 C47 45.6 57 52 58 64 Z" fill={color} />;
  switch (look.top) {
    case 'hoodie':
      return (
        <g>
          {body}
          <path d="M19.6 47.6 Q32 55 44.4 47.6 Q40 44 32 44 Q24 44 19.6 47.6 Z" fill={dark} />
          <path d="M29.4 50.4 L29 56.6 M34.6 50.4 L35 56.6" stroke="#ffffff" stroke-opacity="0.7" stroke-width="0.8" />
        </g>
      );
    case 'jacket':
      return (
        <g>
          {body}
          <path d="M32 47 L32 64" stroke={dark} stroke-width="1.2" />
          <path d="M24 46.4 L29 52 L32 47 Z M40 46.4 L35 52 L32 47 Z" fill={dark} />
        </g>
      );
    case 'suit':
      return (
        <g>
          {body}
          <path d="M26.6 45.6 L32 57 L37.4 45.6 Z" fill="#eeeae2" />
          <path d="M31 48.6 L33 48.6 L33.8 55 L32 57 L30.2 55 Z" fill={tint(color === TOP[6] ? TOP[0] : color, 0.6)} />
          <path d="M24.6 46 L30.4 55 L27.4 49.6 Z M39.4 46 L33.6 55 L36.6 49.6 Z" fill={dark} />
        </g>
      );
    case 'raincoat':
      return (
        <g>
          {body}
          <path d="M22.4 43.6 L25.6 50.6 L32 47.2 L38.4 50.6 L41.6 43.6 Q32 47 22.4 43.6 Z" fill={dark} />
          <circle cx="32" cy="53" r="1" fill={tint(color, 1.5)} />
          <circle cx="32" cy="58.4" r="1" fill={tint(color, 1.5)} />
        </g>
      );
    case 'tracksuit':
      return (
        <g>
          {body}
          <path d="M32 46.4 L32 64" stroke="#e8e5de" stroke-opacity="0.8" stroke-width="0.9" />
          <path
            d="M13 53 Q17 48.6 22 47.4 M14.8 55.2 Q18.6 50.6 23.4 49.2"
            stroke="#e8e5de"
            stroke-width="1.1"
            fill="none"
          />
          <path
            d="M51 53 Q47 48.6 42 47.4 M49.2 55.2 Q45.4 50.6 40.6 49.2"
            stroke="#e8e5de"
            stroke-width="1.1"
            fill="none"
          />
        </g>
      );
    default:
      // T-Shirt mit rundem Ausschnitt.
      return (
        <g>
          {body}
          <path d="M26.4 45.8 Q32 51.4 37.6 45.8 Z" fill={props.skin} />
          <path d="M26.4 45.8 Q32 51.4 37.6 45.8" stroke={dark} stroke-width="1" fill="none" />
        </g>
      );
  }
}

function Extra(props: { look: Look }) {
  switch (props.look.extra) {
    case 'scar':
      return (
        <g stroke="#a2574a" stroke-width="0.9" stroke-linecap="round">
          <path d="M24.2 31.2 L26.8 35.4" />
          <path d="M24.6 33.6 L26 32.8 M25.4 34.8 L26.8 34" stroke-width="0.6" />
        </g>
      );
    case 'earring':
      return <circle cx="43.8" cy="32.6" r="1" fill={GOLD} />;
    case 'chain':
      return <path d="M25.6 46 Q32 52.6 38.4 46" stroke={GOLD} stroke-width="1.3" fill="none" />;
    case 'tattoo':
      return (
        <path d="M34.6 39.6 Q36.6 40.6 35.4 42.4 Q34.2 44 36 44.6" stroke="#2f4b5e" stroke-width="1" fill="none" />
      );
    default:
      return null;
  }
}

/** Porträt als SVG. Füllt den Avatar-Kreis. */
export const Face = memo(function Face(props: { look: Look }) {
  const look = props.look;
  const skin = SKIN[look.skin] ?? SKIN[1];
  const shade = tint(skin, 0.86);
  const hair = HAIR[look.hairColor] ?? HAIR[0];
  const top = TOP[look.topColor] ?? TOP[0];
  const narrow = look.feminine ? 0.6 : 0;
  return (
    <svg class="ui-face" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {look.hat === 'hood' && <path d="M14.6 44 Q13.4 9.6 32 9.2 Q50.6 9.6 49.4 44 Z" fill={tint(top, 0.85)} />}
      <HairBack look={look} color={hair} />
      <rect x="27.4" y="35" width="9.2" height="11" rx="3" fill={shade} />
      <Top look={look} color={top} skin={skin} />
      <ellipse cx={20.6 + narrow} cy="29.4" rx="2.3" ry="3.3" fill={shade} />
      <ellipse cx={43.4 - narrow} cy="29.4" rx="2.3" ry="3.3" fill={shade} />
      <ellipse cx="32" cy="28" rx={11.6 - narrow} ry="13.6" fill={skin} />
      {look.feminine && (
        <g fill="#e0645a" opacity="0.18">
          <circle cx="25.4" cy="34" r="2.4" />
          <circle cx="38.6" cy="34" r="2.4" />
        </g>
      )}
      {look.age >= 50 && (
        <g stroke={tint(skin, 0.72)} stroke-width="0.6" fill="none" stroke-linecap="round">
          <path d="M27.6 20.6 Q32 19.6 36.4 20.6" />
          <path d="M23.4 30.6 L22.4 31.4 M40.6 30.6 L41.6 31.4" />
        </g>
      )}
      <Beard look={look} color={hair} />
      <g fill={INK}>
        <ellipse cx="27.4" cy="29" rx="1.3" ry="1.5" />
        <ellipse cx="36.6" cy="29" rx="1.3" ry="1.5" />
      </g>
      <g stroke={tint(hair, look.hairColor >= 5 ? 0.75 : 0.9)} stroke-width="1.2" fill="none" stroke-linecap="round">
        <path d="M24.8 25.4 Q27.4 24.2 30 25.2" />
        <path d="M34 25.2 Q36.6 24.2 39.2 25.4" />
      </g>
      <path d="M32.2 29.6 Q33.6 33.4 31.6 34.2" stroke={tint(skin, 0.7)} stroke-width="0.9" fill="none" />
      <path
        d="M29 37.6 Q32 39.4 35 37.6"
        stroke={look.feminine ? '#9c3f3c' : '#7a3f33'}
        stroke-width={look.feminine ? 1.4 : 1}
        fill="none"
        stroke-linecap="round"
      />
      <HairFront look={look} color={hair} />
      {look.hat === 'hood' && (
        <path d="M17.6 40 Q16.4 13.6 32 13 Q47.6 13.6 46.4 40" stroke={tint(top, 0.7)} stroke-width="2" fill="none" />
      )}
      <Glasses look={look} />
      <Hat look={look} top={top} />
      <Extra look={look} />
    </svg>
  );
});
