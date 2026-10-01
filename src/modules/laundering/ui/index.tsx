// Oberfläche der Geldwäsche: Betrag wählen, Gebühr und Dauer sehen, laufende Wäschen verfolgen (Tab "Geschäft").

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent, wallet } from '../../../core';
import {
  Button,
  Card,
  Group,
  Hint,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerSlot,
  SegmentedControl,
  Stepper,
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

/** Geldwäsche: Betrag mit Stepper (oder Vorgabe), was sauber zurückkommt, laufende Wäschen. "Waschen" oben rechts. */
function LaunderingSection() {
  const { state, dispatch } = useGame();
  const [amount, setAmount] = useState(500);
  const dirty = Math.floor(wallet.balance(state, 'dirty'));
  const free = Math.max(0, launderingCapacity(state) - amountInProgress(state));
  const max = Math.min(dirty, free);
  const value = Math.min(amount, max);
  const fee = launderingFee(state);
  const batches = getBatches(state);
  const preset = PRESETS.find((p) => p === value) ?? (value === max && max > 0 ? 'max' : null);
  const wash = () => dispatch({ type: 'laundering.launder', payload: { amount: value } });
  return (
    <Card
      title="Geldwäsche"
      icon="washing"
      color="dirty"
      status={batches.length > 0 ? 'good' : 'idle'}
      summary={batches.length > 0 ? `${batches.length} läuft` : `${formatEuro(free)} frei`}
      actions={
        <Button small variant="primary" disabled={value < STEP} onClick={wash}>
          Waschen
        </Button>
      }
    >
      <Group
        title="Betrag"
        icon="moneyBag"
        color="dirty"
        note={`Schwarzgeld wird über Zeit zu sauberem Geld, das du für Legales brauchst. Gebühr ${formatPercent(fee)}, gerade frei: ${formatEuro(free)}.`}
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
              icon="washing"
              color="dirty"
              title="Waschen"
              meta={
                value > 0
                  ? `${formatEuro(value - Math.round(value * fee))} sauber in ca. ${clock.formatDuration(launderingDuration(value))}`
                  : 'Kein Schwarzgeld frei'
              }
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
    </Card>
  );
}

registerSlot('tab:business', {
  id: 'laundering.section',
  title: 'Geldwäsche',
  order: 50,
  component: LaunderingSection,
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
      action: (ui) => {
        ui.selectTab('business');
        ui.openSection('laundering.section');
      },
    };
  },
});
