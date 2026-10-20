// Bude durchsuchen (Auftrag 44, Teil 6; seit Auftrag 48 im Ego-Blick in 3D): Du stehst in der Tür eines Raums, die
// Taschenlampe folgt Maus bzw. Finger. Antippen bzw. Klicken durchsucht ein Ding, Pfeiltasten wählen, Leertaste
// sucht, 1–5 bzw. Q/E wechseln den Raum (Leiste unten). Spuren (schief, Kratzer) sieht man im Licht. Lärm lässt
// alles klirren, der Nachbar hämmert und ruft die Polizei; am Ende dreht sich der Schlüssel, die Lampe geht aus.
// Spiellogik in model.ts, Räume und Dinge in room3d.ts, Szene in scene.ts, Klänge in sounds.ts.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatEuro } from '../../../../../core';
import { audio, haptic, prefersReducedMotion } from '../../../../../ui';
import { HudBar, HudMeter, HudTimer } from '../../kit/hud';
import { HitStop } from '../../kit/indoor3d';
import { phaseOf } from '../../kit/scene3d';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { useStage3d } from '../../kit/stage3d';
import { capture } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import {
  advance,
  createSearch,
  initSearch,
  pick,
  progress,
  ROOM_NAMES,
  type RoomId,
  type SearchEvent,
  STEPS_AT,
  searchPicks,
  searchScore,
  searchStats,
  timeLeft,
} from './model';
import { createSearchScene, type SearchScene } from './scene';
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
  'KeyQ',
  'KeyE',
  'Space',
  'Enter',
  'NumpadEnter',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
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

/** Reihenfolge der Räume in der Leiste: du kommst durch den Flur. */
const ROOM_ORDER: readonly RoomId[] = ['hall', 'living', 'kitchen', 'bedroom', 'bath'];
/** Überblenden beim Raumwechsel (ms bis zum Wechsel, ganze Dauer in der CSS). */
const SWITCH_MS = 170;
/** So lange steht eine Meldung (ms). */
const MESSAGE_MS = 2600;

interface Hud {
  left: number;
  found: number;
  stashes: number;
  noise: number;
  room: RoomId;
  searched: boolean[];
  current: number;
  focus: number;
  message: string | null;
  tone: 'good' | 'bad' | 'warn' | null;
  serial: number;
  done: boolean;
}

