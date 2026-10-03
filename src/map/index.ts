// Öffentliche Schnittstelle der Karte für Module (aus deren ui/-Ordner). Ausführlich: src/map/README.md.
//
//   registerMapLayer({ id, order, mount(ctx) { ...; return { update(state, ui) {}, destroy() {} } } })
//   addHtmlMarker(map, { position, className, children, onClick })   el(tag, className, text)
//   addTargetMarker(map, { position, label, sublabel, tone })           runder weißer Marker mit Label
//   Effekte: moneyPopup, blueLight, ping, flash bzw. gebunden an die aktive Karte: mapEffects.money(pos, 450) …
//   3D-Mini-Fahrzeuge: createVehicle(map, { path, kind }), animateVehicle; Hotspots: createHotspots(map, id)
//   Stimmung: setMapMood(id, { darken, tint, … }), setPrecipitation({ kind: 'rain', intensity })
//   Tag/Nacht: daylight(minuteOfDay), dayPhase(minuteOfDay), daylightAt(time)
//   Farben: mapToken('--gold', '#e2ae4a') liest ein Design-Token als echten Farbwert (Dunkelvariante)
//
// Klick auf die Karte für eigene Aktionen: ui.pickLocation('Text') (siehe UiApi), nie selbst den
// nächsten Klick abfangen, sonst kommen sich Module in die Quere.

export { motion, onMapFrame, onMotionChange } from './animation';
export { currentMood, type Precipitation, type PrecipitationKind, setMapMood, setPrecipitation } from './atmosphere';
export { EUROPA_VIEW, FAR_ZOOM, isMobile, KOELN_CENTER } from './config';
export { DAY_PHASE_NAMES, type DayPhase, daylight, daylightAt, dayPhase, twilight } from './daylight';
export {
  type BlueLightOptions,
  blueLight,
  type EffectHandle,
  flash,
  type MoneyPopupOptions,
  mapEffects,
  moneyPopup,
  ping,
} from './effects';
export { ensureFigureImage, FIGURE_IMAGE, FIGURE_SIZE, figureSdf } from './figure';
export { createFleet, type FleetHandle, type FleetKind, type FleetOptions, type FleetPose } from './fleet';
export { addFootpath, type FootpathHandle } from './footpaths';
export {
  bearing,
  formatDms,
  type MeasuredPath,
  measurePath,
  metersPerPixel,
  offsetAround,
  offsetMeters,
  pathLength,
  pointAlong,
  pointAtDistance,
  smoothBearing,
} from './geometry';
export { createHotspots, type Hotspot, type HotspotsHandle, type HotspotsOptions } from './hotspots';
export { LANDMARKS } from './landmarks';
export { type MapMood, mixColor, pastel } from './look';
export {
  addHtmlMarker,
  addTargetMarker,
  el,
  type HtmlMarkerOptions,
  type MarkerTone,
  setText,
  type TargetMarker,
  type TargetMarkerOptions,
} from './markers';
export { type MapLayer, type MapLayerContext, type MapLayerInstance, registerMapLayer } from './registry';
export { ABOVE_LAND, BASE_LAYERS, BELOW_BUILDINGS, BELOW_ROADS } from './style';
export { darkVariant, mapToken } from './tokens';
export {
  type AnimateVehicleOptions,
  animateVehicle,
  createVehicle,
  VEHICLE_COLORS,
  type VehicleHandle,
  type VehicleKind,
  type VehicleOptions,
} from './vehicles';
