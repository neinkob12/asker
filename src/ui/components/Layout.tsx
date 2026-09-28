import type { ComponentChildren } from 'preact';

export interface CardProps {
  title?: ComponentChildren;
  /** Rechts im Kopf, z.B. ein Knopf. */
  actions?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
}

/** Karte mit optionaler Überschrift, z.B. als Abschnitt in einem Tab. */
export function Card(props: CardProps) {
  return (
    <section class={`ui-card ${props.class ?? ''}`}>
      {(props.title || props.actions) && (
        <header class="ui-card__head">
          {props.title && <h2 class="ui-card__title">{props.title}</h2>}
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
export function Empty(props: { children?: ComponentChildren }) {
  return <p class="ui-hint ui-empty">{props.children}</p>;
}

/** Zeile "Beschriftung … Wert". */
export function KeyValue(props: { label: ComponentChildren; value: ComponentChildren }) {
  return (
    <div class="ui-kv">
      <span>{props.label}</span>
      <span class="ui-kv__value">{props.value}</span>
    </div>
  );
}

/** Kleine Zahl in einem Kreis, z.B. ungelesene Nachrichten. Bei 0 unsichtbar. */
export function Badge(props: { count: number; tone?: 'accent' | 'bad' }) {
  if (props.count <= 0) return null;
  return <span class={`ui-badge ui-badge--${props.tone ?? 'bad'}`}>{props.count > 99 ? '99+' : props.count}</span>;
}

/** Anzeige "BESCHRIFTUNG / Wert", z.B. im HUD. */
export function Stat(props: { label: ComponentChildren; value: ComponentChildren; title?: string }) {
  return (
    <div class="ui-stat" title={props.title}>
      <span class="ui-stat__label">{props.label}</span>
      <span class="ui-stat__value">{props.value}</span>
    </div>
  );
}

export interface ProgressBarProps {
  /** 0 bis 1. */
  value: number;
  tone?: 'accent' | 'warn' | 'bad';
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
  tone?: 'good' | 'bad' | 'info';
  onClick?: () => void;
}

export function ListItem(props: ListItemProps) {
  const cls = `ui-list__item ${props.tone ? `ui-list__item--${props.tone}` : ''} ${props.onClick ? 'is-clickable' : ''}`;
  return (
    <li class={cls}>
      {props.onClick ? (
        <button type="button" class="ui-list__main ui-list__button" onClick={props.onClick}>
          {props.children}
        </button>
      ) : (
        <div class="ui-list__main">{props.children}</div>
      )}
      {props.aside && <div class="ui-list__aside">{props.aside}</div>}
    </li>
  );
}
