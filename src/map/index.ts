// Öffentliche Schnittstelle der Karte für Module (aus deren ui/-Ordner). Ausführlich: src/map/README.md.
//
//   registerMapLayer({ id, order, mount(ctx) { ...; return { update(state, ui) {}, destroy() {} } } })
//   addHtmlMarker(map, { position, className, children, onClick })   el(tag, className, text)
//   addTargetMarker(map, { position, label, sublabel, tone })           Marker im Überwachungsstil
//   Effekte: moneyPopup, blueLight, createVehicle, animateVehicle, addFigure, addFiguresAt, ping, flash
//            bzw. gebunden an die aktive Karte: mapEffects.money(pos, 450) …
//   Stimmung: setMapMood(id, { darken, tint, … }), setPrecipitation({ kind: 'rain', intensity })
//   Tag/Nacht: daylight(minuteOfDay), dayPhase(minuteOfDay), daylightAt(time)
//
// Klick auf die Karte für eigene Aktionen: ui.pickLocation('Text') (siehe UiApi), nie selbst den
// nächsten Klick abfangen, sonst kommen sich Module in die Quere.

export { currentMood, type Precipitation, type PrecipitationKind, setMapMood, setPrecipitation } from './atmosphere';
export { EUROPA_VIEW, isMobile, KOELN_CENTER } from './config';
export { DAY_PHASE_NAMES, type DayPhase, daylight, daylightAt, dayPhase, twilight } from './daylight';
export {
  type AnimateVehicleOptions,
  addFigure,
  addFiguresAt,
  animateVehicle,
  type BlueLightOptions,
  blueLight,
  createVehicle,
  type EffectHandle,
  type FigureHandle,
  type FigureOptions,
  type FigureRole,
  type FigureState,
  flash,
  type MoneyPopupOptions,
  mapEffects,
  moneyPopup,
  ping,
  type VehicleHandle,
  type VehicleKind,
  type VehicleOptions,
} from './effects';
export { bearing, formatDms, offsetAround, pathLength, pointAlong } from './geometry';
export type { MapMood } from './look';
export {
  addHtmlMarker,
  addTargetMarker,
  el,
  type HtmlMarkerOptions,
  type MarkerTone,
  type TargetMarker,
  type TargetMarkerOptions,
} from './markers';
export { type MapLayer, type MapLayerContext, type MapLayerInstance, registerMapLayer } from './registry';
export { BASE_LAYERS, BELOW_BUILDINGS } from './style';
