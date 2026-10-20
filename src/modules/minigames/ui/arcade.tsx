// Spielhalle (Auftrag 49): Einstellungen › Minispiele › Spielhalle. Jedes Minispiel als Vorschau mit wählbarer Lage,
// jedes Mal eine neue (Seed aus dem Zähler in records.ts), Bestwert pro Gerät. Nichts davon zählt im Spielstand; so
// lassen sich die Minispiele spielen, auch solange sie im Spiel aus sind (MINIGAMES_ENABLED).

import { useState } from 'preact/hooks';
import {
  Button,
  type ChipColor,
  Hint,
  Icon,
  IconChip,
  isMobileLayout,
  registerPanel,
  registerSearch,
  registerSlot,
  SegmentedControl,
  type UiApi,
  useUi,
} from '../../../ui';
import { type Challenge, MINIGAME_KIND_IDS, MINIGAME_KINDS, type MinigameKind } from '../index';
import { previewChallenge } from './preview';
import { loadRecords, nextArcadeSeed } from './records';
import { minigameView } from './registry';

declare module '../../../ui' {
  interface PanelRegistry {
    'minigames.arcade': Record<string, never>;
  }
}

/** origin.module einer Vorschau aus der Spielhalle (der Rahmen führt danach zurück und bietet kein Abgeben an). */
export const ARCADE_ORIGIN = 'arcade';

type ArcadeLevel = 'easy' | 'normal' | 'hard';

/** Lage je Stufe (challenge.difficulty), so wie sie im Spiel vorkommt: ruhig, angespannt, brenzlig. */
const LEVELS: Record<ArcadeLevel, { label: string; difficulty: number }> = {
  easy: { label: 'Leicht', difficulty: 0.25 },
  normal: { label: 'Normal', difficulty: 0.5 },
  hard: { label: 'Schwer', difficulty: 0.85 },
};

/** Ein Satz je Minispiel und die Bedeutungsfarbe der Kachel (Polizei, Gangs, Geld, Ware, Leute). */
const ARCADE_GAMES: Record<MinigameKind, { blurb: string; color: ChipColor }> = {
  chase: { blurb: 'Streife abhängen, ab in die Tiefgarage.', color: 'law' },
  brawl: { blurb: 'Schlagen, blocken, ausweichen.', color: 'danger' },
  stash: { blurb: 'Ware weg, bevor die Tür fällt.', color: 'law' },
  traffic: { blurb: 'Ruhig bleiben, nichts Falsches sagen.', color: 'law' },
  undercover: { blurb: 'Zivi oder echter Kunde?', color: 'people' },
  safe: { blurb: 'Am Rad hören, wann es klickt.', color: 'money' },
  search: { blurb: 'Die Bude absuchen, leise.', color: 'dirty' },
  container: { blurb: 'Packen wie Tetris, am Scanner vorbei.', color: 'goods' },
  papers: { blurb: 'Fehler finden, Papiere fälschen.', color: 'place' },
  interview: { blurb: 'Mit Druck die Wahrheit hören.', color: 'people' },
};

/** Ein Minispiel aus der Spielhalle starten (am Handy-Bildschirm vorher das Handy weglegen). */
export function playInArcade(ui: UiApi, kind: MinigameKind, difficulty: number): void {
  const base = previewChallenge(kind, difficulty, nextArcadeSeed());
  const preview: Challenge = {
    ...base,
    origin: { module: ARCADE_ORIGIN, ref: kind },
    situation: minigameView(kind).previewSituation ?? ARCADE_GAMES[kind].blurb,
  };
  if (isMobileLayout()) ui.closePhone();
  ui.openDialog('minigames.play', { challengeId: preview.id, preview });
}

/** Nach „Weiter“: zurück in die Spielhalle (am Desktop bleibt das Handy ohnehin offen). */
export function backToArcade(ui: UiApi): void {
  if (!isMobileLayout()) return;
  ui.openPhone('core.settings');
  ui.openPanel('minigames.arcade', {});
}

/** Die Lage bleibt für die Sitzung gemerkt (zwischen zwei Durchgängen öffnet sich die Seite neu). */
let lastLevel: ArcadeLevel = 'normal';

function ArcadePanel() {
  const ui = useUi();
  const [level, setLevel] = useState<ArcadeLevel>(lastLevel);
  const records = loadRecords();
  return (
    <div class="mg-arcade">
      <SegmentedControl
        wide
        options={(Object.keys(LEVELS) as ArcadeLevel[]).map((value) => ({ value, label: LEVELS[value].label }))}
        value={level}
        onChange={(value) => {
          lastLevel = value;
          setLevel(value);
        }}
      />
      <div class="mg-arcade__tiles">
        {MINIGAME_KIND_IDS.map((kind) => {
          const view = minigameView(kind);
          const game = ARCADE_GAMES[kind];
          const record = records[kind];
          return (
            <button
              key={kind}
              type="button"
              class="mg-arcade__tile"
              onClick={() => playInArcade(ui, kind, LEVELS[level].difficulty)}
            >
              <span class="mg-arcade__top">
                <IconChip icon={view.icon ?? 'bolt'} color={game.color} solid size="lg" shape="tile" />
                <Icon name="play" class="mg-arcade__play" />
              </span>
              <span class="mg-arcade__name">{MINIGAME_KINDS[kind].name}</span>
              <span class="mg-arcade__blurb">{game.blurb}</span>
              <span class={`mg-arcade__best${record ? '' : ' is-new'}`}>
                {record ? (
                  <>
                    <Icon name="trophy" class="mg-arcade__trophy" />
                    <strong class="mg-arcade__score">{Math.round(record.best * 100)}</strong>
                    <span>
                      {record.won}/{record.played} geschafft
                    </span>
                  </>
                ) : (
                  'Noch nicht gespielt'
                )}
              </span>
            </button>
          );
        })}
      </div>
      <Hint>Zum Üben: jede Runde eine neue Lage, nichts davon zählt im Spielstand.</Hint>
    </div>
  );
}

function ArcadeSettings() {
  const ui = useUi();
  const records = loadRecords();
  const played = MINIGAME_KIND_IDS.filter((kind) => records[kind]).length;
  return (
    <div class="mg-arcade-settings">
      <Hint>
        Alle zehn Minispiele zum Üben, mit Bestwert.{' '}
        {played > 0 ? `${played} von 10 schon gespielt.` : 'Nichts davon zählt im Spielstand.'}
      </Hint>
      <Button small variant="primary" icon="play" onClick={() => ui.openPanel('minigames.arcade', {})}>
        Spielhalle
      </Button>
    </div>
  );
}

registerPanel({ id: 'minigames.arcade', title: () => 'Spielhalle', component: ArcadePanel });
registerSlot('core.settings', {
  id: 'minigames.arcade',
  title: 'Minispiele',
  icon: 'bolt',
  color: 'brand',
  order: 7,
  component: ArcadeSettings,
});
registerSearch({
  id: 'minigames.arcade',
  label: 'Spielhalle',
  order: 7,
  items: () => [
    {
      id: 'minigames.arcade',
      title: 'Spielhalle',
      subtitle: 'Alle Minispiele zum Üben',
      icon: 'bolt',
      keywords: 'Minispiele Minispiel üben Training Verfolgungsjagd Straßenkampf Tresor Container Arcade',
      run: (ui) => ui.openPanel('minigames.arcade', {}),
    },
  ],
});
