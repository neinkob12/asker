// Farben der Minispiele im Canvas aus den Design-Tokens (mapToken). Früher das 2D-Bild des Razzia-Countdowns; seit
// Auftrag 48 ist die Razzia ein Lauf in 3D (scene.ts), hier bleibt nur die Palette, die auch der Container nutzt.

import { mapToken } from '../../../../../map';

export interface StashPalette {
  base: string;
  ink: string;
  ink2: string;
  gold: string;
  money: string;
  dirty: string;
  danger: string;
  warn: string;
  goods: string;
  place: string;
  people: string;
  law: string;
  media: string;
  chat: string;
  sky: string;
}

export function readPalette(): StashPalette {
  return {
    base: mapToken('--hud-glass-solid', '#16181d'),
    ink: mapToken('--hud-ink', '#ffffff'),
    ink2: mapToken('--hud-ink-2', 'rgba(235, 235, 245, 0.72)'),
    gold: mapToken('--hud-gold', '#f2c766'),
    money: mapToken('--cat-money', '#30d158'),
    dirty: mapToken('--cat-dirty', '#d891ff'),
    danger: mapToken('--cat-danger', '#ff7b73'),
    warn: mapToken('--cat-warn', '#ff9f0a'),
    goods: mapToken('--cat-goods', '#c8aa85'),
    place: mapToken('--cat-place', '#6ab2ff'),
    people: mapToken('--cat-people', '#40c8e0'),
    law: mapToken('--cat-law', '#a7a5ff'),
    media: mapToken('--cat-media', '#ff899f'),
    chat: mapToken('--cat-chat', '#63e6e2'),
    sky: mapToken('--cat-sky', '#64d2ff'),
  };
}
