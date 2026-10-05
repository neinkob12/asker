// Wahrzeichen als einfache 3D-Klötze (fill-extrusion, gestapelt, Toon-Farben), damit man sich ohne
// Straßennamen zurechtfindet. Köln: Kölner Dom, Hohenzollernbrücke, Colonius, Kranhäuser, KölnTriangle. Hamburg
// (Auftrag 31): Elbphilharmonie, Michel, Heinrich-Hertz-Turm, Köhlbrandbrücke, Landungsbrücken, Elbbrücken; Lage und
// Ausrichtung aus Overture Maps (Gebäude, Straßen über Wasser, Infrastruktur, ODbL). Berlin (Auftrag 37): Fernsehturm,
// Brandenburger Tor, Oberbaumbrücke.
// Echte Koordinaten, ungefähre Maße in Metern. Jedes Teil ist ein Grundriss im lokalen Rahmen des Bauwerks
// (forward entlang der Achse, left quer dazu) mit Unter- und Oberkante.
// Die echten OSM-Gebäude an diesen Stellen blendet die Grundkarte aus (LANDMARK_ZONES), sonst stecken zwei
// Modelle ineinander.

import type { LngLat } from '../core';
import { offsetMeters } from './geometry';
import { mixColor } from './look';

type Point = readonly [number, number];

interface Part {
  ring: readonly Point[];
  base: number;
  height: number;
  /** Farbschlüssel des Bauwerks. */
  color: string;
}

export interface Landmark {
  id: string;
  name: string;
  /** Stadt, zu der das Wahrzeichen gehört (Kennung wie im Modul city, Auftrag 30). */
  city: 'koeln' | 'hamburg' | 'berlin';
  center: LngLat;
  /** Richtung der lokalen forward-Achse (Kompass). */
  heading: number;
  /** Farben je Schlüssel: [Tag, Nacht]. */
  colors: Record<string, readonly [string, string]>;
  parts: Part[];
  /** Bereich, in dem echte Gebäude ausgeblendet werden (lokal: forward von/bis, left von/bis). */
  zone: readonly [number, number, number, number];
}

const rect = (f0: number, l0: number, f1: number, l1: number): Point[] => [
  [f0, l0],
  [f1, l0],
  [f1, l1],
  [f0, l1],
];

/** Vieleck um einen Mittelpunkt (8 Ecken wirken rund genug für Türme). */
function ngon(cf: number, cl: number, radius: number, corners = 8, rotation = Math.PI / 8): Point[] {
  const ring: Point[] = [];
  for (let i = 0; i < corners; i++) {
    const a = rotation + (i / corners) * 2 * Math.PI;
    ring.push([cf + radius * Math.cos(a), cl + radius * Math.sin(a)]);
  }
  return ring;
}

/** Abgerundetes Dreieck (Reuleaux-Dreieck), Breite ≈ width. */
function roundedTriangle(width: number, stepsPerArc = 6): Point[] {
  const r = width;
  const corners = [0, 1, 2].map((i) => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return [(width / Math.sqrt(3)) * Math.cos(a), (width / Math.sqrt(3)) * Math.sin(a)] as const;
  });
  const ring: Point[] = [];
  for (let i = 0; i < 3; i++) {
    // Bogen um die gegenüberliegende Ecke von Ecke i+1 nach Ecke i+2.
    const c = corners[i];
    const from = corners[(i + 1) % 3];
    const to = corners[(i + 2) % 3];
    const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    let a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
    if (a1 < a0) a1 += 2 * Math.PI;
    for (let s = 0; s < stepsPerArc; s++) {
      const a = a0 + ((a1 - a0) * s) / stepsPerArc;
      ring.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
  }
  return ring;
}

const part = (ring: Point[], base: number, height: number, color: string): Part => ({ ring, base, height, color });

