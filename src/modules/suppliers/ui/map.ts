// Lieferungen auf der Karte: 3D-Mini-Fahrzeuge (createVehicle). Aus einer Großstadt kommt ein Transporter, erst
// bis an den Rand des Straßennetzes der Zielstadt (grob, man sieht ihn nur weit herausgezoomt), dann über die passende
// Autobahn-Zufahrt (Supplier.via pro Stadt, roads: roadApproach) und echte Straßen bis vor das Ziel-Lager; den letzten
// Teil der Lieferzeit (CITY_APPROACH_SHARE) fährt er durch die Stadt. Zwischen Köln und Hamburg fährt er die echte A1
// (roads: interCityRoute). Die letzten Meter ins Lager sind ein gepunkteter Fußweg.
// Hafenware kommt als Schiff auf dem echten Fluss (roads: shipRoute, aus Overture-Daten: Rhein bis Niehl, Elbe bis zum
// O'Swaldkai) und legt am Liegeplatz der Stadt an (den Hafen zeigt die Logistik); in der Stadt fährt es langsamer,
// damit man es sieht. Nur alte Lieferungen ohne Liegeplatz werden noch umgeladen und per Lkw ins Lager gefahren.
// Nur die aktive Stadt, und alle Lieferungen eines Lieferanten an dasselbe Ziel fahren als ein Konvoi (convoys.ts):
// ein Fahrzeug, eine Strecke, ein Etikett, auch bei 30 Bestellungen (Feedback 16.10.2026).

import type { GeoJSONSource } from 'maplibre-gl';
import { distanceMeters, type GameState, type LngLat } from '../../../core';
import {
  addFootpath,
  addHtmlMarker,
  createVehicle,
  el,
  type FootpathHandle,
  type MapLayer,
  mapToken,
  pathLength,
  type VehicleHandle,
} from '../../../map';
import { iconElement } from '../../../ui';
import { activeCity, playableCities } from '../../city';
import { getWarehouse, getWarehouses } from '../../goods';
import { portPlace } from '../../logistics';
import { interCityRoute, roadApproach, roadEntryFrom, roadNetworkAt, roadRoute, shipRoute } from '../../roads';
import {
  CITY_APPROACH_SHARE,
  deliveryLeg,
  getSuppliers,
  type Shipment,
  type Supplier,
  shipmentCity,
  supplierVia,
} from '../index';
import { type Convoy, convoyLabel, convoyTitle, shipmentConvoys } from './convoys';

const SOURCE = 'suppliers.routes';
/** Lieferanten näher als das an der Kölner Mitte gelten als "vor Ort" (Marker nur weit herausgezoomt). */
const LOCAL_RADIUS = 15_000;

/** Runde Kachel eines Orts mit weißem Symbol (Look "Glas", Stil in src/map/map.css). */
const placeIcon = (icon: string) => {
  const tile = el('span', 'map-place-icon');
  tile.appendChild(iconElement(icon, { strokeWidth: 2.2 }));
  return tile;
};

/** Kai, an dem Hafenware in der Stadt anlegt (Köln: Westkai in Niehl, Hamburg: O'Swaldkai). */
const portIn = (cityId: string): LngLat => {
  const port = portPlace(cityId);
  return { lng: port.lng, lat: port.lat };
};
/** Die letzten so viele Meter des Wasserwegs gelten als "in der Stadt" (in Köln ab der Leverkusener Brücke). */
const CITY_RIVER_METERS = 14_000;
/** Anteil der Schiffszeit für die Einfahrt in die Stadt, damit man das Schiff auf dem Fluss sieht. */
const CITY_RIVER_SHARE = 0.35;

const riverCache = new Map<string, { path: LngLat[]; fraction: (u: number) => number }>();

/**
 * Wasserweg in die Stadt und der Anteil der Strecke (nach Metern), bis zu dem das Schiff bei Anteil u seiner Fahrzeit
 * gekommen ist: die lange Strecke (ab Rotterdam, ab Cuxhaven) schnell, die letzten CITY_RIVER_METERS langsam.
 */
function riverRoute(cityId: string): { path: LngLat[]; fraction: (u: number) => number } {
  const known = riverCache.get(cityId);
  if (known) return known;
  const path = shipRoute(cityId);
  const total = Math.max(1, pathLength(path));
  const inner = Math.min(total, CITY_RIVER_METERS);
  const outer = total - inner;
  const split = 1 - CITY_RIVER_SHARE;
  const route = {
    path,
    fraction: (u: number) =>
      u < split ? ((u / split) * outer) / total : (outer + ((u - split) / CITY_RIVER_SHARE) * inner) / total,
  };
  riverCache.set(cityId, route);
  return route;
}

/**
 * Weg eines Transporters: bis an den Rand des Netzes, über die Autobahn-Zufahrt seiner Richtung und echte Straßen bis
 * vor das Ziel. split = Anteil der Weglänge, ab dem er in Köln ist; der Fortschritt wird so umgerechnet, dass er die
 * letzten CITY_APPROACH_SHARE der Zeit in Köln fährt. walk = Fußweg von der Straße ins Lager.
 */
