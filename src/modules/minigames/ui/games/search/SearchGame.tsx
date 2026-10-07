// Bude durchsuchen (Auftrag 44, Teil 6): Draufsicht auf die Wohnung des Schuldners, Glas-HUD oben (Zeit, Verstecke,
// gefundenes Geld, Lärm). Antippen bzw. Klicken durchsucht ein Ding, Pfeiltasten wählen, Leertaste sucht. Bei Nacht
// sieht man nur im Kegel der Taschenlampe (folgt Maus, Finger oder Auswahl), bei Tag fällt Licht durch die Jalousien.
// Spiellogik in model.ts, Lage in layout.ts, Zeichnen in draw.ts, Klänge in sounds.ts.

import { useMemo, useRef, useState } from 'preact/hooks';
import { formatEuro } from '../../../../../core';
import { audio, haptic, prefersReducedMotion } from '../../../../../ui';
import { HudBar, HudMeter, HudTimer } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { capture } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { type Stage, useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import {
  drawBadge,
  drawBill,
  drawDarkness,
  drawDoorEnd,
  drawFloatText,
  drawFocus,
  drawNoiseRings,
  drawPeek,
  drawProgress,
  drawScuff,
  lightOf,
  readPalette,
  renderApartment,
  renderItem,
  SPRITE_PAD,
} from './draw';
import { type ApartmentLayout, apartmentLayout, hitTest, itemRect, neighbour, type Rect } from './layout';
import {
  advance,
  createSearch,
  initSearch,
  pick,
  progress,
  type SearchEvent,
  searchPicks,
  searchScore,
  timeLeft,
} from './model';
import { SEARCH_SOUNDS } from './sounds';

const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Space',
  'Enter',
  'NumpadEnter',
];

const DIRS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
};

interface Layers {
  layout: ApartmentLayout;
  bg: HTMLCanvasElement;
  rects: Rect[];
  sprites: HTMLCanvasElement[];
}

interface Bill {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
  delay: number;
  spin: number;
  arc: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  color: 'money' | 'warn' | 'ink';
  age: number;
}

interface Hud {
  left: number;
  found: number;
  stashes: number;
  noise: number;
  message: string | null;
  tone: 'good' | 'bad' | 'warn' | null;
  serial: number;
}

/** Eigener Klang des Spiels (Lautstärke relativ zu den Effekten). */
function sfx(id: string, volume = 1): void {
  audio.play(id, { volume });
}

/** Wie viel in der Bude liegt (params.max aus gangs; in der Vorschau erfunden). */
function maxOf(params: Record<string, unknown>): number {
  const max = Number(params.max);
  return Number.isFinite(max) && max > 0 ? Math.round(max) : 0;
}