interface Floater {
  id: number;
  text: string;
  tone: 'money' | 'warn' | 'ink';
  index: number;
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
  const phase = phaseOf(challenge.params.phase);
  const reduced = useMemo(prefersReducedMotion, []);
  const stop = useMemo(() => new HitStop(reduced), [reduced]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef(new Map<number, HTMLElement>());
  const floatEls = useRef(new Map<number, HTMLElement>());
  const fx = useRef({
    t: 0,
    shake: 0,
    alertT: -1,
    stepsT: -1,
    keyT: -1,
    clearT: -1,
    scene: null as SearchScene | null,
    endAt: -1,
    sent: false,
    selected: -1,
    hover: -1,
    lastRustle: -1,
    press: null as { x: number; y: number; id: number; moved: boolean } | null,
    /** Letzte Lage des Zeigers (Maus immer, Finger beim Ziehen): Was dort liegt, wird jedes Bild neu bestimmt. */
    pointer: null as { x: number; y: number } | null,
    lastSteps: -10,
    lastBeat: -10,
    lastMiss: -10,
    pendingDt: 0,
    drawQueued: false,
    floats: 0,
  });
  const [floats, setFloats] = useState<Floater[]>([]);
  const [fading, setFading] = useState(0);
  const snapshot = (h: Partial<Hud> = {}, prev?: Hud): Hud => {
    const s = game.current;
    return {
      left: Math.round(timeLeft(s) * 10) / 10,
      found: s.found,
      stashes: s.foundStashes,
      noise: Math.round(s.noise * 50) / 50,
      room: prev?.room ?? 'hall',
      searched: [...s.searched],
      current: s.current?.index ?? -1,
      focus: fx.current.hover >= 0 ? fx.current.hover : fx.current.selected,
      message: prev?.message ?? null,
      tone: prev?.tone ?? null,
      serial: prev?.serial ?? 0,
      done: s.done,
      ...h,
    };
  };
  const [hud, setHud] = useState<Hud>(() => snapshot());
  const roomRef = useRef<RoomId>('hall');
  const refresh = () =>
    setHud((h) => {
      const next = snapshot({}, h);
      return next.left === h.left &&
        next.noise === h.noise &&
        next.found === h.found &&
        next.current === h.current &&
        next.focus === h.focus &&
        next.done === h.done &&
        next.searched.every((v, i) => v === h.searched[i])
        ? h
        : next;
    });
  const say = (message: string, tone: Hud['tone'] = null) =>
    setHud((h) => ({ ...snapshot({}, h), message, tone, serial: h.serial + 1 }));

  // ------------------------------------------------------------------ Szene
  const sceneFor = () => {
    const f = fx.current;
    f.scene ??= createSearchScene(setup, phase, reduced);
    return f.scene;
  };
  const stage = useStage3d(canvas, (st) => {
    sceneFor().resize(st.width, st.height);
    draw(0);
  });
  useEffect(
    () => () => {
      fx.current.scene?.dispose();
      fx.current.scene = null;
    },
    [],
  );

  function draw(dt: number) {
    const st = stage.current;
    if (!st) return;
    const scene = sceneFor();
    scene.update(game.current, fx.current, dt);
    scene.render(st);
    // Die Kamera schaut mit: Was unter dem Zeiger liegt, ändert sich auch ohne Mausbewegung. Jedes Bild neu
    // bestimmen, damit Name und Klick zu dem passen, was gerade im Licht ist.
    const f = fx.current;
    if (f.pointer && running) {
      const hover = scene.pick(f.pointer.x, f.pointer.y);
      if (hover !== f.hover) f.hover = hover;
    }
    // Namen, Fortschritt und Ergebnis über den Dingen des Raums (Lage aus der Projektion, ohne Layout-Lesen).
    for (const [index, el] of tags.current) {
      const p = scene.itemScreen(index);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      el.style.visibility = p.visible ? 'visible' : 'hidden';
    }
    for (const [index, el] of floatEls.current) {
      const p = scene.itemScreen(index);
      el.style.left = `${p.x.toFixed(1)}px`;
      el.style.top = `${p.y.toFixed(1)}px`;
    }
  }

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(searchScore(setup, game.current), searchPicks(setup, game.current), searchStats(setup, game.current));
  };

  const float = (text: string, tone: Floater['tone'], index: number) => {
    const id = ++fx.current.floats;
    setFloats((list) => [...list.slice(-4), { id, text, tone, index }]);
    window.setTimeout(() => setFloats((list) => list.filter((fl) => fl.id !== id)), 1200);
  };

