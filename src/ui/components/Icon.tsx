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

/** Farben der Icon-Kacheln. Tone-Namen gehen auch ('accent' = Grün, 'bad' = Rot …). */
export type ChipColor =
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
  | 'warn'
  | 'bad'
  | 'info';

const CHIP_ALIASES: Record<string, string> = { accent: 'green', warn: 'yellow', bad: 'red', info: 'blue' };

export interface IconChipProps {
  icon: IconName | (string & {});
  /** Farbe der Kachel (getönte Fläche, farbige Glyphe). Standard: gelb. */
  color?: ChipColor;
  /** sm 28 px, md 36 px (Standard), lg 48 px, xl 64 px. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Rund (Standard) oder abgerundetes Quadrat (App-Kachel). */
  shape?: 'round' | 'square';
  /** Kleiner Punkt oben rechts: Status. */
  status?: 'good' | 'warn' | 'bad' | 'idle';
  title?: string;
  class?: string;
  style?: JSX.CSSProperties;
}

/** Icon auf einer getönten, eckigen Kachel, z.B. vor Zeilen und in Karten. */
export function IconChip(props: IconChipProps) {
  const color = CHIP_ALIASES[props.color ?? ''] ?? props.color ?? 'yellow';
  const cls = [
    'ui-chip',
    `ui-chip--${color}`,
    `ui-chip--${props.size ?? 'md'}`,
    props.shape === 'square' ? 'ui-chip--square' : '',
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
