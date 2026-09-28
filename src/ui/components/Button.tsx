import type { ComponentChildren, JSX } from 'preact';

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
}

export function Button(props: ButtonProps) {
  const classes = ['ui-button', `ui-button--${props.variant ?? 'default'}`];
  if (props.active) classes.push('is-active');
  if (props.wide) classes.push('ui-button--wide');
  if (props.small) classes.push('ui-button--small');
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
      {props.children}
    </button>
  );
}

export interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
}

/** Gruppe von Knöpfen, von denen einer aktiv ist (z.B. Spieltempo). */
export function SegmentedControl<T extends string | number>(props: SegmentedControlProps<T>) {
  return (
    <fieldset class="ui-segmented" aria-label={props['aria-label']}>
      {props.options.map((o) => (
        <Button key={String(o.value)} small active={o.value === props.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </fieldset>
  );
}