  const react = (events: SearchEvent[]) => {
    const f = fx.current;
    const scene = f.scene;
    for (const e of events) {
      if (e.type === 'start') {
        audio.play(SEARCH_SOUNDS.rustle, { volume: 0.8 });
        f.lastRustle = f.t;
        haptic('light');
      } else if (e.type === 'found') {
        const item = setup.items[e.index];
        audio.play(SEARCH_SOUNDS.cash);
        haptic('success');
        scene?.burst('found', e.index);
        float(`+${formatEuro(e.amount)}`, 'money', e.index);
        // Kurz anhalten: Der Fund hat Gewicht.
        stop.hold(0.085);
        say(`${item.name}: ${formatEuro(e.amount)}!`, 'good');
      } else if (e.type === 'empty') {
        audio.play(SEARCH_SOUNDS.empty, { volume: 0.7 });
        scene?.burst('empty', e.index);
        say(`${setup.items[e.index].name}: nichts.`);
      } else if (e.type === 'noise') {
        audio.play(SEARCH_SOUNDS.clatter, { volume: 0.9 });
        haptic('warning');
        f.shake = Math.max(f.shake, 0.7);
        stop.hold(0.05);
        scene?.burst('noise', e.index);
        float('KLIRR!', 'warn', e.index);
        if (e.level < 1) say(e.level > 0.6 ? 'Klirr! Nebenan wird es still.' : 'Klirr! Leise …', 'warn');
      } else if (e.type === 'alert') {
        audio.play(SEARCH_SOUNDS.bang);
        haptic('error');
        f.shake = 1.2;
        f.alertT = 0;
        if (scene && setup.items.length > 0) scene.burst('alert', game.current.current?.index ?? 0);
        say('Der Nachbar hämmert an die Wand und ruft die Bullen. Schnell!', 'bad');
      } else if (e.type === 'steps') {
        audio.play(SEARCH_SOUNDS.steps, { volume: 0.8 });
        f.stepsT = 0;
        if (!game.current.alerted) say('Schritte im Treppenhaus …', 'warn');
      } else if (e.type === 'end') {
        if (e.reason === 'all') {
          f.clearT = 0;
          f.endAt = f.t + 1.4;
          playSound(MINIGAME_SOUNDS.clunk);
          say('Alles gefunden. Raus hier.', 'good');
        } else {
          f.keyT = 0;
          f.endAt = f.t + 2.6;
          audio.play(SEARCH_SOUNDS.key);
          haptic('warning');
          say('Der Schlüssel dreht sich im Schloss!', 'bad');
        }
      }
    }
    if (events.length > 0) refresh();
  };

  const searchAt = (index: number) => {
    const s = game.current;
    if (!running || s.done || index < 0) return;
    if (s.searched[index]) {
      playSound(MINIGAME_SOUNDS.click, 0.4);
      say(`${setup.items[index].name}: schon durchsucht.`);
      return;
    }
    fx.current.selected = index;
    fx.current.scene?.aimItem(index);
    const events = pick(setup, s, index);
    if (events.length === 0 && s.queued === index) say(`Gleich: ${setup.items[index].name}.`);
    react(events);
    refresh();
  };

  const goRoom = (room: RoomId) => {
    if (room === roomRef.current || !running) return;
    roomRef.current = room;
    const f = fx.current;
    f.selected = -1;
    f.hover = -1;
    audio.play(SEARCH_SOUNDS.steps, { volume: 0.35 });
    setFading((n) => n + 1);
    window.setTimeout(() => {
      f.scene?.setRoom(room);
      setHud((h) => ({ ...snapshot({}, h), room }));
    }, SWITCH_MS);
  };

  const roomItems = (room: RoomId) => setup.items.map((it, i) => (it.room === room ? i : -1)).filter((i) => i >= 0);

  useGameKeys(
    KEYS,
    (press) => {
      const f = fx.current;
      const scene = f.scene;
      if (!scene) return;
      const code = press.code;
      if (code.startsWith('Digit')) {
        const room = ROOM_ORDER[Number(code.slice(-1)) - 1];
        if (room) goRoom(room);
        return;
      }
      if (code === 'KeyQ' || code === 'KeyE') {
        const i = ROOM_ORDER.indexOf(roomRef.current);
        goRoom(ROOM_ORDER[(i + (code === 'KeyE' ? 1 : ROOM_ORDER.length - 1)) % ROOM_ORDER.length]);
        return;
      }
      const s = game.current;
      const dir = DIRS[code];
      const list = roomItems(roomRef.current).filter((i) => !s.searched[i]);
      if (dir) {
        if (list.length === 0) return;
        const from = f.selected >= 0 && list.includes(f.selected) ? scene.itemScreen(f.selected) : null;
        let best = list[0];
        if (from) {
          // Nächstes Ding in der Richtung (Bildschirm), sonst das nächste überhaupt.
          let bestScore = Number.POSITIVE_INFINITY;
          for (const i of list) {
            if (i === f.selected) continue;
            const p = scene.itemScreen(i);
            const dx = p.x - from.x;
            const dy = p.y - from.y;
            const along = dx * dir[0] + dy * dir[1];
            if (along <= 4) continue;
            const score = along + Math.abs(dx * dir[1] + dy * dir[0]) * 2;
            if (score < bestScore) {
              bestScore = score;
              best = i;
            }
          }
          if (bestScore === Number.POSITIVE_INFINITY) best = f.selected;
        }
        f.selected = best;
        f.pointer = null;
        f.hover = -1;
        scene.aimItem(best);
        playSound(MINIGAME_SOUNDS.click, 0.25);
        refresh();
        return;
      }
      searchAt(f.selected >= 0 ? f.selected : (list[0] ?? -1));
    },
    running,
  );

