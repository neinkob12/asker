// Rechte Hand im Handy: Seite mit Aufgaben-Schaltern, Budget, letztem Tagesbericht und Protokoll, Ernennen als Blatt,
// Abschnitt im Tab "Leute" und Hinweis in "Nächster Schritt", sobald die Stelle angeboten wird. Antworten auf den
// Tagesbericht führen zur passenden Seite.

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
  onGameEvent,
  registerAdvisor,
  registerPanel,
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
  PAYROLL_RESERVE_DAYS,
  payrollReserve,
  RIGHT_HAND_MIN_LEVEL,
  RIGHT_HAND_MIN_LIEUTENANTS,
  RIGHT_HAND_MIN_LOYALTY,
  type RightHandSettings,
  rightHandBudgetLeft,
  rightHandOffered,
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
    .filter(({ m }) => m.role === 'runner' || m.role === 'security' || m.role === 'courier' || m.role === 'driver')
    .sort((a, b) => Number(b.check.ok) - Number(a.check.ok) || b.m.level - a.m.level);
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Rechte Hand ernennen" detents={['large']}>
      <div class="lt-sheet">
        <Group
          title="Wer hält dir den Rücken frei?"
          icon="crown"
          color="brand"
          note={`Ab Level ${RIGHT_HAND_MIN_LEVEL} und Loyalität ${RIGHT_HAND_MIN_LOYALTY}. Will etwa das 2,5-Fache vom Lohn, steht an keinem Spot.`}
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
                    meta={
                      check.ok ? `${roleName(m.role)} · Level ${m.level} · Loyalität ${m.stats.loyalty}` : check.reason
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
        value={m.status === 'active' ? undefined : 'fällt aus'}
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
          meta={`Ab ${RIGHT_HAND_MIN_LIEUTENANTS} Leutnants: Tagesbericht, Koordination, Lohnsicherung`}
        />
      </ListItem>
      <RightHandSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const TASKS: { key: keyof Omit<RightHandSettings, 'budgetPerDay'>; label: string; hint: string; icon: string }[] = [
  {
    key: 'dailyReport',
    label: 'Tagesbericht',
    hint: 'Jeden Morgen um 8 Uhr die Zahlen von gestern.',
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
    hint: `Hält die Löhne für ${PAYROLL_RESERVE_DAYS} Tage zurück, warnt, wenn es nicht reicht.`,
    icon: 'lock',
  },
  {
    key: 'absences',
    label: 'Ausfälle',
    hint: 'Kaution (mit Anwalt) oder Ersetzen, wenn kein Leutnant das tut.',
    icon: 'jail',
  },
];

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
  return (
    <div class="lt-page">
      <SummaryTiles
        items={[
          { icon: 'smile', color: satisfaction < 35 ? 'danger' : 'money', value: `${satisfaction} %`, label: 'Laune' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(m.wage), label: 'Lohn/Tag' },
          { icon: 'lock', color: 'dirty', value: formatEuro(payrollReserve(state)), label: 'Rücklage' },
        ]}
      />
      <Group title="Akte" icon="idCard" color="brand">
        <List>
          <ListItem onClick={() => ui.openPanel('staff.profile', { staffId: m.id })}>
            <ItemContent
              icon="crown"
              color="brand"
              title={`${m.name} · Level ${m.level}`}
              meta={
                m.status === 'active' ? 'hält dir den Rücken frei' : 'fällt aus, die Leutnants machen allein weiter'
              }
            />
          </ListItem>
        </List>
      </Group>
      <Group
        title="Letzter Tagesbericht"
        icon="newspaper"
        color="brand"
        note={report ? report.advice.join(' ') || 'Keine Empfehlungen, alles im Griff.' : undefined}
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
      <Group title="Aufgaben" icon="checkCircle" color="brand">
        {TASKS.map((t) => (
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
        message="Die Leutnants arbeiten dann wieder ohne Budget, Bericht und Lohnsicherung."
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
      text: 'Sie koordiniert die Leutnants, schickt jeden Morgen die Zahlen und sichert die Löhne.',
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
