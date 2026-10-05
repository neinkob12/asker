// Oberfläche der Städte (Auftrag 30 und 36). Bis zur Übergabe: eine Glas-Karte unter Geld und Heat (wie die
// Quest-Karte), solange eine Stadt wartet: was noch fehlt, und ein Tipp führt dorthin, wo man es erledigt (Rechte Hand,
// Personal, Reviere; ist alles bereit, der Chat der Stadt bzw. die Übergabe). Ab zwei freien Städten: der Stadt-Chip
// oben rechts (Köln ▾) mit den Städten und Deutschland; die Kamera folgt der aktiven Stadt (registerCityViews), in der
// Deutschland-Ansicht stehen alle Städte als Glas-Karten auf der Karte (cards.tsx) über dem Autobahn-Netz (map.ts).
// Dazu im Dev-Build Abkürzungen zum Ausprobieren unter window.koeln.dev (Köln komplett, Rechte Hand bereit, Hamburg
// frei).

import { useEffect } from 'preact/hooks';
import { clock, formatEuro, type Simulation } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  HudPill,
  Icon,
  IconChip,
  onGameEvent,
  registerCityViews,
  registerHudItem,
  registerSlot,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import { cityReport } from '../../finance';
import { store } from '../../goods';
import { getRightHand, hasFullPower, lieutenantOfSpot, RIGHT_HAND_RANK_XP } from '../../hierarchy';
import { getSpots } from '../../spots';
import { enlist, generateProfile } from '../../staff';
import { addInfluence, campaignProgress, factions, PLAYER_FACTION } from '../../territory';
import { allVeedel } from '../../veedel';
import {
  activeCity,
  CITIES,
  citiesUnlocked,
  cityContact,
  cityName,
  cityTravel,
  currentOffer,
  DEUTSCHLAND_VIEW,
  getCity,
  nextCityMissing,
  type OfferStatus,
  offerFrom,
  offerStatus,
  PLAYER_RANKS,
  playerRank,
  presentCity,
  travelMinutesBetween,
} from '../index';
import { citiesLayer } from './cards';
import { autobahnLayer } from './map';
import { travelLayer } from './travel';
import './city.css';

