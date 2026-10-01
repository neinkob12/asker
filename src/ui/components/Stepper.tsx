// Stepper wie bei iOS (UIStepper): eine Pille mit − | +, links daneben der Wert. Für Preise und Mengen statt zweier
// loser Knöpfe. Gedrückt halten wiederholt (erst langsam, dann schneller), jede Stufe gibt eine Auswahl-Rückmeldung.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { haptic } from '../haptics';
import { Icon } from './Icon';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Beschriftung für Screenreader, z.B. "Preis Gras". */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** Anzeige des Werts links der Pille. Ohne: kein Wert (z.B. wenn er schon in der Zeile steht). */
  format?: (value: number) => ComponentChildren;
  disabled?: boolean;
  class?: string;
}

const REPEAT_DELAY = 420;
const REPEAT_EVERY = 90;

export function Stepper(props: StepperProps) {
  const min = props.min ?? Number.NEGATIVE_INFINITY;
  const max = props.max ?? Number.POSITIVE_INFINITY;
  const step = props.step ?? 1;
  const latest = useRef(props);
  latest.current = props;
  const repeat = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });

  const change = (direction: 1 | -1): boolean => {
    const p = latest.current;
    const next = Math.round((p.value + direction * step) * 1e6) / 1e6;
    if (next < min || next > max) return false;
    haptic('selection');
    p.onChange(next);
    return true;
  };
  const stop = () => {
    if (repeat.current.timer) clearTimeout(repeat.current.timer);
    repeat.current.timer = null;
  };
  // Gedrückt halten: nach kurzer Pause wiederholen. Der Klick beim Loslassen zählt dann nicht noch einmal.
  const hold = (direction: 1 | -1) => {
    stop();
    repeat.current.fired = false;
    const tick = () => {
      repeat.current.fired = true;
      if (change(direction)) repeat.current.timer = setTimeout(tick, REPEAT_EVERY);
    };
    repeat.current.timer = setTimeout(tick, REPEAT_DELAY);
  };
  useEffect(() => stop, []);

  const button = (direction: 1 | -1) => {
    const blocked = props.disabled || (direction < 0 ? props.value - step < min : props.value + step > max);
    return (
      <button
        type="button"
        class="ui-stepper__button"
        aria-label={direction < 0 ? `${props.label}: weniger` : `${props.label}: mehr`}
        disabled={blocked}
        onPointerDown={(e) => e.button === 0 && hold(direction)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={() => {
          if (repeat.current.fired) {
            repeat.current.fired = false;
            return;
          }
          change(direction);
        }}
      >
        <Icon name={direction < 0 ? 'minus' : 'plus'} />
      </button>
    );
  };

  return (
    <fieldset class={`ui-stepper ${props.class ?? ''}`} aria-label={props.label}>
      {props.format && (
        <output class="ui-stepper__value" aria-live="polite">
          {props.format(props.value)}
        </output>
      )}
      <span class="ui-stepper__pill">
        {button(-1)}
        <span class="ui-stepper__divider" aria-hidden="true" />
        {button(1)}
      </span>
    </fieldset>
  );
}
