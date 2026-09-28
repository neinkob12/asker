import type { ComponentChildren } from 'preact';

export interface DialogProps {
  title: ComponentChildren;
  children?: ComponentChildren;
  /** Knöpfe unten. */
  actions?: ComponentChildren;
  /** Ohne onClose gibt es keinen Schließen-Knopf und kein Schließen per Klick daneben. */
  onClose?: () => void;
  /** Schmal (Standard) oder breit. */
  size?: 'narrow' | 'wide';
}

/** Modaler Dialog mit abgedunkeltem Hintergrund. */
export function Dialog(props: DialogProps) {
  return (
    // Klick daneben schließt; per Tastatur schließt Escape (global in src/ui/start.tsx).
    // biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape
    <div class="ui-dialog-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div class={`ui-dialog ui-dialog--${props.size ?? 'narrow'}`} role="dialog" aria-modal="true">
        <header class="ui-dialog__head">
          <h2 class="ui-dialog__title">{props.title}</h2>
          {props.onClose && (
            <button type="button" class="ui-dialog__close" onClick={props.onClose} aria-label="Schließen">
              ×
            </button>
          )}
        </header>
        <div class="ui-dialog__body">{props.children}</div>
        {props.actions && <footer class="ui-dialog__actions">{props.actions}</footer>}
      </div>
    </div>
  );
}
