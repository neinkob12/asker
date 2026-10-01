import type { ComponentChildren, JSX } from 'preact';
import { useContext } from 'preact/hooks';
import { haptic } from '../haptics';
import { type CategoryColor, type ChipColor, Icon, IconChip } from './Icon';
import type { IconName } from './icons';
import { rememberSectionTitle, SectionContext } from './section';

type IconRef = IconName | (string & {});

/** Farbton für Hervorhebungen. */
export type Tone = 'accent' | 'warn' | 'bad' | 'info';

/** Status eines Abschnitts (Punkt in der Zeilenansicht). */
export type SectionStatus = 'good' | 'warn' | 'bad' | 'idle';

export interface CardProps {
  title?: ComponentChildren;
  /** Rechts im Kopf, z.B. ein Knopf. */
  actions?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
  /** Icon vor dem Titel (als getönte Kachel). */
  icon?: IconRef;
  /** Farbige Kante links, z.B. für Warnungen. */
  tone?: Tone;
  /** Farbe der Icon-Kachel. Standard: nach tone, sonst gelb. */
  color?: ChipColor;
  /** Kennzahl für die Zeilenansicht (z.B. "40 g" oder "3 warten"). */
  summary?: ComponentChildren;
  /** Status-Punkt in der Zeilenansicht. */
  status?: SectionStatus;
}

/**
 * Karte mit optionaler Überschrift, z.B. als Abschnitt in einem Tab. In Listen-Tabs (z.B. "Geschäft") zeigt die
 * Shell sie als tippbare Zeile mit icon, title, summary und status; ein Tipp öffnet den ganzen Inhalt.
 */
