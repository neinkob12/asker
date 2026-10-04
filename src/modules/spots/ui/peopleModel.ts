// Leute an Spots (Auftrag 31), DOM-frei: Wer steht an welchem Spot (Läufer und Sicherheit aus staff, bis zu vier
// wartende Kunden aus customers) und in welchen Veedeln geht eine Streife (Heat über CHECK_THRESHOLD). Nur lesen; die
// Karte (people.ts) zeichnet daraus kleine Figuren. Versatz in Bildschirm-Einheiten um den Fuß des Spot-Markers, damit
// die Figuren auf jeder Zoomstufe nebeneinander stehen.

import type { GameState, LngLat } from '../../../core';
import { allWaiting } from '../../customers';
import { CHECK_THRESHOLD, getHeat } from '../../police';
import { getStaff } from '../../staff';
import { getAllSpots, getSpots, type Spot } from '../index';

export type FigureKind = 'staff' | 'customer' | 'patrol';

export interface Figure {
  /** Stabil, solange dieselbe Person dort steht (für ruhiges Pendeln). */
  key: string;
  kind: FigureKind;
  spotId: string;
  position: LngLat;
  /** Versatz in Einheiten des Symbols (x nach rechts, y nach unten), wird mit icon-size skaliert. */
  offset: [number, number];
  /** Phase fürs Pendeln (0–2π), aus dem Schlüssel. */
  phase: number;
}

/** Höchstens so viele Figuren auf einmal (Budget aus Auftrag 31). */
export const MAX_FIGURES = 60;
export const MAX_CUSTOMERS_PER_SPOT = 4;
export const MAX_STAFF_PER_SPOT = 3;

/**
 * Plätze um den Fuß des Markers: Personal links, Kundschaft rechts, alle etwas unterhalb des Fußes, damit Blase und
 * Plakette darüber frei bleiben (Einheiten des Symbols, y nach unten).
 */
const STAFF_SLOTS: [number, number][] = [
  [-18, 18],
  [-30, 12],
  [-28, 27],
];
const CUSTOMER_SLOTS: [number, number][] = [
  [18, 20],
  [30, 13],
  [29, 28],
  [42, 20],
];

/** Kleine, stabile Zahl aus einem Text (für die Phase des Pendelns, kein Zufall). */
export function phaseOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

/**
 * Figuren an den offenen Spots, nächste zur Kartenmitte zuerst, höchstens limit (Standard MAX_FIGURES). inView
 * entscheidet, welche Spots im Ausschnitt liegen (sonst keine Figuren dort).
 */
export function planFigures(
  state: GameState,
  center: LngLat,
  inView: (p: LngLat) => boolean,
  limit = MAX_FIGURES,
): Figure[] {
  const staffBySpot = new Map<string, string[]>();
  for (const m of getStaff(state, { status: 'active' })) {
    if ((m.role !== 'runner' && m.role !== 'security') || m.assignment?.kind !== 'spot') continue;
    const list = staffBySpot.get(m.assignment.targetId) ?? [];
    list.push(m.id);
    staffBySpot.set(m.assignment.targetId, list);
  }
  const waitingBySpot = new Map<string, number[]>();
  for (const c of allWaiting(state)) {
    const list = waitingBySpot.get(c.spotId) ?? [];
    list.push(c.id);
    waitingBySpot.set(c.spotId, list);
  }
  const dist = (s: Spot) => (s.lng - center.lng) ** 2 + ((s.lat - center.lat) * 1.6) ** 2;
  const spots = getSpots(state)
    .filter((s) => inView(s) && (staffBySpot.has(s.id) || waitingBySpot.has(s.id)))
    .sort((a, b) => dist(a) - dist(b));
  const figures: Figure[] = [];
  for (const spot of spots) {
    const staff = (staffBySpot.get(spot.id) ?? []).slice(0, MAX_STAFF_PER_SPOT);
    const customers = (waitingBySpot.get(spot.id) ?? []).sort((a, b) => a - b).slice(0, MAX_CUSTOMERS_PER_SPOT);
    const add = (kind: FigureKind, id: string | number, offset: [number, number]) => {
      if (figures.length >= limit) return;
      const key = `${kind}:${id}`;
      figures.push({
        key,
        kind,
        spotId: spot.id,
        position: { lng: spot.lng, lat: spot.lat },
        offset,
        phase: phaseOf(key),
      });
    };
    staff.forEach((id, i) => {
      add('staff', id, STAFF_SLOTS[i]);
    });
    customers.forEach((id, i) => {
      add('customer', id, CUSTOMER_SLOTS[i]);
    });
    if (figures.length >= limit) break;
  }
  return figures;
}

/**
 * Veedel mit Streife (Heat über CHECK_THRESHOLD) und die Spots, zwischen denen sie geht (alle Spots des Veedels, auch
 * gesperrte, in fester Reihenfolge).
 */
export function patrolRounds(state: GameState): { veedelId: string; spots: Spot[] }[] {
  const byVeedel = new Map<string, Spot[]>();
  for (const spot of getAllSpots(state)) {
    const list = byVeedel.get(spot.veedelId) ?? [];
    list.push(spot);
    byVeedel.set(spot.veedelId, list);
  }
  return [...byVeedel.entries()]
    .filter(([veedelId]) => getHeat(state, veedelId) > CHECK_THRESHOLD)
    .map(([veedelId, spots]) => ({ veedelId, spots }));
}
