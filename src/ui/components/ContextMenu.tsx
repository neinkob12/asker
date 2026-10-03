// Kontextmenü wie bei iOS: langer Druck (ca. 500 ms) auf eine App-Kachel, einen Chat, eine Person oder eine Spot-Zeile
// hebt sie als Vorschau heraus, der Hintergrund wird weichgezeichnet, darunter (oder darüber) stehen die Aktionen auf
// Glas. Am Desktop öffnet zusätzlich der Rechtsklick, per Tastatur die Kontextmenü-Taste oder Umschalt+F10. Esc und
// Tippen daneben schließen. Gefährliches gehört nicht direkt ins Menü, sondern über ein ActionSheet bestätigt.
//
//   <ContextMenu label="Aktionen für Dragan" actions={[{ label: 'Akte öffnen', icon: 'idCard', onSelect: open }]}>
//     <button …>Dragan</button>
//   </ContextMenu>

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { haptic } from '../haptics';
import { useOverlay } from '../overlays';
import { swallowClickAfterRelease } from '../phone/drag';
import { LONG_PRESS_MS, SLOP } from '../phone/gestureModel';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Portal } from './Portal';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  icon?: IconName | (string & {});
  /** Rot (z.B. "Löschen"). Wirklich Gefährliches erst über ein ActionSheet bestätigen. */
  destructive?: boolean;
  disabled?: boolean;
}

export interface ContextMenuProps {
  /** Name für Screenreader, z.B. "Aktionen für Dragan". */
  label: string;
  /** Aktionen, oder eine Funktion, die sie erst beim Öffnen liefert (spart Arbeit bei jedem Neuzeichnen). */
  actions: readonly MenuAction[] | (() => readonly MenuAction[]);
  /** Vorschau oben im Menü. Standard: der Inhalt selbst. */
  preview?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
  disabled?: boolean;
}

interface Placement {
  preview: { top: number; left: number; width: number; height: number };
  menu: { top: number; left: number; width: number; above: boolean };
}

const MARGIN = 12;
const ROW = 46;
const GAP = 10;
const MENU_WIDTH = 250;

/** Vorschau an ihrer Stelle, das Menü darunter; passt es nicht, darüber oder die Vorschau rückt nach oben. */
function place(trigger: DOMRect, host: DOMRect, rows: number): Placement {
  const width = Math.min(trigger.width, host.width - MARGIN * 2);
  const left = Math.min(Math.max(trigger.left - host.left, MARGIN), host.width - MARGIN - width);
  const height = Math.min(trigger.height, host.height * 0.45);
  let top = trigger.top - host.top;
  const menuHeight = rows * ROW + 12;
  const menuWidth = Math.min(MENU_WIDTH, host.width - MARGIN * 2);
  const menuLeft = Math.min(Math.max(left, MARGIN), host.width - MARGIN - menuWidth);
  const safeTop = 60;
  const safeBottom = host.height - 40;
  if (top + height + GAP + menuHeight <= safeBottom) {
    top = Math.max(top, safeTop);
    return {
      preview: { top, left, width, height },
      menu: { top: top + height + GAP, left: menuLeft, width: menuWidth, above: false },
    };
  }
  if (top - GAP - menuHeight >= safeTop) {
    return {
      preview: { top, left, width, height },
      menu: { top: top - GAP - menuHeight, left: menuLeft, width: menuWidth, above: true },
    };
  }
  top = Math.max(safeTop, safeBottom - menuHeight - GAP - height);
  return {
    preview: { top, left, width, height },
    menu: { top: top + height + GAP, left: menuLeft, width: menuWidth, above: false },
  };
}

export function ContextMenu(props: ContextMenuProps) {
  const [open, setOpen] = useState<Placement | null>(null);
  const actionsNow = (): readonly MenuAction[] =>
    typeof props.actions === 'function' ? props.actions() : props.actions;
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const menu = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(null);
    wrap.current?.querySelector<HTMLElement>('button, [tabindex]')?.focus({ preventScroll: true });
  };
  useOverlay(open !== null, close);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (open)
      menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [open !== null]);

  const show = () => {
    const el = wrap.current;
    const host = el?.closest('.phone__screen');
    const count = el && !props.disabled ? actionsNow().length : 0;
    if (!el || count === 0) return;
    const hostRect = (host ?? document.body).getBoundingClientRect();
    // Die Hülle hat selbst keinen Kasten (display: contents): gemessen wird ihr Inhalt.
    const target = el.firstElementChild ?? el;
    setOpen(place(target.getBoundingClientRect(), hostRect, count));
  };

  // Langer Druck: nach LONG_PRESS_MS ohne nennenswerte Bewegung. Der Klick beim Loslassen wird verschluckt.
  const down = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (props.disabled || e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    const id = e.pointerId;
    const cancel = () => {
      clearTimeout(timer.current);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', cancel, true);
      window.removeEventListener('pointercancel', cancel, true);
    };
    const move = (m: PointerEvent) => {
      if (m.pointerId === id && Math.hypot(m.clientX - x, m.clientY - y) > SLOP) cancel();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', cancel, true);
    window.addEventListener('pointercancel', cancel, true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      cancel();
      haptic('medium');
      show();
      swallowClickAfterRelease(id);
    }, LONG_PRESS_MS);
  };

  const keys = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      show();
    }
  };

  const menuKeys = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    next?.focus();
  };

  return (
    // Hülle ohne eigenen Kasten (role="none"), reagiert auf ihren Inhalt: langer Druck, Rechtsklick, Kontextmenü-Taste
    <div
      class={`ui-ctx ${props.class ?? ''} ${open ? 'is-open' : ''}`}
      role="none"
      ref={wrap}
      onPointerDown={down}
      onContextMenu={(e) => {
        if (props.disabled) return;
        e.preventDefault();
        show();
      }}
      onKeyDown={keys}
    >
      {props.children}
      {open && (
        <Portal>
          <div class="ui-ctx-layer" data-modal="">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape */}
            <div class="ui-ctx-backdrop" onClick={close} />
            <div
              class="ui-ctx-preview"
              aria-hidden="true"
              inert
              style={{
                top: `${open.preview.top}px`,
                left: `${open.preview.left}px`,
                // Ohne eigene Vorschau genau so breit wie das Gedrückte, sonst so breit wie der Inhalt.
                width: props.preview ? undefined : `${open.preview.width}px`,
                minWidth: props.preview ? `${open.preview.width}px` : undefined,
                maxHeight: `${open.preview.height}px`,
              }}
            >
              {props.preview ?? props.children}
            </div>
            <div
              class={`ui-ctx-menu ${open.menu.above ? 'is-above' : ''}`}
              ref={menu}
              role="menu"
              aria-label={props.label}
              onKeyDown={menuKeys}
              style={{ top: `${open.menu.top}px`, left: `${open.menu.left}px`, width: `${open.menu.width}px` }}
            >
              {actionsNow().map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  class={`ui-ctx-menu__item ${action.destructive ? 'is-destructive' : ''}`}
                  disabled={action.disabled}
                  onClick={() => {
                    setOpen(null);
                    haptic('selection');
                    action.onSelect();
                  }}
                >
                  <span>{action.label}</span>
                  {action.icon && <Icon name={action.icon} />}
                </button>
              ))}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
