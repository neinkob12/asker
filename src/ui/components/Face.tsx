// Gezeichnetes Porträt einer Figur aus ihrem Aussehen (Look aus dem Kern, src/core/looks.ts): Kopfform, Haare, Bart,
// Augen, Brauen, Mund, Brille, Kopfbedeckung, Kleidung, Narben, Tattoos, Kette, Zigarette … Flache Formen mit leichter
// Schattierung (Hals, Kiefer, Wangenknochen, Glanz im Haar) in einem 64er-Raster: Große Formen zuerst, damit das Gesicht
// auch bei 28 px im Chat lesbar bleibt; feine Details (Tattoo, Narbe, Rauch) dürfen dort verschwinden. Der Kreis drumherum
// (Bedeutungsfarbe) kommt vom Avatar. Haut-, Haar- und Kleidungsfarben sind Inhalt (wie Fotos), keine Bedeutungsfarben:
// deshalb feste, gedeckte Werte hier. Pro Porträt höchstens rund 70 Elemente, es steht in langen Listen.

import { memo } from 'preact/compat';
import type { FaceShape, Look } from '../../core';

const SKIN = ['#efcdb0', '#e0b18f', '#c8946c', '#a5704b', '#815034', '#5a3623'];
const HAIR = ['#1a1514', '#35241a', '#5f3f28', '#c6a35c', '#9d4327', '#8f8f8f', '#e1ded6'];
/** Passend zu TOP_COLOR_NAMES im Kern: Dunkelblau, Schwarz, Grau, Oliv, Weinrot, Senfgelb, Weiß, Petrol. */
const TOP = ['#22304c', '#1b1b20', '#565c66', '#4f5a3e', '#672632', '#bf9834', '#e4e0d8', '#1d575c'];
const INK = '#1c1513';
const GOLD = '#e0b24a';
const GOLD_DARK = '#a77d26';
const TATTOO = '#2b4557';
const SCAR = '#b4645a';
const SCLERA = '#ece6dc';
const LIP_M = '#7a3f33';
const LIP_F = '#8f3b3a';
const MOUTH_IN = '#3a1d1a';
const TEETH = '#f2eee4';
const SMOKE = '#d6d9dc';

