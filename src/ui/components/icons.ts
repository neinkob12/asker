// Eigenes Icon-Set: 24×24-Raster, nur Linien (Strichstärke über die Komponente), runde Enden.
// Kein npm-Paket: So bleibt der Stil einheitlich, und es kommt keine Abhängigkeit dazu.
// Jedes Icon ist eine Liste von SVG-Pfaden. Punkte als 'M x y h.01' (runde Enden machen daraus einen Punkt).
// Neue Icons hier ergänzen; Module benutzen sie über <Icon name="…" /> bzw. als icon bei registerPhoneApp.

/** Kreis als Pfad (zwei Halbbögen). */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const n = (value: number) => Math.round(value * 100) / 100;

/** Wolke mit Unterkante bei y, Größe k (1 = volle Breite). */
const cloud = (y: number, k = 1) =>
  `M${n(11.4 - 4.5 * k)} ${y}h${n(10 * k)}a${n(4 * k)} ${n(4 * k)} 0 0 0 ${n(0.4 * k)} ${n(-7.98 * k)}` +
  `A${n(6 * k)} ${n(6 * k)} 0 0 0 ${n(11.4 - 5.7 * k)} ${n(y - 6.6 * k)}` +
  `A${n(3.7 * k)} ${n(3.7 * k)} 0 0 0 ${n(11.4 - 4.5 * k)} ${y}z`;

const sunRays = [
  'M12 2.5v2',
  'M12 19.5v2',
  'M2.5 12h2',
  'M19.5 12h2',
  'M5.3 5.3l1.4 1.4',
  'M17.3 17.3l1.4 1.4',
  'M5.3 18.7l1.4-1.4',
  'M17.3 6.7l1.4-1.4',
];

const speaker = 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z';

