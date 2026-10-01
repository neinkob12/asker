// Oberfläche der Kasse: Handy-App "Kasse" mit Gewinn- und Verlustrechnung (heute, gestern, 7 Tage), Verlauf,
// Ergebnis pro Spot und pro Leutnant und Reichweite der Löhne. Dazu eine Zeile "Bilanz heute" im Tab "Geschäft",
// ein Eintrag in der Suche und ein Hinweis in "Nächster Schritt", wenn die Löhne bald nicht mehr reichen.

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { formatEuro, type GameState, MONEY_CATEGORIES, type MoneyCategory, type MoneyGroup } from '../../../core';
import {
  Button,
  Card,
  Empty,
  Group,
  Hint,
  ItemContent,
  KeyValue,
  List,
  ListItem,
  registerAdvisor,
  registerPanel,
  registerPhoneApp,
  registerSearch,
  registerSlot,
  SegmentedControl,
  SummaryTiles,
  Tag,
  type UiApi,
  useGame,
  useUi,
} from '../../../ui';
import { getLieutenantIds, lieutenantVeedel } from '../../hierarchy';
import { getSpot } from '../../spots';
import { getStaffMember } from '../../staff';
import {
  type CategoryRow,
  categoryLines,
  dailyProfits,
  dayReport,
  lieutenantResult,
  periodReport,
  type Report,
  spotResults,
  type UnitResult,
  wageRunway,
} from '../index';
import './finance.css';

export type Period = 'today' | 'yesterday' | 'week';

declare module '../../../ui' {
  interface PanelRegistry {
    'finance.category': { category: MoneyCategory; period: Period };
  }
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Heute' },
  { value: 'yesterday', label: 'Gestern' },
  { value: 'week', label: '7 Tage' },
];

/** Tage und Versatz eines Zeitraums (für die Lese-Funktionen der Kasse). */
function span(period: Period): { days: number; offset: number } {
  if (period === 'yesterday') return { days: 1, offset: 1 };
  if (period === 'week') return { days: 7, offset: 0 };
  return { days: 1, offset: 0 };
}

function reportFor(state: GameState, period: Period): Report {
  if (period === 'today') return dayReport(state, 0);
  if (period === 'yesterday') return dayReport(state, 1);
  return periodReport(state, 7);
}

/** Betrag mit Vorzeichen in der Bedeutungsfarbe (Gewinn grün, Verlust rot). */
export function Amount(props: { value: number; strong?: boolean }) {
  const sign = props.value > 0 ? '+' : props.value < 0 ? '−' : '';
  const cls = props.value > 0 ? 'is-plus' : props.value < 0 ? 'is-minus' : '';
  return (
    <span class={`fin-amount ${cls} ${props.strong ? 'is-strong' : ''}`}>
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

function CategoryList(props: { rows: CategoryRow[]; period: Period }) {
  const ui = useUi();
  return (
    <List>
      {props.rows.map((row) => (
        <ListItem
          key={row.category}
          value={<Amount value={row.amount} />}
          onClick={() => ui.openPanel('finance.category', { category: row.category, period: props.period })}
        >
          <ItemContent
            icon={row.icon}
            color={ROW_COLOR[row.group]}
            title={row.label}
            meta={row.clean !== 0 ? `davon ${formatEuro(Math.abs(row.clean))} sauber` : undefined}
          />
        </ListItem>
      ))}
    </List>
  );
}

/** Gewinn- und Verlustrechnung: Einnahmen, Ausgaben, Verluste, Ergebnis. */
function ProfitAndLoss(props: { report: Report; period: Period }) {
  const { report, period } = props;
  const transfers = report.rows.filter((r) => r.group === 'transfer' && r.dirty !== 0);
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
        return (
          <Group key={g.group} title={g.title} icon={g.icon} color={g.color}>
            <CategoryList rows={rows} period={period} />
          </Group>
        );
      })}
      <Group
        title="Ergebnis"
        icon="chart"
        color={report.profit >= 0 ? 'money' : 'danger'}
        note={
          transfers.length > 0
            ? `Geldwäsche ist kein Verlust: ${formatEuro(Math.abs(transfers[0].dirty))} Schwarzgeld wurden zu sauberem Geld (ohne Gebühr).`
            : undefined
        }
      >
        <List>
          <ListItem value={<Amount value={report.income} />}>
            <ItemContent icon="trendUp" color="money" title="Einnahmen" />
          </ListItem>
          <ListItem value={<Amount value={-(report.expenses + report.losses)} />}>
            <ItemContent icon="trendDown" color="danger" title="Ausgaben und Verluste" />
          </ListItem>
          <ListItem value={<Amount value={report.profit} strong />}>
            <ItemContent
              icon={report.profit >= 0 ? 'checkCircle' : 'alertCircle'}
              color={report.profit >= 0 ? 'money' : 'danger'}
              title={report.profit >= 0 ? 'Gewinn' : 'Verlust'}
              meta={report.income > 0 ? `${Math.round((report.profit / report.income) * 100)} % vom Umsatz` : undefined}
            />
          </ListItem>
        </List>
      </Group>
    </>
  );
}

