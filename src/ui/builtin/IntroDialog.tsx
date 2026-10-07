// Intro beim allerersten Start: ein paar kurze Seiten zur Story und zu den Regeln, dann der Name für die
// Bestenliste. Danach geht es zur Wahl des Modus (Neues Spiel). Überspringen springt direkt zum Namen.
// Über die Einstellungen lässt es sich jederzeit noch einmal ansehen (dann ohne Neues Spiel danach).

import { useState } from 'preact/hooks';
import { Button, type ChipColor, Dialog, IconChip, TextField } from '../components';
import { useRuntime } from '../hooks';
import { getPlayerName, markIntroSeen, PLAYER_NAME_MAX, setPlayerName } from '../player';

declare module '../registry' {
  interface DialogRegistry {
    /** replay: aus den Einstellungen, danach kein Neues Spiel. */
    'core.intro': { replay?: boolean };
  }
}

interface IntroPage {
  icon: string;
  color: ChipColor;
  kicker: string;
  title: string;
  text: string;
  points?: { icon: string; color: ChipColor; text: string }[];
}

const PAGES: readonly IntroPage[] = [
  {
    icon: 'moon',
    color: 'brand',
    kicker: 'Köln, Freitagabend',
    title: 'Ganz unten anfangen',
    text: 'Du hast 1.500 €, 40 g Gras und ein kleines Lager in Ehrenfeld. Mehr nicht. Aber du kennst Peter, und Peter kennt jeden.',
  },
  {
    icon: 'route',
    color: 'goods',
    kicker: 'So läuft das',
    title: 'Ware rein, Ware raus',
    text: 'Vier Dinge, um die sich alles dreht:',
    points: [
      {
        icon: 'truck',
        color: 'goods',
        text: 'Ware bei Lieferanten bestellen, sie kommt ins Lager, später auch per Schiff über den Hafen.',
      },
      { icon: 'pin', color: 'place', text: 'An Spots auf der Karte verkaufen, erst selbst, dann mit Läufern.' },
      { icon: 'crew', color: 'people', text: 'Leute anheuern: Fahrer, Leutnants und eine Rechte Hand.' },
      {
        icon: 'flag',
        color: 'brand',
        text: 'Veedel übernehmen. Mit sieben bist du der Boss von Köln, mit allen zwölf gehört dir die Stadt.',
      },
    ],
  },
  {
    icon: 'siren',
    color: 'danger',
    kicker: 'Pass auf',
    title: 'Nicht auffallen',
    text: 'Je größer du wirst, desto genauer schauen andere hin:',
    points: [
      { icon: 'flame', color: 'danger', text: 'Heat: Zu viel Aufsehen bringt Kontrollen und Razzien.' },
      { icon: 'skull', color: 'danger', text: 'Gangs wollen ihr Revier behalten, notfalls mit Gewalt.' },
      { icon: 'wallet', color: 'warn', text: 'Pleite oder tot heißt Game Over.' },
    ],
  },
  {
    icon: 'phone',
    color: 'chat',
    kicker: 'Dein Handy',
    title: 'Alles läuft übers Handy',
    // Feedback 07.10.2026: Das Handy fängt fast leer an, die Apps kommen mit Peters Quests (abschaltbar in den
    // Einstellungen, Einstieg).
    text: 'Lieferanten, Leute und Gangs schreiben dir. Peter schickt dir Quests mit Belohnungen, die dich durchs Spiel führen, und mit ihnen kommen nach und nach die Apps aufs Handy. Die aktuelle Quest steht oben links unter deinem Geld.',
  },
];

export function IntroDialog(props: { replay?: boolean }) {
  const runtime = useRuntime();
  const [page, setPage] = useState(0);
  const [name, setName] = useState(getPlayerName());
  const nameStep = !props.replay && page >= PAGES.length;
  const last = props.replay ? PAGES.length - 1 : PAGES.length;

  const finish = () => {
    if (!props.replay) setPlayerName(name);
    markIntroSeen();
    runtime.api.closeDialog();
    if (!props.replay) runtime.api.openDialog('core.newGame', { firstStart: true });
  };
  const next = () => (page >= last ? finish() : setPage(page + 1));

  const dots = (
    <div class="intro__dots" aria-hidden="true">
      {Array.from({ length: last + 1 }, (_, i) => (
        <span key={i} class={`intro__dot ${i === page ? 'is-on' : ''}`} />
      ))}
    </div>
  );

  if (nameStep) {
    return (
      <Dialog
        title="Wie heißt du?"
        kicker="Bestenliste"
        icon="trophy"
        class="intro"
        actions={
          <>
            <Button onClick={() => setPage(page - 1)}>Zurück</Button>
            <Button variant="primary" onClick={finish}>
              Weiter
            </Button>
          </>
        }
      >
        <p class="intro__text">
          Wenn ein Spiel endet, landet dein Ergebnis in der Bestenliste, die alle sehen. Unter welchem Namen?
        </p>
        <TextField
          label="Dein Name"
          value={name}
          placeholder="z.B. Jakob"
          maxLength={PLAYER_NAME_MAX}
          autoFocus
          onInput={setName}
          onSubmit={finish}
        />
        {dots}
      </Dialog>
    );
  }

  const p = PAGES[page];
  return (
    <Dialog
      title={p.title}
      kicker={p.kicker}
      class="intro"
      onClose={props.replay ? finish : undefined}
      actions={
        <>
          {page > 0 ? (
            <Button onClick={() => setPage(page - 1)}>Zurück</Button>
          ) : (
            !props.replay && (
              <Button variant="subtle" onClick={() => setPage(PAGES.length)}>
                Überspringen
              </Button>
            )
          )}
          <Button variant="primary" onClick={next}>
            {page >= last ? "Los geht's" : 'Weiter'}
          </Button>
        </>
      }
    >
      <div class="intro__hero">
        <IconChip icon={p.icon} color={p.color} size="xl" solid />
      </div>
      <p class="intro__text">{p.text}</p>
      {p.points && (
        <ul class="intro__points">
          {p.points.map((point) => (
            <li key={point.text}>
              <IconChip icon={point.icon} color={point.color} size="sm" />
              <span>{point.text}</span>
            </li>
          ))}
        </ul>
      )}
      {dots}
    </Dialog>
  );
}
