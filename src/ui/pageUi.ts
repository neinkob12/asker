// UI-Zustand aus Sicht einer Handy-Seite (für `useUi`): Dieselbe App kann mehrfach im Stapel liegen (Chat-Liste und
// Chat), jede Seite sieht in `state.phone.app` und `state.phone.params` ihre eigenen Werte. Alles andere liest sich
// live aus dem Zustand der Runtime. Früher war das eine Kopie ({ ...ui, phone }): In einem Timer oder nach einem
// await zeigte sie den Stand vom Zeichnen, jetzt sind es Sichten (Proxy) ohne eigenen Stand.

import type { NavEntry } from './phone/navModel';
import type { UiState } from './runtime';

type Phone = UiState['phone'];

/** Sicht auf `ui.phone` mit app und params der Seite; open, stack usw. kommen live aus dem Original. */
function phoneView(live: () => Phone, entry: NavEntry): Phone {
  const own = (key: string | symbol) => key === 'app' || (key === 'params' && entry.params !== undefined);
  return new Proxy({} as Phone, {
    get: (_, key) => (key === 'app' ? entry.id : key === 'params' ? entry.params : Reflect.get(live(), key)),
    has: (_, key) => own(key) || (key !== 'params' && Reflect.has(live(), key)),
    ownKeys: () => {
      const keys = Reflect.ownKeys(live()).filter((k) => k !== 'params' && k !== 'app');
      return entry.params ? [...keys, 'app', 'params'] : [...keys, 'app'];
    },
    getOwnPropertyDescriptor: (_, key) => {
      if (key === 'params' && entry.params === undefined) return undefined;
      const value = key === 'app' ? entry.id : key === 'params' ? entry.params : Reflect.get(live(), key);
      if (value === undefined && !own(key) && !Reflect.has(live(), key)) return undefined;
      return { value, enumerable: true, configurable: true, writable: true };
    },
  });
}

const views = new WeakMap<UiState, WeakMap<NavEntry, UiState>>();

/**
 * Sicht auf den UI-Zustand für die Seite `entry`. Pro Seite (Eintrag im Stapel) gibt es genau eine Sicht, solange der
 * Eintrag lebt: Die Identität bleibt über das Neuzeichnen gleich, sie taugt also in Abhängigkeitslisten.
 */
export function pageUiState(ui: UiState, entry: NavEntry): UiState {
  let perEntry = views.get(ui);
  if (!perEntry) {
    perEntry = new WeakMap();
    views.set(ui, perEntry);
  }
  let view = perEntry.get(entry);
  if (!view) {
    const phone = phoneView(() => ui.phone, entry);
    view = new Proxy(ui, { get: (target, key) => (key === 'phone' ? phone : Reflect.get(target, key)) });
    perEntry.set(entry, view);
  }
  return view;
}
