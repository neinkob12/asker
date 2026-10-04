// Gangs: die Hauptgegner, die jede Stadt zu Beginn unter sich aufgeteilt haben (je vier in Köln und Hamburg, Auftrag
// 30; sie handeln nur, wenn ihre Stadt live ist). Frei erfundene Gangs mit Boss,
// Heimat-Veedel, Stil und Stärken (data.ts). Jede hat Geld, Leute und Ware und eine KI, die stündlich tickt:
// Sie verteidigt und erweitert ihr Revier, drückt die Preise, ignoriert dich als kleinen Fisch und wird
// feindseliger, je mehr du in ihren Veedeln verkaufst: erst Warnung, dann Drohung, dann Überfälle.
//
// Gegen die Gangs: Gewalt ('gangs.attack' → Konfrontation), wirtschaftlich (Verkäufe in ihrem Revier kosten sie
// Einfluss und Umsatz), Polizei ('police.snitch' → Razzia bei ihnen) und Diplomatie (Waffenstillstand,
// Schutzgeld zahlen oder kassieren, Bündnis gegen eine andere Gang). Drohungen und Angebote kommen als
// Handy-Nachricht, die Antworten lösen die Befehle aus.
//
// Öffentliche API:
//   getGangs(state, cityId?), getGang(state, id), gangCity(state, id), getGangStatus(state, id), gangVeedel(state, id),
//   veedelGang(state, veedelId),
//   gangPower(state, id),
//   playerPower(state), isGangBroken, hasCeasefire, paysTribute, isAllied, isAtPeace, ceasefireCost,
//   tributeAmount, protectionAmount, gangContact(gang), STAGE_NAMES, GANG_SPOT_MIN_INFLUENCE, ALLIANCE_COST, WARN_AT
// Befehle: 'gangs.ceasefire', 'gangs.payTribute', 'gangs.refuse', 'gangs.demandProtection', 'gangs.collect',
//   'gangs.releaseProtection', 'gangs.ally', 'gangs.attack', 'gangs.acceptOffer'
// Ereignisse: 'gang.pushStarted', 'gang.pushEnded', 'gang.escalated', 'gang.raidStarted', 'gang.diplomacyChanged',
//   'gang.busted'
//
// Achtung Abhängigkeiten: territory hängt von gangs ab (Startverteilung der Reviere). gangs darf deshalb
// nicht dependsOn: ['territory'] eintragen (Zyklus). Für API-Aufrufe zur Laufzeit ist das auch nicht nötig.

import { defineModule } from '../../core';
import type { FactionId } from '../territory';
import { gangsTick } from './ai';
import {
  acceptOffer,
  ally,
  attack,
  ceasefire,
  collect,
  demandProtection,
  payTribute,
  refuse,
  releaseProtection,
} from './diplomacy';
import { type IncidentKind, respond } from './methods';
import { onControlChanged, onEncounterResolved, onPoliceRaid, onSale, onTipOff } from './reactions';
import { type GangStage, type GangsState, initialGangsState } from './state';

/** Zustand bis Version 3 (vor Auftrag 23). */
type GangsStateV3 = Pick<GangsState, 'gangs' | 'priceFactors'>;

export { ALLIANCE_COST, GANG_SPOT_MIN_INFLUENCE, WARN_AT } from './config';
export type { Gang, GangMethod, GangTraits } from './data';
export { canJoinRaid, raidCrew } from './diplomacy';
export {
  describeIncident,
  type GangActionEntry,
  type GangIncident,
  type GangIntimidation,
  gangActions,
  INCIDENT_CHOICES,
  type IncidentKind,
  intimidationAt,
  intimidationFactor,
  openIncidents,
} from './methods';
export {
  ceasefireCost,
  type GangAlliance,
  type GangOffer,
  type GangProtection,
  type GangPush,
  type GangStage,
  type GangStatus,
  type GangsState,
  type GangTribute,
  gangCity,
  gangContact,
  gangPower,
  gangVeedel,
  getGang,
  getGangStatus,
  getGangs,
  hasCeasefire,
  isAllied,
  isAtPeace,
  isGangBroken,
  paysTribute,
  playerPower,
  protectionAmount,
  raidTargets,
  STAGE_NAMES,
  tributeAmount,
  veedelGang,
} from './state';

export type GangAgreement = 'ceasefire' | 'tribute' | 'protection' | 'alliance';

