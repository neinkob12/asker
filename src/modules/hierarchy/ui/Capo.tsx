// Capo (Auftrag 34): Abschnitt auf der Leutnant-Seite (zum Capo machen, Leutnants seines Bezirks wählen, abberufen)
// und die Capo-Gruppe im Personal-Baum. Gebaut aus Group, ListItem, ItemContent, Sheet, Toggle.

import { useState } from 'preact/hooks';
import { formatEuro } from '../../../core';
import { ActionSheet, Button, Group, ItemContent, List, ListItem, Sheet, Toggle, useGame, useUi } from '../../../ui';
import { lieutenantResult } from '../../finance';
import { getStaffMember } from '../../staff';
import { tutorialAllows } from '../../tutorial';
import { veedelName } from '../../veedel';
import {
  CAPO_MAX_LIEUTENANTS,
  CAPO_MIN_LEVEL,
  type CapoPost,
  canBeCapo,
  capoCandidates,
  capoDistrict,
  capoOf,
  getCapo,
  lieutenantSpots,
  MAX_SPOTS_PER_LIEUTENANT,
  postSummary,
} from '../index';

/** Blatt: Leutnants im Bezirk an- und abwählen (höchstens CAPO_MAX_LIEUTENANTS). */
function CapoSheet(props: { staffId: string; open: boolean; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const current = getCapo(state, props.staffId)?.lieutenants ?? [];
  const [chosen, setChosen] = useState<string[]>(current);
  const candidates = capoCandidates(state, props.staffId);
  const m = getStaffMember(state, props.staffId);
  const toggle = (id: string, on: boolean) =>
    setChosen((list) =>
      on ? [...list.filter((x) => x !== id), id].slice(-CAPO_MAX_LIEUTENANTS) : list.filter((x) => x !== id),
    );
  return (
    <Sheet open={props.open} onClose={props.onClose} title={`Capo ${m?.name ?? ''}`} detents={['medium', 'large']}>
      <Group
        title="Leutnants im Bezirk"
        icon="crew"
        color="people"
        note={`Bis zu ${CAPO_MAX_LIEUTENANTS} Leutnants mit Spots in ${capoDistrict(state, props.staffId).map(veedelName).join(', ')}.`}
      >
        {candidates.length === 0 ? (
          <p class="ui-hint">Kein Leutnant hat Spots in seinem Bezirk.</p>
        ) : (
          candidates.map((id) => {
            const lt = getStaffMember(state, id);
            return (
              <Toggle
                key={id}
                icon="crew"
                label={lt?.name ?? id}
                hint={lieutenantSpots(state, id)
                  .map((s) => s.name)
                  .join(', ')}
                checked={chosen.includes(id)}
                onChange={(on) => toggle(id, on)}
              />
            );
          })
        )}
      </Group>
      <div class="lt-actions">
        <Button
          variant="primary"
          onClick={() => {
            const result = dispatch({
              type: 'hierarchy.appointCapo',
              payload: { staffId: props.staffId, lieutenantIds: chosen },
            });
            if (result.ok) props.onClose();
          }}
        >
          {getCapo(state, props.staffId) ? 'Übernehmen' : 'Zum Capo machen'}
        </Button>
      </div>
    </Sheet>
  );
}

/** Abschnitt auf der Leutnant-Seite: Capo werden, sein Bezirk, unter welchem Capo er steht. */
export function CapoGroup(props: { staffId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const capo = getCapo(state, props.staffId);
  const above = capoOf(state, props.staffId);
  const check = canBeCapo(state, props.staffId);
  const m = getStaffMember(state, props.staffId);
  if (!m) return null;
  // Auftrag 46e: Im Tutorial werden Capos nicht angeboten (ein bestehender Capo bleibt sichtbar).
  if (!capo && !above && !tutorialAllows(state, 'staff.capos')) return null;
  if (above) {
    const boss = getStaffMember(state, above);
    return (
      <Group title="Capo" icon="crown" color="brand">
        <List>
          <ListItem onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: above })}>
            <ItemContent
              icon="crown"
              color="brand"
              title={boss?.name ?? above}
              meta="führt ihn, springt bei Ausfällen ein"
            />
          </ListItem>
        </List>
      </Group>
    );
  }
  if (!capo) {
    return (
      <Group
        title="Capo"
        icon="crown"
        color="brand"
        note={
          check.ok
            ? 'Führt bis zu drei Leutnants in den Veedeln drumherum, verlangt doppelten Lohn.'
            : `Capo kann werden, wer Level ${CAPO_MIN_LEVEL} hat und ${MAX_SPOTS_PER_LIEUTENANT} Spots führt.`
        }
      >
        <List>
          <ListItem action disabled={!check.ok} onClick={() => setEditing(true)}>
            <ItemContent
              icon="crown"
              color="brand"
              title="Zum Capo machen …"
              meta={check.ok ? undefined : check.reason}
            />
          </ListItem>
        </List>
        <CapoSheet staffId={props.staffId} open={editing} onClose={() => setEditing(false)} />
      </Group>
    );
  }
  return (
    <Group title="Capo" icon="crown" color="brand" count={capo.lieutenants.length} note={capo.log[0]?.text}>
      <List>
        {capo.lieutenants.map((id) => (
          <ListItem key={id} onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: id })}>
            <ItemContent
              icon="crew"
              color="people"
              title={getStaffMember(state, id)?.name ?? id}
              meta="Leutnant im Bezirk"
            />
          </ListItem>
        ))}
        <ListItem action onClick={() => setEditing(true)}>
          <ItemContent icon="edit" color="people" title="Leutnants wählen …" />
        </ListItem>
        <ListItem action tone="bad" onClick={() => setConfirm(true)}>
          <ItemContent icon="userMinus" color="danger" title="Als Capo abberufen …" />
        </ListItem>
      </List>
      <CapoSheet staffId={props.staffId} open={editing} onClose={() => setEditing(false)} />
      <ActionSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`${m.name} als Capo abberufen?`}
        message="Er bleibt Leutnant, verlangt wieder normalen Lohn und ist etwas gekränkt."
        actions={[
          {
            label: 'Abberufen',
            destructive: true,
            onSelect: () => dispatch({ type: 'hierarchy.dismissCapo', payload: { staffId: m.id } }),
          },
        ]}
      />
    </Group>
  );
}

