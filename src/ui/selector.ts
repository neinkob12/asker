// Kern des Selektor-Hooks (hooks.ts), ohne Preact, damit er sich ohne Browser testen lässt.
//
// Der Spielzustand ist veränderbar (die Simulation schreibt in place), deshalb kann eine Komponente nicht über die
// Identität von `state` erkennen, ob sich etwas geändert hat. Ein Selektor liest stattdessen einen kleinen Auszug
// (Zahlen, Texte, frisch gebaute Listen) und die Komponente zeichnet nur neu, wenn der Auszug beim Tick anders
// ausfällt als beim letzten Zeichnen.

export type Equals<T> = (a: T, b: T) => boolean;

/** Flacher Vergleich für Auszüge aus Zahlen und Texten: Objekte feldweise, Listen elementweise (Object.is). */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.hasOwn(b, key)) return false;
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

/**
 * Beobachtet einen Auszug: `update` merkt Lesefunktion und Vergleich des letzten Zeichnens samt Wert, `changed` liest
 * neu und sagt, ob die Komponente neu gezeichnet werden muss. Wirft das Lesen (z.B. Spiel weg), gilt es als geändert,
 * damit die Komponente beim nächsten Zeichnen selbst den Fehler zeigt.
 */
export function createSelection<T>() {
  let read: (() => T) | null = null;
  let equals: Equals<T> = Object.is;
  let value: T;
  return {
    /** Beim Zeichnen: liest den Auszug und merkt ihn sich. */
    update(nextRead: () => T, nextEquals: Equals<T> = Object.is): T {
      read = nextRead;
      equals = nextEquals;
      value = nextRead();
      return value;
    },
    /** Beim Tick: Hat sich der Auszug gegenüber dem letzten Zeichnen geändert? */
    changed(): boolean {
      if (!read) return false;
      try {
        return !equals(value, read());
      } catch {
        return true;
      }
    },
  };
}
