// Oberfläche der Gangs: Tab "Gangs" mit deiner Stärke oben (Teile und „Sicherheit anheuern“), darunter die Gangs als
// Kacheln, zwei pro Reihe (Name mit Status als Wort, Stärke und Veedel, Knöpfe Angriff, Bündnis, Schutzgeld);
// Seite je Gang mit Lage, Beziehung und Diplomatie, Dialoge für Überfall und Bündnis, Hinweise auf der Karte.

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { clock, formatAmount, formatEuro } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  ActionSheet,
  Avatar,
  Button,
  type CategoryColor,
  Chips,
  Dialog,
  Group,
  Hint,
  Icon,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  readableOn,
  registerDialog,
  registerPanel,
  registerSearch,
  registerTab,
  Sheet,
  type SheetAction,
  SummaryTiles,
  soundOnEvent,
  Tag,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, isBusinessSold } from '../../city';
import { canSnitch } from '../../police';
import { getSpots } from '../../spots';
import { SECURITY_HIRE_COST, securityAt } from '../../staff';
import { tutorialAllowsRole, tutorialLockText } from '../../tutorial';
import { veedelName } from '../../veedel';
import {
  activeWars,
  allianceCost,
  ceasefireCost,
  describeIncident,
  type Gang,
  type GangMethod,
  gangActions,
  gangMemories,
  gangPower,
  gangVeedel,
  getGang,
  getGangStatus,
  getGangs,
  hasCeasefire,
  incidentChoiceLabel,
  incidentChoices,
  isAllied,
  isGangBroken,
  MEMORIES,
  memoryPriceFactor,
  openIncidents,
  type PlayerPowerParts,
  paysTribute,
  playerPower,
  playerPowerParts,
  protectionAmount,
  raidCrew,
  raidTargets,
  rivalry,
  runGangMethod,
  STAGE_NAMES,
  sendGangMessage,
  tributeAmount,
  WAR_AT,
  WARN_AT,
} from '../index';
import { gangsLayer } from './map';
import './gangs.css';

declare module '../../../ui' {
  interface DialogRegistry {
    'gangs.attack': { gangId: string };
  }
  interface PanelRegistry {
    /** Eine Gang im Handy: Lage, Abmachungen, Diplomatie und was du gegen sie tun kannst. */
    'gangs.gang': { gangId: string };
  }
}

/** Farbe der Stufe: ignoriert dich (ruhig), gewarnt (Achtung), droht oder greift an (Gefahr). */
const STAGE_COLOR: Record<number, CategoryColor> = { 0: 'system', 1: 'warn', 2: 'danger', 3: 'danger' };

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

/** Eine Abmachung oder Aktivität: kurzer Titel, dazu Datum oder Gegner in der Meta-Zeile (sonst wird der Satz abgeschnitten). */
interface StatusLine {
  title: string;
  meta?: string;
}

/** Laufende Abmachungen und Aktivitäten einer Gang. */
function statusLines(state: ReturnType<typeof useGame>['state'], gang: Gang): StatusLine[] {
  const s = getGangStatus(state, gang.id);
  if (!s) return [];
  const lines: StatusLine[] = [];
  if (hasCeasefire(state, gang.id) && s.ceasefireUntil !== null) {
    lines.push({ title: 'Waffenstillstand', meta: `bis ${clock.format(s.ceasefireUntil)}` });
  }
  if (paysTribute(state, gang.id) && s.tribute) {
    lines.push({
      title: `Du zahlst ${formatEuro(s.tribute.amount)} Schutzgeld`,
      meta: `bis ${clock.format(s.tribute.until)}`,
    });
  }
  if (s.protection) {
    lines.push(
      s.protection.overdue
        ? { title: `Schuldet dir ${formatEuro(s.protection.amount)} Schutzgeld` }
        : {
            title: `Zahlt dir ${formatEuro(s.protection.amount)} pro Woche`,
            meta: `nächste Zahlung ${clock.format(s.protection.nextDueAt)}`,
          },
    );
  }
  if (isAllied(state, gang.id) && s.alliance) {
    const enemy = getGang(state, s.alliance.againstGangId);
    lines.push({ title: `Verbündet gegen ${enemy?.name ?? '?'}`, meta: `bis ${clock.format(s.alliance.until)}` });
  }
  if (s.push) lines.push({ title: `Drängt nach ${veedelName(s.push.veedelId)}` });
  return lines;
}

/** Wappen der Gang in ihrer Farbe (die Farbe gehört der Gang, das Symbol trägt die Bedeutung). */
function Emblem(props: { gang: Gang; size?: 'sm' | 'md' | 'lg' }) {
  return <Avatar name={props.gang.name} image={props.gang.emblem} color={props.gang.color} size={props.size ?? 'md'} />;
}

