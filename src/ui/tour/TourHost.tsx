// Overlay und Box der Tour (Auftrag 46a): Alles ist ausgegraut (dunkles Glas), nur der Anker ist freigeschnitten,
// umrandet und leicht eingefärbt; daneben die Box mit Porträt, Text und „Weiter“ (am Handy-Bildschirm ein Blatt
// unten). Was gezeigt wird, kommt aus TourRunner.current(); hier passiert nur Messen, Zeichnen, Fokus und Ton.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio';
import { contactLook, contactVoice } from '../../core';
import { Avatar, Button, categoryOf, Icon, prefersReducedMotion } from '../components';
import { useRuntime } from '../hooks';
import { useIsMobile } from '../shell/layout';
import { TOUR_ATTRIBUTE, tourSelector } from './anchors';
import type { TourRunner, TourView } from './controller';
import { inflate, placeBox, type Rect, sameRect } from './placement';
import './tour.css';

/** So lange wartet ein Schritt auf seinen Anker, bevor die Box mittig ohne Umrandung erscheint. */
export const ANCHOR_WAIT_MS = 2000;
/** Rand des Ausschnitts um den Anker. */
const HOLE_PADDING = 6;
/** Rundung des Ausschnitts, wenn das Element keine hat. */
const FALLBACK_RADIUS = 12;
/** Ein Element, das verschwunden ist, wird höchstens so oft pro Sekunde neu gesucht. */
const REQUERY_MS = 120;