  useFrameLoop((rawDt) => {
    const s = game.current;
    const f = fx.current;
    // Zeitlupe am Ende (der Schlüssel dreht sich langsam).
    // Hit-Stop: Die Welt steht kurz (Uhr, Suche, Licht), nur das Bild wird weiter gezeichnet.
    const live = stop.filter(rawDt);
    const dt = f.keyT >= 0 && !reduced ? live * 0.7 : live;
    f.t += live;
    if (!s.done && live > 0) react(advance(setup, s, live));
    // Schritte im Treppenhaus: erst leise, dann immer näher und schneller.
    const left = timeLeft(s);
    if (!s.done && s.stepsHeard && f.t - f.lastSteps >= 0.6 + 0.12 * left) {
      f.lastSteps = f.t;
      audio.play(SEARCH_SOUNDS.steps, { volume: Math.min(1, 0.35 + (STEPS_AT - left) * 0.1) });
      f.stepsT = 0;
    }
    if (!s.done && left <= 5 && f.t - f.lastBeat >= 0.55) {
      f.lastBeat = f.t;
      playSound(MINIGAME_SOUNDS.heartbeat, 0.55);
    }
    if (s.current && f.t - f.lastRustle > 0.42) {
      f.lastRustle = f.t;
      audio.play(SEARCH_SOUNDS.rustle, { volume: 0.55 });
    }
    f.shake = Math.max(0, f.shake - rawDt * 2.5);
    if (f.alertT >= 0) f.alertT += rawDt;
    if (f.stepsT >= 0) f.stepsT += rawDt;
    if (f.keyT >= 0) f.keyT += dt;
    if (f.clearT >= 0) f.clearT += dt;
    f.pendingDt += dt;
    if (!f.drawQueued) {
      f.drawQueued = true;
      queueMicrotask(() => {
        f.drawQueued = false;
        draw(f.pendingDt);
        f.pendingDt = 0;
      });
    }
    refresh();
    if (f.endAt >= 0 && f.t >= f.endAt) finish();
  }, running);

  // Meldungen verschwinden von selbst.
  useEffect(() => {
    if (!hud.message || hud.done) return;
    const serial = hud.serial;
    const id = window.setTimeout(
      () => setHud((h) => (h.serial === serial ? { ...h, message: null, tone: null } : h)),
      MESSAGE_MS,
    );
    return () => window.clearTimeout(id);
  }, [hud.serial, hud.message, hud.done]);

  useEffect(() => {
    // Pause mitten im Spiel: angefangenen Tipp vergessen; weiter geht es genau dort.
    if (!running) fx.current.press = null;
    draw(0);
  }, [running]);

