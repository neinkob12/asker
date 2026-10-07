// Razzia-Countdown (Auftrag 44, Teil 3): Draufsicht auf dein Lager bzw. die Straße am Spot. Pakete per Ziehen in
// Verstecke bringen (oder antippen und dann das Versteck antippen), mit der Tastatur ←/→ wählen und 1–5 schicken.
// Sirenen werden lauter, Blaulicht an den Fenstern; kurz vor Schluss steht die Streife vor dem Tor (draußen ist zu),
// dann stürmen sie rein. Spiellogik in model.ts, Zeichnen in draw.ts.

import { useMemo, useRef, useState } from 'preact/hooks';
import { formatAmount, formatEuro } from '../../../../../core';
import { audio, haptic, Icon, prefersReducedMotion } from '../../../../../ui';
import { productColor } from '../../kit/goods';
import { HudBar, HudMeter, HudTimer } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { capture } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import {
  type DrawFx,
  drawScene,
  hideScreen,
  readPalette,
  renderBackground,
  type StashLayout,
  stashLayout,
  toScenePoint,
} from './draw';
import {
  canHide,
  createStash,
  grab,
  type HideCheck,
  type HideId,
  hideAt,
  initStash,
  isLoose,
  nextLoose,
  packageAt,
  release,
  type StashEvent,
  type StashInput,
  type StashPackage,
  savedValue,
  send,
  stashCounts,
  stashPicks,
  stashScore,
  steer,
  step,
  streetClosed,
  timeLeft,
  usedIn,
} from './model';
import { STASH_SOUNDS } from './sounds';

const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
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
/** Ab so vielen Pixeln Bewegung ist Antippen ein Ziehen. */
const DRAG_PX = 8;
/** Abstand der Sirene in Sekunden. */
const SIREN_EVERY = 1.25;

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

interface Hud {
  left: number;
  hidden: number;
  saved: number;
  selected: number;
  closed: boolean;
  carrying: boolean;
  message: string | null;
  tone: 'good' | 'bad' | 'warn' | null;
  key: number;
}