function dom(): Landmark {
  const parts: Part[] = [];
  // Westfassade mit zwei Türmen (je 25 × 25 m, 157 m), die sich nach oben absetzen.
  for (const side of [-1, 1]) {
    const l = side * 18;
    parts.push(
      part(rect(-72, l - 12.5, -44, l + 12.5), 0, 58, 'stone'),
      part(rect(-70, l - 10.5, -46, l + 10.5), 58, 98, 'stone'),
      part(ngon(-58, l, 9), 98, 122, 'stone'),
      part(ngon(-58, l, 5.5), 122, 149, 'spire'),
      part(ngon(-58, l, 2.2), 149, 157, 'gold'),
    );
  }
  parts.push(part(rect(-72, -5.5, -44, 5.5), 0, 46, 'stone'));
  // Langhaus, Querhaus und Chor: Seitenschiffe, Obergaden, steiles Dach.
  parts.push(
    part(rect(-44, -22.5, 60, 22.5), 0, 30, 'stone'),
    part(rect(-44, -9, 62, 9), 30, 45, 'stone'),
    part(rect(-44, -5, 63, 5), 45, 61, 'roof'),
    part(rect(-3, -43, 22, 43), 0, 30, 'stone'),
    part(rect(1, -40, 18, 40), 30, 45, 'stone'),
    part(rect(4, -38, 15, 38), 45, 61, 'roof'),
    // Chorumgang (halbrund) am Ostende.
    part(ngon(58, 0, 22.5), 0, 30, 'stone'),
    part(ngon(58, 0, 12), 30, 45, 'stone'),
    // Dachreiter über der Vierung.
    part(ngon(9.5, 0, 4.5), 61, 96, 'spire'),
    part(ngon(9.5, 0, 1.8), 96, 109, 'gold'),
  );
  return {
    id: 'dom',
    name: 'Kölner Dom',
    city: 'koeln',
    center: { lng: 6.95855, lat: 50.94128 },
    heading: 90,
    colors: {
      stone: ['#7d8088', '#3a3d44'],
      roof: ['#5f636b', '#2c2f35'],
      spire: ['#6c7078', '#33363c'],
      gold: ['#c9a25a', '#e2ae4a'],
    },
    parts,
    zone: [-80, -50, 84, 50],
  };
}

function hohenzollernBridge(): Landmark {
  const parts: Part[] = [];
  const deckBase = 9;
  const deckTop = 13;
  parts.push(part(rect(-205, -15, 205, 15), deckBase, deckTop, 'deck'));
  for (const f of [-205, -80, 80, 205]) parts.push(part(rect(f - 7, -16, f + 7, 16), 0, deckTop, 'pier'));
  // Drei Bogenfelder, je drei Bogenreihen nebeneinander, als Treppe aus kleinen Klötzen.
  const spans: [number, number, number][] = [
    [-205, -80, 26],
    [-80, 80, 32],
    [80, 205, 26],
  ];
  const segments = 9;
  for (const [a, b, rise] of spans) {
    for (const l of [-12.5, 0, 12.5]) {
      for (let i = 0; i < segments; i++) {
        const u0 = i / segments;
        const u1 = (i + 1) / segments;
        const u = (u0 + u1) / 2;
        const top = deckTop + rise * 4 * u * (1 - u);
        parts.push(part(rect(a + (b - a) * u0, l - 2.2, a + (b - a) * u1, l + 2.2), top - 4.5, top, 'steel'));
      }
    }
  }
  return {
    id: 'hohenzollernbruecke',
    name: 'Hohenzollernbrücke',
    city: 'koeln',
    center: { lng: 6.9652, lat: 50.9413 },
    heading: 103,
    colors: {
      steel: ['#6f8a86', '#3f5553'],
      deck: ['#5d6a6b', '#2e3638'],
      pier: ['#6b6e76', '#34363c'],
    },
    parts,
    zone: [-215, -24, 215, 24],
  };
}

function colonius(): Landmark {
  return {
    id: 'colonius',
    name: 'Colonius',
    city: 'koeln',
    center: { lng: 6.92945, lat: 50.94675 },
    heading: 0,
    colors: {
      shaft: ['#8e939b', '#3c4047'],
      cabin: ['#9a7f7f', '#b0646a'],
      antenna: ['#b0585e', '#e5484d'],
    },
    parts: [
      part(ngon(0, 0, 14), 0, 8, 'shaft'),
      part(ngon(0, 0, 7), 8, 160, 'shaft'),
      part(ngon(0, 0, 14), 160, 166, 'cabin'),
      part(ngon(0, 0, 21), 166, 182, 'cabin'),
      part(ngon(0, 0, 15), 182, 190, 'shaft'),
      part(ngon(0, 0, 5), 190, 220, 'shaft'),
      part(ngon(0, 0, 2), 220, 266, 'antenna'),
    ],
    zone: [-24, -24, 24, 24],
  };
}

