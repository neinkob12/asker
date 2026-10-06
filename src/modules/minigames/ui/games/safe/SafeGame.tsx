// Tresor knacken (Auftrag 44, Teil 0): Nahaufnahme eines alten Stahltresors im Hinterzimmer, Taschenlampe,
// Glas-HUD oben (Zeit, drei Punkte für die Zahlen, Richtung). Drehen per Ziehen (Maus/Finger, kreisförmig) oder ←/→
// (Umschalt: fein), Einrasten mit Leertaste bzw. „Einrasten“. Nahe an der Zahl: Klicken lauter, das Rad zittert, das
// Stethoskop schlägt aus, am Handy vibriert es. Spiellogik in model.ts, Zeichnen in draw.ts.

import { useMemo, useRef, useState } from 'preact/hooks';
import { audio, haptic, Icon, prefersReducedMotion } from '../../../../../ui';
import { HudBar, HudTimer } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { capture, TouchControls } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { type Stage, useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import {
  drawLoot,
  drawWave,
  readPalette,
  renderDialFace,
  renderDoor,
  renderRoom,
  type SafeLayout,
  safeLayout,
} from './draw';
import {
  advance,
  type ConfirmResult,
  confirm,
  cracked,
  createSafe,
  dialNumber,
  initSafe,
  onTarget,
  proximity,
  requiredDir,
  safeScore,
  timeLeft,
  turn,
} from './model';

const KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'Enter', 'NumpadEnter'];
/** Gehaltene Taste: erst nach dieser Zeit dreht es weiter (sonst ein Strich pro Druck). */
const HOLD_DELAY = 0.22;
/** Striche pro Sekunde beim Halten, mit Umschalt fein. */
const HOLD_SPEED = 22;
const FINE_SPEED = 5;

interface Layers {
  layout: SafeLayout;
  room: HTMLCanvasElement;
  door: HTMLCanvasElement;
  face: HTMLCanvasElement;
}

interface Hud {
  left: number;
  step: number;
  number: number;
  message: string | null;
  tone: 'good' | 'bad' | null;
  penalty: number;
}

