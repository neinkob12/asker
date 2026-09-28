import type { ComponentChildren, JSX } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './icons';

type IconRef = IconName | (string & {});

/** Farbton für Hervorhebungen. */
export type Tone = 'accent' | 'warn' | 'bad' | 'info';

export interface CardProps {
  title?: ComponentChildren;
  /** Rechts im Kopf, z.B. ein Knopf. */
  actions?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
  /** Icon vor dem Titel. */
  icon?: IconRef;
  /** Farbige Kante links, z.B. für Warnungen. */
  tone?: Tone;
}

/** Karte mit optionaler Überschrift, z.B. als Abschnitt in einem Tab. */
export function Card(props: CardProps) {
  const cls = ['ui-card'];
  if (props.tone) cls.push(`ui-card--${props.tone}`);
  if (props.class) cls.push(props.class);
  return (
    <section class={cls.join(' ')}>
      {(props.title || props.actions) && (
        <header class="ui-card__head">
          {props.title && (
            <h2 class="ui-card__title">
              {props.icon && <Icon name={props.icon} class="ui-card__icon" />}
              {props.title}
            </h2>
          )}
          {props.actions && <div class="ui-card__actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

/** Grauer Hinweistext. */
export function Hint(props: { children?: ComponentChildren }) {
  return <p class="ui-hint">{props.children}</p>;
}

/** Text für leere Listen. */
export function Empty(props: { children?: ComponentChildren; icon?: IconRef }) {
  return (
    <p class="ui-hint ui-empty">
      {props.icon && <Icon name={props.icon} class="ui-empty__icon" />}
      {props.children}
    </p>
  );
}

/** Zeile "Beschriftung … Wert". */
export function KeyValue(props: { label: ComponentChildren; value: ComponentChildren; tone?: Tone }) {
  return (
    <div class="ui-kv">
      <span>{props.label}</span>
      <span class={`ui-kv__value ${props.tone ? `is-${props.tone}` : ''}`}>{props.value}</span>
    </div>
  );
}

/** Kleine Zahl in einem Kreis, z.B. ungelesene Nachrichten. Bei 0 unsichtbar. */
export function Badge(props: { count: number; tone?: Tone }) {
  if (props.count <= 0) return null;
  return <span class={`ui-badge ui-badge--${props.tone ?? 'bad'}`}>{props.count > 99 ? '99+' : props.count}</span>;
}

/** Anzeige "BESCHRIFTUNG / Wert", z.B. im HUD. */
export function Stat(props: {
  label: ComponentChildren;
  value: ComponentChildren;
  title?: string;
  /** Icon links neben dem Wert. */
  icon?: IconRef;
  tone?: Tone;
}) {
  return (
    <div
      class={`ui-stat ${props.tone ? `ui-stat--${props.tone}` : ''} ${props.icon ? 'has-icon' : ''}`}
      title={props.title}
    >
      {props.icon && <Icon name={props.icon} class="ui-stat__icon" />}
      <span class="ui-stat__label">{props.label}</span>
      <span class="ui-stat__value">{props.value}</span>
    </div>
  );
}

export interface ProgressBarProps {
  /** 0 bis 1. */
  value: number;
  tone?: 'accent' | 'warn' | 'bad' | 'info';
  label?: string;
}

export function ProgressBar(props: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, props.value)) * 1000) / 10;
  return (
    <div
      class={`ui-progress ui-progress--${props.tone ?? 'accent'}`}
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div class="ui-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Einfache Liste. Einträge mit ListItem. */
export function List(props: { children?: ComponentChildren; class?: string }) {
  return <ul class={`ui-list ${props.class ?? ''}`}>{props.children}</ul>;
}

export interface ListItemProps {
  children?: ComponentChildren;
  /** Rechts, z.B. ein Knopf. */
  aside?: ComponentChildren;
  tone?: 'good' | 'bad' | 'info' | 'warn';
  onClick?: () => void;
  /** Icon oder Avatar links. */
  icon?: IconRef;
  /** Hervorgehoben als ausgewählt. */
  active?: boolean;
}

export function ListItem(props: ListItemProps) {
  const cls = ['ui-list__item'];
  if (props.tone) cls.push(`ui-list__item--${props.tone}`);
  if (props.onClick) cls.push('is-clickable');
  if (props.active) cls.push('is-active');
  const main = (
    <>
      {props.icon && <Icon name={props.icon} class="ui-list__icon" />}
      <span class="ui-list__text">{props.children}</span>
    </>
  );
  return (
    <li class={cls.join(' ')}>
      {props.onClick ? (
        <button type="button" class="ui-list__main ui-list__button" onClick={props.onClick}>
          {main}
        </button>
      ) : (
        <div class="ui-list__main">{main}</div>
      )}
      {props.aside && <div class="ui-list__aside">{props.aside}</div>}
    </li>
  );
}

/** Kleines Etikett, z.B. "Gang", "Neu", "Hoch". */
export function Tag(props: { children?: ComponentChildren; tone?: Tone | 'muted'; icon?: IconRef }) {
  return (
    <span class={`ui-tag ui-tag--${props.tone ?? 'muted'}`}>
      {props.icon && <Icon name={props.icon} />}
      {props.children}
    </span>
  );
}

export interface AvatarProps {
  /** Name der Figur: ohne Bild werden die Initialen gezeigt. */
  name: string;
  /** Bild-URL, Emoji oder Icon-Name. */
  image?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Hintergrundfarbe (CSS-Farbe), z.B. die Farbe einer Gang. */
  color?: string;
}

/** Kreis mit Porträt, Icon oder Initialen. Für Kontakte, Mitarbeiter, Gangs. */
export function Avatar(props: AvatarProps) {
  const image = props.image;
  const style = props.color ? { background: props.color } : undefined;
  const cls = `ui-avatar ui-avatar--${props.size ?? 'md'}`;
  if (image && /^(https?:|data:|\/|\.\/)/.test(image)) {
    return <img class={cls} src={image} alt="" style={style} />;
  }
  return (
    <span class={cls} style={style} aria-hidden="true">
      {image ? <Icon name={image} /> : initials(props.name)}
    </span>
  );
}

/** Initialen aus einem Namen, z.B. "Dragan K." → "DK". */
export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : (parts[0][1] ?? '');
  return (first + last).toUpperCase();
}

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ComponentChildren;
  hint?: ComponentChildren;
  disabled?: boolean;
  icon?: IconRef;
}

/** Schalter an/aus mit Beschriftung. */
export function Toggle(props: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      class={`ui-toggle ${props.checked ? 'is-on' : ''}`}
      onClick={() => props.onChange(!props.checked)}
    >
      {props.icon && <Icon name={props.icon} class="ui-toggle__icon" />}
      <span class="ui-toggle__text">
        <span class="ui-toggle__label">{props.label}</span>
        {props.hint && <span class="ui-toggle__hint">{props.hint}</span>}
      </span>
      <span class="ui-toggle__track" aria-hidden="true">
        <span class="ui-toggle__thumb" />
      </span>
    </button>
  );
}

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  label: ComponentChildren;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  icon?: IconRef;
  /** Anzeige des Werts rechts, Standard: Prozent. */
  format?: (value: number) => string;
}

/** Schieberegler, z.B. für die Lautstärke. */
export function Slider(props: SliderProps) {
  const min = props.min ?? 0;
  const max = props.max ?? 1;
  const format = props.format ?? ((v: number) => `${Math.round(((v - min) / (max - min)) * 100)} %`);
  const pct = ((props.value - min) / (max - min)) * 100;
  return (
    <label class={`ui-slider ${props.disabled ? 'is-disabled' : ''}`}>
      <span class="ui-slider__head">
        {props.icon && <Icon name={props.icon} class="ui-slider__icon" />}
        <span class="ui-slider__label">{props.label}</span>
        <span class="ui-slider__value">{format(props.value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={props.step ?? 0.01}
        value={props.value}
        disabled={props.disabled}
        style={{ '--ui-slider-fill': `${pct}%` } as JSX.CSSProperties}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
      />
    </label>
  );
}
