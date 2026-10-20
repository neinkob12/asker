// Razzia-Lauf (Auftrag 44, Teil 3; seit Auftrag 48 seitlich in 3D): Du rennst durchs Lager bzw. über den Gehweg,
// hebst Pakete auf und bringst sie in Verstecke. Tastatur: ←/→ laufen, Leertaste aufheben/verstauen/ablegen, 1–5
// bringt etwas ins Versteck. Finger und Maus: Paket antippen (hinlaufen, aufheben), Versteck antippen (verstauen).
// Sirenen kommen näher, kurz vor Schluss knallt das Rolltor runter, es klopft, am Ende fliegt es auf. Spiellogik in
// model.ts, 3D-Szene in scene.ts, Figur in figure.ts, Klänge in sounds.ts.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatAmount, formatEuro } from '../../../../../core';
import { audio, haptic, Icon, prefersReducedMotion } from '../../../../../ui';
import { productColor, readGoodsPalette } from '../../kit/goods';
import { HudBar, HudMeter, HudTimer } from '../../kit/hud';
import { HitStop } from '../../kit/indoor3d';
import { phaseOf } from '../../kit/scene3d';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { useStage3d } from '../../kit/stage3d';
import { capture, TouchControls } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import type { MinigameViewProps } from '../../registry';
import {
  act,
  canHide,
  contextOf,
  createStash,
  getHide,
  goTo,
  type HideCheck,
  type HideId,
  hideCenter,
  initStash,
  isLoose,
  type StashContext,
  type StashEvent,
  type StashInput,
  type StashPackage,
  savedValue,
  sendTo,
  stashCounts,
  stashPicks,
  stashScore,
  stashStats,
  step,
  streetClosed,
  timeLeft,
  usedIn,
} from './model';
import { createStashScene, type StashFx, type StashScene } from './scene';
import { STASH_SOUNDS } from './sounds';

const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowDown',
  'ArrowUp',
  'KeyA',
  'KeyD',
  'KeyS',
  'KeyE',
  'Space',
  'Enter',
  'NumpadEnter',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
];
const ACT_KEYS = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyE', 'ArrowDown', 'KeyS', 'ArrowUp']);
/** Abstand der Sirene in Sekunden (wird kürzer, je näher sie sind). */
const SIREN_EVERY = 1.25;
/** So viele Sekunden vor Schluss klopft es (im Lager erst, wenn das Tor zu ist). */
const KNOCK_FROM = 6;
const KNOCK_EVERY = 1.15;
/** So lange steht eine Meldung (ms). */
const MESSAGE_MS = 2600;

/** params aus police (StashParams) lesen, ohne sich auf ihre Form zu verlassen (alte Stände, Vorschau). */
export function inputFrom(params: Record<string, unknown>): StashInput {
  const lots = Array.isArray(params.lots) ? params.lots : [];
  const warehouse = params.warehouse as { vault?: unknown; cover?: unknown } | undefined;
  return {
    setting: params.setting === 'street' ? 'street' : 'warehouse',
    lots: lots
      .map((l) => l as Record<string, unknown>)
      .map((l) => ({
        productId: String(l.productId ?? ''),
        name: String(l.name ?? 'Ware'),
        amount: Number(l.amount) || 0,
        unit: String(l.unit ?? 'g'),
        grams: Number(l.grams) || 0,
        value: Number(l.value) || 0,
      }))
      .filter((l) => l.amount > 0 && l.value > 0),
    money: Number(params.money) || 0,
    ...(warehouse ? { warehouse: { vault: Number(warehouse.vault) || 0, cover: Number(warehouse.cover) || 0 } } : {}),
  };
}

function amountText(p: StashPackage): string {
  return p.productId === null ? formatEuro(p.amount) : formatAmount(p.amount, p.unit);
}

const SIZE_NAMES = { 1: 'klein', 2: 'mittel', 3: 'groß' } as const;

const REASONS: Record<Exclude<HideCheck, 'ok'>, string> = {
  full: 'voll',
  tooBig: 'zu klein',
  closed: 'zu',
  busy: 'erst wegbringen',
  done: 'vorbei',
};

