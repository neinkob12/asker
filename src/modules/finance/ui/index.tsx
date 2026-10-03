// Oberfläche der Kasse (Auftrag 27): Handy-App "Kasse" als Bilanz. Oben der Gewinn groß mit einem Satz, warum, dazu
// Zeitraum (Heute, Gestern, 7 Tage, 30 Tage) und Filter (ganz Köln, Veedel, Spot, Leutnant). Darunter Einnahmen,
// Ausgaben und Verluste als aufklappbare Gruppen mit Summen, ein Tipp auf eine Kategorie zeigt die größten Posten.
// Dann der Verlauf (Balken je Tag), Pro Spot und Pro Leutnant (ein Tipp setzt den Filter) und die Reichweite der
// Löhne. Unten hängen andere Module Abschnitte an (Slot 'finance.app', z.B. die Kundschaft). Dazu ein Eintrag in der
// Suche und ein Hinweis in "Nächster Schritt", wenn die Löhne bald nicht mehr reichen.

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { formatEuro, type GameState, MONEY_CATEGORIES, type MoneyCategory, type MoneyGroup } from '../../../core';
import {
  Chip,
  Disclosure,
  Empty,
  Group,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerAdvisor,
  registerPanel,
  registerPhoneApp,
  registerSearch,
  SegmentedControl,
  Select,
  type SelectOption,
  Slot,
  SummaryTiles,
  Tag,
  type UiApi,
  useGame,
  useUi,
} from '../../../ui';
import { citiesUnlocked, cityName, cityOfSpot } from '../../city';
import { getLieutenantIds, lieutenantOfSpot } from '../../hierarchy';
import { getSpot } from '../../spots';
import { getStaffMember } from '../../staff';
import { veedelName } from '../../veedel';
import {
  ALL_FILTER,
  balance,
  balanceHistory,
  type CategoryRow,
  categoryLines,
  explainReport,
  type FinanceFilter,
  filterTargets,
  lieutenantResult,
  PERIODS,
  type Period,
  periodSpan,
  type Report,
  spotResults,
  type UnitResult,
  wageRunway,
} from '../index';
import './finance.css';

export type { Period } from '../index';

declare module '../../../ui' {
  interface PanelRegistry {
    'finance.category': { category: MoneyCategory; period: Period };
  }
  interface SlotRegistry {
    /** Weitere Abschnitte unten in der Kasse (z.B. Kundschaft). */
    'finance.app': Record<string, never>;
  }
}

/** Betrag mit Vorzeichen in der Bedeutungsfarbe (Gewinn grün, Verlust rot). */
export function Amount(props: { value: number; strong?: boolean; big?: boolean }) {
  const sign = props.value > 0 ? '+' : props.value < 0 ? '−' : '';
  const cls = props.value > 0 ? 'is-plus' : props.value < 0 ? 'is-minus' : '';
  return (
    <span class={`fin-amount ${cls} ${props.strong ? 'is-strong' : ''} ${props.big ? 'is-big' : ''}`}>
      {sign}
      {formatEuro(Math.abs(props.value))}
    </span>
  );
}

const GROUPS: { group: MoneyGroup; title: string; icon: string; color: 'money' | 'danger' | 'warn' | 'system' }[] = [
  { group: 'income', title: 'Einnahmen', icon: 'trendUp', color: 'money' },
  { group: 'expense', title: 'Ausgaben', icon: 'cart', color: 'warn' },
  { group: 'loss', title: 'Verluste', icon: 'trendDown', color: 'danger' },
];

const ROW_COLOR: Record<MoneyGroup, 'money' | 'warn' | 'danger' | 'system'> = {
  income: 'money',
  expense: 'warn',
  loss: 'danger',
  transfer: 'system',
};

const PERIOD_LABEL: Record<Period, string> = { today: 'heute', yesterday: 'gestern', week: '7 Tage', month: '30 Tage' };

// --- Filter: alles, Stadt, Veedel, Spot, Leutnant (als eine Auswahl, Wert als Text kodiert) ---

