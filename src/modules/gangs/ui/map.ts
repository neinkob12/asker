// Karte: Hauptquartier jeder Gang im Heimat-Veedel (Look "Glas": Kachel in Gang-Farbe mit weißem Symbol und Schein,
// Name darunter; etwas versetzt vom Mittelpunkt, damit es Lager und Spots nicht verdeckt). Den pulsierenden Ring, solange
// eine Gang in ein Veedel drängt, gibt es nicht mehr (Feedback 13.10.2026: die Kreise verwirrten). Klick öffnet die
// Seite der Gang im Handy. Die Revierfarben zeigt territory.
// Nur die Gangs der aktiven Stadt, wie bei den Spots (mapSpots): Die anderen Städte sieht man nur in der
// Deutschland-Ansicht, und dort sind diese Marker (near) ohnehin aus; vorher hingen alle Städte im DOM.

import { addHtmlMarker, el, type MapLayer } from '../../../map';
import { iconElement } from '../../../ui';
import { activeCity } from '../../city';
import { getVeedel } from '../../veedel';
import { getGangs } from '../index';

/** Versatz des Hauptquartiers nach Norden (Grad), ca. 800 m. */
const HQ_OFFSET_LAT = 0.007;
/**
 * Eigener Versatz je Gang (Grad), wo der Standard ein Lager verdeckt: Das Venloer Syndikat sitzt in Ehrenfeld direkt
 * über dem Lager Ehrenfeld (rückt nach Nordwesten), die Hafenkolonne in Nippes auf der Garage Nippes (rückt nach
 * Nordosten, Richtung Hafen).
 */
const HQ_OFFSETS: Record<string, { lng: number; lat: number }> = {
  west: { lng: -0.012, lat: 0.009 },
  nord: { lng: 0.016, lat: 0.009 },
};

export const gangsLayer: MapLayer = {
  id: 'gangs.markers',
  order: 20,
  mount(ctx) {
    const hq = new Map<string, { remove(): void }>();
    /** Stadt, deren Gangs gerade auf der Karte stehen. */
    let shownCity: string | null = null;

    const openGang = (gangId: string) => {
      if (!ctx.isPicking()) ctx.ui.openPanel('gangs.gang', { gangId });
    };

    const clear = () => {
      for (const marker of hq.values()) marker.remove();
      hq.clear();
    };

    const update = () => {
      const state = ctx.getState();
      if (!state) return;
      const cityId = activeCity(state);
      if (cityId !== shownCity) {
        clear();
        shownCity = cityId;
      }
      for (const gang of getGangs(state, cityId)) {
        const home = getVeedel(gang.homeVeedelId);
        if (home && !hq.has(gang.id)) {
          const icon = el('span', 'gang-hq__icon');
          icon.appendChild(iconElement(gang.emblem, { strokeWidth: 2.2 }));
          const offset = HQ_OFFSETS[gang.id] ?? { lng: 0, lat: HQ_OFFSET_LAT };
          const { marker, element } = addHtmlMarker(ctx.map, {
            position: { lng: home.center.lng + offset.lng, lat: home.center.lat + offset.lat },
            className: 'gang-hq',
            near: true,
            tag: 'button',
            anchor: 'top',
            title: `${gang.name} (Hauptquartier)`,
            children: [icon, el('span', 'gang-hq__name', gang.name)],
            onClick: () => openGang(gang.id),
          });
          element.style.setProperty('--gang-color', gang.color);
          hq.set(gang.id, marker);
        }
      }
    };
    update();
    return { update, destroy: clear };
  },
};
