// Karte: Hauptquartier jeder Gang im Heimat-Veedel (Emblem in Gang-Farbe, etwas nördlich vom Mittelpunkt, damit es
// Lager und Spots nicht verdeckt) und ein pulsierender Ring,
// solange eine Gang in ein Veedel drängt. Klick öffnet den Tab "Gangs". Die Revierfarben zeigt territory.

import { addHtmlMarker, el, type MapLayer } from '../../../map';
import { getVeedel } from '../../veedel';
import { getGangStatus, getGangs } from '../index';

/** Versatz des Hauptquartiers nach Norden (Grad), ca. 800 m. */
const HQ_OFFSET_LAT = 0.007;

export const gangsLayer: MapLayer = {
  id: 'gangs.markers',
  order: 20,
  mount(ctx) {
    const hq = new Map<string, HTMLElement>();
    const pushes = new Map<string, { marker: { remove(): void }; veedelId: string }>();

    const openTab = () => {
      if (!ctx.isPicking()) ctx.ui.selectTab('gangs');
    };

    const update = () => {
      const state = ctx.getState();
      if (!state) return;
      for (const gang of getGangs(state)) {
        const home = getVeedel(gang.homeVeedelId);
        if (home && !hq.has(gang.id)) {
          const icon = el('span', 'gang-hq__icon', gang.emblem);
          icon.style.setProperty('--gang-color', gang.color);
          const { element } = addHtmlMarker(ctx.map, {
            position: { lng: home.center.lng, lat: home.center.lat + HQ_OFFSET_LAT },
            className: 'gang-hq',
            tag: 'button',
            anchor: 'center',
            title: `${gang.name} (Hauptquartier)`,
            children: [icon, el('span', 'map-place-name', gang.name)],
            onClick: openTab,
          });
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
