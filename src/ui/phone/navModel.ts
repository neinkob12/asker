// Navigation des Spiel-Handys als Stapel wie bei iOS (UINavigationController): unten der Startbildschirm, darüber die
// Wurzel einer App (Handy-App oder Tab eines Moduls), darüber Abschnitte, Details (Panels) und Unterseiten einer App
// (z.B. ein Chat). Reine Funktionen ohne DOM, getestet in navModel.test.ts. Der Stapel ist UI-Zustand
// (UiState.phone.stack), kein Spielstand.
//
// Die alte API der Oberfläche (openPhone, selectTab, openSection, openPanel, closePanel) wird in runtime.ts auf diese
// Funktionen abgebildet; welche Richtung ein Wechsel hat (vor, zurück, ersetzen), liest die Darstellung mit
// `transitionOf` ab.

export type NavKind = 'home' | 'app' | 'tab' | 'section' | 'panel';

export interface NavEntry {
  kind: NavKind;
  /** home: 'home', app: App-ID, tab: Tab-ID (ohne 'tab:'), section: ID des Slot-Beitrags, panel: Panel-ID. */
  id: string;
  /** app: Parameter der App (z.B. { contactId }), panel: Props, section: { tab }. */
  params?: Record<string, unknown>;
  /** Titel der Seite. Die nächste Seite zeigt ihn im Zurück-Knopf. */
  title: string;
  /** Eindeutig je Eintrag: Schlüssel der montierten Seite (gleiche Seite = gleicher Schlüssel). */
  key: string;
}

export type NavStack = readonly NavEntry[];

/** Richtung eines Wechsels für die Übergänge. */
export type NavTransition =
  /** Nichts Sichtbares hat sich geändert. */
  | 'none'
  /** Eine App öffnet sich vom Startbildschirm aus. */
  | 'open'
  /** Zurück auf den Startbildschirm (die App schrumpft auf ihre Kachel). */
  | 'close'
  /** Neue Seite von rechts. */
  | 'push'
  /** Zurück zur Vorseite. */
  | 'pop'
  /** Oberste Seite ausgetauscht (z.B. anderer Spot), gleiche Tiefe. */
  | 'replace'
  /** In eine andere App gesprungen (z.B. über ein Banner). */
  | 'switch';

export const HOME_ENTRY: NavEntry = { kind: 'home', id: 'home', title: 'Start', key: 'home' };

/** Längster Titel, der noch in den Zurück-Knopf passt; längere heißen dort "Zurück" (wie bei iOS). */
export const BACK_TITLE_MAX = 14;

/** Seiten unter der sichtbaren, die montiert bleiben (Scrollposition und Eingaben bleiben erhalten). */
export const MOUNTED_BELOW = 2;

/** Der Startbildschirm als Stapel. */
export function rootStack(): NavEntry[] {
  return [HOME_ENTRY];
}

/** Oberste (sichtbare) Seite. */
export function top(stack: NavStack): NavEntry {
  return stack[stack.length - 1] ?? HOME_ENTRY;
}

/** Neue Seite oben drauf. */
export function push(stack: NavStack, entry: NavEntry): NavEntry[] {
  return [...stack, entry];
}

/** Eine Seite zurück. Der Startbildschirm bleibt immer liegen. */
export function pop(stack: NavStack): NavEntry[] {
  return stack.length > 1 ? stack.slice(0, -1) : [...stack];
}

/** Oberste Seite austauschen. Der Startbildschirm wird nie ersetzt (dann kommt die Seite oben drauf). */
export function replace(stack: NavStack, entry: NavEntry): NavEntry[] {
  return stack.length > 1 ? [...stack.slice(0, -1), entry] : push(stack, entry);
}

/** Zurück bis zum Startbildschirm. */
export function popToRoot(stack: NavStack): NavEntry[] {
  return stack.length > 0 ? stack.slice(0, 1) : rootStack();
}

/** Zurück bis zur Seite mit diesem Index (sie bleibt oben). */
export function popTo(stack: NavStack, index: number): NavEntry[] {
  if (index < 0) return [...stack];
  return stack.slice(0, Math.max(1, index + 1));
}

/** Parameter vergleichbar machen (Schlüssel sortiert, undefined und {} gleich). */
function paramsKey(params: Record<string, unknown> | undefined): string {
  if (!params) return '';
  const keys = Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .sort();
  if (keys.length === 0) return '';
  return JSON.stringify(keys.map((k) => [k, params[k]]));
}

/** Dieselbe Seite (Art, ID und Parameter gleich; Titel und Schlüssel egal)? */
export function sameEntry(a: Pick<NavEntry, 'kind' | 'id' | 'params'>, b: Pick<NavEntry, 'kind' | 'id' | 'params'>) {
  return a.kind === b.kind && a.id === b.id && paramsKey(a.params) === paramsKey(b.params);
}

/** Index der obersten passenden Seite, -1 wenn keine. */
export function indexOfEntry(stack: NavStack, entry: Pick<NavEntry, 'kind' | 'id' | 'params'>): number {
  for (let i = stack.length - 1; i >= 0; i--) if (sameEntry(stack[i], entry)) return i;
  return -1;
}

/** Ist das eine Wurzel einer App (Handy-App ohne Parameter oder Tab)? */
export function isAppRoot(entry: NavEntry): boolean {
  return entry.kind === 'tab' || (entry.kind === 'app' && paramsKey(entry.params) === '');
}

