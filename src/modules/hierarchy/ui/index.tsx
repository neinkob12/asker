// Oberfläche der Hierarchie: Leutnants im Tab "Personal", Panel mit Delegations-Einstellungen und Protokoll,
// Beförderung im Mitarbeiter-Profil und ein Hinweis im Spot-Panel, wer das Veedel führt.

import { useState } from 'preact/hooks';
import { clock, formatEuro } from '../../../core';
import {
  Button,
  Card,
  Empty,
  Hint,
  KeyValue,
  List,
  ListItem,
  ProgressBar,
  registerPanel,
  registerSlot,
  SegmentedControl,
  Select,
  useGame,
  useUi,
} from '../../../ui';
import { getSpot, spotsInVeedel } from '../../spots';
import { getStaff, getStaffMember } from '../../staff';
import { allVeedel, veedelName } from '../../veedel';
import {
  CAUTION_LEVELS,
  type CautionLevel,
  canBeLieutenant,
  getLieutenant,
  getLieutenants,
  getPost,
  LIEUTENANT_MIN_LEVEL,
  type LieutenantSettings,
  lieutenantCapacity,
  lieutenantSatisfaction,
  lieutenantVeedel,
  MIN_STOCK_OPTIONS,
  PRICE_LEVELS,
  type PriceLevel,
  postSummary,
  RESERVE_OPTIONS,
} from '../index';
import './hierarchy.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'hierarchy.lieutenant': { veedelId: string };
  }
}

const satisfactionTone = (value: number) => (value < 35 ? 'bad' : value < 60 ? 'warn' : 'accent');

/** Leutnants im Tab "Personal". */
function LieutenantsSection() {
  const { state } = useGame();
  const ui = useUi();
  const posts = getLieutenants(state).sort(([a], [b]) => veedelName(a).localeCompare(veedelName(b)));
  return (
    <Card title="Leutnants">
      {posts.length === 0 ? (
        <Empty>
          Noch keine Leutnants. Befördere jemanden ab Level {LIEUTENANT_MIN_LEVEL} in dessen Akte, dann führt er ein
          Veedel selbstständig.
        </Empty>
      ) : (
        <List>
          {posts.map(([veedelId, staffId]) => {
            const m = getStaffMember(state, staffId);
            const post = getPost(state, veedelId);
            const satisfaction = lieutenantSatisfaction(state, veedelId) ?? 0;
            if (!m || !post) return null;
            return (
              <ListItem key={veedelId} onClick={() => ui.openPanel('hierarchy.lieutenant', { veedelId })}>
                <div class="lt-row">
                  <strong>{veedelName(veedelId)}</strong>
                  <span class="ui-hint">
                    {m.name} · {postSummary(state, post)}
                  </span>
                  <ProgressBar value={satisfaction / 100} tone={satisfactionTone(satisfaction)} label="Zufriedenheit" />
                </div>
              </ListItem>
            );
          })}
        </List>
      )}
    </Card>
  );
}

