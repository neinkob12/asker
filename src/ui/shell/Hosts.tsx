import type { ComponentType } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Button, ErrorBoundary, Icon, IconButton, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { dialogs, panels } from '../registry';
import { TOAST_CHIPS, TOAST_ICONS } from './AlertCenter';
import { useIsMobile } from './layout';
import { useSheetDrag } from './Navigation';

/** Zeigt das offene Panel (Detailansicht), z.B. einen Spot. Am Desktop als Karte rechts, am Handy als Bottom-Sheet. */
export function PanelHost() {
  const runtime = useRuntime();
  const mobile = useIsMobile();
  const { ui } = runtime;
  const state = runtime.state;
  if (!ui.panel || !state) return null;
  const definition = panels.get(ui.panel.id);
  if (!definition) return null;
  const props = ui.panel.props as never;
  const title = safeTitle(() => definition.title(props, state));
  const key = `${ui.panel.id}:${JSON.stringify(ui.panel.props)}`;
  const body = (
    <ErrorBoundary key={key} name={title}>
      {(() => {
        const Component = definition.component as ComponentType<unknown>;
        return <Component {...(props as object)} />;
      })()}
    </ErrorBoundary>
  );
  return mobile ? (
    <PanelSheet key={ui.panel.id} title={title}>
      {body}
    </PanelSheet>
  ) : (
    <PanelCard title={title}>{body}</PanelCard>
  );
}

function PanelCard(props: { title: string; children: preact.ComponentChildren }) {
  const { api } = useRuntime();
  return (
    <section class="shell-panel" aria-label={props.title}>
      <header class="shell-panel__head">
        <IconChip icon="pin" color="blue" size="md" />
        <h2>{props.title}</h2>
        <IconButton icon="close" label="Schließen (Esc)" onClick={api.closePanel} />
      </header>
      <div class="shell-panel__body">{props.children}</div>
    </section>
  );
}

const PANEL_SNAPS = ['half', 'full'] as const;

function PanelSheet(props: { title: string; children: preact.ComponentChildren }) {
  const { api } = useRuntime();
  const [snap, setSnap] = useState<'half' | 'full'>('half');
  const ref = useRef<HTMLElement>(null);
  const drag = useSheetDrag(ref, PANEL_SNAPS, (s) => setSnap(s === 'full' ? 'full' : 'half'), api.closePanel);
  return (
    <section ref={ref} class={`shell-sheet shell-sheet--panel is-${snap}`} aria-label={props.title}>
      <div class="shell-sheet__grip" onPointerDown={drag.onPointerDown}>
        <button
          type="button"
          class="shell-sheet__handle"
          aria-label={snap === 'full' ? 'Kleiner' : 'Größer'}
          onClick={() => !drag.dragged.current && setSnap(snap === 'full' ? 'half' : 'full')}
        />
      </div>
      <header class="shell-sheet__head" onPointerDown={drag.onPointerDown}>
        <IconChip icon="pin" color="blue" size="sm" />
        <h2>{props.title}</h2>
        <IconButton icon="close" label="Schließen" onClick={api.closePanel} />
      </header>
      <div class="shell-sheet__body">{props.children}</div>
    </section>
  );
}

function safeTitle(fn: () => string): string {
  try {
    return fn();
  } catch (error) {
    console.error('Panel-Titel', error);
    return 'Details';
  }
}

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
