import { clock, formatEuro, wallet } from '../../core';
import { Stat } from '../components';
import { useGame } from '../hooks';

export function MoneyHud() {
  const { state } = useGame();
  return (
    <>
      <Stat label="Schwarzgeld" value={formatEuro(wallet.balance(state, 'dirty'))} />
      <Stat label="Sauber" value={formatEuro(wallet.balance(state, 'clean'))} />
    </>
  );
}

export function ClockHud() {
  const { state } = useGame();
  return <Stat label="Zeit" value={clock.formatLong(state.time)} />;
}
