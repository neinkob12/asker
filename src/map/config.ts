import type { LngLat } from '../core';

export const KOELN_CENTER: LngLat = { lng: 6.949, lat: 50.939 };

export const EUROPA_VIEW = { center: { lng: 5.7, lat: 51.4 }, zoom: 7.2 };

/** Breite, ab der das Handy-Layout gilt (gleich wie in den Styles). */
export const MOBILE_BREAKPOINT = 760;

export const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

export const koelnZoom = () => (isMobile() ? 12.4 : 13.6);