function encodeFilter(f: FinanceFilter): string {
  if (f.kind === 'city') return `city:${f.cityId}`;
  if (f.kind === 'veedel') return `veedel:${f.veedelId}`;
  if (f.kind === 'spot') return `spot:${f.spotId}`;
  if (f.kind === 'lieutenant') return `lieutenant:${f.staffId}`;
  return 'all';
}

function decodeFilter(value: string): FinanceFilter {
  const [kind, id] = value.split(':', 2);
  if (kind === 'city' && id) return { kind, cityId: id };
  if (kind === 'veedel' && id) return { kind, veedelId: id };
  if (kind === 'spot' && id) return { kind, spotId: id };
  if (kind === 'lieutenant' && id) return { kind, staffId: id };
  return ALL_FILTER;
}

function filterOptions(state: GameState): SelectOption[] {
  const { spots, veedelIds, lieutenantIds } = filterTargets(state);
  const veedel = [...veedelIds].sort((a, b) => veedelName(a).localeCompare(veedelName(b)));
  // Ab zwei Städten (Auftrag 30): "Alle Städte" und je Stadt ein Eintrag.
  const cities = citiesUnlocked(state);
  return [
    { value: 'all', label: cities.length > 1 ? 'Alle Städte' : 'Ganz Köln' },
    ...(cities.length > 1 ? cities.map((id) => ({ value: `city:${id}`, label: `Stadt ${cityName(id)}` })) : []),
    ...veedel.map((id) => ({ value: `veedel:${id}`, label: `Veedel ${veedelName(id)}` })),
    ...[...spots]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: `spot:${s.id}`, label: `Spot ${s.name}` })),
    ...lieutenantIds.map((id) => ({
      value: `lieutenant:${id}`,
      label: `Leutnant ${getStaffMember(state, id)?.name ?? id}`,
    })),
  ];
}

function filterLabel(state: GameState, f: FinanceFilter): string {
  if (f.kind === 'city') return cityName(f.cityId);
  if (f.kind === 'veedel') return veedelName(f.veedelId);
  if (f.kind === 'spot') return getSpot(state, f.spotId)?.name ?? 'Spot';
  if (f.kind === 'lieutenant') return getStaffMember(state, f.staffId)?.name ?? 'Leutnant';
  return 'Ganz Köln';
}

/** Zeilen einer Gruppe (Einnahmen, Ausgaben, Verluste); ein Tipp öffnet die größten Posten (nur für ganz Köln). */
function CategoryList(props: { rows: CategoryRow[]; period: Period; clickable: boolean }) {
  const ui = useUi();
  return (
    <List>
      {props.rows.map((row) => (
        <ListItem
          key={row.category}
          value={<Amount value={row.amount} />}
          onClick={
            props.clickable
              ? () => ui.openPanel('finance.category', { category: row.category, period: props.period })
              : undefined
          }
        >
          <ItemContent
            icon={row.icon}
            color={ROW_COLOR[row.group]}
            title={row.label}
            tags={[
              row.clean !== 0 && {
                label: `${formatEuro(Math.abs(row.clean))} sauber`,
                icon: 'coinEuro',
                color: 'money',
              },
            ]}
          />
        </ListItem>
      ))}
    </List>
  );
}

/** Kopf der Bilanz: Gewinn groß, darunter ein Satz, warum. */
function Hero(props: { report: Report; period: Period; filter: FinanceFilter }) {
  const { state } = useGame();
  const { report } = props;
  const tone = report.profit > 0 ? 'is-plus' : report.profit < 0 ? 'is-minus' : '';
  return (
    <section class={`fin-hero ${tone}`}>
      <span class="fin-hero__label">
        {report.profit < 0 ? 'Verlust' : 'Gewinn'} {PERIOD_LABEL[props.period]}
        {props.filter.kind === 'all' ? '' : `, ${filterLabel(state, props.filter)}`}
      </span>
      <Amount value={report.profit} strong big />
      <p class="fin-hero__why">{explainReport(report)}</p>
    </section>
  );
}

