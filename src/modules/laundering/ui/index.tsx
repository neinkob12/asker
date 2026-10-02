// Oberfläche der Geldwäsche: App "Geldwäsche" im Handy (Betrag wählen, Gebühr und Dauer sehen, laufende Wäschen
// verfolgen), Hinweis bei fertiger Wäsche, Empfehlung bei viel Schwarzgeld.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent, wallet } from '../../../core';
import {
  Group,
  Hint,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerPhoneApp,
  registerSearch,
  SegmentedControl,
  Stepper,
  SummaryTiles,
  useGame,
} from '../../../ui';
import {
  amountInProgress,
  batchProgress,
  getBatches,
  launderingCapacity,
  launderingDuration,
  launderingFee,
} from '../index';
import './laundering.css';

const STEP = 100;
const PRESETS = [500, 1000, 2000] as const;

/**
 * App "Geldwäsche" (seit Auftrag 26 eine eigene App, groß ausgebaut wird sie in Auftrag 27): oben Schwarzgeld, sauberes
 * Geld und was gerade in der Wäsche ist, darunter der Betrag mit Stepper (oder Vorgabe), was sauber zurückkommt, und
 * die laufenden Wäschen. Schwarzgeld und sauberes Geld im HUD öffnen diese App.
 */
function LaunderingApp() {
  const { state, dispatch } = useGame();
  const [amount, setAmount] = useState(500);
  const dirty = Math.floor(wallet.balance(state, 'dirty'));
  const free = Math.max(0, launderingCapacity(state) - amountInProgress(state));
  const max = Math.min(dirty, free);
  const value = Math.min(amount, max);
  const fee = launderingFee(state);
  const batches = getBatches(state);
  const inProgress = amountInProgress(state);
  const preset = PRESETS.find((p) => p === value) ?? (value === max && max > 0 ? 'max' : null);
  const wash = () => dispatch({ type: 'laundering.launder', payload: { amount: value } });
  return (
    <div class="laundering-app">
      <SummaryTiles
        items={[
          { icon: 'moneyBag', color: 'dirty', value: formatEuro(dirty), label: 'Schwarz' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(Math.floor(state.wallet.clean)), label: 'Sauber' },
          { icon: 'washing', color: 'dirty', value: formatEuro(inProgress), label: 'Wäsche' },
        ]}
      />
      <Group
        title="Waschen"
        icon="washing"
        color="dirty"
        note={`Schwarzgeld wird über Zeit zu sauberem Geld, das du für Legales brauchst (Lager, Liegeplatz). Gebühr ${formatPercent(fee)}, gerade frei: ${formatEuro(free)}.`}
      >
        <List>
          <ListItem
            aside={
              <Stepper
                label="Betrag"
                value={value}
                min={0}
                max={max}
                step={STEP}
                format={(v) => formatEuro(v)}
                onChange={setAmount}
              />
            }
          >
            <ItemContent
              icon="moneyBag"
              color="dirty"
              title="Betrag"
              meta={
                value > 0
                  ? `${formatEuro(value - Math.round(value * fee))} sauber in ca. ${clock.formatDuration(launderingDuration(value))}`
                  : 'Kein Schwarzgeld frei'
              }
            />
          </ListItem>
          <ListItem action disabled={value < STEP} onClick={wash} value={value >= STEP ? formatEuro(value) : undefined}>
            <ItemContent
              icon="washing"
              color="money"
              title="Jetzt waschen"
              meta={value >= STEP ? `Gebühr ${formatEuro(Math.round(value * fee))}` : `Mindestens ${formatEuro(STEP)}`}
            />
          </ListItem>
        </List>
        <SegmentedControl
          wide
          aria-label="Betrag wählen"
          value={preset ?? ''}
          options={[
            ...PRESETS.map((p) => ({ value: p as number | string, label: formatEuro(p) })),
            { value: 'max', label: 'Alles' },
          ]}
          onChange={(v) => setAmount(v === 'max' ? max : Number(v))}
        />
      </Group>
      {batches.length > 0 && (
        <Group title="In der Wäsche" icon="clock" color="dirty" count={batches.length}>
          <List>
            {batches.map((b) => (
              <ListItem key={b.id} value={`fertig ${clock.formatTime(b.readyAt)}`}>
                <ItemContent icon="washing" color="dirty" title={formatEuro(b.amount)}>
                  <ProgressBar value={batchProgress(state, b)} label="Geldwäsche" />
                </ItemContent>
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      {max <= 0 && <Hint>Gerade nichts frei: Erst muss eine Wäsche fertig werden oder Schwarzgeld reinkommen.</Hint>}
    </div>
  );
}

registerPhoneApp({
  id: 'laundering.app',
  name: 'Geldwäsche',
  icon: 'washing',
  order: 40,
  color: 'money',
  component: LaunderingApp,
});
registerSearch({
  id: 'laundering.search',
  label: 'Geldwäsche',
  order: 45,
  items: (state) => [
    {
      id: 'laundering.app',
      title: 'Geldwäsche',
      subtitle: `${formatEuro(Math.floor(wallet.balance(state, 'dirty')))} Schwarzgeld, ${formatEuro(amountInProgress(state))} in der Wäsche`,
      icon: 'washing',
      keywords: 'waschen sauber schwarzgeld geld',
      run: (ui) => ui.openPhone('laundering.app'),
    },
  ],
});
onGameEvent('laundering.completed', 'laundering.toast', (payload, ui) =>
  ui.toast(`${formatEuro(payload.amount - payload.fee)} sind jetzt sauber.`, 'good'),
);

registerAdvisor({
  id: 'laundering.advice',
  advise: (state) => {
    const dirty = Math.floor(wallet.balance(state, 'dirty'));
    if (dirty < 4000 || launderingCapacity(state) - amountInProgress(state) <= 0) return null;
    return {
      id: 'laundering.wash',
      priority: 35,
      icon: 'washing',
      title: 'Geld waschen',
      text: 'Sauberes Geld brauchst du für alles Legale, zum Beispiel Lager und Autos.',
      actionLabel: 'Öffnen',
      action: (ui) => ui.openPhone('laundering.app'),
    };
  },
});
