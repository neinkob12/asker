// Regionen im Ausland für die eigene Produktion (Auftrag 42): Kolumbien und Marokko. Keine Städte zum Spielen (keine
// Veedel, keine Spots, kein Aufenthalt), sondern Orte mit Fincas, einem Ausfuhrhafen, einem lokalen Kartell und den
// Behörden. Wer dort arbeitet (Arbeiter, Gärtner), hat die Region als cityId; die Region ist nie live, staff lässt
// diese Leute also in Ruhe (Löhne zahlt grow). Was die Region im Spiel kostet und bringt, steht in grow/config.ts.
// Namen frei erfunden.

import type { Contact, LngLat } from '../../core';

export interface RegionDef {
  id: string;
  /** Land, z.B. „Kolumbien“ (Titel der Glas-Karte und im Handy). */
  name: string;
  /** Gegend der Fincas. */
  area: string;
  /** Mitte der Fincas (Glas-Karte, Rahmen der Europa-Ansicht). */
  center: LngLat;
  /** Ausfuhrhafen: Name und Knoten im Seewege-Netz (roads.seaRoute). */
  port: { name: string; sea: string; at: LngLat };
  /** Wer anruft und dich einlädt, mit Gesicht und Stimme. */
  contact: Contact;
  /** Das lokale Kartell: Partner mit Anteil. */
  cartel: { name: string; contact: Contact };
  /** Die Behörden, deren Aufmerksamkeit zählt. */
  authority: string;
  /** Der Dreh der Region in einem Satz. */
  pitch: string;
}

export const REGIONS: readonly RegionDef[] = [
  {
    id: 'kolumbien',
    name: 'Kolumbien',
    area: 'Sierra Nevada de Santa Marta',
    center: { lng: -73.95, lat: 10.85 },
    port: { name: 'Cartagena', sea: 'cartagena', at: { lng: -75.53, lat: 10.4 } },
    contact: {
      id: 'grow:kolumbien',
      name: 'Esteban Mejía',
      kind: 'supplier',
      role: 'Exporteur in Cartagena',
      about:
        'Verschifft Bananen und Kaffee nach Europa, seit dreißig Jahren. Sein Vater hat schon Santa Marta Gold über den Atlantik gebracht.',
      look: {
        feminine: false,
        age: 57,
        skin: 3,
        face: 'square',
        hair: 'slick',
        hairColor: 5,
        beard: 'moustache',
        brows: 'heavy',
        eyes: 'heavy',
        mouth: 'smirk',
        glasses: 'sun',
        hat: 'none',
        top: 'openshirt',
        topColor: 4,
        chain: 'thin',
      },
      voice: { feminine: false, pitch: 0.8, rate: 0.95 },
    },
    cartel: {
      name: 'Los Serranos',
      contact: {
        id: 'grow:kolumbien-cartel',
        name: 'Doña Inés Carmona',
        kind: 'other',
        role: 'Los Serranos, Sierra Nevada',
        about: 'Ihr gehören die Wege in die Berge. Wer dort anbaut, zahlt ihr einen Anteil, oder es brennt.',
        look: {
          feminine: true,
          age: 62,
          skin: 3,
          face: 'narrow',
          hair: 'tight',
          hairColor: 5,
          beard: 'none',
          brows: 'hard',
          eyes: 'narrow',
          mouth: 'hard',
          glasses: 'none',
          hat: 'none',
          top: 'suit',
          topColor: 0,
          earring: 'stud',
        },
        voice: { feminine: true, pitch: 0.9, rate: 0.9 },
      },
    },
    authority: 'Policía Antinarcóticos',
    pitch: 'Großes Land, gutes Klima, beste Genetik. Weit weg: vier Wochen von der Ernte bis in den Hafen.',
  },
  {
    id: 'marokko',
    name: 'Marokko',
    area: 'Rif-Gebirge bei Ketama',
    center: { lng: -4.55, lat: 34.92 },
    port: { name: 'Tanger', sea: 'tanger', at: { lng: -5.8, lat: 35.78 } },
    contact: {
      id: 'grow:marokko',
      name: 'Hassan Amrani',
      kind: 'supplier',
      role: 'Rif-Kooperative, Ketama',
      about:
        'Hat dir jahrelang Hasch aus der Kooperative verkauft. Kennt jeden Hang im Rif und jeden Gendarmen in Ketama.',
      look: {
        feminine: false,
        age: 61,
        skin: 2,
        face: 'oval',
        hair: 'short',
        hairColor: 5,
        beard: 'full',
        brows: 'soft',
        eyes: 'rings',
        mouth: 'neutral',
        glasses: 'none',
        hat: 'none',
        top: 'jacket',
        topColor: 2,
      },
      voice: { feminine: false, pitch: 0.75, rate: 0.9 },
    },
    cartel: {
      name: 'Familie Haddou',
      contact: {
        id: 'grow:marokko-cartel',
        name: 'Karim Haddou',
        kind: 'other',
        role: 'Familie Haddou, Tanger',
        about: 'Seine Familie bestimmt, was durch den Hafen von Tanger geht. Freundlich, solange sein Anteil stimmt.',
        look: {
          feminine: false,
          age: 44,
          skin: 2,
          face: 'square',
          hair: 'fade',
          hairColor: 0,
          beard: 'stubble',
          brows: 'heavy',
          eyes: 'narrow',
          mouth: 'hard',
          glasses: 'none',
          hat: 'none',
          top: 'leather',
          topColor: 0,
          chain: 'thick',
          teeth: 'gold',
        },
        voice: { feminine: false, pitch: 0.85, rate: 1.05 },
      },
    },
    authority: 'Gendarmerie Royale',
    pitch: 'Nah und billig: Hasch aus dem Rif, in drei Wochen von der Ernte im Hafen. Die Gendarmen kennen dich bald.',
  },
];

const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

export function getRegion(id: string): RegionDef | undefined {
  return REGION_BY_ID.get(id);
}

/** Ist das eine Region im Ausland (kein Ort zum Spielen)? */
export function isRegion(id: string | undefined): boolean {
  return id !== undefined && REGION_BY_ID.has(id);
}
