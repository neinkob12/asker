// Blatt wie bei iOS (UISheetPresentationController): kommt von unten, rastet in Höhen ein (mittel = halber Bildschirm,
// groß = bis knapp unter die Statusleiste) und lässt sich am Griff ziehen: zwischen den Höhen wechseln, nach unten
// schließen. Bei der großen Höhe rückt die Seite dahinter nach hinten (verkleinert, oben gerundet). Bewegung per Feder
// (SPRINGS.sheet), beim Loslassen mit dem Schwung des Fingers. Esc, Tippen daneben und "Schließen" schließen auch.
//
//   const [open, setOpen] = useState(false);
//   <Sheet open={open} onClose={() => setOpen(false)} title="Bestellen" detents={['medium', 'large']}>…</Sheet>

import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { haptic } from '../haptics';
import { useOverlay } from '../overlays';
import { startDrag } from '../phone/drag';
import { rubberBand } from '../phone/gestureModel';
import { animateValue, type Motion } from '../phone/motion';
import { SPRINGS, Spring } from '../phone/spring';
import { Icon } from './Icon';
import { Portal } from './Portal';

export type SheetDetent = 'medium' | 'large';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  /** Rasterhöhen, Standard: mittel und groß. */
  detents?: readonly SheetDetent[];
  /** Höhe beim Öffnen, Standard: die erste. */
  initial?: SheetDetent;
  /** Rechts im Kopf, z.B. ein Knopf "Fertig". */
  action?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
}

/** Abstand der großen Höhe zum oberen Rand (unter der Statusleiste). */
const LARGE_TOP = 64;
/** Wie stark die Seite dahinter bei der großen Höhe zurückweicht. */
const RECEDE_SCALE = 0.07;
const RECEDE_RADIUS = 14;

interface Geometry {
  height: number;
  offsets: Record<SheetDetent | 'closed', number>;
}

function geometry(layer: HTMLElement): Geometry {
  const total = layer.clientHeight;
  const height = Math.max(200, total - LARGE_TOP);
  return { height, offsets: { large: 0, medium: Math.round(height - total * 0.5), closed: height + 24 } };
}

/** Nächste Rasthöhe für eine Lage (mit kurzem Blick voraus, wohin der Schwung trägt). */
function snapTarget(g: Geometry, detents: readonly SheetDetent[], y: number, velocity: number): SheetDetent | 'closed' {
  const projected = y + velocity * 0.18;
  const lowest = Math.max(...detents.map((d) => g.offsets[d]));
  if (projected > lowest + (g.height - lowest) * 0.35) return 'closed';
  let best: SheetDetent = detents[0];
  for (const d of detents) if (Math.abs(g.offsets[d] - projected) < Math.abs(g.offsets[best] - projected)) best = d;
  return best;
}

