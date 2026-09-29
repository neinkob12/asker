// Oberfläche der Gangs: Tab "Gangs" mit Stärke, Revier, Beziehung und Diplomatie-Aktionen je Gang,
// Dialoge für Überfall und Bündnis, Hinweise auf der Karte und Toasts, wenn die Gangs etwas tun.

import { useState } from 'preact/hooks';
import { clock, formatAmount, formatEuro } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  Button,
  Card,
  Dialog,
  Hint,
  Icon,
  KeyValue,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  readableOn,
  registerDialog,
  registerSearch,
  registerTab,
  Stat,
  useGame,
  useUi,
} from '../../../ui';
import { canSnitch } from '../../police';
import { getStaff } from '../../staff';
import { getInfluence } from '../../territory';
import { veedelName } from '../../veedel';
import {
  ALLIANCE_COST,
  ceasefireCost,
  GANG_SPOT_MIN_INFLUENCE,
  type Gang,
  gangPower,
  gangVeedel,
  getGang,
  getGangStatus,
  getGangs,
  hasCeasefire,
  isAllied,
  isGangBroken,
  paysTribute,
  playerPower,
  protectionAmount,
  STAGE_NAMES,
  tributeAmount,
  WARN_AT,
} from '../index';
import { gangsLayer } from './map';
import './island';
import './gangs.css';

declare module '../../../ui' {
  interface DialogRegistry {
    'gangs.attack': { gangId: string };
    'gangs.ally': { gangId: string };
  }
}

function hostilityTone(value: number): 'accent' | 'warn' | 'bad' {
  if (value >= 70) return 'bad';
  if (value >= 25) return 'warn';
  return 'accent';
}

function relationText(value: number): string {
  if (value >= 40) return 'Partner';
  if (value >= 10) return 'freundlich';
  if (value > -10) return 'neutral';
  if (value > -50) return 'feindlich';
  return 'Todfeind';
}

/** Laufende Abmachungen und Aktivitäten einer Gang als kurze Sätze. */
function statusLines(state: ReturnType<typeof useGame>['state'], gang: Gang): string[] {
  const s = getGangStatus(state, gang.id);
  if (!s) return [];
  const lines: string[] = [];
  if (hasCeasefire(state, gang.id) && s.ceasefireUntil !== null) {
    lines.push(`Waffenstillstand bis ${clock.format(s.ceasefireUntil)}`);
  }
  if (paysTribute(state, gang.id) && s.tribute) {
    lines.push(`Du zahlst ${formatEuro(s.tribute.amount)} Schutzgeld, bis ${clock.format(s.tribute.until)}`);
  }
  if (s.protection) {
    lines.push(
      s.protection.overdue
        ? `Schuldet dir ${formatEuro(s.protection.amount)} Schutzgeld`
        : `Zahlt dir ${formatEuro(s.protection.amount)} pro Woche, nächste Zahlung ${clock.format(s.protection.nextDueAt)}`,
    );
  }
  if (isAllied(state, gang.id) && s.alliance) {
    const enemy = getGang(state, s.alliance.againstGangId);
    lines.push(`Verbündet gegen ${enemy?.name ?? '?'}, bis ${clock.format(s.alliance.until)}`);
  }
  if (s.push) lines.push(`Drängt nach ${veedelName(s.push.veedelId)}`);
  return lines;
}