/** Verlauf: ein Balken je Tag (Gewinn nach oben, Verlust nach unten). */
function History() {
  const { state } = useGame();
  const days = dailyProfits(state, 7);
  const max = Math.max(1, ...days.map((d) => Math.abs(d.profit)));
  const hasLoss = days.some((d) => d.profit < 0);
  return (
    <Group title="Verlauf" icon="chart" color="money" note="Gewinn bzw. Verlust je Spieltag, heute bis jetzt.">
      <div
        class={`fin-chart ${hasLoss ? 'has-loss' : ''}`}
        style={{ '--fin-cols': days.length } as JSX.CSSProperties}
        role="img"
        aria-label={days.map((d) => `Tag ${d.day}: ${formatEuro(d.profit)}`).join(', ')}
      >
        {days.map((d) => {
          const style = { '--fin-bar': `${Math.round((Math.abs(d.profit) / max) * 100)}%` } as JSX.CSSProperties;
          return (
            <div key={d.day} class="fin-chart__col">
              <div class="fin-chart__plot">
                <span class={`fin-chart__bar ${d.profit < 0 ? 'is-minus' : 'is-plus'}`} style={style} />
              </div>
              <span class="fin-chart__label">T{d.day}</span>
            </div>
          );
        })}
      </div>
    </Group>
  );
}

function unitMeta(r: UnitResult): string {
  const parts = [`Umsatz ${formatEuro(r.revenue)}`];
  if (r.goodsCost > 0) parts.push(`Ware ${formatEuro(r.goodsCost)}`);
  if (r.wages > 0) parts.push(`Löhne ${formatEuro(r.wages)}`);
  return parts.join(' · ');
}