/** Kranhaus: senkrechter Fuß an Land, waagerechter Ausleger oben Richtung Rhein. */
function kranhaus(id: string, name: string, center: LngLat): Landmark {
  return {
    id,
    name,
    city: 'koeln',
    center,
    heading: 75,
    colors: {
      glass: ['#5e7a93', '#2d4152'],
      arm: ['#6a8aa6', '#3a5a7a'],
    },
    parts: [part(rect(-35, -15, -11, 15), 0, 46, 'glass'), part(rect(-35, -15, 35, 15), 46, 62, 'arm')],
    zone: [-42, -22, 42, 22],
  };
}

function koelnTriangle(): Landmark {
  return {
    id: 'koelntriangle',
    name: 'KölnTriangle',
    city: 'koeln',
    center: { lng: 6.97095, lat: 50.93965 },
    heading: 20,
    colors: {
      body: ['#6d7e8c', '#303a44'],
      crown: ['#b99a5e', '#e2ae4a'],
    },
    parts: [part(roundedTriangle(38), 0, 96, 'body'), part(roundedTriangle(30), 96, 103, 'crown')],
    zone: [-28, -28, 28, 28],
  };
}

// --- Hamburg -----------------------------------------------------------------------------------------------------

/** Elbphilharmonie: Kaispeicher aus Backstein (37 m), darauf der Glasbau mit welligem Dach bis 110 m. */
function elbphilharmonie(): Landmark {
  // Trapez auf der Kaispitze: schmal im Westen, breit im Osten (forward = Osten).
  const base: Point[] = [
    [-54, -16],
    [54, -40],
    [54, 40],
    [-54, 16],
  ];
  const inset: Point[] = [
    [-52, -14],
    [52, -37],
    [52, 37],
    [-52, 14],
  ];
  return {
    id: 'elbphilharmonie',
    name: 'Elbphilharmonie',
    city: 'hamburg',
    center: { lng: 9.98425, lat: 53.54133 },
    heading: 86,
    colors: {
      brick: ['#7a5a52', '#3d2c28'],
      glass: ['#8fa3b5', '#4a5e72'],
      crown: ['#b8c6d3', '#e2ae4a'],
    },
    parts: [
      part(base, 0, 37, 'brick'),
      part(inset, 37, 94, 'glass'),
      // Welliges Dach: vier Kuppen unterschiedlicher Höhe.
      part(rect(-52, -12, -24, 12), 94, 102, 'crown'),
      part(rect(-24, -18, 4, 18), 94, 110, 'crown'),
      part(rect(4, -22, 30, 22), 94, 104, 'crown'),
      part(rect(30, -26, 52, 26), 94, 108, 'crown'),
    ],
    zone: [-60, -44, 60, 44],
  };
}

/** Hauptkirche St. Michaelis ("Michel"): Kirchenschiff und Turm im Westen (132 m) mit grüner Haube. */
function michel(): Landmark {
  return {
    id: 'michel',
    name: 'Michel',
    city: 'hamburg',
    center: { lng: 9.97892, lat: 53.5484 },
    // forward zeigt nach Westnordwest, dort steht der Turm.
    heading: 293,
    colors: {
      brick: ['#8a6a5a', '#40312a'],
      roof: ['#5b7f6e', '#2b3d35'],
      copper: ['#6f9c86', '#35503f'],
      gold: ['#c9a25a', '#e2ae4a'],
    },
    parts: [
      part(rect(-36, -24, 26, 24), 0, 26, 'brick'),
      part(rect(-34, -12, 24, 12), 26, 40, 'roof'),
      part(rect(26, -8, 40, 8), 0, 72, 'brick'),
      part(ngon(33, 0, 7), 72, 96, 'copper'),
      part(ngon(33, 0, 4), 96, 124, 'copper'),
      part(ngon(33, 0, 1.6), 124, 132, 'gold'),
    ],
    zone: [-44, -30, 46, 30],
  };
}