  // Zeiger: Maus lenkt die Lampe und zeigt, worauf sie zeigt; Finger ziehen die Lampe, Tippen sucht.
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
    f.scene?.aimAt(p.x, p.y);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!running) return;
    const f = fx.current;
    const p = local(e);
    if (e.pointerType === 'mouse' || f.press?.id === e.pointerId) {
      f.scene?.aimAt(p.x, p.y);
      f.pointer = p;
    }
    if (f.press && f.press.id === e.pointerId && Math.hypot(p.x - f.press.x, p.y - f.press.y) > 12)
      f.press.moved = true;
  };
  const onPointerUp = (e: PointerEvent) => {
    const f = fx.current;
    const press = f.press;
    if (!press || press.id !== e.pointerId) return;
    f.press = null;
    if (e.pointerType !== 'mouse') f.pointer = null;
    if (press.moved) return;
    const p = local(e);
    // Unter dem Finger bzw. Zeiger, sonst das, worauf das Licht gerade zeigt.
    const at = f.scene?.pick(p.x, p.y) ?? -1;
    const index = at >= 0 ? at : f.hover;
    if (index < 0) {
      // Daneben: kurz und leise, damit man merkt, dass der Klick ankam.
      playSound(MINIGAME_SOUNDS.click, 0.25);
      if (f.t - f.lastMiss > 4) {
        f.lastMiss = f.t;
        say('Da ist nichts. Leuchte auf ein Möbelstück.');
      }
      return;
    }
    searchAt(index);
  };

  const urgent = hud.left <= 7;
  const s = game.current;
  const inRoom = roomItems(hud.room);
  return (
    <div class={`search search--${phase}${urgent && !hud.done ? ' is-urgent' : ''}${hud.done ? ' is-done' : ''}`}>
      <canvas
        ref={canvas}
        class="search__canvas"
        aria-label={`${ROOM_NAMES[hud.room]}: antippen, was du durchsuchen willst`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          fx.current.press = null;
        }}
      />
      <div class="search__vignette" aria-hidden="true" />
      {fading > 0 && <div key={fading} class="search__fade" aria-hidden="true" />}
      {inRoom.map((i) => {
        const searched = hud.searched[i];
        const active = hud.current === i;
        const focus = hud.focus === i && !searched && !active;
        if (!searched && !active && !focus) return null;
        const item = setup.items[i];
        return (
          <span
            key={`${hud.room}:${i}`}
            ref={(el) => {
              if (el) tags.current.set(i, el);
              else tags.current.delete(i);
            }}
            class={`search__tag${active ? ' is-active' : ''}${searched ? (item.stash ? ' is-found' : ' is-empty') : ''}`}
            aria-hidden="true"
          >
            {active && (
              <span class="search__ring" style={{ '--search-progress': `${Math.round(progress(setup, s) * 100)}%` }} />
            )}
            <span class="search__tag-text">
              {searched ? (item.stash ? `✓ ${formatEuro(item.money)}` : 'leer') : item.name}
            </span>
          </span>
        );
      })}
      {floats.map((fl) => (
        <span
          key={fl.id}
          ref={(el) => {
            if (el) floatEls.current.set(fl.index, el);
            else floatEls.current.delete(fl.index);
          }}
          class={`search__float is-${fl.tone}`}
          aria-hidden="true"
        >
          {fl.text}
        </span>
      ))}
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
      <nav class="search__rooms" aria-label="Räume">
        {ROOM_ORDER.map((room, i) => {
          const list = roomItems(room);
          const open = list.filter((k) => !hud.searched[k]).length;
          const found = list.some((k) => hud.searched[k] && setup.items[k].stash);
          return (
            <button
              key={room}
              type="button"
              class={`search__room${room === hud.room ? ' is-here' : ''}`}
              aria-current={room === hud.room ? 'true' : undefined}
              disabled={!running || hud.done}
              onClick={() => goRoom(room)}
            >
              <kbd>{i + 1}</kbd>
              <span class="search__room-name">{ROOM_NAMES[room]}</span>
              <span class={`search__room-count${found ? ' is-found' : ''}`}>{open}</span>
            </button>
          );
        })}
      </nav>
      {hud.message && (
        <p key={hud.serial} class={`search__message is-${hud.tone ?? 'info'}`} aria-live="polite">
          {hud.message}
        </p>
      )}
    </div>
  );
}
