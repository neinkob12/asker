// Willkommen beim allerersten Start (Auftrag 46c, Intro neu): eine Seite mit „Willkommen in Kölle. Du bist Dealer am
// Neumarkt. Wie heißt du?“ und dem Namen für die Bestenliste. Danach geht es zur Wahl des Modus (Neues Spiel); im
// Modus normal erklärt Peter dann alles Weitere in der Tour. Die Story-Seiten von früher sind weg. Über die
// Einstellungen lässt sich die Seite noch einmal ansehen (dann ohne Neues Spiel danach).

import { useState } from 'preact/hooks';
import { Button, Dialog, IconChip, TextField } from '../components';
import { useRuntime } from '../hooks';
import { getPlayerName, markIntroSeen, PLAYER_NAME_MAX, setPlayerName } from '../player';

declare module '../registry' {
  interface DialogRegistry {
    /** replay: aus den Einstellungen, danach kein Neues Spiel. */
    'core.intro': { replay?: boolean };
  }
}

export function IntroDialog(props: { replay?: boolean }) {
  const runtime = useRuntime();
  const [name, setName] = useState(getPlayerName());

  const finish = () => {
    setPlayerName(name);
    markIntroSeen();
    runtime.api.closeDialog();
    if (!props.replay) runtime.api.openDialog('core.newGame', { firstStart: true });
  };

  return (
    <Dialog
      title="Willkommen in Kölle"
      kicker="Köln, Freitagabend"
      class="intro"
      onClose={props.replay ? finish : undefined}
      actions={
        <Button variant="primary" onClick={finish}>
          {props.replay ? 'Fertig' : "Los geht's"}
        </Button>
      }
    >
      <div class="intro__hero">
        <IconChip icon="pin" color="place" size="xl" solid />
      </div>
      <p class="intro__text">Du bist Dealer am Neumarkt. Wie heißt du?</p>
      <TextField
        label="Dein Name"
        value={name}
        placeholder="z.B. Jakob"
        maxLength={PLAYER_NAME_MAX}
        autoFocus
        onInput={(value) => {
          setName(value);
          // Aus den Einstellungen gilt der Name sofort: Esc schließt ohne finish (shell/keys.ts), der Name soll trotzdem
          // bleiben wie beim Schließen-Knopf.
          if (props.replay) setPlayerName(value);
        }}
        onSubmit={finish}
      />
      <p class="intro__note">Unter diesem Namen landet dein Ergebnis in der Bestenliste, die alle sehen.</p>
    </Dialog>
  );
}
