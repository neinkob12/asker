// Oberfläche der Städte (Auftrag 30). Bis zur Übergabe: eine Glas-Karte unter Geld und Heat (wie die Quest-Karte),
// solange Hamburg wartet: was noch fehlt, und ein Tipp öffnet Fietes Chat. Dazu im Dev-Build Abkürzungen zum
// Ausprobieren unter window.koeln.dev (Köln komplett, Rechte Hand bereit).

import type { Simulation } from '../../../core';
import { Icon, IconChip, registerHudItem, useGame, useUi } from '../../../ui';
import { getRightHand, RIGHT_HAND_RANK_XP } from '../../hierarchy';
import { enlist, generateProfile } from '../../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../../territory';
import { allVeedel } from '../../veedel';
import { HARBOR_CALLER, hamburgMissing, type OfferStatus, offerStatus } from '../index';
import './city.css';

const WAITING: Partial<Record<OfferStatus, string>> = {
  house: 'Hamburg wartet: erst das Haus in Ordnung bringen',
  later: 'Hamburg wartet',
  declined: 'Angebot aus Hamburg steht',
};

/** Karte unter Geld und Heat, solange das Angebot aus Hamburg offen ist. */
function HamburgWaits() {
  const { state } = useGame();
  const ui = useUi();
  const status = offerStatus(state);
  const title = WAITING[status];
  if (!title) return null;
  const missing = hamburgMissing(state);
  return (
    <button
      type="button"
      class="city-hud"
      onClick={() => ui.openPhone('core.messages', { contactId: HARBOR_CALLER.id })}
      aria-label={`${title}. Chat mit ${HARBOR_CALLER.name} öffnen`}
    >
      <span class="hud-label is-city">Fiete · Hamburger Hafen</span>
      <span class="city-hud__main">
        <IconChip icon="anchor" color="place" size="md" />
        <span class="city-hud__text">
          <strong>{title}</strong>
          {missing.length > 0 ? (
            <ul class="city-hud__missing">
              {missing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <span class="city-hud__hint">Alles bereit. Sag ihm im Chat zu.</span>
          )}
        </span>
        <Icon name="chevronRight" class="city-hud__go" />
      </span>
    </button>
  );
}

registerHudItem({ id: 'city.hamburgWaits', order: 45, placement: 'below', icon: 'anchor', component: HamburgWaits });

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
      for (const v of allVeedel()) {
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
  };
  // window.koeln setzt start.tsx erst nach dem Laden der Module; bis dahin wartet die Abkürzung hier.
  const holder = window as unknown as { koeln?: { dev?: Record<string, () => void> } };
  holder.koeln = { ...holder.koeln, dev: { ...holder.koeln?.dev, ...dev } };
}
