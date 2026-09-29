// Gemeinsame Bausteine der Personal-Oberfläche: Porträt (Platzhalter), Status-Stempel, Werte-Balken.

import type { JSX } from 'preact';
import { Avatar, type CategoryColor, Icon, ProgressBar, Tag } from '../../../ui';
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

/** Symbol je Rolle (Namen aus dem Icon-Set, keine Emojis). */
export const ROLE_ICONS: Record<StaffRole, string> = {
  runner: 'runner',
  courier: 'bike',
  security: 'shield',
  lawyer: 'scale',
  accountant: 'clipboard',
  policeContact: 'badge',
};

export const ORIGIN_NAMES: Record<StaffOrigin, string> = {
  street: 'von der Straße',
  pool: 'Bewerbung',
  referral: 'Empfehlung',
  regular: 'über einen Stammkunden',
  event: 'Kontakt aus dem Milieu',
};

/** Bedeutungsfarbe je Rolle (dieselbe Farbe, dasselbe Symbol, überall wo die Rolle vorkommt). */
export const ROLE_TONES: Record<StaffRole, CategoryColor> = {
  runner: 'people',
  courier: 'goods',
  security: 'danger',
  lawyer: 'law',
  accountant: 'money',
  policeContact: 'law',
};

/** Status als Etikett: Farbe, Symbol und Wort, nie Farbe allein. */
const STATUS_TAGS: Record<StaffStatus, { tone: CategoryColor; icon: string }> = {
  active: { tone: 'money', icon: 'check' },
  injured: { tone: 'danger', icon: 'bandage' },
  jailed: { tone: 'warn', icon: 'jail' },
  quit: { tone: 'system', icon: 'logout' },
  dead: { tone: 'system', icon: 'skull' },
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Porträt. Solange es keine Bilder gibt (portrait = null), ein Kreis in der Farbe der Rolle mit Initialen. */
export function Portrait(props: {
  person: { name: string; role: StaffRole; portrait: string | null };
  size?: 'sm' | 'lg';
}) {
  const { person } = props;
  const size = props.size ?? 'sm';
  const tone = ROLE_TONES[person.role];
  const cls = `staff-portrait staff-portrait--${size}`;
  return (
    <div class={cls} role="img" aria-label={`Porträt ${person.name}`}>
      <Avatar name={person.name} tone={tone} size={size === 'lg' ? 'lg' : 'md'} image={person.portrait ?? undefined} />
      <span
        class="staff-portrait__role"
        style={{ '--role-tone': `var(--cat-${tone})` } as JSX.CSSProperties}
        aria-hidden="true"
      >
        <Icon name={ROLE_ICONS[person.role]} />
      </span>
    </div>
  );
}

/** Status als Etikett ("Aktiv", "Verletzt", "In Haft" …). */
export function StatusTag(props: { status: StaffStatus }) {
  const { tone, icon } = STATUS_TAGS[props.status];
  return (
    <Tag category={tone} icon={icon}>
      {capitalize(STATUS_NAMES[props.status])}
    </Tag>
  );
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
