// Container packen (Auftrag 44, Teil 7): Container von oben als Raster. Teil in der Leiste wählen (oder ziehen), im
// Raster ablegen; Ware von Deckladung umgeben, nicht an die Türen (rechts) und nicht an die Wand zum Röntgen (oben).
// Am Ende fährt der Röntgen-Scanner einmal über den Container, auffällige Stellen leuchten auf.
// Spiellogik in model.ts, Zeichnen in draw.ts, Klänge in sounds.ts.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { audio, haptic, Icon, prefersReducedMotion } from '../../../../../ui';
import { HudBar, HudMeter, HudTimer, type MeterColor } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { capture } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import { readPalette } from '../stash/draw';
import { productColor } from '../stash/StashGame';
import {
  cellAt,
  drawScene,
  ghostOrigin,
  type PackFx,
  type PackLayout,
  packLayout,
  renderBackground,
  toScreen,
} from './draw';
import {
  analyze,
  autoPack,
  COVER_SETS,
  type CoverKind,
  canPlace,
  createPacking,
  cycle,
  FLAG_AT,
  finishPacking,
  initPacking,
  isPlaced,
  lift,
  moveCursor,
  type PackAnalysis,
  type PackingInput,
  type PackPiece,
  type PlaceCheck,
  packPicks,
  packScore,
  pieceAt,
  place,
  rotate,
  select,
  stackCount,
  step,
  timeLeft,
  trayOrder,
  turn,
  undo,
} from './model';
import { PACK_SOUNDS } from './sounds';

const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'KeyR',
  'KeyQ',
  'KeyE',
  'Tab',
  'Space',
  'Enter',
  'KeyZ',
  'Backspace',
  'KeyF',
];
/** Ab so vielen Pixeln Bewegung ist Antippen ein Ziehen. */
const DRAG_PX = 8;
/** Dauer der Fahrt des Scanners über den Container (Sekunden) und Pause danach. */
const SCAN_TIME = 2.4;
const SCAN_HOLD = 0.9;

/** params aus trade (PackingParams) lesen, ohne sich auf ihre Form zu verlassen (alte Stände, Vorschau). */
export function inputFrom(params: Record<string, unknown>): PackingInput {
  const products = Array.isArray(params.products) ? params.products : [];
  const size = params.size === 'small' || params.size === 'full' ? params.size : 'medium';
  const cover: CoverKind = params.cover === 'tiles' || params.cover === 'bananas' ? params.cover : 'none';
  return {
    products: products
      .map((p) => p as Record<string, unknown>)
      .map((p) => ({ id: String(p.id ?? 'weed'), name: String(p.name ?? 'Ware') }))
      .slice(0, 4),
    size,
    cover,
    count: Math.max(1, Number(params.count) || 1),
  };
}

/** Bedeutungsfarbe eines Teils für die Leiste (wie pieceColor in draw.ts). */
function swatch(piece: Pick<PackPiece, 'kind' | 'productId'>, cover: CoverKind): string {
  if (piece.kind === 'goods') return `var(--cat-${productColor(piece.productId)})`;
  return cover === 'bananas' ? 'var(--hud-gold)' : cover === 'tiles' ? 'var(--hud-ink-2)' : 'var(--cat-goods)';
}