function cityPath(
  supplier: Supplier,
  target: LngLat,
): { path: LngLat[]; split: number; walk: [LngLat, LngLat] | null } {
  const into = roadNetworkAt(target) ?? 'koeln';
  const from = roadNetworkAt(supplier);
  if (from && from !== into) {
    // Von Stadt zu Stadt (Köln und Hamburg): über die echte A1; split dort, wo der Weg ins Netz der Zielstadt kommt.
    const route = interCityRoute(supplier, target);
    const inside = route.drive.findIndex((p) => roadNetworkAt(p) === into);
    const before = inside > 0 ? pathLength(route.drive.slice(0, inside + 1)) : 0;
    return {
      path: route.drive,
      split: before / Math.max(1, pathLength(route.drive)),
      walk: route.walkTo,
    };
  }
  // Die Autobahn des Kuriers in die Stadt des Ziels (ohne Zufahrten: der nächste Autobahn-Knoten ihres Netzes).
  const via = supplierVia(supplier, into);
  const approach = roadApproach(supplier, via, target);
  const ramp = approach?.path ?? [roadEntryFrom(supplier, via, target)];
  const entry = ramp[ramp.length - 1];
  const route = roadRoute(entry, target);
  const city = [...ramp, ...route.drive];
  const outside = pathLength([supplier, city[0]]);
  const inside = pathLength(city);
  return { path: [supplier, ...city], split: outside / Math.max(1, outside + inside), walk: route.walkTo };
}

function cityProgress(split: number, t: number): number {
  const outsideShare = 1 - CITY_APPROACH_SHARE;
  return t < outsideShare
    ? (t / outsideShare) * split
    : split + ((t - outsideShare) / CITY_APPROACH_SHARE) * (1 - split);
}

interface ShownConvoy {
  /** Vorderste Lieferung beim letzten Update: Wechselt sie (die vorige ist angekommen), springt das Fahrzeug. */
  leadId: number;
  ship: VehicleHandle | null;
  road: VehicleHandle | null;
  split: number;
  walks: FootpathHandle[];
}

