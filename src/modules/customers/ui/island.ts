// Dynamic Island: Aufträge mit Frist, Kuriere unterwegs, Umsatz des Tages und ein Auftritt bei großen Einnahmen.

import { clock, formatEuro } from '../../../core';
import { islandCountdown, type LiveActivity, registerLiveActivity } from '../../../ui';
import { formatProductAmount, productName } from '../../goods';
import { getSpot } from '../../spots';
import { getOrders, getSalesStats, isPlayerAway, orderProgress, playerSpot, waitingAt } from '../index';

/** Umsatz zu Beginn des Tages (nur in dieser Sitzung gemerkt, nach dem Laden zählt der Tag ab dann). */
let dayStart: { day: number; revenue: number } | null = null;

registerLiveActivity({
  id: 'customers.orders',
  activities: (state) => {
    const offered = getOrders(state, { status: 'offered' }).map(
      (order): LiveActivity => ({
        id: `customers.order.${order.id}`,
        priority: 72,
        icon: 'package',
        tone: 'warn',
        leading: 'Auftrag',
        trailing: islandCountdown(order.expiresAt - state.time),
        title: `${order.contactName}: ${formatProductAmount(order.productId, order.amount)} ${productName(order.productId)}`,
        detail: `${formatEuro(order.price)} · Antwort bis ${clock.formatTime(order.expiresAt)}`,
        open: (ui) => ui.openPhone('customers.orders'),
      }),
    );
    const enRoute = getOrders(state, { status: 'enRoute' }).map(
      (order): LiveActivity => ({
        id: `customers.delivery.${order.id}`,
        priority: 52,
        icon: 'truck',
        tone: 'info',
        leading: 'Kurier',
        trailing: order.arrivesAt !== null ? islandCountdown(order.arrivesAt - state.time) : '…',
        title: `Lieferung an ${order.contactName}`,
        detail: formatEuro(order.price),
        progress: orderProgress(state, order),
        open: (ui) => ui.openPhone('customers.orders'),
      }),
    );
    const day = clock.day(state.time);
    const revenue = getSalesStats(state).revenue;
    if (!dayStart || dayStart.day !== day || revenue < dayStart.revenue) dayStart = { day, revenue };
    const today = revenue - dayStart.revenue;
    const status: LiveActivity[] =
      today > 0
        ? [
            {
              id: 'customers.today',
              priority: 10,
              icon: 'moneyBag',
              tone: 'accent',
              leading: 'Heute',
              trailing: `+${formatEuro(Math.round(today))}`,
              title: 'Umsatz heute',
              detail: `${clock.weekdayName(state.time)}, Tag ${day}`,
              open: (ui) => ui.selectTab('business'),
            },
          ]
        : [];
    // Du stehst an einem Spot und verkaufst selbst.
    const spotId = playerSpot(state);
    const spot = spotId ? getSpot(state, spotId) : undefined;
    const self: LiveActivity[] = spot
      ? [
          {
            id: 'customers.self',
            priority: 20,
            icon: 'runner',
            tone: isPlayerAway(state) ? 'neutral' : 'accent',
            leading: 'Spot',
            trailing: String(waitingAt(state, spot.id).length),
            title: `Du verkaufst am ${spot.name}`,
            detail: isPlayerAway(state) ? 'gerade unterwegs' : `${waitingAt(state, spot.id).length} warten`,
            open: (ui) => ui.openPanel('spots.spot', { spotId: spot.id }),
          },
        ]
      : [];
    return [...offered, ...enRoute, ...self, ...status];
  },
});