/** Heinrich-Hertz-Turm (Fernsehturm, 279 m) neben den Messehallen. */
function heinrichHertzTurm(): Landmark {
  return {
    id: 'heinrich-hertz-turm',
    name: 'Heinrich-Hertz-Turm',
    city: 'hamburg',
    center: { lng: 9.97581, lat: 53.56313 },
    heading: 0,
    colors: {
      shaft: ['#8e939b', '#3c4047'],
      cabin: ['#9aa3ad', '#b0646a'],
      antenna: ['#b0585e', '#e5484d'],
    },
    parts: [
      part(ngon(0, 0, 12), 0, 10, 'shaft'),
      part(ngon(0, 0, 7), 10, 200, 'shaft'),
      part(ngon(0, 0, 17), 200, 206, 'cabin'),
      part(ngon(0, 0, 13), 206, 214, 'cabin'),
      part(ngon(0, 0, 17), 214, 220, 'cabin'),
      part(ngon(0, 0, 5), 220, 232, 'shaft'),
      part(ngon(0, 0, 2), 232, 279, 'antenna'),
    ],
    zone: [-20, -20, 20, 20],
  };
}

/** Köhlbrandbrücke: Schrägseilbrücke über den Köhlbrand, Hauptfeld 325 m, Pylone 135 m, Rampen zu beiden Seiten. */
function koehlbrandbruecke(): Landmark {
  const parts: Part[] = [];
  // Deck in Stufen: in der Mitte 53 m über dem Wasser, zu den Enden hin tiefer.
  const steps: [number, number, number][] = [
    [-260, 260, 53],
    [260, 380, 46],
    [380, 500, 36],
    [500, 620, 24],
    [620, 740, 12],
  ];
  for (const [a, b, top] of steps) {
    parts.push(part(rect(a, -11, b, 11), top - 4, top, 'deck'));
    if (a > 0) parts.push(part(rect(-b, -11, -a, 11), top - 4, top, 'deck'));
  }
  for (const f of [-162, 162]) {
    for (const l of [-13, 13]) parts.push(part(rect(f - 3, l - 2.5, f + 3, l + 2.5), 0, 135, 'pylon'));
    parts.push(part(rect(f - 3, -13, f + 3, 13), 118, 124, 'pylon'));
    // Seile als dünne, schräg gestufte Leisten zur Brückenmitte und nach außen.
    for (const dir of [-1, 1]) {
      for (let i = 1; i <= 4; i++) {
        const along = f + dir * i * 30;
        const height = 135 - i * 18;
        parts.push(
          part(
            rect(Math.min(along, along + dir * 6), -12, Math.max(along, along + dir * 6), 12),
            height - 1.2,
            height,
            'cable',
          ),
        );
      }
    }
  }
  return {
    id: 'koehlbrandbruecke',
    name: 'Köhlbrandbrücke',
    city: 'hamburg',
    center: { lng: 9.93022, lat: 53.52157 },
    heading: 48,
    colors: {
      deck: ['#6d7378', '#33373b'],
      pylon: ['#9aa0a6', '#454a50'],
      cable: ['#b4b9be', '#5a6066'],
    },
    parts,
    zone: [-750, -18, 750, 18],
  };
}

/** St. Pauli Landungsbrücken: lange Halle am Wasser mit Uhrturm und Pegelturm im Osten. */
function landungsbruecken(): Landmark {
  return {
    id: 'landungsbruecken',
    name: 'Landungsbrücken',
    city: 'hamburg',
    center: { lng: 9.96871, lat: 53.54564 },
    // forward zeigt nach Westen, die Türme stehen am Ostende.
    heading: 275,
    colors: {
      stone: ['#8c867c', '#3f3c37'],
      roof: ['#5b7f6e', '#2b3d35'],
      gold: ['#c9a25a', '#e2ae4a'],
    },
    parts: [
      part(rect(-103, -13, 103, 13), 0, 12, 'stone'),
      part(rect(-101, -9, 101, 9), 12, 16, 'roof'),
      part(rect(-102, -6, -86, 6), 0, 30, 'stone'),
      part(ngon(-94, 0, 4.5), 30, 38, 'roof'),
      part(ngon(-94, 0, 1.2), 38, 41, 'gold'),
      part(ngon(-62, 0, 5), 12, 24, 'roof'),
      // Pontons auf dem Wasser davor
      part(rect(-96, 16, 96, 26), 0, 1.6, 'stone'),
    ],
    zone: [-108, -16, 108, 16],
  };
}