/** Personal-Baum: ein Capo mit den Leutnants seines Bezirks (Ebene zwischen Rechter Hand und Leutnants). */
export function CapoBranch(props: { capo: CapoPost }) {
  const { state } = useGame();
  const ui = useUi();
  const m = getStaffMember(state, props.capo.staffId);
  if (!m) return null;
  const ids = [m.id, ...props.capo.lieutenants];
  const result = ids.reduce((sum, id) => sum + lieutenantResult(state, id, 1).result, 0);
  return (
    <Group title={`Capo ${m.name}`} icon="crown" color="brand" count={props.capo.lieutenants.length}>
      <List>
        <ListItem onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: m.id })} value={formatEuro(result)}>
          <ItemContent
            icon="crown"
            color={m.status === 'active' ? 'brand' : 'warn'}
            title={m.name}
            meta="Bezirk heute"
            tags={[
              { label: `Level ${m.level}` },
              { label: `${formatEuro(m.wage)}/Tag`, icon: 'coinEuro', color: 'money' },
            ]}
          />
        </ListItem>
        {props.capo.lieutenants.map((id) => {
          const lt = getStaffMember(state, id);
          const post = state.modules.hierarchy.posts[id];
          if (!lt || !post) return null;
          return (
            <ListItem
              key={id}
              onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: id })}
              value={formatEuro(lieutenantResult(state, id, 1).result)}
            >
              <ItemContent
                icon="crew"
                color={lt.status === 'active' ? 'people' : 'warn'}
                title={lt.name}
                meta={postSummary(state, post)}
                tags={[lt.status !== 'active' && { label: 'Capo vertritt', icon: 'crown', color: 'warn' }]}
              />
            </ListItem>
          );
        })}
      </List>
    </Group>
  );
}
