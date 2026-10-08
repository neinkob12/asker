// Dialog über der freien Kartenfläche (Look "Glas"): am Desktop eine Karte in der Mitte der Kartenfläche neben dem
// angedockten Handy, das sichtbar bleibt; am Handy-Bildschirm dasselbe als Blatt (Sheet). Für Dialoge, die mit
// registerDialog({ area: 'map' }) angemeldet sind, z.B. die Bilanz einer Razzia oder "Veedel übernommen".
//
//   <MapDialog label="Das hat gekostet" onClose={() => ui.closeDialog()} class="raid-report">…</MapDialog>

import type { ComponentChildren } from 'preact';
import { useOverlay } from '../overlays';
import { useIsMobile } from '../shell/layout';
import { Sheet, type SheetDetent } from './Sheet';

export interface MapDialogProps {
  /** Name für Screenreader und Titel des Blatts am Handy-Bildschirm. */
  label: string;
  onClose: () => void;
  children?: ComponentChildren;
  class?: string;
  /**
   * Hintergrund über der Kartenfläche: 'dim' (abgedunkelt, Klick schließt) oder 'none' (Karte bleibt sichtbar und
   * bedienbar, ein Klick auf sie schließt nicht).
   */
  scrim?: 'dim' | 'none';
  /** Höhe als Blatt am Handy-Bildschirm. */
  detent?: SheetDetent;
}

export function MapDialog(props: MapDialogProps) {
  const mobile = useIsMobile();
  useOverlay(!mobile, props.onClose);
  if (mobile) {
    const detent = props.detent ?? 'large';
    return (
      <Sheet
        open
        onClose={props.onClose}
        detents={[detent]}
        initial={detent}
        title={props.label}
        class={`ui-map-sheet ${props.class ?? ''}`}
      >
        {props.children}
      </Sheet>
    );
  }
  return (
    <>
      {/* Schleier über Karte und HUD, aber hinter dem Handy (eigene Ebene, siehe shell.css) */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Hintergrund, Tastatur über Escape */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Hintergrund, Tastatur über Escape */}
      <div class={`ui-map-dialog__scrim is-${props.scrim ?? 'dim'}`} onClick={props.onClose} />
      <div class={`ui-map-dialog is-${props.scrim ?? 'dim'}`}>
        <div class={`ui-map-dialog__card ${props.class ?? ''}`} role="dialog" aria-label={props.label}>
          {props.children}
        </div>
      </div>
    </>
  );
}
