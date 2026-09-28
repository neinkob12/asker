// Anlässe für Konfrontationen als reine Daten. Neue Anlässe = neuer Eintrag.

export interface EncounterKind {
  name: string;
  /** Erfolgschance des Stubs ohne weitere Einflüsse. */
  baseSuccess: number;
}

export const ENCOUNTER_KINDS: Record<string, EncounterKind> = {
  raidDefense: { name: 'Überfall abwehren', baseSuccess: 0.5 },
  policeChase: { name: 'Polizeiflucht', baseSuccess: 0.6 },
  debtCollection: { name: 'Schulden eintreiben', baseSuccess: 0.6 },
  dealGoneWrong: { name: 'Deal kippt', baseSuccess: 0.5 },
};
