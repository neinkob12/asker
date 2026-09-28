import type { ComponentType } from 'preact';
import { Button, Icon, IconButton } from '../components';
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
  const title = definition.title(props, state);
  return (
    <section class="shell-panel" aria-label={title}>
      <header class="shell-panel__head">
        <div class="shell-panel__heading">
          <span class="shell-panel__kicker">
            <Icon name="target" /> Ziel erfasst
          </span>
          <h2>{title}</h2>
        </div>
        <IconButton icon="close" label="Schließen" onClick={api.closePanel} />
      </header>
      <div class="shell-panel__body">
        <Component key={`${ui.panel.id}:${JSON.stringify(ui.panel.props)}`} {...(props as object)} />
      </div>
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

const TOAST_ICONS = { info: 'info', good: 'check', bad: 'alert' } as const;

export function Toasts() {
  const { ui } = useRuntime();
  return (
    <div class="shell-toasts" role="status" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} class={`shell-toast shell-toast--${t.kind}`}>
          <Icon name={TOAST_ICONS[t.kind]} class="shell-toast__icon" />
          <span>{t.text}</span>
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
    <div class="shell-pick" role="status">
      <Icon name="target" class="shell-pick__icon" />
      <span>{ui.picking.prompt}</span>
      <Button small onClick={api.cancelPick}>
        Abbrechen
      </Button>
    </div>
  );
}
