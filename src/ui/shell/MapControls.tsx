import { Icon, IconButton } from '../components';
import { useRuntime } from '../hooks';
import { type MapLayerOption, mapLayerOptions } from '../registry';
import { MenuButton, Popover } from './Hud';
import { useIsMobile } from './layout';

/**
 * Kartensteuerung im Look "Glas", unten rechts vor dem Handy: zwei Glas-Gruppen mit 44-px-Knöpfen.
 * Erste Gruppe Zoom +/−/Norden, zweite 3D/2D (gold, wenn 3D), Ebenen (Menü mit den Einträgen aus
 * registerMapLayerOption, z.B. Veedel nach Kontrolle oder Heat, Überwachungs-Overlay) und zurück nach Köln.
 * Am Handy-Bildschirm kommt das Menü als dritte Gruppe dazu (oben ist dort nur Platz für Geld und Uhr).
 */
export function MapControls() {
  const { api, ui } = useRuntime();
  const is3d = ui.camera === '3d';
  const layersOpen = ui.popover === 'map-layers';
  const mobile = useIsMobile();
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
          {is3d ? '3D' : '2D'}
        </button>
        <div class="hud-anchor">
          <button
            type="button"
            class={`shell-mapctl__button ${layersOpen ? 'is-open' : ''}`}
            aria-label="Ebenen"
            aria-expanded={layersOpen}
            title="Ebenen"
            onClick={() => api.setPopover(layersOpen ? null : 'map-layers')}
          >
            <Icon name="layers" />
          </button>
          <Popover id="map-layers" align="right" class="hud-popover--up shell-layers">
            <LayerMenu />
          </Popover>
        </div>
        <IconButton icon="pin" label="Zurück zur Stadt" onClick={api.flyHome} />
      </div>
      {mobile && (
        <div class="shell-mapctl__group">
          <MenuButton up />
        </div>
      )}
    </nav>
  );
}

/** Menü "Ebenen": Einträge nach Gruppen; in einer Gruppe ist einer gewählt, Schalter stehen für sich. */
function LayerMenu() {
  const { api, ui } = useRuntime();
  const groups = new Map<string, MapLayerOption[]>();
  for (const option of mapLayerOptions.list()) {
    const list = groups.get(option.group) ?? [];
    list.push(option);
    groups.set(option.group, list);
  }
  return (
    <>
      {[...groups].map(([group, options]) => (
        <fieldset key={group} class="shell-layers__group">
          <legend class="shell-layers__title">{group}</legend>
          {options.map((option) => {
            const active = option.active(ui);
            return (
              <button
                key={option.id}
                type="button"
                class={`hud-menu__item ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  option.select(api, ui);
                  if (!option.toggle) api.setPopover(null);
                }}
              >
                <Icon name={option.icon ?? 'layers'} />
                {option.label}
                {active && <Icon name="check" class="shell-layers__check" />}
              </button>
            );
          })}
        </fieldset>
      ))}
    </>
  );
}