function GangCard(props: { gang: Gang }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const { gang } = props;
  const s = getGangStatus(state, gang.id);
  if (!s) return null;
  const turf = gangVeedel(state, gang.id);
  const broken = isGangBroken(state, gang.id);
  const lines = statusLines(state, gang);
  const hostility = Math.round(s.hostility);
  const gangId = gang.id;
  const strongEnough = playerPower(state) / Math.max(1, gangPower(state, gang.id));
  const snitch = canSnitch(state, gang.id);
  return (
    <Card
      class="gang-card"
      title={
        <span class="gang-title" style={{ '--gang-color': gang.color, '--gang-on': readableOn(gang.color) }}>
          <span class="gang-emblem" aria-hidden="true">
            <Icon name={gang.emblem} />
          </span>
          {gang.name}
        </span>
      }
      actions={<span class={`gang-stage gang-stage--${s.stage}`}>{broken ? 'zerschlagen' : STAGE_NAMES[s.stage]}</span>}
    >
      <p class="gang-boss">
        {gang.boss} · Heimat {veedelName(gang.homeVeedelId)}
      </p>
      <p class="gang-style">{gang.style}</p>
      <div class="gang-tags">
        {gang.strengths.map((t) => (
          <span key={t} class="gang-tag">
            {t}
          </span>
        ))}
        <span class="gang-tag gang-tag--weak">{gang.weakness}</span>
      </div>
      <div class="gang-stats">
        <Stat label="Stärke" value={Math.round(gangPower(state, gang.id))} />
        <Stat label="Leute" value={s.people} />
        <Stat label="Geld" value={formatEuro(s.money)} />
        <Stat label="Ware" value={formatAmount(s.goods)} />
      </div>
      <KeyValue label="Revier" value={turf.length ? turf.map(veedelName).join(', ') : 'keins'} />
      <div class="gang-meter">
        <span>Feindseligkeit</span>
        <ProgressBar value={hostility / 100} tone={hostilityTone(hostility)} label="Feindseligkeit" />
        <span class="gang-meter__value">{hostility}</span>
      </div>
      <div class="gang-meter">
        <span>Beziehung</span>
        <ProgressBar value={(s.relation + 100) / 200} tone={s.relation < -10 ? 'bad' : 'accent'} label="Beziehung" />
        <span class="gang-meter__value">{relationText(s.relation)}</span>
      </div>
      {lines.length > 0 && (
        <ul class="gang-lines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <div class="gang-actions">
        <div class="gang-actions__group">
          <span class="gang-actions__label">Diplomatie</span>
          {s.hostility < WARN_AT && !s.protection && (
            <span class="gang-actions__note">Noch kein Grund zu verhandeln.</span>
          )}
          {s.hostility >= WARN_AT && !hasCeasefire(state, gang.id) && (
            <Button
              small
              onClick={() => dispatch({ type: 'gangs.ceasefire', payload: { gangId } })}
              title="Eine Weile keine Überfälle, Feindseligkeit sinkt"
            >
              Waffenstillstand ({formatEuro(ceasefireCost(state, gang.id))})
            </Button>
          )}
          {s.hostility >= WARN_AT && !paysTribute(state, gang.id) && (
            <Button
              small
              onClick={() => dispatch({ type: 'gangs.payTribute', payload: { gangId } })}
              title="Eine Woche Ruhe"
            >
              Schutzgeld zahlen ({formatEuro(tributeAmount(state, gang.id))})
            </Button>
          )}
          {s.protection ? (
            s.protection.overdue ? (
              <Button small variant="danger" onClick={() => dispatch({ type: 'gangs.collect', payload: { gangId } })}>
                Schutzgeld eintreiben
              </Button>
            ) : (
              <Button
                small
                variant="subtle"
                onClick={() => dispatch({ type: 'gangs.releaseProtection', payload: { gangId } })}
              >
                Auf Schutzgeld verzichten
              </Button>
            )
          ) : (
            <Button
              small
              disabled={strongEnough < 1}
              onClick={() => dispatch({ type: 'gangs.demandProtection', payload: { gangId } })}
              title="Nur wenn du mindestens so stark bist wie die Gang"
            >
              {strongEnough < 1
                ? `Schutzgeld kassieren (ab Stärke ${Math.ceil(gangPower(state, gang.id))})`
                : `Schutzgeld kassieren (${formatEuro(protectionAmount(state, gang.id))})`}
            </Button>
          )}
          {!isAllied(state, gang.id) && (
            <Button small onClick={() => ui.openDialog('gangs.ally', { gangId })}>
              Bündnis …
            </Button>
          )}
        </div>
        <div class="gang-actions__group">
          <span class="gang-actions__label">Dagegen</span>
          <Button
            small
            variant="danger"
            disabled={turf.length === 0}
            onClick={() => ui.openDialog('gangs.attack', { gangId })}
          >
            Spot überfallen …
          </Button>
          <Button
            small
            disabled={!snitch.ok}
            onClick={() => dispatch({ type: 'police.snitch', payload: { gangId } })}
            title="Die Polizei bekommt einen Hinweis und macht Razzien bei der Gang. Gut vernetzte Gangs erfahren eher, wer gesungen hat."
          >
            Verpfeifen
          </Button>
          {!snitch.ok && <span class="gang-actions__note">{snitch.reason}</span>}
        </div>
      </div>
    </Card>
  );
}

function GangsTab() {
  const { state } = useGame();
  return (
    <div class="gangs-tab">
      <Hint>
        Deine Stärke: <strong>{Math.round(playerPower(state))}</strong>. Verkaufen im Revier einer Gang kostet sie
        Einfluss und macht sie wütend. Gegen sie hilft Gewalt, Geld, die Polizei oder Diplomatie.
      </Hint>
      {getGangs(state).map((g) => (
        <GangCard key={g.id} gang={g} />
      ))}
    </div>
  );
}

function AttackDialog(props: { gangId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const gang = getGang(state, props.gangId);
  const s = getGangStatus(state, props.gangId);
  const targets = gangVeedel(state, props.gangId).filter(
    (v) => getInfluence(state, v, props.gangId) >= GANG_SPOT_MIN_INFLUENCE,
  );
  const crew = getStaff(state, { status: 'active' });
  const [veedelId, setVeedelId] = useState<string | null>(targets[0] ?? null);
  const [chosen, setChosen] = useState<string[]>(() => crew.filter((m) => m.role === 'security').map((m) => m.id));
  const [present, setPresent] = useState(false);
  if (!gang || !s) return null;
  const toggle = (id: string) =>
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const go = () => {
    if (!veedelId) return;
    // Klappt es, ersetzt der Konfrontations-Dialog diesen Dialog.
    dispatch({
      type: 'gangs.attack',
      payload: { gangId: gang.id, veedelId, staffIds: chosen, playerPresent: present },
    });
  };
  return (
    <Dialog
      title={`Überfall auf ${gang.name}`}
      onClose={ui.closeDialog}
      actions={
        <>
          <Button onClick={ui.closeDialog}>Abbrechen</Button>
          <Button variant="danger" disabled={!veedelId || (chosen.length === 0 && !present)} onClick={go}>
            Losschlagen
          </Button>
        </>
      }
    >
      <p class="gang-dialog__lead">
        Etwa {Math.max(1, Math.min(s.people, 2 + Math.floor(s.people / 8)))} Wachen, Kampfkraft {gang.traits.fighting}.
        Klappt es, gehören dir ein Teil ihrer Ware und Kasse.
      </p>
      <h3 class="gang-dialog__head">Wo?</h3>
      {targets.length === 0 ? (
        <Hint>{gang.name} hat gerade keinen Spot, den du erreichen kannst.</Hint>
      ) : (
        <div class="gang-choice">
          {targets.map((v) => (
            <Button key={v} small active={v === veedelId} onClick={() => setVeedelId(v)}>
              {veedelName(v)}
            </Button>
          ))}
        </div>
      )}
      <h3 class="gang-dialog__head">Wer geht mit?</h3>
      {crew.length === 0 ? (
        <Hint>Du hast keine Leute. Dann nur du selbst.</Hint>
      ) : (
        <List>
          {crew.map((m) => (
            <ListItem
              key={m.id}
              aside={
                <Button small active={chosen.includes(m.id)} onClick={() => toggle(m.id)}>
                  {chosen.includes(m.id) ? 'dabei' : 'bleibt'}
                </Button>
              }
            >
              <strong>{m.name}</strong>
              <div class="ui-hint">
                Kraft {m.stats.strength} · Tempo {m.stats.speed}
              </div>
            </ListItem>
          ))}
        </List>
      )}
      <Button wide variant={present ? 'danger' : 'default'} active={present} onClick={() => setPresent(!present)}>
        {present ? 'Du gehst selbst mit (Todesgefahr)' : 'Selbst mitgehen?'}
      </Button>
      <Hint>Ein Überfall bricht alle Abmachungen mit {gang.name} und bringt Heat.</Hint>
    </Dialog>
  );
}

function AllyDialog(props: { gangId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const gang = getGang(state, props.gangId);
  if (!gang) return null;
  const enemies = getGangs(state).filter((g) => g.id !== gang.id);
  return (
    <Dialog title={`Bündnis mit ${gang.name}`} onClose={ui.closeDialog}>
      <p class="gang-dialog__lead">
        Für {formatEuro(ALLIANCE_COST)} lässt dich {gang.name} in Ruhe und geht gegen eine andere Gang vor. Die bekommt
        das mit. Braucht eine neutrale Beziehung oder besser.
      </p>
      <List>
        {enemies.map((e) => (
          <ListItem
            key={e.id}
            aside={
              <Button
                small
                onClick={() => {
                  const result = dispatch({ type: 'gangs.ally', payload: { gangId: gang.id, againstGangId: e.id } });
                  if (result.ok) ui.closeDialog();
                }}
              >
                Gegen {e.name}
              </Button>
            }
          >
            <strong class="gang-title" style={{ '--gang-color': e.color, '--gang-on': readableOn(e.color) }}>
              <span class="gang-emblem" aria-hidden="true">
                <Icon name={e.emblem} />
              </span>
              {e.name}
            </strong>
            <div class="ui-hint">Stärke {Math.round(gangPower(state, e.id))}</div>
          </ListItem>
        ))}
      </List>
    </Dialog>
  );
}

registerTab({
  id: 'gangs',
  title: 'Gangs',
  order: 30,
  component: GangsTab,
  badge: (state) => getGangs(state).filter((g) => (getGangStatus(state, g.id)?.stage ?? 0) >= 2).length,
});
registerDialog({ id: 'gangs.attack', component: AttackDialog, pausesGame: true });
registerDialog({ id: 'gangs.ally', component: AllyDialog, pausesGame: true });
registerMapLayer(gangsLayer);

onGameEvent('gang.pushStarted', 'gangs.pushToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (gang) ui.toast(`${gang.name} drängt nach ${veedelName(p.veedelId)}`, p.against === 'player' ? 'bad' : 'info');
});
onGameEvent('gang.pushEnded', 'gangs.pushEndToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (gang && p.success) ui.toast(`${gang.name} hat ${veedelName(p.veedelId)} übernommen`, 'info');
});
onGameEvent('gang.escalated', 'gangs.escalationToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (gang) ui.toast(`${gang.name} ${STAGE_NAMES[p.stage]}`, 'bad');
});
onGameEvent('gang.busted', 'gangs.bustedToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (!gang) return;
  const lost = [p.arrests > 0 ? `${p.arrests} festgenommen` : '', p.goods > 0 ? `${formatAmount(p.goods)} weg` : '']
    .filter(Boolean)
    .join(', ');
  ui.toast(`Razzia bei ${gang.name}${lost ? `: ${lost}` : ''}`, 'good');
});

registerSearch({
  id: 'gangs.search',
  label: 'Gangs',
  order: 40,
  items: (state) =>
    getGangs(state).map((g) => ({
      id: g.id,
      title: g.name,
      subtitle: `Boss: ${g.boss}`,
      icon: 'skull',
      run: (ui) => ui.selectTab('gangs'),
    })),
});
