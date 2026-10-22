import type { LngLat } from '../core';

export const KOELN_CENTER: LngLat = { lng: 6.949, lat: 50.939 };

/**
 * Wohin die Kamera in Köln schaut: etwas westlich der Mitte, dort liegen die meisten Spots (Uni-Wiese bis Breslauer
 * Platz). Die Kamera zentriert auf die freie Kartenfläche neben dem Handy (Padding in GameMap).
 */
export const KOELN_VIEW: LngLat = { lng: 6.9445, lat: 50.9395 };

export const EUROPA_VIEW = { center: { lng: 5.7, lat: 51.4 }, zoom: 7.2 };

/**
 * Ab diesem Zoom (und weiter heraus) ist die Karte "weit": Deutschland-Ansicht mit den Städten als Karten, Marker der
 * Stadt (near) sind aus, beim Herauszoomen wechselt die Ansicht dorthin (Auftrag 31).
 */
export const FAR_ZOOM = 9;

/** Breite, ab der das Handy-Layout gilt (gleich wie in den Styles). */
export const MOBILE_BREAKPOINT = 760;

/**
 * Handy-Layout? Gemerkt über eine Media Query mit Listener (Auftrag 50): `window.innerWidth` zu lesen kann ein Layout
 * erzwingen, und Layer fragen das in jedem update(). Am Handy mit 4× Drossel kostete das im Verkehr 40 ms pro Update.
 */
let mobileQuery: MediaQueryList | null = null;
let mobileNow = false;

export const isMobile = (): boolean => {
  if (!mobileQuery) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
    }
    mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    mobileNow = mobileQuery.matches;
    mobileQuery.addEventListener?.('change', (event) => {
      mobileNow = event.matches;
    });
  }
  return mobileNow;
};

export const koelnZoom = () => (isMobile() ? 12.4 : 13.6);
