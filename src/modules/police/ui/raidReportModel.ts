// Wann die Razzia-Bilanz erscheint (ohne Oberfläche, damit sich das testen lässt): erst wenn kein anderer Dialog offen
// ist, und noch einmal, wenn sie verdrängt wurde (z.B. von einer Konfrontation), bis der Spieler sie selbst schließt.
// Sonst ginge "Das hat gekostet" samt Kaution-Knopf für immer verloren.

export const RAID_REPORT_DIALOG = 'police.raidReport';

export interface ReportTrack {
  /** Die Bilanz war schon einmal zu sehen. */
  opened: boolean;
  /** Ein anderer Dialog hat sie danach verdrängt. */
  displaced: boolean;
}

/** open = jetzt öffnen, wait = später noch einmal schauen, done = der Spieler hat sie geschlossen. */
export type ReportStep = 'open' | 'wait' | 'done';

export function newTrack(): ReportTrack {
  return { opened: false, displaced: false };
}

/** Nächster Schritt, wenn gerade der Dialog mit dieser ID offen ist (null: keiner). */
export function nextReportStep(track: ReportTrack, openDialogId: string | null): ReportStep {
  if (openDialogId === RAID_REPORT_DIALOG) {
    track.opened = true;
    track.displaced = false;
    return 'wait';
  }
  if (openDialogId !== null) {
    // Ein anderer Dialog ist offen. Stand die Bilanz schon, hat er sie verdrängt: Sie kommt danach noch einmal.
    if (track.opened) track.displaced = true;
    return 'wait';
  }
  // Kein Dialog offen: Wer die Bilanz gesehen und nicht verdrängt bekam, hat sie selbst geschlossen.
  return track.opened && !track.displaced ? 'done' : 'open';
}
