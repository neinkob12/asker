// Verkehrskontrolle (Feedback vom 07.10.2026): „Verstecken und Nerven“. Blick von oben ins Auto (Canvas, draw.ts), der
// Beamte geht mit der Taschenlampe ums Auto; du bringst die Pakete rechtzeitig in Stellen, in die er nicht leuchtet
// (antippen und Stelle wählen, ziehen, oder Tastatur: ←/→ Paket, 1 bis 7 Stelle), und hältst den Puls im Takt ruhig
// (Leertaste bzw. Herz). Jederzeit „Gas geben“ (G, flee) und „Schein zustecken“ (B, bribe). Spiellogik in model.ts,
// Sätze in lines.ts.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatEuro, type MouthStyle, wallet } from '../../../../../core';
import { audio, haptic, Icon, prefersReducedMotion, useGame } from '../../../../../ui';
import { HudBar, HudMeter } from '../../kit/hud';
import { MINIGAME_SOUNDS, playSound } from '../../kit/sounds';
import { capture } from '../../kit/TouchControls';
import { useFrameLoop } from '../../kit/useFrameLoop';
import { useGameKeys } from '../../kit/useGameKeys';
import { useStageCanvas } from '../../kit/useStageCanvas';
import type { MinigameViewProps } from '../../registry';
import {
  drawScene,
  type Fx,
  officerTarget,
  readPalette,
  renderBackground,
  type TrafficLayout,
  toScene,
  trafficLayout,
  walkPoint,
  zoneScreen,
} from './draw';
import { LOOK_LINES, OFFICER_LINES } from './lines';
import {
  advance,
  beatPhase,
  bribe,
  createTraffic,
  flee,
  initTraffic,
  isDone,
  type Lines,
  litZone,
  MAX_FOUND,
  nextPacket,
  nextStop,
  packetAt,
  packetsIn,
  pendingZones,
  progress,
  type SendCheck,
  type Signal,
  send,
  type TrafficState,
  tap,
  trafficPicks,
  trafficScore,
  usedIn,
  type Zone3,
  type ZoneId,
  zoneAt,
  zoneById,
  zoneOfPulse,
} from './model';
import { Officer, officerLook } from './Officer';
import { TRAFFIC_SOUNDS } from './sounds';

const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Tab',
  'Space',
  'KeyG',
  'KeyB',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
];
/** Ab so vielen Pixeln Bewegung ist Antippen ein Ziehen. */
const DRAG_PX = 8;
/** Versteckte Stellen in der Reihenfolge der Tasten 1 bis 7. */
const HIDES: readonly ZoneId[] = ['glovebox', 'console', 'underDriver', 'doorL', 'doorR', 'trunk', 'spare'];
const ZONE_LABEL: Record<Zone3, string> = { green: 'ruhig', yellow: 'angespannt', red: 'zittrig' };
const REASONS: Record<Exclude<SendCheck, 'ok' | 'done'>, string> = {
  full: 'voll',
  tooBig: 'zu klein',
  seen: 'er guckt hin',
  busy: 'unterwegs',
  same: 'liegt da',
};

interface Hud {
  suspicion: number;
  found: number;
  progress: number;
  pulse: number;
  zone: Zone3;
  selected: number;
  line: { text: string; n: number } | null;
  mouth: MouthStyle;
  where: string;
  lit: ZoneId | null;
  pending: ZoneId[];
  message: { text: string; tone: 'good' | 'bad' | 'warn'; key: number } | null;
  done: boolean;
}