export const suppliersLayer: MapLayer = {
  id: 'suppliers.routes',
  order: 20,
  mount(ctx) {
    const { map } = ctx;
    const shown = new Map<string, ShownConvoy>();
    const lateColor = mapToken('--color-warn', '#ffb547');
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'suppliers.routes',
      type: 'line',
      source: SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      // Look "Glas": Schiffsweg in der Farbe der Ware, Lkw und Transporter in Gold, gestrichelt, solange sie fahren.
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'ship',
          mapToken('--cat-goods', '#c8aa85'),
          mapToken('--hud-gold', '#f2c766'),
        ] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2.5],
        'line-dasharray': [1, 2],
        'line-opacity': 0.75,
      },
    });

    // Lieferanten-Marker je Lieferant einmal anlegen; wer erst später dazukommt (Tutorial), wird nachgetragen.
    const placed = new Set<string>();
    const placeSuppliers = () => {
      const state = ctx.getState();
      if (!state) return;
      for (const supplier of getSuppliers(state)) {
        if (placed.has(supplier.id)) continue;
        placed.add(supplier.id);
        const { element } = addHtmlMarker(map, {
          position: supplier,
          className: `map-place map-place--${supplier.kind}`,
          anchor: 'bottom',
          children: [
            placeIcon(supplier.kind === 'port' ? 'ship' : 'truck'),
            el('span', 'map-place-name', supplier.name),
          ],
        });
        // Lieferanten in einer Stadt im Spiel (Kalle in Köln, Hein in Hamburg) stehen nur weit herausgezoomt; in der
        // Stadt lägen sie mitten zwischen den Spots und sagen dort nichts.
        if (playableCities().some((c) => distanceMeters(supplier, c.center) < LOCAL_RADIUS)) {
          element.classList.add('map-place--local');
        }
      }
    };
    placeSuppliers();

    const targetOf = (state: GameState, s: Shipment): LngLat | undefined =>
      s.toPort ? portIn(shipmentCity(s)) : (getWarehouse(state, s.warehouseId) ?? getWarehouses(state)[0]);

    // Weg eines Konvois auf der Straße (Lieferant bis vor das Lager) einmal je Konvoi rechnen, nicht bei jedem Update.
    const roadPaths = new Map<string, { path: LngLat[]; split: number; walk: [LngLat, LngLat] | null }>();
    const roadPathOf = (convoy: Convoy, target: LngLat) => {
      let known = roadPaths.get(convoy.key);
      if (!known) {
        known = cityPath(convoy.supplier, target);
        roadPaths.set(convoy.key, known);
      }
      return known;
    };

    // Gestrichelte Strecken: eine je Konvoi (Schiffe einer Stadt teilen sich den Fluss), nur bei neuen Konvois neu.
    let routesKey = '';
    const drawRoutes = (state: GameState, convoys: readonly Convoy[]) => {
      const key = convoys.map((c) => c.key).join(',');
      if (key === routesKey) return;
      routesKey = key;
      const keys = new Set(convoys.map((c) => c.key));
      for (const known of roadPaths.keys()) if (!keys.has(known)) roadPaths.delete(known);
      const lines: { kind: 'ship' | 'road'; path: LngLat[] }[] = [];
      const rivers = new Set<string>();
      for (const convoy of convoys) {
        const target = targetOf(state, convoy.lead);
        if (!target) continue;
        if (convoy.supplier.kind === 'port') {
          rivers.add(convoy.cityId);
          if (!convoy.lead.toPort) lines.push({ kind: 'road', path: roadRoute(portIn(convoy.cityId), target).drive });
        } else {
          lines.push({ kind: 'road', path: roadPathOf(convoy, target).path });
        }
      }
      for (const cityId of rivers) lines.push({ kind: 'ship', path: riverRoute(cityId).path });
      const features = lines.map((line) => ({
        type: 'Feature' as const,
        properties: { kind: line.kind },
        geometry: { type: 'LineString' as const, coordinates: line.path.map((p) => [p.lng, p.lat]) },
      }));
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };

    const create = (convoy: Convoy, target: LngLat): ShownConvoy => {
      const title = convoyTitle(convoy);
      const label = convoyLabel(convoy);
      const { lead, supplier, progress } = convoy;
      const leg = deliveryLeg(supplier, progress, lead.toPort);
      if (supplier.kind === 'port') {
        const { path: riverPath, fraction } = riverRoute(convoy.cityId);
        const ship = createVehicle(map, { path: riverPath, kind: 'ship', title, progress: fraction(leg.t) });
        ship.setLabel(label);
        // Alte Lieferungen ohne Liegeplatz: Lkw vom Hafen ins Lager.
        const truckRoute = lead.toPort ? null : roadRoute(portIn(convoy.cityId), target);
        const road = truckRoute
          ? createVehicle(map, {
              path: truckRoute.drive,
              kind: 'truck',
              title,
              progress: leg.stage === 'road' ? leg.t : 0,
            })
          : null;
        road?.setLabel(label);
        const walks = truckRoute ? [addFootpath(map, truckRoute.walkFrom), addFootpath(map, truckRoute.walkTo)] : [];
        return { leadId: lead.id, ship, road, split: 0, walks };
      }
      const { path, split, walk } = roadPathOf(convoy, target);
      const road = createVehicle(map, { path, kind: 'van', title, progress: cityProgress(split, progress) });
      road.setLabel(label);
      return { leadId: lead.id, ship: null, road, split, walks: [addFootpath(map, walk)] };
    };

    const removeEntry = (entry: ShownConvoy) => {
      entry.ship?.remove();
      entry.road?.remove();
      for (const walk of entry.walks) walk.remove();
    };

    return {
      update(state) {
        placeSuppliers();
        const convoys = shipmentConvoys(state, activeCity(state));
        drawRoutes(state, convoys);
        const active = new Set(convoys.map((c) => c.key));
        for (const [key, entry] of shown) {
          if (active.has(key)) continue;
          removeEntry(entry);
          shown.delete(key);
        }
        for (const convoy of convoys) {
          const { lead, supplier, progress } = convoy;
          const target = targetOf(state, lead);
          if (!target) continue;
          let entry = shown.get(convoy.key);
          let jump = false;
          if (!entry) {
            entry = create(convoy, target);
            shown.set(convoy.key, entry);
          } else if (entry.leadId !== lead.id) {
            // Die vorderste ist angekommen: Das Fahrzeug fährt jetzt für die nächste (springt, statt zurückzufahren).
            entry.leadId = lead.id;
            jump = true;
          }
          const label = convoyLabel(convoy);
          const title = convoyTitle(convoy);
          const color = convoy.late ? lateColor : null;
          const move = (vehicle: VehicleHandle | null, t: number) => {
            if (!vehicle) return;
            if (jump) vehicle.jumpTo(t);
            else vehicle.setProgress(t);
            vehicle.setLabel(label);
            vehicle.setTitle(title);
            vehicle.setColor(color);
          };
          if (supplier.kind !== 'port') {
            move(entry.road, cityProgress(entry.split, progress));
            continue;
          }
          const leg = deliveryLeg(supplier, progress, lead.toPort);
          entry.ship?.setVisible(leg.stage !== 'road');
          move(entry.ship, leg.stage === 'ship' ? riverRoute(convoy.cityId).fraction(leg.t) : 1);
          entry.road?.setVisible(leg.stage !== 'ship');
          move(entry.road, leg.stage === 'road' ? leg.t : 0);
        }
      },
      destroy() {
        for (const entry of shown.values()) removeEntry(entry);
        shown.clear();
        roadPaths.clear();
      },
    };
  },
};
