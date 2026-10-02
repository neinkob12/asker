// Wann "Veedel übernommen" als Dialog erscheint (ohne Oberfläche, damit sich das testen lässt): beim ersten Mal je Veedel
// und Durchgang. Springt die Kontrolle in einem umkämpften Veedel hin und her, hielte der Dialog das Spiel bei jedem
// Rückgewinn an. Dann bleiben Banner, Island und das Aufleuchten auf der Karte.

export interface TakeoverMemory {
  runId: string;
  veedelIds: Set<string>;
}

export function newMemory(): TakeoverMemory {
  return { runId: '', veedelIds: new Set() };
}

/** Ist das die erste Übernahme dieses Veedels in diesem Durchgang? Merkt sich das Veedel. */
export function isFirstTakeover(memory: TakeoverMemory, runId: string, veedelId: string): boolean {
  if (memory.runId !== runId) {
    memory.runId = runId;
    memory.veedelIds.clear();
  }
  if (memory.veedelIds.has(veedelId)) return false;
  memory.veedelIds.add(veedelId);
  return true;
}