/** Stufe als Etikett mit Symbol (nie nur Farbe). */
function StageTag(props: { gang: Gang }) {
  const { state } = useGame();
  const s = getGangStatus(state, props.gang.id);
  if (!s) return null;
  if (isGangBroken(state, props.gang.id)) {
    return (
      <Tag category="money" icon="checkCircle">
        zerschlagen
      </Tag>
    );
  }
  return (
    <Tag category={STAGE_COLOR[s.stage]} icon={s.stage >= 2 ? 'alert' : s.stage === 1 ? 'alertCircle' : 'eyeOff'}>
      {STAGE_NAMES[s.stage]}
    </Tag>
  );
}

/**
 * Status als kurzes Wort in der Farbe der Stufe (Feedback 13.10.2026: das Symbol allein verstand man nicht). Ein
 * Bündnis zählt vor der Stufe, eine zerschlagene Gang steht als „Erledigt“ da.
 */
const STAGE_WORDS: Record<number, string> = { 0: 'Ruhig', 1: 'Warnt', 2: 'Droht', 3: 'Angriff' };

function StageBadge(props: { gang: Gang }) {
  const { state } = useGame();
  const s = getGangStatus(state, props.gang.id);
  if (!s) return null;
  const broken = isGangBroken(state, props.gang.id);
  const allied = !broken && isAllied(state, props.gang.id);
  const color: CategoryColor = broken || allied ? 'money' : STAGE_COLOR[s.stage];
  const word = broken ? 'Erledigt' : allied ? 'Verbündet' : STAGE_WORDS[s.stage];
  const title = broken ? 'zerschlagen' : allied ? 'verbündet' : STAGE_NAMES[s.stage];
  return (
    <span
      class="gangs-table__stage"
      style={{ '--stage': `var(--cat-${color})` } as JSX.CSSProperties}
      title={`${props.gang.name} ${title}`}
    >
      {word}
    </span>
  );
}

/** Teile deiner Stärke mit Farbe (Bedeutungsfarben wie überall: Leute, Ort, Schwarzgeld, Ware). */
const POWER_PARTS: { key: keyof PlayerPowerParts; label: string; color: CategoryColor }[] = [
  { key: 'people', label: 'Leute', color: 'people' },
  { key: 'veedel', label: 'Veedel', color: 'place' },
  { key: 'money', label: 'Schwarzgeld', color: 'dirty' },
  { key: 'goods', label: 'Ware', color: 'goods' },
];

/**
 * Deine Stärke (Feedback 13.10.2026): neutraler Kasten statt Gold, darunter kurz, woraus sie besteht (Balken in vier
 * Farben und die Teile), und gleich „Sicherheit anheuern“ am belebtesten Spot ohne Sicherheit.
 */
function PowerHeader() {
  const { state, dispatch } = useGame();
  const city = activeCity(state);
  const parts = playerPowerParts(state, city);
  const total = POWER_PARTS.reduce((sum, p) => sum + parts[p.key], 0);
  const spot = tutorialAllowsRole(state, 'security')
    ? getSpots(state, city)
        .filter((sp) => securityAt(state, { spotId: sp.id }).length === 0)
        .sort((x, y) => y.demand - x.demand)[0]
    : undefined;
  return (
    <section class="gangs-power" aria-label="Deine Stärke">
      <div class="gangs-power__head">
        <span class="gangs-power__label">Deine Stärke</span>
        <strong class="gangs-power__number">{Math.round(total)}</strong>
      </div>
      <span class="gangs-power__mix" aria-hidden="true">
        {POWER_PARTS.map((p) => (
          <span
            key={p.key}
            style={
              { '--part': `var(--cat-${p.color})`, flexGrow: String(Math.max(0, parts[p.key])) } as JSX.CSSProperties
            }
          />
        ))}
      </span>
      <ul class="gangs-power__parts">
        {POWER_PARTS.map((p) => (
          <li key={p.key} style={{ '--part': `var(--cat-${p.color})` } as JSX.CSSProperties}>
            <span class="gangs-power__dot" aria-hidden="true" />
            {p.label}
            <strong>{Math.round(parts[p.key])}</strong>
          </li>
        ))}
      </ul>
      {spot && (
        <Button
          wide
          small
          icon="shield"
          disabled={state.wallet.dirty < SECURITY_HIRE_COST}
          onClick={() => dispatch({ type: 'staff.hireSecurity', payload: { spotId: spot.id } })}
        >
          {`Sicherheit an ${spot.name} (${formatEuro(SECURITY_HIRE_COST)})`}
        </Button>
      )}
    </section>
  );
}

