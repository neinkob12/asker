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

export const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

export const koelnZoom = () => (isMobile() ? 12.4 : 13.6);