/** Einnahmen, Ausgaben, Verluste als aufklappbare Gruppen mit Summe, dazu die Umbuchung (Geldwäsche). */
function ProfitAndLoss(props: { report: Report; period: Period; filter: FinanceFilter }) {
  const { report, period } = props;
  const transfer = report.rows.find((r) => r.group === 'transfer' && (r.dirty !== 0 || r.clean !== 0));
  if (report.rows.length === 0) {
    return (
      <Empty icon="cash">
        {period === 'today' ? 'Heute noch keine Kontobewegung.' : 'In diesem Zeitraum keine Kontobewegung.'}
      </Empty>
    );
  }
  return (
    <>
      {GROUPS.map((g) => {
        const rows = report.rows.filter((r) => r.group === g.group);
        if (rows.length === 0) return null;
        const sum = rows.reduce((s, r) => s + r.amount, 0);
        return (
          <Group
            key={g.group}
            title={g.title}
            icon={g.icon}
            color={g.color}
            collapsible
            open={g.group !== 'loss' || rows.length > 0}
            value={<Amount value={sum} strong />}
          >
            <CategoryList rows={rows} period={period} clickable={props.filter.kind === 'all'} />
          </Group>
        );
      })}
      {transfer && (
        <Group
          title="Umbuchung"
          icon="refresh"
          color="system"
          note="Kein Gewinn, kein Verlust: Das Geld wechselt nur von schwarz zu sauber."
        >
          <List>
            <ListItem>
              <ItemContent
                icon="washing"
                color="dirty"
                title="Geldwäsche"
                tags={[
                  transfer.dirty !== 0 && {
                    label: `Schwarz ${transfer.dirty > 0 ? '+' : '−'}${formatEuro(Math.abs(transfer.dirty))}`,
                    icon: 'moneyBag',
                    color: 'dirty',
                  },
                  transfer.clean !== 0 && {
                    label: `Sauber ${transfer.clean > 0 ? '+' : '−'}${formatEuro(Math.abs(transfer.clean))}`,
                    icon: 'coinEuro',
                    color: 'money',
                  },
                ]}
              />
            </ListItem>
          </List>
        </Group>
      )}
    </>
  );
}

/** Verlauf: ein Balken je Tag (Gewinn nach oben, Verlust nach unten). */
function History(props: { period: Period; filter: FinanceFilter }) {
  const { state } = useGame();
  const days = balanceHistory(state, props.period, props.filter);
  const max = Math.max(1, ...days.map((d) => Math.abs(d.profit)));
  const hasLoss = days.some((d) => d.profit < 0);
  const many = days.length > 10;
  return (
    <Group title="Verlauf" icon="chart" color="money" note="Gewinn bzw. Verlust je Spieltag, heute bis jetzt.">
      <div
        class={`fin-chart ${hasLoss ? 'has-loss' : ''} ${many ? 'is-dense' : ''}`}
        style={{ '--fin-cols': days.length } as JSX.CSSProperties}
        role="img"
        aria-label={days.map((d) => `Tag ${d.day}: ${formatEuro(d.profit)}`).join(', ')}
      >
        {days.map((d, i) => {
          const style = { '--fin-bar': `${Math.round((Math.abs(d.profit) / max) * 100)}%` } as JSX.CSSProperties;
          const showLabel = !many || i === 0 || i === days.length - 1 || d.day % 5 === 0;
          return (
            <div key={d.day} class="fin-chart__col">
              <div class="fin-chart__plot">
                <span class={`fin-chart__bar ${d.profit < 0 ? 'is-minus' : 'is-plus'}`} style={style} />
              </div>
              <span class="fin-chart__label">{showLabel ? `T${d.day}` : ''}</span>
            </div>
          );
        })}
      </div>
    </Group>
  );
}

function unitTags(r: UnitResult) {
  return [
    { label: `Umsatz ${formatEuro(r.revenue)}`, icon: 'cash', color: 'money' as const },
    r.goodsCost > 0 && { label: `Ware ${formatEuro(r.goodsCost)}`, icon: 'package', color: 'goods' as const },
    r.wages > 0 && { label: `Löhne ${formatEuro(r.wages)}`, icon: 'users', color: 'people' as const },
    r.invest > 0 && { label: `Anheuern ${formatEuro(r.invest)}`, icon: 'userPlus', color: 'warn' as const },
  ];
}