/** Kleine Form aus Kästchen (Leiste, Auswahl). */
function MiniShape(props: { piece: PackPiece; rot: number; cover: CoverKind; size?: number }) {
  const cells = rotate(props.piece.shape, props.rot);
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const s = props.size ?? 11;
  return (
    <span
      class="pack__mini"
      style={{
        gridTemplateColumns: `repeat(${w}, ${s}px)`,
        gridTemplateRows: `repeat(${h}, ${s}px)`,
        '--swatch': swatch(props.piece, props.cover),
      }}
      aria-hidden="true"
    >
      {cells.map(([x, y]) => (
        <span key={`${x},${y}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />
      ))}
    </span>
  );
}

function meterColor(v: number): MeterColor {
  return v >= 0.7 ? 'money' : v >= 0.4 ? 'warn' : 'danger';
}

const REASONS: Record<Exclude<PlaceCheck, 'ok'>, string> = {
  out: 'Passt da nicht rein.',
  blocked: 'Da steht schon was.',
  placed: 'Schon im Container.',
  done: 'Vorbei.',
  none: 'Erst ein Teil wählen.',
};

interface Hud {
  left: number;
  goods: number;
  goodsTotal: number;
  stowed: number;
  cover: number;
  version: number;
  message: string | null;
  tone: 'good' | 'bad' | 'warn' | null;
  key: number;
  scanning: boolean;
}

export function ContainerGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const input = useMemo(() => inputFrom(challenge.params), [challenge.params]);
  const setup = useMemo(
    () => createPacking(challenge.seed, challenge.difficulty, input),
    [challenge.seed, challenge.difficulty, input],
  );
  const game = useRef(initPacking(setup));
  const analysis = useRef<PackAnalysis>(analyze(setup, game.current));
  const palette = useMemo(readPalette, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<PackLayout | null>(null);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const [layout, setLayout] = useState<PackLayout | null>(null);
  const fx = useRef<PackFx & { lastHud: number; endAt: number; sent: boolean; scanT: number; beeped: number }>({
    t: 0,
    reduced,
    running: false,
    ghost: false,
    dropped: null,
    reject: -10,
    scan: -1,
    lastHud: -1,
    endAt: -1,
    sent: false,
    scanT: -1,
    beeped: -1,
  });
  const drag = useRef<{
    pointer: number;
    sx: number;
    sy: number;
    moved: boolean;
    /** Teil, das beim Ziehen aus dem Container kommt (−1: ein Teil aus der Leiste bzw. die Auswahl). */
    lifting: number;
    /** Zeiger kam aus der Leiste: Lage der Bühne beim Drücken (einmal gemessen). */
    rect: DOMRect | null;
  } | null>(null);
  const goodsTotal = setup.pieces.filter((p) => p.kind === 'goods').length;
  const [hud, setHud] = useState<Hud>(() => ({
    left: setup.duration,
    goods: 0,
    goodsTotal,
    stowed: 0,
    cover: 0,
    version: 0,
    message: null,
    tone: null,
    key: 0,
    scanning: false,
  }));

  const stage = useStageCanvas(canvas, (st) => {
    const l = packLayout(st.width, st.height, setup.cols, setup.rows);
    layoutRef.current = l;
    bg.current = renderBackground(l, palette, setup, st.dpr);
    setLayout(l);
    draw();
  });

  const say = (message: string | null, tone: Hud['tone'] = null) =>
    setHud((h) => ({ ...h, message, tone, key: h.key + 1 }));

  /** Nach jeder Handlung: Auffälligkeit neu rechnen und die Leiste neu zeichnen. */
  const changed = () => {
    const s = game.current;
    analysis.current = analyze(setup, s);
    const a = analysis.current;
    setHud((h) => ({
      ...h,
      left: timeLeft(setup, s),
      goods: a.placedGoodsPieces,
      stowed: a.stowed,
      cover: a.cover,
      version: h.version + 1,
    }));
  };

  const refuse = (check: PlaceCheck) => {
    if (check === 'ok' || check === 'done') return;
    playSound(MINIGAME_SOUNDS.fail, 0.6);
    haptic('error');
    fx.current.reject = fx.current.t;
    say(REASONS[check], 'bad');
  };

  /** Ausgewähltes Teil am Cursor ablegen. */
  const drop = () => {
    const s = game.current;
    if (!running || s.done) return;
    const piece = setup.pieces[s.selected];
    if (!piece) {
      refuse('none');
      return;
    }
    const { x, y } = ghostOrigin(piece, s);
    const check = canPlace(setup, s, piece.id, s.rot, x, y);
    if (check !== 'ok') {
      refuse(check);
      return;
    }
    place(setup, s, piece.id, s.rot, x, y);
    fx.current.dropped = { id: piece.id, at: fx.current.t };
    audio.play(piece.kind === 'goods' ? PACK_SOUNDS.wrap : PACK_SOUNDS.drop, { volume: 0.8 });
    haptic('light');
    changed();
    // Rückmeldung zur Ware: wo sie auffällt.
    if (piece.kind === 'goods') {
      const cells = analysis.current.cells.filter((c) => setup.pieces[s.grid[c.y * setup.cols + c.x]]?.id === piece.id);
      const reasons = new Set(cells.filter((c) => c.value >= FLAG_AT).flatMap((c) => c.reasons));
      if (reasons.has('door')) say('An den Türen sieht das jeder, der aufmacht.', 'warn');
      else if (reasons.has('xray')) say('An der Wand zum Röntgen leuchtet das.', 'warn');
      else if (reasons.has('cluster')) say('Zu viel Ware an einem Fleck.', 'warn');
      else if (cells.some((c) => c.gaps.length > 0)) say('Jetzt Deckladung drum herum.', null);
    }
    const a = analysis.current;
    if (a.placedGoodsPieces === goodsTotal && a.cover >= 0.999) say('Sauber. Nichts zu sehen.', 'good');
  };

  const choose = (pieceId: number) => {
    const s = game.current;
    if (!running || s.done) return;
    if (select(setup, s, pieceId)) {
      audio.playThrottled(MINIGAME_SOUNDS.click, 40, { volume: 0.4 });
      changed();
    }
  };

  const rotateNow = () => {
    const s = game.current;
    if (!running || s.done) return;
    turn(s, 1);
    audio.play(PACK_SOUNDS.turn, { volume: 0.5 });
    haptic('selection');
    changed();
  };

  const undoNow = () => {
    const s = game.current;
    if (!running || s.done) return;
    if (undo(setup, s) >= 0) {
      audio.play(PACK_SOUNDS.turn, { volume: 0.6 });
      haptic('light');
      changed();
    }
  };

  /** Fertig (oder Zeit um): der Scanner fährt los. */
  const startScan = (timeUp: boolean) => {
    const f = fx.current;
    if (f.scanT >= 0) return;
    finishPacking(game.current);
    analysis.current = analyze(setup, game.current);
    f.scanT = 0;
    f.scan = 0;
    f.ghost = false;
    audio.play(PACK_SOUNDS.scan, { volume: 0.9 });
    haptic('medium');
    say(timeUp ? 'Zeit um. Der Scanner kommt.' : 'Container zu. Der Scanner kommt.', timeUp ? 'bad' : null);
    setHud((h) => ({ ...h, scanning: true }));
  };

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(packScore(setup, game.current), packPicks(setup, game.current));
  };

  useGameKeys(
    KEYS,
    (press) => {
      const s = game.current;
      if (s.done) return;
      const code = press.code;
      // Pfeile nach dem Bild: Hochkant (Handy) ist oben im Modell rechts auf dem Schirm.
      const move = (dx: number, dy: number) => {
        if (layoutRef.current?.rotated) moveCursor(setup, s, dy, -dx);
        else moveCursor(setup, s, dx, dy);
        fx.current.ghost = true;
      };
      if (code === 'ArrowLeft' || code === 'KeyA') move(-1, 0);
      else if (code === 'ArrowRight' || code === 'KeyD') move(1, 0);
      else if (code === 'ArrowUp' || code === 'KeyW') move(0, -1);
      else if (code === 'ArrowDown' || code === 'KeyS') move(0, 1);
      else if (code === 'KeyR') rotateNow();
      else if (code === 'KeyQ' || (code === 'Tab' && press.shift)) {
        cycle(setup, s, -1);
        fx.current.ghost = true;
        changed();
      } else if (code === 'KeyE' || code === 'Tab') {
        cycle(setup, s, 1);
        fx.current.ghost = true;
        changed();
      } else if (code === 'Space' || code === 'Enter') {
        fx.current.ghost = true;
        drop();
      } else if (code === 'KeyZ' || code === 'Backspace') undoNow();
      else if (code === 'KeyF') startScan(false);
    },
    running,
  );

  function draw() {
    const st = stage.current;
    const l = layoutRef.current;
    if (!st || !l || !bg.current) return;
    fx.current.running = running;
    drawScene(st.ctx, l, palette, setup, game.current, analysis.current, bg.current, fx.current);
  }

  useFrameLoop((dt) => {
    const s = game.current;
    const f = fx.current;
    f.t += dt;
    if (!s.done && step(setup, s, dt)) startScan(true);
    if (f.scanT >= 0) {
      f.scanT += dt;
      const dur = reduced ? SCAN_TIME * 0.5 : SCAN_TIME;
      f.scan = Math.min(1, f.scanT / dur);
      // Piepen, wenn der Balken über eine auffällige Spalte fährt.
      const col = Math.floor(f.scan * setup.cols);
      if (col > f.beeped) {
        for (let c = f.beeped + 1; c <= Math.min(col, setup.cols - 1); c++) {
          if (analysis.current.cells.some((x) => x.x === c && x.value >= FLAG_AT)) {
            audio.play(PACK_SOUNDS.beep, { volume: 0.7 });
            haptic('warning');
          }
        }
        f.beeped = col;
      }
      if (f.scanT >= dur + SCAN_HOLD) finish();
    }
    draw();
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      setHud((h) => (Math.abs(h.left - timeLeft(setup, s)) >= 0.05 ? { ...h, left: timeLeft(setup, s) } : h));
    }
  }, running);

  // Entwicklung: window.koeln.dev.container.pack(n) packt n Teile gierig (Screenshots, Playwright), .state zeigt den
  // laufenden Container.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const holder = window as unknown as { koeln?: { dev?: Record<string, unknown> } };
    if (!holder.koeln) return;
    holder.koeln.dev = {
      ...holder.koeln.dev,
      container: {
        setup,
        state: game.current,
        pack: (steps?: number) => {
          const n = autoPack(setup, game.current, steps);
          changed();
          return n;
        },
      },
    };
    return () => {
      if (holder.koeln?.dev) delete holder.koeln.dev.container;
    };
  }, [setup]);

  // Zeiger im Container: Hover zeigt das Teil am Cursor; antippen legt es ab; ein abgelegtes Teil antippen nimmt es
  // wieder heraus, ziehen versetzt es.
  const toCell = (px: number, py: number) => {
    const l = layoutRef.current;
    return l ? cellAt(l, px, py) : { x: -1, y: -1 };
  };
  const inGrid = (c: { x: number; y: number }) => c.x >= 0 && c.y >= 0 && c.x < setup.cols && c.y < setup.rows;
  const local = (e: PointerEvent, rect: DOMRect) => ({ px: e.clientX - rect.left, py: e.clientY - rect.top });
  const aim = (c: { x: number; y: number }) => {
    const s = game.current;
    if (inGrid(c)) {
      s.cursor = { x: c.x, y: c.y };
      fx.current.ghost = true;
    } else fx.current.ghost = false;
  };

  const onPointerDown = (e: PointerEvent) => {
    const s = game.current;
    if (!running || s.done) return;
    if (e.button === 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { px, py } = local(e, rect);
    const c = toCell(px, py);
    capture(e);
    const at = inGrid(c) ? pieceAt(setup, s, c.x, c.y) : -1;
    drag.current = { pointer: e.pointerId, sx: px, sy: py, moved: false, lifting: at, rect };
    if (at < 0) aim(c);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const rect = d?.rect ?? (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { px, py } = local(e, rect);
    if (!d) {
      if (e.pointerType === 'mouse' && running) aim(toCell(px, py));
      return;
    }
    if (d.pointer !== e.pointerId) return;
    if (!d.moved && Math.hypot(px - d.sx, py - d.sy) > DRAG_PX) {
      d.moved = true;
      if (d.lifting >= 0 && lift(setup, game.current, d.lifting)) {
        audio.play(PACK_SOUNDS.turn, { volume: 0.5 });
        changed();
      }
    }
    if (d.moved || d.lifting < 0) aim(toCell(px, py));
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    const s = game.current;
    if (!running || s.done) return;
    if (d.lifting >= 0 && !d.moved) {
      // Nur angetippt: wieder heraus, liegt in der Leiste.
      if (lift(setup, s, d.lifting)) {
        audio.play(PACK_SOUNDS.turn, { volume: 0.5 });
        haptic('selection');
        say('Wieder rausgenommen.', null);
        changed();
      }
      return;
    }
    const { px, py } = local(e, d.rect ?? (e.currentTarget as HTMLElement).getBoundingClientRect());
    const c = toCell(px, py);
    if (!inGrid(c)) {
      fx.current.ghost = false;
      return;
    }
    aim(c);
    drop();
    if (e.pointerType !== 'mouse') fx.current.ghost = false;
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    rotateNow();
  };
  const onWheel = (e: WheelEvent) => {
    if (!running) return;
    e.preventDefault();
    turn(game.current, e.deltaY > 0 ? 1 : -1);
    audio.playThrottled(PACK_SOUNDS.turn, 80, { volume: 0.4 });
    changed();
  };

  // Aus der Leiste ziehen: Teil wählen und über den Container ziehen, loslassen legt es ab.
  const trayDown = (e: PointerEvent, pieceId: number) => {
    if (!running || game.current.done) return;
    e.preventDefault();
    choose(pieceId);
    capture(e);
    drag.current = {
      pointer: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      lifting: -1,
      rect: canvas.current?.getBoundingClientRect() ?? null,
    };
  };
  const trayMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId || !d.rect) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > DRAG_PX) d.moved = true;
    if (d.moved) {
      const { px, py } = local(e, d.rect);
      aim(toCell(px, py));
    }
  };
  const trayUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    if (!d.moved || !d.rect) {
      // Angetippt: ausgewählt. Am Handy zeigt das Raster das Teil in der Mitte, Antippen im Raster legt es ab.
      fx.current.ghost = e.pointerType !== 'mouse';
      return;
    }
    const { px, py } = local(e, d.rect);
    const c = toCell(px, py);
    if (inGrid(c)) {
      aim(c);
      drop();
    }
    fx.current.ghost = false;
  };

  const s = game.current;
  const tray = trayOrder(setup, s);
  const selected = setup.pieces[s.selected] && !isPlaced(s, s.selected) ? setup.pieces[s.selected] : null;
  const set = COVER_SETS[setup.cover];
  const panel = layout?.panel;
  // Beschriftung: Röntgen an der Schiene (Modell oben), Türen neben der Stirnwand (Modell rechts).
  const labels = layout
    ? {
        xray: toScreen(
          layout,
          layout.ox + (layout.cell * setup.cols) / 2,
          layout.oy - layout.wall - layout.cell * 0.66,
        ),
        door: toScreen(
          layout,
          layout.ox + layout.cell * setup.cols + layout.door + layout.cell * 0.32,
          layout.oy + (layout.cell * setup.rows) / 2,
        ),
      }
    : null;
  const allIn = hud.goods === goodsTotal;
  const trayButton = (id: number) => {
    const piece = setup.pieces[id];
    const isSel =
      selected !== null &&
      (selected.id === id ||
        (piece.kind === 'cover' && selected.kind === 'cover' && selected.shapeId === piece.shapeId));
    const n = piece.kind === 'cover' ? stackCount(setup, s, piece.shapeId) : 0;
    return (
      <button
        key={piece.kind === 'goods' ? `g${id}` : `c${piece.shapeId}`}
        type="button"
        class={`pack__piece is-${piece.kind}${isSel ? ' is-selected' : ''}`}
        disabled={!running || s.done}
        aria-pressed={isSel}
        aria-label={`${piece.label}, ${piece.shape.length} ${piece.shape.length === 1 ? 'Feld' : 'Felder'}${n > 1 ? `, ${n} übrig` : ''}`}
        onPointerDown={(e) => trayDown(e, id)}
        onPointerMove={trayMove}
        onPointerUp={trayUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClick={(e) => {
          // Tastatur und Screenreader (Klick ohne Zeiger).
          if (e.detail === 0) {
            choose(id);
            fx.current.ghost = true;
          }
        }}
      >
        <MiniShape piece={piece} rot={(isSel ? s.rot : 0) + (layout?.rotated ? 1 : 0)} cover={setup.cover} />
        <span class="pack__piece-name">{piece.kind === 'goods' ? piece.label : `× ${n}`}</span>
      </button>
    );
  };
  const goodsTray = tray.filter((id) => setup.pieces[id].kind === 'goods');
  const coverTray = tray.filter((id) => setup.pieces[id].kind === 'cover');
  return (
    <div class="pack">
      <canvas
        ref={canvas}
        class="pack__canvas"
        aria-label="Container von oben: Ware und Deckladung ins Raster legen"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerLeave={(e) => {
          if (!drag.current && e.pointerType === 'mouse') fx.current.ghost = false;
        }}
        onContextMenu={onContextMenu}
        onWheel={onWheel}
      />
      <HudBar class="pack__hud">
        <HudTimer seconds={hud.left} total={setup.duration} urgentAt={10} />
        <span class="pack__count" role="img" aria-label={`${hud.goods} von ${goodsTotal} Ware-Blöcken verstaut`}>
          <Icon name="package" />
          {hud.goods}/{goodsTotal}
        </span>
        <HudMeter
          label="Tarnung"
          value={hud.goods > 0 ? hud.cover : 0}
          color={meterColor(hud.cover)}
          detail={hud.goods > 0 ? `${Math.round(hud.cover * 100)} %` : '–'}
        />
      </HudBar>
      {labels && (
        <>
          <span
            class={`pack__label is-xray${layout?.rotated ? ' is-turned' : ''}`}
            style={{ left: `${labels.xray.x}px`, top: `${labels.xray.y}px` }}
            aria-hidden="true"
          >
            <Icon name="scan" />
            Röntgen
          </span>
          <span
            class={`pack__label is-door${layout?.rotated ? '' : ' is-turned'}`}
            style={{ left: `${labels.door.x}px`, top: `${labels.door.y}px` }}
            aria-hidden="true"
          >
            Türen
          </span>
        </>
      )}
      {panel && (
        <aside
          class={`pack__panel${panel.side ? ' is-side' : ' is-bottom'}`}
          style={
            panel.side
              ? { left: `${panel.x}px`, top: `${panel.y}px`, width: `${panel.w}px`, maxHeight: `${panel.h}px` }
              : { left: `${panel.x}px`, bottom: '8px', width: `${panel.w}px` }
          }
          aria-label="Teile und Knöpfe"
        >
          {panel.side && (
            <div class="pack__pick" aria-live="polite">
              {selected ? (
                <>
                  <MiniShape piece={selected} rot={s.rot} cover={setup.cover} size={16} />
                  <span class="pack__pick-text">
                    <strong>{selected.kind === 'goods' ? selected.label : set.unit}</strong>
                    <span class="pack__chips">
                      <span class={`pack__chip${selected.kind === 'goods' ? ' is-goods' : ''}`}>
                        {selected.kind === 'goods' ? 'Ware' : 'Deckladung'}
                      </span>
                      <span class="pack__chip">
                        {selected.shape.length} {selected.shape.length === 1 ? 'Feld' : 'Felder'}
                      </span>
                    </span>
                  </span>
                </>
              ) : (
                <span class="pack__pick-empty">
                  {s.done ? 'Container zu, der Scanner läuft.' : 'Alles im Container.'}
                </span>
              )}
            </div>
          )}
          <div class="pack__tray">
            {goodsTray.length > 0 && (
              <fieldset class="pack__group" aria-label="Ware">
                {panel.side && <legend class="pack__group-title">Ware</legend>}
                <div class="pack__pieces">{goodsTray.map(trayButton)}</div>
              </fieldset>
            )}
            {coverTray.length > 0 && (
              <fieldset class="pack__group" aria-label={`Deckladung: ${set.name}`}>
                {panel.side && <legend class="pack__group-title">Deckladung: {set.name}</legend>}
                <div class="pack__pieces">{coverTray.map(trayButton)}</div>
              </fieldset>
            )}
            {s.done && !panel.side && <span class="pack__pick-empty">Container zu, der Scanner läuft.</span>}
            {tray.length === 0 && !s.done && <span class="pack__pick-empty">Nichts mehr übrig.</span>}
          </div>
          <div class="pack__buttons">
            <button type="button" class="pack__button" disabled={!running || s.done} onClick={rotateNow}>
              <Icon name="refresh" />
              Drehen
              {panel.side && <kbd>R</kbd>}
            </button>
            <button
              type="button"
              class="pack__button"
              disabled={!running || s.done || s.placed.length === 0}
              onClick={undoNow}
            >
              <Icon name="undo" />
              Zurück
              {panel.side && <kbd>Z</kbd>}
            </button>
            <button
              type="button"
              class={`pack__button${allIn ? ' is-gold' : ''}`}
              disabled={!running || s.done}
              onClick={() => startScan(false)}
            >
              <Icon name="check" />
              Fertig
              {panel.side && <kbd>F</kbd>}
            </button>
          </div>
        </aside>
      )}
      {hud.message && (
        <p key={hud.key} class={`pack__message is-${hud.tone ?? 'info'}`} role="status">
          {hud.message}
        </p>
      )}
    </div>
  );
}
