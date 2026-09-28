# Musik und Sounds – Lizenzen

Stand: Auftrag 14 (Look, Spiel-Handy und Sound).

## Was es gibt

Alle Musik und alle Soundeffekte werden **zur Laufzeit im Browser erzeugt** (Web Audio API). Es gibt keine
Audiodateien und keine fremden Samples.

| Was | Wo im Code | Herkunft | Lizenz |
| --- | --- | --- | --- |
| Musik-Playlist (8 Stücke: "Ringe bei Nacht", "Späti um vier", "Blaulicht über Kalk", "Rheinnebel", "Mülheimer Brücke", "Sonnendeck Deutz", "Stadtgarten", "Veedel schläft nie") | `src/audio/tracks.ts` (Noten), `src/audio/music.ts` und `src/audio/synth.ts` (Klang) | selbst erzeugt für dieses Projekt | wie der Code des Projekts |
| Soundeffekte (Nachricht, Kasse, Klick, Sirene, Donner …) | `src/audio/synth.ts` | selbst erzeugt | wie der Code des Projekts |
| Geräusche (Regen, Sturm, Wind) | `src/audio/synth.ts` | selbst erzeugt (gefiltertes Rauschen) | wie der Code des Projekts |

## Neue Dateien

Echte Musik oder Sounds kommen hierher (`public/audio/music/`, `public/audio/sfx/`) und werden so angemeldet:

- Musik: Eintrag mit `src: 'audio/music/<datei>.ogg'` in `src/audio/tracks.ts`
- Sound: `audio.registerSound('<modul>.<name>', { kind: 'file', url: 'audio/sfx/<datei>.ogg' })`

Für jede Datei hier eine Zeile ergänzen: Datei, Urheber, Quelle (URL), Lizenz (z.B. CC0, CC BY 4.0 mit
Namensnennung). Nur Lizenzen verwenden, die eine private Nutzung und eine spätere Veröffentlichung erlauben.

| Datei | Urheber | Quelle | Lizenz |
| --- | --- | --- | --- |
| – | – | – | – |
