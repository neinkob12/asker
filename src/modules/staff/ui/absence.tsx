// Ausfälle (Haft, verletzt): Gruppe "Fällt aus" in der Personal-Übersicht und ein Aktionsblatt mit allem, was man
// tun kann (Kaution, Ersetzen, Stillhaltegeld, Entlassen). Entlassen ist damit nicht mehr nur über langen Druck
// erreichbar, sondern in zwei Tipps, mit Hinweis, ob die Person reden könnte.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent } from '../../../core';
import {
  ActionSheet,
  Button,
  Group,
  ItemContent,
  List,
  ListItem,
  type SheetAction,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
import { atSpotStart, getSpot } from '../../spots';
import { bailCost, effectiveWage, isAbsent, type StaffMember, talkChance } from '../index';

/** Kurztext zum Ausfall: bis wann, was es pro Tag kostet. */
export function absenceText(m: StaffMember): string {
  const until = m.statusUntil !== null ? `bis Tag ${clock.day(m.statusUntil)}, ${clock.formatTime(m.statusUntil)}` : '';
  const cost = effectiveWage(m);
  const costText =
    m.status === 'jailed'
      ? m.jailSupport
        ? `${formatEuro(cost)} Stillhaltegeld pro Tag`
        : 'kein Stillhaltegeld'
      : `${formatEuro(cost)} pro Tag (halber Lohn)`;
  return `${m.status === 'jailed' ? `In Haft ${until}` : `Verletzt ${until}`}, ${costText}`;
}

/** Hinweis fürs Entlassen: Könnte die Person reden? */
export function talkHint(m: StaffMember): string {
  const chance = talkChance(m);
  return chance > 0
    ? `${m.name} ist nicht gut auf dich zu sprechen und könnte reden (${formatPercent(chance)}). Das bringt Heat.`
    : `${m.name} hält dicht.`;
}

/** Aktionsblatt für eine ausgefallene Person (oder jede andere: dann nur Entlassen). */
export function AbsenceSheet(props: { member: StaffMember; open: boolean; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const m = props.member;
  const actions: SheetAction[] = [];
  if (m.status === 'jailed') {
    const cost = bailCost(state, m.id);
    actions.push({
      label: `Kaution zahlen (${formatEuro(cost)})`,
      icon: 'scale',
      disabled: state.wallet.dirty < cost,
      onSelect: () => dispatch({ type: 'staff.bail', payload: { staffId: m.id } }),
    });
  }
  const atSpot = isAbsent(m) && m.returnTo?.kind === 'spot' && (m.role === 'runner' || m.role === 'security');
  const spot = atSpot && m.returnTo ? getSpot(state, m.returnTo.targetId) : undefined;
  if (atSpot) {
    actions.push({
      label: spot ? `${atSpotStart(spot)} ersetzen` : 'Am Spot ersetzen',
      icon: 'userPlus',
      onSelect: () => dispatch({ type: 'staff.replace', payload: { staffId: m.id } }),
    });
  }
  if (m.status === 'jailed') {
    actions.push({
      label: m.jailSupport ? 'Kein Stillhaltegeld mehr' : 'Wieder Stillhaltegeld zahlen',
      icon: 'jail',
      onSelect: () => dispatch({ type: 'staff.setJailSupport', payload: { staffId: m.id, enabled: !m.jailSupport } }),
    });
  }
  actions.push({
    label: atSpot ? 'Entlassen und ersetzen' : 'Entlassen',
    icon: 'userMinus',
    destructive: true,
    onSelect: () =>
      dispatch(
        atSpot
          ? { type: 'staff.replace', payload: { staffId: m.id, fire: true } }
          : { type: 'staff.fire', payload: { staffId: m.id } },
      ),
  });
  return (
    <ActionSheet
      open={props.open}
      onClose={props.onClose}
      title={isAbsent(m) ? `${m.name}: ${absenceText(m)}` : `${m.name} entlassen?`}
      message={talkHint(m)}
      actions={actions}
    />
  );
}

function AbsentRow(props: { member: StaffMember }) {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const m = props.member;
  return (
    <>
      <ListItem
        onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}
        aside={
          <Button small onClick={() => setOpen(true)}>
            Was tun?
          </Button>
        }
      >
        <ItemContent
          icon={m.status === 'jailed' ? 'jail' : 'bandage'}
          color={m.status === 'jailed' ? 'warn' : 'danger'}
          title={m.name}
          meta={absenceText(m)}
        >
          {m.status === 'jailed' && !m.jailSupport && (
            <Tag category="danger" icon="alert">
              redet eher
            </Tag>
          )}
        </ItemContent>
      </ListItem>
      <AbsenceSheet member={m} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Gruppe "Fällt aus": Haft und Verletzte mit Rückkehr, Kosten pro Tag und Aktionen. */
export function AbsentGroup(props: { members: StaffMember[] }) {
  const { state } = useGame();
  if (props.members.length === 0) return null;
  const total = props.members.reduce((sum, m) => sum + effectiveWage(m), 0);
  const jailed = props.members.filter((m) => m.status === 'jailed');
  const bail = jailed.reduce((sum, m) => sum + bailCost(state, m.id), 0);
  return (
    <Group
      title="Fällt aus"
      icon="alert"
      color="warn"
      count={props.members.length}
      note={`Kostet zusammen ${formatEuro(total)} pro Tag${jailed.length > 0 ? `, Kaution für alle ${formatEuro(bail)}` : ''}.`}
    >
      <List>
        {props.members.map((m) => (
          <AbsentRow key={m.id} member={m} />
        ))}
      </List>
    </Group>
  );
}