/** Tab "Gangs": deine Stärke und die Gangs als Kacheln, zwei pro Reihe; Details als eigene Seite. */
function GangsTab() {
  const { state } = useGame();
  const gangs = getGangs(state, activeCity(state));
  return (
    <div class="gangs-tab">
      <PowerHeader />
      <div class="gangs-tiles">
        {gangs.map((g) => (
          <GangTile key={g.id} gang={g} />
        ))}
      </div>
    </div>
  );
}

/** Eine Gang als Kachel: Name (öffnet die Seite) mit Status, Stärke und Veedel, unten Angriff, Bündnis, Schutzgeld. */
function GangTile(props: { gang: Gang }) {
  const { state } = useGame();
  const ui = useUi();
  const [allying, setAllying] = useState(false);
  const [protection, setProtection] = useState(false);
  const { gang } = props;
  const broken = isGangBroken(state, gang.id);
  const power = gangPower(state, gang.id);
  const noTargets = raidTargets(state, gang.id).length === 0;
  return (
    <div class="gangs-tile" style={{ '--gang-color': gang.color } as JSX.CSSProperties}>
      <button type="button" class="gangs-tile__open" onClick={() => ui.openPanel('gangs.gang', { gangId: gang.id })}>
        <span class="gangs-tile__name">
          <span class="gangs-table__dot" aria-hidden="true" />
          <span>{gang.name}</span>
        </span>
        <StageBadge gang={gang} />
        <span class="gangs-tile__facts">
          <span class={power > playerPower(state) ? 'is-stronger' : undefined}>
            <strong>{Math.round(power)}</strong> Stärke
          </span>
          <span>
            <strong>{gangVeedel(state, gang.id).length}</strong> Veedel
          </span>
        </span>
      </button>
      <span class="gangs-tile__actions">
        <ActionIcon
          icon="swordsCrossed"
          kind="attack"
          label={`${gang.name} angreifen`}
          title={noTargets ? 'Kein Spot, den du erreichen kannst' : 'Spot überfallen'}
          disabled={broken || noTargets}
          onClick={() => ui.openDialog('gangs.attack', { gangId: gang.id })}
        />
        <ActionIcon
          icon="handshake"
          kind="ally"
          label={`Bündnis mit ${gang.name}`}
          title={isAllied(state, gang.id) ? 'Schon verbündet' : 'Bündnis'}
          disabled={broken || isAllied(state, gang.id)}
          onClick={() => setAllying(true)}
        />
        <ActionIcon
          icon="coins"
          kind="money"
          label={`Schutzgeld mit ${gang.name}`}
          title="Schutzgeld"
          disabled={broken}
          onClick={() => setProtection(true)}
        />
      </span>
      <AllySheet gang={gang} open={allying} onClose={() => setAllying(false)} />
      <ProtectionSheet gang={gang} open={protection} onClose={() => setProtection(false)} />
    </div>
  );
}

/** Kleiner Knopf mit Symbol in der Tabelle (Angriff, Bündnis, Schutzgeld). */
function ActionIcon(props: {
  icon: string;
  kind: 'attack' | 'ally' | 'money';
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class={`gangs-table__action is-${props.kind}`}
      aria-label={props.label}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  );
}

