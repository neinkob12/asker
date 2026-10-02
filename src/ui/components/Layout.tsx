import type { ComponentChildren, JSX } from 'preact';
import { useContext } from 'preact/hooks';
import { haptic } from '../haptics';
import { type CategoryColor, type ChipColor, categoryOf, Icon, IconChip } from './Icon';
import type { IconName } from './icons';
import { BarActionsContext, Portal } from './Portal';
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
  const bar = useContext(BarActionsContext);
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
  // Als eigene Seite im Handy (Abschnitt eines Listen-Tabs): Der Titel ist der Titel der Seite, die Aktionen
  // stehen rechts in der Navigationsleiste (wie bei iOS), der Inhalt steht ohne Karte auf der Seite.
  if (section?.mode === 'detail' && bar) {
    return (
      <section class={cls.join(' ')}>
        {props.actions && <Portal host={bar}>{props.actions}</Portal>}
        {props.children}
      </section>
    );
  }
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
  /** Wert rechts in der Zeile (grau, wie "Bezirk … Innenstadt" in den iOS-Einstellungen). */
  value?: ComponentChildren;
  /**
   * Aktionszeile statt Navigation (mit onClick): Titel in der Markenfarbe, kein Pfeil. Für die Hauptaktion als
   * "Zeile mit Kachel", z.B. "Alle bedienen".
   */
  action?: boolean;
  /** Nicht tippbar (z.B. zu wenig Geld). */
  disabled?: boolean;
}

const LIST_TONE_CHIP: Record<string, ChipColor> = { good: 'money', bad: 'danger', info: 'place', warn: 'warn' };

