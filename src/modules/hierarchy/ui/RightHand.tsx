// Rechte Hand im Handy: Seite mit Stufe, Aufgaben-Schaltern (mit Stufen-Schloss und je einer Regel-Zeile), Budget,
// letztem Tagesbericht und Protokoll, Ernennen als Blatt, Abschnitt im Tab "Leute" und Hinweis in "Nächster Schritt",
// sobald die Stelle angeboten wird. Antworten auf den Tagesbericht führen zur passenden Seite.
// Nur das Nötigste (Auftrag 28); Optik übernimmt Auftrag 27.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent } from '../../../core';
import {
  ActionSheet,
  Button,
  Empty,
  Group,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerAdvisor,
  registerPanel,
  Select,
  Sheet,
  Stepper,
  SummaryTiles,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { getStaff, getStaffMember, roleName } from '../../staff';
import {
  canBeRightHand,
  getRightHand,
  isTaskUnlocked,
  PAYROLL_RESERVE_DAYS,
  PAYROLL_RESERVE_DAYS_ORDERS,
  payrollReserve,
  RIGHT_HAND_LAUNDER_ABOVE_OPTIONS,
  RIGHT_HAND_LAUNDER_SHARE_OPTIONS,
  RIGHT_HAND_MAX_RANK,
  RIGHT_HAND_MIN_LEVEL,
  RIGHT_HAND_MIN_LIEUTENANTS,
  RIGHT_HAND_MIN_LOYALTY,
  RIGHT_HAND_ORDER_PRICE_OPTIONS,
  RIGHT_HAND_RESTOCK_BUDGET_OPTIONS,
  RIGHT_HAND_RESTOCK_MIN_STOCK_OPTIONS,
  RIGHT_HAND_TASKS,
  RIGHT_HAND_WHOLESALE_PRICE_OPTIONS,
  type RightHandSettings,
  type RightHandTaskKey,
  restockBudgetLeft,
  rightHandBudgetLeft,
  rightHandOffered,
  rightHandOrderLimit,
  rightHandRank,
  rightHandRankProgress,
  rightHandSatisfaction,
} from '../index';

declare module '../../../ui' {
  interface PanelRegistry {
    'hierarchy.rightHand': Record<string, never>;
  }
}

/** Blatt: Wer wird Rechte Hand? */
export function RightHandSheet(props: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useGame();
  const people = getStaff(state)
    .map((m) => ({ m, check: canBeRightHand(state, m.id) }))
    .filter(({ m }) => m.role === 'runner' || m.role === 'security' || m.role === 'driver')
    .sort((a, b) => Number(b.check.ok) - Number(a.check.ok) || b.m.level - a.m.level);
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Rechte Hand ernennen" detents={['large']}>
      <div class="lt-sheet">
        <Group
          title="Wer hält dir den Rücken frei?"
          icon="crown"
          color="brand"
          note={`Ab Level ${RIGHT_HAND_MIN_LEVEL} und Loyalität ${RIGHT_HAND_MIN_LOYALTY}.`}
          more="Die Rechte Hand will etwa das 2,5-Fache vom Lohn und steht an keinem Spot. Nur sie nimmt Aufträge an und fährt sie aus; mit ihren Aufgaben hält sie Köln am Laufen."
        >
          {people.length === 0 ? (
            <Empty icon="users">Niemand im Team.</Empty>
          ) : (
            <List>
              {people.map(({ m, check }) => (
                <ListItem
                  key={m.id}
                  disabled={!check.ok}
                  onClick={
                    check.ok
                      ? () => {
                          if (dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: m.id } }).ok) {
                            props.onClose();
                          }
                        }
                      : undefined
                  }
                >
                  <ItemContent
                    icon="user"
                    color={check.ok ? 'brand' : 'system'}
                    title={m.name}
                    meta={check.ok ? undefined : check.reason}
                    tags={
                      check.ok
                        ? [
                            { label: roleName(m.role), icon: 'user', color: 'people' },
                            { label: `Level ${m.level}` },
                            { label: `Loyalität ${m.stats.loyalty}`, icon: 'heart', color: 'brand' },
                          ]
                        : []
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Group>
      </div>
    </Sheet>
  );
}

/** Abschnitt im Tab "Leute": Rechte Hand oder das Angebot der Stelle. */
export function RightHandRow() {
  const { state } = useGame();
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const rh = getRightHand(state);
  const m = rh ? getStaffMember(state, rh.staffId) : undefined;
  if (rh && m) {
    return (
      <ListItem
        onClick={() => ui.openPanel('hierarchy.rightHand', {})}
        value={m.status === 'active' ? `Stufe ${rightHandRank(state)}` : 'fällt aus'}
      >
        <ItemContent
          icon="crown"
          color="brand"
          title={`Rechte Hand: ${m.name}`}
          meta={
            rh.lastReport
              ? `Letzter Bericht: ${formatEuro(rh.lastReport.profit)} Ergebnis`
              : 'Erster Bericht morgen um 8'
          }
        />
      </ListItem>
    );
  }
  if (!rightHandOffered(state)) return null;
  return (
    <>
      <ListItem action onClick={() => setOpen(true)}>
        <ItemContent
          icon="crown"
          color="brand"
          title="Rechte Hand ernennen"
          meta={`Ab ${RIGHT_HAND_MIN_LIEUTENANTS} Leutnants: fährt Aufträge, Tagesbericht, Koordination, Lohnsicherung`}
        />
      </ListItem>
      <RightHandSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const BASE_TASKS: {
  key: 'dailyReport' | 'coordinate' | 'payrollGuard' | 'absences';
  label: string;
  hint: string;
  icon: string;
}[] = [
  {
    key: 'dailyReport',
    label: 'Tagesbericht',
    hint: 'Jeden Morgen um 8 Uhr die Zahlen von gestern und was sie erledigt hat.',
    icon: 'newspaper',
  },
  {
    key: 'coordinate',
    label: 'Koordinieren',
    hint: 'Freie Leute an leere Spots, gemeinsames Budget der Leutnants.',
    icon: 'route',
  },
  {
    key: 'payrollGuard',
    label: 'Lohnsicherung',
    hint: `Hält die Löhne für ${PAYROLL_RESERVE_DAYS} Tage zurück (bei Ware für ${PAYROLL_RESERVE_DAYS_ORDERS === 1 ? 'eine Nacht' : `${PAYROLL_RESERVE_DAYS_ORDERS} Tage`}), warnt, wenn es nicht reicht.`,
    icon: 'lock',
  },
  {
    key: 'absences',
    label: 'Ausfälle',
    hint: 'Kaution (mit Anwalt) oder Ersetzen, wenn kein Leutnant das tut.',
    icon: 'jail',
  },
];

const euroOptions = (values: readonly number[]) =>
  values.map((v) => ({ value: String(v), label: `bis ${formatEuro(v)}` }));

/** Regel-Zeile zu einer Aufgabe (eine Auswahl oder ein Schalter), nur wenn die Aufgabe an und frei ist. */
function TaskRule(props: {
  task: RightHandTaskKey;
  settings: RightHandSettings;
  configure: (patch: Partial<RightHandSettings>) => void;
}) {
  const { state } = useGame();
  const { task, settings, configure } = props;
  switch (task) {
    case 'orders': {
      const limit = rightHandOrderLimit(state);
      return (
        <>
          <ListItem
            aside={
              <Select
                label="Lieferanfragen bis Betrag"
                value={String(settings.orderMaxPrice)}
                options={euroOptions(RIGHT_HAND_ORDER_PRICE_OPTIONS)}
                onChange={(v) => configure({ orderMaxPrice: Number(v) })}
              />
            }
          >
            <ItemContent
              icon="coinEuro"
              color="money"
              title="Nur bis Betrag"
              meta={limit < settings.orderMaxPrice ? `Ihre Stufe traut sich bis ${formatEuro(limit)}` : undefined}
            />
          </ListItem>
          <Toggle
            icon="map"
            label="Nur eigene Reviere"
            hint="Anfragen aus fremden Veedeln bleiben bei dir."
            checked={settings.ordersOwnTurfOnly}
            onChange={(v) => configure({ ordersOwnTurfOnly: v })}
          />
        </>
      );
    }
    case 'restock': {
      const rule = settings.restockRules[0];
      const left = restockBudgetLeft(state);
      return (
        <>
          <ListItem
            aside={
              <Select
                label="Budget pro Tag fürs Nachbestellen"
                value={String(settings.restockBudgetPerDay)}
                options={euroOptions(RIGHT_HAND_RESTOCK_BUDGET_OPTIONS)}
                onChange={(v) => configure({ restockBudgetPerDay: Number(v) })}
              />
            }
          >
            <ItemContent icon="coinEuro" color="money" title="Budget pro Tag" meta={`Heute noch ${formatEuro(left)}`} />
          </ListItem>
          {rule && (
            <ListItem
              aside={
                <Select
                  label="Mindestbestand im Hauptlager"
                  value={String(rule.minStock)}
                  options={RIGHT_HAND_RESTOCK_MIN_STOCK_OPTIONS.map((v) => ({ value: String(v), label: `unter ${v}` }))}
                  onChange={(v) =>
                    configure({ restockRules: [{ ...rule, minStock: Number(v) }, ...settings.restockRules.slice(1)] })
                  }
                />
              }
            >
              <ItemContent
                icon="boxes"
                color="goods"
                title="Bestellt alles nach Nachfrage"
                meta={rule.paused ?? 'günstigster Lieferant, passendes Paket'}
              />
            </ListItem>
          )}
        </>
      );
    }
    case 'wholesale':
      return (
        <ListItem
          aside={
            <Select
              label="Großhandel bis Betrag"
              value={String(settings.wholesaleMaxPrice)}
              options={euroOptions(RIGHT_HAND_WHOLESALE_PRICE_OPTIONS)}
              onChange={(v) => configure({ wholesaleMaxPrice: Number(v) })}
            />
          }
        >
          <ItemContent icon="coinEuro" color="money" title="Nur bis Betrag" meta="Darüber bleibt es Chefsache" />
        </ListItem>
      );
    case 'laundering':
      return (
        <>
          <ListItem
            aside={
              <Select
                label="Ab so viel Schwarzgeld"
                value={String(settings.launderAbove)}
                options={RIGHT_HAND_LAUNDER_ABOVE_OPTIONS.map((v) => ({
                  value: String(v),
                  label: `über ${formatEuro(v)}`,
                }))}
                onChange={(v) => configure({ launderAbove: Number(v) })}
              />
            }
          >
            <ItemContent icon="moneyBag" color="dirty" title="Ab Schwarzgeld" />
          </ListItem>
          <ListItem
            aside={
              <Select
                label="Anteil des Überschusses"
                value={String(settings.launderShare)}
                options={RIGHT_HAND_LAUNDER_SHARE_OPTIONS.map((v) => ({ value: String(v), label: formatPercent(v) }))}
                onChange={(v) => configure({ launderShare: Number(v) })}
              />
            }
          >
            <ItemContent icon="washing" color="money" title="Davon in die Wäsche" />
          </ListItem>
        </>
      );
    default:
      return null;
  }
}

function RightHandPage() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const [confirm, setConfirm] = useState(false);
  const rh = getRightHand(state);
  const m = rh ? getStaffMember(state, rh.staffId) : undefined;
  if (!rh || !m) return <Empty icon="crown">Du hast keine Rechte Hand.</Empty>;
  const satisfaction = rightHandSatisfaction(state) ?? 0;
  const configure = (settings: Partial<RightHandSettings>) =>
    dispatch({ type: 'hierarchy.configureRightHand', payload: { settings } });
  const left = rightHandBudgetLeft(state);
  const report = rh.lastReport;
  const rank = rightHandRank(state);
  const progress = rightHandRankProgress(state);
  return (
    <div class="lt-page">
      <SummaryTiles
        items={[
          { icon: 'medal', color: 'brand', value: `${rank}/${RIGHT_HAND_MAX_RANK}`, label: 'Stufe' },
          { icon: 'smile', color: satisfaction < 35 ? 'danger' : 'money', value: `${satisfaction} %`, label: 'Laune' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(m.wage), label: 'Lohn/Tag' },
        ]}
      />
      <Group
        title="Akte"
        icon="idCard"
        color="brand"
        note={
          progress
            ? `Erfahrung ${progress[0]} von ${progress[1]} bis Stufe ${rank + 1}. Jede erledigte Aufgabe und jeder gute Tagesbericht zählen.`
            : 'Höchste Stufe: Mit allen Aufgaben an läuft Köln ohne dich.'
        }
      >
        <List>
          <ListItem onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
            <ItemContent
              icon="crown"
              color="brand"
              title={m.name}
              tags={[{ label: `Level ${m.level}` }]}
              meta={
                m.status !== 'active'
                  ? 'fällt aus, die Leutnants machen allein weiter'
                  : m.assignment?.kind === 'delivery'
                    ? 'gerade mit einer Lieferung unterwegs'
                    : 'hält dir den Rücken frei'
              }
            />
          </ListItem>
        </List>
      </Group>
      <Group
        title="Letzter Tagesbericht"
        icon="newspaper"
        color="brand"
        note={
          report
            ? [report.done ? `Erledigt: ${report.done}.` : '', report.advice.join(' ')].filter(Boolean).join(' ') ||
              'Keine Empfehlungen, alles im Griff.'
            : undefined
        }
      >
        {report ? (
          <List>
            <ListItem value={formatEuro(report.revenue)}>
              <ItemContent icon="trendUp" color="money" title={`Umsatz Tag ${report.day}`} />
            </ListItem>
            <ListItem value={formatEuro(report.costs)}>
              <ItemContent icon="cart" color="warn" title="Kosten" />
            </ListItem>
            <ListItem value={formatEuro(Math.abs(report.profit))}>
              <ItemContent
                icon={report.profit >= 0 ? 'checkCircle' : 'alertCircle'}
                color={report.profit >= 0 ? 'money' : 'danger'}
                title={report.profit >= 0 ? 'Gewinn' : 'Verlust'}
              />
            </ListItem>
            <ListItem value={report.runwayDays === null ? '–' : `${report.runwayDays} Tage`}>
              <ItemContent
                icon="clock"
                color="people"
                title="Löhne reichen"
                meta={`Kasse ${formatEuro(report.cash)}`}
              />
            </ListItem>
          </List>
        ) : (
          <Empty icon="newspaper">Der erste Bericht kommt morgen um 8 Uhr.</Empty>
        )}
      </Group>
      <Group
        title="Aufgaben"
        icon="checkCircle"
        color="brand"
        note="Jede Aufgabe einzeln. Neue Aufgaben schaltet ihre Stufe frei."
      >
        {RIGHT_HAND_TASKS.map((t) => {
          const unlocked = isTaskUnlocked(state, t.key);
          const on = rh.settings[t.key];
          return (
            <div key={t.key} class="rh-task">
              <Toggle
                icon={unlocked ? t.icon : 'lock'}
                label={t.name}
                hint={unlocked ? t.hint : `Ab Stufe ${t.rank}. ${t.hint}`}
                checked={on}
                disabled={!unlocked}
                onChange={(v) => configure({ [t.key]: v })}
              />
              {unlocked && on && (
                <List>
                  <TaskRule task={t.key} settings={rh.settings} configure={configure} />
                </List>
              )}
            </div>
          );
        })}
      </Group>
      <Group
        title="Büro"
        icon="briefcase"
        color="brand"
        note={`Rücklage für die Löhne: ${formatEuro(payrollReserve(state))}.`}
      >
        {BASE_TASKS.map((t) => (
          <Toggle
            key={t.key}
            icon={t.icon}
            label={t.label}
            hint={t.hint}
            checked={rh.settings[t.key]}
            onChange={(v) => configure({ [t.key]: v })}
          />
        ))}
      </Group>
      <Group
        title="Budget der Leutnants"
        icon="coinEuro"
        color="money"
        note={left === null ? 'Nur mit "Koordinieren".' : `Heute noch ${formatEuro(left)} für Anheuern und Bestellen.`}
      >
        <List>
          <ListItem
            aside={
              <Stepper
                label="Budget pro Tag"
                value={rh.settings.budgetPerDay}
                min={0}
                max={20000}
                step={500}
                format={(v) => formatEuro(v)}
                onChange={(budgetPerDay) => configure({ budgetPerDay })}
              />
            }
          >
            <ItemContent icon="coinEuro" color="money" title="Pro Tag" />
          </ListItem>
        </List>
      </Group>
      <Group title="Protokoll" icon="journal" color="log">
        {rh.log.length === 0 ? (
          <Empty icon="journal">Noch nichts.</Empty>
        ) : (
          <List>
            {rh.log.map((entry, i) => (
              <ListItem key={`${entry.time}-${i}`} value={clock.formatTime(entry.time)}>
                <span class="lt-log-text">{entry.text}</span>
              </ListItem>
            ))}
          </List>
        )}
      </Group>
      <div class="lt-actions">
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Abberufen …
        </Button>
      </div>
      <ActionSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`${m.name} abberufen?`}
        message="Dann fährt niemand mehr Aufträge aus, und die Leutnants arbeiten ohne Budget, Bericht und Lohnsicherung."
        actions={[
          {
            label: 'Abberufen',
            destructive: true,
            onSelect: () => {
              if (dispatch({ type: 'hierarchy.dismissRightHand', payload: {} }).ok) ui.closePanel();
            },
          },
        ]}
      />
    </div>
  );
}

registerPanel({ id: 'hierarchy.rightHand', title: () => 'Rechte Hand', component: RightHandPage });

registerAdvisor({
  id: 'hierarchy.rightHand',
  advise: (state) => {
    if (!rightHandOffered(state)) return null;
    const ready = getStaff(state).some((m) => canBeRightHand(state, m.id).ok);
    if (!ready) return null;
    return {
      id: 'hierarchy.rightHand',
      priority: 35,
      icon: 'crown',
      title: 'Eine Rechte Hand ernennen',
      text: 'Sie fährt Aufträge aus, holt den Hafen ab, koordiniert die Leutnants und schickt jeden Morgen die Zahlen.',
      actionLabel: 'Leute',
      action: (ui) => ui.selectTab('staff'),
    };
  },
});

// Antworten auf den Tagesbericht führen zur passenden Seite.
onGameEvent('message.answered', 'hierarchy.reportLinks', (payload, ui) => {
  if (payload.source !== 'hierarchy') return;
  if (payload.optionId === 'openFinance') ui.openPhone('finance.app');
  else if (payload.optionId === 'openStaff') ui.selectTab('staff');
});
