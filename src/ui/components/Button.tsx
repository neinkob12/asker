import type { ComponentChildren, JSX } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Badge } from './Layout';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'subtle' | 'link';

export interface ButtonProps {
  children?: ComponentChildren;
  onClick?: (event: JSX.TargetedMouseEvent<HTMLButtonElement>) => void;
  variant?: ButtonVariant;
  /** Hervorgehoben als ausgewählt (z.B. aktives Tempo). */
  active?: boolean;
  disabled?: boolean;
  /** Volle Breite. */
  wide?: boolean;
  small?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  class?: string;
  'aria-label'?: string;
  /** Icon vor dem Text (Name aus dem Icon-Set oder Emoji). */
  icon?: IconName | (string & {});
  /** Zahl oben rechts am Knopf, z.B. ungelesene Nachrichten. */
  badge?: number;
}

export function Button(props: ButtonProps) {
  const classes = ['ui-button', `ui-button--${props.variant ?? 'default'}`];
  if (props.active) classes.push('is-active');
  if (props.wide) classes.push('ui-button--wide');
  if (props.small) classes.push('ui-button--small');
  if (props.icon && props.children === undefined) classes.push('ui-button--icon');
  if (props.class) classes.push(props.class);
  return (
    <button
      type={props.type ?? 'button'}
      class={classes.join(' ')}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props['aria-label']}
      aria-pressed={props.active === undefined ? undefined : props.active}
    >
      {props.icon && <Icon name={props.icon} class="ui-button__icon" />}
      {props.children}
      {props.badge ? <Badge count={props.badge} /> : null}
    </button>
  );
}

export interface IconButtonProps {
  icon: IconName | (string & {});
  /** Pflicht: Beschriftung für Screenreader und Tooltip. */
  label: string;
  onClick?: (event: JSX.TargetedMouseEvent<HTMLButtonElement>) => void;
  variant?: ButtonVariant;
  active?: boolean;
  disabled?: boolean;
  small?: boolean;
  badge?: number;
  class?: string;
}

/** Quadratischer Knopf nur mit Icon (z.B. Kamera, Ton, Schließen). */
export function IconButton(props: IconButtonProps) {
  return (
    <Button
      icon={props.icon}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      variant={props.variant ?? 'subtle'}
      active={props.active}
      disabled={props.disabled}
      small={props.small}
      badge={props.badge}
      class={props.class}
    />
  );
}

export interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: string; icon?: IconName | (string & {}) }[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
}

/** Gruppe von Knöpfen, von denen einer aktiv ist (z.B. Spieltempo). */
export function SegmentedControl<T extends string | number>(props: SegmentedControlProps<T>) {
  return (
    <fieldset class="ui-segmented ui-segmented--joined" aria-label={props['aria-label']}>
      {props.options.map((o) => (
        <Button
          key={String(o.value)}
          small
          icon={o.icon}
          active={o.value === props.value}
          onClick={() => props.onChange(o.value)}
          aria-label={o.icon ? o.label : undefined}
          title={o.icon ? o.label : undefined}
        >
          {o.icon ? undefined : o.label}
        </Button>
      ))}
    </fieldset>
  );
}