/** Farbe abdunkeln (factor < 1) oder aufhellen (> 1). */
function tint(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

const K = 0.5523;
const CX = 32;
const CY = 28;

/** Kopfform: Breite, Höhe oben und unten, dazu wie eckig der Kiefer ist (k1, k2 = 0,55 ergibt eine Ellipse). */
interface HeadGeometry {
  rx: number;
  ryTop: number;
  ryBot: number;
  k1: number;
  k2: number;
}

const HEADS: Record<FaceShape, HeadGeometry> = {
  oval: { rx: 11.6, ryTop: 13.6, ryBot: 13.6, k1: K, k2: K },
  square: { rx: 11.9, ryTop: 13.6, ryBot: 13.3, k1: 0.86, k2: 0.7 },
  narrow: { rx: 10.6, ryTop: 13.8, ryBot: 14.2, k1: K, k2: 0.48 },
  round: { rx: 12.4, ryTop: 13.1, ryBot: 13.1, k1: 0.62, k2: 0.62 },
};

function headGeometry(look: Look): HeadGeometry {
  const g = HEADS[look.face] ?? HEADS.oval;
  return look.feminine ? { ...g, rx: g.rx - 0.6, k1: g.k1 - 0.08 } : g;
}

const f = (n: number) => n.toFixed(1);

/** Untere Kopfhälfte von links nach rechts (für Kopf und Kieferschatten dieselbe Kontur). */
function lowerHalf(g: HeadGeometry, scale = 1): string {
  const ry = g.ryBot * scale;
  return `C${f(CX - g.rx)} ${f(CY + ry * g.k1)} ${f(CX - g.rx * g.k2)} ${f(CY + ry)} ${CX} ${f(CY + ry)} C${f(CX + g.rx * g.k2)} ${f(CY + ry)} ${f(CX + g.rx)} ${f(CY + ry * g.k1)} ${f(CX + g.rx)} ${CY}`;
}

/** Dieselbe Hälfte von rechts nach links, etwas flacher (innere Kante des Kieferschattens). */
function lowerHalfBack(g: HeadGeometry, scale: number): string {
  const ry = g.ryBot * scale;
  return `C${f(CX + g.rx)} ${f(CY + ry * g.k1)} ${f(CX + g.rx * g.k2)} ${f(CY + ry)} ${CX} ${f(CY + ry)} C${f(CX - g.rx * g.k2)} ${f(CY + ry)} ${f(CX - g.rx)} ${f(CY + ry * g.k1)} ${f(CX - g.rx)} ${CY}`;
}

function headPath(g: HeadGeometry): string {
  const top = `C${f(CX + g.rx)} ${f(CY - g.ryTop * K)} ${f(CX + g.rx * K)} ${f(CY - g.ryTop)} ${CX} ${f(CY - g.ryTop)} C${f(CX - g.rx * K)} ${f(CY - g.ryTop)} ${f(CX - g.rx)} ${f(CY - g.ryTop * K)} ${f(CX - g.rx)} ${CY}`;
  return `M${f(CX - g.rx)} ${CY} ${lowerHalf(g)} ${top} Z`;
}

/** Schatten unter Kinn und Kiefer: Fläche zwischen der Kontur und derselben Kontur etwas flacher. */
function jawPath(g: HeadGeometry): string {
  return `M${f(CX - g.rx)} ${CY} ${lowerHalf(g)} ${lowerHalfBack(g, 0.84)} Z`;
}

/** Kleine runde Flecken als ein Pfad (drei Punkte an der Schläfe, Muster auf dem Bandana). */
function dots(points: [number, number][], r: number): string {
  return points.map(([x, y]) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`).join(' ');
}

// --- Haare -----------------------------------------------------------------------------------------------------------

function HairBack(props: { look: Look; color: string }) {
  const { look, color } = props;
  if (look.hat === 'hood' || look.hat === 'balaclava') return null;
  const dark = tint(color, 0.8);
  switch (look.hair) {
    case 'long':
      return (
        <g>
          <path d="M18.5 28 Q18 13 32 13 Q46 13 45.5 28 L46.5 46 Q41 48 39 43 L25 43 Q23 48 17.5 46 Z" fill={dark} />
          <path
            d="M20.6 30 Q21.4 40 21 45 M43.4 30 Q42.6 40 43 45"
            stroke={tint(color, 1.25)}
            stroke-width="0.7"
            fill="none"
            opacity="0.5"
          />
        </g>
      );
    case 'afro':
      return (
        <g>
          <circle cx="32" cy="22" r="17" fill={color} />
          <path d="M20 14 Q26 7.6 34 8.4" stroke={tint(color, 1.5)} stroke-width="1" fill="none" opacity="0.35" />
        </g>
      );
    case 'bun':
      return <circle cx="32" cy="10.6" r="5.4" fill={color} />;
    case 'tight':
      return <circle cx="43.2" cy="35.4" r="3.6" fill={dark} />;
    case 'ponytail':
      return (
        <g>
          <ellipse cx="44.6" cy="34" rx="3.6" ry="9.4" fill={dark} transform="rotate(-14 44.6 34)" />
          <path d="M43 27 Q46.6 33 45.4 41" stroke={tint(color, 1.3)} stroke-width="0.7" fill="none" opacity="0.45" />
        </g>
      );
    case 'braids':
      return (
        <g fill="none" stroke-linecap="round">
          <path d="M21.2 25 Q16.4 35 17.8 47.6 M42.8 25 Q47.6 35 46.2 47.6" stroke={dark} stroke-width="4" />
          <path
            d="M17 32.6 l2.6 1.1 M16.6 37.6 l2.6 1.1 M16.8 42.6 l2.6 1.1 M44.4 33.7 l2.6 -1.1 M44.8 38.7 l2.6 -1.1 M44.6 43.7 l2.6 -1.1"
            stroke={tint(color, 1.5)}
            stroke-width="0.7"
            opacity="0.45"
          />
        </g>
      );
    case 'dreads':
      return (
        <g fill="none" stroke={dark} stroke-width="3" stroke-linecap="round">
          <path d="M20.4 24 Q16.6 32 18 43 M43.6 24 Q47.4 32 46 43 M16.8 28 Q14.4 36 16.2 44 M47.2 28 Q49.6 36 47.8 44" />
          <path d="M24 20 Q19.6 30 20.4 42 M40 20 Q44.4 30 43.6 42" stroke={color} />
        </g>
      );
    case 'mullet':
      return (
        <g>
          <path d="M20.6 28 Q19.6 38 21.4 45.4 L42.6 45.4 Q44.4 38 43.4 28 Z" fill={dark} />
          <path
            d="M23 34 Q22.6 40 23.6 44 M41 34 Q41.4 40 40.4 44"
            stroke={tint(color, 1.3)}
            stroke-width="0.7"
            fill="none"
            opacity="0.45"
          />
        </g>
      );
    default:
      return null;
  }
}

/** Rasierte Seiten (Fade, Undercut): Haarfarbe nur angedeutet. */
function ShavedSides(props: { color: string }) {
  return (
    <path
      d="M20.4 28.6 Q20.6 20.4 24.8 17 L27.4 18.8 Q22.6 21.6 21.8 28.6 Z M43.6 28.6 Q43.4 20.4 39.2 17 L36.6 18.8 Q41.4 21.6 42.2 28.6 Z"
      fill={props.color}
      opacity="0.42"
    />
  );
}

function HairFront(props: { look: Look; color: string }) {
  const { look, color } = props;
  if (look.hat === 'balaclava') return null;
  if (look.hat === 'hood' && look.hair !== 'long') return null;
  const shine = tint(color, look.hairColor >= 5 ? 1.12 : 1.6);
  const gloss = (d: string) => (
    <path d={d} stroke={shine} stroke-width="0.9" fill="none" stroke-linecap="round" opacity="0.4" />
  );
  switch (look.hair) {
    case 'bald':
      // Ältere mit Glatze: ein Haarkranz an den Seiten. Jüngere: Glanz auf der Platte.
      return look.age >= 45 ? (
        <g fill={color}>
          <path d="M20.4 30 Q20 24 22.6 21.2 Q22.2 26 23 30 Z" />
          <path d="M43.6 30 Q44 24 41.4 21.2 Q41.8 26 41 30 Z" />
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
      return (
        <g>
          <path d="M20.3 27 Q19.5 14.2 32 14 Q44.5 14.2 43.7 27 Q42 20 32 19.6 Q24 19.8 20.3 27 Z" fill={color} />
          {gloss('M25.6 16.8 Q30 15.4 35 16')}
        </g>
      );
    case 'side':
      return (
        <g>
          <path
            d="M20.3 27.5 Q19 14 32 14 Q45 14 43.7 27.5 Q43 21 39.5 19.4 Q31 22.6 22.2 21 Q20.8 23.8 20.3 27.5 Z"
            fill={color}
          />
          {gloss('M28 16.6 Q34 15.2 39 16.8')}
        </g>
      );
    case 'slick':
      return (
        <g>
          <path d="M20.6 25 Q20 13.8 32 13.6 Q44 13.8 43.4 25 Q41 17.8 32 17.4 Q23 17.8 20.6 25 Z" fill={color} />
          <path
            d="M25 16.4 Q32 14.6 39 16.4 M27 15 Q32 13.9 37 15"
            stroke={shine}
            stroke-width="0.7"
            fill="none"
            opacity="0.45"
          />
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
    case 'fade':
      return (
        <g>
          <ShavedSides color={color} />
          <path
            d="M22.2 23.2 Q22.6 15 32 14.8 Q41.4 15 41.8 23.2 Q38.4 19.4 32 19.2 Q25.6 19.4 22.2 23.2 Z"
            fill={color}
          />
          <path
            d="M24 19.6 Q22.6 21.6 22.2 23.2 M40 19.6 Q41.4 21.6 41.8 23.2"
            stroke={tint(color, 0.6)}
            stroke-width="0.8"
            fill="none"
          />
        </g>
      );
    case 'undercut':
      return (
        <g>
          <ShavedSides color={color} />
          <path
            d="M22.6 22.8 Q23 14.4 32 14.2 Q41.6 14.4 41.6 22.8 Q39.6 18.6 34.4 18.4 Q29.6 18.4 27 20.6 Q25.2 24.6 24.2 29.4 Q23.6 25 22.6 22.8 Z"
            fill={color}
          />
          {gloss('M28 16.6 Q33 15 38 16.4')}
        </g>
      );
    case 'cornrows':
      return (
        <g>
          <path d="M20.6 25.5 Q21 15 32 14.8 Q43 15 43.4 25.5 Q40.5 18.8 32 18.6 Q23.5 18.8 20.6 25.5 Z" fill={color} />
          <path
            d="M23.6 22.4 Q24.6 18 27.4 15.6 M27.8 20 Q28.6 17 30.2 15 M32 19.2 L32 14.8 M36.2 20 Q35.4 17 33.8 15 M40.4 22.4 Q39.4 18 36.6 15.6"
            stroke={tint(color, 0.45)}
            stroke-width="1"
            fill="none"
          />
        </g>
      );
    case 'dreads':
      return (
        <g>
          <path
            d="M19.6 25 Q19.4 12.8 32 12.6 Q44.6 12.8 44.4 25 Q40.6 18.4 32 18.2 Q23.4 18.4 19.6 25 Z"
            fill={color}
          />
          <path
            d="M23 20 Q24.4 15.6 27.6 14 M29 17.2 Q30.6 14.4 33.6 13.6 M36 17.6 Q37.6 15 40.4 15.4"
            stroke={tint(color, 0.55)}
            stroke-width="1"
            fill="none"
          />
          <path d="M22.6 20 Q19.4 28 20.6 38" stroke={color} stroke-width="2.8" fill="none" stroke-linecap="round" />
        </g>
      );
    case 'mullet':
      return (
        <g>
          <path d="M20.3 27 Q19.5 14.2 32 14 Q44.5 14.2 43.7 27 Q42 20 32 19.6 Q24 19.8 20.3 27 Z" fill={color} />
          {gloss('M25.6 16.8 Q30 15.4 35 16')}
        </g>
      );
    case 'tight':
    case 'braids':
      return (
        <g>
          <path d="M20.6 27 Q20.4 14.4 32 14.2 Q43.6 14.4 43.4 27 Q42.2 20 32 19.4 Q21.8 20 20.6 27 Z" fill={color} />
          {look.hair === 'braids' ? (
            <path d="M32 19.4 L32 14.6" stroke={tint(color, 0.5)} stroke-width="0.8" fill="none" />
          ) : (
            <path
              d="M26 19.4 Q25.4 17 26.6 15.2 M32 19 L32 14.6 M38 19.4 Q38.6 17 37.4 15.2"
              stroke={shine}
              stroke-width="0.7"
              fill="none"
              opacity="0.45"
            />
          )}
        </g>
      );
    default:
      // Lang, Zopf, Dutt: Pony vorne.
      return (
        <g>
          <path
            d="M20.3 29 Q19.5 14 32 14 Q44.5 14 43.7 29 Q42.4 19.4 33.5 18.6 Q27 21.8 21.6 21.6 Q20.6 25 20.3 29 Z"
            fill={color}
          />
          {gloss('M26 17 Q31 15.2 37 16')}
        </g>
      );
  }
}

// --- Bart ------------------------------------------------------------------------------------------------------------

function Beard(props: { look: Look; color: string }) {
  const { look, color } = props;
  if (look.hat === 'balaclava') return null;
  const moustache = <path d="M27.4 36.4 Q32 34.2 36.6 36.4 Q34.2 37.3 32 36.5 Q29.8 37.3 27.4 36.4 Z" fill={color} />;
  switch (look.beard) {
    case 'stubble':
      return (
        <path
          d="M21.4 30.5 Q22 41.6 32 42 Q42 41.6 42.6 30.5 Q41 37.2 37 37.6 Q32 36 27 37.6 Q23 37.2 21.4 30.5 Z"
          fill={color}
          opacity="0.36"
        />
      );
    case 'chinstrap':
      return (
        <path
          d="M21.2 31 Q22 41 32 41.8 Q42 41 42.8 31 Q41.6 39 32 39.6 Q22.4 39 21.2 31 Z"
          fill={color}
          opacity="0.9"
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
          <path d="M28.8 38.6 Q32 44.6 35.2 38.6 Q32 40.4 28.8 38.6 Z" fill={color} />
        </g>
      );
    default:
      return null;
  }
}

// --- Augen, Brauen, Mund ---------------------------------------------------------------------------------------------

function Eyes(props: { look: Look; shade: string }) {
  const { look } = props;
  const narrow = look.eyes === 'narrow';
  const ry = narrow ? 1 : 1.5;
  const r = narrow ? 0.9 : 1.2;
  const L = 27.4;
  const R = 36.6;
  const ellipse = (cx: number, cy: number, rx: number, ryy: number) =>
    `M${cx - rx} ${cy} a${rx} ${ryy} 0 1 0 ${rx * 2} 0 a${rx} ${ryy} 0 1 0 ${-rx * 2} 0`;
  const lid = (ex: number) =>
    narrow ? `M${ex - 2.3} 28.6 Q${ex} 27.4 ${ex + 2.3} 28.6` : `M${ex - 2.3} 28.4 Q${ex} 26.8 ${ex + 2.3} 28.4`;
  const heavy = (ex: number) => `M${ex - 2.4} 28.9 Q${ex} 26.2 ${ex + 2.4} 28.9 Q${ex} 29.6 ${ex - 2.4} 28.9 Z`;
  const py = narrow ? 29.1 : 29.2;
  return (
    <g>
      {look.eyes === 'rings' && (
        <path d={`${ellipse(L, 31.3, 2.5, 1.1)} ${ellipse(R, 31.3, 2.5, 1.1)}`} fill="#3a2838" opacity="0.32" />
      )}
      <path d={`${ellipse(L, 29, 2.2, ry)} ${ellipse(R, 29, 2.2, ry)}`} fill={SCLERA} />
      <path d={`${ellipse(L, py, r, r)} ${ellipse(R, py, r, r)}`} fill={INK} />
      {!narrow && (
        <path
          d={`${ellipse(L + 0.45, py - 0.45, 0.35, 0.35)} ${ellipse(R + 0.45, py - 0.45, 0.35, 0.35)}`}
          fill="#ffffff"
          opacity="0.7"
        />
      )}
      {look.eyes === 'heavy' && <path d={`${heavy(L)} ${heavy(R)}`} fill={props.shade} />}
      <path
        d={`${lid(L)} ${lid(R)}`}
        stroke={INK}
        stroke-width={look.eyes === 'heavy' ? 1 : 0.8}
        fill="none"
        stroke-linecap="round"
      />
    </g>
  );
}

function Brows(props: { look: Look; color: string }) {
  const { look } = props;
  const thin = look.feminine ? 0.8 : 1;
  const common = { stroke: props.color, fill: 'none', 'stroke-linecap': 'round' as const };
  switch (look.brows) {
    case 'hard':
      return (
        <g {...common} stroke-width={1.7 * thin}>
          <path d="M24.2 24.4 Q27.4 23.6 30.4 26" />
          <path d="M33.6 26 Q36.6 23.6 39.8 24.4" />
        </g>
      );
    case 'heavy':
      return (
        <g {...common} stroke-width={2.4 * thin}>
          <path d="M24.4 25.4 Q27.4 24.4 30.4 25.4" />
          <path d="M33.6 25.4 Q36.6 24.4 39.6 25.4" />
        </g>
      );
    default:
      return (
        <g {...common} stroke-width={1.2 * thin}>
          <path d="M24.8 25.4 Q27.4 24 30 25.2" />
          <path d="M34 25.2 Q36.6 24 39.2 25.4" />
        </g>
      );
  }
}

function Mouth(props: { look: Look }) {
  const { look } = props;
  const lip = look.feminine ? LIP_F : LIP_M;
  const width = look.feminine ? 1.5 : 1.1;
  const teeth =
    look.teeth === 'grill' ? (
      <path d="M29 37.2 Q32 38.8 35 37.2 Q32 36.5 29 37.2 Z" fill={GOLD} stroke={GOLD_DARK} stroke-width="0.3" />
    ) : look.teeth === 'gold' ? (
      <rect x="32.6" y="36.75" width="1.3" height="1.5" fill={GOLD} />
    ) : null;
  switch (look.mouth) {
    case 'grin':
      return (
        <g>
          <path d="M28 37 Q32 42.2 36 37 Q32 36 28 37 Z" fill={MOUTH_IN} />
          <path d="M29 37.2 Q32 38.8 35 37.2 Q32 36.5 29 37.2 Z" fill={TEETH} />
          {teeth}
        </g>
      );
    case 'smirk':
      return (
        <g>
          <path
            d="M28.6 38.2 Q32 38.9 35.8 36.4"
            stroke={lip}
            stroke-width={width}
            fill="none"
            stroke-linecap="round"
          />
          {look.teeth !== 'none' && (
            <g>
              <path d="M32.4 37.9 Q34.6 38 35.6 36.6 Q33.8 36.9 32.4 37.9 Z" fill={MOUTH_IN} />
              <rect x="33.4" y="36.9" width="1.4" height="1" fill={look.teeth === 'gold' ? GOLD : TEETH} />
            </g>
          )}
        </g>
      );
    case 'hard':
      return (
        <path
          d="M28.4 37.3 Q29.4 38.1 32 38.1 Q34.6 38.1 35.6 37.3"
          stroke={lip}
          stroke-width={width + 0.2}
          fill="none"
          stroke-linecap="round"
        />
      );
    case 'tired':
      return (
        <g stroke={lip} fill="none" stroke-linecap="round">
          <path d="M29 38.4 Q32 37.2 35 38.4" stroke-width={width} />
          <path d="M30 39.6 Q32 40.2 34 39.6" stroke-width="0.6" opacity="0.6" />
        </g>
      );
    default:
      return (
        <path d="M29 37.6 Q32 38.9 35 37.6" stroke={lip} stroke-width={width} fill="none" stroke-linecap="round" />
      );
  }
}

/** Zigarette, Joint oder Zahnstocher im rechten Mundwinkel, mit Rauchfaden. */
function MouthItem(props: { look: Look }) {
  const smoke = (
    <path
      d="M42 38.4 Q43.8 35 41.8 32 Q40.4 29.4 42.8 26.4"
      stroke={SMOKE}
      stroke-width="0.9"
      fill="none"
      opacity="0.5"
      stroke-linecap="round"
    />
  );
  switch (props.look.mouthItem) {
    case 'cigarette':
      return (
        <g>
          <path d="M35 37.8 L41.4 39.7" stroke="#f0ece2" stroke-width="1.4" stroke-linecap="round" />
          <circle cx="41.7" cy="39.8" r="0.85" fill="#e4522a" />
          {smoke}
        </g>
      );
    case 'joint':
      return (
        <g>
          <path d="M35 37.8 L41.2 39.2" stroke="#d8c59c" stroke-width="1.5" stroke-linecap="round" />
          <path d="M41.2 39.2 L42.4 39.5" stroke="#9a8a5c" stroke-width="1" stroke-linecap="round" />
          <circle cx="42.5" cy="39.5" r="0.7" fill="#e4522a" />
          {smoke}
        </g>
      );
    case 'toothpick':
      return <path d="M34.8 37.5 L39.8 36" stroke="#d6c096" stroke-width="0.9" stroke-linecap="round" />;
    default:
      return null;
  }
}

// --- Verzierungen: Narben, Veilchen, Tattoos, Ohrringe, Kette, Maske -----------------------------------------------

function Scar(props: { look: Look; skin: string }) {
  switch (props.look.scar) {
    case 'cheek':
      return (
        <g stroke={SCAR} stroke-width="0.9" stroke-linecap="round">
          <path d="M23.8 31.6 L26.6 36" />
          <path d="M24.2 33.8 L25.6 33 M25 35.2 L26.4 34.4" stroke-width="0.6" />
        </g>
      );
    case 'brow':
      return (
        <g stroke-linecap="round">
          <path d="M37.6 22.8 L36.8 27.6" stroke={props.skin} stroke-width="1.3" />
          <path d="M37.6 22.8 L36.8 27.6" stroke={SCAR} stroke-width="0.7" />
        </g>
      );
    case 'lip':
      return <path d="M34.2 35 L34.6 37.6" stroke={SCAR} stroke-width="0.8" stroke-linecap="round" />;
    default:
      return null;
  }
}

function Tattoo(props: { look: Look }) {
  switch (props.look.tattoo) {
    case 'tear':
      return <path d="M29.6 31.6 Q30.7 33.4 29.6 34 Q28.5 33.4 29.6 31.6 Z" fill={TATTOO} />;
    case 'face':
      return (
        <path
          d={dots(
            [
              [39.6, 33.2],
              [40.9, 33.9],
              [39.9, 35.1],
            ],
            0.55,
          )}
          fill={TATTOO}
        />
      );
    default:
      return null;
  }
}

/** Schriftzug am Hals, zwischen Kiefer und Kragen. */
function NeckTattoo() {
  return (
    <path
      d="M27.6 41.4 Q29.4 42.8 27.8 45.4 M29.8 42.2 Q31 43.6 30 45.8 M27 43.6 Q29 43.2 30.6 44"
      stroke={TATTOO}
      stroke-width="0.9"
      fill="none"
      stroke-linecap="round"
    />
  );
}

function Earrings(props: { look: Look; earX: number }) {
  const { look, earX } = props;
  if (look.hat === 'hood' || look.hat === 'balaclava') return null;
  const left = 64 - earX;
  switch (look.earring) {
    case 'stud':
      return <circle cx={earX + 0.4} cy="32.4" r="1" fill={GOLD} />;
    case 'hoop':
      return <circle cx={earX + 0.4} cy="34.2" r="1.7" stroke={GOLD} stroke-width="0.9" fill="none" />;
    case 'hoops':
      return (
        <g stroke={GOLD} stroke-width="1" fill="none">
          <circle cx={earX + 0.4} cy="35" r="2.4" />
          <circle cx={left - 0.4} cy="35" r="2.4" />
        </g>
      );
    default:
      return null;
  }
}

function Chain(props: { look: Look }) {
  switch (props.look.chain) {
    case 'thin':
      return <path d="M25.6 46 Q32 52.6 38.4 46" stroke={GOLD} stroke-width="1.2" fill="none" />;
    case 'thick':
    case 'pendant':
      return (
        <g fill="none">
          <path d="M25 46 Q32 53.4 39 46" stroke={GOLD} stroke-width="2.6" />
          <path d="M25 46 Q32 53.4 39 46" stroke={GOLD_DARK} stroke-width="0.9" stroke-dasharray="1.3 1.3" />
          {props.look.chain === 'pendant' && (
            <g stroke={GOLD} stroke-width="1.5" stroke-linecap="round">
              <path d="M32 50.8 L32 56.4 M30.3 52.8 L33.7 52.8" />
            </g>
          )}
        </g>
      );
    default:
      return null;
  }
}

function Mask(props: { look: Look; top: string }) {
  switch (props.look.mask) {
    case 'tube': {
      const cloth = tint(props.top, 0.82);
      return (
        <g>
          <path d="M20.8 34.2 Q32 31.6 43.2 34.2 L43.4 42.4 Q32 48.4 20.6 42.4 Z" fill={cloth} />
          <path
            d="M22.6 38 Q32 35.6 41.4 38 M23.6 41.4 Q32 39.4 40.4 41.4"
            stroke={tint(cloth, 1.35)}
            stroke-width="0.7"
            fill="none"
            opacity="0.5"
          />
        </g>
      );
    }
    case 'ffp':
      return (
        <g>
          <path d="M22 33.6 L17.4 31.6 M42 33.6 L46.6 31.6" stroke="#f3f1ea" stroke-width="0.9" />
          <path d="M22 33.6 Q32 31 42 33.6 Q42.8 42.2 32 44.6 Q21.2 42.2 22 33.6 Z" fill="#e9e6de" />
          <path d="M23.4 37.8 Q32 36 40.6 37.8" stroke="#cfcac0" stroke-width="0.7" fill="none" />
        </g>
      );
    default:
      return null;
  }
}

// --- Brille, Kopfbedeckung -------------------------------------------------------------------------------------------

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
            d="M22.6 26.4 H31.2 Q31.2 32.6 27 32.6 Q22.6 32.6 22.6 26.4 Z M32.8 26.4 H41.4 Q41.4 32.6 37.2 32.6 Q32.8 32.6 32.8 26.4 Z"
            fill="#15171c"
          />
          <path
            d="M31.2 27.2 L32.8 27.2 M22.6 26.8 L20.6 27.6 M41.4 26.8 L43.4 27.6"
            stroke="#15171c"
            stroke-width="1.2"
          />
          <path d="M24.4 28 L26.4 28 M34.6 28 L36.6 28" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.8" />
        </g>
      );
    default:
      return null;
  }
}

/** Teile der Kopfbedeckung hinter dem Kopf: Schirm der umgedrehten Cap, Zipfel von Durag und Bandana. */
function HatBack(props: { look: Look; top: string }) {
  switch (props.look.hat) {
    case 'backcap':
      return (
        <path d="M39 14.4 Q46 11 52.6 13.4 Q52 17.2 46.6 17.8 Q43 17.4 41.4 18.6 Z" fill={tint(props.top, 0.78)} />
      );
    case 'durag':
      return <path d="M22 20 Q16.4 28 18.6 40 L21.4 40 Q20.4 30 24 22.6 Z" fill={tint(props.top, 0.75)} />;
    case 'bandana':
      return (
        <path d="M43.6 19.4 L49.6 23.6 L48.4 17 Z M44 20.4 L48.6 27.4 L49.8 24.2 Z" fill={tint(props.top, 0.72)} />
      );
    default:
      return null;
  }
}

function Hat(props: { look: Look; top: string; skin: string }) {
  const { look, top } = props;
  switch (look.hat) {
    case 'cap': {
      const cap = tint(top, 1.12);
      return (
        <g>
          <path d="M19.8 22.4 Q20 11.4 32 11.4 Q44 11.4 44.2 22.4 Z" fill={cap} />
          <path
            d="M26 12.6 Q32 11.6 38 12.6 M32 11.6 L32 21.6"
            stroke={tint(cap, 0.7)}
            stroke-width="0.6"
            fill="none"
          />
          <path d="M19 21.8 Q32 19.6 45.6 22.6 Q48.4 24.8 44 24.4 Q32 22.8 19.4 23.8 Z" fill={tint(cap, 0.62)} />
          <circle cx="32" cy="11.6" r="1" fill={tint(cap, 0.7)} />
        </g>
      );
    }
    case 'backcap': {
      const cap = tint(top, 1.12);
      return (
        <g>
          <path d="M19.8 22.6 Q20 11.4 32 11.4 Q44 11.4 44.2 22.6 Z" fill={cap} />
          <path
            d="M26 12.6 Q32 11.6 38 12.6 M32 11.6 L32 21.6"
            stroke={tint(cap, 0.7)}
            stroke-width="0.6"
            fill="none"
          />
          <path d="M29 21 L32 17.2 L35 21 Z" fill={props.skin} />
          <path d="M28 21.4 Q32 20.6 36 21.4" stroke={tint(cap, 0.6)} stroke-width="1.1" fill="none" />
          <rect x="19.4" y="20.4" width="25.2" height="2.4" rx="1" fill={tint(cap, 0.82)} />
        </g>
      );
    }
    case 'beanie': {
      const wool = tint(top, 1.18);
      return (
        <g>
          <path d="M19.6 23.6 Q19.4 10.6 32 10.6 Q44.6 10.6 44.4 23.6 Z" fill={wool} />
          <rect x="19" y="19.8" width="26" height="5.2" rx="2" fill={tint(wool, 0.8)} />
          <path
            d="M23 20.6 L22.6 24.4 M27.4 20.2 L27.2 24.8 M32 20 L32 25 M36.6 20.2 L36.8 24.8 M41 20.6 L41.4 24.4"
            stroke={tint(wool, 0.62)}
            stroke-width="0.6"
          />
        </g>
      );
    }
    case 'bucket': {
      const cloth = tint(top, 1.08);
      return (
        <g>
          <path d="M20.4 20.4 Q20.8 11.6 32 11.6 Q43.2 11.6 43.6 20.4 Z" fill={cloth} />
          <path d="M22 17.4 Q32 15.8 42 17.4" stroke={tint(cloth, 0.72)} stroke-width="0.6" fill="none" />
          <path
            d="M16 20.6 Q32 16.6 48 20.6 Q48.2 25.6 45 26.2 Q32 22.8 19 26.2 Q15.8 25.6 16 20.6 Z"
            fill={tint(cloth, 0.78)}
          />
          <path d="M20 24.6 Q32 21.6 44 24.6" stroke={tint(cloth, 0.55)} stroke-width="0.8" fill="none" opacity="0.6" />
        </g>
      );
    }
    case 'durag': {
      const cloth = tint(top, 0.9);
      return (
        <g>
          <path d="M20.4 27.5 Q20 13.4 32 13.2 Q44 13.4 43.6 27.5 Q42 19.8 32 19.2 Q22 19.8 20.4 27.5 Z" fill={cloth} />
          <path
            d="M21.6 21.6 Q32 18.2 42.4 21.6"
            stroke={tint(cloth, 1.5)}
            stroke-width="0.7"
            fill="none"
            opacity="0.5"
          />
          <path d="M22.4 20 Q26 15.4 32 14.6" stroke={tint(cloth, 1.6)} stroke-width="0.8" fill="none" opacity="0.35" />
        </g>
      );
    }
    case 'bandana': {
      const cloth = tint(top, 0.92);
      return (
        <g>
          <path d="M19.6 18.4 Q32 14.8 44.4 18.4 L44.6 23.6 Q32 20.2 19.4 23.6 Z" fill={cloth} />
          <path
            d={dots(
              [
                [23.4, 20.6],
                [27.6, 19.2],
                [32, 18.6],
                [36.4, 19.2],
                [40.6, 20.6],
              ],
              0.55,
            )}
            fill={tint(cloth, 1.7)}
            opacity="0.7"
          />
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
    case 'balaclava':
      return (
        <g>
          <path
            d="M17.2 47 Q15.6 10.4 32 10 Q48.4 10.4 46.8 47 Z M22.4 26.4 Q32 24.2 41.6 26.4 Q42.4 32.2 32 33 Q21.6 32.2 22.4 26.4 Z"
            fill="#15151a"
            fill-rule="evenodd"
          />
          <path d="M22 18 Q32 15.6 42 18 M20.6 38 Q32 40.6 43.4 38" stroke="#2a2a30" stroke-width="0.8" fill="none" />
        </g>
      );
    default:
      return null;
  }
}

// --- Kleidung --------------------------------------------------------------------------------------------------------

const BODY = 'M6 64 C7 52 17 45.6 32 45.6 C47 45.6 57 52 58 64 Z';
const BULKY = 'M3 64 C4 50.4 15.6 44.2 32 44.2 C48.4 44.2 60 50.4 61 64 Z';

function Top(props: { look: Look; color: string; skin: string }) {
  const { look, color } = props;
  const dark = tint(color, 0.72);
  const light = tint(color, 1.3);
  const body = <path d={BODY} fill={color} />;
  switch (look.top) {
    case 'hoodie':
      return (
        <g>
          {body}
          <path d="M19.6 47.6 Q32 55 44.4 47.6 Q40 44 32 44 Q24 44 19.6 47.6 Z" fill={dark} />
          <path d="M29.4 50.4 L29 57 M34.6 50.4 L35 57" stroke="#e8e5de" stroke-opacity="0.75" stroke-width="0.9" />
        </g>
      );
    case 'jacket':
      return (
        <g>
          {body}
          <path d="M32 47 L32 64" stroke={dark} stroke-width="1.2" />
          <path d="M24 46.4 L29 52 L32 47 Z M40 46.4 L35 52 L32 47 Z" fill={dark} />
          <path d="M21.6 47 Q25 44.6 27.2 46 M42.4 47 Q39 44.6 36.8 46" stroke={dark} stroke-width="1" fill="none" />
        </g>
      );
    case 'leather': {
      const leather = tint(color, 0.5);
      return (
        <g>
          <path d={BODY} fill={leather} />
          <path d="M26.4 45.8 L32 55.4 L37.6 45.8 Z" fill="#2a2a2f" />
          <path
            d="M23.2 45.8 L30.2 46.6 L32 55.4 L26.6 53.4 Z M40.8 45.8 L33.8 46.6 L32 55.4 L37.4 53.4 Z"
            fill={tint(leather, 0.8)}
          />
          <path
            d="M24.4 46.2 L31 53.8 M39.6 46.2 L33 53.8 M8 62 Q11 54 18 49.4"
            stroke="#ffffff"
            stroke-opacity="0.22"
            stroke-width="1"
            fill="none"
          />
          <path d="M32 55.4 L32 64" stroke="#9a9ca4" stroke-width="0.8" />
        </g>
      );
    }
    case 'bomber':
      return (
        <g>
          {body}
          <path d="M23.4 45.4 Q32 50.8 40.6 45.4 Q36 43 32 43 Q28 43 23.4 45.4 Z" fill={dark} />
          <path
            d="M26 45.6 L26.6 48.2 M29 46.8 L29.4 49.4 M35 46.8 L34.6 49.4 M38 45.6 L37.4 48.2"
            stroke={tint(color, 0.5)}
            stroke-width="0.6"
          />
          <path d="M32 48.6 L32 64" stroke="#b8b9bf" stroke-width="0.9" />
          <path d="M8 60 Q10 54 15.4 50.6" stroke={dark} stroke-width="1" fill="none" />
        </g>
      );
    case 'puffer':
      return (
        <g>
          <path d={BULKY} fill={color} />
          <path d="M22 45.6 Q32 51.2 42 45.6 Q38 42.4 32 42.4 Q26 42.4 22 45.6 Z" fill={dark} />
          <path
            d="M5 56.2 Q16 52.6 24.6 56.4 M8 50.4 Q16.4 47.4 24 50.6 M39.4 56.4 Q48 52.6 59 56.2 M40 50.6 Q47.6 47.4 56 50.4 M4 62 Q16 58.6 25 62 M39 62 Q48 58.6 60 62"
            stroke={dark}
            stroke-width="0.9"
            fill="none"
          />
          <path d="M32 48 L32 64" stroke={light} stroke-width="0.8" />
          <path d="M9 61 Q10.6 53 18 48.4" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2" fill="none" />
        </g>
      );
    case 'suit':
      return (
        <g>
          {body}
          <path d="M26.6 45.6 L32 57 L37.4 45.6 Z" fill="#eeeae2" />
          <path d="M31 48.6 L33 48.6 L33.8 55 L32 57 L30.2 55 Z" fill={tint(color === TOP[6] ? TOP[0] : color, 0.55)} />
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
          <path d="M23.6 45.4 Q32 50.4 40.4 45.4 Q36 43.2 32 43.2 Q28 43.2 23.6 45.4 Z" fill={dark} />
          <path d="M32 46.4 L32 64" stroke="#e8e5de" stroke-opacity="0.8" stroke-width="0.9" />
          <path
            d="M11 54.6 Q15.6 48.8 22 47.2 M13.4 57 Q17.6 51.4 23.6 49.6"
            stroke="#e8e5de"
            stroke-width="1.2"
            fill="none"
          />
          <path
            d="M53 54.6 Q48.4 48.8 42 47.2 M50.6 57 Q46.4 51.4 40.4 49.6"
            stroke="#e8e5de"
            stroke-width="1.2"
            fill="none"
          />
        </g>
      );
    case 'tank':
      return (
        <g>
          <path d={BODY} fill={props.skin} />
          <path
            d="M12 58 Q14.6 51.6 21 49.2 M52 58 Q49.4 51.6 43 49.2"
            stroke={tint(props.skin, 0.8)}
            stroke-width="0.9"
            fill="none"
          />
          <path
            d="M22.6 64 L22.8 50.4 Q26.8 48.2 27.4 45.8 Q32 52.2 36.6 45.8 Q37.2 48.2 41.2 50.4 L41.4 64 Z"
            fill={color}
          />
          <path
            d="M27.4 45.8 Q25.6 47 24.6 46.4 M36.6 45.8 Q38.4 47 39.4 46.4"
            stroke={color}
            stroke-width="1.6"
            fill="none"
          />
        </g>
      );
    case 'openshirt':
      return (
        <g>
          {body}
          <path d="M24.2 45.6 L32 60.4 L39.8 45.6 Z" fill={props.skin} />
          <path d="M24.2 45.6 L31 49.6 L27.2 56.2 Z M39.8 45.6 L33 49.6 L36.8 56.2 Z" fill={light} />
          <path
            d="M22.6 46.2 Q26 43.6 28.2 45.8 M41.4 46.2 Q38 43.6 35.8 45.8"
            stroke={light}
            stroke-width="1"
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

// --- Das Porträt -----------------------------------------------------------------------------------------------------

/** Porträt als SVG. Füllt den Avatar-Kreis. */
export const Face = memo(function Face(props: { look: Look }) {
  const look = props.look;
  const skin = SKIN[look.skin] ?? SKIN[1];
  const shade = tint(skin, 0.84);
  const deep = tint(skin, 0.7);
  const hair = HAIR[look.hairColor] ?? HAIR[0];
  const top = TOP[look.topColor] ?? TOP[0];
  const g = headGeometry(look);
  const masked = look.hat === 'balaclava';
  // Haare, Bart und Hut sind für die mittlere Kopfbreite gezeichnet und folgen schmalen oder runden Köpfen.
  const sx = g.rx / 11.6;
  const fit = Math.abs(sx - 1) > 0.01 ? `translate(${CX} 0) scale(${sx.toFixed(3)} 1) translate(${-CX} 0)` : undefined;
  const earX = CX + g.rx - 0.4;
  const neckW = look.feminine ? 9 : 11;
  const hollow = look.face === 'narrow' || look.mouth === 'tired' || look.eyes === 'rings';
  // Kapuze: beim Kapuzenpulli (und Trainingsjacke, Öljacke) in deren Farbe, sonst ein dunkler Pulli unter der Jacke.
  const hood = look.top === 'hoodie' || look.top === 'tracksuit' || look.top === 'raincoat' ? top : '#30323a';
  return (
    <svg class="ui-face" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {look.hat === 'hood' && <path d="M14.6 44 Q13.4 9.6 32 9.2 Q50.6 9.6 49.4 44 Z" fill={tint(hood, 0.85)} />}
      <g transform={fit}>
        <HatBack look={look} top={top} />
        <HairBack look={look} color={hair} />
      </g>
      <rect x={CX - neckW / 2} y="34" width={neckW} height="14" rx="3" fill={shade} />
      <rect x={CX - neckW / 2} y="38" width={neckW} height="5" fill={deep} opacity="0.55" />
      {!masked && look.tattoo === 'neck' && <NeckTattoo />}
      <Top look={look} color={top} skin={skin} />
      <Chain look={look} />
      <g transform={fit}>
        <ellipse cx={20.6} cy="29.6" rx="2.3" ry="3.3" fill={shade} />
        <ellipse cx={43.4} cy="29.6" rx="2.3" ry="3.3" fill={shade} />
      </g>
      <path d={headPath(g)} fill={skin} />
      <path d={jawPath(g)} fill={deep} opacity="0.28" />
      <g fill={deep} opacity={hollow ? 0.3 : 0.12}>
        <ellipse cx={CX - g.rx * 0.72} cy="33" rx="1.8" ry="3.6" transform={`rotate(-16 ${f(CX - g.rx * 0.72)} 33)`} />
        <ellipse cx={CX + g.rx * 0.72} cy="33" rx="1.8" ry="3.6" transform={`rotate(16 ${f(CX + g.rx * 0.72)} 33)`} />
      </g>
      {!masked && look.feminine && look.mouth !== 'hard' && (
        <g fill="#d6625a" opacity="0.14">
          <circle cx="25.4" cy="34" r="2.4" />
          <circle cx="38.6" cy="34" r="2.4" />
        </g>
      )}
      {!masked && look.age >= 48 && (
        <g stroke={deep} stroke-width="0.6" fill="none" stroke-linecap="round" opacity="0.45">
          <path d="M28.4 34 Q27.8 36 29 38.2 M35.6 34 Q36.2 36 35 38.2" />
          {look.age >= 55 && <path d="M27.6 20.6 Q32 19.6 36.4 20.6 M23.4 30.8 L22.4 31.6 M40.6 30.8 L41.6 31.6" />}
        </g>
      )}
      {!masked && look.bruise && <ellipse cx="27.4" cy="29.8" rx="3.6" ry="2.8" fill="#4f2f6e" opacity="0.42" />}
      <g transform={fit}>
        <Beard look={look} color={hair} />
      </g>
      {masked && <Hat look={look} top={top} skin={skin} />}
      <Eyes look={look} shade={shade} />
      <Brows look={look} color={tint(hair, look.hairColor >= 5 ? 0.75 : 0.9)} />
      {!masked && (
        <g>
          <path
            d="M32.2 29.6 Q33.8 33.6 31.6 34.4"
            stroke={deep}
            stroke-width="0.9"
            fill="none"
            stroke-linecap="round"
          />
          <path d="M30.6 34.6 Q32 35.3 33.6 34.6" stroke={deep} stroke-width="0.6" fill="none" opacity="0.7" />
          <Mouth look={look} />
          <MouthItem look={look} />
          <Scar look={look} skin={skin} />
          <Tattoo look={look} />
        </g>
      )}
      <g transform={fit}>
        <HairFront look={look} color={hair} />
      </g>
      {look.hat === 'hood' && (
        <g>
          <path
            d="M17.6 40 Q16.4 13.6 32 13 Q47.6 13.6 46.4 40"
            stroke={tint(hood, 0.7)}
            stroke-width="2"
            fill="none"
          />
          <path d="M28.4 46.6 L27.8 54 M35.6 46.6 L36.2 54" stroke="#e8e5de" stroke-opacity="0.75" stroke-width="0.9" />
        </g>
      )}
      <g transform={fit}>
        <Mask look={look} top={top} />
      </g>
      <Glasses look={look} />
      {!masked && (
        <g transform={fit}>
          <Hat look={look} top={top} skin={skin} />
        </g>
      )}
      <Earrings look={look} earX={earX} />
    </svg>
  );
});
