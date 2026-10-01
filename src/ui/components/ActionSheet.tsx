// Aktionsblatt wie bei iOS (UIAlertController, Stil Action Sheet): zum Bestätigen und für kurze Auswahlen. Oben eine
// Gruppe mit Titel, Erklärung und Aktionen (gefährliche in Rot), darunter getrennt "Abbrechen". Gefährliches (Entlassen,
// Überfallen) wird nie per Wisch allein ausgelöst, sondern hier bestätigt. Esc, Tippen daneben und Abbrechen schließen.
//
//   <ActionSheet open={confirm} onClose={() => setConfirm(false)} title="Dragan entlassen?"
//     message="Er geht sofort und kommt nicht wieder."
//     actions={[{ label: 'Entlassen', destructive: true, onSelect: fire }]} />

import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useOverlay } from '../overlays';
import { animateValue, type Motion } from '../phone/motion';
import { SPRINGS, Spring } from '../phone/spring';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Portal } from './Portal';

export interface SheetAction {
  label: string;
  onSelect: () => void;
  /** Gefährlich (rot), z.B. Entlassen. */
  destructive?: boolean;
  disabled?: boolean;
  icon?: IconName | (string & {});
}

export interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  message?: ComponentChildren;
  actions: readonly SheetAction[];
  /** Beschriftung des Abbrechen-Knopfs. */
  cancelLabel?: string;
}

export function ActionSheet(props: ActionSheetProps) {
  const [mounted, setMounted] = useState(props.open);
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const spring = useRef(new Spring(SPRINGS.sheet, 1));
  const motion = useRef<Motion | null>(null);
  const first = useRef<HTMLButtonElement>(null);

  useOverlay(props.open, props.onClose);

  /** Lage 0 = sichtbar, 1 = unten draußen. */
  const paint = (t: number) => {
    if (panel.current) panel.current.style.transform = `translate3d(0,${t * 110}%,0)`;
    if (backdrop.current) backdrop.current.style.opacity = String(Math.min(1, Math.max(0, 1 - t)) * 0.42);
  };
  const slide = (to: number, done?: () => void) => {
    motion.current?.stop();
    motion.current = animateValue({
      config: SPRINGS.sheet,
      from: spring.current.value,
      to,
      spring: spring.current,
      onFrame: paint,
      onRest: done,
    }).motion;
  };

  useEffect(() => {
    if (props.open) setMounted(true);
    else if (mounted) slide(1, () => setMounted(false));
  }, [props.open]);

  useLayoutEffect(() => {
    if (!mounted || !props.open) return;
    spring.current.jump(1);
    paint(1);
    slide(0);
    first.current?.focus({ preventScroll: true });
  }, [mounted]);

  useEffect(() => () => motion.current?.stop(), []);

  if (!mounted) return null;
  const choose = (action: SheetAction) => {
    props.onClose();
    action.onSelect();
  };
  const firstEnabled = props.actions.findIndex((a) => !a.disabled);
  return (
    <Portal>
      <div class="ui-action-layer" data-modal="">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape */}
        <div class="ui-sheet-backdrop" ref={backdrop} onClick={props.onClose} />
        <div
          class="ui-action-sheet"
          ref={panel}
          role="alertdialog"
          aria-modal="true"
          aria-label={typeof props.title === 'string' ? props.title : 'Auswahl'}
        >
          <div class="ui-action-sheet__group">
            {(props.title || props.message) && (
              <div class="ui-action-sheet__head">
                {props.title && <p class="ui-action-sheet__title">{props.title}</p>}
                {props.message && <p class="ui-action-sheet__message">{props.message}</p>}
              </div>
            )}
            {props.actions.map((action, i) => (
              <button
                key={action.label}
                ref={i === firstEnabled ? first : undefined}
                type="button"
                class={`ui-action-sheet__button ${action.destructive ? 'is-destructive' : ''}`}
                disabled={action.disabled}
                onClick={() => choose(action)}
              >
                {action.icon && <Icon name={action.icon} />}
                {action.label}
              </button>
            ))}
          </div>
          <button type="button" class="ui-action-sheet__cancel" onClick={props.onClose}>
            {props.cancelLabel ?? 'Abbrechen'}
          </button>
        </div>
      </div>
    </Portal>
  );
}
