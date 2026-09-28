import { ICONS, type IconName, isIconName } from './icons';

export interface IconProps {
  /** Name aus dem Icon-Set (src/ui/components/icons.ts). Unbekannte Namen (z.B. Emoji) werden als Text gezeigt. */
  name: IconName | (string & {});
  /** Kantenlänge in px. Standard: 1em (passt sich der Schrift an). */
  size?: number;
  /** Strichstärke im 24er-Raster. Standard 1.75. */
  strokeWidth?: number;
  /** Beschriftung für Screenreader. Ohne title ist das Icon nur Dekoration. */
  title?: string;
  class?: string;
}

/** Icon aus dem einheitlichen Set, in der aktuellen Textfarbe. */
export function Icon(props: IconProps) {
  const size = props.size === undefined ? '1em' : `${props.size}px`;
  const cls = `ui-icon ${props.class ?? ''}`;
  if (!isIconName(props.name)) {
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
      {ICONS[props.name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
