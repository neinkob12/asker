// Karte: Hauptquartier jeder Gang im Heimat-Veedel (Look "Glas": Kachel in Gang-Farbe mit weißem Symbol und Schein,
// Name darunter; etwas versetzt vom Mittelpunkt, damit es Lager und Spots nicht verdeckt) und ein pulsierender Ring,
// solange eine Gang in ein Veedel drängt. Klick öffnet die Seite der Gang im Handy. Die Revierfarben zeigt territory.

import { addHtmlMarker, el, type MapLayer } from '../../../map';
import { iconElement } from '../../../ui';
import { getVeedel } from '../../veedel';
import { getGangStatus, getGangs } from '../index';

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
    const hq = new Map<string, HTMLElement>();
    const pushes = new Map<string, { marker: { remove(): void }; veedelId: string }>();

    const openGang = (gangId: string) => {
      if (!ctx.isPicking()) ctx.ui.openPanel('gangs.gang', { gangId });
    };

    const update = () => {
      const state = ctx.getState();
      if (!state) return;
      for (const gang of getGangs(state)) {
        const home = getVeedel(gang.homeVeedelId);
        if (home && !hq.has(gang.id)) {
          const icon = el('span', 'gang-hq__icon');
          icon.appendChild(iconElement(gang.emblem, { strokeWidth: 2.2 }));
          const offset = HQ_OFFSETS[gang.id] ?? { lng: 0, lat: HQ_OFFSET_LAT };
          const { element } = addHtmlMarker(ctx.map, {
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
          hq.set(gang.id, element);
        }
        const push = getGangStatus(state, gang.id)?.push ?? null;
        const shown = pushes.get(gang.id);
        if (shown && shown.veedelId !== push?.veedelId) {
          shown.marker.remove();
          pushes.delete(gang.id);
        }
        const target = push ? getVeedel(push.veedelId) : undefined;
        if (push && target && !pushes.has(gang.id)) {
          const ring = el('span', 'gang-push__ring');
          ring.style.setProperty('--gang-color', gang.color);
          const { marker } = addHtmlMarker(ctx.map, {
            position: target.center,
            className: 'gang-push',
            near: true,
            anchor: 'center',
            title: `${gang.name} drängt nach ${target.name}`,
            children: [ring],
          });
          pushes.set(gang.id, { marker, veedelId: push.veedelId });
        }
      }
    };
    update();
    return {
      update,
      destroy() {
        for (const p of pushes.values()) p.marker.remove();
      },
    };
  },
};
