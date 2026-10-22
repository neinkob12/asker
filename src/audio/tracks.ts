// Musik-Playlist: selbst erzeugte Stücke (Noten und Klangfarben hier, Klang aus synth.ts), je Stimmung.
// Später können echte Dateien dazukommen: einen Eintrag mit src (URL in public/audio/music/) anlegen.
// Lizenz: Die Stücke sind Teil des Codes dieses Projekts (siehe public/audio/LIZENZEN.md).

export type MusicMood = 'night' | 'dawn' | 'day' | 'dusk';

export type Layer = 'pad' | 'keys' | 'bass' | 'drums' | 'hats' | 'arp';

export interface Section {
  bars: number;
  layers: Layer[];
}

/** four: gerade Kick auf jedem Viertel (Techno, House), dub: langsam, Kick auf 1 und 3, Rimshot, viel Raum. */
export type DrumStyle = 'halftime' | 'boombap' | 'minimal' | 'four' | 'dub';

export interface Track {
  id: string;
  title: string;
  moods: MusicMood[];
  bpm: number;
  /** Grundton als MIDI-Note (z.B. 45 = A2). */
  root: number;
  /** Akkorde als [Halbtöne über dem Grundton, Akkordtyp], je ein Takt. */
  progression: [number, ChordType][];
  sections: Section[];
  drums: DrumStyle;
  /**
   * Städte, in denen das Stück läuft (Auftrag 51, Charakter der Städte: Kennungen wie im Modul city). Ohne Angabe
   * überall. Hat die aktive Stadt eigene Stücke, laufen nur diese und die ohne Angabe.
   */
  cities?: string[];
  /** Swing 0–0.3 (verschiebt jede zweite Sechzehntel). */
  swing: number;
  /** Klangfarbe: Filter der Flächen in Hz (dunkel ↔ hell). */
  brightness: number;
  /**
   * Datei statt Synthese (optional, für echte Musik später), z.B. 'audio/music/rheinufer.ogg'.
   * Dann reichen id, title und moods; die übrigen Felder werden nicht benutzt (sections: []).
   */
  src?: string;
}

export type ChordType = 'min' | 'maj' | 'min7' | 'maj7' | 'sus2' | 'dom7';

export const CHORD_INTERVALS: Record<ChordType, number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  dom7: [0, 4, 7, 10],
};

const intro: Section = { bars: 4, layers: ['pad'] };
const outro: Section = { bars: 4, layers: ['pad', 'arp'] };