/** Menü Schutzgeld einer Gang: zahlen, kassieren, eintreiben oder verzichten, je nach Lage. */
function ProtectionSheet(props: { gang: Gang; open: boolean; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const { gang } = props;
  const s = getGangStatus(state, gang.id);
  if (!s) return null;
  const gangId = gang.id;
  const power = gangPower(state, gangId);
  const actions: SheetAction[] = [];
  if (s.hostility >= WARN_AT && !paysTribute(state, gangId)) {
    actions.push({
      label: `Zahlen: ${formatEuro(tributeAmount(state, gangId))} für eine Woche Ruhe`,
      icon: 'coins',
      onSelect: () => dispatch({ type: 'gangs.payTribute', payload: { gangId } }),
    });
  }
  if (s.protection) {
    actions.push(
      s.protection.overdue
        ? {
            label: `Eintreiben (${formatEuro(s.protection.amount)} im Rückstand)`,
            icon: 'fist',
            destructive: true,
            onSelect: () => dispatch({ type: 'gangs.collect', payload: { gangId } }),
          }
        : {
            label: 'Auf Schutzgeld verzichten',
            icon: 'unlock',
            onSelect: () => dispatch({ type: 'gangs.releaseProtection', payload: { gangId } }),
          },
    );
  } else {
    const strong = playerPower(state) >= power;
    actions.push({
      label: strong
        ? `Kassieren: ${formatEuro(protectionAmount(state, gangId))} pro Woche`
        : `Kassieren erst ab Stärke ${Math.ceil(power)}`,
      icon: 'moneyBag',
      disabled: !strong,
      onSelect: () => dispatch({ type: 'gangs.demandProtection', payload: { gangId } }),
    });
  }
  const lines = statusLines(state, gang)
    .filter((line) => /Schutzgeld|pro Woche/.test(line.title))
    .map((line) => (line.meta ? `${line.title}, ${line.meta}` : line.title));
  return (
    <ActionSheet
      open={props.open}
      onClose={props.onClose}
      title={`Schutzgeld: ${gang.name}`}
      message={lines.length > 0 ? lines.join('. ') : undefined}
      actions={actions}
    />
  );
}

/** Wie die Gang über das Verhältnis mit einer anderen spricht. */
function rivalryLabel(value: number): { label: string; color: CategoryColor } {
  if (value <= WAR_AT) return { label: 'Todfeinde', color: 'danger' };
  if (value < -10) return { label: 'verfeindet', color: 'warn' };
  if (value <= 10) return { label: 'neutral', color: 'system' };
  return { label: 'dulden sich', color: 'money' };
}

/**
 * Auftrag 34: Woran sich die Gang erinnert, als Chips mit Wirkung (verblasst mit der Zeit). Darunter, was das für die
 * Preise heißt.
 */
function GangMemory(props: { gang: Gang }) {
  const { state } = useGame();
  const memories = gangMemories(state, props.gang.id);
  if (memories.length === 0) return null;
  const factor = memoryPriceFactor(state, props.gang.id);
  const percent = Math.round((factor - 1) * 100);
  return (
    <Group
      title="Erinnert sich"
      icon="journal"
      color={percent > 0 ? 'danger' : 'money'}
      note={
        percent === 0
          ? undefined
          : `Waffenstillstand und Bündnis ${Math.abs(percent)} % ${percent > 0 ? 'teurer' : 'billiger'}.`
      }
      more="Gangs vergessen nicht, aber Erinnerungen verblassen mit der Zeit. Schlechte machen Frieden teurer und tauchen in ihren Nachrichten auf, gute machen ihn billiger."
    >
      <Chips
        items={memories.map((m) => ({
          label: `${MEMORIES[m.kind].label} ${m.value > 0 ? '+' : ''}${m.value}`,
          icon: MEMORIES[m.kind].icon,
          color: m.value > 0 ? 'money' : 'danger',
          title: m.until === null ? 'vergisst nie' : `verblasst bis ${clock.format(m.until)}`,
        }))}
      />
    </Group>
  );
}

/** Auftrag 34: Verhältnis zu den anderen Gangs der Stadt (Todfeinde führen Krieg). */
function GangRivals(props: { gang: Gang }) {
  const { state } = useGame();
  const others = getGangs(state, props.gang.cityId).filter((g) => g.id !== props.gang.id);
  if (others.length === 0) return null;
  const wars = activeWars(state, props.gang.cityId);
  return (
    <Group title="Andere Gangs" icon="swords" color="warn">
      <List>
        {others.map((g) => {
          const value = rivalry(state, props.gang.id, g.id);
          const look = rivalryLabel(value);
          const war = wars.find(
            (w) =>
              (w.attacker === g.id && w.defender === props.gang.id) ||
              (w.defender === g.id && w.attacker === props.gang.id),
          );
          return (
            <ListItem key={g.id}>
              <ItemContent
                icon="skull"
                color={look.color}
                title={g.name}
                tags={[
                  { label: look.label, color: look.color },
                  war && { label: `Krieg in ${veedelName(war.veedelId)}`, icon: 'swords', color: 'danger' },
                ]}
              />
            </ListItem>
          );
        })}
      </List>
    </Group>
  );
}

/** Eine Gang als Seite: wer sie ist, wie sie zu dir steht, Abmachungen, Diplomatie, Gegenmaßnahmen. */
function GangPanel(props: { gangId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [confirmSnitch, setConfirmSnitch] = useState(false);
  const [allying, setAllying] = useState(false);
  const gang = getGang(state, props.gangId);
  const s = gang ? getGangStatus(state, gang.id) : undefined;
  if (!gang || !s) return null;
  const gangId = gang.id;
  const turf = gangVeedel(state, gang.id);
  const noTargets = raidTargets(state, gang.id).length === 0;
  const lines = statusLines(state, gang);
  const hostility = Math.round(s.hostility);
  const power = gangPower(state, gang.id);
  const strongEnough = playerPower(state) / Math.max(1, power);
  const snitch = canSnitch(state, gang.id);
  const calm = s.hostility < WARN_AT && !s.protection;
  return (
    <div class="gang-page" style={{ '--gang-color': gang.color, '--gang-on': readableOn(gang.color) }}>
      <header class="gang-hero">
        <Emblem gang={gang} size="lg" />
        <div class="gang-hero__text">
          <strong>{gang.boss}</strong>
          <span>Heimat {veedelName(gang.homeVeedelId)}</span>
          <StageTag gang={gang} />
        </div>
      </header>
      <p class="gang-style">{gang.style}</p>
      <div class="gang-tags">
        {gang.strengths.map((t) => (
          <Tag key={t} category="danger" icon="bolt">
            {t}
          </Tag>
        ))}
        <Tag tone="muted" icon="shield">
          {gang.weakness}
        </Tag>
      </div>
      <SummaryTiles
        items={[
          { icon: 'fist', color: 'danger', value: Math.round(power), label: 'Stärke' },
          { icon: 'users', color: 'people', value: s.people, label: 'Leute' },
          { icon: 'moneyBag', color: 'dirty', value: formatEuro(s.money), label: 'Kasse' },
        ]}
      />
      <Group title="Lage" icon="flag" color="danger">
        <List>
          <ListItem value={`${turf.length} Veedel`}>
            <ItemContent
              icon="map"
              color="place"
              title="Revier"
              meta={turf.length ? turf.map(veedelName).join(', ') : 'keins'}
            />
          </ListItem>
          <ListItem value={formatAmount(s.goods)}>
            <ItemContent icon="boxes" color="goods" title="Ware" />
          </ListItem>
          <ListItem value={hostility}>
            <ItemContent icon="flame" color={hostilityColor(hostility)} title="Feindseligkeit">
              <ProgressBar value={hostility / 100} tone={hostilityTone(hostility)} label="Feindseligkeit" />
            </ItemContent>
          </ListItem>
          <ListItem value={relationText(s.relation)}>
            <ItemContent icon="handshake" color={s.relation < -10 ? 'danger' : 'money'} title="Beziehung">
              <ProgressBar
                value={(s.relation + 100) / 200}
                tone={s.relation < -10 ? 'bad' : 'accent'}
                label="Beziehung"
              />
            </ItemContent>
          </ListItem>
        </List>
      </Group>
      <GangMemory gang={gang} />
      <GangRivals gang={gang} />
      <GangMethods gang={gang} />
      {lines.length > 0 && (
        <Group title="Abmachungen" icon="clipboard" color="warn">
          <List>
            {lines.map((line) => (
              <ListItem key={line.title}>
                <ItemContent icon="clock" color="warn" title={line.title} meta={line.meta} />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      <Group
        title="Diplomatie"
        icon="handshake"
        color="money"
        note={calm ? 'Noch kein Grund zu verhandeln: Die Gang ignoriert dich.' : undefined}
      >
        <List>
          {s.hostility >= WARN_AT && !hasCeasefire(state, gang.id) && (
            <ListItem
              action
              value={formatEuro(ceasefireCost(state, gang.id))}
              onClick={() => dispatch({ type: 'gangs.ceasefire', payload: { gangId } })}
            >
              <ItemContent
                icon="handshake"
                color="money"
                title="Waffenstillstand"
                meta="Eine Weile keine Überfälle, Feindseligkeit sinkt"
              />
            </ListItem>
          )}
          {s.hostility >= WARN_AT && !paysTribute(state, gang.id) && (
            <ListItem
              action
              value={formatEuro(tributeAmount(state, gang.id))}
              onClick={() => dispatch({ type: 'gangs.payTribute', payload: { gangId } })}
            >
              <ItemContent icon="coins" color="dirty" title="Schutzgeld zahlen" meta="Eine Woche Ruhe" />
            </ListItem>
          )}
          {s.protection ? (
            s.protection.overdue ? (
              <ListItem action tone="bad" onClick={() => dispatch({ type: 'gangs.collect', payload: { gangId } })}>
                <ItemContent icon="fist" color="danger" title="Schutzgeld eintreiben" meta="Sie sind im Rückstand" />
              </ListItem>
            ) : (
              <ListItem action onClick={() => dispatch({ type: 'gangs.releaseProtection', payload: { gangId } })}>
                <ItemContent icon="unlock" color="system" title="Auf Schutzgeld verzichten" />
              </ListItem>
            )
          ) : (
            <ListItem
              action
              disabled={strongEnough < 1}
              value={strongEnough < 1 ? undefined : formatEuro(protectionAmount(state, gang.id))}
              onClick={() => dispatch({ type: 'gangs.demandProtection', payload: { gangId } })}
            >
              <ItemContent
                icon="moneyBag"
                color="dirty"
                title="Schutzgeld kassieren"
                meta={
                  strongEnough < 1
                    ? `Erst ab Stärke ${Math.ceil(power)} (du: ${Math.round(playerPower(state))})`
                    : 'Sie zahlen dir jede Woche'
                }
              />
            </ListItem>
          )}
          {!isAllied(state, gang.id) && (
            <ListItem onClick={() => setAllying(true)}>
              <ItemContent
                icon="handshake"
                color="money"
                title="Bündnis …"
                meta={`${formatEuro(allianceCost(state, gang.id))}, gemeinsam gegen eine andere Gang`}
              />
            </ListItem>
          )}
        </List>
      </Group>
      <Group title="Dagegen" icon="swords" color="danger" note={snitch.ok ? undefined : snitch.reason}>
        <List>
          <ListItem action tone="bad" disabled={noTargets} onClick={() => ui.openDialog('gangs.attack', { gangId })}>
            <ItemContent
              icon="swords"
              color="danger"
              title="Spot überfallen …"
              meta={noTargets ? 'Die Gang hat keinen Spot, den du erreichen kannst.' : 'Ware und Kasse holen'}
            />
          </ListItem>
          <ListItem action tone="bad" disabled={!snitch.ok} onClick={() => setConfirmSnitch(true)}>
            <ItemContent
              icon="megaphone"
              color="law"
              title="Verpfeifen"
              meta="Die Polizei macht Razzien bei der Gang"
            />
          </ListItem>
        </List>
      </Group>
      <AllySheet gang={gang} open={allying} onClose={() => setAllying(false)} />
      <ActionSheet
        open={confirmSnitch}
        onClose={() => setConfirmSnitch(false)}
        title={`${gang.name} verpfeifen?`}
        message="Die Polizei bekommt einen Hinweis und macht Razzien bei der Gang. Gut vernetzte Gangs erfahren eher, wer gesungen hat."
        actions={[
          {
            label: 'Verpfeifen',
            destructive: true,
            onSelect: () => dispatch({ type: 'police.snitch', payload: { gangId } }),
          },
        ]}
      />
    </div>
  );
}

/**
 * Bündnis als Blatt im Handy: gegen welche Gang? Mittlere Höhe zeigt die Wahl, ziehen am Griff vergrößert oder schließt.
 */
function AllySheet(props: { gang: Gang; open: boolean; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const { gang } = props;
  const enemies = getGangs(state, activeCity(state)).filter((g) => g.id !== gang.id && !isGangBroken(state, g.id));
  return (
    <Sheet open={props.open} onClose={props.onClose} title={`Bündnis mit ${gang.name}`} detents={['medium', 'large']}>
      <p class="gang-sheet__lead">
        Für {formatEuro(allianceCost(state, gang.id))} lässt dich {gang.name} in Ruhe und geht gegen eine andere Gang
        vor. Die bekommt das mit. Braucht eine neutrale Beziehung oder besser.
      </p>
      <Group title="Gegen wen?" icon="swords" color="danger">
        <List>
          {enemies.map((e) => (
            <ListItem
              key={e.id}
              aside={
                <Button
                  small
                  variant="primary"
                  aria-label={`Bündnis gegen ${e.name}`}
                  onClick={() => {
                    const result = dispatch({ type: 'gangs.ally', payload: { gangId: gang.id, againstGangId: e.id } });
                    if (result.ok) props.onClose();
                  }}
                >
                  Wählen
                </Button>
              }
            >
              <span class="ui-item">
                <Emblem gang={e} size="sm" />
                <span class="ui-item__main">
                  <span class="ui-item__title">{e.name}</span>
                  <span class="ui-item__meta">Stärke {Math.round(gangPower(state, e.id))}</span>
                </span>
              </span>
            </ListItem>
          ))}
        </List>
      </Group>
    </Sheet>
  );
}

/** Namen der Methoden für die Chips (Auftrag 23). */
const METHOD_NAMES: Record<GangMethod, string> = {
  raid: 'Überfälle',
  intimidate: 'Einschüchtern',
  burglary: 'Einbrüche',
  poach: 'Abwerben',
  tipOff: 'Polizei-Tipps',
  blackmail: 'Erpressung',
};

/**
 * Wie die Gang Druck macht (Methoden als Chips), offene Vorfälle mit Antworten und ihre letzten Aktionen gegen dich
 * (Auftrag 23).
 */
function GangMethods(props: { gang: Gang }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const { gang } = props;
  const methods = (Object.entries(gang.traits.methods) as [GangMethod, number][])
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => ({ label: METHOD_NAMES[m], color: 'danger' as const }));
  // Nur, was dir bekannt ist: Beim Einbruch zählt die Spur (gangId), nicht wer es wirklich war.
  const open = openIncidents(state).filter((i) => i.gangId === gang.id);
  const actions = gangActions(state, gang.id);
  return (
    <Group title="Gegen dich" icon="skull" color="danger" value={actions.length > 0 ? `${actions.length}` : undefined}>
      <List>
        <ListItem>
          <ItemContent icon="bolt" color="danger" title="Methoden" tags={methods} />
        </ListItem>
        {open.map((incident) => (
          <ListItem key={incident.id}>
            <ItemContent
              icon="alert"
              color="warn"
              title={describeIncident(state, incident)}
              meta={
                incident.encounterId !== undefined
                  ? 'Deine Leute kümmern sich'
                  : `bis ${clock.formatTime(incident.expiresAt)}`
              }
            />
            {incident.encounterId === undefined && (
              <div class="gang-incident__actions">
                {incidentChoices(state, incident).map((choice, index) => (
                  <Button
                    key={choice}
                    small
                    variant={index === 0 ? 'subtle' : 'default'}
                    onClick={() => {
                      const r = dispatch({ type: 'gangs.respond', payload: { incidentId: incident.id, choice } });
                      if (!r.ok) ui.toast(r.reason, 'warn');
                    }}
                  >
                    {incidentChoiceLabel(state, incident, choice)[0]}
                  </Button>
                ))}
              </div>
            )}
          </ListItem>
        ))}
        {actions.map((a) => (
          <ListItem key={`${a.at}-${a.text}`} value={clock.format(a.at)}>
            <ItemContent icon="clock" color="system" title={a.text} />
          </ListItem>
        ))}
        {actions.length === 0 && open.length === 0 && (
          <ListItem>
            <ItemContent icon="check" color="money" title="Bisher nichts gegen dich" />
          </ListItem>
        )}
      </List>
    </Group>
  );
}

function hostilityColor(value: number): CategoryColor {
  if (value >= 70) return 'danger';
  if (value >= 25) return 'warn';
  return 'money';
}

function AttackDialog(props: { gangId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const gang = getGang(state, props.gangId);
  const s = getGangStatus(state, props.gangId);
  const targets = raidTargets(state, props.gangId);
  const crew = raidCrew(state);
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
      <Group title="Wo?" icon="pin" color="place">
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
      </Group>
      <Group
        title="Wer geht mit?"
        icon="crew"
        color="people"
        value={`${chosen.length} von ${crew.length}`}
        note={crew.length === 0 ? 'Du hast keine Leute. Dann nur du selbst.' : undefined}
      >
        {crew.length > 0 && (
          <>
            <div class="gang-choice">
              <Button small onClick={() => setChosen(crew.map((m) => m.id))}>
                Alle mitnehmen
              </Button>
              <Button small onClick={() => setChosen([])}>
                Keinen
              </Button>
            </div>
            <List>
              {crew.map((m) => (
                <ListItem
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  aside={
                    <Button small active={chosen.includes(m.id)} onClick={() => toggle(m.id)}>
                      {chosen.includes(m.id) ? 'dabei' : 'bleibt'}
                    </Button>
                  }
                >
                  <ItemContent
                    icon={m.role === 'security' ? 'shield' : 'runner'}
                    color={chosen.includes(m.id) ? 'danger' : 'people'}
                    title={m.name}
                    tags={[
                      { label: `Kraft ${m.stats.strength}`, icon: 'fist', color: 'danger' },
                      { label: `Tempo ${m.stats.speed}`, icon: 'bolt', color: 'people' },
                    ]}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Group>
      <Button wide variant={present ? 'danger' : 'default'} active={present} onClick={() => setPresent(!present)}>
        {present ? 'Du gehst selbst mit (Todesgefahr)' : 'Selbst mitgehen?'}
      </Button>
      <Hint>Ein Überfall bricht alle Abmachungen mit {gang.name} und bringt Heat.</Hint>
    </Dialog>
  );
}

registerTab({
  id: 'gangs',
  title: 'Gangs',
  order: 30,
  component: GangsTab,
  // Nach dem Verkauf sind die Gangs Kunden (App Handel), keine Gegner auf der Straße mehr (Auftrag 43). Am Anfang
  // kommt die App mit Peters Quest.
  // Auftrag 46b: Im Tutorial kommt die App mit ihrer Stufe.
  hiddenWhen: (state) => isBusinessSold(state),
  // Auftrag 46b: Im Tutorial steht die App schon da, gesperrt bis zu ihrer Stufe.
  lockedWhen: (state) => tutorialLockText(state, 'app.gangs'),
  badge: (state) =>
    getGangs(state, activeCity(state)).filter((g) => (getGangStatus(state, g.id)?.stage ?? 0) >= 2).length,
});
registerPanel({
  id: 'gangs.gang',
  title: (props, state) => getGang(state, props.gangId)?.name ?? 'Gang',
  component: GangPanel,
});
registerDialog({ id: 'gangs.attack', component: AttackDialog, pausesGame: true });
registerMapLayer(gangsLayer);

onGameEvent('gang.pushStarted', 'gangs.pushToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  // Der Eintrag für den Verlauf.
  if (gang) {
    ui.toast(`${gang.name} drängt nach ${veedelName(p.veedelId)}`, p.against === 'player' ? 'bad' : 'info', {
      urgent: false,
    });
  }
});
onGameEvent('gang.pushEnded', 'gangs.pushEndToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (gang && p.success) ui.toast(`${gang.name} hat ${veedelName(p.veedelId)} übernommen`, 'info');
});
onGameEvent('gang.escalated', 'gangs.escalationToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  // Die Drohung kommt als Chat mit Frist (das ist das Banner); hier nur der Verlauf.
  if (gang) ui.toast(`${gang.name} ${STAGE_NAMES[p.stage]}`, 'bad', { urgent: false });
});
onGameEvent('gang.busted', 'gangs.bustedToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (!gang) return;
  const lost = [p.arrests > 0 ? `${p.arrests} festgenommen` : '', p.goods > 0 ? `${formatAmount(p.goods)} weg` : '']
    .filter(Boolean)
    .join(', ');
  ui.toast(`Razzia bei ${gang.name}${lost ? `: ${lost}` : ''}`, 'good');
});

// Auftrag 23: neue Aktionen der Gangs. Was eine Antwort braucht, kommt als Chat mit Frist (das ist das Banner); hier
// Verlauf und Ton.
onGameEvent('gang.burglary', 'gangs.burglaryToast', (p, ui) => {
  if (p.amount === 0) ui.toast('Einbruchsversuch am Lager, deine Wache war schneller', 'good', { urgent: false });
  else ui.toast(`Einbruch im Lager: ${formatAmount(p.amount)} weg`, 'bad', { urgent: false });
});
onGameEvent('gang.poachAttempt', 'gangs.poachToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (gang) ui.toast(`${gang.name} will einen deiner Leute abwerben`, 'warn', { urgent: false });
});
onGameEvent('gang.intimidation', 'gangs.intimidationToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (gang) ui.toast(`${gang.name} schüchtert an deinem Spot ein`, 'bad', { urgent: false });
});
onGameEvent('gang.tipOff', 'gangs.tipOffToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  if (gang) ui.toast(`${gang.name} hat dich in ${veedelName(p.veedelId)} angeschwärzt`, 'bad');
});
onGameEvent('gang.goodTurn', 'gangs.goodTurnToast', (p, ui, state) => {
  const gang = getGang(state, p.gangId);
  const what = p.kind === 'warnRival' ? 'warnt dich' : 'bittet um einen Gefallen';
  if (gang) ui.toast(`${gang.name} ${what}`, 'good', { urgent: false });
});
soundOnEvent('gang.burglary', 'alert', { when: (p) => p.amount > 0 });
soundOnEvent('gang.tipOff', 'siren', { volume: 0.4 });

registerSearch({
  id: 'gangs.search',
  label: 'Gangs',
  order: 40,
  items: (state) =>
    getGangs(state, activeCity(state)).map((g) => ({
      id: g.id,
      title: g.name,
      subtitle: `Boss: ${g.boss}`,
      icon: 'skull',
      run: (ui) => {
        ui.selectTab('gangs');
        ui.openPanel('gangs.gang', { gangId: g.id });
      },
    })),
});

// ---------------------------------------------------------------------------------------------
// Nur im Dev-Build: Abkürzungen zum Ausprobieren (Auftrag 23), z.B. window.koeln.dev.einbruch() in der Konsole und
// in den Szenen von scripts/phone-scenes.mjs.

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const sim = () => {
    const current = window.koeln?.session.sim;
    if (!current) throw new Error('Kein Spiel geladen.');
    return current;
  };
  const dev = {
    /** Jede Kölner Gang schreibt dir eine Warnung und eine Drohung (ihre Stimmen nebeneinander). */
    gangStimmen: () => {
      const s = sim();
      const ctx = s.ctx('gangs');
      for (const gang of getGangs(s.state, 'koeln')) {
        sendGangMessage(ctx, gang.id, 'warning', { veedel: veedelName(gang.homeVeedelId) });
        sendGangMessage(ctx, gang.id, 'threat', { veedel: veedelName(gang.homeVeedelId), tribute: '750 €' });
      }
      s.step();
    },
    /** Einbruch des Venloer Syndikats ins erste Lager, sofort gemeldet. */
    einbruch: () => {
      const s = sim();
      const ctx = s.ctx('gangs');
      s.state.modules.gangs.lastMethodAt = null;
      if (runGangMethod(ctx, 'west', 'burglary', true)) s.advance(60 - (s.state.time % 60));
    },
    /** Die Schäl Sick will einen deiner Leute abwerben. */
    abwerben: () => {
      const s = sim();
      const m = s.state.modules.staff.members.find((x) => x.role === 'runner' && x.status === 'active');
      if (m) m.stats.loyalty = Math.min(m.stats.loyalty, 30);
      runGangMethod(s.ctx('gangs'), 'ost', 'poach');
      s.step();
    },
  };
  const holder = window as unknown as { koeln?: { dev?: Record<string, () => void> } };
  holder.koeln = { ...holder.koeln, dev: { ...holder.koeln?.dev, ...dev } };
}
