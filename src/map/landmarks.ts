// Wahrzeichen als einfache 3D-Klötze (fill-extrusion, gestapelt, Toon-Farben), damit man sich ohne
// Straßennamen zurechtfindet: Kölner Dom, Hohenzollernbrücke, Colonius, Kranhäuser, KölnTriangle.
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

export const LANDMARKS: readonly Landmark[] = [
  dom(),
  hohenzollernBridge(),
  colonius(),
  kranhaus('kranhaus-nord', 'Kranhaus Nord', { lng: 6.96625, lat: 50.92452 }),
  kranhaus('kranhaus-mitte', 'Kranhaus Mitte', { lng: 6.9668, lat: 50.92302 }),
  kranhaus('kranhaus-sued', 'Kranhaus Süd', { lng: 6.96738, lat: 50.92152 }),
  koelnTriangle(),
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
