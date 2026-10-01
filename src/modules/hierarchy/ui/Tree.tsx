// Personal als Baum (Ansicht "Aufbau" im Tab "Leute", Slot 'staff.tree'): Du (Boss) → Rechte Hand → Leutnants mit
// ihren Spots, Status und Ergebnis heute → Spots ohne Leutnant (die du selbst führst). Darunter zeigt das Personal
// "Fällt aus", freie Leute, Spezialisten und die Bewerber. Gebaut aus Group, ListItem, ItemContent, Tag.

import { useState } from 'preact/hooks';
import { formatEuro } from '../../../core';
import { Group, ItemContent, List, ListItem, Tag, useGame, useUi } from '../../../ui';
import { dayReport, lieutenantResult, spotResult } from '../../finance';
import { getSpots, type Spot } from '../../spots';
import { activeRunnerAt, getStaff, getStaffMember, runnerAt, STATUS_NAMES, securityAt } from '../../staff';
import { veedelName } from '../../veedel';
import {
  canBeLieutenant,
  getLieutenants,
  getRightHand,
  isLieutenant,
  type LieutenantPost,
  lieutenantSpots,
  postSummary,
  rightHandOffered,
} from '../index';
import { AppointSheet } from './AppointSheet';
import { RightHandRow } from './RightHand';

/** Spot-Zeile: wer dort arbeitet, Status und Ergebnis heute. */
function SpotRow(props: { spot: Spot }) {
  const { state } = useGame();
  const ui = useUi();
  const { spot } = props;
  const runner = activeRunnerAt(state, spot.id);
  const away = runner ? undefined : runnerAt(state, spot.id);
  const guard = securityAt(state, { spotId: spot.id })[0];
  const today = spotResult(state, spot.id, 1);
  const people = [
    runner?.name ?? (away ? `${away.name} (${STATUS_NAMES[away.status]})` : 'kein Läufer'),
    guard ? `Sicherheit ${guard.name}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListItem
      onClick={() => ui.openPanel('spots.spot', { spotId: spot.id })}
      value={
        runner ? (
          formatEuro(today.result)
        ) : (
          <Tag category="warn" icon="alert">
            leer
          </Tag>
        )
      }
    >
      <ItemContent
        icon="pin"
        color={runner ? 'place' : 'warn'}
        title={spot.name}
        meta={`${veedelName(spot.veedelId)} · ${people}`}
      />
    </ListItem>
  );
}

/** Ein Leutnant mit seinen Spots (wer dort steht, Status, Ergebnis heute). */
function LieutenantBranch(props: { post: LieutenantPost }) {
  const { state } = useGame();
  const ui = useUi();
  const m = getStaffMember(state, props.post.staffId);
  if (!m) return null;
  const spots = lieutenantSpots(state, m.id);
  const today = lieutenantResult(state, m.id, 1);
  return (
    <Group title={`Leutnant ${m.name}`} icon="crew" color="people" count={spots.length}>
      <List>
        <ListItem
          onClick={() => ui.openPanel('hierarchy.lieutenant', { staffId: m.id })}
          value={formatEuro(today.result)}
        >
          <ItemContent
            icon="crew"
            color={m.status === 'active' ? 'people' : 'warn'}
            title={`${m.name} · Level ${m.level}`}
            meta={`${postSummary(state, props.post)} · Ergebnis heute`}
          />
        </ListItem>
        {spots.map((spot) => (
          <SpotRow key={spot.id} spot={spot} />
        ))}
      </List>
    </Group>
  );
}

export function StaffTree() {
  const { state } = useGame();
  const ui = useUi();
  const [appointing, setAppointing] = useState(false);
  const posts = getLieutenants(state);
  const led = new Set(posts.flatMap((p) => p.spotIds));
  const unled = getSpots(state).filter((s) => !led.has(s.id));
  const today = dayReport(state, 0);
  const anyone = getStaff(state).some((m) => canBeLieutenant(state, m.id).ok && !isLieutenant(state, m.id));
  const rh = getRightHand(state);
  return (
    <>
      <Group title="Boss" icon="crown" color="brand">
        <List>
          <ListItem onClick={() => ui.openPhone('finance.app')} value={formatEuro(today.profit)}>
            <ItemContent
              icon="user"
              color="brand"
              title="Du"
              meta={`${posts.length === 0 ? 'Keine Leutnants' : posts.length === 1 ? 'Ein Leutnant' : `${posts.length} Leutnants`} · Ergebnis heute`}
            />
          </ListItem>
          {(rh || rightHandOffered(state)) && <RightHandRow />}
        </List>
      </Group>
      {posts.map((post) => (
        <LieutenantBranch key={post.staffId} post={post} />
      ))}
      {(unled.length > 0 || anyone) && (
        <Group
          title="Ohne Leutnant"
          icon="pin"
          color="place"
          count={unled.length}
          note={unled.length > 0 ? 'Diese Spots führst du selbst.' : undefined}
        >
          <List>
            {unled.map((spot) => (
              <SpotRow key={spot.id} spot={spot} />
            ))}
            {anyone && (
              <ListItem action onClick={() => setAppointing(true)}>
                <ItemContent icon="userPlus" color="people" title="Leutnant ernennen" meta="bis zu drei Spots" />
              </ListItem>
            )}
          </List>
        </Group>
      )}
      <AppointSheet open={appointing} onClose={() => setAppointing(false)} />
    </>
  );
}