export function TrafficGame(props: MinigameViewProps) {
  const { challenge, running, onFinish } = props;
  const { state: gameState } = useGame();
  const night = challenge.params.phase !== 'day';
  const rain = challenge.params.weather === 'rain' || challenge.params.weather === 'storm';
  const setup = useMemo(
    () => createTraffic(challenge.seed, challenge.difficulty, { night }),
    [challenge.seed, challenge.difficulty, night],
  );
  const lines = useMemo<Lines>(
    () => ({
      greet: night ? OFFICER_LINES.greetNight : OFFICER_LINES.greetDay,
      walk: OFFICER_LINES.walk,
      found: OFFICER_LINES.found,
      fail: OFFICER_LINES.fail,
      nervous: OFFICER_LINES.nervous,
      pass: OFFICER_LINES.pass,
      look: LOOK_LINES,
    }),
    [night],
  );
  const game = useRef<TrafficState>(initTraffic(setup));
  const palette = useMemo(readPalette, []);
  const reduced = useMemo(prefersReducedMotion, []);
  const look = useMemo(() => officerLook(challenge.seed), [challenge.seed]);
  const bribeCost = Number(challenge.params.bribeCost) || 0;
  const canPay = bribeCost > 0 && (props.preview || wallet.canAfford(gameState, bribeCost, 'dirty'));
  const canvas = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<TrafficLayout | null>(null);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const [layout, setLayout] = useState<TrafficLayout | null>(null);
  const heart = useRef<HTMLButtonElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const fx = useRef<Fx & { lastHud: number; sent: boolean; endAt: number; mouth: MouthStyle; messageKey: number }>({
    t: 0,
    reduced,
    running: false,
    hover: null,
    reject: null,
    stowed: null,
    found: null,
    officer: { x: 14, y: 64 },
    rain,
    lastHud: -1,
    sent: false,
    endAt: -1,
    mouth: 'neutral',
    messageKey: 0,
  });
  const drag = useRef<{ id: number; pointer: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [hud, setHud] = useState<Hud>(() => snapshot(game.current, fx.current.mouth, null));

  function snapshot(s: TrafficState, mouth: MouthStyle, message: Hud['message']): Hud {
    const stop = s.stops[s.stopIndex];
    const next = nextStop(s);
    const where =
      s.phase === 'greet'
        ? 'Er steht am Fahrerfenster.'
        : s.phase === 'walk' && next
          ? `Er geht ${s.stops[s.stopIndex]?.label ?? ''} …`
          : s.phase === 'look' && stop
            ? `Er leuchtet ${stop.label}.`
            : '';
    return {
      suspicion: s.suspicion,
      found: s.found,
      progress: progress(s),
      pulse: s.pulse,
      zone: zoneOfPulse(s.pulse),
      selected: s.selected,
      line: s.line,
      mouth,
      where,
      lit: litZone(s),
      pending: pendingZones(s),
      message,
      done: s.phase === 'end',
    };
  }

  const refreshHud = (message?: Hud['message']) =>
    setHud((h) => snapshot(game.current, fx.current.mouth, message === undefined ? h.message : message));

  const say = (text: string, tone: 'good' | 'bad' | 'warn') => {
    fx.current.messageKey += 1;
    refreshHud({ text, tone, key: fx.current.messageKey });
  };

  const stage = useStageCanvas(canvas, (st) => {
    const l = trafficLayout(st.width, st.height);
    layoutRef.current = l;
    bg.current = renderBackground(l, setup, st.dpr);
    setLayout(l);
    draw();
  });

  function draw() {
    const st = stage.current;
    const l = layoutRef.current;
    if (!st || !l || !bg.current) return;
    fx.current.running = running;
    drawScene(st.ctx, l, palette, setup, game.current, bg.current, fx.current);
  }

  const finish = () => {
    const f = fx.current;
    if (f.sent) return;
    f.sent = true;
    onFinish(trafficScore(game.current), trafficPicks(game.current));
  };

  // ------------------------------------------------------------------ Eingaben
  const refuse = (check: SendCheck, zoneId: ZoneId) => {
    if (check === 'ok' || check === 'done') return;
    playSound(MINIGAME_SOUNDS.fail, 0.6);
    haptic('error');
    fx.current.reject = { id: zoneId, at: fx.current.t };
    const name = zoneById(zoneId).name;
    if (check === 'seen') say(`Nicht jetzt: Er leuchtet gerade hin.`, 'bad');
    else if (check === 'tooBig') say(`Zu groß für ${name}.`, 'bad');
    else if (check === 'full') say(`${name} ist voll.`, 'bad');
    else if (check === 'busy') say('Das Paket ist noch unterwegs.', 'warn');
    else if (check === 'same') say('Da liegt es schon.', 'warn');
  };

  const sendTo = (zoneId: ZoneId) => {
    const s = game.current;
    if (!running || s.phase === 'end') return;
    if (s.selected < 0) {
      say('Erst ein Paket antippen.', 'warn');
      return;
    }
    const check = send(setup, s, s.selected, zoneId);
    if (check === 'ok') {
      audio.play(TRAFFIC_SOUNDS.papers, { volume: 0.5 });
      haptic('selection');
      const next = nextPacket(s, 1);
      s.selected = next;
    } else refuse(check, zoneId);
    refreshHud();
  };

  const select = (dir: 1 | -1) => {
    const s = game.current;
    if (!running || s.phase === 'end') return;
    const next = nextPacket(s, dir);
    if (next >= 0) {
      s.selected = next;
      audio.playThrottled(MINIGAME_SOUNDS.click, 40, { volume: 0.4 });
      refreshHud();
    }
  };

  const onTap = () => {
    if (!running) return;
    const result = tap(game.current);
    if (result === 'calm') {
      audio.play(TRAFFIC_SOUNDS.calm, { volume: 0.5 });
      haptic('light');
    } else if (result === 'miss') {
      audio.play(TRAFFIC_SOUNDS.miss, { volume: 0.5 });
      haptic('warning');
    }
  };

  const onFlee = () => {
    if (!running || !flee(game.current, OFFICER_LINES.flee)) return;
    audio.play(TRAFFIC_SOUNDS.rev, { volume: 0.9 });
    haptic('medium');
    fx.current.mouth = 'hard';
    refreshHud();
  };

  const onBribe = () => {
    if (!running || !canPay) return;
    const result = bribe(game.current, {
      ok: OFFICER_LINES.bribeOk,
      low: OFFICER_LINES.bribeLow,
      high: OFFICER_LINES.bribeHigh,
    });
    if (result === 'ok') {
      playSound(MINIGAME_SOUNDS.clunk, 0.8);
      haptic('success');
      fx.current.mouth = 'smirk';
    } else if (result !== 'done') {
      playSound(MINIGAME_SOUNDS.fail, 0.7);
      haptic('error');
      fx.current.mouth = 'hard';
      say(
        result === 'low' ? 'Zu früh: Dafür ist er noch nicht sauer genug.' : 'Zu spät: Jetzt ist er richtig sauer.',
        'bad',
      );
    }
    refreshHud();
  };

  useGameKeys(
    KEYS,
    (press) => {
      const code = press.code;
      if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') select(-1);
      else if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') select(1);
      else if (code === 'Tab') select(press.shift ? -1 : 1);
      else if (code === 'Space') onTap();
      else if (code === 'KeyG') onFlee();
      else if (code === 'KeyB') onBribe();
      else {
        const n = Number(code.slice(-1)) - 1;
        const zone = HIDES[n];
        if (zone) sendTo(zone);
      }
    },
    running,
  );

  // Zeiger: Paket antippen (auswählen) oder ziehen; eine Stelle antippen schickt das ausgewählte dorthin.
  const point = (e: PointerEvent) => {
    const l = layoutRef.current;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return { px, py, ...(l ? toScene(l, px, py) : { x: -1, y: -1 }) };
  };
  const onPointerDown = (e: PointerEvent) => {
    const s = game.current;
    if (!running || s.phase === 'end') return;
    const pt = point(e);
    const id = packetAt(setup, s, pt.x, pt.y);
    if (id >= 0) {
      capture(e);
      s.selected = id;
      drag.current = { id, pointer: e.pointerId, sx: pt.px, sy: pt.py, moved: false };
      audio.playThrottled(MINIGAME_SOUNDS.click, 40, { volume: 0.4 });
      haptic('selection');
      refreshHud();
      return;
    }
    const zone = zoneAt(setup, pt.x, pt.y);
    if (zone && !zoneById(zone).open) sendTo(zone);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const pt = point(e);
    if (!d.moved && Math.hypot(pt.px - d.sx, pt.py - d.sy) > DRAG_PX) d.moved = true;
    if (!d.moved) return;
    const it = game.current.items[d.id];
    if (it && !it.moving) {
      it.x = pt.x;
      it.y = pt.y;
    }
    const zone = zoneAt(setup, pt.x, pt.y);
    fx.current.hover =
      zone && !zoneById(zone).open ? { id: zone, ok: ['ok', 'same'].includes(previewSend(d.id, zone)) } : null;
  };
  /** Prüft, ob send() klappen würde, ohne etwas zu bewegen. */
  const previewSend = (packetId: number, zoneId: ZoneId): SendCheck => {
    const s = game.current;
    const it = s.items[packetId];
    const packet = setup.packets[packetId];
    if (!it || it.found || it.moving) return 'busy';
    const lit = litZone(s);
    if (lit && (lit === zoneId || lit === it.zone)) return 'seen';
    const zone = zoneById(zoneId);
    if (packet.size > zone.maxSize) return 'tooBig';
    if (usedIn(setup, s, zoneId) + packet.size > zone.capacity) return 'full';
    return 'ok';
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    fx.current.hover = null;
    const s = game.current;
    const it = s.items[d.id];
    if (!d.moved || !it) {
      refreshHud();
      return;
    }
    const pt = point(e);
    const zone = zoneAt(setup, pt.x, pt.y);
    if (zone && !zoneById(zone).open) {
      // Zurück an den alten Platz, dann losschicken (die Reise beginnt dort).
      const home = it.zone ? zoneById(it.zone) : null;
      if (home) {
        const idx = Math.max(0, packetsIn(s, home.id).indexOf(d.id));
        void idx;
      }
      sendTo(zone);
    } else {
      // Fallen gelassen: zurück in die alte Stelle.
      say('Lass es nicht einfach liegen: in eine Stelle ziehen.', 'warn');
    }
    if (it.zone && !it.moving) {
      const home = zoneById(it.zone);
      it.x = Math.min(home.x + home.w - 3, Math.max(home.x + 3, it.x));
      it.y = Math.min(home.y + home.h - 3, Math.max(home.y + 3, it.y));
    }
    refreshHud();
  };

  // ------------------------------------------------------------------ Ton und Optik zu den Signalen
  const onSignals = (signals: Signal[]) => {
    const f = fx.current;
    const s = game.current;
    for (const sig of signals) {
      switch (sig) {
        case 'greet':
          audio.play(TRAFFIC_SOUNDS.knock, { volume: 0.7 });
          f.mouth = 'neutral';
          break;
        case 'look':
          audio.play(TRAFFIC_SOUNDS.flashlight, { volume: 0.5 });
          break;
        case 'walk':
          f.mouth = 'neutral';
          break;
        case 'found': {
          const lit = litZone(s);
          if (lit) f.found = { id: lit, at: f.t };
          playSound(MINIGAME_SOUNDS.fail, 0.9);
          haptic('error');
          f.mouth = 'hard';
          say('Gefunden! Das Paket ist weg.', 'bad');
          break;
        }
        case 'stowed':
          playSound(MINIGAME_SOUNDS.clunk, 0.35);
          break;
        case 'nervous':
          audio.play(TRAFFIC_SOUNDS.radio, { volume: 0.4 });
          f.mouth = 'smirk';
          say('Er sieht dich schwitzen: Er schaut noch einmal nach vorne.', 'warn');
          break;
        case 'pass':
          f.mouth = 'grin';
          f.endAt = f.t + 1.6;
          haptic('success');
          break;
        case 'fail':
          audio.play(TRAFFIC_SOUNDS.knock, { volume: 0.9 });
          f.mouth = 'hard';
          f.endAt = f.t + 2;
          break;
        default:
          break;
      }
    }
  };

  useFrameLoop((dt) => {
    const s = game.current;
    const f = fx.current;
    f.t += dt;
    if (!isDone(s)) onSignals(advance(setup, s, dt, lines));
    // Der Beamte: an der Station stehen, beim Gehen am Auto entlang.
    const target = officerTarget(s);
    if (s.phase === 'walk' && s.stopIndex > 0) {
      const from = s.stops[s.stopIndex - 1];
      const to = s.stops[s.stopIndex];
      const k = Math.min(1, s.phaseT / Math.max(0.01, s.phaseLen));
      const p = walkPoint(from, to, k);
      f.officer.x += (p.x - f.officer.x) * Math.min(1, 12 * dt);
      f.officer.y += (p.y - f.officer.y) * Math.min(1, 12 * dt);
    } else {
      f.officer.x += (target.x - f.officer.x) * Math.min(1, 6 * dt);
      f.officer.y += (target.y - f.officer.y) * Math.min(1, 6 * dt);
    }
    // Puls-Ring im Takt (direkt ins DOM).
    const phase = beatPhase(s);
    const r = ring.current;
    if (r) {
      const k = phase < 0.5 ? 1 - phase * 2 : (phase - 0.5) * 2;
      r.setAttribute('r', String(14 + 7 * k));
    }
    const h = heart.current;
    if (h) h.dataset.zone = zoneOfPulse(s.pulse);
    draw();
    if (f.t - f.lastHud > 0.1) {
      f.lastHud = f.t;
      refreshHud();
    }
    if (s.outcome === 'flee' && isDone(s)) finish();
    else if (s.outcome === 'bribe' && isDone(s)) finish();
    else if (f.endAt >= 0 && f.t >= f.endAt && isDone(s)) finish();
  }, running);

  // Erstes Bild hinter der Einleitung.
  useEffect(() => {
    draw();
  }, [running]);

  const s = game.current;
  const selected = hud.selected >= 0 ? setup.packets[hud.selected] : null;
  const zoneLabel = ZONE_LABEL[hud.zone];
  return (
    <div class={`traffic${layout?.narrow ? ' is-narrow' : ''}${hud.done ? ' is-done' : ''}`}>
      <canvas
        ref={canvas}
        class="traffic__canvas"
        role="img"
        aria-label="Auto von oben: Pakete in Stellen bringen, in die der Beamte nicht leuchtet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <HudBar class="traffic__hud">
        <HudMeter label="Misstrauen" value={hud.suspicion} color="danger" detail={Math.round(hud.suspicion * 100)} />
        <span class="traffic__found" role="img" aria-label={`${hud.found} von ${MAX_FOUND} Funden`}>
          <Icon name="eye" />
          {Array.from({ length: MAX_FOUND }, (_, i) => (
            <span key={i} class={`traffic__found-dot${i < hud.found ? ' is-hit' : ''}`} />
          ))}
        </span>
        <HudMeter label="Runde" value={hud.progress} color="law" detail={`${Math.round(hud.progress * 100)} %`} />
      </HudBar>

      <div class="traffic__officer-card" aria-live="polite">
        <div class="traffic__portrait">
          <Officer look={look} mouth={hud.mouth} />
        </div>
        <div class="traffic__speech">
          {hud.line && (
            <p key={hud.line.n} class="traffic__line">
              {hud.line.text}
            </p>
          )}
          <p class="traffic__where">{hud.where}</p>
        </div>
      </div>

      {layout &&
        setup.zones
          .filter((z) => !z.open)
          .map((z) => {
            const r = zoneScreen(layout, z);
            const n = HIDES.indexOf(z.id) + 1;
            const state = hud.lit === z.id ? 'is-lit' : hud.pending.includes(z.id) ? 'is-pending' : '';
            return (
              <span
                key={z.id}
                class={`traffic__label ${state}`}
                style={{ left: `${r.x + r.w / 2}px`, top: `${r.y}px` }}
                aria-hidden="true"
              >
                <kbd>{n}</kbd>
                {z.name}
              </span>
            );
          })}

      <aside class="traffic__panel" aria-label="Paket und Stellen">
        <div class="traffic__pick" aria-live="polite">
          {hud.done ? (
            <span class="traffic__pick-empty">{s.outcome === 'pass' ? '„Gute Fahrt.“' : 'Vorbei.'}</span>
          ) : selected ? (
            <>
              <span class={`traffic__swatch is-${selected.size}`} aria-hidden="true" />
              <span class="traffic__pick-text">
                <strong>{selected.label}</strong>
                <span class="traffic__chips">
                  <span class="traffic__chip">{selected.grams} g</span>
                  <span class="traffic__chip">{selected.size === 2 ? 'mittel' : 'klein'}</span>
                </span>
              </span>
            </>
          ) : (
            <span class="traffic__pick-empty">Alles verstaut. Jetzt ruhig bleiben.</span>
          )}
        </div>
        <div class="traffic__hides">
          {HIDES.map((id, i) => {
            const z = zoneById(id);
            const used = usedIn(setup, s, id);
            const check = selected && !hud.done ? previewSend(hud.selected, id) : null;
            const lit = hud.lit === id;
            const pending = hud.pending.includes(id);
            return (
              <button
                key={id}
                type="button"
                class={`traffic__hide${check === 'ok' ? ' is-ok' : ''}${lit ? ' is-lit' : pending ? ' is-pending' : ''}`}
                disabled={!running || hud.done}
                onClick={() => sendTo(id)}
              >
                <kbd>{i + 1}</kbd>
                <span class="traffic__hide-name">{z.name}</span>
                <span class="traffic__hide-meta">
                  {lit ? (
                    <span class="traffic__chip is-bad">Licht!</span>
                  ) : check && check !== 'ok' ? (
                    <span class="traffic__chip is-bad">{REASONS[check as keyof typeof REASONS] ?? check}</span>
                  ) : (
                    <>
                      <span class="traffic__chip">
                        {used}/{z.capacity}
                      </span>
                      {z.maxSize === 1 && <span class="traffic__chip">nur klein</span>}
                      {pending && <span class="traffic__chip is-warn">gleich</span>}
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div class="traffic__bottom">
        <button
          ref={heart}
          type="button"
          class="traffic__heart"
          data-zone={hud.zone}
          disabled={!running || hud.done}
          onPointerDown={(e) => {
            e.preventDefault();
            onTap();
          }}
          onClick={(e) => {
            if ((e as MouseEvent).detail === 0) onTap();
          }}
          aria-label={`Puls ${Math.round(hud.pulse)}, ${zoneLabel}. Im Takt tippen.`}
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle ref={ring} class="traffic__heart-ring" cx="24" cy="24" r="16" />
            <circle class="traffic__heart-core" cx="24" cy="24" r="14" />
          </svg>
          <Icon name="heart" class="traffic__heart-icon" />
        </button>
        <span class="traffic__pulse">
          <strong>{Math.round(hud.pulse)}</strong>
          <span class="traffic__pulse-zone">{zoneLabel}</span>
        </span>
        <div class="traffic__actions">
          <button type="button" class="mg-pad is-danger" disabled={!running || hud.done} onClick={onFlee}>
            <Icon name="car" />
            <span>Gas geben</span>
            <kbd>G</kbd>
          </button>
          <button
            type="button"
            class="mg-pad is-money"
            disabled={!running || hud.done || !canPay}
            onClick={onBribe}
            title={canPay ? '' : 'Dafür fehlt das Schwarzgeld.'}
          >
            <Icon name="cash" />
            <span>Schein{bribeCost > 0 ? ` · ${formatEuro(bribeCost)}` : ''}</span>
            <kbd>B</kbd>
          </button>
        </div>
      </div>

      {hud.message && (
        <p key={hud.message.key} class={`traffic__message is-${hud.message.tone}`} role="status">
          {hud.message.text}
        </p>
      )}
    </div>
  );
}