registerCityViews({
  cameras: CITIES.filter((c) => !c.template).map((c) => ({
    id: c.id,
    name: c.name,
    center: c.view.center,
    zoom: c.view.zoom,
    mobileZoom: c.view.mobileZoom,
    pitch: c.view.pitch,
    bearing: c.view.bearing,
  })),
  deutschland: DEUTSCHLAND_VIEW,
  // Rahmen um alle Städte (Auftrag 36: auch die freien und die, die bald kommen, stehen als Karten da).
  deutschlandBounds: () => {
    const lngs = CITIES.map((c) => c.center.lng);
    const lats = CITIES.map((c) => c.center.lat);
    const pad = 0.3;
    return [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
  },
  active: (state) => activeCity(state),
});

registerMapLayer(citiesLayer);
registerMapLayer(autobahnLayer);
registerMapLayer(travelLayer);

const WAITING: Partial<Record<OfferStatus, string>> = {
  house: '{city} wartet: erst das Haus in Ordnung bringen',
  later: '{city} wartet',
  declined: 'Angebot aus {city} steht',
};

/** Wohin ein Tipp auf die Karte führt: dorthin, wo man das Fehlende erledigt. */
type WaitTarget = 'handover' | 'rightHand' | 'staff' | 'territory' | 'chat';

const TARGET_LABEL: Record<Exclude<WaitTarget, 'chat'>, string> = {
  handover: 'Übergabe öffnen',
  rightHand: 'Zur Rechten Hand',
  staff: 'Zum Personal',
  territory: 'Zu den Revieren',
};

/** Karte unter Geld und Heat, solange das Angebot einer Stadt offen ist. */
function NextCityWaits() {
  const { state } = useGame();
  const ui = useUi();
  const cityId = currentOffer(state);
  if (!cityId) return null;
  const status = offerStatus(state, cityId);
  const from = offerFrom(state) ?? 'koeln';
  // Zugesagt, aber noch nicht übergeben ("Später" in der Übergabe): Die Karte führt zur Übergabe.
  const handover = status === 'accepted' && offerFrom(state) !== null && !hasFullPower(state, from);
  const name = cityName(cityId);
  const title = handover ? `${cityName(from)} übergeben, dann nach ${name}` : WAITING[status]?.replace('{city}', name);
  if (!title) return null;
  const contact = cityContact(cityId);
  const missing = nextCityMissing(state);
  // Fehlen nur Veedel, geht es in die Reviere; sonst liegt es an der Rechten Hand (Stufe, Aufgaben) oder es gibt keine.
  const veedelMissing = !campaignProgress(state, from).complete;
  const target: WaitTarget = handover
    ? 'handover'
    : missing.length === 0
      ? 'chat'
      : !getRightHand(state, from)
        ? 'staff'
        : missing.length > (veedelMissing ? 1 : 0)
          ? 'rightHand'
          : 'territory';
  const label = target === 'chat' ? `Chat mit ${contact.name}` : TARGET_LABEL[target];
  const open = () => {
    if (target === 'handover') ui.openDialog('hierarchy.handover', { cityId: from, toCityId: cityId });
    else if (target === 'rightHand') ui.openPanel('hierarchy.rightHand', {});
    else if (target === 'staff' || target === 'territory') ui.selectTab(target);
    else ui.openPhone('core.messages', { contactId: contact.id });
  };
  return (
    <button type="button" class="city-hud" onClick={open} aria-label={`${title}. ${label}`}>
      <span class="hud-label is-city">
        {contact.name} · {contact.role}
      </span>
      <span class="city-hud__main">
        <IconChip icon={getCity(cityId)?.portId ? 'anchor' : 'building'} color="place" size="md" />
        <span class="city-hud__text">
          <strong>{title}</strong>
          {missing.length > 0 ? (
            <>
              <ul class="city-hud__missing">
                {missing.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <span class="city-hud__action">{label}</span>
            </>
          ) : (
            <span class="city-hud__hint">
              {handover
                ? 'Deine Rechte Hand ist bereit.'
                : status === 'house'
                  ? 'Alles bereit. Gleich kommt der Anruf.'
                  : 'Alles bereit. Sag im Chat zu.'}
            </span>
          )}
        </span>
        <Icon name="chevronRight" class="city-hud__go" />
      </span>
    </button>
  );
}

registerHudItem({ id: 'city.hamburgWaits', order: 45, placement: 'below', icon: 'anchor', component: NextCityWaits });

/**
 * Stadt-Chip ("Köln ▾"), nur ab zwei freien Städten: wechselt die Stadt (sie wird live, die andere schläft) oder
 * zeigt Deutschland.
 */
function CityChip() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const unlocked = citiesUnlocked(state);
  if (unlocked.length < 2) return null;
  const active = activeCity(state);
  const present = presentCity(state);
  const travel = cityTravel(state);
  return (
    <HudPill
      icon="building"
      color="place"
      label="Stadt"
      value={`${cityName(active)} ▾`}
      title="Stadt wechseln"
      details={
        <div class="city-menu">
          {unlocked.map((id) => {
            const progress = campaignProgress(state, id);
            const today = cityReport(state, id, 1).profit;
            return (
              <button
                key={id}
                type="button"
                class={`city-menu__item ${id === active ? 'is-active' : ''}`}
                aria-pressed={id === active}
                onClick={() => dispatch({ type: 'city.switch', payload: { cityId: id } })}
              >
                <Icon name={id === active ? 'check' : 'building'} />
                <span class="city-menu__name">{cityName(id)}</span>
                <span class="city-menu__meta">
                  {progress.controlled}/{progress.total}
                </span>
                <span class="city-menu__meta">
                  {today >= 0 ? '+' : ''}
                  {formatEuro(today)}
                </span>
              </button>
            );
          })}
          <button type="button" class="city-menu__item" onClick={() => ui.flyToDeutschland()}>
            <Icon name="map" />
            <span class="city-menu__name">Deutschland</span>
          </button>
          {travel ? (
            <span class="city-menu__note">Unterwegs nach {cityName(travel.to)}</span>
          ) : (
            unlocked
              .filter((id) => id !== present)
              .map((id) => (
                <button
                  key={`travel-${id}`}
                  type="button"
                  class="city-menu__item"
                  onClick={() => dispatch({ type: 'city.travel', payload: { cityId: id } })}
                >
                  <Icon name="car" />
                  <span class="city-menu__name">Nach {cityName(id)} fahren</span>
                  <span class="city-menu__meta">{clock.formatDuration(travelMinutesBetween(present, id))}</span>
                </button>
              ))
          )}
        </div>
      }
    />
  );
}

registerHudItem({ id: 'city.chip', order: 5, placement: 'more', icon: 'building', component: CityChip });

/** Die Kamera folgt der aktiven Stadt: nach dem Laden eines Spielstands und beim Umschalten. */
function CitySync() {
  const { state } = useGame();
  const ui = useUi();
  const active = activeCity(state);
  const runId = state.meta.runId;
  useEffect(() => {
    if (ui.mapView() !== `city:${active}`) ui.flyToCity(active);
  }, [active, runId]);
  return null;
}

registerSlot('map.overlay', { id: 'city.sync', order: 1, component: CitySync });

// ---------------------------------------------------------------------------------------------
// Nur im Dev-Build: Abkürzungen zum Ausprobieren (z.B. in der Konsole window.koeln.dev.koelnKomplett()).

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const sim = (): Simulation => {
    const current = window.koeln?.session.sim;
    if (!current) throw new Error('Kein Spiel geladen.');
    return current;
  };
  const dev = {
    /** Alle Kölner Veedel gehören dir (Sieg-Bildschirm, 30 Spielminuten später ruft Fiete an). */
    koelnKomplett: () => {
      const s = sim();
      const ctx = s.ctx('dev');
      for (const v of allVeedel('koeln')) {
        for (const f of factions(s.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
        addInfluence(ctx, v.id, PLAYER_FACTION, 100);
      }
      s.step();
    },
    /** Eine Rechte Hand auf höchster Stufe mit allen Aufgaben an (stellt bei Bedarf jemanden ein). */
    rechteHandBereit: () => {
      const s = sim();
      if (!getRightHand(s.state)) {
        const ctx = s.ctx('dev');
        s.state.wallet.dirty = Math.max(s.state.wallet.dirty, 20000);
        // Eine Rechte Hand gibt es erst ab zwei Leutnants.
        for (const spot of getSpots(s.state).slice(0, 2)) {
          if (lieutenantOfSpot(s.state, spot.id)) continue;
          const lt = enlist(ctx, generateProfile(ctx, 'runner', { level: 3 }), { origin: 'pool' });
          lt.stats.loyalty = 80;
          s.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lt.id, spotIds: [spot.id] } });
        }
        const boss = enlist(ctx, generateProfile(ctx, 'runner', { level: 5 }), { origin: 'pool' });
        boss.stats.loyalty = 90;
        s.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
      }
      const rh = getRightHand(s.state);
      if (!rh) return;
      rh.xp = RIGHT_HAND_RANK_XP[RIGHT_HAND_RANK_XP.length - 1];
      s.dispatch({
        type: 'hierarchy.configureRightHand',
        payload: {
          settings: { orders: true, pickup: true, restock: true, staffing: true, wholesale: true, laundering: true },
        },
      });
    },
    /** Berlin frei (ohne Übergabe), z.B. um die Stadt anzuschauen (Auftrag 37). */
    berlinFrei: () => {
      const s = sim();
      s.dispatch({ type: 'city.unlock', payload: { cityId: 'berlin' } }, { actor: 'system' });
    },
    /** Hamburg frei (ohne Übergabe), z.B. um die Stadt anzuschauen. */
    hamburgFrei: () => {
      const s = sim();
      s.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    },
    /**
     * Route Köln → Hamburg zum Ansehen (Etappe 6): Hamburg frei, ein Lager in Ottensen, ein Fahrer, 2 kg Gras in
     * Ehrenfeld, tägliche Route mit Rückfahrt, sofort los.
     */
    routeNachHamburg: () => {
      const s = sim();
      s.state.wallet.clean = Math.max(s.state.wallet.clean, 20000);
      s.state.wallet.dirty = Math.max(s.state.wallet.dirty, 20000);
      s.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
      s.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'werkstatt-ottensen' } });
      const hired = s.dispatch({ type: 'staff.hireDriver', payload: {} });
      const driverId = hired.ok ? (hired.data as { staffId: string }).staffId : null;
      store(s.ctx('dev'), { productId: 'weed', amount: 2000, warehouseId: 'ehrenfeld', quality: 0.8 });
      const added = s.dispatch({
        type: 'logistics.addRoute',
        payload: {
          driverId,
          fromId: 'ehrenfeld',
          toId: 'werkstatt-ottensen',
          items: [{ productId: 'weed', amount: 1500 }],
          departure: 6 * 60,
          roundTrip: true,
          returnItems: [{ productId: 'hash', amount: 300 }],
        },
      });
      if (added.ok) {
        const routeId = (added.data as { routeId: number }).routeId;
        s.dispatch({ type: 'logistics.runRouteNow', payload: { routeId } });
      }
    },
  };
  // window.koeln setzt start.tsx erst nach dem Laden der Module; bis dahin wartet die Abkürzung hier.
  const holder = window as unknown as { koeln?: { dev?: Record<string, () => void> } };
  holder.koeln = { ...holder.koeln, dev: { ...holder.koeln?.dev, ...dev } };
}

