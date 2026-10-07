// Straßenkampf (Auftrag 44, Teil 2): Seitenansicht im Canvas, Kamera folgt dem Geschehen, Glas-HUD oben (du und
// deine Crew mit Leben, Polizei-Uhr, Kräfteverhältnis, die Gegner mit Rolle). Gegner kündigen Angriffe mit einem
// Zeichen über dem Kopf an; Block oder Ausweichen im letzten Moment ist ein Konter (Zeitlupe, doppelter Schaden).
// Treffer-Feedback: Aufblitzen, Treffer-Stopp, Schadenszahlen, Funken, Wackeln, Ton, Vibration.
// Spiellogik in model.ts, Zeichnen in draw.ts.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Look, lookFor, personLook } from '../../../../../core';
import { Avatar, audio, DuelBar, haptic, Icon, prefersReducedMotion } from '../../../../../ui';
import { HudTimer } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { TouchControls } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { type Stage, useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import {
  BADGE_FOR,
  type Backdrop,
  type BrawlLayout,
  type BrawlPalette,
  blendPose,
  brawlLayout,
  type Colors,
  clampCamera,
  colorsFor,
  type Drop,
  drawBackdrop,
  drawBadge,
  drawFigure,
  drawFloaters,
  drawLoot,
  drawSparks,
  drawWeather,
  type Floater,
  idlePose,
  isWet,
  type Pose,
  readPalette,
  renderBackdrop,
  type Spark,
  targetPose,
  toScreen,
} from './draw';
import {
  type BrawlEvent,
  type BrawlInput,
  type BrawlSetup,
  brawlPicks,
  brawlScore,
  CREW_MOVES,
  createBrawl,
  type Fighter,
  finished,
  GRAB_TIME,
  initBrawl,
  moveReady,
  playerOf,
  ROLE_NAMES,
  sideHealth,
  stepBrawl,
  timeLeft,
} from './model';
import { BRAWL_SOUNDS } from './sounds';

const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Space',
  'Digit1',
  'Digit2',
  'Digit3',
];

/** Fester Look des Spielers: Lederjacke, Fade, Bartschatten, Kette. */
const PLAYER_LOOK: Partial<Look> = {
  feminine: false,
  age: 34,
  hair: 'fade',
  hairColor: 0,
  beard: 'stubble',
  hat: 'none',
  top: 'leather',
  topColor: 1,
  chain: 'thick',
  glasses: 'none',
  mask: 'none',
  mouthItem: 'none',
};

interface Figure {
  look: Look;
  colors: Colors;
  pose: Pose;
  walk: number;
  lastX: number;
  bulk: number;
}

interface HudFighter {
  id: string;
  name: string;
  hp: number;
  max: number;
  state: 'in' | 'down' | 'fled';
  role: string | null;
  cd: number | null;
}

interface Hud {
  left: number;
  own: number;
  foe: number;
  fighters: HudFighter[];
  callout: { text: string; tone: 'info' | 'bad' | 'good'; key: number } | null;
  counter: boolean;
  guard: boolean;
}

function sfx(id: string, volume: number): void {
  audio.play(id, { volume });
}

function lookOf(f: BrawlSetup['own'][number] | BrawlSetup['foes'][number]): Look {
  if (f.kind === 'player') return lookFor('player:boss', '', PLAYER_LOOK);
  if (f.kind === 'crew') return personLook(f.lookSeed, f.age ?? undefined);
  return lookFor(f.lookSeed, '', f.kind === 'bruiser' ? { feminine: false } : {});
}