export function SafeGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const setup = useMemo(() => createSafe(challenge.seed, challenge.difficulty), [challenge.seed, challenge.difficulty]);
  const game = useRef(initSafe(setup));
  const palette = useMemo(readPalette, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const waveCanvas = useRef<HTMLCanvasElement>(null);
  const layers = useRef<Layers | null>(null);
  const fx = useRef({
    t: 0,
    shake: 0,
    flash: 0,
    spike: 0,
    phase: 0,
    light: { x: -1, y: -1 },
    pointer: null as { x: number; y: number; at: number } | null,
    openT: -1,
    alarmT: -1,
    endAt: -1,
    sent: false,
    hold: { dir: 0 as -1 | 0 | 1, since: 0 },
    touchDir: 0 as -1 | 0 | 1,
    lastBeat: -10,
    lastHud: -1,
    /** Etwas hat sich geändert: im nächsten Bild neu zeichnen. */
    dirty: true,
  });
  const drag = useRef<{ angle: number; cx: number; cy: number; id: number } | null>(null);
  const [hud, setHud] = useState<Hud>(() => ({
    left: setup.duration,
    step: 0,
    number: dialNumber(game.current.pos),
    message: null,
    tone: null,
    penalty: 0,
  }));

  const rebuild = (stage: Stage) => {
    const layout = safeLayout(stage.width, stage.height);
    layers.current = {
      layout,
      room: renderRoom(layout, palette, stage.dpr),
      door: renderDoor(layout, palette, stage.dpr),
      face: renderDialFace(layout.dial.r, palette, stage.dpr),
    };
    draw();
  };
  const stage = useStageCanvas(canvas, rebuild);
  const wave = useStageCanvas(waveCanvas);

  const say = (message: string | null, tone: Hud['tone'] = null) => setHud((h) => ({ ...h, message, tone }));

  const turnBy = (delta: number) => {
    const s = game.current;
    if (!running || s.done) return;
    const crossed = turn(s, delta);
    fx.current.dirty = true;
    if (crossed.length === 0) return;
    const p = proximity(setup, s);
    // Klicken im Ton: lauter, je näher. Beim schnellen Drehen höchstens alle 30 ms.
    audio.playThrottled(MINIGAME_SOUNDS.click, 30, { volume: 0.1 + 0.9 * p });
    fx.current.spike = Math.min(1, fx.current.spike + 0.3 + p);
    if (onTarget(setup, s)) haptic('selection');
  };

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(safeScore(setup, game.current), [`cracked:${cracked(game.current)}`]);
  };

  const react = (result: ConfirmResult) => {
    const s = game.current;
    const f = fx.current;
    f.dirty = true;
    if (result === 'locked') {
      playSound(MINIGAME_SOUNDS.clunk);
      haptic('success');
      f.flash = 1;
      say(`Zahl ${s.step} sitzt. Jetzt nach ${requiredDir(s.step) > 0 ? 'rechts' : 'links'}.`, 'good');
    } else if (result === 'opened') {
      playSound(MINIGAME_SOUNDS.clunk);
      playSound(MINIGAME_SOUNDS.open, 0.9);
      haptic('success');
      f.flash = 1;
      f.openT = 0;
      f.endAt = f.t + 1.9;
      say('Offen.', 'good');
    } else if (result === 'miss' || result === 'wrongWay') {
      playSound(MINIGAME_SOUNDS.fail);
      haptic('error');
      f.shake = 1;
      setHud((h) => ({ ...h, penalty: h.penalty + 1 }));
      say(result === 'wrongWay' ? 'Falsche Richtung.' : 'Daneben.', 'bad');
      if (s.done) alarm();
    }
  };

  const alarm = () => {
    const f = fx.current;
    if (f.alarmT >= 0) return;
    f.alarmT = 0;
    f.endAt = f.t + 1.6;
    playSound(MINIGAME_SOUNDS.alarm, 0.8);
    haptic('warning');
    say('Zeit um. Alarm!', 'bad');
  };

  const tryConfirm = () => {
    if (!running || game.current.done) return;
    react(confirm(setup, game.current));
  };

  const keys = useGameKeys(
    KEYS,
    (press) => {
      const dir =
        press.code === 'ArrowLeft' || press.code === 'KeyA'
          ? -1
          : press.code === 'ArrowRight' || press.code === 'KeyD'
            ? 1
            : 0;
      if (dir !== 0) {
        turnBy(dir * (press.shift ? 0.5 : 1));
        fx.current.hold = { dir, since: fx.current.t };
      } else tryConfirm();
    },
    running,
  );

  function draw() {
    const st = stage.current;
    const ls = layers.current;
    if (!st || !ls) return;
    const { ctx, width, height } = st;
    const { layout } = ls;
    const s = game.current;
    const f = fx.current;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const shake = f.shake * (reduced ? 2 : 7);
    if (shake > 0.1) ctx.translate(Math.sin(f.t * 70) * shake, Math.cos(f.t * 53) * shake * 0.4);
    ctx.drawImage(ls.room, 0, 0, width, height);
    const { door, dial, lamps } = layout;
    const open = f.openT < 0 ? 0 : 1 - (1 - Math.min(1, f.openT)) ** 3;
    if (open > 0) drawLoot(ctx, layout, palette, open);
    ctx.save();
    if (open > 0) {
      // Tür schwingt um das Scharnier links auf (in der Draufsicht wird sie schmaler und dunkler).
      ctx.translate(door.x, 0);
      ctx.scale(1 - 0.88 * open, 1);
      ctx.translate(-door.x, 0);
    }
    ctx.drawImage(ls.door, 0, 0, width, height);
    // Lämpchen: geknackte Zahlen leuchten grün (Schein als zweiter, blasser Kreis; shadowBlur ist zu teuer).
    for (let i = 0; i < 3; i++) {
      const lit = i < cracked(s);
      const x = lamps.x + (i - 1) * lamps.gap;
      if (lit) {
        ctx.fillStyle = palette.money;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(x, lamps.y, lamps.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = lit ? palette.money : 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(x, lamps.y, lamps.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Zahlenschloss: dreht sich so, dass die aktuelle Zahl oben unter der Marke steht.
    const near = proximity(setup, s);
    const tremor = running && !s.done && near > 0.55 ? ((near - 0.55) / 0.45) * (reduced ? 0.4 : 1.6) : 0;
    const jx = tremor ? (Math.random() - 0.5) * tremor : 0;
    const jy = tremor ? (Math.random() - 0.5) * tremor : 0;
    ctx.save();
    ctx.translate(dial.x + jx, dial.y + jy);
    ctx.rotate((-s.pos / 100) * Math.PI * 2);
    const size = ls.face.width / st.dpr;
    ctx.drawImage(ls.face, -size / 2, -size / 2, size, size);
    ctx.restore();
    // Marke oben (gold).
    ctx.fillStyle = palette.gold;
    ctx.beginPath();
    ctx.moveTo(dial.x, dial.y - dial.r * 1.02);
    ctx.lineTo(dial.x - dial.r * 0.07, dial.y - dial.r * 1.18);
    ctx.lineTo(dial.x + dial.r * 0.07, dial.y - dial.r * 1.18);
    ctx.closePath();
    ctx.fill();
    if (f.flash > 0) {
      ctx.strokeStyle = palette.money;
      ctx.globalAlpha = f.flash;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(dial.x, dial.y, dial.r * (1.08 + (1 - f.flash) * 0.25), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Taschenlampe: warmer Lichtkegel, drumherum Dunkel (ein Verlauf). Folgt dem Zeiger, sonst aufs Schloss.
    const lx = f.light.x < 0 ? dial.x : f.light.x;
    const ly = f.light.y < 0 ? dial.y : f.light.y;
    const radius = Math.max(width, height) * 0.8;
    const cone = Math.min(0.9, (dial.r * 0.8) / radius);
    const light = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
    light.addColorStop(0, 'rgba(255, 236, 200, 0.1)');
    light.addColorStop(cone, 'rgba(0, 0, 0, 0)');
    light.addColorStop(Math.min(0.95, cone + 0.3), 'rgba(0, 0, 0, 0.5)');
    light.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
    ctx.fillStyle = light;
    ctx.fillRect(-20, -20, width + 40, height + 40);
    if (f.alarmT >= 0) {
      ctx.fillStyle = palette.danger;
      ctx.globalAlpha = 0.18 + 0.18 * Math.abs(Math.sin(f.alarmT * (reduced ? 3 : 9)));
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    f.dirty = false;
  }

  function drawScope() {
    const w = wave.current;
    const s = game.current;
    if (w)
      drawWave(
        w.ctx,
        w.width,
        w.height,
        fx.current.phase,
        running && !s.done ? proximity(setup, s) : 0,
        fx.current.spike,
        palette,
      );
  }

  useFrameLoop((rawDt) => {
    const s = game.current;
    const f = fx.current;
    // Zeitlupe am Ende: Die Tür schwingt langsam auf.
    const dt = f.openT >= 0 ? rawDt * 0.45 : rawDt;
    f.t += rawDt;
    if (!s.done && advance(setup, s, rawDt)) alarm();
    // Gehaltene Tasten bzw. Touch-Knöpfe drehen weiter.
    const heldDir =
      keys.isDown('ArrowLeft') || keys.isDown('KeyA') ? -1 : keys.isDown('ArrowRight') || keys.isDown('KeyD') ? 1 : 0;
    if (heldDir !== 0 && f.hold.dir === heldDir && f.t - f.hold.since > HOLD_DELAY) {
      turnBy(heldDir * (keys.shift() ? FINE_SPEED : HOLD_SPEED) * rawDt);
    }
    if (heldDir === 0) f.hold.dir = 0;
    if (f.touchDir !== 0 && f.t - f.hold.since > HOLD_DELAY) turnBy(f.touchDir * HOLD_SPEED * 0.7 * rawDt);
    // Herzschlag in den letzten zehn Sekunden.
    const left = timeLeft(setup, s);
    if (!s.done && left <= 10 && f.t - f.lastBeat >= (left <= 5 ? 0.6 : 1)) {
      f.lastBeat = f.t;
      playSound(MINIGAME_SOUNDS.heartbeat, 0.7);
    }
    f.shake = Math.max(0, f.shake - rawDt * 3);
    f.flash = Math.max(0, f.flash - rawDt * 1.6);
    f.spike = Math.max(0, f.spike - rawDt * 4);
    f.phase += dt;
    if (f.openT >= 0) f.openT += dt / 0.9;
    if (f.alarmT >= 0) f.alarmT += rawDt;
    // Licht folgt dem Zeiger, ohne Zeiger (oder nach einer Weile) geht es zurück aufs Schloss.
    const ls = layers.current;
    let moving = false;
    if (ls) {
      const { dial } = ls.layout;
      const recent = f.pointer && f.t - f.pointer.at < 2.5;
      const tx = recent && f.pointer ? f.pointer.x : dial.x;
      const ty = recent && f.pointer ? f.pointer.y : dial.y;
      const k = Math.min(1, rawDt * 6);
      const nx = f.light.x < 0 ? tx : f.light.x + (tx - f.light.x) * k;
      const ny = f.light.y < 0 ? ty : f.light.y + (ty - f.light.y) * k;
      moving = Math.abs(nx - f.light.x) + Math.abs(ny - f.light.y) > 0.3;
      f.light.x = nx;
      f.light.y = ny;
    }
    // Neu zeichnen nur, wenn sich etwas bewegt (Rad, Licht, Wackeln, Blitz, Tür, Alarm, Zittern nah am Ziel).
    const animating =
      f.shake > 0 || f.flash > 0 || (f.openT >= 0 && f.openT < 1.2) || f.alarmT >= 0 || proximity(setup, s) > 0.55;
    if (f.dirty || moving || animating) draw();
    drawScope();
    // HUD höchstens zehnmal pro Sekunde neu.
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      setHud((h) =>
        h.left === left && h.step === s.step && h.number === dialNumber(s.pos)
          ? h
          : { ...h, left, step: s.step, number: dialNumber(s.pos) },
      );
    }
    if (f.endAt >= 0 && f.t >= f.endAt) finish();
  }, running);

  // Ziehen am Rad: Winkel um die Mitte des Schlosses (die Lage misst nur das Ereignis, nie die Bildschleife).
  const center = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dial = layers.current?.layout.dial;
    return { x: rect.left + (dial?.x ?? rect.width / 2), y: rect.top + (dial?.y ?? rect.height / 2), rect };
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!running) return;
    const c = center(e);
    capture(e);
    drag.current = { angle: Math.atan2(e.clientY - c.y, e.clientX - c.x), cx: c.x, cy: c.y, id: e.pointerId };
    fx.current.pointer = { x: e.clientX - c.rect.left, y: e.clientY - c.rect.top, at: fx.current.t };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (e.pointerType === 'mouse' && running) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      fx.current.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top, at: fx.current.t };
    }
    if (!d || d.id !== e.pointerId) return;
    const angle = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
    let delta = angle - d.angle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    d.angle = angle;
    // Eine volle Umdrehung = 100 Striche, im Uhrzeigersinn = rechts.
    turnBy((delta / (Math.PI * 2)) * 100);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const s = game.current;
  const dir = requiredDir(Math.min(2, hud.step));
  return (
    <div class="safe">
      <canvas
        ref={canvas}
        class="safe__canvas"
        aria-label="Zahlenschloss: ziehen zum Drehen"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <HudBar class="safe__hud">
        <HudTimer seconds={hud.left} total={setup.duration} urgentAt={10} />
        <span class="safe__dots" role="img" aria-label={`${cracked(s)} von 3 Zahlen`}>
          {[0, 1, 2].map((i) => (
            <span key={i} class={`safe__dot${i < hud.step ? ' is-done' : i === hud.step ? ' is-now' : ''}`} />
          ))}
        </span>
        <span class={`safe__dir is-${dir > 0 ? 'right' : 'left'}`}>
          <Icon name={dir > 0 ? 'arrowRight' : 'arrowLeft'} />
          {dir > 0 ? 'rechts' : 'links'}
        </span>
        <span class="safe__number" role="img" aria-label={`Rad steht auf ${hud.number}`}>
          {String(hud.number).padStart(2, '0')}
        </span>
      </HudBar>
      <div class="safe__scope" aria-hidden="true">
        <span class="safe__scope-label">Stethoskop</span>
        <canvas ref={waveCanvas} class="safe__wave" />
      </div>
      {hud.message && (
        <p key={`${hud.message}${hud.penalty}`} class={`safe__message is-${hud.tone ?? 'info'}`} aria-live="polite">
          {hud.message}
          {hud.tone === 'bad' && hud.penalty > 0 && hud.message !== 'Zeit um. Alarm!' && (
            <span class="safe__penalty">−{setup.penalty} s</span>
          )}
        </p>
      )}
      <TouchControls
        pad="lr"
        onDirection={(d, pressed) => {
          const f = fx.current;
          const sign = d === 'left' ? -1 : 1;
          if (pressed) {
            turnBy(sign);
            f.touchDir = sign;
            f.hold.since = f.t;
          } else if (f.touchDir === sign) f.touchDir = 0;
        }}
        buttons={[
          {
            id: 'lock',
            label: 'Einrasten',
            icon: 'lock',
            tone: 'gold',
            wide: true,
            disabled: !running,
            onPress: tryConfirm,
          },
        ]}
      />
    </div>
  );
}
