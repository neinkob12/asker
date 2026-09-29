import type { ComponentType } from 'preact';
import { Button, ErrorBoundary, Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { dialogs } from '../registry';
import { TOAST_CHIPS, TOAST_ICONS } from './AlertCenter';

/** Zeigt den offenen Dialog. Die Dialog-Komponente rendert selbst <Dialog> aus den Bausteinen. */
export function DialogHost() {
  const { ui } = useRuntime();
  if (!ui.dialog) return null;
  const definition = dialogs.get(ui.dialog.id);
  if (!definition) return null;
  const Component = definition.component as ComponentType<unknown>;
  return (
    <ErrorBoundary key={ui.dialog.id} name={ui.dialog.id}>
      <Component {...(ui.dialog.props as object)} />
    </ErrorBoundary>
  );
}

/** Höchstens ein Toast sichtbar, der Rest wartet. Ein Tipp blendet ihn aus, "Hin" springt zum Ort. */
export function Toasts() {
  const { ui, api } = useRuntime();
  const t = ui.toasts[0];
  if (!t) return <div class="shell-toasts" role="status" aria-live="polite" />;
  const waiting = ui.toasts.length - 1;
  return (
    <div class="shell-toasts" role="status" aria-live="polite">
      <div key={t.id} class={`shell-toast shell-toast--${t.kind}`}>
        <IconChip icon={t.icon ?? TOAST_ICONS[t.kind]} color={TOAST_CHIPS[t.kind]} size="sm" />
        <span class="shell-toast__text">{t.text}</span>
        {waiting > 0 && <span class="shell-toast__more">+{waiting}</span>}
        {t.target && (
          <Button
            small
            icon="zoomIn"
            aria-label="Auf der Karte zeigen"
            onClick={() => {
              if (t.target) api.flyTo(t.target, 15.5);
              api.dismissToast();
            }}
          />
        )}
        <button type="button" class="shell-toast__close" aria-label="Ausblenden" onClick={api.dismissToast}>
          <Icon name="close" />
        </button>
      </div>
    </div>
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
