// Mitteilungszentrale wie bei iOS: zieht man ein Banner (oder die Statusleiste) herunter, gleitet von oben eine
// Glasfläche mit allen Mitteilungen herein, neueste zuerst. Tippen öffnet die App an der richtigen Stelle, "Alle löschen"
// leert die Liste. Hochwischen, Esc oder Tippen auf den Griff schließen. Darstellung ohne Spielzustand: Was gezeigt
// wird, gibt das Handy hinein (PhoneFrame.tsx).

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useOverlay } from '../overlays';
import { startDrag } from '../phone/drag';
import { FLING, rubberBand } from '../phone/gestureModel';
import { animateValue, type Motion } from '../phone/motion';
import { SPRINGS, Spring } from '../phone/spring';
import { Button } from './Button';
import { type ChipColor, IconChip } from './Icon';

export interface NotificationItem {
  id: number;
  title: string;
  text: string;
  icon?: string;
  /** Kachel in der Farbe der App. */
  color?: ChipColor;
  style?: JSX.CSSProperties;
  /** Zeit als Text, z.B. "14:05". */
  time?: string;
}

export interface NotificationCenterProps {
  open: boolean;
  items: readonly NotificationItem[];
  onOpen: (item: NotificationItem) => void;
  onClear: () => void;
  onClose: () => void;
  /** Kopfzeile, z.B. Wochentag und Spieltag. */
  heading?: string;
}

export function NotificationCenter(props: NotificationCenterProps) {
  const [mounted, setMounted] = useState(props.open);
  const panel = useRef<HTMLDivElement>(null);
  const spring = useRef(new Spring(SPRINGS.sheet, 1));
  const motion = useRef<Motion | null>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;

  useOverlay(props.open, props.onClose);

  /** Lage 0 = ganz da, 1 = oben draußen. */
  const paint = (t: number) => {
    if (panel.current) panel.current.style.transform = t <= 0 ? '' : `translate3d(0,${-t * 100}%,0)`;
  };
  const slide = (to: number, velocity?: number, done?: () => void) => {
    motion.current?.stop();
    motion.current = animateValue({
      config: SPRINGS.sheet,
      from: spring.current.value,
      to,
      velocity,
      spring: spring.current,
      onFrame: paint,
      onRest: done,
    }).motion;
  };

  useEffect(() => {
    if (props.open) setMounted(true);
    else if (mounted) slide(1, undefined, () => setMounted(false));
  }, [props.open]);
  useLayoutEffect(() => {
    if (!mounted || !props.open) return;
    spring.current.jump(1);
    paint(1);
    slide(0);
  }, [mounted]);
  useEffect(() => () => motion.current?.stop(), []);

  if (!mounted) return null;

  // Hochwischen schließt (die Fläche folgt dem Finger, nach unten nur zäh)
  const drag = (e: PointerEvent) => {
    const el = panel.current;
    if (!el || e.button !== 0 || (e.target as Element).closest('button')) return;
    const height = el.clientHeight || 1;
    motion.current?.stop();
    startDrag(e, el, {
      axis: 'y',
      onMove: ({ dy }) => {
        const t = dy < 0 ? -dy / height : -rubberBand(dy, height) / height;
        spring.current.jump(t);
        paint(t);
      },
      onEnd: ({ dy, vy }) => {
        const close = dy < -height * 0.25 || vy < -FLING;
        slide(close ? 1 : 0, (-vy * 1000) / height);
        if (close) onClose.current();
      },
    });
  };

  return (
    <div
      class="ui-center"
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Mitteilungszentrale"
      data-modal=""
      onPointerDown={(e) => drag(e as unknown as PointerEvent)}
    >
      <header class="ui-center__head">
        <div>
          <h2 class="ui-center__title">Mitteilungen</h2>
          {props.heading && <p class="ui-center__sub">{props.heading}</p>}
        </div>
        {props.items.length > 0 && (
          <Button small variant="subtle" onClick={props.onClear}>
            Alle löschen
          </Button>
        )}
      </header>
      {props.items.length === 0 ? (
        <p class="ui-center__empty">Keine Mitteilungen</p>
      ) : (
        <ul class="ui-center__list">
          {props.items.map((item) => (
            <li key={item.id}>
              <button type="button" class="ui-center__item" onClick={() => props.onOpen(item)}>
                <IconChip
                  icon={item.icon ?? 'bell'}
                  color={item.color ?? 'chat'}
                  style={item.style}
                  size="lg"
                  shape="tile"
                  solid
                />
                <span class="ui-center__text">
                  <span class="ui-center__top">
                    <span class="ui-center__name">{item.title}</span>
                    {item.time && <span class="ui-center__time">{item.time}</span>}
                  </span>
                  <span class="ui-center__body">{item.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="ui-center__grabber" onClick={props.onClose} aria-label="Mitteilungen schließen">
        <span />
      </button>
    </div>
  );
}