function hashSeed(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

function hudOf(state: ReturnType<typeof initBrawl>, setup: BrawlSetup, prev: Hud | null): Hud {
  return {
    left: timeLeft(setup, state),
    own: sideHealth(state, 'own'),
    foe: sideHealth(state, 'foe'),
    fighters: state.fighters.map((f) => ({
      id: f.id,
      name:
        f.kind === 'player'
          ? 'Du'
          : (setup.own.find((o) => o.id === f.id)?.name.split(' ')[0] ?? ROLE_NAMES[f.kind as 'leader']),
      hp: Math.max(0, Math.round(f.hp)),
      max: f.maxHp,
      state: f.out === 'fled' || f.fleeing ? 'fled' : f.out === 'down' || f.state === 'down' ? 'down' : 'in',
      role: f.side === 'foe' ? ROLE_NAMES[f.kind as 'leader'] : null,
      cd: f.move ? moveReady(state, f.id) : null,
    })),
    callout: prev?.callout ?? null,
    counter: state.time <= state.counterUntil,
    guard: state.guardBy !== null,
  };
}

function sameHud(a: Hud, b: Hud): boolean {
  if (Math.ceil(a.left * 10) !== Math.ceil(b.left * 10) || a.own !== b.own || a.foe !== b.foe) return false;
  if (a.counter !== b.counter || a.guard !== b.guard) return false;
  return a.fighters.every((f, i) => {
    const g = b.fighters[i];
    return g && f.hp === g.hp && f.state === g.state && Math.ceil(f.cd ?? -1) === Math.ceil(g.cd ?? -1);
  });
}

export function BrawlGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const setup = useMemo(
    () => createBrawl(challenge.seed, challenge.difficulty, challenge.params),
    [challenge.seed, challenge.difficulty, challenge.params],
  );
  const game = useRef(initBrawl(setup));
  const palette = useMemo<BrawlPalette>(readPalette, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const figures = useMemo(() => {
    const map = new Map<string, Figure>();
    for (const f of [...setup.own, ...setup.foes]) {
      const look = lookOf(f);
      map.set(f.id, {
        look,
        colors: colorsFor(look, hashSeed(f.lookSeed)),
        pose: idlePose(),
        walk: 0,
        lastX: 0,
        bulk: f.kind === 'bruiser' ? 1.3 : f.kind === 'nervous' ? 0.9 : 1,
      });
    }
    return map;
  }, [setup]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<{ layout: BrawlLayout; backdrop: Backdrop; mobile: boolean } | null>(null);
  const fx = useRef({
    t: 0,
    cam: 5,
    shake: 0,
    flash: 0,
    vignette: 0,
    sparks: [] as Spark[],
    floaters: [] as Floater[],
    drops: [] as Drop[],
    lastHud: -1,
    sent: false,
    calloutUntil: 0,
    /** Gedrückte Knöpfe (Touch) und Tasten, die einmal gelten. */
    press: { light: false, heavy: false, dodge: false, lane: null as -1 | 1 | null, special: null as string | null },
    touch: { dx: 0 as -1 | 0 | 1, block: false },
  });
  const [hud, setHud] = useState<Hud>(() => hudOf(game.current, setup, null));

  const scene = useMemo(
    () => ({ setting: setup.setting, phase: setup.phase, weather: setup.weather, seed: setup.seed }),
    [setup],
  );

  const rebuild = (stage: Stage) => {
    const mobile = stage.width < 640;
    const layout = brawlLayout(stage.width, stage.height, mobile);
    view.current = { layout, mobile, backdrop: renderBackdrop(layout, scene, palette, stage.dpr) };
    // Regen bzw. Schnee: so viele Teilchen wie die Fläche hergibt (Optik, Math.random erlaubt).
    const count = setup.weather === 'snow' ? 70 : setup.weather === 'storm' ? 160 : setup.weather === 'rain' ? 110 : 0;
    fx.current.drops = Array.from({ length: reduced ? Math.round(count / 3) : count }, () => ({
      x: Math.random() * stage.width,
      y: Math.random() * stage.height,
      v: setup.weather === 'snow' ? 30 + Math.random() * 40 : 700 + Math.random() * 400,
      len: setup.weather === 'snow' ? 1 + Math.random() * 2 : 10 + Math.random() * 12,
    }));
    if (fx.current.cam === 5) fx.current.cam = clampCamera(layout, cameraGoal());
    draw(0);
  };
  const stage = useStageCanvas(canvas, rebuild);

  const say = (text: string, tone: 'info' | 'bad' | 'good' = 'info', seconds = 2.4) => {
    fx.current.calloutUntil = fx.current.t + seconds;
    setHud((h) => ({ ...h, callout: { text, tone, key: (h.callout?.key ?? 0) + 1 } }));
  };

  const keys = useGameKeys(
    KEYS,
    (press) => {
      const p = fx.current.press;
      switch (press.code) {
        case 'KeyJ':
          p.light = true;
          break;
        case 'KeyK':
          p.heavy = true;
          break;
        case 'Space':
          p.dodge = true;
          break;
        case 'ArrowUp':
        case 'KeyW':
          p.lane = -1;
          break;
        case 'ArrowDown':
        case 'KeyS':
          p.lane = 1;
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
          p.special = specialAt(Number(press.code.slice(5)) - 1);
          break;
        default:
          break;
      }
    },
    running,
  );

  /** Wer den Spezialzug Nummer i hat (Crew in Reihenfolge, nur mit Zug). */
  function specialAt(i: number): string | null {
    return setup.own.filter((f) => f.move)[i]?.id ?? null;
  }

  function cameraGoal(): number {
    const s = game.current;
    const p = playerOf(s);
    // Kamera zwischen dir und dem nächsten Gegner (etwas mehr bei dir).
    let near: Fighter | null = null;
    for (const f of s.fighters) {
      if (f.side !== 'foe' || f.out !== null || f.state === 'down') continue;
      if (!near || Math.abs(f.x - p.x) < Math.abs(near.x - p.x)) near = f;
    }
    return near && Math.abs(near.x - p.x) < 7 ? p.x * 0.6 + near.x * 0.4 : p.x;
  }

  function input(): BrawlInput {
    const f = fx.current;
    const left = keys.isDown('ArrowLeft') || keys.isDown('KeyA') || f.touch.dx < 0;
    const right = keys.isDown('ArrowRight') || keys.isDown('KeyD') || f.touch.dx > 0;
    const p = f.press;
    const result: BrawlInput = {
      dx: left === right ? 0 : left ? -1 : 1,
      lane: p.lane,
      light: p.light,
      heavy: p.heavy,
      dodge: p.dodge,
      block: keys.isDown('KeyL') || f.touch.block,
      special: p.special,
    };
    f.press = { light: false, heavy: false, dodge: false, lane: null, special: null };
    return result;
  }

  function screenOf(id: string) {
    const v = view.current;
    const f = game.current.fighters.find((x) => x.id === id);
    if (!v || !f) return null;
    return toScreen(v.layout, fx.current.cam, f.x, f.depth);
  }

  function burst(x: number, y: number, color: string, n: number, speed: number) {
    const f = fx.current;
    const count = reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      f.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0.35, max: 0.35, color });
    }
  }

  function float(x: number, y: number, text: string, color: string, size: number) {
    fx.current.floaters.push({ x, y, text, color, size, life: 1 });
  }

  function react(events: BrawlEvent[]) {
    const f = fx.current;
    const v = view.current;
    const ppm = v?.layout.ppm ?? 60;
    for (const e of events) {
      switch (e.type) {
        case 'swing':
          audio.playThrottled(e.attack === 'knife' ? BRAWL_SOUNDS.knife : BRAWL_SOUNDS.whoosh, 40, { volume: 0.5 });
          break;
        case 'telegraph':
          if (e.attack === 'knife') audio.playThrottled(BRAWL_SOUNDS.knife, 200, { volume: 0.4 });
          break;
        case 'hit': {
          const at = screenOf(e.target);
          const own = e.target === 'player';
          if (at) {
            const y = at.y - ppm * at.scale * 1.35;
            const color = e.blocked ? palette.ink2 : e.counter ? palette.gold : own ? palette.danger : palette.ink;
            float(
              at.x,
              y,
              e.blocked ? 'Block' : `−${e.damage}`,
              color,
              e.counter ? 34 : e.attack === 'light' ? 22 : 28,
            );
            if (e.counter) float(at.x, y - 34, 'KONTER', palette.gold, 30);
            if (!e.blocked)
              burst(
                at.x,
                y + ppm * 0.2,
                e.counter ? palette.gold : palette.ink,
                e.attack === 'light' ? 6 : 12,
                ppm * 6,
              );
          }
          if (e.blocked) sfx(BRAWL_SOUNDS.block, 0.7);
          else sfx(e.attack === 'light' ? BRAWL_SOUNDS.punch : BRAWL_SOUNDS.heavy, 0.9);
          if (own && !e.blocked) {
            f.shake = Math.max(f.shake, e.attack === 'light' ? 0.5 : 1);
            f.vignette = 1;
            haptic(e.attack === 'light' ? 'light' : 'error');
          } else if (e.attacker === 'player') {
            f.shake = Math.max(f.shake, e.attack === 'heavy' || e.counter ? 0.6 : 0.25);
            if (e.counter || e.attack === 'heavy') haptic('medium');
          }
          break;
        }
        case 'parry': {
          const at = screenOf(e.target);
          if (at)
            float(at.x, at.y - ppm * at.scale * 2.1, e.how === 'block' ? 'Konter!' : 'Ausgewichen!', palette.gold, 30);
          sfx(BRAWL_SOUNDS.parry, 0.9);
          haptic('success');
          f.flash = 0.6;
          say('Konter: dein nächster Treffer zählt doppelt.', 'good', 1.6);
          break;
        }
        case 'guarded': {
          const at = screenOf('player');
          const by = setup.own.find((o) => o.id === e.by)?.name.split(' ')[0] ?? 'Crew';
          if (at) float(at.x, at.y - ppm * at.scale * 2.1, `${by} fängt ab`, palette.people, 24);
          sfx(BRAWL_SOUNDS.block, 0.9);
          break;
        }
        case 'guardBreak': {
          const at = screenOf(e.id);
          if (at) float(at.x, at.y - ppm * at.scale * 2.2, 'Deckung durch', palette.warn, 24);
          break;
        }
        case 'down':
          sfx(BRAWL_SOUNDS.down, 0.9);
          if (e.id === 'player') say('Du gehst zu Boden.', 'bad', 3);
          else if (e.id.startsWith('foe:')) {
            f.shake = Math.max(f.shake, 0.7);
            haptic('medium');
          } else say(`${setup.own.find((o) => o.id === e.id)?.name.split(' ')[0] ?? 'Einer'} ist am Boden.`, 'bad');
          break;
        case 'fled':
          say(
            `Der ${ROLE_NAMES[(setup.foes.find((x) => x.id === e.id)?.kind ?? 'nervous') as 'nervous']} haut ab.`,
            'good',
          );
          break;
        case 'grabStart':
          say(setup.loot?.stake === 'cash' ? 'Er greift nach der Kasse!' : 'Er greift nach der Ware!', 'bad', 2);
          haptic('warning');
          break;
        case 'grabbed':
          say(setup.loot?.stake === 'cash' ? 'Weg mit der Kasse.' : 'Weg mit der Ware.', 'bad', 2.5);
          playSound(MINIGAME_SOUNDS.fail, 0.8);
          break;
        case 'special': {
          const def = CREW_MOVES[e.move];
          const name = setup.own.find((o) => o.id === e.id)?.name.split(' ')[0] ?? 'Crew';
          say(`${name}: ${def.label}.`, 'good', 1.6);
          if (e.move === 'getaway') {
            sfx(BRAWL_SOUNDS.horn, 0.9);
            f.flash = 1;
          } else playSound(MINIGAME_SOUNDS.clunk, 0.6);
          haptic('medium');
          break;
        }
        case 'sirens':
          sfx(BRAWL_SOUNDS.siren, 0.9);
          say('Sirenen! Alle rennen weg.', 'bad', 3);
          haptic('warning');
          break;
        case 'end':
          if (e.end === 'won') say('Keiner steht mehr.', 'good', 3);
          break;
      }
    }
  }

  function draw(dt: number) {
    const st = stage.current;
    const v = view.current;
    if (!st || !v) return;
    const { ctx, width, height } = st;
    const { layout, backdrop } = v;
    const s = game.current;
    const f = fx.current;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const shake = f.shake * (reduced ? 2 : 9);
    if (shake > 0.2) ctx.translate(Math.sin(f.t * 71) * shake, Math.cos(f.t * 57) * shake * 0.6);
    drawBackdrop(ctx, layout, backdrop, f.cam);
    if (setup.loot) {
      const at = toScreen(layout, f.cam, setup.loot.x, 1);
      drawLoot(ctx, setup.loot.stake, at.x, at.y, layout.ppm * at.scale, palette, s.grabbed);
    }
    // Figuren von hinten nach vorn (hintere Ebene zuerst), am Boden Liegende zuerst.
    const order = [...s.fighters].sort(
      (a, b) =>
        b.depth - a.depth ||
        Number(b.state === 'down') - Number(a.state === 'down') ||
        Number(a.kind === 'player') - Number(b.kind === 'player'),
    );
    const wet = isWet(setup.weather);
    for (const fighter of order) {
      const fig = figures.get(fighter.id);
      if (!fig) continue;
      const at = toScreen(layout, f.cam, fighter.x, fighter.depth);
      if (at.x < -layout.ppm * 2 || at.x > width + layout.ppm * 2) continue;
      // Haltung weich nachführen (Schläge schnell, sonst weicher).
      fig.walk += Math.abs(fighter.x - fig.lastX) * 3.4;
      fig.lastX = fighter.x;
      const snap = fighter.state === 'strike' || fighter.state === 'hit' ? 30 : fighter.state === 'down' ? 9 : 16;
      fig.pose =
        dt > 0
          ? blendPose(fig.pose, targetPose(fighter, fig.walk, f.t), Math.min(1, dt * snap))
          : targetPose(fighter, fig.walk, f.t);
      const ppm = layout.ppm * at.scale;
      const ring =
        fighter.state === 'down' || fighter.out
          ? null
          : fighter.kind === 'player'
            ? palette.gold
            : fighter.side === 'own'
              ? palette.people
              : fighter.state === 'windup'
                ? palette.danger
                : null;
      const opts = {
        x: at.x,
        y: at.y,
        ppm,
        facing: fighter.facing,
        flash: s.time - fighter.flash < 0.07 ? 1 : 0,
        opacity: fighter.state === 'dodge' ? 0.55 : 1,
        knife: fighter.knife && fighter.state !== 'down',
        bulk: fig.bulk,
        ring,
      };
      // Nasse Straße: blasse Spiegelung unter der Figur.
      if (wet && fighter.state !== 'down') {
        ctx.save();
        ctx.translate(0, at.y * 2);
        ctx.scale(1, -1);
        ctx.globalAlpha = 0.12;
        drawFigure(ctx, fig.pose, fig.look, fig.colors, { ...opts, ring: null, opacity: 0.12 });
        ctx.restore();
      }
      if (fighter.state === 'dodge' && !reduced) {
        // Nachbild beim Ausweichen.
        drawFigure(ctx, fig.pose, fig.look, fig.colors, {
          ...opts,
          x: at.x + fighter.facing * ppm * 0.35,
          opacity: 0.18,
          ring: null,
        });
      }
      drawFigure(ctx, fig.pose, fig.look, fig.colors, opts);
      // Zeichen über dem Kopf: Ansage, Zögern, Beute, Konter bereit.
      const headY = at.y - ppm * 2.15;
      const badge = Math.max(18, ppm * 0.34);
      if (fighter.side === 'foe' && fighter.state === 'windup' && fighter.attack) {
        const kind = BADGE_FOR[fighter.attack] ?? 'light';
        drawBadge(ctx, kind, at.x, headY, badge * (1 + 0.15 * Math.sin(f.t * 20)), palette, f.t);
      } else if (fighter.side === 'foe' && fighter.hesitate > 0 && fighter.state !== 'down') {
        drawBadge(ctx, 'hesitate', at.x, headY, badge, palette, f.t);
      } else if (fighter.grab > 0) {
        drawBadge(ctx, 'grab', at.x, headY, badge, palette, f.t, fighter.grab / GRAB_TIME);
      } else if (fighter.kind === 'player' && s.time <= s.counterUntil) {
        drawBadge(ctx, 'counter', at.x, headY, badge, palette, f.t);
      }
    }
    drawSparks(ctx, f.sparks);
    drawFloaters(ctx, f.floaters);
    ctx.restore();
    drawWeather(ctx, setup.weather, f.drops, palette, setup.weather === 'storm' ? 0.35 : 0.12);
    // Rand rot, wenn du getroffen wirst; Blitz bei Konter und Fernlicht; Sirenen blau-rot.
    if (f.vignette > 0.02) {
      const g = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.35,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.75,
      );
      g.addColorStop(0, 'rgba(0, 0, 0, 0)');
      g.addColorStop(1, palette.danger);
      ctx.globalAlpha = f.vignette * 0.45;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    if (f.flash > 0.02) {
      ctx.globalAlpha = f.flash * (reduced ? 0.15 : 0.35);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    if (s.sirens) {
      const blue = Math.sin(f.t * 9) > 0;
      ctx.globalAlpha = reduced ? 0.12 : 0.22;
      ctx.fillStyle = blue ? palette.place : palette.danger;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    // Zeitlupe: leichte Abdunklung am Rand.
    if (s.slowmo > 0 && !s.sirens) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fillRect(0, 0, width, height);
    }
  }

  function finish() {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(brawlScore(game.current), brawlPicks(game.current));
  }

  useFrameLoop((dt) => {
    const s = game.current;
    const f = fx.current;
    f.t += dt;
    const events = stepBrawl(setup, s, dt, s.end ? { dx: 0 } : input());
    if (reduced) s.slowmo = Math.min(s.slowmo, 0.15);
    if (events.length > 0) react(events);
    // Kamera folgt weich.
    const v = view.current;
    if (v) f.cam += (clampCamera(v.layout, cameraGoal()) - f.cam) * Math.min(1, dt * 3);
    // Effekte abklingen lassen.
    f.shake = Math.max(0, f.shake - dt * 4);
    f.flash = Math.max(0, f.flash - dt * 2.5);
    f.vignette = Math.max(0, f.vignette - dt * 2);
    const slow = s.slowmo > 0 ? 0.35 : 1;
    for (const sp of f.sparks) {
      sp.x += sp.vx * dt * slow;
      sp.y += sp.vy * dt * slow;
      sp.vy += 900 * dt * slow;
      sp.life -= dt;
    }
    f.sparks = f.sparks.filter((sp) => sp.life > 0);
    for (const fl of f.floaters) {
      fl.y -= 50 * dt;
      fl.life -= dt * 0.9;
    }
    f.floaters = f.floaters.filter((fl) => fl.life > 0);
    if (v) {
      const { width, height } = v.layout;
      for (const d of f.drops) {
        d.y += d.v * dt;
        d.x += (setup.weather === 'snow' ? Math.sin(f.t + d.len * 3) * 20 : -d.v * 0.12) * dt;
        if (d.y > height) {
          d.y = -20;
          d.x = Math.random() * (width + 40);
        }
        if (d.x < -20) d.x = width + 10;
      }
    }
    draw(dt);
    // HUD höchstens zehnmal pro Sekunde neu.
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      setHud((h) => {
        const next = hudOf(s, setup, h);
        if (h.callout && f.t > f.calloutUntil) next.callout = null;
        return sameHud(h, next) && h.callout === next.callout ? h : next;
      });
    }
    if (finished(s)) finish();
  }, running);

  // Entwicklung: window.koeln.dev.brawl zeigt den laufenden Kampf (Screenshots, Playwright: z.B. Leben setzen).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const holder = window as unknown as { koeln?: { dev?: Record<string, unknown> } };
    if (!holder.koeln) return;
    holder.koeln.dev = { ...holder.koeln.dev, brawl: { setup, state: game.current } };
    return () => {
      if (holder.koeln?.dev) delete holder.koeln.dev.brawl;
    };
  }, [setup]);

  // Ansage der Absicht zu Beginn (einmal, sobald es losgeht).
  const announced = useRef(false);
  if (running && !announced.current) {
    announced.current = true;
    if (setup.callout) {
      fx.current.calloutUntil = 3.2;
      queueMicrotask(() => setHud((h) => ({ ...h, callout: { text: setup.callout ?? '', tone: 'bad', key: 1 } })));
    }
  }

  const own = hud.fighters.filter((f) => !f.id.startsWith('foe:'));
  const foes = hud.fighters.filter((f) => f.id.startsWith('foe:'));
  const specials = setup.own.filter((f) => f.move);
  return (
    <div class="brawl">
      <canvas ref={canvas} class="brawl__canvas" aria-label="Straßenkampf" />
      <div class="brawl__hud">
        <ul class="brawl__team is-own" aria-label="Deine Seite">
          {own.map((f) => (
            <FighterCard key={f.id} fighter={f} look={figures.get(f.id)?.look} main={f.id === 'player'} side="own" />
          ))}
        </ul>
        <div class="brawl__center">
          <span class="brawl__clock">
            <Icon name="siren" class="brawl__siren" />
            <HudTimer seconds={hud.left} total={setup.duration} urgentAt={10} label="bis Polizei" />
          </span>
          <DuelBar left={hud.own} right={hud.foe} leftLabel="Ihr" rightLabel={setup.label} />
        </div>
        <ul class="brawl__team is-foe" aria-label="Gegner">
          {foes.map((f) => (
            <FighterCard key={f.id} fighter={f} look={figures.get(f.id)?.look} main={false} side="foe" />
          ))}
        </ul>
      </div>
      {running && hud.callout && (
        <p key={hud.callout.key} class={`brawl__callout is-${hud.callout.tone}`} aria-live="polite">
          {hud.callout.text}
        </p>
      )}
      {running && (hud.counter || hud.guard) && (
        <p class="brawl__status">
          {hud.counter && (
            <span class="brawl__chip is-gold">
              <Icon name="bolt" />
              Konter bereit
            </span>
          )}
          {hud.guard && (
            <span class="brawl__chip is-people">
              <Icon name="shield" />
              Deckung
            </span>
          )}
        </p>
      )}
      {specials.length > 0 && (
        <div class="brawl__specials">
          {specials.map((f, i) => {
            const def = CREW_MOVES[f.move ?? 'block'];
            const cd = hud.fighters.find((x) => x.id === f.id)?.cd ?? null;
            const ready = cd === 0;
            return (
              <button
                key={f.id}
                type="button"
                class={`brawl__special${ready ? ' is-ready' : ''}`}
                disabled={!running || cd === null || !ready}
                title={def.hint}
                aria-label={`${def.label} (${f.name.split(' ')[0]}), Taste ${i + 1}${ready ? '' : cd === null ? ', nicht möglich' : `, in ${Math.ceil(cd)} Sekunden`}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  fx.current.press.special = f.id;
                }}
                onClick={(e) => {
                  if ((e as MouseEvent).detail === 0) fx.current.press.special = f.id;
                }}
              >
                <Icon name={def.icon} />
                <span class="brawl__special-text">
                  <span class="brawl__special-label">{def.label}</span>
                  <span class="brawl__special-who">{f.name.split(' ')[0]}</span>
                </span>
                <kbd class="brawl__kbd">{i + 1}</kbd>
                {!ready && cd !== null && <span class="brawl__cd">{Math.ceil(cd)}</span>}
              </button>
            );
          })}
        </div>
      )}
      <ul class="brawl__keys" aria-label="Tasten">
        <li>
          <kbd>←</kbd>
          <kbd>→</kbd> laufen
        </li>
        <li>
          <kbd>↑</kbd>
          <kbd>↓</kbd> Ebene
        </li>
        <li>
          <kbd>J</kbd> Schlag
        </li>
        <li>
          <kbd>K</kbd> hart
        </li>
        <li>
          <kbd>L</kbd> Block
        </li>
        <li>
          <kbd>Leertaste</kbd> ausweichen
        </li>
      </ul>
      <TouchControls
        class="brawl__touch"
        pad="full"
        onDirection={(d, pressed) => {
          const f = fx.current;
          if (d === 'left' || d === 'right') {
            const sign = d === 'left' ? -1 : 1;
            if (pressed) f.touch.dx = sign;
            else if (f.touch.dx === sign) f.touch.dx = 0;
          } else if (pressed) f.press.lane = d === 'up' ? -1 : 1;
        }}
        buttons={[
          {
            id: 'block',
            label: 'Block',
            icon: 'shield',
            disabled: !running,
            onPress: () => {
              fx.current.touch.block = true;
            },
            onRelease: () => {
              fx.current.touch.block = false;
            },
          },
          {
            id: 'dodge',
            label: 'Ausweichen',
            icon: 'wind',
            disabled: !running,
            onPress: () => {
              fx.current.press.dodge = true;
            },
          },
          {
            id: 'heavy',
            label: 'Hart',
            icon: 'flame',
            tone: 'danger',
            disabled: !running,
            onPress: () => {
              fx.current.press.heavy = true;
            },
          },
          {
            id: 'light',
            label: 'Schlag',
            icon: 'fist',
            tone: 'gold',
            disabled: !running,
            onPress: () => {
              fx.current.press.light = true;
            },
          },
        ]}
      />
    </div>
  );
}

function FighterCard(props: { fighter: HudFighter; look: Look | undefined; main: boolean; side: 'own' | 'foe' }) {
  const { fighter: f } = props;
  const share = f.max > 0 ? f.hp / f.max : 0;
  const tone = props.side === 'foe' ? 'danger' : share < 0.35 ? 'danger' : share < 0.6 ? 'warn' : 'money';
  const out = f.state !== 'in';
  return (
    <li class={`brawl__card${props.main ? ' is-main' : ''}${out ? ' is-out' : ''}`}>
      <Avatar name={f.name} look={props.look} size="sm" tone={props.side === 'foe' ? 'danger' : 'people'} />
      <span class="brawl__card-body">
        <span class="brawl__card-name">
          {props.main ? 'Du' : (f.role ?? f.name)}
          {out && <span class="brawl__card-out">{f.state === 'fled' ? 'weg' : 'am Boden'}</span>}
        </span>
        <span class={`brawl__hp is-${tone}`} role="img" aria-label={`${f.role ?? f.name}: ${f.hp} von ${f.max} Leben`}>
          <span style={{ transform: `scaleX(${share})` }} />
        </span>
      </span>
    </li>
  );
}
