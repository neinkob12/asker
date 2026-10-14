import { IconButton } from '../components';
import { useRuntime } from '../hooks';
import { MenuButton } from './Hud';
import { useIsMobile } from './layout';

/**
 * Kartensteuerung im Look "Glas", unten rechts vor dem Handy: zwei Glas-Gruppen mit 44-px-Knöpfen.
 * Erste Gruppe Zoom +/−, zweite zurück zur Stadt und Übersicht. Die Karte ist immer 2D (Feedback 13.10.2026: kein
 * Umschalter 3D/2D, kein Norden-Knopf, kein Menü Ebenen mehr).
 * Am Handy-Bildschirm kommt das Menü als dritte Gruppe dazu (oben ist dort nur Platz für Geld und Uhr).
 */
export function MapControls() {
  const { api } = useRuntime();
  const mobile = useIsMobile();
  return (
    <nav class="shell-mapctl" aria-label="Karte">
      <div class="shell-mapctl__group is-zoom">
        <IconButton icon="plus" label="Hineinzoomen" onClick={api.zoomIn} />
        <IconButton icon="minus" label="Herauszoomen" onClick={api.zoomOut} />
      </div>
      <div class="shell-mapctl__group">
        <IconButton icon="pin" label="Zurück zur Stadt" onClick={api.flyHome} />
        {/* Auftrag 43: Übersicht über alle Städte bzw. nach dem Verkauf über Europa, ohne zu zoomen. */}
        <IconButton icon="globe" label="Übersicht" onClick={api.flyToDeutschland} />
      </div>
      {mobile && (
        <div class="shell-mapctl__group">
          <MenuButton up />
        </div>
      )}
    </nav>
  );
}
