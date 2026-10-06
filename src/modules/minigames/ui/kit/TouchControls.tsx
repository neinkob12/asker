// Bedienung mit dem Finger für Minispiele: Steuerkreuz bzw. links/rechts, Aktionsknöpfe (mindestens 56 px) und
// Wischgesten. Knöpfe melden Drücken und Loslassen (für Gas halten o. ä.), mit kurzer Vibration (haptic, nie pro Bild).

import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { haptic, Icon } from '../../../../ui';

export type TouchTone = 'gold' | 'danger' | 'money' | 'place' | 'plain';

export interface TouchButton {
  id: string;
  label: string;
  icon?: string;
  tone?: TouchTone;
  /** Breiter Knopf (z.B. „Einrasten“). */
  wide?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onRelease?: () => void;
}

export type TouchDirection = 'left' | 'right' | 'up' | 'down';

const DIRECTION_ICONS: Record<TouchDirection, string> = {
  left: 'chevronLeft',
  right: 'chevronRight',
  up: 'chevronUp',
  down: 'chevronDown',
};

const DIRECTION_LABELS: Record<TouchDirection, string> = {
  left: 'Links',
  right: 'Rechts',
  up: 'Hoch',
  down: 'Runter',
};

/** Zeiger festhalten (Loslassen kommt dann auch außerhalb des Knopfs an); geht das nicht, ohne. */
export function capture(e: PointerEvent): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  } catch {
    // Kein aktiver Zeiger mit dieser ID (z.B. ein künstliches Ereignis): dann eben ohne Festhalten.
  }
}

function PadButton(props: {
  label: string;
  icon?: string;
  tone?: TouchTone;
  wide?: boolean;
  disabled?: boolean;
  class?: string;
  onPress: () => void;
  onRelease?: () => void;
  children?: ComponentChildren;
}) {
  const down = useRef(false);
  const release = () => {
    if (!down.current) return;
    down.current = false;
    props.onRelease?.();
  };
  return (
    <button
      type="button"
      class={`mg-pad ${props.wide ? 'mg-pad--wide' : ''} is-${props.tone ?? 'plain'} ${props.class ?? ''}`}
      aria-label={props.label}
      disabled={props.disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        capture(e);
        down.current = true;
        haptic('light');
        props.onPress();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      // Tastatur und Screenreader: Klick ohne Zeiger (detail 0) löst auch aus.
      onClick={(e) => {
        if ((e as MouseEvent).detail === 0) {
          props.onPress();
          props.onRelease?.();
        }
      }}
    >
      {props.icon && <Icon name={props.icon} />}
      {props.children ?? <span class="mg-pad__label">{props.label}</span>}
    </button>
  );
}

export interface TouchControlsProps {
  /** Richtungen links (Steuerkreuz): 'lr' nur links/rechts, 'full' alle vier, fehlt = keins. */
  pad?: 'lr' | 'full';
  onDirection?: (dir: TouchDirection, pressed: boolean) => void;
  /** Aktionsknöpfe rechts. */
  buttons?: readonly TouchButton[];
  class?: string;
}

/** Leiste unten: Steuerkreuz links, Aktionsknöpfe rechts. Am Desktop blendet das CSS sie nicht aus (Maus geht auch). */
export function TouchControls(props: TouchControlsProps) {
  const dirs: TouchDirection[] = props.pad === 'full' ? ['left', 'up', 'down', 'right'] : ['left', 'right'];
  return (
    <div class={`mg-touch ${props.class ?? ''}`}>
      {props.pad && (
        <div class={`mg-touch__pad mg-touch__pad--${props.pad}`}>
          {dirs.map((dir) => (
            <PadButton
              key={dir}
              label={DIRECTION_LABELS[dir]}
              icon={DIRECTION_ICONS[dir]}
              class={`mg-pad--${dir}`}
              onPress={() => props.onDirection?.(dir, true)}
              onRelease={() => props.onDirection?.(dir, false)}
            >
              <span class="mg-sr">{DIRECTION_LABELS[dir]}</span>
            </PadButton>
          ))}
        </div>
      )}
      <div class="mg-touch__buttons">
        {(props.buttons ?? []).map((b) => (
          <PadButton
            key={b.id}
            label={b.label}
            icon={b.icon}
            tone={b.tone}
            wide={b.wide}
            disabled={b.disabled}
            onPress={b.onPress}
            onRelease={b.onRelease}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Wischgesten auf einem Element: ab 40 px in eine Richtung (die längere Achse zählt). Ziehen, das ein Spiel selbst
 * auswertet (z.B. Drehen am Tresor), braucht das nicht.
 */
export function useSwipe(ref: RefObject<HTMLElement>, onSwipe: (dir: TouchDirection) => void, enabled = true): void {
  const latest = useRef(onSwipe);
  latest.current = onSwipe;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let start: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const up = (e: PointerEvent) => {
      if (!start || start.id !== e.pointerId) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      haptic('light');
      if (Math.abs(dx) > Math.abs(dy)) latest.current(dx > 0 ? 'right' : 'left');
      else latest.current(dy > 0 ? 'down' : 'up');
    };
    const cancel = () => {
      start = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [ref, enabled]);
}