/** Elbbrücken: Straßen- und Bahnbrücken über die Norderelbe mit linsenförmigen Bögen. */
function elbbruecken(): Landmark {
  const parts: Part[] = [];
  const deckBase = 8;
  const deckTop = 11;
  parts.push(part(rect(-160, -26, 160, 26), deckBase, deckTop, 'deck'));
  for (const f of [-160, -55, 55, 160]) parts.push(part(rect(f - 5, -27, f + 5, 27), 0, deckTop, 'pier'));
  const spans: [number, number][] = [
    [-160, -55],
    [-55, 55],
    [55, 160],
  ];
  const segments = 8;
  for (const [a, b] of spans) {
    for (const l of [-20, -6, 6, 20]) {
      for (let i = 0; i < segments; i++) {
        const u0 = i / segments;
        const u1 = (i + 1) / segments;
        const u = (u0 + u1) / 2;
        const top = deckTop + 20 * 4 * u * (1 - u);
        parts.push(part(rect(a + (b - a) * u0, l - 1.8, a + (b - a) * u1, l + 1.8), top - 3, top, 'steel'));
      }
    }
  }
  return {
    id: 'elbbruecken',
    name: 'Elbbrücken',
    city: 'hamburg',
    center: { lng: 10.02169, lat: 53.5332 },
    heading: 28,
    colors: {
      steel: ['#6f8a86', '#3f5553'],
      deck: ['#5d6a6b', '#2e3638'],
      pier: ['#6b6e76', '#34363c'],
    },
    parts,
    zone: [-170, -32, 170, 32],
  };
}

/** Berliner Fernsehturm (368 m): Schaft, Kugel mit Aussichtsgeschoss in 200 bis 237 m, rot-weiße Antenne. */
function fernsehturm(): Landmark {
  return {
    id: 'fernsehturm',
    name: 'Fernsehturm',
    city: 'berlin',
    center: { lng: 13.40942, lat: 52.52082 },
    heading: 0,
    colors: {
      shaft: ['#9a9ea6', '#40444b'],
      ball: ['#b4bcc6', '#c9a25a'],
      antenna: ['#b0585e', '#e5484d'],
      base: ['#7e828a', '#36393f'],
    },
    parts: [
      // Pavillon am Fuß (die gefalteten Dächer als flache Ringe).
      part(ngon(0, 0, 34, 12), 0, 8, 'base'),
      part(ngon(0, 0, 16), 8, 30, 'shaft'),
      part(ngon(0, 0, 12), 30, 120, 'shaft'),
      part(ngon(0, 0, 9), 120, 196, 'shaft'),
      // Kugel aus Ringen: breiter in der Mitte.
      part(ngon(0, 0, 11, 12), 196, 202, 'ball'),
      part(ngon(0, 0, 15, 12), 202, 210, 'ball'),
      part(ngon(0, 0, 16.5, 12), 210, 226, 'ball'),
      part(ngon(0, 0, 15, 12), 226, 234, 'ball'),
      part(ngon(0, 0, 10, 12), 234, 240, 'ball'),
      part(ngon(0, 0, 5), 240, 250, 'shaft'),
      part(ngon(0, 0, 2.2), 250, 368, 'antenna'),
    ],
    zone: [-36, -36, 36, 36],
  };
}

/** Brandenburger Tor: sechs Säulenpaare, Attika und die Quadriga obenauf; forward läuft quer über den Pariser Platz. */
function brandenburgerTor(): Landmark {
  const parts: Part[] = [];
  // Sechs Pfeiler (je ein Säulenpaar), dazwischen fünf Durchfahrten, die mittlere breiter.
  for (const f of [-28, -17.5, -7.5, 7.5, 17.5, 28])
    parts.push(part(rect(f - 2.2, -5.5, f + 2.2, 5.5), 0, 15, 'stone'));
  parts.push(
    part(rect(-31, -5.8, 31, 5.8), 15, 19, 'stone'),
    part(rect(-22, -4.5, 22, 4.5), 19, 22, 'stone'),
    part(rect(-3.5, -2.5, 3.5, 2.5), 22, 27, 'copper'),
    // Torhäuser zu beiden Seiten.
    part(rect(-41, -6, -33, 6), 0, 11, 'stone'),
    part(rect(33, -6, 41, 6), 0, 11, 'stone'),
  );
  return {
    id: 'brandenburger-tor',
    name: 'Brandenburger Tor',
    city: 'berlin',
    center: { lng: 13.37772, lat: 52.51628 },
    heading: 0,
    colors: {
      stone: ['#a59c88', '#4a463d'],
      copper: ['#6f9c86', '#c9a25a'],
    },
    parts,
    zone: [-44, -9, 44, 9],
  };
}