/**
 * Was die Zeile zeigt, ist dasselbe wie der Gewinn oben nach einem Tipp: Umsatz − Ware − Löhne − einmalige Kosten.
 * (Das Ergebnis der Kasse selbst ohne einmalige Kosten ist der laufende Betrieb, den die Rechte Hand beurteilt.)
 */
const shownResult = (r: UnitResult): number => r.result - r.invest;

const byShownResult = (a: UnitResult, b: UnitResult): number => shownResult(b) - shownResult(a);

/** Ergebnis pro Spot: Umsatz, Wareneinsatz und Löhne der Leute dort. Ein Tipp setzt den Filter auf den Spot. */
function PerSpot(props: { period: Period; filter: FinanceFilter; onPick: (f: FinanceFilter) => void }) {
  const { state } = useGame();
  const { days, offset } = periodSpan(props.period);
  let rows = spotResults(state, days, offset).filter((r) => r.revenue > 0 || r.wages > 0 || r.invest > 0);
  if (props.filter.kind === 'city') {
    const cityId = props.filter.cityId;
    rows = rows.filter((r) => cityOfSpot(state, r.spotId) === cityId);
  } else if (props.filter.kind === 'veedel') {
    const veedelId = props.filter.veedelId;
    rows = rows.filter((r) => getSpot(state, r.spotId)?.veedelId === veedelId);
  } else if (props.filter.kind === 'lieutenant') {
    const staffId = props.filter.staffId;
    rows = rows.filter((r) => lieutenantOfSpot(state, r.spotId) === staffId);
  }
  if (rows.length === 0) return null;
  // spotResults liefert das schwächste zuerst: Das Betriebsergebnis (ohne einmalige Kosten) entscheidet, wer "kostet".
  const worst = rows.find((r) => r.result < 0 && r.wages > 0);
  const worstName = worst ? (getSpot(state, worst.spotId)?.name ?? worst.spotId) : null;
  const oneOff = rows.some((r) => r.invest > 0);
  return (
    <Group
      title="Pro Spot"
      icon="pin"
      color="place"
      count={rows.length}
      note={
        worstName
          ? `Die Leute am ${worstName} kosten mehr, als sie bringen.`
          : oneOff
            ? 'Ergebnis = Umsatz − Ware − Löhne − Anheuern.'
            : 'Ergebnis = Umsatz − Ware − Löhne.'
      }
    >
      <List>
        {[...rows].sort(byShownResult).map((r) => (
          <ListItem
            key={r.spotId}
            value={<Amount value={shownResult(r)} />}
            active={props.filter.kind === 'spot' && props.filter.spotId === r.spotId}
            onClick={() => props.onPick({ kind: 'spot', spotId: r.spotId })}
          >
            <ItemContent
              icon={shownResult(r) < 0 ? 'alertCircle' : 'pin'}
              color={shownResult(r) < 0 ? 'danger' : 'place'}
              title={getSpot(state, r.spotId)?.name ?? r.spotId}
              meta={veedelName(getSpot(state, r.spotId)?.veedelId ?? '')}
              tags={unitTags(r)}
            />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

function PerLieutenant(props: { period: Period; filter: FinanceFilter; onPick: (f: FinanceFilter) => void }) {
  const { state } = useGame();
  const { days, offset } = periodSpan(props.period);
  const rows = getLieutenantIds(state)
    .map((staffId) => ({ staffId, ...lieutenantResult(state, staffId, days, offset) }))
    .sort(byShownResult);
  if (rows.length === 0) return null;
  return (
    <Group
      title="Pro Leutnant"
      icon="crew"
      color="people"
      note="Umsatz an seinen Spots, Löhne seines Teams und sein eigener."
    >
      <List>
        {rows.map((r) => (
          <ListItem
            key={r.staffId}
            value={<Amount value={shownResult(r)} />}
            active={props.filter.kind === 'lieutenant' && props.filter.staffId === r.staffId}
            onClick={() => props.onPick({ kind: 'lieutenant', staffId: r.staffId })}
          >
            <ItemContent
              icon="crew"
              color={shownResult(r) < 0 ? 'danger' : 'people'}
              title={getStaffMember(state, r.staffId)?.name ?? 'Leutnant'}
              tags={unitTags(r)}
            />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

/** Reichweite: Was heute Nacht an Löhnen fällig wird und wie lange die Kasse reicht. */
function Runway() {
  const { state } = useGame();
  const runway = wageRunway(state);
  if (runway.days === null) return null;
  return (
    <Group title="Löhne" icon="users" color={runway.warn ? 'warn' : 'people'}>
      <List>
        <ListItem value={formatEuro(runway.due)}>
          <ItemContent
            icon="clock"
            color={runway.warn ? 'warn' : 'people'}
            title="Löhne heute Nacht"
            meta={
              runway.warn ? 'Wer kein Geld kriegt, geht.' : `Die Kasse reicht für ${runway.days} Tage (ohne Einnahmen).`
            }
          >
            {runway.warn && (
              <Tag category="warn" icon="alert">
                {runway.days === 1 ? 'reicht 1 Tag' : `reicht ${runway.days} Tage`}
              </Tag>
            )}
          </ItemContent>
        </ListItem>
      </List>
    </Group>
  );
}

function FinanceApp() {
  const { state } = useGame();
  const [period, setPeriod] = useState<Period>('today');
  const [filter, setFilter] = useState<FinanceFilter>(ALL_FILTER);
  const options = filterOptions(state);
  const encoded = encodeFilter(filter);
  // Ein Filter auf etwas, das es nicht mehr gibt (gelöschter Spot), fällt auf ganz Köln zurück.
  const current = options.some((o) => o.value === encoded) ? filter : ALL_FILTER;
  const report = balance(state, period, current);
  return (
    <div class="fin-app">
      <SummaryTiles
        items={[
          { icon: 'moneyBag', color: 'dirty', value: formatEuro(state.wallet.dirty), label: 'Schwarz' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(state.wallet.clean), label: 'Sauber' },
        ]}
      />
      <div class="fin-controls">
        <SegmentedControl wide aria-label="Zeitraum" options={[...PERIODS]} value={period} onChange={setPeriod} />
        <Select
          wide
          label="Bilanz für"
          value={encodeFilter(current)}
          options={options}
          onChange={(v) => setFilter(decodeFilter(v))}
        />
      </div>
      <Hero report={report} period={period} filter={current} />
      {current.kind !== 'all' && (
        <Disclosure label="Was zählt hier?">
          Für ein Veedel, einen Spot oder einen Leutnant zeigt die Bilanz den Straßenverkauf dort, den Einkaufspreis der
          verkauften Ware, die Löhne der Leute vor Ort und einmalige Kosten (Anheuern, Freischalten). Schutzgeld,
          Gebühren und Verluste bucht die Kasse nur für ganz Köln.
        </Disclosure>
      )}
      <ProfitAndLoss report={report} period={period} filter={current} />
      <History period={period} filter={current} />
      <PerSpot
        period={period}
        filter={current}
        onPick={(f) => setFilter(f.kind === current.kind && encodeFilter(f) === encoded ? ALL_FILTER : f)}
      />
      <PerLieutenant
        period={period}
        filter={current}
        onPick={(f) => setFilter(encodeFilter(f) === encoded ? ALL_FILTER : f)}
      />
      <Runway />
      <Slot name="finance.app" />
    </div>
  );
}

/** Buchungen einer Kategorie im Zeitraum (zusammengefasst nach Buchungstext, größte zuerst). */
function CategoryPanel(props: { category: MoneyCategory; period: Period }) {
  const { state } = useGame();
  const info = MONEY_CATEGORIES[props.category];
  const { days, offset } = periodSpan(props.period);
  const lines = categoryLines(state, props.category, days, offset);
  // Die Summe kommt aus der Bilanz: Einzelne Buchungstexte gibt es nur für die letzten Tage, 30 Tage wären zu wenig.
  const total = balance(state, props.period).rows.find((r) => r.category === props.category)?.amount ?? 0;
  const label = PERIODS.find((p) => p.value === props.period)?.label ?? '';
  const textsOnlyRecent = props.period === 'month';
  return (
    <div class="fin-app">
      <SummaryTiles
        items={[
          { icon: info.icon, color: ROW_COLOR[info.group], value: <Amount value={total} />, label },
          {
            icon: 'list',
            color: 'system',
            value: String(lines.reduce((s, l) => s + l.count, 0)),
            label: textsOnlyRecent ? 'Buchungen (7 Tage)' : 'Buchungen',
          },
        ]}
      />
      {lines.length === 0 ? (
        <Empty icon={info.icon}>
          {props.period === 'month'
            ? 'Keine einzelnen Buchungen mehr: Die Kasse merkt sich Buchungstexte nur sieben Tage.'
            : 'Keine Buchungen in diesem Zeitraum.'}
        </Empty>
      ) : (
        <Group
          title="Größte Posten"
          icon={info.icon}
          color={ROW_COLOR[info.group]}
          count={lines.length}
          note={props.period === 'month' ? 'Einzelne Buchungen gibt es nur für die letzten sieben Tage.' : undefined}
        >
          <List>
            {lines.map((l) => (
              <ListItem key={l.reason} value={<Amount value={l.amount} />}>
                <ItemContent icon={info.icon} color={ROW_COLOR[info.group]} title={l.reason}>
                  <Chip icon="refresh">{l.count === 1 ? 'einmal' : `${l.count}-mal`}</Chip>
                </ItemContent>
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      {props.category === 'wages.jail' && (
        <Disclosure label="Was ist Stillhaltegeld?" icon="jail">
          Stillhaltegeld zahlst du, damit Leute in Haft den Mund halten. Abstellen geht in ihrer Akte.
        </Disclosure>
      )}
    </div>
  );
}

function openFinance(ui: UiApi): void {
  ui.openPhone('finance.app');
}

registerPhoneApp({
  id: 'finance.app',
  name: 'Kasse',
  icon: 'cash',
  order: 18,
  color: 'money',
  component: FinanceApp,
  badge: (state) => (wageRunway(state).warn ? 1 : 0),
});
registerPanel({
  id: 'finance.category',
  title: (props) => MONEY_CATEGORIES[props.category].label,
  component: CategoryPanel,
});

registerSearch({
  id: 'finance.search',
  label: 'Kasse',
  order: 5,
  items: () => [
    {
      id: 'finance.app',
      title: 'Kasse',
      subtitle: 'Bilanz: Gewinn, Einnahmen, Ausgaben, pro Veedel, Spot und Leutnant',
      icon: 'cash',
      keywords: 'Bilanz Gewinn Verlust Umsatz Löhne Geld Ausgaben Einnahmen Tagesbilanz Wochenbilanz',
      run: openFinance,
    },
  ],
});

// Reichen die Löhne für heute Nacht nicht mehr, gibt es einmal am Tag ein Banner (das ist dringend).
let wageWarningDay = -1;
onGameEvent('clock.hourStarted', 'finance.wageWarning', (payload, ui, state) => {
  const runway = wageRunway(state);
  if (!runway.warn || runway.days !== 0 || wageWarningDay === payload.day) return;
  wageWarningDay = payload.day;
  ui.toast(`Die Löhne heute Nacht (${formatEuro(runway.due)}) sind nicht gedeckt.`, 'warn', { urgent: true });
});

registerAdvisor({
  id: 'finance.runway',
  advise: (state) => {
    const runway = wageRunway(state);
    if (!runway.warn || runway.days === null) return null;
    return {
      id: 'finance.runway',
      priority: runway.days === 0 ? 88 : 75,
      icon: 'cash',
      title: runway.days === 0 ? 'Die Löhne heute Nacht sind nicht gedeckt' : 'Die Löhne reichen nicht mehr lange',
      text: `Löhne heute Nacht: ${formatEuro(runway.due)}. Die Kasse reicht für ${runway.days === 1 ? 'einen Tag' : `${runway.days} Tage`}.`,
      actionLabel: 'Kasse',
      action: openFinance,
    };
  },
});
