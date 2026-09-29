import { formatEuro, wallet } from '../../core';
import { CountUp, FloatingNumber, IconChip } from '../components';
import { useGame } from '../hooks';

const euro = (v: number) => formatEuro(Math.round(v));

/** Geld im HUD: Schwarzgeld groß, sauberes Geld erst, wenn es welches gibt. Zahlen zählen und fliegen. */
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