export function StashGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const input = useMemo(() => inputFrom(challenge.params), [challenge.params]);
  const setup = useMemo(
    () => createStash(challenge.seed, challenge.difficulty, input),
    [challenge.seed, challenge.difficulty, input],
  );
  const game = useRef(initStash(setup));
  const palette = useMemo(readPalette, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<StashLayout | null>(null);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const [layout, setLayout] = useState<StashLayout | null>(null);
  const fx = useRef<DrawFx & { lastSiren: number; lastBeat: number; lastHud: number; endAt: number; sent: boolean }>({
    t: 0,
    alarm: 0,
    breachT: -1,
    clearT: -1,
    hover: null,
    reject: null,
    stowed: null,
    reduced,
    running: false,
    lastSiren: -10,
    lastBeat: -10,
    lastHud: -1,
    endAt: -1,
    sent: false,
  });
  const drag = useRef<{ id: number; pointer: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [hud, setHud] = useState<Hud>(() => ({
    left: setup.duration,
    hidden: 0,
    saved: 0,
    selected: game.current.selected,
    closed: false,
    carrying: false,
    message: null,
    tone: null,
    key: 0,
  }));

  const stage = useStageCanvas(canvas, (st) => {
    const l = stashLayout(st.width, st.height, setup.hides.length);
    layoutRef.current = l;
    bg.current = renderBackground(l, palette, setup, st.dpr);
    setLayout(l);
    draw();
  });

  const say = (message: string | null, tone: Hud['tone'] = null) =>
    setHud((h) => ({ ...h, message, tone, key: h.key + 1 }));

  const hideName = (id: HideId) => setup.hides.find((h) => h.id === id)?.name ?? '';

  /** Rückmeldung, wenn ein Versteck ablehnt. */
  const refuse = (check: HideCheck, hideId: HideId | null) => {
    if (check === 'ok' || check === 'done') return;
    playSound(MINIGAME_SOUNDS.fail, 0.7);
    haptic('error');
    if (hideId) fx.current.reject = { id: hideId, at: fx.current.t };
    const name = hideId ? hideName(hideId) : '';
    if (check === 'tooBig') say(`Zu groß für ${name === 'Gully' ? 'den Gully' : name}.`, 'bad');
    else if (check === 'full') say(`${name} ist voll.`, 'bad');
    else if (check === 'closed') say('Draußen steht die Streife.', 'bad');
    else if (check === 'busy') say('Erst das eine Paket wegbringen.', 'warn');
  };

  const sendTo = (hideId: HideId) => {
    const s = game.current;
    if (!running || s.done) return;
    if (s.selected < 0 || !isLoose(s, s.selected)) {
      say('Erst ein Paket auswählen.', 'warn');
      return;
    }
    const check = send(setup, s, s.selected, hideId);
    if (check === 'ok') {
      audio.play(STASH_SOUNDS.lift, { volume: 0.6 });
      haptic('selection');
    } else refuse(check, hideId);
    refreshHud();
  };

  const select = (dir: 1 | -1) => {
    const s = game.current;
    if (!running || s.done || s.carry) return;
    const next = nextLoose(setup, s, dir);
    if (next >= 0) {
      s.selected = next;
      audio.playThrottled(MINIGAME_SOUNDS.click, 40, { volume: 0.4 });
      refreshHud();
    }
  };

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(stashScore(setup, game.current), stashPicks(setup, game.current));
  };

  const onEvents = (events: StashEvent[]) => {
    const f = fx.current;
    for (const e of events) {
      if (e.type === 'stowed') {
        const hide = setup.hides.find((h) => h.id === e.hide);
        f.stowed = { id: e.hide, at: f.t, wet: !!hide?.wet };
        audio.play(hide?.wet ? STASH_SOUNDS.splash : STASH_SOUNDS.stow, { volume: 0.8 });
        haptic('light');
        if (hide?.wet) say('Im Gully. Nass, aber weg.', 'warn');
      } else if (e.type === 'closed') {
        playSound(MINIGAME_SOUNDS.alarm, 0.5);
        haptic('warning');
        say('Streife vor dem Tor! Kofferraum und Gully sind zu.', 'bad');
      } else if (e.type === 'timeUp') {
        f.breachT = 0;
        f.endAt = f.t + (reduced ? 1.4 : 2);
        audio.play(STASH_SOUNDS.breach, { volume: 1 });
        haptic('error');
        say('Polizei! Alle an die Wand!', 'bad');
      } else if (e.type === 'cleared') {
        f.clearT = 0;
        f.endAt = f.t + 1.1;
        playSound(MINIGAME_SOUNDS.clunk);
        haptic('success');
        say('Alles weg. Jetzt ganz ruhig.', 'good');
      }
    }
  };

  const refreshHud = () => {
    const s = game.current;
    const counts = stashCounts(setup, s);
    setHud((h) => ({
      ...h,
      left: timeLeft(setup, s),
      hidden: counts.hidden,
      saved: setup.totalValue > 0 ? savedValue(setup, s) / setup.totalValue : 0,
      selected: s.selected,
      closed: streetClosed(setup, s),
      carrying: !!s.carry,
    }));
  };

  useGameKeys(
    KEYS,
    (press) => {
      const code = press.code;
      if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') select(-1);
      else if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') select(1);
      else {
        const n = Number(code.slice(-1)) - 1;
        const hide = setup.hides[n];
        if (hide) sendTo(hide.id);
      }
    },
    running,
  );

  function draw() {
    const st = stage.current;
    const l = layoutRef.current;
    if (!st || !l || !bg.current) return;
    fx.current.running = running;
    drawScene(st.ctx, l, palette, setup, game.current, bg.current, fx.current);
  }

  useFrameLoop((dt) => {
    const s = game.current;
    const f = fx.current;
    f.t += dt;
    if (!s.done) onEvents(step(setup, s, dt));
    f.alarm = Math.min(1, (s.time / setup.duration) ** 1.3);
    // Sirene: lauter und öfter, je näher sie sind.
    const every = SIREN_EVERY * (1 - 0.35 * f.alarm);
    if (!s.done && f.t - f.lastSiren >= every) {
      f.lastSiren = f.t;
      audio.play(STASH_SOUNDS.siren, { volume: 0.12 + 0.6 * f.alarm });
    }
    const left = timeLeft(setup, s);
    if (!s.done && left <= 5 && f.t - f.lastBeat >= 0.6) {
      f.lastBeat = f.t;
      playSound(MINIGAME_SOUNDS.heartbeat, 0.6);
    }
    if (f.breachT >= 0) f.breachT += dt;
    if (f.clearT >= 0) f.clearT += dt;
    draw();
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      refreshHud();
    }
    if (f.endAt >= 0 && f.t >= f.endAt) finish();
  }, running);

  // Zeiger: Paket greifen und ziehen; antippen wählt aus; ein Versteck antippen schickt das ausgewählte dorthin.
  const point = (e: PointerEvent) => {
    const l = layoutRef.current;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { px, py, ...(l ? toScenePoint(l, px, py) : { x: -1, y: -1 }) };
  };
  const onPointerDown = (e: PointerEvent) => {
    const s = game.current;
    if (!running || s.done) return;
    const pt = point(e);
    const id = packageAt(setup, s, pt.x, pt.y);
    if (id >= 0 && !s.carry) {
      grab(s, id);
      capture(e);
      drag.current = { id, pointer: e.pointerId, sx: pt.px, sy: pt.py, moved: false };
      audio.play(STASH_SOUNDS.lift, { volume: 0.5 });
      haptic('selection');
      refreshHud();
      return;
    }
    const hide = hideAt(setup, pt.x, pt.y);
    if (hide) sendTo(hide);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const pt = point(e);
    if (!d.moved && Math.hypot(pt.px - d.sx, pt.py - d.sy) > DRAG_PX) d.moved = true;
    if (!d.moved) return;
    steer(game.current, pt.x, pt.y);
    const hide = hideAt(setup, pt.x, pt.y);
    fx.current.hover = hide ? { id: hide, ok: canHide(setup, game.current, d.id, hide) === 'ok' } : null;
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    fx.current.hover = null;
    const s = game.current;
    if (!d.moved) {
      // Nur angetippt: ausgewählt, liegt weiter da.
      release(setup, s, null);
      s.selected = d.id;
      refreshHud();
      return;
    }
    const pt = point(e);
    const hide = hideAt(setup, pt.x, pt.y);
    const check = release(setup, s, hide);
    if (hide && check !== 'ok') refuse(check, hide);
    refreshHud();
  };

  const s = game.current;
  const selected = hud.selected >= 0 && isLoose(s, hud.selected) ? setup.packages[hud.selected] : null;
  const total = setup.packages.length;
  const panel = layout?.panel;
  return (
    <div class="stash">
      <canvas
        ref={canvas}
        class="stash__canvas"
        aria-label="Lager von oben: Pakete in Verstecke ziehen"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <HudBar class="stash__hud">
        <HudTimer seconds={hud.left} total={setup.duration} urgentAt={7} />
        <span class="stash__count" role="img" aria-label={`${hud.hidden} von ${total} Paketen versteckt`}>
          <Icon name="package" />
          {hud.hidden}/{total}
        </span>
        <HudMeter label="Gerettet" value={hud.saved} color="money" detail={`${Math.round(hud.saved * 100)} %`} />
      </HudBar>
      {layout &&
        setup.hides.map((h, i) => {
          const r = hideScreen(layout, h);
          const blocked = h.outside && hud.closed;
          return (
            <span
              key={h.id}
              class={`stash__label${blocked ? ' is-blocked' : ''}`}
              style={{ left: `${r.x + r.w / 2}px`, top: `${r.y}px` }}
              aria-hidden="true"
            >
              <kbd>{i + 1}</kbd>
              {h.name}
            </span>
          );
        })}
      {panel && (
        <aside
          class={`stash__panel${panel.side ? ' is-side' : ' is-bottom'}`}
          style={
            panel.side
              ? { left: `${panel.x}px`, top: `${panel.y}px`, width: `${panel.w}px`, maxHeight: `${panel.h}px` }
              : { left: `${panel.x}px`, bottom: '8px', width: `${panel.w}px`, maxHeight: `${panel.h + 40}px` }
          }
          aria-label="Paket und Verstecke"
        >
          <div class="stash__pick" aria-live="polite">
            {s.done ? (
              <span class="stash__pick-empty">{s.cleared ? 'Alles versteckt.' : 'Die Bullen sind drin.'}</span>
            ) : selected ? (
              <>
                <span
                  class={`stash__swatch is-${selected.size}`}
                  style={{ '--swatch': `var(--cat-${productColor(selected.productId)})` }}
                  aria-hidden="true"
                />
                <span class="stash__pick-text">
                  <strong>{selected.label}</strong>
                  <span class="stash__chips">
                    <span class="stash__chip">{amountText(selected)}</span>
                    <span class="stash__chip">{SIZE_NAMES[selected.size]}</span>
                    {selected.productId !== null && <span class="stash__chip">{formatEuro(selected.value)}</span>}
                  </span>
                </span>
              </>
            ) : (
              <span class="stash__pick-empty">
                {hud.carrying ? 'Du trägst gerade ein Paket.' : 'Paket antippen oder ziehen.'}
              </span>
            )}
          </div>
          <div class="stash__hides">
            {setup.hides.map((h, i) => {
              const check = selected && !hud.carrying && !s.done ? canHide(setup, s, selected.id, h.id) : null;
              const blocked = h.outside && hud.closed;
              const used = usedIn(s, h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  class={`stash__hide${check === 'ok' ? ' is-ok' : ''}${blocked ? ' is-blocked' : ''}`}
                  disabled={!running}
                  onClick={() => sendTo(h.id)}
                >
                  <kbd>{i + 1}</kbd>
                  <span class="stash__hide-name">{h.name}</span>
                  <span class="stash__hide-meta">
                    {blocked ? (
                      <span class="stash__chip is-bad">zu</span>
                    ) : check && check !== 'ok' ? (
                      <span class="stash__chip is-bad">{REASONS[check]}</span>
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
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      )}
      {hud.message && (
        <p key={hud.key} class={`stash__message is-${hud.tone ?? 'info'}`} role="status">
          {hud.message}
        </p>
      )}
    </div>
  );
}
