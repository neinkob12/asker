// Oberfläche der Hierarchie: Leutnant-Seite (Spots, Team, Personal, Einkauf, Straße, Protokoll), Ernennen als Blatt
// (Person → Spots → Bestätigen), Bestellregeln als Blatt, Leutnants im Tab "Leute", Beförderung in der Akte und
// "Geführt von …" auf der Spot- und Veedel-Seite. Gebaut aus Group/ListItem/ItemContent/SummaryTiles (Auftrag 22).

import { useState } from 'preact/hooks';
import { clock, formatEuro } from '../../../core';
import {
  ActionSheet,
  Button,
  Empty,
  Group,
  ItemContent,
  List,
  ListItem,
  registerPanel,
  registerSlot,
  Select,
  Stepper,
  SummaryTiles,
  Tag,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { lieutenantResult } from '../../finance';
import { getSpot, spotsInVeedel } from '../../spots';
import { activeRunnerAt, getStaffMember, runnerAt, STATUS_NAMES, securityAt } from '../../staff';
import { veedelName } from '../../veedel';
import {
  ABSENT_DAYS_OPTIONS,
  ABSENT_POLICIES,
  type AbsentPolicy,
  CAUTION_LEVELS,
  type CautionLevel,
  canBeLieutenant,
  getLieutenants,
  getPost,
  type LieutenantPost,
  lieutenantSatisfaction,
  lieutenantSpots,
  lieutenantsInVeedel,
  MAX_ORDER_RULES,
  MAX_SPOTS_PER_LIEUTENANT,
  type OrderRule,
  orderRuleLabel,
  PRICE_LEVELS,
  type PriceLevel,
  postSummary,
  type SettingsPatch,
  teamOf,
} from '../index';
import { AppointSheet } from './AppointSheet';
import './RightHand';
import { RuleSheet } from './RuleSheet';
import { StaffTree } from './Tree';
import './hierarchy.css';

declare module '../../../ui' {
  interface PanelRegistry {
    /** Leutnant-Seite. Alte Aufrufe mit veedelId zeigen den Leutnant dort. */
    'hierarchy.lieutenant': { staffId?: string; veedelId?: string };
    'hierarchy.log': { staffId: string };
  }
}

const satisfactionColor = (value: number) => (value < 35 ? 'danger' : value < 60 ? 'warn' : 'money');

function resolve(state: Parameters<typeof getPost>[0], props: { staffId?: string; veedelId?: string }) {
  if (props.staffId) return getPost(state, props.staffId);
  return props.veedelId ? getPost(state, lieutenantsInVeedel(state, props.veedelId)[0] ?? '') : undefined;
}

/** Eine Zeile pro Leutnant (Personal-Tab, Kasse, Veedel). */
export function LieutenantRow(props: { post: LieutenantPost }) {
  const { state } = useGame();
  const ui = useUi();
  const m = getStaffMember(state, props.post.staffId);
  if (!m) return null;
  const today = lieutenantResult(state, m.id, 1);
  const satisfaction = lieutenantSatisfaction(state, m.id) ?? 0;
  return (
    <ListItem
      onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: m.id })}
      value={
        <Tag category={satisfactionColor(satisfaction)} icon={satisfaction < 35 ? 'frown' : 'smile'}>
          {satisfaction} %
        </Tag>
      }
    >
      <ItemContent
        icon="crew"
        color={m.status === 'active' ? 'people' : 'warn'}
        title={m.name}
        meta={postSummary(state, props.post)}
        tags={[{ label: `heute ${formatEuro(today.revenue)} Umsatz`, icon: 'cash', color: 'money' }]}
      />
    </ListItem>
  );
}

