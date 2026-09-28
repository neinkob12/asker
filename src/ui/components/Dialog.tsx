import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './icons';

export interface DialogProps {
  title: ComponentChildren;
  children?: ComponentChildren;
  /** Knöpfe unten. */
  actions?: ComponentChildren;
  /** Ohne onClose gibt es keinen Schließen-Knopf und kein Schließen per Klick daneben. */
  onClose?: () => void;
  /** Schmal (Standard) oder breit. */
  size?: 'narrow' | 'wide';
  /** Icon vor dem Titel. */
  icon?: IconName | (string & {});
  /** Farbton der Kante: z.B. 'bad' für Game Over oder eine Konfrontation. */
  tone?: 'accent' | 'warn' | 'bad' | 'info';
  /** Kleine Zeile über dem Titel im Überwachungsstil, z.B. "Konfrontation · Ehrenfeld". */
  kicker?: ComponentChildren;
}

/** Modaler Dialog mit abgedunkeltem Hintergrund. Am Handy als Blatt von unten. */
export function Dialog(props: DialogProps) {
  return (
    // Klick daneben schließt; per Tastatur schließt Escape (global in src/ui/start.tsx).
    // biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape
    <div class="ui-dialog-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div
        class={`ui-dialog ui-dialog--${props.size ?? 'narrow'} ui-dialog--${props.tone ?? 'accent'}`}
        role="dialog"
        aria-modal="true"
      >
        <header class="ui-dialog__head">
          <div class="ui-dialog__heading">
            {props.kicker && <div class="ui-dialog__kicker">{props.kicker}</div>}
            <h2 class="ui-dialog__title">
              {props.icon && <Icon name={props.icon} class="ui-dialog__icon" />}
              {props.title}
            </h2>
          </div>
          {props.onClose && (
            <button type="button" class="ui-dialog__close" onClick={props.onClose} aria-label="Schließen">
              <Icon name="close" size={20} />
            </button>
          )}
        </header>
        <div class="ui-dialog__body">{props.children}</div>
        {props.actions && <footer class="ui-dialog__actions">{props.actions}</footer>}
      </div>
    </div>
  );
}
