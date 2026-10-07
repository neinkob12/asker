// Ware im Minispiel (Razzia-Countdown, Container packen …): Bedeutungsfarbe und Symbol je Ware, gleich in allen
// Spielen. Im Canvas mit packageLook (Farben über mapToken), in der Oberfläche mit productColor (var(--cat-…)).

import { mapToken } from '../../../../map';

/** Symbol einer Ware: Blatt, Platte, Gummis, Tropfen, Stift; Schwarzgeld als Schein, Unbekanntes als Kiste. */
export type PackageGlyph = 'leaf' | 'brick' | 'gummy' | 'drop' | 'stick' | 'cash' | 'box';

/** Bedeutungsfarben, die Ware nutzt (Namen wie --cat-<name>). */
export type GoodsColor = 'money' | 'dirty' | 'chat' | 'people' | 'goods' | 'media' | 'warn' | 'sky';

const GOODS: Record<string, { color: GoodsColor; glyph: PackageGlyph }> = {
  weed: { color: 'money', glyph: 'leaf' },
  haze: { color: 'chat', glyph: 'leaf' },
  kush: { color: 'people', glyph: 'leaf' },
  hash: { color: 'goods', glyph: 'brick' },
  edibles: { color: 'media', glyph: 'gummy' },
  oil: { color: 'warn', glyph: 'drop' },
  vape: { color: 'sky', glyph: 'stick' },
};
const CASH = { color: 'dirty', glyph: 'cash' } as const;
const OTHER = { color: 'goods', glyph: 'box' } as const;

/** Farbe und Symbol als Namen (null = Schwarzgeld). */
export function goodsLook(productId: string | null): { color: GoodsColor; glyph: PackageGlyph } {
  return productId === null ? CASH : (GOODS[productId] ?? OTHER);
}

/** Bedeutungsfarbe einer Ware für die Oberfläche, z.B. `var(--cat-${productColor(id)})`. */
export function productColor(productId: string | null): GoodsColor {
  return goodsLook(productId).color;
}

/** Aufgelöste Farben für den Canvas (einmal lesen, z.B. in useMemo). */
export type GoodsPalette = Record<GoodsColor, string>;

export function readGoodsPalette(): GoodsPalette {
  return {
    money: mapToken('--cat-money', '#30d158'),
    dirty: mapToken('--cat-dirty', '#d891ff'),
    chat: mapToken('--cat-chat', '#63e6e2'),
    people: mapToken('--cat-people', '#40c8e0'),
    goods: mapToken('--cat-goods', '#c8aa85'),
    media: mapToken('--cat-media', '#ff899f'),
    warn: mapToken('--cat-warn', '#ff9f0a'),
    sky: mapToken('--cat-sky', '#64d2ff'),
  };
}

/** Farbe (aufgelöst) und Symbol einer Ware im Canvas. */
export function packageLook(p: GoodsPalette, productId: string | null): { color: string; glyph: PackageGlyph } {
  const look = goodsLook(productId);
  return { color: p[look.color], glyph: look.glyph };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Symbol einer Ware als Linie (strokeStyle und lineWidth setzt der Aufrufer), Mitte (0, 0), Größe s. */
export function drawGoodsGlyph(ctx: CanvasRenderingContext2D, kind: PackageGlyph, s: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'leaf': {
      // Blatt mit fünf Fingern.
      for (const a of [-1.15, -0.55, 0, 0.55, 1.15]) {
        const len = s * (a === 0 ? 1 : Math.abs(a) > 1 ? 0.6 : 0.85);
        const ang = -Math.PI / 2 + a;
        ctx.moveTo(0, s * 0.25);
        ctx.quadraticCurveTo(
          Math.cos(ang - 0.25) * len * 0.6,
          s * 0.25 + Math.sin(ang - 0.25) * len * 0.6,
          Math.cos(ang) * len,
          s * 0.25 + Math.sin(ang) * len,
        );
        ctx.quadraticCurveTo(
          Math.cos(ang + 0.25) * len * 0.6,
          s * 0.25 + Math.sin(ang + 0.25) * len * 0.6,
          0,
          s * 0.25,
        );
      }
      ctx.moveTo(0, s * 0.25);
      ctx.lineTo(0, s * 0.7);
      break;
    }
    case 'brick':
      roundRect(ctx, -s * 0.7, -s * 0.4, s * 1.4, s * 0.8, s * 0.12);
      ctx.moveTo(-s * 0.7, 0);
      ctx.lineTo(s * 0.7, 0);
      break;
    case 'gummy':
      ctx.arc(-s * 0.3, -s * 0.15, s * 0.32, 0, Math.PI * 2);
      ctx.moveTo(s * 0.62, -s * 0.15);
      ctx.arc(s * 0.3, -s * 0.15, s * 0.32, 0, Math.PI * 2);
      ctx.moveTo(s * 0.32, s * 0.45);
      ctx.arc(0, s * 0.45, s * 0.32, 0, Math.PI * 2);
      break;
    case 'drop':
      ctx.moveTo(0, -s * 0.75);
      ctx.bezierCurveTo(s * 0.6, -s * 0.1, s * 0.6, s * 0.7, 0, s * 0.7);
      ctx.bezierCurveTo(-s * 0.6, s * 0.7, -s * 0.6, -s * 0.1, 0, -s * 0.75);
      break;
    case 'stick':
      roundRect(ctx, -s * 0.18, -s * 0.75, s * 0.36, s * 1.5, s * 0.14);
      ctx.moveTo(-s * 0.18, -s * 0.35);
      ctx.lineTo(s * 0.18, -s * 0.35);
      break;
    case 'cash':
      roundRect(ctx, -s * 0.8, -s * 0.45, s * 1.6, s * 0.9, s * 0.1);
      ctx.moveTo(s * 0.22, 0);
      ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
      break;
    default:
      roundRect(ctx, -s * 0.6, -s * 0.6, s * 1.2, s * 1.2, s * 0.1);
  }
  ctx.stroke();
}