export function SearchGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const total = maxOf(challenge.params);
  const setup = useMemo(
    () => createSearch(challenge.seed, challenge.difficulty, total),
    [challenge.seed, challenge.difficulty, total],
  );
  const game = useRef(initSearch(setup));
  const light = lightOf(challenge.params.phase);
  const palette = useMemo(readPalette, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layers = useRef<Layers | null>(null);
  const fx = useRef({
    t: 0,
    shake: 0,
    flash: 0,
    alertT: -1,
    keyT: -1,
    endAt: -1,
    sent: false,
    selected: -1,
    hover: -1,
    lightX: -1,
    lightY: -1,
    /** Wer das Licht führt: Zeiger (Maus/Finger) oder Auswahl (Tastatur). */
    lead: 'none' as 'none' | 'pointer' | 'keys',
    pointer: { x: 0, y: 0 },
    press: null as { x: number; y: number; id: number; moved: boolean } | null,
    lastRustle: -1,
    pops: new Map<number, number>(),
    rings: new Map<number, number>(),
    bills: [] as Bill[],
    floats: [] as Floater[],
    dirty: true,
  });
  const [hud, setHud] = useState<Hud>(() => ({
    left: setup.duration,
    found: 0,
    stashes: 0,
    noise: 0,
    message: null,
    tone: null,
    serial: 0,
  }));

  const say = (message: string, tone: Hud['tone'] = null) =>
    setHud((h) => ({ ...h, message, tone, serial: h.serial + 1 }));

  const rebuild = (stage: Stage) => {
    const layout = apartmentLayout(stage.width, stage.height);
    const rects = setup.items.map((item) => itemRect(layout, item.id, item.room));
    layers.current = {
      layout,
      rects,
      bg: renderApartment(
        layout,
        palette,
        light,
        setup.items.map((item, i) => ({ id: item.id, room: item.room, rect: rects[i] })),
        stage.dpr,
      ),
      sprites: setup.items.map((item, i) => renderItem(palette, item.id, rects[i].w, rects[i].h, stage.dpr)),
    };
    fx.current.dirty = true;
    draw();
  };
  const stage = useStageCanvas(canvas, rebuild);

  const center = (i: number): { x: number; y: number } | null => {
    const r = layers.current?.rects[i];
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  };

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(searchScore(setup, game.current), searchPicks(setup, game.current));
  };

  const react = (events: SearchEvent[]) => {
    const f = fx.current;
    const ls = layers.current;
    for (const e of events) {
      f.dirty = true;
      if (e.type === 'start') {
        sfx(SEARCH_SOUNDS.rustle, 0.8);
        f.lastRustle = f.t;
        haptic('light');
      } else if (e.type === 'found') {
        const item = setup.items[e.index];
        sfx(SEARCH_SOUNDS.cash);
        haptic('success');
        f.pops.set(e.index, 0);
        const c = center(e.index);
        if (c && ls) {
          const count = reduced ? 3 : 7;
          for (let i = 0; i < count; i++) {
            f.bills.push({
              x0: c.x,
              y0: c.y,
              x1: ls.layout.width / 2 + 40,
              y1: 40,
              age: 0,
              delay: i * 0.06,
              spin: (Math.random() - 0.5) * 8,
              arc: (Math.random() - 0.5) * 120,
            });
          }
          f.floats.push({ text: `+${formatEuro(e.amount)}`, x: c.x, y: c.y - 16, color: 'money', age: 0 });
        }
        say(`${item.name}: ${formatEuro(e.amount)}!`, 'good');
      } else if (e.type === 'empty') {
        sfx(SEARCH_SOUNDS.empty, 0.7);
        f.pops.set(e.index, 0);
        say(`${setup.items[e.index].name}: nichts.`);
      } else if (e.type === 'noise') {
        sfx(SEARCH_SOUNDS.clatter, 0.9);
        haptic('warning');
        f.shake = Math.max(f.shake, 0.6);
        f.rings.set(e.index, 0);
        const c = center(e.index);
        if (c) f.floats.push({ text: 'KLIRR!', x: c.x, y: c.y - 30, color: 'warn', age: 0 });
        if (e.level < 1) say(e.level > 0.6 ? 'Klirr! Nebenan wird es still.' : 'Klirr! Leise …', 'warn');
      } else if (e.type === 'alert') {
        sfx(SEARCH_SOUNDS.bang);
        haptic('error');
        f.shake = 1;
        f.alertT = 0;
        say('Der Nachbar hämmert an die Wand und ruft die Bullen. Schnell!', 'bad');
      } else if (e.type === 'steps') {
        sfx(SEARCH_SOUNDS.steps, 0.8);
        if (!game.current.alerted) say('Schritte im Treppenhaus …', 'warn');
      } else if (e.type === 'end') {
        if (e.reason === 'all') {
          f.flash = 1;
          f.endAt = f.t + 1.2;
          say('Alles gefunden. Raus hier.', 'good');
        } else {
          f.keyT = 0;
          f.endAt = f.t + 2.8;
          sfx(SEARCH_SOUNDS.key);
          haptic('warning');
          say('Der Schlüssel dreht sich im Schloss!', 'bad');
        }
      }
    }
    const s = game.current;
    setHud((h) => ({ ...h, found: s.found, stashes: s.foundStashes, noise: s.noise }));
  };

  const searchAt = (index: number) => {
    const s = game.current;
    if (!running || s.done || index < 0) return;
    if (s.searched[index]) {
      playSound(MINIGAME_SOUNDS.click, 0.4);
      say(`${setup.items[index].name}: schon durchsucht.`);
      return;
    }
    const events = pick(setup, s, index);
    if (events.length === 0 && s.queued === index) say(`Gleich: ${setup.items[index].name}.`);
    react(events);
  };

  useGameKeys(
    KEYS,
    (press) => {
      const f = fx.current;
      const ls = layers.current;
      if (!ls) return;
      f.lead = 'keys';
      f.dirty = true;
      const dir = DIRS[press.code];
      if (dir) {
        const s = game.current;
        if (f.selected < 0) {
          // Erste Wahl: das unbesuchte Ding nächst der Mitte.
          const cx = ls.layout.outer.x + ls.layout.outer.w / 2;
          const cy = ls.layout.outer.y + ls.layout.outer.h / 2;
          let best = 0;
          let bestD = Number.POSITIVE_INFINITY;
          ls.rects.forEach((r, i) => {
            const d = (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2;
            if (!s.searched[i] && d < bestD) {
              bestD = d;
              best = i;
            }
          });
          f.selected = best;
        } else f.selected = neighbour(ls.rects, f.selected, dir[0], dir[1], (i) => s.searched[i]);
        playSound(MINIGAME_SOUNDS.click, 0.25);
        return;
      }
      if (f.selected < 0) f.selected = hitTest(ls.rects, f.lightX, f.lightY);
      searchAt(f.selected);
    },
    running,
  );

  function draw() {
    const st = stage.current;
    const ls = layers.current;
    if (!st || !ls) return;
    const { ctx, width, height } = st;
    const s = game.current;
    const f = fx.current;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const shake = f.shake * (reduced ? 1.5 : 6);
    if (shake > 0.1) ctx.translate(Math.sin(f.t * 63) * shake, Math.cos(f.t * 47) * shake * 0.6);
    ctx.drawImage(ls.bg, 0, 0, width, height);
    const searching = s.current?.index ?? -1;
    setup.items.forEach((item, i) => {
      const r = ls.rects[i];
      const sprite = ls.sprites[i];
      const done = s.searched[i];
      const pop = f.pops.get(i);
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      let rot = item.tell && !done ? 0.07 * (i % 2 ? 1 : -1) : 0;
      if (i === searching && !reduced) rot += Math.sin(f.t * 34) * 0.05;
      if (rot) ctx.rotate(rot);
      if (pop !== undefined && pop < 0.35) {
        const k = 1 + Math.sin((pop / 0.35) * Math.PI) * (reduced ? 0.03 : 0.12);
        ctx.scale(k, k);
      }
      if (item.tell && !done) ctx.translate(1.5, 1);
      ctx.globalAlpha = done ? 0.42 : 1;
      ctx.drawImage(
        sprite,
        -r.w / 2 - SPRITE_PAD,
        -r.h / 2 - SPRITE_PAD,
        sprite.width / st.dpr,
        sprite.height / st.dpr,
      );
      ctx.restore();
      if (!done && item.tell) drawScuff(ctx, r);
      if (!done && item.peek) drawPeek(ctx, palette, r);
      if (done) drawBadge(ctx, palette, r.x + r.w - 2, r.y + 2, item.stash);
    });
    // Auswahl (Tastatur) bzw. Maus darüber.
    const focus = f.lead === 'keys' ? f.selected : f.hover;
    if (running && focus >= 0 && !s.done && focus !== searching) drawFocus(ctx, palette, ls.rects[focus], 0.6);
    if (searching >= 0) drawProgress(ctx, palette, ls.rects[searching], progress(setup, s), f.t);
    for (const [i, age] of f.rings) drawNoiseRings(ctx, palette, ls.rects[i], age);
    // Licht: Taschenlampe bzw. trübes Licht.
    const unit = Math.min(ls.layout.outer.w, ls.layout.outer.h);
    drawDarkness(ctx, width, height, light, f.lightX, f.lightY, Math.max(80, unit * (light === 'night' ? 0.26 : 0.42)));
    if (f.keyT >= 0) {
      const turn = Math.min(1, f.keyT / 0.7);
      const open = Math.max(0, Math.min(1, (f.keyT - 0.8) / 0.7));
      drawDoorEnd(ctx, palette, ls.layout, turn, 1 - (1 - open) ** 3);
    }
    // Effekte über dem Licht (Geld und Texte sieht man immer).
    for (const b of f.bills) {
      const k = Math.max(0, Math.min(1, (b.age - b.delay) / 0.7));
      if (b.age < b.delay || k >= 1) continue;
      const e = k * k * (3 - 2 * k);
      const x = b.x0 + (b.x1 - b.x0) * e + Math.sin(k * Math.PI) * b.arc;
      const y = b.y0 + (b.y1 - b.y0) * e - Math.sin(k * Math.PI) * 50;
      drawBill(ctx, palette, x, y, b.spin * k, 1 - k * 0.4);
    }
    for (const fl of f.floats) {
      const k = Math.min(1, fl.age / 1.1);
      const color = fl.color === 'money' ? palette.money : fl.color === 'warn' ? palette.warn : palette.ink;
      drawFloatText(ctx, fl.text, fl.x, fl.y - k * 28, color, 1 - k * k, fl.color === 'money' ? 22 : 18);
    }
    if (f.alertT >= 0) {
      // Blau-rotes Flackern an den Fenstern, roter Rand.
      const pulse = 0.5 + 0.5 * Math.sin(f.alertT * (reduced ? 3 : 10));
      ctx.fillStyle = pulse > 0.5 ? palette.danger : palette.place;
      ctx.globalAlpha = 0.12 + 0.1 * pulse;
      for (const win of ls.layout.windows) ctx.fillRect(win.x - 6, win.y - 6, win.w + 12, win.h + 30);
      ctx.globalAlpha = 1;
    }
    if (f.flash > 0) {
      ctx.fillStyle = palette.money;
      ctx.globalAlpha = f.flash * 0.18;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    f.dirty = false;
  }

  useFrameLoop((rawDt) => {
    const s = game.current;
    const f = fx.current;
    // Zeitlupe am Ende (der Schlüssel dreht sich langsam).
    const dt = f.keyT >= 0 && !reduced ? rawDt * 0.7 : rawDt;
    f.t += rawDt;
    if (!s.done) react(advance(setup, s, rawDt));
    if (s.current && f.t - f.lastRustle > 0.42) {
      f.lastRustle = f.t;
      sfx(SEARCH_SOUNDS.rustle, 0.55);
    }
    f.shake = Math.max(0, f.shake - rawDt * 2.5);
    f.flash = Math.max(0, f.flash - rawDt * 1.4);
    if (f.alertT >= 0) f.alertT += rawDt;
    if (f.keyT >= 0) f.keyT += dt;
    for (const [i, age] of f.pops) {
      if (age > 0.5) f.pops.delete(i);
      else f.pops.set(i, age + dt);
    }
    for (const [i, age] of f.rings) {
      if (age > 1) f.rings.delete(i);
      else f.rings.set(i, age + dt);
    }
    for (const b of f.bills) b.age += dt;
    f.bills = f.bills.filter((b) => b.age < b.delay + 0.75);
    for (const fl of f.floats) fl.age += dt;
    f.floats = f.floats.filter((fl) => fl.age < 1.1);
    // Licht folgt Zeiger, Auswahl oder der Suche; ohne Führung in die Mitte der Wohnung.
    const ls = layers.current;
    let moving = false;
    if (ls) {
      const sel = f.lead === 'keys' && f.selected >= 0 ? center(f.selected) : null;
      const cur = s.current ? center(s.current.index) : null;
      const target =
        f.lead === 'pointer'
          ? f.pointer
          : (sel ??
            cur ?? { x: ls.layout.outer.x + ls.layout.outer.w / 2, y: ls.layout.outer.y + ls.layout.outer.h / 2 });
      const k = Math.min(1, rawDt * (f.lead === 'pointer' ? 14 : 7));
      const nx = f.lightX < 0 ? target.x : f.lightX + (target.x - f.lightX) * k;
      const ny = f.lightY < 0 ? target.y : f.lightY + (target.y - f.lightY) * k;
      moving = light !== 'day' && Math.abs(nx - f.lightX) + Math.abs(ny - f.lightY) > 0.2;
      f.lightX = nx;
      f.lightY = ny;
    }
    const animating =
      s.current !== null ||
      f.shake > 0 ||
      f.flash > 0 ||
      f.alertT >= 0 ||
      f.keyT >= 0 ||
      f.pops.size > 0 ||
      f.rings.size > 0 ||
      f.bills.length > 0 ||
      f.floats.length > 0;
    if (f.dirty || moving || animating) draw();
    // HUD höchstens zehnmal pro Sekunde (Zeit und Lärm).
    const left = Math.round(timeLeft(s) * 10) / 10;
    const noise = Math.round(s.noise * 50) / 50;
    setHud((h) => (h.left === left && h.noise === noise ? h : { ...h, left, noise }));
    if (f.endAt >= 0 && f.t >= f.endAt) finish();
  }, running);

  // Zeiger: Maus bewegt das Licht und zeigt, worauf man zeigt; Finger ziehen das Licht, Tippen sucht.
  const local = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!running) return;
    const p = local(e);
    capture(e);
    const f = fx.current;
    f.press = { x: p.x, y: p.y, id: e.pointerId, moved: false };
    f.pointer = p;
    f.lead = 'pointer';
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!running) return;
    const f = fx.current;
    const p = local(e);
    if (e.pointerType === 'mouse' || f.press?.id === e.pointerId) {
      f.pointer = p;
      f.lead = 'pointer';
    }
    if (f.press && f.press.id === e.pointerId && Math.hypot(p.x - f.press.x, p.y - f.press.y) > 12) {
      f.press.moved = true;
    }
    const ls = layers.current;
    if (ls && e.pointerType === 'mouse') {
      const hover = hitTest(ls.rects, p.x, p.y);
      if (hover !== f.hover) {
        f.hover = hover;
        f.dirty = true;
      }
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    const f = fx.current;
    const press = f.press;
    if (!press || press.id !== e.pointerId) return;
    f.press = null;
    if (press.moved) return;
    const ls = layers.current;
    if (!ls) return;
    const p = local(e);
    const hit = hitTest(ls.rects, p.x, p.y);
    if (hit >= 0) {
      f.selected = hit;
      searchAt(hit);
    }
  };
  const onPointerCancel = () => {
    fx.current.press = null;
  };

  const urgent = hud.left <= 7;
  return (
    <div class={`search${urgent ? ' is-urgent' : ''}`}>
      <canvas
        ref={canvas}
        class="search__canvas"
        aria-label="Wohnung: antippen, was du durchsuchen willst"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          if (fx.current.hover >= 0) {
            fx.current.hover = -1;
            fx.current.dirty = true;
          }
        }}
      />
      <HudBar class="search__hud">
        <HudTimer seconds={hud.left} total={setup.duration} urgentAt={7} />
        <span class="search__stashes" role="img" aria-label={`${hud.stashes} von ${setup.stashes} Verstecken`}>
          {Array.from({ length: setup.stashes }, (_, i) => (
            <span key={i} class={`search__stash${i < hud.stashes ? ' is-found' : ''}`} />
          ))}
        </span>
        <span class="search__money" role="img" aria-label={`Gefunden: ${formatEuro(hud.found)}`}>
          <span class="search__money-label" aria-hidden="true">
            Gefunden
          </span>
          <span class="search__money-value" aria-hidden="true">
            {formatEuro(hud.found)}
          </span>
        </span>
        <span class="search__noise">
          <HudMeter label="Lärm" value={hud.noise} color={hud.noise > 0.65 ? 'danger' : 'warn'} />
        </span>
      </HudBar>
      {hud.message && (
        <p key={hud.serial} class={`search__message is-${hud.tone ?? 'info'}`} aria-live="polite">
          {hud.message}
        </p>
      )}
    </div>
  );
}