// ---------------------------------------------------------------------------------------------
// Ränge des Spielers (Auftrag 36): Titel im HUD (Mehr-Menü) mit der Leiter, Banner und Ton beim Aufstieg.

function RankHud() {
  const { state } = useGame();
  const rank = playerRank(state);
  const reachedAt = PLAYER_RANKS.findIndex((r) => r.id === rank.id);
  return (
    <HudPill
      icon="crown"
      color="brand"
      label="Rang"
      value={rank.title}
      title={`Dein Rang: ${rank.title}`}
      details={
        <div class="city-ranks">
          <span class="hud-label is-brand">Dein Weg</span>
          <ol class="city-ranks__list">
            {PLAYER_RANKS.map((r, i) => (
              <li key={r.id} class={i < reachedAt ? 'is-done' : i === reachedAt ? 'is-now' : ''}>
                <Icon name={i <= reachedAt ? 'checkCircle' : 'plusCircle'} />
                <span class="city-ranks__title">{i === reachedAt ? rank.title : r.title.replace('{city}', '…')}</span>
                {i === reachedAt + 1 && <span class="city-ranks__hint">{r.hint}</span>}
              </li>
            ))}
          </ol>
        </div>
      }
    />
  );
}

registerHudItem({ id: 'city.rank', order: 4, placement: 'more', icon: 'crown', component: RankHud });

onGameEvent('player.rankUp', 'city.rankUp', (payload, ui) =>
  ui.toast(`Neuer Rang: ${payload.title}`, 'good', { urgent: true, icon: 'crown' }),
);
soundOnEvent('player.rankUp', 'win');