export const ICONS = {
  // Bedienung
  close: ['M6 6l12 12', 'M18 6L6 18'],
  back: ['M15 5l-7 7l7 7'],
  chevronRight: ['M9 5l7 7l-7 7'],
  chevronDown: ['M5 9l7 7l7-7'],
  chevronUp: ['M5 15l7-7l7 7'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  sliders: ['M4 7h9', 'M17 7h3', circle(15, 7, 2), 'M4 17h3', 'M11 17h9', circle(9, 17, 2)],
  info: [circle(12, 12, 9), 'M12 11v5', 'M12 8h.01'],
  alert: ['M10.3 4.6L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z', 'M12 9.5v4', 'M12 17h.01'],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z', 'M10 21h4'],
  lock: ['M6 11h12v9.5H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  trash: ['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l1 13h9l1-13'],
  save: ['M5 4h11l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  download: ['M12 4v11', 'M7.5 10.5L12 15l4.5-4.5', 'M5 19.5h14'],
  upload: ['M12 15V4', 'M7.5 8.5L12 4l4.5 4.5', 'M5 19.5h14'],
  arrowUp: ['M12 19V5', 'M6 11l6-6l6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6l6-6'],

  // Karte und Überwachung
  map: ['M3 6.5l6-2.5l6 2.5l6-2.5v13.5l-6 2.5l-6-2.5l-6 2.5z', 'M9 4v13.5', 'M15 6.5V20'],
  layers: ['M12 3l9 5l-9 5l-9-5z', 'M3 13l9 5l9-5'],
  cube: ['M12 2.8l8 4.6v9.2l-8 4.6l-8-4.6V7.4z', 'M4 7.4l8 4.6l8-4.6', 'M12 12v9.2'],
  topDown: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M9 9h6v6H9z'],
  target: [circle(12, 12, 7), 'M12 2v4', 'M12 18v4', 'M2 12h4', 'M18 12h4', 'M12 12h.01'],
  navigation: ['M12 3l6.5 17L12 16.5L5.5 20z'],
  pin: ['M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z', circle(12, 9.5, 2.5)],
  globe: [
    circle(12, 12, 9),
    'M3 12h18',
    'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9',
    'M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9',
  ],
  grid: ['M4 4h16v16H4z', 'M4 9.33h16', 'M4 14.67h16', 'M9.33 4v16', 'M14.67 4v16'],
  scan: [
    'M4 8V5a1 1 0 0 1 1-1h3',
    'M16 4h3a1 1 0 0 1 1 1v3',
    'M20 16v3a1 1 0 0 1-1 1h-3',
    'M8 20H5a1 1 0 0 1-1-1v-3',
    'M4 12h16',
  ],
  eye: ['M2.5 12S6 5.5 12 5.5S21.5 12 21.5 12S18 18.5 12 18.5S2.5 12 2.5 12z', circle(12, 12, 3)],
  cctv: ['M3 7.5l13-3.5l1.5 5.5l-13 3.5z', 'M17 7.5l3.5-1l1 3.5l-3.5 1', 'M8 12.2l1 3.8H4.5', 'M4.5 13.5v5'],

  // Ton
  volume: [speaker, 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
  volumeOff: [speaker, 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  music: ['M9 18V5.5l11-2v12.5', circle(6.5, 18, 2.5), circle(17.5, 16, 2.5)],
  play: ['M7 4.5v15l12.5-7.5z'],
  pause: ['M8 5v14', 'M16 5v14'],
  skip: ['M5 5l10 7l-10 7z', 'M19 5v14'],
  speed: ['M3.5 6l8 6l-8 6z', 'M12.5 6l8 6l-8 6z'],

  // Handy
  message: ['M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z'],
  phone: ['M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z', 'M11 18.5h2'],
  vibrate: [
    'M9 5h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    'M4.5 9v6',
    'M19.5 9v6',
    'M2 10.5v3',
    'M22 10.5v3',
  ],
  user: [circle(12, 8, 4), 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7'],
  users: [
    circle(9, 8, 3.5),
    'M2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6',
    'M16 4.8a3.5 3.5 0 0 1 0 6.4',
    'M18 14.3c2.1.7 3.5 2.6 3.5 5.7',
  ],
  signal: ['M4 18v-2', 'M8 18v-5', 'M12 18v-8', 'M16 18v-11'],
  wifi: ['M2.5 9a14 14 0 0 1 19 0', 'M5.5 12.5a9.5 9.5 0 0 1 13 0', 'M8.8 15.8a4.8 4.8 0 0 1 6.4 0', 'M12 19h.01'],
  battery: ['M3 8h15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M21.5 10.5v3', 'M5 12h9'],

  // Wetter und Tageszeit
  sun: [circle(12, 12, 4), ...sunRays],
  moon: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z'],
  cloud: [cloud(18.5)],
  rain: [cloud(14.5, 0.85), 'M8.5 17.5l-1 2.5', 'M12.5 17.5l-1 2.5', 'M16.5 17.5l-1 2.5'],
  storm: [cloud(14.5, 0.85), 'M12.5 14l-2.5 4h3.5l-2 4'],
  snow: [cloud(14.5, 0.85), 'M8 18h.01', 'M12 17.5h.01', 'M16 18h.01', 'M10 21h.01', 'M14 21h.01'],
  heat: [
    circle(12, 9.5, 3.5),
    'M12 2.5v1.5',
    'M5.5 9.5H4',
    'M20 9.5h-1.5',
    'M7.2 4.7l1 1',
    'M16.8 4.7l-1 1',
    'M4 17c1.3-1 2.7-1 4 0s2.7 1 4 0s2.7-1 4 0s2.7 1 4 0',
    'M6 20.5c1.3-1 2.7-1 4 0s2.7 1 4 0s2.7-1 4 0',
  ],
  thermometer: ['M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z', 'M12 9v7'],

  // Spiel
  money: ['M3 7h18v10H3z', circle(12, 12, 2.5), 'M6 10v4', 'M18 10v4'],
  euro: ['M16.5 7.5a5 5 0 1 0 0 9', 'M6.5 10.5h7', 'M6.5 13.5h6'],
  package: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5l8-4.5', 'M12 12v9', 'M8 5.25l8 4.5'],
  leaf: ['M12 21v-6', 'M12 15c-4-1-7-4.5-7-10c4 .5 6.5 3 7 7c.5-4 3-6.5 7-7c0 5.5-3 9-7 10z'],
  truck: ['M2.5 6.5h11v9.5h-11z', 'M13.5 10h4l3 3v3h-7', circle(7, 17.5, 1.8), circle(17, 17.5, 1.8)],
  car: [
    'M3.5 13.5l2-5.5h13l2 5.5v4h-17z',
    'M3.5 13.5h17',
    'M6.5 17.5v2',
    'M17.5 17.5v2',
    'M7 15.5h.01',
    'M17 15.5h.01',
  ],
  shield: [
    'M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5c-4.3-1.3-7.5-4.9-7.5-9.5V6z',
    'M12 8.5l1.1 2.2l2.4.35l-1.75 1.7l.4 2.4L12 14l-2.15 1.15l.4-2.4l-1.75-1.7l2.4-.35z',
  ],
  siren: ['M6 18v-5a6 6 0 0 1 12 0v5', 'M4 18h16v3H4z', 'M12 3v2', 'M4.2 6.2l1.4 1.4', 'M19.8 6.2l-1.4 1.4'],
  flame: [
    'M12 21c-3.9 0-7-2.8-7-6.5c0-3.2 2.3-5 3.5-7.5c.8 1.7 1.8 2.6 3 3c-.4-2.8.6-5.5 3-7c.3 3 4.5 5.4 4.5 11c0 3.9-3.1 7-7 7z',
  ],
  skull: [
    'M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.5 3 5.6V20h10v-3.4c1.7-1.1 3-3 3-5.6a8 8 0 0 0-8-8z',
    circle(9, 11, 1.5),
    circle(15, 11, 1.5),
    'M10.5 20v-2',
    'M13.5 20v-2',
  ],
  crown: ['M3.5 8l4.5 4l4-7l4 7l4.5-4l-2 10.5h-13z'],
  bolt: ['M13 2.5L5 13.5h6l-1 8l8-11h-6z'],
  star: ['M12 3.5l2.6 5.3l5.9.85l-4.25 4.15l1 5.85L12 16.9l-5.25 2.75l1-5.85L3.5 9.65l5.9-.85z'],
  flag: ['M5 21V4', 'M5 4.5h12l-2.5 4l2.5 4H5'],
  clock: [circle(12, 12, 9), 'M12 7v5l3.5 2'],
  calendar: ['M4 5.5h16v15H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  briefcase: ['M4 7.5h16v11.5H4z', 'M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M4 12.5h16'],
  home: ['M4 10.5L12 4l8 6.5V20H4z', 'M10 20v-6h4v6'],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICONS, name);
}
