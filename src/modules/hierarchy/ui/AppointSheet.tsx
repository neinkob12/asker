// Ernennen in einem Fluss (Blatt): Person wählen → Spots wählen (bis zu drei, mit Andrang, Veedel und Fahrzeit
// zwischen den Spots über roads) → bestätigen mit dem neuen Lohn. Erreichbar aus dem Personal-Tab, der Akte und der
// Spot-Seite. Für einen Leutnant, der schon führt, ändert dasselbe Blatt nur seine Spots.

import { useEffect, useState } from 'preact/hooks';
import { formatEuro } from '../../../core';
import {
  Button,
  Disclosure,
  Empty,
  Group,
  haptic,
  Icon,
  ItemContent,
  List,
  ListItem,
  Sheet,
  Tag,
  useGame,
} from '../../../ui';
import { activeCity } from '../../city';
import { travelMinutes } from '../../roads';
import { getSpot, getSpots, type Spot } from '../../spots';
import { expectedWageFor, getStaff, getStaffMember, roleName } from '../../staff';
import { veedelName } from '../../veedel';
import {
  canBeLieutenant,
  DEFAULT_SETTINGS,
  getPost,
  isLieutenant,
  LIEUTENANT_MIN_LEVEL,
  lieutenantDemand,
  lieutenantOfSpot,
  MAX_SPOTS_PER_LIEUTENANT,
} from '../index';

/** Zu Fuß bzw. mit dem Roller zwischen zwei Spots (Meter pro Spielminute). */
const SCOOTER_SPEED = 250;

export interface AppointSheetProps {
  open: boolean;
  onClose: () => void;
  /** Person steht schon fest (aus der Akte oder der Leutnant-Seite). */
  staffId?: string;
  /** Spot ist vorgewählt (aus der Spot-Seite). */
  spotId?: string;
}

type Step = 'person' | 'spots' | 'confirm';

export function AppointSheet(props: AppointSheetProps) {
  const { state, dispatch } = useGame();
  const [step, setStep] = useState<Step>(props.staffId ? 'spots' : 'person');
  const [staffId, setStaffId] = useState<string | undefined>(props.staffId);
  const initialSpots = () => {
    const current = props.staffId ? (getPost(state, props.staffId)?.spotIds ?? []) : [];
    const extra = props.spotId && !current.includes(props.spotId) ? [props.spotId] : [];
    return [...current, ...extra].slice(0, MAX_SPOTS_PER_LIEUTENANT);
  };
  const [spotIds, setSpotIds] = useState<string[]>(initialSpots);

  // Beim Öffnen von vorn beginnen.
  useEffect(() => {
    if (!props.open) return;
    setStep(props.staffId ? 'spots' : 'person');
    setStaffId(props.staffId);
    setSpotIds(initialSpots());
  }, [props.open]);

  const member = staffId ? getStaffMember(state, staffId) : undefined;
  const existing = staffId ? isLieutenant(state, staffId) : false;
  const title = existing ? `Spots von ${member?.name ?? ''}` : 'Leutnant ernennen';

  const finish = () => {
    if (!staffId) return;
    const result = existing
      ? dispatch({ type: 'hierarchy.setSpots', payload: { staffId, spotIds } })
      : dispatch({ type: 'hierarchy.appoint', payload: { staffId, spotIds } });
    if (result.ok) {
      haptic('success');
      props.onClose();
    }
  };

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={title}
      detents={['large']}
      action={
        step === 'confirm' || (existing && step === 'spots') ? (
          <Button small variant="primary" disabled={spotIds.length === 0} onClick={finish}>
            {existing ? 'Sichern' : 'Ernennen'}
          </Button>
        ) : step === 'spots' ? (
          <Button small variant="primary" disabled={spotIds.length === 0} onClick={() => setStep('confirm')}>
            Weiter
          </Button>
        ) : undefined
      }
    >
      <div class="lt-sheet">
        {step === 'person' && (
          <PersonStep
            onPick={(id) => {
              setStaffId(id);
              setStep('spots');
            }}
          />
        )}
        {step === 'spots' && staffId && <SpotsStep staffId={staffId} value={spotIds} onChange={setSpotIds} />}
        {step === 'confirm' && staffId && (
          <ConfirmStep staffId={staffId} spotIds={spotIds} onBack={() => setStep('spots')} />
        )}
      </div>
    </Sheet>
  );
}

