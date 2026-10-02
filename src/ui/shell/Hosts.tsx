import type { ComponentType } from 'preact';
import { Button, ErrorBoundary, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { dialogs } from '../registry';

/** Zeigt den offenen Dialog. Die Dialog-Komponente rendert selbst <Dialog> aus den Bausteinen. */
export function DialogHost() {
  const { ui, api } = useRuntime();
  if (!ui.dialog) return null;
  const definition = dialogs.get(ui.dialog.id);
  if (!definition) return null;
  const Component = definition.component as ComponentType<unknown>;
  return (
    // Stürzt ein Dialog ab, der sich nicht wegklicken lässt (Konfrontation), hilft sonst nichts: Das Spiel bliebe pausiert.
    <ErrorBoundary key={ui.dialog.id} name={ui.dialog.id} onClose={api.closeDialog}>
      <Component {...(ui.dialog.props as object)} />
    </ErrorBoundary>
  );
}

/** Hinweis, solange die Karte auf einen Klick wartet. */
export function PickBanner() {
  const { ui, api } = useRuntime();
  if (!ui.picking) return null;
  return (
    <div class="shell-pick" role="status">
      <IconChip icon="target" color="yellow" size="sm" />
      <span>{ui.picking.prompt}</span>
      <Button small icon="close" onClick={api.cancelPick}>
        Abbrechen
      </Button>
    </div>
  );
}
