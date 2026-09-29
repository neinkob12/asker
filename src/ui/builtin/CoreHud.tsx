import { clock, formatEuro, wallet } from '../../core';
import { DAY_PHASE_NAMES, dayPhase } from '../../map/daylight';
import { CountUp, FloatingNumber, Icon, IconChip } from '../components';
import { useGame } from '../hooks';

const euro = (v: number) => formatEuro(Math.round(v));

/** Geld im HUD: Schwarzgeld groß und grün, sauberes Geld erst, wenn es welches gibt. Zahlen zählen und fliegen. */
export function MoneyHud() {
  const { state } = useGame();
  const dirty = wallet.balance(state, 'dirty');
  const clean = wallet.balance(state, 'clean');
  return (
    <>
      <div class="hud-pill hud-money" title="Schwarzgeld: damit bezahlst du alles Illegale">
        <IconChip icon="moneyBag" color="yellow" size="md" />
        <span class="hud-pill__text">
          <span class="hud-pill__label">Schwarzgeld</span>
          <span class="hud-pill__value hud-money__value">
            <CountUp value={dirty} format={euro} />
          </span>
        </span>
        <FloatingNumber value={dirty} format={(d) => `${d > 0 ? '+' : '−'}${euro(Math.abs(d))}`} min={5} />
      </div>
      {clean > 0 && (
        <div class="hud-pill hud-money hud-money--clean" title="Sauberes Geld: für alles Legale">
          <IconChip icon="euro" color="white" size="sm" />
          <span class="hud-pill__text">
            <span class="hud-pill__label">Sauber</span>
            <span class="hud-pill__value">
              <CountUp value={clean} format={euro} />
            </span>
          </span>
          <FloatingNumber value={clean} format={(d) => `${d > 0 ? '+' : '−'}${euro(Math.abs(d))}`} min={5} />
        </div>
      )}
    </>
  );
}

/** Uhr in der Zeit-Pille: Tageszeit-Icon, Wochentag und Tag, Uhrzeit. */
export function ClockHud() {
  const { state } = useGame();
  const phase = dayPhase(clock.minuteOfDay(state.time));
  const icon = phase === 'night' ? 'moon' : phase === 'day' ? 'sun' : phase === 'dawn' ? 'sunrise' : 'sun';
  return (
    <div class={`hud-clock hud-clock--${phase}`} title={`${clock.formatLong(state.time)} · ${DAY_PHASE_NAMES[phase]}`}>
      <Icon name={icon} class="hud-clock__icon" />
      <span class="hud-clock__text">
        <span class="hud-clock__day">
          {clock.weekdayName(state.time, true)} · Tag {clock.day(state.time)}
        </span>
        <span class="hud-clock__time">{clock.formatTime(state.time)}</span>
      </span>
    </div>
  );
}
