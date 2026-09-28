// Öffentliche Schnittstelle der Karte für Module (aus deren ui/-Ordner).
//
//   registerMapLayer({ id, order, mount(ctx) { ...; return { update(state, ui) {}, destroy() {} } } })
//   addHtmlMarker(map, { position, className, children, onClick })   el(tag, className, text)
//
// Klick auf die Karte für eigene Aktionen: ui.pickLocation('Text') (siehe UiApi), nie selbst den
// nächsten Klick abfangen, sonst kommen sich Module in die Quere.

export { EUROPA_VIEW, isMobile, KOELN_CENTER } from './config';
export { addHtmlMarker, el, type HtmlMarkerOptions } from './markers';
export { type MapLayer, type MapLayerContext, type MapLayerInstance, registerMapLayer } from './registry';
