// Oberfläche der Ware: Lagerbestand im HUD und Lager-Marker auf der Karte.

import { formatAmount } from '../../../core';
import { addHtmlMarker, el, registerMapLayer } from '../../../map';
import { registerHudItem, Stat, useGame } from '../../../ui';
import { getStock, getWarehouses } from '../index';
import './goods.css';

function StockHud() {
  const { state } = useGame();
  return <Stat label="Lager" value={formatAmount(getStock(state))} />;
}

registerHudItem({ id: 'goods.stock', order: 20, component: StockHud });

registerMapLayer({
  id: 'goods.warehouses',
  order: 30,
  mount(ctx) {
    const shown = new Set<string>();
    const draw = () => {
      const state = ctx.getState();
      if (!state) return;
      for (const w of getWarehouses(state)) {
        if (shown.has(w.id)) continue;
        shown.add(w.id);
        addHtmlMarker(ctx.map, {
          position: w,
          className: 'map-place map-place--warehouse',
          anchor: 'bottom',
          children: [el('span', 'map-place-icon'), el('span', 'map-place-name', w.name)],
        });
      }
    };
    draw();
    return { update: draw };
  },
});