/** Oberbaumbrücke: Backsteinbrücke über die Spree mit dem U-Bahn-Viadukt obendrauf und zwei Türmen in der Mitte. */
function oberbaumbruecke(): Landmark {
  const parts: Part[] = [];
  parts.push(part(rect(-77, -14, 77, 14), 5, 8, 'brick'));
  // Pfeiler im Wasser.
  for (const f of [-60, -36, -12, 12, 36, 60]) parts.push(part(rect(f - 3, -14, f + 3, 14), 0, 5, 'brick'));
  // U-Bahn-Viadukt auf der Nordseite (Bögen als Pfeiler), oben das Gleisbett.
  for (let f = -72; f <= 72; f += 9) parts.push(part(rect(f - 1.6, 3, f + 1.6, 12), 8, 13, 'brick'));
  parts.push(part(rect(-77, 3, 77, 12), 13, 15, 'brick'));
  // Die zwei Türme an der Mitte.
  for (const f of [-9, 9]) {
    parts.push(part(rect(f - 4, 9, f + 4, 15), 0, 30, 'brick'), part(ngon(f, 12, 3.5), 30, 34, 'roof'));
  }
  return {
    id: 'oberbaumbruecke',
    name: 'Oberbaumbrücke',
    city: 'berlin',
    center: { lng: 13.44575, lat: 52.50195 },
    // forward zeigt nach Nordosten (Friedrichshain), left nach Nordwesten (flussabwärts).
    heading: 44,
    colors: {
      brick: ['#8a5a4a', '#40291f'],
      roof: ['#5b7f6e', '#2b3d35'],
    },
    parts,
    zone: [-80, -16, 80, 16],
  };
}

export const LANDMARKS: readonly Landmark[] = [
  dom(),
  hohenzollernBridge(),
  colonius(),
  kranhaus('kranhaus-nord', 'Kranhaus Nord', { lng: 6.96625, lat: 50.92452 }),
  kranhaus('kranhaus-mitte', 'Kranhaus Mitte', { lng: 6.9668, lat: 50.92302 }),
  kranhaus('kranhaus-sued', 'Kranhaus Süd', { lng: 6.96738, lat: 50.92152 }),
  koelnTriangle(),
  elbphilharmonie(),
  michel(),
  heinrichHertzTurm(),
  koehlbrandbruecke(),
  landungsbruecken(),
  elbbruecken(),
  fernsehturm(),
  brandenburgerTor(),
  oberbaumbruecke(),
];

type Ring = number[][];

function toRing(landmark: Landmark, points: readonly Point[]): Ring {
  const ring = points.map(([f, l]) => {
    const p = offsetMeters(landmark.center, landmark.heading, f, l);
    return [Math.round(p.lng * 1e7) / 1e7, Math.round(p.lat * 1e7) / 1e7];
  });
  return [...ring, ring[0]];
}

export interface LandmarkFeature {
  type: 'Feature';
  properties: { id: string; name: string; base: number; height: number; color: string };
  geometry: { type: 'Polygon'; coordinates: Ring[] };
}

/**
 * Alle Teile als GeoJSON, gefärbt für eine Dunkelheit (0 Tag … 1 Nacht, siehe MapLook.night).
 * Die Höhen bleiben gleich, nur die Farben wandern zwischen Tag- und Nachtton.
 */
export function landmarkFeatures(night = 0): { type: 'FeatureCollection'; features: LandmarkFeature[] } {
  const features: LandmarkFeature[] = [];
  for (const landmark of LANDMARKS) {
    for (const p of landmark.parts) {
      const [day, dark] = landmark.colors[p.color];
      features.push({
        type: 'Feature',
        properties: {
          id: landmark.id,
          name: landmark.name,
          base: p.base,
          height: p.height,
          color: mixColor(day, dark, night),
        },
        geometry: { type: 'Polygon', coordinates: [toRing(landmark, p.ring)] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Bereiche der Wahrzeichen als Flächen (für den Filter der echten Gebäude und Gleise). */
export const LANDMARK_ZONES = {
  type: 'FeatureCollection' as const,
  features: LANDMARKS.map((landmark) => {
    const [f0, l0, f1, l1] = landmark.zone;
    return {
      type: 'Feature' as const,
      properties: { id: landmark.id },
      geometry: { type: 'Polygon' as const, coordinates: [toRing(landmark, rect(f0, l0, f1, l1))] },
    };
  }),
};
