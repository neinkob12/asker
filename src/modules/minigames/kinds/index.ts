// Alle Minispiele, eine Datei pro Art: So ändern die parallelen Teile von Auftrag 44 nie dieselbe Zeile.

import type { MinigameKind, MinigameKindDef } from '../types';
import { brawl } from './brawl';
import { chase } from './chase';
import { container } from './container';
import { interview } from './interview';
import { papers } from './papers';
import { safe } from './safe';
import { search } from './search';
import { stash } from './stash';
import { traffic } from './traffic';
import { undercover } from './undercover';

export const MINIGAME_KINDS: Record<MinigameKind, MinigameKindDef> = {
  chase,
  brawl,
  stash,
  traffic,
  undercover,
  safe,
  search,
  container,
  papers,
  interview,
};

/** Alle Arten in fester Reihenfolge (für Zustand, Statistik und Vorschau). */
export const MINIGAME_KIND_IDS = Object.keys(MINIGAME_KINDS) as MinigameKind[];