/** Text für den Aktions-Knopf. */
function actionLabel(ctx: StashContext): string {
  if (ctx.kind === 'pickup') return 'Aufheben';
  if (ctx.kind === 'stow')
    return ctx.check === 'ok' ? 'Verstecken' : REASONS[ctx.check === 'busy' ? 'busy' : ctx.check];
  if (ctx.kind === 'drop') return 'Ablegen';
  return 'Aufheben';
}

interface Hud {
  left: number;
  hidden: number;
  saved: number;
  closed: boolean;
  carry: number | null;
  ctx: StashContext;
  message: string | null;
  tone: 'good' | 'bad' | 'warn' | null;
  key: number;
  done: boolean;
}

interface Floater {
  id: number;
  text: string;
  tone: 'good' | 'wet' | 'bad';
  x: number;
  y: number;
}

export function StashGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const input = useMemo(() => inputFrom(challenge.params), [challenge.params]);
  const setup = useMemo(
    () => createStash(challenge.seed, challenge.difficulty, input),
    [challenge.seed, challenge.difficulty, input],
  );
  const phase = phaseOf(challenge.params.phase ?? (challenge.seed % 3 === 0 ? 'night' : 'day'));
  const game = useRef(initStash(setup));
  const reduced = useMemo(prefersReducedMotion, []);
  const stop = useMemo(() => new HitStop(reduced), [reduced]);
  const goods = useMemo(readGoodsPalette, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<Partial<Record<HideId, HTMLElement | null>>>({});
  const widths = useRef<Partial<Record<HideId, number>>>({});
  const bubble = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLSpanElement>(null);
  const held = useRef({ left: false, right: false });
  const fx = useRef<
    StashFx & {
      scene: StashScene | null;
      lastSiren: number;
      lastBeat: number;
      lastKnock: number;
      lastStep: number;
      lastHud: number;
      endAt: number;
      sent: boolean;
      warned: boolean;
      floats: number;
      pendingDt: number;
      drawQueued: boolean;
      warmed: boolean;
    }
  >({
    t: 0,
    closedT: -1,
    breachT: -1,
    clearT: -1,
    knock: 0,
    shake: 0,
    alarm: 0,
    focus: null,
    scene: null,
    lastSiren: -10,
    lastBeat: -10,
    lastKnock: -10,
    lastStep: 0,
    lastHud: -1,
    endAt: -1,
    sent: false,
    warned: false,
    floats: 0,
    pendingDt: 0,
    drawQueued: false,
    warmed: false,
  });
  const [floats, setFloats] = useState<Floater[]>([]);
  const snapshot = (h: Partial<Hud> = {}): Hud => {
    const s = game.current;
    const counts = stashCounts(setup, s);
    return {
      left: timeLeft(setup, s),
      hidden: counts.hidden,
      saved: setup.totalValue > 0 ? savedValue(setup, s) / setup.totalValue : 0,
      closed: streetClosed(setup, s),
      carry: s.carry,
      ctx: contextOf(setup, s),
      message: null,
      tone: null,
      key: 0,
      done: s.done,
      ...h,
    };
  };
  const [hud, setHud] = useState<Hud>(() => snapshot());

  const refreshHud = () => setHud((h) => snapshot({ message: h.message, tone: h.tone, key: h.key }));
  const say = (message: string, tone: Hud['tone'] = null) => setHud((h) => snapshot({ message, tone, key: h.key + 1 }));

  // ------------------------------------------------------------------ Szene
  const sceneFor = () => {
    const f = fx.current;
    f.scene ??= createStashScene(setup, phase, reduced, goods);
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
    // Messhilfe für scripts/perf-browser.mjs (--scenes=razzia,bude): nur, wenn das Skript sie anlegt.
    const perfHook = (window as { __mgPerf?: { frames: number; total: number; max: number } }).__mgPerf;
    const perfStart = perfHook ? performance.now() : 0;
    const scene = sceneFor();
    const s = game.current;
    const f = fx.current;
    if (!f.warmed) {
      f.warmed = true;
      scene.warm(st);
    }
    const ctx = contextOf(setup, s);
    if (f.focus?.kind !== 'hide' || s.carry === null) {
      f.focus =
        ctx.kind === 'pickup'
          ? { kind: 'package', id: ctx.id }
          : ctx.kind === 'stow'
            ? { kind: 'hide', id: ctx.hide }
            : s.goal;
    }
    scene.update(s, f, dt);
    scene.render(st);
    // Beschriftungen der Verstecke über der Szene; außerhalb des Bilds am Rand. Überlappen sie sich, rückt die
    // spätere nach oben (Breiten misst ein Effekt nach jedem HUD-Wechsel, nie hier in der Bildschleife).
    // Die Sprechblase über deinem Kopf zählt als belegt.
    const placed: { x: number; y: number; w: number }[] =
      scene.head.visible && (s.carry !== null || ctx.kind === 'pickup')
        ? [{ x: scene.head.x, y: scene.head.y, w: 190 }]
        : [];
    const order = setup.hides
      .map((h) => ({ h, p: scene.hideScreen[h.id] }))
      .filter((e): e is { h: (typeof setup.hides)[number]; p: NonNullable<typeof e.p> } => !!e.p)
      .sort((a, b) => a.p.x - b.p.x);
    for (const { h, p } of order) {
      const el = labels.current[h.id];
      if (!el) continue;
      const w = widths.current[h.id] ?? 110;
      // Pfeil nur, wenn das Versteck wirklich außerhalb des Bilds liegt.
      const edge = p.x < 0 ? 'left' : p.x > st.width ? 'right' : null;
      const x = Math.min(st.width - w / 2 - 8, Math.max(w / 2 + 8, p.x));
      let y = Math.min(st.height - 150, Math.max(130, p.y));
      for (let guard = 0; guard < 6; guard++) {
        const hit = placed.find((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < 32);
        if (!hit) break;
        // Unten (Bodenverstecke) weicht nach unten aus, oben nach oben, solange oben Platz ist (sonst nach unten).
        y = h.y + h.h < 0.4 || hit.y - 34 < 130 ? hit.y + 34 : hit.y - 34;
      }
      placed.push({ x, y, w });
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.dataset.edge = edge ?? '';
    }
    const b = bubble.current;
    if (b) {
      b.style.transform = `translate(${scene.head.x.toFixed(1)}px, ${scene.head.y.toFixed(1)}px)`;
      b.style.opacity = scene.head.visible ? '1' : '0';
    }
    const me = strip.current;
    if (me) me.style.left = `${((s.x / setup.length) * 100).toFixed(2)}%`;
    if (perfHook) {
      const ms = performance.now() - perfStart;
      perfHook.frames += 1;
      perfHook.total += ms;
      perfHook.max = Math.max(perfHook.max, ms);
    }
  }

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(stashScore(setup, game.current), stashPicks(setup, game.current), stashStats(setup, game.current));
  };

  const hideName = (id: HideId) => getHide(setup, id)?.name ?? '';

  const float = (text: string, tone: Floater['tone'], x: number, y: number) => {
    const f = fx.current;
    const id = ++f.floats;
    setFloats((list) => [...list.slice(-4), { id, text, tone, x, y }]);
    window.setTimeout(() => setFloats((list) => list.filter((fl) => fl.id !== id)), 1100);
  };

  /** Rückmeldung, wenn ein Versteck ablehnt. */
  const refuse = (check: HideCheck, hideId: HideId) => {
    if (check === 'ok' || check === 'done') return;
    playSound(MINIGAME_SOUNDS.fail, 0.7);
    haptic('error');
    const f = fx.current;
    f.shake = Math.max(f.shake, 0.25);
    const hide = getHide(setup, hideId);
    if (hide) f.scene?.burst('refuse', hideCenter(hide), hide.y + hide.h);
    const name = hideName(hideId);
    if (check === 'tooBig') say(`Zu groß für ${name === 'Gully' ? 'den Gully' : `den ${name}`}.`, 'bad');
    else if (check === 'full') say(`${name}: voll.`, 'bad');
    else if (check === 'closed') say('Das Tor ist zu. Draußen steht die Streife.', 'bad');
    else if (check === 'busy') say('Erst das Paket in deiner Hand wegbringen.', 'warn');
  };

  const onEvents = (events: StashEvent[]) => {
    const f = fx.current;
    const scene = f.scene;
    for (const e of events) {
      if (e.type === 'picked') {
        audio.play(STASH_SOUNDS.lift, { volume: 0.7 });
        haptic('selection');
        const s = game.current;
        scene?.burst('pick', s.x, 0.3, 0);
        const p = setup.packages[e.id];
        if (p.size === 3) say(`${p.label}: schwer. Du wirst langsamer.`, 'warn');
      } else if (e.type === 'stowing') {
        audio.play(STASH_SOUNDS.creak, { volume: 0.6 });
      } else if (e.type === 'stowed') {
        const hide = getHide(setup, e.hide);
        const p = setup.packages[e.id];
        audio.play(hide?.wet ? STASH_SOUNDS.splash : STASH_SOUNDS.stow, { volume: 0.9 });
        haptic(hide?.wet ? 'light' : 'success');
        f.shake = Math.max(f.shake, 0.18);
        stop.hold(hide?.wet ? 0.04 : 0.07);
        if (hide && scene) {
          scene.burst(hide.wet ? 'splash' : 'stow', hideCenter(hide), hide.y, 0);
          const sp = scene.hideScreen[e.hide];
          if (sp) {
            float(
              hide.wet ? `nass · ${formatEuro(Math.round(p.value * 0.4))}` : `+${formatEuro(p.value)}`,
              hide.wet ? 'wet' : 'good',
              sp.x,
              sp.y,
            );
          }
        }
        if (hide?.wet) say('Im Gully. Nass, aber weg.', 'warn');
      } else if (e.type === 'dropped') {
        audio.play(STASH_SOUNDS.step, { volume: 0.8 });
      } else if (e.type === 'refused') {
        refuse(e.check, e.hide);
      } else if (e.type === 'closed') {
        f.closedT = 0;
        f.shake = 0.8;
        stop.hold(0.09);
        audio.play(STASH_SOUNDS.slam, { volume: 1 });
        playSound(MINIGAME_SOUNDS.alarm, 0.4);
        haptic('warning');
        say('Streife vor dem Tor! Tor runter, draußen ist dicht.', 'bad');
      } else if (e.type === 'pushed') {
        say('Rein, rein! Das Tor geht runter.', 'bad');
      } else if (e.type === 'timeUp') {
        f.breachT = 0;
        f.shake = 1;
        stop.hold(0.09);
        f.endAt = f.t + (reduced ? 1.6 : 2.4);
        audio.play(STASH_SOUNDS.breach, { volume: 1 });
        haptic('error');
        say('Polizei! Alle an die Wand!', 'bad');
      } else if (e.type === 'cleared') {
        f.clearT = 0;
        f.endAt = f.t + 1.4;
        playSound(MINIGAME_SOUNDS.clunk);
        haptic('success');
        say('Alles weg. Jetzt ganz ruhig.', 'good');
      }
    }
    if (events.length > 0) refreshHud();
  };

  const doAct = () => {
    const s = game.current;
    if (!running || s.done) return;
    const before = contextOf(setup, s);
    if (before.kind === 'none') {
      playSound(MINIGAME_SOUNDS.click, 0.3);
      say('Hier liegt nichts. Lauf zu einem Paket.', 'warn');
      return;
    }
    onEvents(act(setup, s));
    refreshHud();
  };

  const sendKey = (n: number) => {
    const s = game.current;
    const hide = setup.hides[n];
    if (!running || s.done || !hide) return;
    const check = sendTo(setup, s, hide.id);
    if (check === 'ok') {
      playSound(MINIGAME_SOUNDS.click, 0.35);
      fx.current.focus = { kind: 'hide', id: hide.id };
    } else refuse(check, hide.id);
    refreshHud();
  };

  const keys = useGameKeys(
    KEYS,
    (press) => {
      const code = press.code;
      if (ACT_KEYS.has(code)) doAct();
      else if (code.startsWith('Digit') || code.startsWith('Numpad')) sendKey(Number(code.slice(-1)) - 1);
    },
    running,
  );

  useFrameLoop((rawDt) => {
    const s = game.current;
    const f = fx.current;
    // Hit-Stop: kurz steht alles (Lauf, Uhr, Licht); danach Zeitlupe, wenn sie reinstürmen.
    const live = stop.filter(rawDt);
    const dt = f.breachT >= 0 && !reduced ? live * 0.55 : live;
    f.t += live;
    const left = keys.isDown('ArrowLeft') || keys.isDown('KeyA') || held.current.left;
    const right = keys.isDown('ArrowRight') || keys.isDown('KeyD') || held.current.right;
    const move: -1 | 0 | 1 = left === right ? 0 : left ? -1 : 1;
    if (!s.done && live > 0) onEvents(step(setup, s, live, move));
    if (f.closedT >= 0) f.closedT += dt;
    if (f.breachT >= 0) f.breachT += dt;
    if (f.clearT >= 0) f.clearT += dt;
    f.alarm = Math.min(1, (s.time / setup.duration) ** 1.3);
    f.knock = Math.max(0, f.knock - rawDt * 4);
    f.shake = Math.max(0, f.shake - rawDt * 2.2);
    // Schritte im Takt (schwer: dumpfer, langsamer).
    const speed = Math.abs(s.v);
    if (speed > 0.8 && f.t - f.lastStep > 1.25 / Math.max(2.5, speed)) {
      f.lastStep = f.t;
      audio.playThrottled(STASH_SOUNDS.step, 80, { volume: s.carry !== null ? 0.55 : 0.4 });
    }
    // Sirene: lauter und öfter, je näher sie sind.
    const every = SIREN_EVERY * (1 - 0.35 * f.alarm);
    if (!s.done && f.t - f.lastSiren >= every) {
      f.lastSiren = f.t;
      audio.play(STASH_SOUNDS.siren, { volume: 0.1 + 0.55 * f.alarm });
    }
    const remaining = timeLeft(setup, s);
    // Klopfen am Tor (Lager: erst, wenn es zu ist), Herzschlag in den letzten Sekunden.
    const knocking = !s.done && remaining <= KNOCK_FROM && (setup.gate === null || f.closedT >= 0);
    if (knocking && f.t - f.lastKnock >= KNOCK_EVERY) {
      f.lastKnock = f.t;
      f.knock = 1;
      f.shake = Math.max(f.shake, setup.gate === null ? 0.1 : 0.3);
      if (setup.gate !== null) audio.play(STASH_SOUNDS.knock, { volume: 0.9 });
      haptic('light');
      if (!f.warned) {
        f.warned = true;
        say(setup.gate !== null ? '„Polizei! Aufmachen!“' : 'Da vorne biegt die Streife ein!', 'bad');
      }
    }
    if (!s.done && remaining <= 5 && f.t - f.lastBeat >= 0.55) {
      f.lastBeat = f.t;
      playSound(MINIGAME_SOUNDS.heartbeat, 0.6);
    }
    // Einmal pro Bild zeichnen, auch wenn die Schleife (vorgespult) mehrere Schritte im selben Bild macht.
    f.pendingDt += dt;
    if (!f.drawQueued) {
      f.drawQueued = true;
      queueMicrotask(() => {
        f.drawQueued = false;
        draw(f.pendingDt);
        f.pendingDt = 0;
      });
    }
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      refreshHud();
    }
    if (f.endAt >= 0 && f.t >= f.endAt) finish();
  }, running);

  // Meldungen verschwinden von selbst (sonst stand „Hier liegt nichts“ bis zur nächsten Meldung da).
  useEffect(() => {
    if (!hud.message || hud.done) return;
    const key = hud.key;
    const id = window.setTimeout(
      () => setHud((h) => (h.key === key ? { ...h, message: null, tone: null } : h)),
      MESSAGE_MS,
    );
    return () => window.clearTimeout(id);
  }, [hud.key, hud.message, hud.done]);

  // Breite der Beschriftungen messen, wenn sich ihr Inhalt ändern kann (für das Ausweichen am Rand).
  useEffect(() => {
    for (const h of setup.hides) {
      const el = labels.current[h.id];
      if (el) widths.current[h.id] = el.offsetWidth;
    }
  }, [hud.carry, hud.closed, hud.hidden, setup]);

  // Bild auch ohne laufendes Spiel (Einleitung, Ergebnis) aktuell halten.
  useEffect(() => {
    // Pause (running false mitten im Spiel): gehaltene Knöpfe loslassen; weiter geht es genau dort.
    if (!running) {
      held.current.left = false;
      held.current.right = false;
    }
    draw(0);
  }, [running]);

  // Zeiger: Paket antippen = hinlaufen und aufheben; Versteck = hinbringen; sonst dorthin laufen.
  const onPointerDown = (e: PointerEvent) => {
    const s = game.current;
    const scene = fx.current.scene;
    if (!running || s.done || !scene) return;
    capture(e);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const goal = scene.pick(e.clientX - rect.left, e.clientY - rect.top, s);
    if (!goal) return;
    tapGoal(goal);
  };
  const tapGoal = (goal: NonNullable<StashFx['focus']>) => {
    const s = game.current;
    if (goal.kind === 'hide') {
      if (s.carry === null) {
        // Leere Hände: das nächste Paket holen, das hineinpasst.
        const check = sendTo(setup, s, goal.id);
        if (check !== 'ok') refuse(check, goal.id);
        else playSound(MINIGAME_SOUNDS.click, 0.35);
      } else {
        const check = canHide(setup, s, s.carry, goal.id);
        if (check !== 'ok') refuse(check, goal.id);
        else {
          goTo(setup, s, goal);
          playSound(MINIGAME_SOUNDS.click, 0.35);
        }
      }
      fx.current.focus = goal;
    } else if (goal.kind === 'package') {
      if (goTo(setup, s, goal)) playSound(MINIGAME_SOUNDS.click, 0.3);
    } else goTo(setup, s, goal);
    refreshHud();
  };

  const s = game.current;
  const carried = hud.carry !== null ? setup.packages[hud.carry] : null;
  const ctxPkg = hud.ctx.kind === 'pickup' ? setup.packages[hud.ctx.id] : null;
  const total = setup.packages.length;
  const urgent = hud.left <= KNOCK_FROM;
  return (
    <div
      class={`stash stash--${setup.setting}${urgent && !hud.done ? ' is-urgent' : ''}${hud.closed ? ' is-closed' : ''}`}
    >
      <canvas
        ref={canvas}
        class="stash__canvas"
        aria-label="Lager von der Seite: zu Paketen laufen und sie verstecken"
        onPointerDown={onPointerDown}
      />
      <div class="stash__vignette" aria-hidden="true" />
      {hud.done && fx.current.breachT >= 0 && <div class="stash__flash" aria-hidden="true" />}
      <HudBar class="stash__hud">
        <HudTimer seconds={hud.left} total={setup.duration} urgentAt={KNOCK_FROM} />
        <span class="stash__count" role="img" aria-label={`${hud.hidden} von ${total} Paketen versteckt`}>
          <Icon name="package" />
          {hud.hidden}/{total}
        </span>
        <HudMeter label="Gerettet" value={hud.saved} color="money" detail={`${Math.round(hud.saved * 100)} %`} />
      </HudBar>
      {/* Die ganze Strecke als Leiste: Verstecke, offene Pakete, du, das Tor. */}
      <div class="stash__strip" aria-hidden="true">
        {setup.gate !== null && (
          <span
            class={`stash__strip-gate${hud.closed ? ' is-closed' : ''}`}
            style={{ left: `${(setup.gate / setup.length) * 100}%` }}
          />
        )}
        {setup.hides.map((h) => (
          <span
            key={h.id}
            class={`stash__strip-hide${h.outside && hud.closed ? ' is-closed' : ''}`}
            style={{ left: `${(hideCenter(h) / setup.length) * 100}%` }}
          />
        ))}
        {setup.packages.map((p) =>
          isLoose(s, p.id) ? (
            <span
              key={p.id}
              class={`stash__strip-pkg is-${p.size}`}
              style={{
                left: `${(s.items[p.id].x / setup.length) * 100}%`,
                '--swatch': `var(--cat-${productColor(p.productId)})`,
              }}
            />
          ) : null,
        )}
        <span ref={strip} class="stash__strip-me" />
      </div>
      {setup.hides.map((h, i) => {
        const blocked = h.outside && hud.closed;
        const fit = carried && !hud.done ? canHide(setup, s, carried.id, h.id) : null;
        const used = usedIn(s, h.id);
        return (
          <button
            key={h.id}
            ref={(el) => {
              labels.current[h.id] = el;
            }}
            type="button"
            class={`stash__label${h.y + h.h < 0.4 ? ' is-low' : ''}${blocked ? ' is-blocked' : ''}${fit === 'ok' ? ' is-ok' : fit ? ' is-no' : ''}`}
            disabled={!running || hud.done}
            onClick={() => tapGoal({ kind: 'hide', id: h.id })}
            aria-label={`${h.name}${blocked ? ', zu' : fit && fit !== 'ok' ? `, ${REASONS[fit]}` : ''}`}
          >
            <kbd>{i + 1}</kbd>
            <span class="stash__label-name">{h.name}</span>
            {blocked ? (
              <span class="stash__chip is-bad">zu</span>
            ) : fit && fit !== 'ok' ? (
              <span class="stash__chip is-bad">{REASONS[fit]}</span>
            ) : (
              <>
                {h.capacity < 99 && (
                  <span class="stash__chip">
                    {used}/{h.capacity}
                  </span>
                )}
                {h.maxSize === 1 && <span class="stash__chip">nur klein</span>}
                {h.wet && <span class="stash__chip is-wet">nass</span>}
              </>
            )}
          </button>
        );
      })}
      {/* Was du in der Hand hast bzw. was hier liegt: über deinem Kopf. */}
      <div ref={bubble} class="stash__bubble" aria-live="polite">
        {(carried ?? ctxPkg) && !hud.done && (
          <span class={`stash__tag${carried ? ' is-carry' : ''}`}>
            <span
              class={`stash__swatch is-${(carried ?? ctxPkg)?.size ?? 1}`}
              style={{ '--swatch': `var(--cat-${productColor((carried ?? ctxPkg)?.productId ?? null)})` }}
              aria-hidden="true"
            />
            <strong>{(carried ?? ctxPkg)?.label}</strong>
            <span class="stash__chip">{amountText((carried ?? ctxPkg) as StashPackage)}</span>
            <span class="stash__chip">{SIZE_NAMES[(carried ?? ctxPkg)?.size ?? 1]}</span>
          </span>
        )}
      </div>
      {floats.map((fl) => (
        <span
          key={fl.id}
          class={`stash__float is-${fl.tone}`}
          style={{ transform: `translate(${fl.x}px, ${fl.y}px)` }}
          aria-hidden="true"
        >
          {fl.text}
        </span>
      ))}
      <TouchControls
        class="stash__touch"
        pad="lr"
        onDirection={(dir, pressed) => {
          if (dir === 'left') held.current.left = pressed;
          if (dir === 'right') held.current.right = pressed;
        }}
        buttons={[
          {
            id: 'act',
            label: actionLabel(hud.ctx),
            icon: hud.ctx.kind === 'stow' ? 'lock' : hud.ctx.kind === 'drop' ? 'chevronDown' : 'package',
            tone: hud.ctx.kind === 'stow' && hud.ctx.check === 'ok' ? 'gold' : 'plain',
            wide: true,
            disabled: !running || hud.done || hud.ctx.kind === 'busy' || hud.ctx.kind === 'none',
            onPress: doAct,
          },
        ]}
      />
      {hud.message && (
        <p key={hud.key} class={`stash__message is-${hud.tone ?? 'info'}`} role="status">
          {hud.message}
        </p>
      )}
    </div>
  );
}
