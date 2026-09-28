// Seedbarer Zufall (mulberry32). Der Zustand ist eine 32-Bit-Zahl und liegt im Spielstand,
// damit gleicher Spielstand + gleiche Befehle immer das gleiche Ergebnis liefern.

/** Liefert [Zufallszahl in [0, 1), neuer Zustand]. */
export function rngNext(stateValue: number): [number, number] {
  const s = (stateValue + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Startzustand eines Zufallsstroms, abgeleitet aus Seed und Name (z.B. Modul-ID). */
export function seedStream(seed: number, name: string): number {
  // FNV-1a über den Namen, dann mit dem Seed gemischt.
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let x = (h ^ Math.imul(seed | 0, 0x9e3779b1)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) | 0;
}

/** Zufallsseed für ein neues Spiel (außerhalb der Simulation, darf echten Zufall nutzen). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Einfache Zufallsfunktion außerhalb eines Spielstands, z.B. für Tests oder Datengeneratoren. */
export function createRng(seed: number): () => number {
  let s = seedStream(seed, 'standalone');
  return () => {
    const [value, next] = rngNext(s);
    s = next;
    return value;
  };
}
