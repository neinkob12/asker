// Gemeinsame Bausteine der Personal-Oberfläche: Porträt (Platzhalter), Status-Stempel, Werte-Balken.

import { ProgressBar } from '../../../ui';
import {
  ROLE_INFO,
  STAT_KEYS,
  STAT_NAMES,
  STATUS_NAMES,
  type StaffOrigin,
  type StaffRole,
  type StaffStats,
  type StaffStatus,
  type StatKey,
} from '../index';

export const ROLE_ICONS: Record<StaffRole, string> = {
  runner: '🏃',
  courier: '🛵',
  security: '🛡️',
  lawyer: '⚖️',
  accountant: '📒',
  policeContact: '👮',
};

export const ORIGIN_NAMES: Record<StaffOrigin, string> = {
  street: 'von der Straße',
  pool: 'Bewerbung',
  referral: 'Empfehlung',
  regular: 'über einen Stammkunden',
  event: 'Kontakt aus dem Milieu',
};

/** Initialen ohne Spitznamen: "Dragan „Schrank“ M." → "DM". */
export function initials(name: string): string {
  const words = name.split(' ').filter((w) => !w.startsWith('„'));
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Porträt. Solange es keine Bilder gibt (portrait = null), ein Platzhalter mit Initialen. */
export function Portrait(props: {
  person: { name: string; role: StaffRole; portrait: string | null };
  size?: 'sm' | 'lg';
}) {
  const { person } = props;
  const cls = `staff-portrait staff-portrait--${props.size ?? 'sm'}`;
  if (person.portrait) return <img class={cls} src={person.portrait} alt={person.name} />;
  return (
    <div class={cls} role="img" aria-label={`Porträt ${person.name}`}>
      <span class="staff-portrait__initials">{initials(person.name)}</span>
      <span class="staff-portrait__role" aria-hidden="true">
        {ROLE_ICONS[person.role]}
      </span>
    </div>
  );
}

export function StatusStamp(props: { status: StaffStatus }) {
  if (props.status === 'active') return null;
  return <span class={`staff-stamp staff-stamp--${props.status}`}>{STATUS_NAMES[props.status]}</span>;
}

/** Werte als Balken. Unbekannte Werte erscheinen als "?", wichtige Werte des Typs sind hervorgehoben. */
export function StatBars(props: { stats: Partial<StaffStats>; known: readonly StatKey[]; role: StaffRole }) {
  const key = ROLE_INFO[props.role].keyStats;
  return (
    <div class="staff-stats">
      {STAT_KEYS.map((k) => {
        const value = props.stats[k];
        const known = props.known.includes(k) && value !== undefined;
        const tone =
          k === 'loyalty' && known && value < 30 ? 'bad' : k === 'loyalty' && known && value < 50 ? 'warn' : 'accent';
        return (
          <div key={k} class={`staff-stat ${key.includes(k) ? 'is-key' : ''}`}>
            <span class="staff-stat__label">{STAT_NAMES[k]}</span>
            {known ? (
              <ProgressBar value={value / 100} tone={tone} label={STAT_NAMES[k]} />
            ) : (
              <span class="staff-stat__unknown" />
            )}
            <span class="staff-stat__value">{known ? value : '?'}</span>
          </div>
        );
      })}
    </div>
  );
}