declare module '../../core' {
  interface ModuleStates {
    gangs: GangsState;
  }
  interface GameCommands {
    /** Waffenstillstand kaufen: eine Weile keine Überfälle, Feindseligkeit sinkt. */
    'gangs.ceasefire': { gangId: string };
    /** Schutzgeld an die Gang zahlen: eine Woche Ruhe. */
    'gangs.payTribute': { gangId: string };
    /** Forderung einer Gang ablehnen. */
    'gangs.refuse': { gangId: string };
    /** Schutzgeld von einer Gang verlangen (nur wenn du stark genug bist). */
    'gangs.demandProtection': { gangId: string };
    /** Verweigertes Schutzgeld eintreiben (Konfrontation). Ohne Angaben: Sicherheitsleute, Spieler entscheidet. */
    'gangs.collect': { gangId: string; staffIds?: string[]; playerPresent?: boolean };
    /** Auf das Schutzgeld einer Gang verzichten. */
    'gangs.releaseProtection': { gangId: string };
    /** Bündnis mit einer Gang gegen eine andere. */
    'gangs.ally': { gangId: string; againstGangId: string };
    /** Überfall auf einen Spot der Gang in einem Veedel (Konfrontation). */
    'gangs.attack': { gangId: string; veedelId: string; staffIds: string[]; playerPresent: boolean };
    /** Angebotene Ware kaufen. Manchmal kippt der Deal. */
    'gangs.acceptOffer': { gangId: string; offerId: number };
    /** Antwort auf einen Vorfall (Auftrag 23): Einbruch, Abwerben, Einschüchtern, Erpressung, Chancen. */
    'gangs.respond': { incidentId: number; choice: string };
  }
  interface GameEvents {
    'gang.pushStarted': { gangId: string; veedelId: string; against: FactionId | null };
    'gang.pushEnded': { gangId: string; veedelId: string; success: boolean };
    /** Eskalationsstufe gegenüber dem Spieler gestiegen (1 Warnung, 2 Drohung, 3 Überfälle). */
    'gang.escalated': { gangId: string; stage: GangStage };
    'gang.raidStarted': { gangId: string; encounterId: number; target: 'spot' | 'courier' | 'warehouse' };
    'gang.diplomacyChanged': { gangId: string; kind: GangAgreement; active: boolean };
    /** Razzia der Polizei bei einer Gang (z.B. nach deinem Tipp): was sie verloren hat. */
    'gang.busted': { gangId: string; veedelId: string; arrests: number; goods: number; money: number };
    /** Auftrag 23: Einbruch in ein Lager bemerkt (amount 0: Wache hat sie verscheucht). gangId = ausführende Gang. */
    'gang.burglary': { gangId: string; warehouseId: string; amount: number; productId?: string };
    'gang.poachAttempt': { gangId: string; staffId: string };
    'gang.intimidation': { gangId: string; spotId: string; until: number };
    'gang.tipOff': { gangId: string; veedelId: string; raid: boolean };
    'gang.blackmail': { gangId: string; warehouseId: string; amount: number };
    /** Chance von einer Gang (Warnung vor einem Rivalen, Gefallen, Überläufer). */
    'gang.goodTurn': { gangId: string; kind: 'warnRival' | 'favor' | 'defector' };
    'gang.incidentResolved': { incidentId: number; kind: IncidentKind; choice: string };
  }
}

export default defineModule({
  id: 'gangs',
  version: 4,
  dependsOn: ['veedel'],
  init: () => initialGangsState(),
  tickEvery: 60,
  tick: gangsTick,
  commands: {
    'gangs.ceasefire': (ctx, { gangId }) => ceasefire(ctx, gangId),
    'gangs.payTribute': (ctx, { gangId }) => payTribute(ctx, gangId),
    'gangs.refuse': (ctx, { gangId }) => refuse(ctx, gangId),
    'gangs.demandProtection': (ctx, { gangId }) => demandProtection(ctx, gangId),
    'gangs.collect': (ctx, { gangId, staffIds, playerPresent }) => collect(ctx, gangId, staffIds, playerPresent),
    'gangs.releaseProtection': (ctx, { gangId }) => releaseProtection(ctx, gangId),
    'gangs.ally': (ctx, { gangId, againstGangId }) => ally(ctx, gangId, againstGangId),
    'gangs.attack': (ctx, { gangId, veedelId, staffIds, playerPresent }) =>
      attack(ctx, gangId, veedelId, staffIds, playerPresent),
    'gangs.acceptOffer': (ctx, { gangId, offerId }) => acceptOffer(ctx, gangId, offerId),
    'gangs.respond': (ctx, { incidentId, choice }) => respond(ctx, incidentId, choice),
  },
  on: {
    'sale.completed': onSale,
    'encounter.resolved': onEncounterResolved,
    'police.tipOff': onTipOff,
    'police.raid': onPoliceRaid,
    'territory.controlChanged': onControlChanged,
  },
  migrations: {
    // Version 1 (Fundament) hatte keinen Zustand.
    2: (): GangsState => initialGangsState(),
    // Version 3 (Auftrag 30): Die Hamburger Gangs kommen dazu, wie bei einem neuen Spiel.
    3: (old: GangsState): GangsState => ({ ...old, gangs: { ...initialGangsState().gangs, ...old.gangs } }),
    // Version 4 (Auftrag 23): Vorfälle, Einschüchterungen, Protokoll und Abklingzeiten der neuen Gang-Methoden.
    4: (old: GangsStateV3): GangsState => ({
      ...old,
      incidents: [],
      intimidations: [],
      log: {},
      nextMethodAt: {},
      lastMethodAt: null,
    }),
  },
});