export const TRACKS: Track[] = [
  {
    id: 'ringe-bei-nacht',
    cities: ['koeln'],
    title: 'Ringe bei Nacht',
    moods: ['night'],
    bpm: 76,
    root: 45,
    progression: [
      [0, 'min'],
      [8, 'maj'],
      [3, 'maj'],
      [10, 'maj'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'bass', 'hats'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'halftime',
    swing: 0.05,
    brightness: 900,
  },
  {
    id: 'spaeti-um-vier',
    cities: ['berlin'],
    title: 'Späti um vier',
    moods: ['night'],
    bpm: 70,
    root: 43,
    progression: [
      [0, 'min7'],
      [5, 'min7'],
      [3, 'maj7'],
      [10, 'sus2'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'minimal',
    swing: 0.12,
    brightness: 750,
  },
  {
    id: 'blaulicht',
    cities: ['koeln'],
    title: 'Blaulicht über Kalk',
    moods: ['night', 'dusk'],
    bpm: 84,
    root: 40,
    progression: [
      [0, 'min'],
      [1, 'maj'],
      [0, 'min'],
      [10, 'maj'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'bass', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'bass'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'halftime',
    swing: 0,
    brightness: 1100,
  },
  {
    id: 'rheinnebel',
    cities: ['koeln'],
    title: 'Rheinnebel',
    moods: ['dawn', 'night'],
    bpm: 72,
    root: 50,
    progression: [
      [0, 'sus2'],
      [5, 'maj7'],
      [9, 'min7'],
      [7, 'sus2'],
    ],
    sections: [
      { bars: 8, layers: ['pad'] },
      { bars: 16, layers: ['pad', 'arp', 'bass'] },
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'arp', 'bass', 'hats'] },
      outro,
    ],
    drums: 'minimal',
    swing: 0.08,
    brightness: 1300,
  },
  {
    id: 'muelheimer-bruecke',
    cities: ['koeln'],
    title: 'Mülheimer Brücke',
    moods: ['dusk', 'dawn'],
    bpm: 82,
    root: 47,
    progression: [
      [0, 'min7'],
      [8, 'maj7'],
      [5, 'min7'],
      [7, 'min7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys', 'hats'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'arp'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'boombap',
    swing: 0.14,
    brightness: 1500,
  },
  {
    id: 'sonnendeck-deutz',
    cities: ['koeln'],
    title: 'Sonnendeck Deutz',
    moods: ['day'],
    bpm: 90,
    root: 48,
    progression: [
      [2, 'min7'],
      [7, 'dom7'],
      [0, 'maj7'],
      [9, 'min7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['keys', 'hats'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass', 'arp'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'boombap',
    swing: 0.18,
    brightness: 2200,
  },
  {
    id: 'stadtgarten',
    cities: ['koeln'],
    title: 'Stadtgarten',
    moods: ['day', 'dusk'],
    bpm: 94,
    root: 45,
    progression: [
      [0, 'min7'],
      [5, 'min7'],
      [10, 'dom7'],
      [3, 'maj7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys', 'drums'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'boombap',
    swing: 0.16,
    brightness: 2000,
  },
  {
    id: 'veedel-schlaeft-nie',
    cities: ['koeln'],
    title: 'Veedel schläft nie',
    moods: ['night', 'dusk'],
    bpm: 80,
    root: 42,
    progression: [
      [0, 'min'],
      [10, 'maj'],
      [8, 'maj'],
      [7, 'min'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'bass', 'hats'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'arp'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'halftime',
    swing: 0.06,
    brightness: 950,
  },
  // Stücke der anderen Städte (Auftrag 51): Hamburg Dub und Nebel, Berlin Techno, München hell und edel, Frankfurt
  // kühler House.
  {
    id: 'elbnebel',
    title: 'Elbnebel',
    cities: ['hamburg'],
    moods: ['dawn', 'night'],
    bpm: 68,
    root: 38,
    progression: [
      [0, 'min7'],
      [5, 'min7'],
      [0, 'min7'],
      [7, 'min'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'bass'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'dub',
    swing: 0.05,
    brightness: 650,
  },
  {
    id: 'landungsbruecken',
    title: 'Landungsbrücken',
    cities: ['hamburg'],
    moods: ['day', 'dusk'],
    bpm: 80,
    root: 43,
    progression: [
      [0, 'min7'],
      [3, 'maj7'],
      [8, 'maj7'],
      [10, 'dom7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'boombap',
    swing: 0.1,
    brightness: 1000,
  },
  {
    id: 'kiez-um-drei',
    title: 'Kiez um drei',
    cities: ['hamburg'],
    moods: ['night', 'dusk'],
    bpm: 74,
    root: 41,
    progression: [
      [0, 'min'],
      [8, 'maj'],
      [10, 'maj'],
      [5, 'min'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'bass', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'bass'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'dub',
    swing: 0.04,
    brightness: 850,
  },
  {
    id: 'warschauer-bruecke',
    title: 'Warschauer Brücke',
    cities: ['berlin'],
    moods: ['night', 'dusk'],
    bpm: 126,
    root: 45,
    progression: [
      [0, 'min'],
      [0, 'min'],
      [3, 'maj'],
      [10, 'maj'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'drums', 'hats'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'hats', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'four',
    swing: 0,
    brightness: 1300,
  },
  {
    id: 'beton',
    title: 'Beton',
    cities: ['berlin'],
    moods: ['day', 'dusk'],
    bpm: 122,
    root: 40,
    progression: [
      [0, 'min7'],
      [0, 'min7'],
      [5, 'min7'],
      [7, 'min'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'drums', 'hats'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'hats', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'four',
    swing: 0,
    brightness: 1050,
  },
  {
    id: 'montagmorgen',
    title: 'Montagmorgen',
    cities: ['berlin'],
    moods: ['dawn', 'day'],
    bpm: 96,
    root: 47,
    progression: [
      [0, 'sus2'],
      [5, 'sus2'],
      [3, 'maj7'],
      [10, 'sus2'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'minimal',
    swing: 0.08,
    brightness: 900,
  },
  {
    id: 'isarauen',
    title: 'Isarauen',
    cities: ['muenchen'],
    moods: ['day', 'dawn'],
    bpm: 86,
    root: 48,
    progression: [
      [0, 'maj7'],
      [5, 'maj7'],
      [9, 'min7'],
      [7, 'sus2'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'boombap',
    swing: 0.08,
    brightness: 1400,
  },
  {
    id: 'maximilianstrasse',
    title: 'Maximilianstraße',
    cities: ['muenchen'],
    moods: ['dusk', 'night'],
    bpm: 78,
    root: 45,
    progression: [
      [0, 'min7'],
      [5, 'dom7'],
      [3, 'maj7'],
      [8, 'maj7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'halftime',
    swing: 0.1,
    brightness: 1100,
  },
  {
    id: 'foehn',
    title: 'Föhn',
    cities: ['muenchen'],
    moods: ['dawn', 'day'],
    bpm: 92,
    root: 50,
    progression: [
      [0, 'sus2'],
      [7, 'sus2'],
      [5, 'maj7'],
      [0, 'maj7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'minimal',
    swing: 0.06,
    brightness: 1500,
  },
  {
    id: 'schwabing-nachts',
    title: 'Schwabing nachts',
    cities: ['muenchen'],
    moods: ['night'],
    bpm: 72,
    root: 43,
    progression: [
      [0, 'min7'],
      [8, 'maj7'],
      [3, 'maj7'],
      [10, 'sus2'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'keys'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      { bars: 8, layers: ['keys', 'bass'] },
      { bars: 16, layers: ['pad', 'keys', 'bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'minimal',
    swing: 0.1,
    brightness: 800,
  },
  {
    id: 'mainhattan',
    title: 'Mainhattan',
    cities: ['frankfurt'],
    moods: ['night', 'dusk'],
    bpm: 122,
    root: 43,
    progression: [
      [0, 'min7'],
      [5, 'min7'],
      [10, 'maj7'],
      [3, 'maj7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'drums', 'hats'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'hats', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'four',
    swing: 0.04,
    brightness: 1250,
  },
  {
    id: 'bahnhofsviertel',
    title: 'Bahnhofsviertel',
    cities: ['frankfurt'],
    moods: ['night'],
    bpm: 84,
    root: 40,
    progression: [
      [0, 'min'],
      [1, 'maj'],
      [0, 'min'],
      [8, 'maj'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'bass', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'bass'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      outro,
    ],
    drums: 'halftime',
    swing: 0,
    brightness: 900,
  },
  {
    id: 'kursrutsch',
    title: 'Kursrutsch',
    cities: ['frankfurt'],
    moods: ['day', 'dawn'],
    bpm: 116,
    root: 47,
    progression: [
      [0, 'min7'],
      [7, 'min7'],
      [5, 'maj7'],
      [3, 'maj7'],
    ],
    sections: [
      intro,
      { bars: 8, layers: ['pad', 'drums', 'hats'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['pad', 'hats', 'arp'] },
      { bars: 16, layers: ['pad', 'bass', 'drums', 'hats', 'arp'] },
      { bars: 8, layers: ['bass', 'drums', 'hats'] },
      outro,
    ],
    drums: 'four',
    swing: 0.02,
    brightness: 1200,
  },
];

/** Länge eines Stücks in Sekunden. */
export function trackDuration(track: Track): number {
  const bars = track.sections.reduce((sum, s) => sum + s.bars, 0);
  return (bars * 4 * 60) / track.bpm;
}

/** Benachbarte Tageszeiten: Passt kein Stück genau, darf eines aus der Nachbarschaft laufen. */
export const MOOD_NEIGHBORS: Record<MusicMood, MusicMood[]> = {
  night: ['dusk', 'dawn'],
  dawn: ['night', 'day'],
  day: ['dawn', 'dusk'],
  dusk: ['day', 'night'],
};

/**
 * Stücke, die in einer Stadt laufen dürfen (Auftrag 51): Hat die Stadt eigene, diese und die ohne Stadt; sonst alle
 * (Orte ohne eigene Musik, z.B. Rotterdam).
 */
export function tracksForCity(tracks: readonly Track[], city: string | null): readonly Track[] {
  if (!city) return tracks;
  const own = tracks.filter((t) => t.cities?.includes(city));
  return own.length > 0 ? [...own, ...tracks.filter((t) => !t.cities)] : tracks;
}

/** Passt ein Stück zur Stadt (läuft es dort überhaupt)? */
export function trackFitsCity(tracks: readonly Track[], track: Track, city: string | null): boolean {
  return tracksForCity(tracks, city).includes(track);
}

/**
 * Nächstes Stück für eine Stimmung (und Stadt). Wiederholt die letzten Stücke nicht, solange es andere gibt.
 * random = Zufallsquelle 0–1 (Musik ist reine Optik, Math.random ist hier erlaubt; Tests geben eine feste).
 */
export function pickTrack(
  tracks: readonly Track[],
  mood: MusicMood,
  recent: readonly string[],
  random: () => number,
  city: string | null = null,
): Track {
  const local = tracksForCity(tracks, city);
  const fitting = local.filter((t) => t.moods.includes(mood));
  const near = local.filter((t) => t.moods.some((m) => MOOD_NEIGHBORS[mood].includes(m)));
  const pool = fitting.length > 0 ? fitting : near.length > 0 ? near : [...local];
  const fresh = pool.filter((t) => !recent.includes(t.id));
  const choices = fresh.length > 0 ? fresh : pool.filter((t) => t.id !== recent[recent.length - 1]);
  const list = choices.length > 0 ? choices : pool;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}