export function Sheet(props: SheetProps) {
  const detents = props.detents && props.detents.length > 0 ? props.detents : (['medium', 'large'] as const);
  const [mounted, setMounted] = useState(props.open);
  const [detent, setDetent] = useState<SheetDetent>(props.initial ?? detents[0]);
  const layer = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const spring = useRef(new Spring(SPRINGS.sheet));
  const motion = useRef<Motion | null>(null);
  const geo = useRef<Geometry | null>(null);
  const closing = useRef(false);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;

  useOverlay(props.open, props.onClose);

  /** Seite hinter dem Blatt (oben auf dem Stapel des Handys). */
  const behind = () => layer.current?.closest('.phone__screen')?.querySelector<HTMLElement>('.phone-page.is-top');

  const paint = (y: number) => {
    const g = geo.current;
    const el = sheet.current;
    if (!g || !el) return;
    el.style.transform = `translate3d(0,${y}px,0)`;
    // Abdunkeln nach sichtbarer Höhe, Zurückweichen der Seite nur zwischen mittel und groß.
    const shown = Math.min(1, Math.max(0, 1 - y / g.offsets.closed));
    if (backdrop.current) backdrop.current.style.opacity = String(0.42 * shown);
    const page = behind();
    if (page) {
      const r = detents.includes('large') ? Math.min(1, Math.max(0, 1 - y / Math.max(1, g.offsets.medium))) : 0;
      page.style.transformOrigin = '50% 0';
      page.style.transform = r > 0.001 ? `translate3d(0,${r * 12}px,0) scale(${1 - RECEDE_SCALE * r})` : '';
      page.style.clipPath = r > 0.001 ? `inset(0 round ${RECEDE_RADIUS * r}px ${RECEDE_RADIUS * r}px 0 0)` : '';
    }
  };

  const moveTo = (target: SheetDetent | 'closed', velocity?: number) => {
    const g = geo.current;
    if (!g) return;
    motion.current?.stop();
    if (target !== 'closed' && target !== detent) {
      haptic('light');
      setDetent(target);
    }
    closing.current = target === 'closed';
    motion.current = animateValue({
      config: SPRINGS.sheet,
      from: spring.current.value,
      to: g.offsets[target],
      velocity,
      spring: spring.current,
      onFrame: paint,
      onRest: () => {
        if (target !== 'closed') return;
        const page = behind();
        if (page) {
          page.style.transform = '';
          page.style.clipPath = '';
          page.style.transformOrigin = '';
        }
        setMounted(false);
        closing.current = false;
      },
    }).motion;
  };

  // Öffnen und Schließen von außen
  useEffect(() => {
    if (props.open) {
      setMounted(true);
      setDetent(props.initial ?? detents[0]);
    } else if (mounted && !closing.current) moveTo('closed');
  }, [props.open]);

  // Nach dem Einhängen: von unten herein
  useLayoutEffect(() => {
    if (!mounted || !props.open || !layer.current) return;
    geo.current = geometry(layer.current);
    if (sheet.current) sheet.current.style.height = `${geo.current.height}px`;
    spring.current.jump(geo.current.offsets.closed);
    paint(geo.current.offsets.closed);
    moveTo(props.initial ?? detents[0]);
  }, [mounted]);

  useEffect(
    () => () => {
      motion.current?.stop();
      const page = behind();
      if (page) {
        page.style.transform = '';
        page.style.clipPath = '';
      }
    },
    [],
  );

  if (!mounted) return null;

  const grab = (e: PointerEvent) => {
    const g = geo.current;
    if (!g || e.button !== 0 || (e.target as Element).closest('button, a, input, select')) return;
    const start = spring.current.value;
    motion.current?.stop();
    startDrag(e, e.currentTarget as HTMLElement, {
      axis: 'y',
      onMove: ({ dy }) => {
        const y = start + dy;
        const value = y < 0 ? rubberBand(y, g.height) : y;
        spring.current.jump(value);
        paint(value);
      },
      onEnd: ({ vy }) => {
        const velocity = vy * 1000;
        const target = snapTarget(g, detents, spring.current.value, velocity);
        moveTo(target, velocity);
        if (target === 'closed') onClose.current();
      },
    });
  };

  const close = () => {
    moveTo('closed');
    onClose.current();
  };

  return (
    <Portal>
      <div class={`ui-sheet-layer ${props.class ?? ''}`} ref={layer} data-modal="">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape */}
        <div class="ui-sheet-backdrop" ref={backdrop} onClick={close} />
        <section
          class={`ui-sheet is-${detent}`}
          ref={sheet}
          role="dialog"
          aria-modal="true"
          aria-label={typeof props.title === 'string' ? props.title : 'Blatt'}
          style={{ height: geo.current ? `${geo.current.height}px` : undefined }}
        >
          <header class="ui-sheet__head" onPointerDown={grab}>
            <span class="ui-sheet__grabber" aria-hidden="true" />
            {props.title && <h2 class="ui-sheet__title">{props.title}</h2>}
            <div class="ui-sheet__actions">
              {props.action}
              <button type="button" class="ui-sheet__close" onClick={close} aria-label="Schließen">
                <Icon name="close" />
              </button>
            </div>
          </header>
          <div
            class="ui-sheet__body"
            style={{
              // Bei mittlerer Höhe liegt der untere Teil des Blatts außerhalb: so weit lässt sich zusätzlich scrollen.
              paddingBottom: geo.current
                ? `calc(${geo.current.offsets[detent] + 24}px + var(--phone-home-inset, 0px))`
                : undefined,
            }}
          >
            {props.children}
          </div>
        </section>
      </div>
    </Portal>
  );
}
