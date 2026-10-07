// Gemeinsame Bausteine der Personal-Oberfläche: Porträt (Platzhalter), Status-Stempel, Werte-Balken.

import type { JSX } from 'preact';
import { formatPercent, type GameState, personLook } from '../../../core';
import { Avatar, type CategoryColor, type ChipSpec, Icon, ProgressBar, Tag } from '../../../ui';
import {
  bonus,
  bonusProvider,
  RELATIONS,
  type RelationKind,
  ROLE_INFO,
  STAT_KEYS,
  STAT_NAMES,
  STATUS_NAMES,
  type StaffMember,
  type StaffOrigin,
  type StaffRole,
  type StaffStats,
  type StaffStatus,
  type StatKey,
  specialistEffectLabel,
  specialistEffectsOf,
  TRAITS,
  type TraitId,
  traitName,
} from '../index';

/** Farbe einer Eigenschaft: gut grün, schlecht rot, beides gelb (Auftrag 34). */
const TONE_COLORS: Record<'good' | 'bad' | 'mixed', CategoryColor> = { good: 'money', bad: 'danger', mixed: 'warn' };

/** Eigenschaften als Chips (Symbol, Farbe, Name; der Satz dazu als Tooltip). */
export function traitChips(person: { name: string; traits?: readonly TraitId[] }): ChipSpec[] {
  return (person.traits ?? []).map((t) => ({
    label: traitName(t, person.name),
    icon: TRAITS[t].icon,
    color: TONE_COLORS[TRAITS[t].tone],
    title: TRAITS[t].hint,
  }));
}

/**
 * Wirkungen eines Spezialisten als Chips (Auftrag 46e), z.B. „Zoll −30 %“; dazu Kaution und Razzia-Warnung aus den
 * alten Boni, wenn die Person sie liefert.
 */
export function effectChips(state: GameState, member: StaffMember): ChipSpec[] {
  const chips: ChipSpec[] = specialistEffectsOf(member).map((line) => ({
    label: specialistEffectLabel(line),
    icon: line.def.icon,
    color: line.def.kind === 'more' ? 'money' : 'law',
    title: line.def.hint,
  }));
  const city = member.cityId ?? 'koeln';
  if (member.role === 'lawyer' && bonusProvider(state, 'bailDiscount', city)?.id === member.id) {
    chips.push({
      label: `Kaution −${formatPercent(bonus(state, 'bailDiscount', city))}`,
      icon: 'scale',
      color: 'law',
      title: 'Kaution für Leute in Haft',
    });
  }
  if (member.role === 'policeContact' && bonusProvider(state, 'raidWarning', city)?.id === member.id) {
    chips.push({
      label: `Warnt zu ${formatPercent(bonus(state, 'raidWarning', city))}`,
      icon: 'bell',
      color: 'law',
      title: 'Warnung vor einer geplanten Razzia',
    });
  }
  return chips;
}

/** Symbol und Farbe einer Beziehung. */
export function relationLook(kind: RelationKind): { icon: string; color: CategoryColor } {
  return { icon: RELATIONS[kind].icon, color: RELATIONS[kind].tone === 'good' ? 'people' : 'danger' };
}

/** Symbol je Rolle (Namen aus dem Icon-Set, keine Emojis). */
export const ROLE_ICONS: Record<StaffRole, string> = {
  runner: 'runner',
  courier: 'bike',
  driver: 'truck',
  security: 'shield',
  lawyer: 'scale',
  accountant: 'clipboard',
  policeContact: 'badge',
  worker: 'leaf',
  gardener: 'flask',
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
  driver: 'goods',
  security: 'danger',
  lawyer: 'law',
  accountant: 'money',
  policeContact: 'law',
  worker: 'goods',
  gardener: 'goods',
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

/**
 * Porträt. Ohne Bild (portrait = null) ein gezeichnetes Gesicht aus Name und Alter (personLook, dasselbe wie im Chat),
 * im Kreis in der Farbe der Rolle.
 */
export function Portrait(props: {
  person: { name: string; role: StaffRole; portrait: string | null; age?: number };
  size?: 'sm' | 'lg';
}) {
  const { person } = props;
  const size = props.size ?? 'sm';
  const tone = ROLE_TONES[person.role];
  const cls = `staff-portrait staff-portrait--${size}`;
  return (
    <div class={cls} role="img" aria-label={`Porträt ${person.name}`}>
      <Avatar
        name={person.name}
        tone={tone}
        size={size === 'lg' ? 'lg' : 'md'}
        image={person.portrait ?? undefined}
        look={personLook(person.name, person.age)}
      />
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
