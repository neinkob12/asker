// Oberfläche eines Moduls. Diese Datei wird automatisch geladen (src/modules/<id>/ui/index.tsx),
// die Vorlage selbst nicht (Ordner mit "_"). Hier nur Oberfläche: lesen mit useGame(), ändern nur mit dispatch.
//
// Möglichkeiten (alle aus '../../../ui' bzw. '../../../map'):
//   registerHudItem    Anzeige im HUD (mit <HudPill>; placement: 'main' oben, 'more' im Popover)
//   registerTab        eigener Tab im Dock (Desktop) bzw. in der Tab-Leiste (Handy)
//   registerSlot       Abschnitt in einem vorhandenen Tab ('tab:business') oder Panel ('spots.spotPanel')
//   registerPanel      Detailansicht, öffnen mit ui.openPanel(id, props)
//   registerDialog     Dialog, öffnen mit ui.openDialog(id, props)
//   registerPhoneApp   App im Spiel-Handy
//   onGameEvent        auf Spielereignisse reagieren (Toast, Dialog …)
//   registerMapLayer   eigene Layer und Marker auf der Karte

import { Button, Card, Dialog, KeyValue, onGameEvent, registerDialog, registerSlot, useGame, useUi } from '../../../ui';
import { getCounter } from '../index';

// Panels und Dialoge mit Props werden wie im Kern per Declaration Merging angemeldet.
declare module '../../../ui' {
  interface DialogRegistry {
    'template.info': { counter: number };
  }
}

function TemplateSection() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const counter = getCounter(state);
  return (
    <Card title="Vorlage">
      <KeyValue label="Zähler" value={counter} />
      <Button onClick={() => dispatch({ type: 'template.increment', payload: { by: 1 } })}>+1</Button>{' '}
      <Button variant="subtle" onClick={() => ui.openDialog('template.info', { counter })}>
        Info
      </Button>
    </Card>
  );
}

function TemplateDialog(props: { counter: number }) {
  const ui = useUi();
  return (
    <Dialog title="Vorlage" onClose={ui.closeDialog}>
      <p>Der Zähler stand beim Öffnen bei {props.counter}.</p>
    </Dialog>
  );
}

registerSlot('tab:business', { id: 'template.section', order: 100, component: TemplateSection });
registerDialog({ id: 'template.info', component: TemplateDialog });
onGameEvent('template.incremented', 'template.toast', (payload, ui) => ui.toast(`Zähler: ${payload.counter}`));
