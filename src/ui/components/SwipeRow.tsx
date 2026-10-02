// Zeile mit Wisch-Aktionen wie in iOS Mail: nach links wischen legt Knöpfe frei (z.B. "Gelesen"), ganz durchwischen
// löst die erste Aktion aus (nur wenn fullSwipe erlaubt ist). Nur für Befehle, die es schon gibt; Gefährliches
// (Entlassen) nie per Wisch allein, sondern über ein ActionSheet. Es ist immer nur eine Zeile offen; Tippen schließt.
// Gesten sind Abkürzungen: Dieselben Aktionen müssen auch per Knopf oder Kontextmenü erreichbar sein.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { haptic } from '../haptics';
import { startDrag } from '../phone/drag';
import { FLING, rubberBand } from '../phone/gestureModel';
import { animateValue, type Motion } from '../phone/motion';
import { SPRINGS, Spring } from '../phone/spring';
import type { ChipColor } from './Icon';
import { Icon } from './Icon';
import type { IconName } from './icons';

export interface SwipeAction {
  label: string;
  onSelect: () => void;
  icon?: IconName | (string & {});
  /** Bedeutungsfarbe der Fläche (Standard 'system'). */
  color?: ChipColor;
}

export interface SwipeRowProps {
  actions: readonly SwipeAction[];
  /** Ganz durchwischen löst die erste Aktion aus. */
  fullSwipe?: boolean;
  children?: ComponentChildren;
  class?: string;
}

const ACTION_WIDTH = 78;
/** Die offene Zeile (es ist immer nur eine offen). */
let openRow: (() => void) | null = null;

export function SwipeRow(props: SwipeRowProps) {
  const row = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const spring = useRef(new Spring(SPRINGS.snap));
  const motion = useRef<Motion | null>(null);
  const [open, setOpen] = useState(false);
  const width = props.actions.length * ACTION_WIDTH;

  const paint = (x: number) => {
    if (content.current) content.current.style.transform = x === 0 ? '' : `translate3d(${x}px,0,0)`;
    row.current?.style.setProperty('--swipe-reveal', String(Math.min(1, -x / Math.max(1, width))));
  };
  const settle = (x: number, velocity?: number) => {
    motion.current?.stop();
    motion.current = animateValue({
      config: SPRINGS.snap,
      precision: 0.5,
      from: spring.current.value,
      to: x,
      velocity,
      spring: spring.current,
      onFrame: paint,
    }).motion;
    const isOpen = x !== 0;
    setOpen(isOpen);
    if (isOpen) {
      if (openRow && openRow !== closeThis) openRow();
      openRow = closeThis;
    } else if (openRow === closeThis) openRow = null;
  };
  // Dieselbe Funktion in jedem Bild (sonst hält "ist diese Zeile die offene?" nie und sie schließt sich selbst).
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const closeThis = useRef(() => settleRef.current(0)).current;
  useEffect(
    () => () => {
      motion.current?.stop();
      if (openRow === closeThis) openRow = null;
    },
    [],
  );

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || !row.current || props.actions.length === 0) return;
    const start = spring.current.value;
    const rowWidth = row.current.clientWidth;
    motion.current?.stop();
    startDrag(e, row.current, {
      axis: 'x',
      accept: (dx) => dx < 0 || start < 0,
      onMove: ({ dx }) => {
        const x = start + dx;
        // Nach rechts über die Ruhelage hinaus und (ohne fullSwipe) über die Knöpfe hinaus nur zäh
        let value = x;
        if (x > 0) value = rubberBand(x, rowWidth);
        else if (x < -width && !props.fullSwipe) value = -width + rubberBand(x + width, rowWidth);
        spring.current.jump(value);
        paint(value);
      },
      onEnd: ({ vx }) => {
        const x = spring.current.value;
        const velocity = vx * 1000;
        if (props.fullSwipe && props.actions[0] && (x < -rowWidth * 0.6 || (x < -width && vx < -FLING * 2))) {
          haptic('light');
          settle(0, velocity);
          props.actions[0].onSelect();
          return;
        }
        const reveal = x < -width / 2 || vx < -FLING;
        if (reveal && vx < FLING) haptic('selection');
        settle(reveal && vx < FLING ? -width : 0, velocity);
      },
    });
  };

  return (
    <div
      class={`ui-swipe ${open ? 'is-open' : ''} ${props.class ?? ''}`}
      ref={row}
      onPointerDown={(e) => down(e as unknown as PointerEvent)}
    >
      <div class="ui-swipe__actions" style={{ width: `${width}px` }} aria-hidden={open ? undefined : 'true'}>
        {props.actions.map((action) => (
          <button
            key={action.label}
            type="button"
            class={`ui-swipe__action ui-swipe__action--${action.color ?? 'system'}`}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              settle(0);
              action.onSelect();
            }}
          >
            {action.icon && <Icon name={action.icon} />}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      {/* Offene Zeile: Tippen auf den Inhalt schließt sie (statt ihn zu öffnen). */}
      <div
        class="ui-swipe__content"
        ref={content}
        onClickCapture={(e) => {
          if (!open) return;
          e.stopPropagation();
          e.preventDefault();
          settle(0);
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