function PersonStep(props: { onPick: (staffId: string) => void }) {
  const { state } = useGame();
  const candidates = getStaff(state)
    .filter((m) => !isLieutenant(state, m.id) && m.assignment?.kind !== 'office')
    .map((m) => ({ m, check: canBeLieutenant(state, m.id) }))
    .filter(({ m }) => m.role === 'runner' || m.role === 'security' || m.role === 'driver')
    .sort(
      (a, b) => Number(b.check.ok) - Number(a.check.ok) || b.m.level - a.m.level || a.m.name.localeCompare(b.m.name),
    );
  if (candidates.length === 0) {
    return <Empty icon="users">Noch niemand im Team, der Spots führen könnte.</Empty>;
  }
  return (
    <Group
      title="Wer soll führen?"
      icon="crew"
      color="people"
      note={`Ab Level ${LIEUTENANT_MIN_LEVEL}.`}
      more="Ein Leutnant will mehr Lohn und führt seine Spots dann allein: Preise, eigenes Personal, Nachbestellen nach Regeln."
    >
      <List>
        {candidates.map(({ m, check }) => (
          <ListItem key={m.id} onClick={check.ok ? () => props.onPick(m.id) : undefined} disabled={!check.ok}>
            <ItemContent
              icon="user"
              color={check.ok ? 'people' : 'system'}
              title={m.name}
              meta={check.ok ? undefined : check.reason}
              tags={
                check.ok
                  ? [{ label: roleName(m.role), icon: 'user', color: 'people' }, { label: `Level ${m.level}` }]
                  : []
              }
            />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

/** Fahrzeit vom nächsten schon gewählten Spot (Minuten), für die Zweitzeile. */
function nearestTravel(spot: Spot, chosen: Spot[]): number | null {
  const others = chosen.filter((s) => s.id !== spot.id);
  if (others.length === 0) return null;
  return Math.min(...others.map((o) => travelMinutes(o, spot, SCOOTER_SPEED)));
}

function SpotsStep(props: { staffId: string; value: string[]; onChange: (spotIds: string[]) => void }) {
  const { state } = useGame();
  const chosen = props.value.map((id) => getSpot(state, id)).filter((s): s is Spot => !!s);
  const full = props.value.length >= MAX_SPOTS_PER_LIEUTENANT;
  const spots = [...getSpots(state, activeCity(state))].sort(
    (a, b) => veedelName(a.veedelId).localeCompare(veedelName(b.veedelId)) || b.demand - a.demand,
  );
  const toggle = (id: string) => {
    haptic('selection');
    props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
  };
  return (
    <Group
      title={`Spots wählen (${props.value.length}/${MAX_SPOTS_PER_LIEUTENANT})`}
      icon="pin"
      color="place"
      note="Spots im selben Veedel bringen dort mehr Einfluss."
      more="Ein Spot hat höchstens einen Leutnant. Verstreute Spots bringen weniger Einfluss pro Veedel, und die Wege zwischen ihnen kosten Zeit."
    >
      <List>
        {spots.map((spot) => {
          const owner = lieutenantOfSpot(state, spot.id);
          const taken = owner && owner !== props.staffId ? getStaffMember(state, owner)?.name : null;
          const selected = props.value.includes(spot.id);
          const travel = selected ? null : nearestTravel(spot, chosen);
          return (
            <ListItem
              key={spot.id}
              active={selected}
              disabled={!!taken || (!selected && full)}
              onClick={taken || (!selected && full) ? undefined : () => toggle(spot.id)}
              aside={
                <Icon name={selected ? 'checkCircle' : 'plusCircle'} class={selected ? 'lt-check' : 'lt-uncheck'} />
              }
            >
              <ItemContent
                icon="pin"
                color={selected ? 'place' : 'system'}
                title={spot.name}
                meta={veedelName(spot.veedelId)}
                tags={[
                  { label: `Andrang ${Math.round(spot.demand * 100)} %`, icon: 'users', color: 'people' },
                  travel !== null && { label: `${travel} Min. zum nächsten`, icon: 'route' },
                  !!taken && { label: `führt ${taken}`, icon: 'crew', color: 'warn' },
                ]}
              />
            </ListItem>
          );
        })}
      </List>
    </Group>
  );
}

function ConfirmStep(props: { staffId: string; spotIds: string[]; onBack: () => void }) {
  const { state } = useGame();
  const m = getStaffMember(state, props.staffId);
  if (!m) return null;
  const wage = Math.max(m.wage, expectedWageFor(m.role, m.level, lieutenantDemand(props.spotIds.length)));
  return (
    <>
      <Group title="Bestätigen" icon="crew" color="people">
        <List>
          <ListItem value={formatEuro(wage)}>
            <ItemContent
              icon="coinEuro"
              color="money"
              title="Neuer Lohn pro Tag"
              meta={`bisher ${formatEuro(m.wage)}, Anspruch steigt mit der Zahl der Spots`}
            />
          </ListItem>
          {props.spotIds.map((id) => {
            const spot = getSpot(state, id);
            return (
              <ListItem
                key={id}
                value={
                  <Tag category="place" icon="pin">
                    {spot ? veedelName(spot.veedelId) : ''}
                  </Tag>
                }
              >
                <ItemContent icon="pin" color="place" title={spot?.name ?? id} />
              </ListItem>
            );
          })}
        </List>
      </Group>
      <Disclosure label="Was macht ein Leutnant?">
        {m.name} heuert an (Tagesbudget {formatEuro(DEFAULT_SETTINGS.hireBudgetPerDay)}), ersetzt Ausfälle und bestellt
        nach seinen Regeln. Ändern kannst du das auf seiner Seite.
      </Disclosure>
      <div class="lt-actions">
        <Button onClick={props.onBack}>Zurück zu den Spots</Button>
      </div>
    </>
  );
}
