// Anker der Tour (Auftrag 46a): Elemente der Oberfläche tragen `data-tour="<id>"`, die Schritte einer Tour kennen nur
// diese Namen. Wer einen neuen Anker setzt, trägt ihn hier ein (mit dem Ort), damit die Inhalte (46c) ihn finden.
// Gleicher Anker an mehreren Elementen (z.B. die Kundenanzeige an jedem Spot): Das Element trägt zusätzlich
// `data-tour-key="<schlüssel>"` (die Spot-ID), der Schritt wählt mit `anchorKey`; ohne Schlüssel nimmt die Tour das
// erste sichtbare Element.

export const TOUR_ANCHORS = [
  /** Der Geld-Kasten im HUD: Schwarzgeld und sauberes Geld zusammen (builtin/CoreHud.tsx, MoneyHud). */
  'hud.money',
  /** Die Zeile Schwarzgeld darin (Knopf, öffnet die Geldwäsche). */
  'hud.money.dirty',
  /** Die Zeile Sauber darin. */
  'hud.money.clean',
  /** Die Heat-Pille der Polizei unter dem Geld (police/ui, HeatHud). */
  'hud.heat',
  /** Wochentag, Tag und Uhrzeit in der Uhr-Kapsel (builtin/CoreHud.tsx, ClockHud). */
  'hud.clock',
  /**
   * Wetter im HUD. Seit Auftrag 26 steht das Wetter in den Einstellungen, im HUD gibt es dafür kein Element: Ein Schritt
   * mit diesem Anker zeigt die Box mittig, bis eine Wetter-Anzeige im HUD den Anker trägt.
   */
  'hud.weather',
  /** Der Tempo-Regler (Pause, 1×, 2×, 4×) in der Uhr-Kapsel (shell/Hud.tsx, SpeedControl). */
  'hud.speed',
  /** Kachel Lager oben rechts (goods/ui, StockHud). */
  'hud.stock',
  /** Kachel Ruf · Reviere (reputation/ui, ReputationHud). */
  'hud.reputation',
  /** Kachel Rang (city/ui, RankHud). */
  'hud.rank',
  /** Die Revierzahl „4/7“ in der Kachel Ruf · Reviere (reputation/ui). */
  'hud.territory',
  /** Die Karte unter Geld und Heat: heute die Quest-Karte (quests/ui), später die Missions-Karte (tutorial, 46b). */
  'hud.mission',
  /** Das ganze Handy (phone/PhoneFrame.tsx). Liegt es weg, fehlt der Anker: vorher ui.showPhone(). */
  'phone',
  /** Der Startbildschirm des Handys (Raster, Dock). */
  'phone.home',
  /** Der Inhalt der offenen App: die oberste Seite im Stapel (phone/PageStack.tsx), auf dem Startbildschirm keiner. */
  'phone.screen',
  /** Das Spot-Fenster im Handy (spots/ui, SpotPanel). */
  'spot.panel',
  /** Die Kundenanzeige am Spot auf der Karte: Blase mit Zähler, rot bei Ablauf (spots/ui/map.ts, mit data-tour-key = Spot-ID). */
  'spot.customer',
  /** Abschnitt „Selbst verkaufen“ im Spot-Fenster (customers/ui, StandHere). */
  'spot.sell',
  /** Abschnitt Preise im Spot-Fenster (market/ui, SpotPrices). */
  'spot.price',
  /** Abschnitt Läufer im Spot-Fenster (staff/ui, SpotStaff). */
  'spot.runner',
  /** Die Kartenfläche (shell/MapView.tsx). */
  'map',
] as const;

/**
 * Anker-Name eines Schritts. Dazu `phone.app.<appId>` für jedes App-Symbol auf dem Startbildschirm (Raster und Dock),
 * `appId` wie bei registerPhoneApp bzw. `tab:<id>`, z.B. 'phone.app.tab:staff' oder 'phone.app.core.messages'.
 */
export type TourAnchor = (typeof TOUR_ANCHORS)[number] | `phone.app.${string}`;

/** Attribut-Name am Element. */
export const TOUR_ATTRIBUTE = 'data-tour';
/** Zweites Attribut, wenn derselbe Anker an mehreren Elementen hängt (z.B. die Spot-ID). */
export const TOUR_KEY_ATTRIBUTE = 'data-tour-key';

/** Anker eines App-Symbols auf dem Startbildschirm. */
export function phoneAppAnchor(appId: string): TourAnchor {
  return `phone.app.${appId}`;
}

/** CSS-Selektor für einen Anker, optional mit Schlüssel. */
export function tourSelector(anchor: string, key?: string): string {
  const esc = (value: string) => value.replace(/["\\]/g, '\\$&');
  return key === undefined
    ? `[${TOUR_ATTRIBUTE}="${esc(anchor)}"]`
    : `[${TOUR_ATTRIBUTE}="${esc(anchor)}"][${TOUR_KEY_ATTRIBUTE}="${esc(key)}"]`;
}
