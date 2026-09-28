// Oberfläche der Geldwäsche: Betrag wählen, Gebühr und Dauer sehen, laufende Wäschen verfolgen (Tab "Geschäft").

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatPercent, wallet } from '../../../core';
import { Button, Card, Hint, KeyValue, onGameEvent, ProgressBar, registerSlot, useGame } from '../../../ui';
import {
  amountInProgress,
  batchProgress,
  getBatches,
  launderingCapacity,
  launderingDuration,
  launderingFee,
} from '../index';
import './laundering.css';

const STEPS = [100, 500, 1000] as const;

function LaunderingSection() {
  const { state, dispatch } = useGame();
  const [amount, setAmount] = useState(500);
  const dirty = Math.floor(wallet.balance(state, 'dirty'));
  const free = Math.max(0, launderingCapacity(state) - amountInProgress(state));
  const max = Math.min(dirty, free);
  const value = Math.min(amount, max);
  const fee = launderingFee(state);
  const batches = getBatches(state);
  const change = (delta: number) => setAmount(Math.max(0, Math.min(max, value + delta)));
  return (
    <Card title="Geldwäsche">
      <Hint>
        Schwarzgeld wird über Zeit zu sauberem Geld, das du für Legales brauchst. Gebühr {formatPercent(fee)}, gerade
        frei: {formatEuro(free)}.
      </Hint>
      <div class="laundering-amount">
        <Button small disabled={value <= 0} onClick={() => change(-100)}>
          −
        </Button>
        <strong>{formatEuro(value)}</strong>
        <Button small disabled={value >= max} onClick={() => change(100)}>
          +
        </Button>
        {STEPS.map((s) => (
          <Button key={s} small variant="subtle" disabled={s > max} onClick={() => setAmount(s)}>
            {formatEuro(s)}
          </Button>
        ))}
        <Button small variant="subtle" disabled={max <= 0} onClick={() => setAmount(max)}>
          Max
        </Button>
      </div>
      {value > 0 && (
        <Hint>
          Du bekommst {formatEuro(value - Math.round(value * fee))} sauber, in ca.{' '}
          {clock.formatDuration(launderingDuration(value))}.
        </Hint>
      )}
      <Button
        variant="primary"
        wide
        disabled={value < 100}
        onClick={() => dispatch({ type: 'laundering.launder', payload: { amount: value } })}
      >
        Waschen
      </Button>
      {batches.map((b) => (
        <div key={b.id} class="laundering-batch">
          <KeyValue label={`${formatEuro(b.amount)} in der Wäsche`} value={`fertig ${clock.formatTime(b.readyAt)}`} />
          <ProgressBar value={batchProgress(state, b)} label="Geldwäsche" />
        </div>
      ))}
    </Card>
  );
}

registerSlot('tab:business', { id: 'laundering.section', order: 50, component: LaunderingSection });
onGameEvent('laundering.completed', 'laundering.toast', (payload, ui) =>
  ui.toast(`${formatEuro(payload.amount - payload.fee)} sind jetzt sauber.`, 'good'),
);