/** Oberste App-Seite (Handy-App mit Parametern oder Tab), z.B. für ui.phone.app und ui.phone.params. */
export function currentApp(stack: NavStack): NavEntry | null {
  for (let i = stack.length - 1; i >= 1; i--) {
    const e = stack[i];
    if (e.kind === 'app' || e.kind === 'tab') return e;
  }
  return null;
}

/**
 * Eine App öffnen (openPhone, selectTab): `root` ist ihre Wurzel, `detail` optional eine Unterseite derselben App
 * (z.B. ein Chat). Ist die Seite schon im Stapel, geht es dorthin zurück. Ist die App offen, kommt die Unterseite
 * über ihre Wurzel. Sonst beginnt der Stapel neu: Startbildschirm, Wurzel, Unterseite (wie ein Banner bei iOS, das
 * den Chat öffnet; zurück führt dann zur Chat-Liste).
 */
export function openApp(stack: NavStack, root: NavEntry, detail?: NavEntry): NavEntry[] {
  const target = detail ?? root;
  const existing = indexOfEntry(stack, target);
  if (existing > 0) return popTo(stack, existing);
  const home = stack[0] ?? HOME_ENTRY;
  if (detail) {
    const rootIndex = indexOfEntry(stack, root);
    if (rootIndex > 0) return push(popTo(stack, rootIndex), detail);
    return [home, root, detail];
  }
  return [home, root];
}

/**
 * Details öffnen (openPanel): Gibt es dieselbe Seite schon, geht es dorthin zurück. Liegt oben dasselbe Panel mit
 * anderen Props (z.B. ein anderer Spot auf der Karte angeklickt), wird es ersetzt statt gestapelt. Sonst neue Seite.
 */
export function openPanel(stack: NavStack, panel: NavEntry): NavEntry[] {
  const existing = indexOfEntry(stack, panel);
  if (existing > 0) return popTo(stack, existing);
  const current = top(stack);
  if (current.kind === 'panel' && current.id === panel.id) return replace(stack, panel);
  return push(stack, panel);
}

/** Abschnitt eines Listen-Tabs öffnen (openSection): wie ein Panel, ein anderer Abschnitt ersetzt den oberen. */
export function openSection(stack: NavStack, section: NavEntry): NavEntry[] {
  const existing = indexOfEntry(stack, section);
  if (existing > 0) return popTo(stack, existing);
  if (top(stack).kind === 'section') return replace(stack, section);
  return push(stack, section);
}

/** Zurück zur Übersicht eines Listen-Tabs (openSection(null)): bis zum obersten Tab, sonst unverändert. */
export function closeSections(stack: NavStack): NavEntry[] {
  for (let i = stack.length - 1; i >= 1; i--) if (stack[i].kind === 'tab') return popTo(stack, i);
  return [...stack];
}

/** Details schließen (closePanel): Liegt oben ein Panel, eine Seite zurück. */
export function closePanel(stack: NavStack): NavEntry[] {
  return top(stack).kind === 'panel' ? pop(stack) : [...stack];
}

/** Alle Details entfernen (Handy weglegen: die App bleibt gemerkt, Details nicht). */
export function withoutPanels(stack: NavStack): NavEntry[] {
  const rest = stack.filter((e) => e.kind !== 'panel');
  return rest.length > 0 ? rest : rootStack();
}

/** Abschnitt, der gerade offen ist (oberster Abschnitt im Stapel), sonst null. */
export function currentSection(stack: NavStack): NavEntry | null {
  for (let i = stack.length - 1; i >= 1; i--) if (stack[i].kind === 'section') return stack[i];
  return null;
}

/** Beschriftung des Zurück-Knopfs: Titel der Vorseite, wenn er kurz genug ist, sonst "Zurück". */
export function backLabel(below: NavEntry | null | undefined): string {
  const title = below?.title.trim() ?? '';
  return title.length > 0 && title.length <= BACK_TITLE_MAX ? title : 'Zurück';
}

/**
 * Seiten, die montiert sind: die sichtbare und höchstens MOUNTED_BELOW darunter, dazu immer der Startbildschirm.
 * Er ist bei iOS keine Seite der App, sondern der Hintergrund, aus dem Apps aufgehen und in den sie zurückschrumpfen.
 */
export function mountedEntries(stack: NavStack, below = MOUNTED_BELOW): NavEntry[] {
  const pages = stack.slice(Math.max(0, stack.length - 1 - below));
  return stack.length > 0 && pages[0] !== stack[0] ? [stack[0], ...pages] : pages;
}

/** Titel einer Seite ändern (die Seite meldet ihren echten Titel, z.B. den Namen eines Kontakts). */
export function withTitle(stack: NavStack, key: string, title: string): NavEntry[] {
  return stack.map((e) => (e.key === key && e.title !== title ? { ...e, title } : e));
}

/** Welcher Übergang führt vom alten zum neuen Stapel? Verglichen werden die Schlüssel der Seiten. */
export function transitionOf(before: NavStack, after: NavStack): NavTransition {
  const from = top(before);
  const to = top(after);
  if (from.key === to.key) return 'none';
  if (to.kind === 'home') return 'close';
  const prefix = (a: NavStack, b: NavStack) => a.every((e, i) => b[i]?.key === e.key);
  if (from.kind === 'home') return 'open';
  if (after.length > before.length && prefix(before, after)) return 'push';
  if (after.length < before.length && prefix(after, before)) return 'pop';
  // Gleiche App (gleiche Wurzel): Seiten darüber wurden ausgetauscht.
  const sameRoot = before[1] && after[1] && before[1].key === after[1].key;
  if (sameRoot) {
    if (after.length === before.length) return 'replace';
    return after.length > before.length ? 'push' : 'pop';
  }
  return 'switch';
}
