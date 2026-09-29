import type { ComponentChildren } from 'preact';
import { type ChipColor, Icon, IconChip } from './Icon';
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
  /** Icon vor dem Titel (als Kachel). */
  icon?: IconName | (string & {});
  /** Farbton: z.B. 'bad' für Game Over oder eine Konfrontation. */
  tone?: 'accent' | 'warn' | 'bad' | 'info';
  /** Kleine Zeile über dem Titel, z.B. "Konfrontation · Ehrenfeld". */
  kicker?: ComponentChildren;
  /** Zusätzliche Klasse am Dialog. */
  class?: string;
}

const TONE_CHIP: Record<string, ChipColor> = { accent: 'money', warn: 'warn', bad: 'danger', info: 'place' };

/** Modaler Dialog mit abgedunkeltem Hintergrund. Am Handy als Blatt von unten. */
export function Dialog(props: DialogProps) {
  const tone = props.tone ?? 'accent';
  return (
    // Klick daneben schließt; per Tastatur schließt Escape (global in src/ui/start.tsx).
    // biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape
    <div class="ui-dialog-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div
        class={`ui-dialog ui-dialog--${props.size ?? 'narrow'} ui-dialog--${tone} ${props.class ?? ''}`}
        role="dialog"
        aria-modal="true"
      >
        <header class="ui-dialog__head">
          {props.icon && <IconChip icon={props.icon} color={TONE_CHIP[tone]} size="lg" class="ui-dialog__icon" />}
          <div class="ui-dialog__heading">
            {props.kicker && <div class="ui-dialog__kicker">{props.kicker}</div>}
            <h2 class="ui-dialog__title">{props.title}</h2>
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