export function ListItem(props: ListItemProps) {
  const cls = ['ui-list__item'];
  if (props.tone) cls.push(`ui-list__item--${props.tone}`);
  if (props.onClick) cls.push('is-clickable');
  if (props.active) cls.push('is-active');
  if (props.action) cls.push('is-action');
  if (props.disabled) cls.push('is-disabled');
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
      {props.value !== undefined && props.value !== null && <span class="ui-list__value">{props.value}</span>}
      {props.onClick && !props.aside && !props.action && <Icon name="chevronRight" class="ui-list__chevron" />}
    </>
  );
  return (
    <li class={cls.join(' ')}>
      {props.onClick ? (
        <button type="button" class="ui-list__main ui-list__button" onClick={props.onClick} disabled={props.disabled}>
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
 * Abschnitt einer Handy-Seite wie in den iOS-Einstellungen, seit Auftrag 27 mit sichtbarer Unterlage (Fläche und Rand)
 * und farbiger Kopfzeile in der Bedeutungsfarbe: Kachel, Titel in Großbuchstaben, optional ein Zähler und rechts ein
 * Wert (z.B. die Summe), darunter der Inhalt (meist eine `List`), eine kurze Fußnote (ein Satz) und ausklappbar alles
 * Weitere (`more`). Mit `collapsible` klappt der ganze Abschnitt am Kopf auf und zu (merkt sich nichts).
 */
export function Group(props: {
  title: ComponentChildren;
  icon?: IconRef;
  color?: ChipColor;
  /** Zahl neben dem Titel (0 = keine). */
  count?: number;
  /** Wert rechts in der Kopfzeile, z.B. eine Summe. */
  value?: ComponentChildren;
  /** Ein kurzer Satz unter dem Inhalt. Längere Erklärungen gehören in `more`. */
  note?: ComponentChildren;
  /** Erklärung, die erst nach einem Tipp auf "Mehr dazu" erscheint. */
  more?: ComponentChildren;
  /** Der Kopf klappt den Inhalt auf und zu. */
  collapsible?: boolean;
  /** Anfangs aufgeklappt (nur mit collapsible, Standard ja). */
  open?: boolean;
  children?: ComponentChildren;
  class?: string;
}) {
  const color = categoryOf(props.color ?? 'system');
  const cls = `ui-group ui-group--${color} ${props.collapsible ? 'ui-group--collapsible' : ''} ${props.class ?? ''}`;
  const head = (
    <>
      {props.icon && <IconChip icon={props.icon} color={color} solid size="sm" />}
      <h3 class="ui-group__title">{props.title}</h3>
      {props.count !== undefined && props.count > 0 && <span class="ui-group__count">{props.count}</span>}
      {props.value !== undefined && props.value !== null && <span class="ui-group__value">{props.value}</span>}
      {props.collapsible && <Icon name="chevronDown" class="ui-group__chevron" />}
    </>
  );
  const body = (
    <>
      <div class="ui-group__body">{props.children}</div>
      {props.note && <p class="ui-group__note">{props.note}</p>}
      {props.more && <Disclosure class="ui-group__more">{props.more}</Disclosure>}
    </>
  );
  if (props.collapsible) {
    return (
      <details class={cls} open={props.open ?? true}>
        <summary class="ui-group__head">{head}</summary>
        {body}
      </details>
    );
  }
  return (
    <section class={cls}>
      <header class="ui-group__head">{head}</header>
      {body}
    </section>
  );
}

/** Eine Eigenschaft als Chip in einer Zeile (`ItemContent tags`). */
export interface ChipSpec {
  label: ComponentChildren;
  color?: CategoryColor;
  icon?: IconRef;
  title?: string;
}

/**
 * Kleine Fläche in einer Bedeutungsfarbe für eine Eigenschaft oder einen Status ("greift an" rot, "Level 3" grau).
 * Bricht nie um. Mehrere Chips stehen in `Chips` nebeneinander, statt "a · b · c" als Text.
 */
export function Chip(props: Partial<ChipSpec> & { children?: ComponentChildren }) {
  return (
    <span class={`ui-tag ui-tag--cat ui-tag--cat-${props.color ?? 'system'} ui-tag--chip`} title={props.title}>
      {props.icon && <Icon name={props.icon} />}
      {props.children ?? props.label}
    </span>
  );
}

/** Reihe von Chips (bricht zwischen den Chips um, nie im Chip). */
export function Chips(props: {
  /** Leere Einträge (null, false) werden übersprungen. */
  items?: readonly (ChipSpec | null | false | undefined)[];
  children?: ComponentChildren;
  class?: string;
}) {
  const items = props.items?.filter((c): c is ChipSpec => !!c) ?? [];
  return (
    <span class={`ui-chips ${props.class ?? ''}`}>
      {items.map((c, i) => (
        <Chip key={typeof c.label === 'string' ? c.label : i} {...c} />
      ))}
      {props.children}
    </span>
  );
}

/**
 * Ausklappbare Erklärung ("Mehr dazu"): Was nicht in einen Satz passt, steht hier, bis man es braucht. Merkt sich
 * nichts, ist beim nächsten Öffnen der Seite wieder zu.
 */
export function Disclosure(props: {
  label?: ComponentChildren;
  icon?: IconRef;
  children?: ComponentChildren;
  class?: string;
  /** Anfangs offen. */
  open?: boolean;
}) {
  return (
    <details class={`ui-disclosure ${props.class ?? ''}`} open={props.open}>
      <summary class="ui-disclosure__summary">
        <Icon name={props.icon ?? 'info'} class="ui-disclosure__icon" />
        <span class="ui-disclosure__label">{props.label ?? 'Mehr dazu'}</span>
        <Icon name="chevronDown" class="ui-disclosure__chevron" />
      </summary>
      <div class="ui-disclosure__body">{props.children}</div>
    </details>
  );
}

/**
 * Inhalt einer Listenzeile mit Kachel in der Bedeutungsfarbe, Titel und Zweitzeile, wie in den iOS-Einstellungen.
 * Eigenschaften (Rolle, Level, Status …) kommen als `tags` und stehen als Chips unter dem Titel, nicht als "a · b"
 * in der Zweitzeile. Weiteres (z.B. ein Fortschritt) kommt als children darunter. In `ListItem` verwenden.
 */
export function ItemContent(props: {
  icon: IconRef;
  color?: ChipColor;
  title: ComponentChildren;
  meta?: ComponentChildren;
  /** Eigenschaften als Chips (leere Einträge werden übersprungen). */
  tags?: readonly (ChipSpec | null | false | undefined)[];
  children?: ComponentChildren;
}) {
  const tags = props.tags?.filter((t): t is ChipSpec => !!t) ?? [];
  return (
    <span class="ui-item">
      <IconChip icon={props.icon} color={props.color ?? 'system'} size="sm" />
      <span class="ui-item__main">
        <span class="ui-item__title">{props.title}</span>
        {props.meta && <span class="ui-item__meta">{props.meta}</span>}
        {tags.length > 0 && <Chips items={tags} class="ui-item__tags" />}
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
