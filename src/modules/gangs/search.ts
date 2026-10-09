// Bude durchsuchen (Auftrag 44, Minispiel 'search'): Hast du selbst Schutzgeld eingetrieben und der Schuldner zahlt
// nicht alles (oder er haut ab), steht seine Bude offen. Darin: der Rest der Schulden, den er versteckt hat (Absicht
// hideMoney), und seine eigene Reserve (SEARCH_BONUS vom Einsatz). Gefunden: Schwarzgeld aus der Kasse der Gang
// (max · Score). Nicht geschafft und die Nachbarn gehört (picks 'noise'): Heat im Veedel. Frist (timeout): nichts.

import { type Ctx, clock, formatEuro, type GameEvents, journal, wallet } from '../../core';
import { getEncounter } from '../encounters';
import { startMinigame } from '../minigames';
import { addHeat } from '../police';
import { veedelName } from '../veedel';
import { statusOf } from './common';
import { SEARCH_BONUS, SEARCH_MIN, SEARCH_NOISE_HEAT } from './config';
import { gangNameIn } from './data';
import { getGang } from './state';

/**
 * So viel liegt in der Bude: was vom Einsatz (stake) noch fehlt, plus SEARCH_BONUS vom Einsatz, höchstens so viel,
 * wie die Gang hat. 0 = lohnt nicht.
 */
export function searchAmount(stake: number, received: number, gangMoney: number): number {
  const open = Math.max(0, stake - Math.max(0, received));
  const max = Math.min(Math.round(open + SEARCH_BONUS * Math.max(0, stake)), Math.max(0, Math.round(gangMoney)));
  return max >= SEARCH_MIN ? max : 0;
}

/** Nach 'encounter.resolved' beim Eintreiben (origin collect:<gangId>): Bude durchsuchen, wenn es passt. */
export function maybeStartSearch(ctx: Ctx, payload: GameEvents['encounter.resolved']): void {
  if (payload.kind !== 'debtCollection' || payload.playerKilled) return;
  if (payload.outcome !== 'success' && payload.outcome !== 'retreat') return;
  // Ist die Polizei-Uhr abgelaufen, sind gleich die Bullen da: keine Zeit für die Bude.
  if (payload.result?.ending === 'clock') return;
  const encounter = getEncounter(ctx.state, payload.encounterId);
  const present = encounter?.participants.some((p) => p.isPlayer && !p.killed);
  const gangId = payload.request.opponent?.factionId;
  const gang = gangId ? getGang(ctx.state, gangId) : undefined;
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  const veedelId = payload.request.veedelId;
  if (!present || !gang || !s || !veedelId) return;
  const stake = payload.request.stakes?.money ?? 0;
  const received = Math.max(0, payload.result?.money ?? 0);
  const max = searchAmount(stake, received, s.money);
  if (max === 0) return;
  const situation =
    payload.outcome === 'retreat'
      ? `Der Schuldner von ${gang.name} ist weg, seine Bude steht offen. Irgendwo liegen bis zu ${formatEuro(max)}.`
      : received < stake
        ? `Er hat nicht alles rausgerückt. In seiner Bude liegen noch bis zu ${formatEuro(max)}, bevor er zurück ist.`
        : `Er hat gezahlt, aber seine Reserve liegt noch in der Bude: bis zu ${formatEuro(max)}, bevor er zurück ist.`;
  startMinigame(ctx, {
    kind: 'search',
    origin: { module: 'gangs', ref: `search:${gang.id}:${payload.encounterId}` },
    cityId: gang.cityId,
    veedelId,
    title: 'Bude durchsuchen',
    situation,
    params: { max, gang: gang.name, phase: clock.dayPhase(ctx.state.time) },
  });
}

/** 'minigame.finished' mit origin search:<gangId>:<encounterId>: Geld, Lärm oder nichts. */
export function onSearchFinished(ctx: Ctx, payload: GameEvents['minigame.finished']): void {
  if (payload.origin.module !== 'gangs' || !payload.origin.ref.startsWith('search:')) return;
  if (payload.by === 'timeout' || payload.score === null) return;
  const [, gangId, encounterId] = payload.origin.ref.split(':');
  const gang = getGang(ctx.state, gangId);
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return;
  const encounter = getEncounter(ctx.state, Number(encounterId));
  const veedelId = encounter?.request.veedelId ?? null;
  const at = veedelId ? { veedelId } : undefined;
  // Was in der Bude lag, wie beim Start (das Spiel stand still, solange gesucht wurde).
  const max = searchAmount(encounter?.request.stakes?.money ?? 0, encounter?.result?.money ?? 0, s.money);
  const amount = Math.min(Math.max(0, Math.round(s.money)), Math.round(max * payload.score));
  if (amount > 0) {
    wallet.earn(ctx, amount, 'dirty', `Versteck in der Bude (${gang.name})`, {
      category: 'income.other',
      cityId: payload.cityId,
    });
    s.money -= amount;
  }
  const who = payload.by === 'rightHand' ? 'Deine Rechte Hand findet' : 'Du findest';
  if (payload.won) {
    journal.add(
      ctx,
      `${who} in der Bude des Schuldners von ${gangNameIn(gang, 'dative')} ${formatEuro(amount)}.`,
      'good',
      at,
    );
    return;
  }
  const noise = payload.picks.includes('noise');
  if (noise && veedelId) addHeat(ctx, veedelId, SEARCH_NOISE_HEAT);
  const found = amount > 0 ? `Nur ${formatEuro(amount)} gefunden` : 'Nichts gefunden';
  journal.add(
    ctx,
    noise
      ? `${found}, und die Nachbarn haben alles gehört${veedelId ? `. Die Bullen fragen in ${veedelName(veedelId)} rum` : ''}.`
      : `${found} in der Bude des Schuldners von ${gangNameIn(gang, 'dative')}.`,
    noise ? 'bad' : 'info',
    at,
  );
}
