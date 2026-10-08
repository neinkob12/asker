// Tour-Baukasten (Auftrag 46a): Spotlight-Erklärungen über dem Spiel. Schnittstelle: ui.tour.start/active/skip,
// Anker als data-tour="<id>" an Elementen der Oberfläche (TOUR_ANCHORS). Reine Oberfläche, nichts im Spielstand.

export { phoneAppAnchor, TOUR_ANCHORS, type TourAnchor } from './anchors';
export { type TourHost as TourHostApi, TourRunner, type TourView } from './controller';
export { demoTour } from './demo';
export { TourHost } from './TourHost';
export type { TourApi, TourDef, TourOutcome, TourPlacement, TourStep, TourWait } from './types';
