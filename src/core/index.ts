// Öffentliche Schnittstelle des Kerns. Module, UI und Karte importieren nur von hier.
// discover.ts ist absichtlich nicht dabei (würde alle Module laden und Import-Zyklen erzeugen),
// nur main.tsx und testing.ts nutzen es. Tests importieren zusätzlich aus './testing'.

export * from './clock';
export * from './config';
export * from './format';
export * from './geo';
export * from './journal';
export * from './looks';
export * from './loop';
export * from './messages';
export * from './module';
export * from './outcome';
export * from './persistence';
export * from './rng';
export * from './saves';
export * from './session';
export * from './sim';
export * from './texts';
export * from './types';
export * from './wallet';
