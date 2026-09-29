import type { JSX } from 'preact';
import { ICONS, type IconName, resolveIcon } from './icons';

export interface IconProps {
  /** Name aus dem Icon-Set (src/ui/components/icons.ts). Unbekannte Namen (z.B. Emoji) werden als Text gezeigt. */
  name: IconName | (string & {});
  /** Kantenlänge in px. Standard: 1em (passt sich der Schrift an). */
  size?: number;
  /** Strichstärke im 24er-Raster. Standard 1.75 (fein, clean). */
  strokeWidth?: number;
  /** Beschriftung für Screenreader. Ohne title ist das Icon nur Dekoration. */
  title?: string;
  class?: string;
}

/** Icon aus dem einheitlichen Set, in der aktuellen Textfarbe. */
export function Icon(props: IconProps) {
  const size = props.size === undefined ? '1em' : `${props.size}px`;
  const cls = `ui-icon ${props.class ?? ''}`;
  const icon = resolveIcon(props.name);
  if (!icon) {
    return (
      <span class={`${cls} ui-icon--text`} style={{ fontSize: size }} role={props.title ? 'img' : undefined}>
        {props.name}
      </span>
    );
  }
  return (
    <svg
      class={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.strokeWidth ?? 1.75}
      stroke-linecap="round"
      stroke-linejoin="round"
      role={props.title ? 'img' : undefined}
      aria-hidden={props.title ? undefined : 'true'}
      aria-label={props.title}
      focusable="false"
    >
      {props.title && <title>{props.title}</title>}
      {ICONS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * Farben der Icon-Kacheln: die Bedeutungsfarben des Spiels (siehe docs/handy-design.md). Eine Farbe steht für eine
 * Bedeutung: money Geld und Gewinn, dirty Schwarzgeld, danger Gefahr, warn Frist und Achtung, brand dein Geschäft,
 * place Ort und Info, goods Ware, people Personen, chat Nachrichten, sky Himmel, law Recht, media Ton,
 * system Einstellungen, log Protokoll. Alte Namen (red, green, accent, bad …) gehen weiter.
 */
export type CategoryColor =
  | 'money'
  | 'dirty'
  | 'danger'
  | 'warn'
  | 'brand'
  | 'place'
  | 'goods'
  | 'people'
  | 'chat'
  | 'sky'
  | 'law'
  | 'media'
  | 'system'
  | 'log';

export type ChipColor =
  | CategoryColor
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'purple'
  | 'violet'
  | 'ink'
  | 'paper'
  | 'white'
  | 'accent'
  | 'bad'
  | 'info';

const CHIP_ALIASES: Record<string, CategoryColor> = {
  accent: 'money',
  green: 'money',
  bad: 'danger',
  red: 'danger',
  yellow: 'warn',
  info: 'place',
  blue: 'place',
  purple: 'dirty',
  violet: 'dirty',
  ink: 'system',
  paper: 'system',
  white: 'system',
};

const CATEGORY_NAMES = new Set<string>([
  'money',
  'dirty',
  'danger',
  'warn',
  'brand',
  'place',
  'goods',
  'people',
  'chat',
  'sky',
  'law',
  'media',
  'system',
  'log',
]);

/** Ist das ein Farbname des Spiels (Bedeutungsfarbe oder alter Name) und keine CSS-Farbe? */
export function isChipColor(value: string): value is ChipColor {
  return CATEGORY_NAMES.has(value) || Object.hasOwn(CHIP_ALIASES, value);
}

/** Bedeutungsfarbe zu einem (auch alten) Farbnamen. Standard: Marke (Gold). */
export function categoryOf(color: ChipColor | undefined): CategoryColor {
  if (!color) return 'brand';
  return CHIP_ALIASES[color] ?? (color as CategoryColor);
}

export interface IconChipProps {
  icon: IconName | (string & {});
  /** Bedeutungsfarbe der Kachel. Standard: brand (Gold). */
  color?: ChipColor;
  /** xs 20 px, sm 26 px, md 32 px (Standard), lg 42 px, xl 56 px. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** 'round' (Standard, weiche Ecken), 'square' und 'tile' (App-Kachel, Radius 22,5 %). */
  shape?: 'round' | 'square' | 'tile';
  /** Kräftige Kachel mit Farbverlauf und weißem Symbol (App-Icon, Zeilen der Listen) statt getönter Fläche. */
  solid?: boolean;
  /** Kleiner Punkt oben rechts: Status. */
  status?: 'good' | 'warn' | 'bad' | 'idle';
  title?: string;
  class?: string;
  style?: JSX.CSSProperties;
}

/** Symbol auf einer Kachel in einer Bedeutungsfarbe, z.B. vor Zeilen und in Karten. Mit solid als App-Icon. */
export function IconChip(props: IconChipProps) {
  const color = categoryOf(props.color);
  const shape = props.shape === 'square' || props.shape === 'tile' ? 'tile' : 'round';
  const cls = [
    'ui-chip',
    `ui-chip--${color}`,
    `ui-chip--${props.size ?? 'md'}`,
    shape === 'tile' ? 'ui-chip--tile' : '',
    props.solid ? 'ui-chip--solid' : '',
    props.class ?? '',
  ];
  return (
    <span class={cls.join(' ')} style={props.style} title={props.title} aria-hidden={props.title ? undefined : 'true'}>
      <Icon name={props.icon} />
      {props.status && <span class={`ui-chip__status ui-status-dot ui-status-dot--${props.status}`} />}
    </span>
  );
}

const STATUS_LABELS = { good: 'in Ordnung', warn: 'Achtung', bad: 'Problem', idle: 'ruhig' } as const;

/** Farbiger Status-Punkt (grün gut, gelb Achtung, rot Problem, grau ruhig). */
export function StatusDot(props: { status: 'good' | 'warn' | 'bad' | 'idle'; title?: string }) {
  return (
    <span
      class={`ui-status-dot ui-status-dot--${props.status}`}
      title={props.title}
      role="img"
      aria-label={props.title ?? STATUS_LABELS[props.status]}
    />
  );
}
