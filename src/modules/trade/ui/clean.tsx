// Sauberes Geld (Auftrag 43): Lkw, Halle, Liegeplatz und Schiffe kosten sauberes Geld, der Verkauf brachte schwarzes.
// Statt einer nur ausgegrauten Zeile sagt diese, wie viel fehlt, und führt zur Geldwäsche (Jansens Reederei).

import { formatEuro } from '../../../core';
import { ItemContent, ListItem, useGame, useUi } from '../../../ui';

/** Zeile „Dir fehlen … € sauber“ (nichts, wenn genug da ist). In einer `List` verwenden. */
export function MissingClean(props: { cost: number; what: string }) {
  const { state } = useGame();
  const ui = useUi();
  const missing = Math.ceil(props.cost - state.wallet.clean);
  if (missing <= 0) return null;
  return (
    <ListItem onClick={() => ui.openPhone('laundering.app')}>
      <ItemContent
        icon="washing"
        color="money"
        title={`Dir fehlen ${formatEuro(missing)} sauber`}
        meta={`für ${props.what}: Schwarzgeld waschen, große Beträge über Jansens Reederei`}
      />
    </ListItem>
  );
}
