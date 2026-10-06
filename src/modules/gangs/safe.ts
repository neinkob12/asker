// Tresor knacken (Auftrag 44, Minispiel 'safe'): Nach einem erfolgreichen Überfall auf einen Gang-Spot, bei dem du
// selbst dabei warst und noch lebst, steht im Hinterzimmer ein Tresor. Geknackt: Schwarzgeld aus der Kasse der Gang
// (max · Score). Nicht geknackt: Alarm, Heat im Veedel. Frist ohne Oberfläche (timeout): nichts.

import { type Ctx, formatEuro, type GameEvents, journal, wallet } from '../../core';
import { getEncounter } from '../encounters';
import { startMinigame } from '../minigames';
import { addHeat } from '../police';
import { veedelName } from '../veedel';
import { statusOf } from './common';
import { SAFE_ALARM_HEAT, SAFE_MAX, SAFE_MIN, SAFE_SHARE } from './config';
import { getGang } from './state';

/** So viel liegt im Tresor einer Gang mit diesem Geld (0 = kein Tresor, der sich lohnt). */
export function safeAmount(gangMoney: number): number {
  const max = Math.min(SAFE_MAX, Math.round(Math.max(0, gangMoney) * SAFE_SHARE));
  return max >= SAFE_MIN ? max : 0;
}

/** Nach 'encounter.resolved' eines Überfalls (origin attack:<gangId>): Tresor als Minispiel, wenn es passt. */
export function maybeStartSafe(ctx: Ctx, payload: GameEvents['encounter.resolved']): void {
  if (payload.outcome !== 'success' || payload.playerKilled || payload.kind !== 'gangSpotRaid') return;
  const encounter = getEncounter(ctx.state, payload.encounterId);
  const present = encounter?.participants.some((p) => p.isPlayer && !p.killed);
  const gangId = payload.request.opponent?.factionId;
  const gang = gangId ? getGang(ctx.state, gangId) : undefined;
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  const veedelId = payload.request.veedelId;
  if (!present || !gang || !s || !veedelId) return;
  const max = safeAmount(s.money);
  if (max === 0) return;
  startMinigame(ctx, {
    kind: 'safe',
    origin: { module: 'gangs', ref: `safe:${gang.id}:${payload.encounterId}` },
    cityId: gang.cityId,
    veedelId,
    title: 'Tresor knacken',
    situation: `Im Hinterzimmer von ${gang.name} steht ein alter Stahltresor. Drin: bis zu ${formatEuro(max)}.`,
    params: { max, gang: gang.name },
  });
}

/** 'minigame.finished' mit origin safe:<gangId>:<encounterId>: Geld oder Alarm. */
export function onSafeFinished(ctx: Ctx, payload: GameEvents['minigame.finished']): void {
  if (payload.origin.module !== 'gangs' || !payload.origin.ref.startsWith('safe:')) return;
  if (payload.by === 'timeout' || payload.score === null) return;
  const [, gangId, encounterId] = payload.origin.ref.split(':');
  const gang = getGang(ctx.state, gangId);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  // Das Veedel des Überfalls (der Tresor steht im Spot der Gang dort).
  const veedelId = getEncounter(ctx.state, Number(encounterId))?.request.veedelId ?? null;
  const who = payload.by === 'rightHand' ? 'Deine Rechte Hand' : 'Du';
  if (payload.won) {
    // Was im Tresor liegt, aus der Kasse der Gang (das Spiel steht still, solange der Tresor offen ist).
    const amount = Math.min(Math.max(0, Math.round(s.money)), Math.round(safeAmount(s.money) * payload.score));
    if (amount > 0) {
      wallet.earn(ctx, amount, 'dirty', `Tresor von ${gang.name}`, {
        category: 'income.other',
        cityId: payload.cityId,
      });
      s.money -= amount;
    }
    journal.add(
      ctx,
      amount > 0
        ? `${who} ${payload.by === 'rightHand' ? 'knackt' : 'knackst'} den Tresor von ${gang.name}: ${formatEuro(amount)}.`
        : `Der Tresor von ${gang.name} ist offen, aber leer.`,
      'good',
      veedelId ? { veedelId } : undefined,
    );
    return;
  }
  if (veedelId) addHeat(ctx, veedelId, SAFE_ALARM_HEAT);
  journal.add(
    ctx,
    `Der Tresor von ${gang.name} hält. Alarm${veedelId ? ` in ${veedelName(veedelId)}` : ''}, ihr müsst raus.`,
    'bad',
    veedelId ? { veedelId } : undefined,
  );
}
