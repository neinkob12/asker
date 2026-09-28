import type { ComponentType } from 'preact';
import { useRuntime } from '../hooks';
import { dialogs, panels } from '../registry';

/** Zeigt das offene Panel (Detailansicht), z.B. einen Spot. Am Handy als Bottom-Sheet. */
export function PanelHost() {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  if (!ui.panel || !state) return null;
  const definition = panels.get(ui.panel.id);
  if (!definition) return null;
  const Component = definition.component as ComponentType<unknown>;
  const props = ui.panel.props as never;
  return (
    <section class="shell-panel" aria-label={definition.title(props, state)}>
      <header class="shell-panel__head">
        <h2>{definition.title(props, state)}</h2>
        <button type="button" class="ui-button ui-button--small" onClick={api.closePanel}>
          Schließen
        </button>
      </header>
      <Component key={`${ui.panel.id}:${JSON.stringify(ui.panel.props)}`} {...(props as object)} />
    </section>
  );
}

/** Zeigt den offenen Dialog. Die Dialog-Komponente rendert selbst <Dialog> aus den Bausteinen. */
export function DialogHost() {
  const { ui } = useRuntime();
  if (!ui.dialog) return null;
  const definition = dialogs.get(ui.dialog.id);
  if (!definition) return null;
  const Component = definition.component as ComponentType<unknown>;
  return <Component {...(ui.dialog.props as object)} />;
}

export function Toasts() {
  const { ui } = useRuntime();
  return (
    <div class="shell-toasts" role="status" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} class={`shell-toast shell-toast--${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Hinweis, solange die Karte auf einen Klick wartet. */
export function PickBanner() {
  const { ui, api } = useRuntime();
  if (!ui.picking) return null;
  return (
    <div class="shell-pick">
      <span>{ui.picking.prompt}</span>
      <button type="button" class="ui-button ui-button--small" onClick={api.cancelPick}>
        Abbrechen
      </button>
    </div>
  );
}