export function Card(props: CardProps) {
  const section = useContext(SectionContext);
  const chipColor = props.color ?? (props.tone ? props.tone : undefined);
  if (section?.mode === 'rows' && props.title) {
    if (section.id && typeof props.title === 'string') rememberSectionTitle(section.id, props.title);
    return (
      <button type="button" class={`ui-row ${props.tone ? `ui-row--${props.tone}` : ''}`} onClick={section.open}>
        <IconChip icon={props.icon ?? 'briefcase'} color={chipColor} status={props.status} solid />
        <span class="ui-row__title">{props.title}</span>
        {props.summary !== undefined && props.summary !== null && <span class="ui-row__summary">{props.summary}</span>}
        <Icon name="chevronRight" class="ui-row__chevron" />
      </button>
    );
  }
  const cls = ['ui-card'];
  if (props.tone) cls.push(`ui-card--${props.tone}`);
  if (section?.mode === 'detail') cls.push('ui-card--detail');
  if (props.class) cls.push(props.class);
  return (
    <section class={cls.join(' ')}>
      {(props.title || props.actions) && (
        <header class="ui-card__head">
          {props.title && (
            <h2 class="ui-card__title">
              {props.icon && <IconChip icon={props.icon} color={chipColor} size="sm" class="ui-card__icon" />}
              <span>{props.title}</span>
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
export function Hint(props: { children?: ComponentChildren; icon?: IconRef }) {
  return (
    <p class={`ui-hint ${props.icon ? 'has-icon' : ''}`}>
      {props.icon && <Icon name={props.icon} class="ui-hint__icon" />}
      {props.children}
    </p>
  );
}

/** Text für leere Listen. Mit action (z.B. ein Knopf) zeigt der leere Zustand den nächsten Schritt. */
export function Empty(props: { children?: ComponentChildren; icon?: IconRef; action?: ComponentChildren }) {
  return (
    <div class="ui-empty">
      <IconChip icon={props.icon ?? 'inbox'} color="system" size="lg" />
      <p class="ui-hint">{props.children}</p>
      {props.action}
    </div>
  );
}

/** Zeile "Beschriftung … Wert". */
export function KeyValue(props: { label: ComponentChildren; value: ComponentChildren; tone?: Tone; icon?: IconRef }) {
  return (
    <div class="ui-kv">
      <span class="ui-kv__label">
        {props.icon && <Icon name={props.icon} class="ui-kv__icon" />}
        {props.label}
      </span>
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

const LIST_TONE_CHIP: Record<string, ChipColor> = { good: 'money', bad: 'danger', info: 'place', warn: 'warn' };

export function ListItem(props: ListItemProps) {
  const cls = ['ui-list__item'];
  if (props.tone) cls.push(`ui-list__item--${props.tone}`);
  if (props.onClick) cls.push('is-clickable');
  if (props.active) cls.push('is-active');
  const main = (
    <>
      {props.icon && (
        <IconChip
          icon={props.icon}
          size="sm"
          color={props.tone ? LIST_TONE_CHIP[props.tone] : 'system'}
          class="ui-list__icon"
        />
      )}
      <span class="ui-list__text">{props.children}</span>
      {props.onClick && !props.aside && <Icon name="chevronRight" class="ui-list__chevron" />}
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

/**
 * Abschnitt einer Handy-Seite wie in den iOS-Einstellungen: Kachel in der Bedeutungsfarbe, Titel in Großbuchstaben,
 * optional ein Zähler, darunter der Inhalt (meist eine `List`) und eine Fußnote.
 */
export function Group(props: {
  title: ComponentChildren;
  icon?: IconRef;
  color?: ChipColor;
  /** Zahl neben dem Titel (0 = keine). */
  count?: number;
  note?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
}) {
  return (
    <section class={`ui-group ${props.class ?? ''}`}>
      <header class="ui-group__head">
        {props.icon && <IconChip icon={props.icon} color={props.color ?? 'system'} solid size="sm" />}
        <h3 class="ui-group__title">{props.title}</h3>
        {props.count !== undefined && props.count > 0 && <span class="ui-group__count">{props.count}</span>}
      </header>
      {props.children}
      {props.note && <p class="ui-group__note">{props.note}</p>}
    </section>
  );
}

/**
 * Inhalt einer Listenzeile mit Kachel in der Bedeutungsfarbe, Titel und Zweitzeile, wie in den iOS-Einstellungen.
 * Weiteres (z.B. ein Fortschritt) kommt als children unter die Zweitzeile. In `ListItem` verwenden.
 */
export function ItemContent(props: {
  icon: IconRef;
  color?: ChipColor;
  title: ComponentChildren;
  meta?: ComponentChildren;
  children?: ComponentChildren;
}) {
  return (
    <span class="ui-item">
      <IconChip icon={props.icon} color={props.color ?? 'system'} size="sm" />
      <span class="ui-item__main">
        <span class="ui-item__title">{props.title}</span>
        {props.meta && <span class="ui-item__meta">{props.meta}</span>}
        {props.children}
      </span>
    </span>
  );
}

export interface SummaryTile {
  icon: IconRef;
  color?: ChipColor;
  value: ComponentChildren;
  label: string;
}

/** Drei (oder zwei) Kennzahlen als Kacheln oben auf einer Handy-Seite, z.B. Team, Lohn, Ausfälle. */
export function SummaryTiles(props: { items: readonly SummaryTile[] }) {
  return (
    <div class="ui-summary" style={{ '--summary-cols': props.items.length } as JSX.CSSProperties}>
      {props.items.map((item) => (
        <div key={item.label} class="ui-summary__item">
          <IconChip icon={item.icon} color={item.color ?? 'system'} size="sm" />
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Kleines Etikett, z.B. "Gang", "Neu", "Hoch". Mit category in der Bedeutungsfarbe (Symbol immer dabei zeigen). */
export function Tag(props: {
  children?: ComponentChildren;
  tone?: Tone | 'muted';
  category?: CategoryColor;
  icon?: IconRef;
}) {
  const cls = props.category ? `ui-tag--cat ui-tag--cat-${props.category}` : `ui-tag--${props.tone ?? 'muted'}`;
  return (
    <span class={`ui-tag ${cls}`}>
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
  /** Bedeutungsfarbe des Kreises (z.B. Kontaktart). Standard: aus dem Namen abgeleitet. */
  tone?: CategoryColor;
  /** Eigene Hintergrundfarbe (CSS-Farbe), z.B. die Farbe einer Gang. Vorrang vor tone. */
  color?: string;
}

const AVATAR_TONES: CategoryColor[] = ['place', 'money', 'people', 'brand', 'media', 'chat', 'goods', 'law'];

function nameTone(name: string): CategoryColor {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** Kreis mit Porträt, Icon oder Initialen. Für Kontakte, Mitarbeiter, Gangs. */
export function Avatar(props: AvatarProps) {
  const image = props.image;
  const custom = props.color !== undefined;
  const tone = props.tone ?? nameTone(props.name);
  const style = custom ? { background: props.color } : undefined;
  const cls = `ui-avatar ui-avatar--${props.size ?? 'md'} ${custom ? 'ui-avatar--custom' : `ui-avatar--${tone}`}`;
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
      onClick={() => {
        haptic('selection');
        props.onChange(!props.checked);
      }}
    >
      {props.icon && <IconChip icon={props.icon} size="sm" color={props.checked ? 'money' : 'system'} />}
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

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Beschriftung für Screenreader (und als Tooltip). */
  label: string;
  /** Füllt die verfügbare Breite. */
  wide?: boolean;
  disabled?: boolean;
  class?: string;
}

/** Auswahlfeld (natives select im Look der Bausteine, am Handy mit der System-Auswahl). */
export function Select<T extends string = string>(props: SelectProps<T>) {
  return (
    <span class={`ui-select ${props.wide ? 'ui-select--wide' : ''} ${props.class ?? ''}`}>
      <select
        aria-label={props.label}
        title={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.currentTarget.value as T)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" class="ui-select__chevron" />
    </span>
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