/** Leutnant-Seite. */
function LieutenantPage(props: { staffId?: string; veedelId?: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [editSpots, setEditSpots] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const post = resolve(state, props);
  const m = post ? getStaffMember(state, post.staffId) : undefined;
  if (!post || !m) return <Empty icon="crew">Diese Person ist kein Leutnant mehr.</Empty>;
  const satisfaction = lieutenantSatisfaction(state, m.id) ?? 0;
  const today = lieutenantResult(state, m.id, 1);
  const yesterday = lieutenantResult(state, m.id, 1, 1);
  const configure = (settings: SettingsPatch) =>
    dispatch({ type: 'hierarchy.configure', payload: { staffId: m.id, settings } });
  return (
    <div class="lt-page">
      <SummaryTiles
        items={[
          { icon: 'smile', color: satisfactionColor(satisfaction), value: `${satisfaction} %`, label: 'Laune' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(m.wage), label: 'Lohn/Tag' },
          {
            icon: today.result >= 0 ? 'trendUp' : 'trendDown',
            color: today.result >= 0 ? 'money' : 'danger',
            value: formatEuro(today.result),
            label: 'Heute',
          },
        ]}
      />
      <Group title="Akte" icon="idCard" color="people">
        <List>
          <ListItem onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
            <ItemContent
              icon="crew"
              color="people"
              title={m.name}
              meta={postSummary(state, post)}
              tags={[
                { label: `Level ${m.level}` },
                { label: `Gestern ${formatEuro(yesterday.revenue)} Umsatz`, icon: 'cash', color: 'money' },
                {
                  label: `Ergebnis ${formatEuro(yesterday.result)}`,
                  icon: yesterday.result < 0 ? 'trendDown' : 'trendUp',
                  color: yesterday.result < 0 ? 'danger' : 'money',
                },
              ]}
            />
          </ListItem>
        </List>
      </Group>
      <SpotsGroup post={post} onEdit={() => setEditSpots(true)} />
      <TeamGroup post={post} />
      <StaffRights post={post} configure={configure} />
      <Purchasing post={post} configure={configure} />
      <StreetGroup post={post} configure={configure} />
      <LogGroup post={post} limit={5} />
      <div class="lt-actions">
        <Button variant="danger" onClick={() => setConfirmDismiss(true)}>
          Abberufen …
        </Button>
      </div>
      <AppointSheet open={editSpots} onClose={() => setEditSpots(false)} staffId={m.id} />
      <ActionSheet
        open={confirmDismiss}
        onClose={() => setConfirmDismiss(false)}
        title={`${m.name} abberufen?`}
        message="Er wird wieder normaler Mitarbeiter, ist etwas gekränkt und seine Spots laufen ohne Leutnant."
        actions={[
          {
            label: 'Abberufen',
            destructive: true,
            onSelect: () => {
              if (dispatch({ type: 'hierarchy.dismiss', payload: { staffId: m.id } }).ok) ui.closePanel();
            },
          },
        ]}
      />
    </div>
  );
}

/** Gruppe "Spots": drei Plätze, leere mit "Spot zuweisen", je Spot der Läufer mit Status. */
function SpotsGroup(props: { post: LieutenantPost; onEdit: () => void }) {
  const { state } = useGame();
  const ui = useUi();
  const spots = lieutenantSpots(state, props.post.staffId);
  const free = MAX_SPOTS_PER_LIEUTENANT - spots.length;
  return (
    <Group title="Spots" icon="pin" color="place" count={spots.length}>
      <List>
        {spots.map((spot) => {
          const runner = activeRunnerAt(state, spot.id);
          const away = runner ? undefined : runnerAt(state, spot.id);
          const guard = securityAt(state, { spotId: spot.id })[0];
          const hiding = props.post.lyingLow.includes(spot.veedelId);
          const tags = [
            runner
              ? { label: runner.name, icon: 'runner', color: 'people' as const }
              : away
                ? { label: `${away.name} ${STATUS_NAMES[away.status]}`, icon: 'clock', color: 'warn' as const }
                : { label: 'kein Läufer', icon: 'alert', color: 'warn' as const },
            guard ? { label: guard.name, icon: 'shield', color: 'danger' as const } : null,
          ];
          return (
            <ListItem
              key={spot.id}
              onClick={() => ui.openPanel('spots.spot', { spotId: spot.id })}
              value={
                hiding ? (
                  <Tag category="warn" icon="eyeOff">
                    abgetaucht
                  </Tag>
                ) : runner ? (
                  <Tag category="money" icon="check">
                    läuft
                  </Tag>
                ) : (
                  <Tag category="warn" icon="alert">
                    leer
                  </Tag>
                )
              }
            >
              <ItemContent icon="pin" color="place" title={spot.name} meta={veedelName(spot.veedelId)} tags={tags} />
            </ListItem>
          );
        })}
        {Array.from({ length: free }, (_, i) => (
          <ListItem key={`free-${i}`} action onClick={props.onEdit}>
            <ItemContent icon="pinPlus" color="place" title="Spot zuweisen" meta="Freier Platz" />
          </ListItem>
        ))}
        {spots.length > 0 && (
          <ListItem onClick={props.onEdit}>
            <ItemContent icon="edit" color="system" title="Spots ändern" />
          </ListItem>
        )}
      </List>
    </Group>
  );
}

function TeamGroup(props: { post: LieutenantPost }) {
  const { state } = useGame();
  const ui = useUi();
  const team = teamOf(state, props.post.staffId);
  if (team.length === 0) return null;
  return (
    <Group title="Team" icon="users" color="people" count={team.length}>
      <List>
        {team.map((t) => (
          <ListItem
            key={t.id}
            onClick={() => ui.openPanel('staff.profile', { staffId: t.id })}
            value={
              t.status === 'active' ? undefined : (
                <Tag category="warn" icon={t.status === 'jailed' ? 'jail' : 'bandage'}>
                  {STATUS_NAMES[t.status]}
                </Tag>
              )
            }
          >
            <ItemContent
              icon={t.role === 'security' ? 'shield' : 'runner'}
              color="people"
              title={t.name}
              tags={[
                { label: `Level ${t.level}` },
                { label: `${formatEuro(t.wage)} am Tag`, icon: 'coinEuro', color: 'money' },
                props.post.team.includes(t.id) && { label: 'von ihm angeheuert', icon: 'userPlus', color: 'people' },
              ]}
            />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

type Configure = (settings: SettingsPatch) => void;

/** Personal-Rechte: Anheuern mit Tagesbudget, Ausfälle. */
function StaffRights(props: { post: LieutenantPost; configure: Configure }) {
  const { state } = useGame();
  const s = props.post.settings;
  return (
    <Group
      title="Personal"
      icon="userPlus"
      color="people"
      note={`${ABSENT_POLICIES[s.onAbsent].hint} Aktive Leute entlässt er nie ohne dich.`}
    >
      <Toggle
        icon="userPlus"
        label="Darf anheuern"
        hint={`Heute ausgegeben: ${formatEuro(props.post.spentDay === clock.day(state.time) ? props.post.hireSpent : 0)}`}
        checked={s.mayHire}
        onChange={(mayHire) => props.configure({ mayHire })}
      />
      <List>
        <ListItem
          aside={
            <Stepper
              label="Budget pro Tag"
              value={s.hireBudgetPerDay}
              min={0}
              max={5000}
              step={100}
              format={(v) => formatEuro(v)}
              onChange={(hireBudgetPerDay) => props.configure({ hireBudgetPerDay })}
            />
          }
        >
          <ItemContent icon="coinEuro" color="money" title="Budget pro Tag" />
        </ListItem>
        <ListItem>
          <ItemContent icon="jail" color="warn" title="Ausfälle">
            <Select
              wide
              label="Ausfälle"
              value={s.onAbsent}
              options={(Object.keys(ABSENT_POLICIES) as AbsentPolicy[]).map((k) => ({
                value: k,
                label: ABSENT_POLICIES[k].name,
              }))}
              onChange={(onAbsent) => props.configure({ onAbsent })}
            />
          </ItemContent>
        </ListItem>
        {s.onAbsent === 'fireAndReplace' && (
          <ListItem
            aside={
              <Stepper
                label="Entlassen nach Tagen"
                value={s.absentDays}
                min={ABSENT_DAYS_OPTIONS[0]}
                max={ABSENT_DAYS_OPTIONS[ABSENT_DAYS_OPTIONS.length - 1]}
                format={(v) => (v === 1 ? '1 Tag' : `${v} Tage`)}
                onChange={(absentDays) => props.configure({ absentDays })}
              />
            }
          >
            <ItemContent icon="userMinus" color="danger" title="Entlassen nach" />
          </ListItem>
        )}
      </List>
    </Group>
  );
}

/** Einkauf: Bestellregeln (je Regel eine Zeile, Bearbeiten im Blatt), Rücklage. */
function Purchasing(props: { post: LieutenantPost; configure: Configure }) {
  const { state } = useGame();
  const [editing, setEditing] = useState<OrderRule | null | 'new'>(null);
  const s = props.post.settings;
  const save = (rule: OrderRule) => {
    const rules = editing === 'new' ? [...s.orderRules, rule] : s.orderRules.map((r) => (r.id === rule.id ? rule : r));
    props.configure({ orderRules: rules });
  };
  const remove = (id: string) => props.configure({ orderRules: s.orderRules.filter((r) => r.id !== id) });
  return (
    <Group
      title="Einkauf"
      icon="truck"
      color="goods"
      note="Er zählt den Bestand im Ziel-Lager und was dorthin unterwegs ist. Ruht eine Regel, weicht er nicht aus."
    >
      <Toggle
        icon="truck"
        label="Darf bestellen"
        checked={s.mayOrder}
        onChange={(mayOrder) => props.configure({ mayOrder })}
      />
      <List>
        {s.orderRules.map((rule) => (
          <ListItem
            key={rule.id}
            onClick={() => setEditing(rule)}
            value={
              rule.paused ? (
                <Tag category="warn" icon="pause">
                  ruht
                </Tag>
              ) : undefined
            }
          >
            <ItemContent
              icon="package"
              color="goods"
              title={orderRuleLabel(state, rule)}
              meta={rule.paused ?? undefined}
            />
          </ListItem>
        ))}
        {s.orderRules.length < MAX_ORDER_RULES && (
          <ListItem action onClick={() => setEditing('new')}>
            <ItemContent icon="plusCircle" color="goods" title="Regel hinzufügen" />
          </ListItem>
        )}
        <ListItem
          aside={
            <Stepper
              label="Rücklage"
              value={s.reserve}
              min={0}
              max={20000}
              step={250}
              format={(v) => formatEuro(v)}
              onChange={(reserve) => props.configure({ reserve })}
            />
          }
        >
          <ItemContent icon="lock" color="dirty" title="Rücklage" meta="fasst er nie an" />
        </ListItem>
      </List>
      <RuleSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        staffId={props.post.staffId}
        rule={editing === 'new' ? null : editing}
        onSave={save}
        onDelete={editing && editing !== 'new' ? () => remove(editing.id) : undefined}
      />
    </Group>
  );
}

/** Straße: Preise und Vorsicht. */
function StreetGroup(props: { post: LieutenantPost; configure: Configure }) {
  const s = props.post.settings;
  return (
    <Group
      title="Straße"
      icon="pin"
      color="place"
      note={`${PRICE_LEVELS[s.priceLevel].hint} ${CAUTION_LEVELS[s.caution].hint}`}
    >
      <List>
        <ListItem
          aside={
            <Select
              label="Preise"
              value={s.priceLevel}
              options={(Object.keys(PRICE_LEVELS) as PriceLevel[]).map((k) => ({
                value: k,
                label: PRICE_LEVELS[k].name,
              }))}
              onChange={(priceLevel) => props.configure({ priceLevel })}
            />
          }
        >
          <ItemContent icon="tag" color="money" title="Preise" />
        </ListItem>
        <ListItem
          aside={
            <Select
              label="Vorsicht"
              value={s.caution}
              options={(Object.keys(CAUTION_LEVELS) as CautionLevel[]).map((k) => ({
                value: k,
                label: CAUTION_LEVELS[k].name,
              }))}
              onChange={(caution) => props.configure({ caution })}
            />
          }
        >
          <ItemContent icon="eyeOff" color="law" title="Vorsicht" />
        </ListItem>
      </List>
    </Group>
  );
}

function LogGroup(props: { post: LieutenantPost; limit?: number }) {
  const ui = useUi();
  const entries = props.limit ? props.post.log.slice(0, props.limit) : props.post.log;
  return (
    <Group title="Protokoll" icon="journal" color="log">
      {entries.length === 0 ? (
        <Empty icon="journal">Noch nichts.</Empty>
      ) : (
        <List>
          {entries.map((entry, i) => (
            <ListItem key={`${entry.time}-${i}`} value={clock.formatTime(entry.time)}>
              <span class="lt-log-text">{entry.text}</span>
            </ListItem>
          ))}
          {props.limit && props.post.log.length > props.limit && (
            <ListItem onClick={() => ui.openPanel('hierarchy.log', { staffId: props.post.staffId })}>
              <ItemContent icon="list" color="system" title="Ganzes Protokoll" />
            </ListItem>
          )}
        </List>
      )}
    </Group>
  );
}

function LogPage(props: { staffId: string }) {
  const { state } = useGame();
  const post = getPost(state, props.staffId);
  if (!post) return <Empty icon="journal">Kein Protokoll.</Empty>;
  return (
    <div class="lt-page">
      <LogGroup post={post} />
    </div>
  );
}

/** In der Akte: befördern bzw. zur Leutnant-Seite. */
function PromoteSection(props: { staffId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const post = getPost(state, props.staffId);
  if (post) {
    return (
      <Group title="Leutnant" icon="crew" color="people">
        <List>
          <ListItem onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: props.staffId })}>
            <ItemContent icon="crew" color="people" title="Leutnant-Seite" meta={postSummary(state, post)} />
          </ListItem>
        </List>
      </Group>
    );
  }
  const check = canBeLieutenant(state, props.staffId);
  return (
    <Group
      title="Befördern"
      icon="crew"
      color="people"
      note={check.ok ? 'Ein Leutnant will mehr Lohn und führt seine Spots allein.' : undefined}
    >
      <List>
        {check.ok ? (
          <ListItem action onClick={() => setOpen(true)}>
            <ItemContent
              icon="crew"
              color="people"
              title="Zum Leutnant machen …"
              meta={`bis zu ${MAX_SPOTS_PER_LIEUTENANT} Spots`}
            />
          </ListItem>
        ) : (
          <ListItem>
            <ItemContent icon="crew" color="system" title="Noch kein Leutnant" meta={check.reason} />
          </ListItem>
        )}
      </List>
      <AppointSheet open={open} onClose={() => setOpen(false)} staffId={props.staffId} />
    </Group>
  );
}

/** Auf der Spot-Seite: "Geführt von …" oder "Leutnant zuweisen". */
function SpotLieutenant(props: { spotId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const spot = getSpot(state, props.spotId);
  if (!spot) return null;
  const post = getLieutenants(state).find((p) => p.spotIds.includes(props.spotId));
  const m = post ? getStaffMember(state, post.staffId) : undefined;
  return (
    <Group title="Leutnant" icon="crew" color="people">
      <List>
        {post && m ? (
          <ListItem onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: m.id })}>
            <ItemContent icon="crew" color="people" title={`Geführt von ${m.name}`} meta={postSummary(state, post)} />
          </ListItem>
        ) : (
          <ListItem action onClick={() => setOpen(true)}>
            <ItemContent
              icon="userPlus"
              color="people"
              title="Leutnant zuweisen"
              meta="Er führt den Spot dann für dich."
            />
          </ListItem>
        )}
      </List>
      <AppointSheet open={open} onClose={() => setOpen(false)} spotId={props.spotId} />
    </Group>
  );
}

/** Auf der Veedel-Seite: Leutnants mit Spots dort. */
function VeedelLieutenants(props: { veedelId: string }) {
  const { state } = useGame();
  const ids = lieutenantsInVeedel(state, props.veedelId);
  const spots = spotsInVeedel(state, props.veedelId);
  const unled = spots.filter((s) => !getLieutenants(state).some((p) => p.spotIds.includes(s.id)));
  if (spots.length === 0 && ids.length === 0) return null;
  return (
    <Group
      title="Leutnants"
      icon="crew"
      color="people"
      count={ids.length}
      note={unled.length > 0 ? `Ohne Leutnant: ${unled.map((s) => s.name).join(', ')}.` : undefined}
    >
      {ids.length === 0 ? (
        <Empty icon="crew">Kein Leutnant führt hier Spots.</Empty>
      ) : (
        <List>
          {ids.map((id) => {
            const post = getPost(state, id);
            return post ? <LieutenantRow key={id} post={post} /> : null;
          })}
        </List>
      )}
    </Group>
  );
}

registerSlot('staff.tree', { id: 'hierarchy.tree', order: 10, component: StaffTree });
registerSlot('staff.profile', { id: 'hierarchy.promote', order: 10, component: PromoteSection });
registerSlot('veedel.veedelPanel', { id: 'hierarchy.veedel', order: 30, component: VeedelLieutenants });
registerSlot('spots.spotPanel', { id: 'hierarchy.spotLieutenant', order: 45, component: SpotLieutenant });
registerPanel({
  id: 'hierarchy.lieutenant',
  title: (props, state) => {
    const post = resolve(state, props);
    return post ? `Leutnant ${getStaffMember(state, post.staffId)?.name ?? ''}` : 'Leutnant';
  },
  component: LieutenantPage,
});
registerPanel({
  id: 'hierarchy.log',
  title: (props, state) => `Protokoll ${getStaffMember(state, props.staffId)?.name ?? ''}`,
  component: LogPage,
});
