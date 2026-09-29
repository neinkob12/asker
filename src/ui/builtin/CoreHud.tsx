import { clock, formatEuro, wallet } from '../../core';
import { DAY_PHASE_NAMES, dayPhase } from '../../map/daylight';
import { Stat } from '../components';
import { useGame } from '../hooks';

/** Geld im HUD. Sauberes Geld erst, wenn es welches gibt (spart Platz, am Anfang wäscht noch niemand). */
export function MoneyHud() {
  const { state } = useGame();
  const clean = wallet.balance(state, 'clean');
  return (
    <>
      <Stat icon="money" tone="accent" label="Schwarzgeld" value={formatEuro(wallet.balance(state, 'dirty'))} />
      {clean > 0 && <Stat icon="euro" label="Sauber" value={formatEuro(clean)} />}
    </>
  );
}

export function ClockHud() {
  const { state } = useGame();
  const phase = dayPhase(clock.minuteOfDay(state.time));
  const icon = phase === 'night' ? 'moon' : phase === 'day' ? 'sun' : 'cloud';
  return (
    <Stat
      icon={phase === 'dusk' || phase === 'dawn' ? 'sun' : icon}
      tone={phase === 'night' ? 'info' : phase === 'day' ? undefined : 'warn'}
      label={`${clock.weekdayName(state.time, true)} · Tag ${clock.day(state.time)}`}
      value={clock.formatTime(state.time)}
      title={`${clock.formatLong(state.time)} · ${DAY_PHASE_NAMES[phase]}`}
    />
  );
}