/** Detailansicht eines Leutnants: Lage, Zufriedenheit, Delegations-Einstellungen, Protokoll. */
function LieutenantPanel(props: { veedelId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const post = getPost(state, props.veedelId);
  const m = post ? getStaffMember(state, post.staffId) : undefined;
  if (!post || !m) return <Empty>In {veedelName(props.veedelId)} gibt es keinen Leutnant mehr.</Empty>;
  const satisfaction = lieutenantSatisfaction(state, props.veedelId) ?? 0;
  const configure = (settings: Partial<LieutenantSettings>) =>
    dispatch({ type: 'hierarchy.configure', payload: { veedelId: props.veedelId, settings } });
  const spots = spotsInVeedel(state, props.veedelId);
  return (
    <div class="lt-panel">
      <p class="ui-hint">
        <Button variant="link" onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
          {m.name}
        </Button>{' '}
        (Level {m.level}) führt {veedelName(props.veedelId)}: {postSummary(state, post)}.
      </p>
      <KeyValue label="Zufriedenheit" value={`${satisfaction} / 100`} />
      <ProgressBar value={satisfaction / 100} tone={satisfactionTone(satisfaction)} label="Zufriedenheit" />
      <KeyValue label="Offene Spots" value={`${spots.length} (er schafft ${lieutenantCapacity(m)})`} />
      <KeyValue
        label="Umsatz heute / gestern"
        value={`${formatEuro(post.revenueToday)} / ${formatEuro(post.revenueYesterday)}`}
      />
      <KeyValue label="Lohn" value={`${formatEuro(m.wage)} pro Tag`} />

      <h3 class="lt-title">Anweisungen</h3>
      <div class="lt-setting">
        <span>Mindestbestand (alle Waren zusammen)</span>
        <SegmentedControl
          aria-label="Mindestbestand"
          options={MIN_STOCK_OPTIONS.map((v) => ({ value: v, label: String(v) }))}
          value={post.settings.minStock}
          onChange={(minStock) => configure({ minStock })}
        />
      </div>
      <div class="lt-setting">
        <span>Preisniveau</span>
        <SegmentedControl
          aria-label="Preisniveau"
          options={(Object.keys(PRICE_LEVELS) as PriceLevel[]).map((k) => ({ value: k, label: PRICE_LEVELS[k].name }))}
          value={post.settings.priceLevel}
          onChange={(priceLevel) => configure({ priceLevel })}
        />
        <Hint>{PRICE_LEVELS[post.settings.priceLevel].hint}</Hint>
      </div>
      <div class="lt-setting">
        <span>Vorsicht</span>
        <SegmentedControl
          aria-label="Vorsicht"
          options={(Object.keys(CAUTION_LEVELS) as CautionLevel[]).map((k) => ({
            value: k,
            label: CAUTION_LEVELS[k].name,
          }))}
          value={post.settings.caution}
          onChange={(caution) => configure({ caution })}
        />
        <Hint>{CAUTION_LEVELS[post.settings.caution].hint}</Hint>
      </div>
      <div class="lt-setting">
        <span>Rücklage (fasst er nicht an)</span>
        <SegmentedControl
          aria-label="Rücklage"
          options={RESERVE_OPTIONS.map((v) => ({ value: v, label: formatEuro(v) }))}
          value={post.settings.reserve}
          onChange={(reserve) => configure({ reserve })}
        />
      </div>
      <div class="lt-setting lt-setting--inline">
        <span>Darf Ware bestellen</span>
        <SegmentedControl
          aria-label="Darf Ware bestellen"
          options={[
            { value: 'yes', label: 'Ja' },
            { value: 'no', label: 'Nein' },
          ]}
          value={post.settings.mayOrder ? 'yes' : 'no'}
          onChange={(v) => configure({ mayOrder: v === 'yes' })}
        />
      </div>
      <div class="lt-setting lt-setting--inline">
        <span>Darf Leute einstellen</span>
        <SegmentedControl
          aria-label="Darf Leute einstellen"
          options={[
            { value: 'yes', label: 'Ja' },
            { value: 'no', label: 'Nein' },
          ]}
          value={post.settings.mayHire ? 'yes' : 'no'}
          onChange={(v) => configure({ mayHire: v === 'yes' })}
        />
      </div>

      <h3 class="lt-title">Was er zuletzt getan hat</h3>
      {post.log.length === 0 ? (
        <Empty>Noch nichts.</Empty>
      ) : (
        <ol class="lt-log">
          {post.log.map((entry, i) => (
            <li key={`${entry.time}-${i}`}>
              <time>{clock.formatTime(entry.time)}</time> {entry.text}
            </li>
          ))}
        </ol>
      )}
      <Button
        variant="danger"
        wide
        onClick={() => {
          if (dispatch({ type: 'hierarchy.dismiss', payload: { veedelId: props.veedelId } }).ok) ui.closePanel();
        }}
      >
        Abberufen
      </Button>
    </div>
  );
}

/** Im Mitarbeiter-Profil: befördern bzw. Leutnant-Posten verwalten. */
function PromoteSection(props: { staffId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const current = lieutenantVeedel(state, props.staffId);
  const withSpots = allVeedel()
    .filter((v) => spotsInVeedel(state, v.id).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const [choice, setChoice] = useState(withSpots.find((v) => !getLieutenant(state, v.id))?.id ?? withSpots[0]?.id);
  if (current) {
    return (
      <section class="lt-promote">
        <h3 class="lt-title">Leutnant</h3>
        <p class="ui-hint">Führt {veedelName(current)} selbstständig.</p>
        <div class="lt-promote__row">
          <Button small onClick={() => ui.openPanel('hierarchy.lieutenant', { veedelId: current })}>
            Anweisungen
          </Button>
          <Button
            small
            variant="danger"
            onClick={() => dispatch({ type: 'hierarchy.dismiss', payload: { veedelId: current } })}
          >
            Abberufen
          </Button>
        </div>
      </section>
    );
  }
  const check = canBeLieutenant(state, props.staffId);
  return (
    <section class="lt-promote">
      <h3 class="lt-title">Befördern</h3>
      {check.ok ? (
        <div class="lt-promote__row">
          <Select
            label="Veedel"
            wide
            value={choice}
            options={withSpots.map((v) => {
              const lt = getLieutenant(state, v.id);
              const name = lt ? getStaffMember(state, lt)?.name : null;
              return { value: v.id, label: `${v.name}${name ? ` (jetzt: ${name})` : ''}` };
            })}
            onChange={setChoice}
          />
          <Button
            small
            variant="primary"
            disabled={!choice}
            onClick={() =>
              choice && dispatch({ type: 'hierarchy.appoint', payload: { staffId: props.staffId, veedelId: choice } })
            }
          >
            Zum Leutnant
          </Button>
        </div>
      ) : (
        <Hint>{check.reason}</Hint>
      )}
      {check.ok && <Hint>Ein Leutnant will mehr Lohn und führt das Veedel dann allein.</Hint>}
    </section>
  );
}

/** Im Spot-Panel: Wer führt dieses Veedel? */
function SpotLieutenant(props: { spotId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const spot = getSpot(state, props.spotId);
  const lt = spot ? getLieutenant(state, spot.veedelId) : null;
  const m = lt ? getStaffMember(state, lt) : undefined;
  if (!spot || !m) return null;
  return (
    <p class="ui-hint lt-spot">
      {veedelName(spot.veedelId)} wird von{' '}
      <Button variant="link" onClick={() => ui.openPanel('hierarchy.lieutenant', { veedelId: spot.veedelId })}>
        {m.name}
      </Button>{' '}
      geführt.
    </p>
  );
}

/** Im Veedel-Panel: Leutnant des Veedels oder jemanden ernennen. */
function VeedelLieutenant(props: { veedelId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const post = getPost(state, props.veedelId);
  const m = post ? getStaffMember(state, post.staffId) : undefined;
  const people = getStaff(state, { veedelId: props.veedelId });
  const eligible = getStaff(state)
    .filter((c) => canBeLieutenant(state, c.id).ok && !lieutenantVeedel(state, c.id))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const [choice, setChoice] = useState(eligible[0]?.id ?? '');
  const selected = eligible.find((c) => c.id === choice) ?? eligible[0];
  return (
    <Card title="Leutnant">
      {post && m ? (
        <>
          <p class="ui-hint">
            {m.name} (Level {m.level}) {postSummary(state, post)}.
          </p>
          <ProgressBar
            value={(lieutenantSatisfaction(state, props.veedelId) ?? 0) / 100}
            tone={satisfactionTone(lieutenantSatisfaction(state, props.veedelId) ?? 0)}
            label="Zufriedenheit"
          />
          <Button wide onClick={() => ui.openPanel('hierarchy.lieutenant', { veedelId: props.veedelId })}>
            Anweisungen
          </Button>
        </>
      ) : eligible.length > 0 && selected ? (
        <div class="lt-promote__row">
          <Select
            label="Wer"
            wide
            value={selected.id}
            options={eligible.map((c) => ({ value: c.id, label: `${c.name}, Level ${c.level}` }))}
            onChange={setChoice}
          />
          <Button
            small
            variant="primary"
            onClick={() =>
              dispatch({ type: 'hierarchy.appoint', payload: { staffId: selected.id, veedelId: props.veedelId } })
            }
          >
            Zum Leutnant
          </Button>
        </div>
      ) : (
        <Hint>Kein Leutnant. Ab Level {LIEUTENANT_MIN_LEVEL} kann jemand aus deinen Leuten das Veedel führen.</Hint>
      )}
      <Hint>
        {people.length === 0 ? 'Keine eigenen Leute hier.' : `${people.length} von deinen Leuten im Einsatz.`}
      </Hint>
    </Card>
  );
}

registerSlot('tab:staff', { id: 'hierarchy.lieutenants', order: 20, component: LieutenantsSection });
registerSlot('staff.profile', { id: 'hierarchy.promote', order: 10, component: PromoteSection });
registerSlot('veedel.veedelPanel', { id: 'hierarchy.veedel', order: 30, component: VeedelLieutenant });
registerSlot('spots.spotPanel', { id: 'hierarchy.spotLieutenant', order: 45, component: SpotLieutenant });
registerPanel({
  id: 'hierarchy.lieutenant',
  title: (props) => `Leutnant ${veedelName(props.veedelId)}`,
  component: LieutenantPanel,
});
