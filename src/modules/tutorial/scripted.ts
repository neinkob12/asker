// Geskriptete Momente des Tutorials (Auftrag 46c): Handy-Bestellung bei 3.000 € Schwarzgeld, Pop-up „Lager fast
// leer“ an den ersten Spieltagen, erster Gang-Angriff bei 6.000 €. Alle hängen an Bedingungen im Zustand, nie an der
// Uhr, laufen im Tick des Moduls (jede Spielminute prüfen reicht), passieren genau einmal (Flags in `scripted`) und
// nur bei aktivem Tutorial. Die Beschlagnahme der zweiten Rotterdam-Lieferung entscheidet `suppliers` beim Abladen am
// Kai (scriptedSeizure) und meldet sie mit 'tutorial.scripted'. Jeder Moment löst 'tutorial.scriptedMoment' aus,
// darauf startet die Oberfläche ihre Tour bzw. das Pop-up.

import { type Ctx, clock, wallet } from '../../core';
import { scriptedOrder } from '../customers';
import { scriptedRaid } from '../gangs';
import { getStock, usagePerDay } from '../goods';
import { getSpot } from '../spots';
import { LOW_STOCK_POPUP, SCRIPTED_FIRST_ATTACK, SCRIPTED_PHONE_ORDER } from './config';
import { tutorialActive } from './index';

const CITY = 'koeln';

/** Handy-Bestellung: ein Kunde aus dem Veedel des Neumarkts bestellt Ware, die auf Lager ist. */
function phoneOrder(ctx: Ctx): void {
  const t = ctx.state.modules.tutorial;
  if (t.scripted.phoneOrder || t.stage < SCRIPTED_PHONE_ORDER.stage) return;
  if (wallet.balance(ctx.state, 'dirty') < SCRIPTED_PHONE_ORDER.money) return;
  if (getStock(ctx.state, { cityId: CITY }) <= 0) return;
  const veedelId = getSpot(ctx.state, SCRIPTED_FIRST_ATTACK.spotId)?.veedelId;
  if (!veedelId) return;
  const order = scriptedOrder(ctx, { veedelId });
  if (!order) return;
  t.scripted.phoneOrder = true;
  ctx.emit('tutorial.scriptedMoment', { key: 'phoneOrder', ref: order.contactId });
}

/** Lager fast leer: Bestand in Köln unter dem Verbrauch eines Tages, bis zu dreimal, eins pro Tag. */
function lowStock(ctx: Ctx): void {
  const t = ctx.state.modules.tutorial;
  const day = clock.day(ctx.now);
  if (t.stage < LOW_STOCK_POPUP.stage || day > LOW_STOCK_POPUP.days) return;
  if (t.scripted.lowStockPopups >= LOW_STOCK_POPUP.max || t.scripted.lowStockDay === day) return;
  const usage = usagePerDay(ctx.state, { cityId: CITY });
  if (!(usage > 0) || getStock(ctx.state, { cityId: CITY }) >= usage) return;
  t.scripted.lowStockPopups += 1;
  t.scripted.lowStockDay = day;
  ctx.emit('tutorial.scriptedMoment', { key: 'lowStockPopup' });
}

/** Erster Gang-Angriff: fest, ohne Konfrontation (gangs.scriptedRaid). */
function firstAttack(ctx: Ctx): void {
  const t = ctx.state.modules.tutorial;
  if (t.scripted.firstAttack || t.stage < SCRIPTED_FIRST_ATTACK.stage) return;
  if (wallet.balance(ctx.state, 'dirty') < SCRIPTED_FIRST_ATTACK.money) return;
  const result = scriptedRaid(ctx, {
    spotId: SCRIPTED_FIRST_ATTACK.spotId,
    goodsShare: SCRIPTED_FIRST_ATTACK.goodsShare,
    cashShare: SCRIPTED_FIRST_ATTACK.cashShare,
  });
  if (!result) return;
  t.scripted.firstAttack = true;
  ctx.emit('tutorial.scriptedMoment', { key: 'firstAttack', ref: result.gangId });
}

/** Alle Momente prüfen (jede Spielminute, nur bei aktivem Tutorial). */
export function runScriptedMoments(ctx: Ctx): void {
  if (!tutorialActive(ctx.state)) return;
  phoneOrder(ctx);
  lowStock(ctx);
  firstAttack(ctx);
}
