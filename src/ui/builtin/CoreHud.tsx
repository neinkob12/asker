import { memo } from 'preact/compat';
import { clock, formatEuro, wallet } from '../../core';
import { CountUp, FloatingNumber, Icon } from '../components';
import { useGameSelector, useRuntime } from '../hooks';

const euro = (v: number) => formatEuro(Math.round(v));
const delta = (d: number) => `${d > 0 ? '+' : '−'}${euro(Math.abs(d))}`;

/**
 * Geld im HUD (Look "Glas"): Kachel mit Beutel, darüber "Schwarzgeld" groß in Barlow Condensed, nach einer Haarlinie
 * das saubere Geld kleiner. Zahlen zählen und Änderungen fliegen auf. Ein Klick auf Schwarzgeld oder sauberes Geld
 * öffnet die Geldwäsche (Auftrag 26). Darunter hängt die Heat-Pille der Polizei (eigener HUD-Eintrag, gleiche Kapsel).
 */
export const MoneyHud = memo(function MoneyHud() {
  // Liest nur über Selektoren und ist ohne Props: wird nur neu gezeichnet, wenn sich ein Kontostand ändert.
  const { api } = useRuntime();
  const dirty = useGameSelector((state) => wallet.balance(state, 'dirty'));
  const clean = useGameSelector((state) => wallet.balance(state, 'clean'));
  const openLaundering = () => api.openPhone('laundering.app');
  return (
    <div class="hud-money">
      <span class="hud-money__tile" aria-hidden="true">
        <Icon name="moneyBag" strokeWidth={2} />
      </span>
      <div class="hud-money__values">
        <button
          type="button"
          class="hud-money__row"
          title="Schwarzgeld: damit bezahlst du alles Illegale. Klick: Geldwäsche"
          onClick={openLaundering}
        >
          <span class="hud-label is-dirty">Schwarzgeld</span>
          <span class="hud-money__dirty">
            <CountUp value={dirty} format={euro} />
          </span>
          <FloatingNumber value={dirty} format={delta} min={5} />
        </button>
        <button
          type="button"
          class="hud-money__row hud-money__row--clean"
          title="Sauberes Geld: für alles Legale. Klick: Geldwäsche"
          onClick={openLaundering}
        >
          <span class="hud-label is-money">Sauber</span>
          <span class="hud-money__clean">
            <CountUp value={clean} format={euro} />
          </span>
          <FloatingNumber value={clean} format={delta} min={5} />
        </button>
      </div>
    </div>
  );
});

/** Uhr über der Karte: "Sa · Tag 9" über der Uhrzeit. */
export const ClockHud = memo(function ClockHud() {
  // Nur beim Minutenwechsel neu zeichnen (Spielzeit kann zwischen den Minuten Bruchteile haben).
  const time = useGameSelector((state) => Math.floor(state.time));
  return (
    <div class="hud-clock" title={clock.formatLong(time)}>
      <span class="hud-label">
        {clock.weekdayName(time, true)} · Tag {clock.day(time)}
      </span>
      <time class="hud-clock__time">{clock.formatTime(time)}</time>
    </div>
  );
});
