import type { ComponentType } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Button, ErrorBoundary, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { dialogs } from '../registry';

const MODAL = '[role="dialog"][aria-modal="true"]';

/**
 * Macht den offenen Dialog zu dem, was aria-modal verspricht: Der Rest der Oberfläche (Geschwister des Hosts: Karte,
 * HUD, Handy …) ist für Tastatur und Screenreader weg (inert), der Fokus zieht in den Dialog und geht beim Schließen
 * zurück. Ein Element mit data-live-region (Ansage von Bannern) bleibt erreichbar, sonst würde nichts mehr vorgelesen.
 *
 * Den Fokus bekommt ein Element mit `autofocus` bzw. `data-autofocus`, sonst der Dialog selbst: Er wird mit seiner
 * Überschrift vorgelesen, und ein Tastendruck löst keine Wahl aus (bei einer Konfrontation wäre das fatal).
 * Dialoge über der Kartenfläche (`area: 'map'`) lassen Handy und Karte bedienbar und sind davon ausgenommen.
 */
function useModalDialog(host: { current: HTMLElement | null }, dialogId: string | null): void {
  const inerted = useRef(new Set<Element>());

  // Bei jedem Zeichnen: Auch Geschwister, die erst jetzt dazukamen (Handy geöffnet), werden gesperrt.
  useEffect(() => {
    const root = host.current?.parentElement;
    if (!dialogId || !root) return;
    for (const child of Array.from(root.children)) {
      if (child === host.current || inerted.current.has(child)) continue;
      // Schon gesperrt (z.B. das Handy hinter einem Kartendialog): nicht anfassen, nicht wieder freigeben.
      if (child.hasAttribute('inert') || child.hasAttribute('data-live-region')) continue;
      child.setAttribute('inert', '');
      inerted.current.add(child);
    }
  });

  useEffect(() => {
    if (!dialogId) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = host.current?.querySelector<HTMLElement>(MODAL);
    if (modal && !modal.contains(document.activeElement)) {
      if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
      (modal.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? modal).focus({ preventScroll: true });
    }
    return () => {
      for (const child of inerted.current) child.removeAttribute('inert');
      inerted.current.clear();
      // Erst nach dem Freigeben: Ein gesperrtes Element nimmt keinen Fokus.
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [dialogId]);
}

/** Zeigt den offenen Dialog. Die Dialog-Komponente rendert selbst <Dialog> aus den Bausteinen. */
export function DialogHost() {
  const { ui, api } = useRuntime();
  const host = useRef<HTMLDivElement>(null);
  const definition = ui.dialog ? dialogs.get(ui.dialog.id) : undefined;
  useModalDialog(host, definition && definition.area !== 'map' ? (ui.dialog?.id ?? null) : null);
  if (!ui.dialog || !definition) return null;
  const Component = definition.component as ComponentType<unknown>;
  return (
    // display: contents: Der Kasten ändert das Layout nicht, gibt aber den Bezugspunkt für useModalDialog.
    <div class="shell-dialog-host" ref={host} style={{ display: 'contents' }}>
      {/* Stürzt ein Dialog ab, der sich nicht wegklicken lässt (Konfrontation), hilft sonst nichts: Das Spiel bliebe pausiert. */}
      <ErrorBoundary key={ui.dialog.id} name={ui.dialog.id} onClose={api.closeDialog}>
        <Component {...(ui.dialog.props as object)} />
      </ErrorBoundary>
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
