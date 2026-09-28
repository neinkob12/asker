// Musik-Playlist: selbst erzeugte Stücke (Noten und Klangfarben hier, Klang aus synth.ts), je Stimmung.
// Später können echte Dateien dazukommen: einen Eintrag mit src (URL in public/audio/music/) anlegen.
// Lizenz: Die Stücke sind Teil des Codes dieses Projekts (siehe public/audio/LIZENZEN.md).

export type MusicMood = 'night' | 'dawn' | 'day' | 'dusk';

export type Layer = 'pad' | 'keys' | 'bass' | 'drums' | 'hats' | 'arp';

export interface Section {
  bars: number;
  layers: Layer[];
}

export type DrumStyle = 'halftime' | 'boombap' | 'minimal';

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
];

/** Länge eines Stücks in Sekunden. */
export function trackDuration(track: Track): number {
  const bars = track.sections.reduce((sum, s) => sum + s.bars, 0);
  return (bars * 4 * 60) / track.bpm;
}

/**
 * Nächstes Stück für eine Stimmung. Wiederholt die letzten Stücke nicht, solange es andere gibt.
 * random = Zufallsquelle 0–1 (Musik ist reine Optik, Math.random ist hier erlaubt; Tests geben eine feste).
 */
export function pickTrack(
  tracks: readonly Track[],
  mood: MusicMood,
  recent: readonly string[],
  random: () => number,
): Track {
  const fitting = tracks.filter((t) => t.moods.includes(mood));
  const pool = fitting.length > 0 ? fitting : [...tracks];
  const fresh = pool.filter((t) => !recent.includes(t.id));
  const choices = fresh.length > 0 ? fresh : pool.filter((t) => t.id !== recent[recent.length - 1]);
  const list = choices.length > 0 ? choices : pool;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}