/** Sichtbar heißt: im Dokument, mit Fläche, nicht versteckt. */
function isVisible(el: Element): boolean {
  if (!el.isConnected || el.closest('[hidden], [inert]')) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Erstes sichtbares Element mit diesem Anker (und Schlüssel). */
function findAnchor(anchor: string, key?: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(tourSelector(anchor, key));
  for (const el of all) if (isVisible(el)) return el;
  return null;
}

function readRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

function readRadius(el: Element): number {
  const value = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
  return Number.isFinite(value) && value > 0 ? value : FALLBACK_RADIUS;
}

interface Tracked {
  rect: Rect | null;
  radius: number;
  /** Zwei Sekunden vorbei, kein Anker: Box mittig. */
  missing: boolean;
}

/**
 * Verfolgt das Anker-Element des Schritts Bild für Bild (das Handy federt, die Karte fliegt, das Fenster ändert sich)
 * und meldet nur Änderungen. Fehlt der Anker, wartet es bis ANCHOR_WAIT_MS und gibt dann „mittig“ zurück; taucht er
 * später doch auf, wandert der Ausschnitt zu ihm.
 */
function useAnchor(anchor: string | undefined, key: string | undefined, tick: number): Tracked {
  const [tracked, setTracked] = useState<Tracked>({ rect: null, radius: FALLBACK_RADIUS, missing: !anchor });
  useEffect(() => {
    if (!anchor) {
      setTracked({ rect: null, radius: FALLBACK_RADIUS, missing: true });
      return;
    }
    let element: HTMLElement | null = null;
    let lastQuery = 0;
    const started = performance.now();
    let frame = 0;
    let current: Tracked = { rect: null, radius: FALLBACK_RADIUS, missing: false };
    setTracked(current);
    const loop = () => {
      const now = performance.now();
      if (!element || !isVisible(element)) {
        if (now - lastQuery >= REQUERY_MS) {
          lastQuery = now;
          element = findAnchor(anchor, key);
        }
      }
      let next: Tracked;
      if (element && isVisible(element)) {
        next = { rect: readRect(element), radius: readRadius(element), missing: false };
      } else {
        next = { rect: null, radius: FALLBACK_RADIUS, missing: now - started >= ANCHOR_WAIT_MS };
      }
      if (!sameRect(next.rect, current.rect) || next.missing !== current.missing || next.radius !== current.radius) {
        current = next;
        setTracked(next);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [anchor, key, tick]);
  return tracked;
}

/** Vier unsichtbare Flächen um den Ausschnitt fangen Klicks ab; der Anker selbst bleibt frei. */
function Blockers(props: { hole: Rect | null }) {
  const { hole } = props;
  if (!hole) return <div class="tour-block" style={{ inset: 0 }} />;
  const right = hole.left + hole.width;
  const bottom = hole.top + hole.height;
  return (
    <>
      <div class="tour-block" style={{ left: 0, top: 0, right: 0, height: Math.max(0, hole.top) }} />
      <div class="tour-block" style={{ left: 0, top: bottom, right: 0, bottom: 0 }} />
      <div class="tour-block" style={{ left: 0, top: hole.top, width: Math.max(0, hole.left), height: hole.height }} />
      <div class="tour-block" style={{ left: right, top: hole.top, right: 0, height: hole.height }} />
    </>
  );
}

function Dots(props: { count: number; index: number }) {
  return (
    <span class="tour-dots" aria-label={`Schritt ${props.index + 1} von ${props.count}`} role="img">
      {Array.from({ length: props.count }, (_, i) => (
        <span key={i} class={`tour-dots__dot ${i === props.index ? 'is-on' : i < props.index ? 'is-done' : ''}`} />
      ))}
    </span>
  );
}

/** Ein Schritt: Ausschnitt, Blocker und Box. Neu montiert bei jedem Schritt (key), so stimmen Fokus und Ton. */
function TourStepView(props: { view: TourView; runner: TourRunner; mobile: boolean }) {
  const { view, runner, mobile } = props;
  const { step } = view;
  const tracked = useAnchor(step.anchor, step.anchorKey, view.tick);
  const box = useRef<HTMLDivElement>(null);
  const [, redraw] = useState(0);
  const hole = tracked.rect ? inflate(tracked.rect, HOLE_PADDING) : null;
  const tint = categoryOf(step.tint ?? 'brand');
  const look = step.speaker ? contactLook(step.speaker) : null;

  // Box platzieren: nach jedem Zeichnen, direkt am Element (kein Flackern durch einen zweiten Zustand).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (mobile) {
      el.style.left = '';
      el.style.top = '';
      el.removeAttribute('data-side');
      return;
    }
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pos = placeBox(hole, viewport, size, step.placement);
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
    el.setAttribute('data-side', pos.side);
    if (pos.arrow) {
      el.style.setProperty('--tour-arrow-x', `${pos.arrow.x}px`);
      el.style.setProperty('--tour-arrow-y', `${pos.arrow.y}px`);
    }
  });

  // Fenstergröße: Die Box muss neu geklemmt werden, auch wenn der Anker sich nicht bewegt.
  useEffect(() => {
    const onResize = () => redraw((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fokus auf die Box (Enter/Leertaste = Weiter, Vorlesen), ein kurzer Klick, und der Sprecher spricht.
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    audio.play('tap', { volume: 0.4 });
    let stop: (() => void) | null = null;
    if (step.speaker?.voice && audio.canSpeak) {
      const voice = contactVoice(step.speaker);
      const model = audio.voiceState(voice);
      // Ohne fertiges Modell (noch nicht geladen) bleibt es still: keine Wartezeit in der Tour. Ohne Sprachmodell im
      // Browser (null) spricht die Notlösung des Browsers sofort.
      if (model === null || model.kind === 'ready') stop = audio.speak(step.text, voice, () => {});
    }
    return () => stop?.();
  }, [view.tick]);

  // Tastatur-Fokus bleibt in der Box (bzw. am Anker, wenn der Spieler dort etwas tun soll).
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !box.current || box.current.contains(target)) return;
      if (view.manual && step.anchor && target.closest(`[${TOUR_ATTRIBUTE}]`)) return;
      box.current.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [view.manual, step.anchor]);

  const reduced = prefersReducedMotion();
  const ringStyle = hole
    ? {
        left: `${hole.left}px`,
        top: `${hole.top}px`,
        width: `${hole.width}px`,
        height: `${hole.height}px`,
        borderRadius: `${tracked.radius + HOLE_PADDING}px`,
      }
    : undefined;
  const classes = ['tour', mobile ? 'tour--mobile' : 'tour--desktop'];
  if (reduced) classes.push('tour--still');
  if (!hole) classes.push('tour--no-anchor');
  return (
    <div class={classes.join(' ')} style={{ '--tour-tint': `var(--cat-${tint})` }}>
      {/* Blocker: bei Weiter überall (auch über dem Anker), sonst alles außer dem Anker. */}
      <Blockers hole={view.manual ? hole : null} />
      {hole ? (
        <div class="tour-ring" style={ringStyle} aria-hidden="true" />
      ) : (
        <div class="tour-dim" aria-hidden="true" />
      )}
      <div
        ref={box}
        class={`tour-box ${step.speaker ? 'has-speaker' : ''}`}
        role="dialog"
        aria-label={step.title ?? (step.speaker ? `${step.speaker.name} erklärt` : 'Erklärung')}
        tabIndex={-1}
      >
        {!mobile && hole && <span class="tour-box__arrow" aria-hidden="true" />}
        <div class="tour-box__body">
          {step.speaker && (
            <span class="tour-box__avatar">
              <Avatar name={step.speaker.name} look={look} tone="brand" size="md" />
            </span>
          )}
          <div class="tour-box__text">
            {(step.speaker || step.title) && <span class="tour-box__kicker">{step.title ?? step.speaker?.name}</span>}
            <p class="tour-box__line" aria-live="polite">
              {step.text}
            </p>
          </div>
        </div>
        <div class="tour-box__foot">
          <span class="tour-box__progress">
            <Dots count={view.def.steps.length} index={view.index} />
            {view.def.skippable && (
              <button type="button" class="tour-box__skip" onClick={() => runner.skip()}>
                Überspringen
              </button>
            )}
          </span>
          {view.manual ? (
            <span class="tour-box__do">
              <Icon name="arrowRight" />
              Mach das jetzt
            </span>
          ) : (
            <Button variant="primary" class="tour-box__next" onClick={() => runner.next()}>
              Weiter
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Zeigt die laufende Tour (TourRunner der UiRuntime). Ohne Tour nichts. */
export function TourHost() {
  const runtime = useRuntime();
  const runner = runtime.tours;
  const [, redraw] = useState(0);
  useEffect(() => runner.subscribe(() => redraw((n) => n + 1)), [runner]);
  const mobile = useIsMobile();
  const view = runner.current();
  if (!view) return null;
  return (
    <TourStepView key={`${view.def.id}:${view.step.id}:${view.tick}`} view={view} runner={runner} mobile={mobile} />
  );
}
