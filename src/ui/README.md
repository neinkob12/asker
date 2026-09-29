# Oberfläche (`src/ui/`)

Look "clean und dunkel" für die Bedienelemente über der Candy-Karte (Pastell, siehe `src/map/README.md`).
Module importieren alles aus `src/ui/index.ts` (nur aus ihrem `ui/`-Ordner). Registries und Hooks: siehe `docs/architektur.md` und das Beispiel in
`src/modules/_template/ui/index.tsx`.

## Tokens (`styles/tokens.css`)

Nur Variablen verwenden: `--color-*` (Flächen `bg/panel/surface…`, Text `text/muted/faint`, Akzente
`accent/warn/bad/info` jeweils mit `-strong` und `-soft`), `--font-body/--font-mono`, `--font-size-xs…xl`,
`--space-1…6`, `--radius-sm/md/lg/round`, `--shadow-*`, `--duration(-fast)`, `--ease-out`, Layout
(`--touch-target` ist am Handy 44 px) und `--z-*`. Am Handy gelten `--safe-*` für Notch und Home-Leiste.

## Bausteine (`components/`)

`Button` (neu: `icon`, `badge`), `IconButton`, `SegmentedControl` (Optionen mit `icon`), `Card` (neu: `icon`,
`tone`), `Hint`, `Empty` (`icon`), `KeyValue` (`tone`), `Stat` (`icon`, `tone`), `Badge` (`tone` auch
`warn|info`), `ProgressBar` (`tone` auch `info`), `List`/`ListItem` (`icon`, `active`, `tone` auch `warn`),
`Tabs` (`icon`), `Dialog` (`icon`, `tone`, `kicker`), neu: `Icon`, `Tag`, `Avatar`, `Toggle`, `Slider`,
`Select` (Auswahlfeld: `label`, `value`, `options: { value, label }[]`, `onChange`, `wide`).
Bestehende Props funktionieren unverändert.

**Icons:** eigenes Set in `components/icons.ts` (24er-Raster, nur Linien, kein npm-Paket).
`<Icon name="truck" />`, als `icon`-Prop an vielen Bausteinen und bei `registerPhoneApp({ icon: 'truck' })`.
Unbekannte Namen (z.B. Emoji) werden als Text gezeigt. Neue Icons in `icons.ts` ergänzen.

## Spiel-Handy (`phone/`)

- `registerPhoneApp({ id, name, icon, order, component, badge?, color?, chrome? })`: `color` färbt die Kachel,
  `chrome: 'none'` heißt, die App zeichnet ihre Kopfleiste selbst mit `<PhoneScreen title onBack actions footer>`.
  Sonst setzt das Handy eine Leiste mit Zurück und App-Namen darüber.
- `ui.openPhone(appId, params)` öffnet eine App mit Parametern (`UiState.phone.params`), z.B.
  `ui.openPhone('core.messages', { contactId: 'gang:nord' })` öffnet direkt den Chat.
- Widgets auf dem Startbildschirm: `registerSlot('phone.home', { id, order, component })` (Beispiel: Wetter).
- Benachrichtigung: `ui.notify({ title, text, icon, appId, params, sound })` zeigt ein Banner, lässt das Handy
  vibrieren (Animation, auf echten Handys auch `navigator.vibrate`) und spielt einen Ton. Neue Nachrichten aus dem
  Nachrichtendienst lösen das automatisch aus.
- Nachrichten-App (`core.messages`): Chats pro Figur, Filter "Offen", ungelesene Nachrichten mit "Neu"-Trenner,
  Antwort-Optionen als große Knöpfe mit Frist, abgelaufene Fragen. Die Aufbereitung ist in `messagesModel.ts`
  (getestet).
- Weitere Apps des Kerns: Musik (`core.music`), Einstellungen (`core.settings`). Einstellungen erweitern:
  `registerSlot('core.settings', …)`.

## Ton (`src/audio/`, über `src/ui` erreichbar)

```ts
import { audio, soundOnEvent } from '../../../ui';
audio.play('cash');                                   // SOUND_IDS: message, notification, cash, click, tap, error,
                                                      // success, alert, siren, thunder, gameOver, win, vibrate, delivery
audio.playThrottled('cash', 400);
audio.setAmbience('rain', 0.7);                       // rain | storm | wind, 0 = aus
audio.registerSound('gangs.shot', { kind: 'file', url: 'audio/sfx/shot.ogg' });
soundOnEvent('police.raid', 'siren');                 // Sound an ein Ereignis binden
```

Musik: selbst erzeugte Playlist, Stimmung nach Tageszeit (Nacht, Morgengrauen, Tag, Abend). Lautstärke,
Stummschalten und Musik an/aus merkt sich jedes Gerät. Ton startet erst nach der ersten Interaktion.

## Einstellungen pro Gerät

`UiState.overlay`, `camera`, `vibration` (`prefs.ts`, `localStorage` `koeln-tycoon:ui`), Ton unter
`koeln-tycoon:audio`.
