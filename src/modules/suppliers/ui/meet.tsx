// Lieferant kennenlernen (Auftrag 46e): Wird ein Lieferant frei, stellt er sich einmal mit einem Pop-up über der
// Karte vor (Look Glas): Porträt, Name, Rolle, ein, zwei Sätze in seiner Stimme, „Angebot ansehen“ öffnet die
// Lieferanten-App bei ihm, „Später“ schließt. Kommen mehrere auf einmal (Kalle und Toni in Stufe 5), ist es ein Pop-up.
// Das Pop-up wartet, bis der Spieler frei ist (kein anderer Dialog wie Konfrontation oder Razzia-Bilanz, kein Menü,
// am Handy-Bildschirm das Handy zu; popupMayOpen aus src/ui).

import { useEffect } from 'preact/hooks';
import { lookFor } from '../../../core';
import {
  Avatar,
  Button,
  MapDialog,
  onGameEvent,
  popupMayOpen,
  registerDialog,
  registerSlot,
  useGame,
  useIsMobile,
  useUi,
} from '../../../ui';
import { contactOf, getSupplier, introText, isUnlocked, type Supplier } from '../index';

declare module '../../../ui' {
  interface DialogRegistry {
    'suppliers.meet': { supplierIds: string[] };
  }
}

const APP_ID = 'suppliers.app';

interface Pending {
  runId: string;
  supplierIds: string[];
  shown: boolean;
}

/** Noch nicht gezeigte Vorstellungen (nur Oberfläche), in der Reihenfolge der Ereignisse. */
const queue: Pending[] = [];

function roleLine(supplier: Supplier, unlocked: boolean): string {
  return unlocked ? `Lieferant aus ${supplier.name}` : `Lieferant aus ${supplier.name}, will mit dir ins Geschäft`;
}

function MeetDialog(props: { supplierIds: string[] }) {
  const { state } = useGame();
  const ui = useUi();
  const suppliers = props.supplierIds.map((id) => getSupplier(state, id)).filter((s): s is Supplier => !!s);
  const close = () => ui.closeDialog();
  const open = () => {
    ui.closeDialog();
    ui.openPhone(APP_ID, suppliers.length === 1 ? { supplierId: suppliers[0].id } : undefined);
  };
  return (
    <MapDialog
      label={suppliers.length === 1 ? `${suppliers[0].contactName} stellt sich vor` : 'Neue Lieferanten'}
      onClose={close}
      class="sup-meet"
      detent="large"
    >
      <p class="sup-meet__kicker">{suppliers.length === 1 ? 'Neuer Lieferant' : 'Neue Lieferanten'}</p>
      {suppliers.map((supplier) => {
        const contact = contactOf(supplier);
        return (
          <div key={supplier.id} class="sup-meet__person">
            <Avatar
              name={supplier.contactName}
              look={lookFor(`supplier:${supplier.id}`, supplier.contactName, contact.look ?? {})}
              tone="goods"
              size="xl"
            />
            <div class="sup-meet__text">
              <strong class="sup-meet__name">{supplier.contactName}</strong>
              <span class="sup-meet__role">{roleLine(supplier, isUnlocked(state, supplier.id))}</span>
              <p class="sup-meet__quote">„{introText(supplier)}“</p>
            </div>
          </div>
        );
      })}
      <div class="sup-meet__actions">
        <Button variant="primary" icon="truck" onClick={open}>
          Angebot ansehen
        </Button>
        <Button variant="subtle" onClick={close}>
          Später
        </Button>
      </div>
    </MapDialog>
  );
}

/** Öffnet die nächste Vorstellung, sobald kein anderer Dialog offen ist. */
function MeetOpener() {
  const ui = useUi();
  const { state } = useGame();
  const mobile = useIsMobile();
  const pending = queue.find((p) => !p.shown && p.runId === state.meta.runId) ?? null;
  // Erst, wenn der Spieler frei ist (kein Dialog, kein Menü, am Handy-Bildschirm das Handy zu): popupMayOpen.
  const free = popupMayOpen(ui.state, mobile);
  useEffect(() => {
    if (!pending || !free) return;
    const timer = window.setTimeout(() => {
      if (pending.shown || !popupMayOpen(ui.state, mobile)) return;
      pending.shown = true;
      ui.openDialog('suppliers.meet', { supplierIds: pending.supplierIds });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pending, free, mobile, ui]);
  return null;
}

onGameEvent('supplier.introduced', 'suppliers.meet', (payload, _ui, state) => {
  queue.push({ runId: state.meta.runId, supplierIds: payload.supplierIds, shown: false });
  while (queue.length > 6) queue.shift();
});

registerDialog({ id: 'suppliers.meet', component: MeetDialog, area: 'map', pausesGame: true, lockPhone: false });
registerSlot('map.overlay', { id: 'suppliers.meetOpener', order: 14, component: MeetOpener });
