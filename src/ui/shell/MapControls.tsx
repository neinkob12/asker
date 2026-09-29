import { IconButton } from '../components';
import { useRuntime } from '../hooks';

/** Kartensteuerung am Rand: Zoom, Norden, Kamera 3D/2D, Überwachungs-Overlay, zurück nach Köln. */
export function MapControls() {
  const { api, ui } = useRuntime();
  const is3d = ui.camera === '3d';
  return (
    <nav class="shell-mapctl" aria-label="Karte">
      <div class="shell-mapctl__group is-zoom">
        <IconButton icon="plus" label="Hineinzoomen" onClick={api.zoomIn} />
        <IconButton icon="minus" label="Herauszoomen" onClick={api.zoomOut} />
        <IconButton icon="navigation" label="Nach Norden ausrichten" onClick={api.resetNorth} />
      </div>
      <div class="shell-mapctl__group">
        <button
          type="button"
          class={`shell-mapctl__camera ${is3d ? 'is-3d' : 'is-2d'}`}
          onClick={api.toggleCamera}
          aria-label={is3d ? 'Zur 2D-Draufsicht wechseln' : 'Zur 3D-Ansicht wechseln'}
          title={is3d ? '2D-Draufsicht' : '3D schräg'}
        >
          <span class={is3d ? 'is-on' : ''}>3D</span>
          <span class={is3d ? '' : 'is-on'}>2D</span>
        </button>
        <IconButton
          icon="scan"
          label={ui.overlay ? 'Überwachungs-Overlay aus' : 'Überwachungs-Overlay an'}
          active={ui.overlay}
          onClick={() => api.setOverlay(!ui.overlay)}
        />
      </div>
      <div class="shell-mapctl__group">
        <IconButton icon="pin" label="Zurück nach Köln" onClick={api.flyToKoeln} />
      </div>
    </nav>
  );
}
