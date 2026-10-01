import { clock, formatEuro, wallet } from '../../core';
import { CountUp, FloatingNumber, Icon } from '../components';
import { useGame } from '../hooks';

const euro = (v: number) => formatEuro(Math.round(v));
const delta = (d: number) => `${d > 0 ? '+' : '−'}${euro(Math.abs(d))}`;

/**
 * Geld im HUD (Look "Glas"): Kachel mit Beutel, darüber "Schwarzgeld" groß in Barlow Condensed, nach einer Haarlinie
 * das saubere Geld kleiner. Zahlen zählen und Änderungen fliegen auf. Darunter hängt die Heat-Pille der Polizei
 * (eigener HUD-Eintrag, gleiche Kapsel).
 */
export function MoneyHud() {
  const { state } = useGame();
  const dirty = wallet.balance(state, 'dirty');
  const clean = wallet.balance(state, 'clean');
  return (
    <div class="hud-money">
      <span class="hud-money__tile" aria-hidden="true">
        <Icon name="moneyBag" strokeWidth={2} />
      </span>
      <div class="hud-money__values">
        <div class="hud-money__row" title="Schwarzgeld: damit bezahlst du alles Illegale">
          <span class="hud-label is-dirty">Schwarzgeld</span>
          <span class="hud-money__dirty">
            <CountUp value={dirty} format={euro} />
          </span>
          <FloatingNumber value={dirty} format={delta} min={5} />
        </div>
        <div class="hud-money__row hud-money__row--clean" title="Sauberes Geld: für alles Legale">
          <span class="hud-label is-money">Sauber</span>
          <span class="hud-money__clean">
            <CountUp value={clean} format={euro} />
          </span>
          <FloatingNumber value={clean} format={delta} min={5} />
        </div>
      </div>
    </div>
  );
}

/** Uhr über der Karte: "Sa · Tag 9" über der Uhrzeit. */
export function ClockHud() {
  const { state } = useGame();
  return (
    <div class="hud-clock" title={clock.formatLong(state.time)}>
      <span class="hud-label">
        {clock.weekdayName(state.time, true)} · Tag {clock.day(state.time)}
      </span>
      <time class="hud-clock__time">{clock.formatTime(state.time)}</time>
    </div>
  );
}