/** Ergebnis pro Spot: Umsatz, Wareneinsatz und Löhne der Leute dort. Wer Verlust macht, ist markiert. */
function PerSpot(props: { period: Period }) {
  const { state } = useGame();
  const ui = useUi();
  const { days, offset } = span(props.period);
  const rows = spotResults(state, days, offset).filter((r) => r.revenue > 0 || r.wages > 0);
  if (rows.length === 0) return null;
  const worst = rows.find((r) => r.result < 0 && r.wages > 0);
  const worstName = worst ? (getSpot(state, worst.spotId)?.name ?? worst.spotId) : null;
  return (
    <Group
      title="Pro Spot"
      icon="pin"
      color="place"
      count={rows.length}
      note={worstName ? `Die Leute am ${worstName} kosten mehr, als sie bringen.` : 'Ergebnis = Umsatz − Ware − Löhne.'}
    >
      <List>
        {[...rows].reverse().map((r) => (
          <ListItem
            key={r.spotId}
            value={<Amount value={r.result} />}
            onClick={() => ui.openPanel('spots.spot', { spotId: r.spotId })}
          >
            <ItemContent
              icon={r.result < 0 ? 'alertCircle' : 'pin'}
              color={r.result < 0 ? 'danger' : 'place'}
              title={getSpot(state, r.spotId)?.name ?? r.spotId}
              meta={unitMeta(r)}
            />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

function PerLieutenant(props: { period: Period }) {
  const { state } = useGame();
  const ui = useUi();
  const { days, offset } = span(props.period);
  const rows = getLieutenantIds(state)
    .map((staffId) => ({ staffId, ...lieutenantResult(state, staffId, days, offset) }))
    .sort((a, b) => b.result - a.result);
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
            value={<Amount value={r.result} />}
            onClick={() => {
              const veedelId = lieutenantVeedel(state, r.staffId);
              if (veedelId) ui.openPanel('hierarchy.lieutenant', { veedelId });
            }}
          >
            <ItemContent
              icon="crew"
              color={r.result < 0 ? 'danger' : 'people'}
              title={getStaffMember(state, r.staffId)?.name ?? 'Leutnant'}
              meta={unitMeta(r)}
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
  const today = dayReport(state, 0);
  return (
    <div class="fin-app">
      <SummaryTiles
        items={[
          { icon: 'moneyBag', color: 'dirty', value: formatEuro(state.wallet.dirty), label: 'Schwarz' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(state.wallet.clean), label: 'Sauber' },
          {
            icon: today.profit >= 0 ? 'trendUp' : 'trendDown',
            color: today.profit >= 0 ? 'money' : 'danger',
            value: <Amount value={today.profit} />,
            label: 'Heute',
          },
        ]}
      />
      <Runway />
      <SegmentedControl wide aria-label="Zeitraum" options={PERIODS} value={period} onChange={setPeriod} />
      <ProfitAndLoss report={reportFor(state, period)} period={period} />
      <History />
      <PerSpot period={period} />
      <PerLieutenant period={period} />
    </div>
  );
}

/** Buchungen einer Kategorie im Zeitraum (zusammengefasst nach Buchungstext). */
function CategoryPanel(props: { category: MoneyCategory; period: Period }) {
  const { state } = useGame();
  const info = MONEY_CATEGORIES[props.category];
  const { days, offset } = span(props.period);
  const lines = categoryLines(state, props.category, days, offset);
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const label = PERIODS.find((p) => p.value === props.period)?.label ?? '';
  return (
    <div class="fin-app">
      <SummaryTiles
        items={[
          { icon: info.icon, color: ROW_COLOR[info.group], value: <Amount value={total} />, label },
          { icon: 'list', color: 'system', value: String(lines.reduce((s, l) => s + l.count, 0)), label: 'Buchungen' },
        ]}
      />
      {lines.length === 0 ? (
        <Empty icon={info.icon}>Keine Buchungen in diesem Zeitraum.</Empty>
      ) : (
        <Group title="Buchungen" icon={info.icon} color={ROW_COLOR[info.group]} count={lines.length}>
          <List>
            {lines.map((l) => (
              <ListItem key={l.reason} value={<Amount value={l.amount} />}>
                <ItemContent
                  icon={info.icon}
                  color={ROW_COLOR[info.group]}
                  title={l.reason}
                  meta={l.count === 1 ? 'einmal' : `${l.count}-mal`}
                />
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      {props.category === 'wages.jail' && (
        <Hint icon="jail">
          Stillhaltegeld zahlst du, damit Leute in Haft den Mund halten. Abstellen geht in ihrer Akte.
        </Hint>
      )}
    </div>
  );
}

/** Zeile "Bilanz heute" im Tab "Geschäft". */
function BalanceCard() {
  const { state } = useGame();
  const ui = useUi();
  const today = dayReport(state, 0);
  const runway = wageRunway(state);
  return (
    <Card
      title="Bilanz heute"
      icon="chart"
      color="money"
      status={runway.warn ? 'warn' : today.profit < 0 ? 'bad' : 'good'}
      summary={<Amount value={today.profit} />}
      actions={
        <Button small onClick={() => openFinance(ui)}>
          Kasse öffnen
        </Button>
      }
    >
      <KeyValue label="Einnahmen" value={formatEuro(today.income)} />
      <KeyValue label="Ausgaben und Verluste" value={formatEuro(today.expenses + today.losses)} />
      <KeyValue label="Ergebnis" value={<Amount value={today.profit} />} />
      {runway.days !== null && (
        <KeyValue
          label="Löhne heute Nacht"
          value={`${formatEuro(runway.due)}, reicht ${runway.days === 1 ? '1 Tag' : `${runway.days} Tage`}`}
          tone={runway.warn ? 'warn' : undefined}
        />
      )}
    </Card>
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
registerSlot('tab:business', { id: 'finance.balance', title: 'Bilanz heute', order: 5, component: BalanceCard });

registerSearch({
  id: 'finance.search',
  label: 'Kasse',
  order: 5,
  items: () => [
    {
      id: 'finance.app',
      title: 'Kasse',
      subtitle: 'Gewinn- und Verlustrechnung, Löhne, Ergebnis pro Spot',
      icon: 'cash',
      keywords: 'Bilanz Gewinn Verlust Umsatz Löhne Geld Ausgaben Einnahmen',
      run: openFinance,
    },
  ],
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
