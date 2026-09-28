export const START_REPUTATION = 50;

/** Nachfrage-Faktor bei Ruf 0 bzw. 100 (dazwischen linear, bei 50 genau 1). */
export const DEMAND_FACTOR_MIN = 0.7;
export const DEMAND_FACTOR_MAX = 1.3;

/** Um Mitternacht wandert der Ruf um so viele Punkte Richtung Mitte (50). Gerüchte verblassen. */
export const DAILY_DRIFT = 1;

/** So viele letzte Gründe merkt sich der Ruf (für die Anzeige). */
export const RECENT_LIMIT = 8;
/** Änderungen mit gleichem Grund innerhalb dieser Spielminuten werden zusammengefasst. */
export const RECENT_MERGE_MINUTES = 120;

/** Stufen für die Anzeige, beste zuerst. */
export const REPUTATION_LABELS: readonly { min: number; name: string }[] = [
  { min: 80, name: 'Legende' },
  { min: 60, name: 'Gefragt' },
  { min: 40, name: 'Bekannt' },
  { min: 20, name: 'Zwielichtig' },
  { min: 0, name: 'Verbrannt' },
];
