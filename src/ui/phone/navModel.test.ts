import { describe, expect, it } from 'vitest';
import {
  BACK_TITLE_MAX,
  backLabel,
  closePanel,
  closeSections,
  currentApp,
  currentSection,
  HOME_ENTRY,
  mountedEntries,
  type NavEntry,
  type NavKind,
  openApp,
  openPanel,
  openSection,
  pop,
  popTo,
  popToRoot,
  push,
  replace,
  rootStack,
  sameEntry,
  top,
  transitionOf,
  withoutPanels,
  withTitle,
} from './navModel';

let n = 0;
const entry = (kind: NavKind, id: string, params?: Record<string, unknown>, title = id): NavEntry => ({
  kind,
  id,
  params,
  title,
  key: `k${++n}`,
});
const ids = (stack: readonly NavEntry[]) => stack.map((e) => (e.params ? `${e.id}${JSON.stringify(e.params)}` : e.id));

describe('Grundfunktionen', () => {
  it('beginnt mit dem Startbildschirm', () => {
    expect(rootStack()).toEqual([HOME_ENTRY]);
    expect(top(rootStack())).toBe(HOME_ENTRY);
    expect(top([])).toBe(HOME_ENTRY);
  });

  it('push legt oben drauf, pop nimmt die oberste Seite weg', () => {
    const a = entry('app', 'core.messages');
    const b = entry('app', 'core.messages', { contactId: 'x' });
    const stack = push(push(rootStack(), a), b);
    expect(top(stack)).toBe(b);
    expect(top(pop(stack))).toBe(a);
    expect(pop(pop(stack))).toEqual([HOME_ENTRY]);
  });

  it('der Startbildschirm bleibt immer liegen', () => {
    expect(pop(rootStack())).toEqual([HOME_ENTRY]);
    expect(pop(pop(rootStack()))).toEqual([HOME_ENTRY]);
    expect(popTo(push(rootStack(), entry('tab', 'gangs')), 0)).toEqual([HOME_ENTRY]);
  });

  it('replace tauscht die oberste Seite, nie den Startbildschirm', () => {
    const a = entry('panel', 'spots.spot', { spotId: 'a' });
    const b = entry('panel', 'spots.spot', { spotId: 'b' });
    expect(ids(replace(push(rootStack(), a), b))).toEqual(['home', 'spots.spot{"spotId":"b"}']);
    expect(ids(replace(rootStack(), a))).toEqual(['home', 'spots.spot{"spotId":"a"}']);
  });

  it('popToRoot und popTo', () => {
    const stack = [HOME_ENTRY, entry('tab', 'business'), entry('section', 'goods.stock'), entry('panel', 'x')];
    expect(popToRoot(stack)).toEqual([HOME_ENTRY]);
    expect(ids(popTo(stack, 1))).toEqual(['home', 'business']);
    expect(popTo(stack, -1)).toEqual(stack);
  });

  it('verändert den alten Stapel nie', () => {
    const stack = Object.freeze([HOME_ENTRY, entry('tab', 'business')]);
    expect(() => push(stack, entry('section', 's'))).not.toThrow();
    expect(() => pop(stack)).not.toThrow();
    expect(() => replace(stack, entry('tab', 'gangs'))).not.toThrow();
    expect(stack).toHaveLength(2);
  });

  it('vergleicht Seiten nach Art, ID und Parametern (Reihenfolge der Schlüssel egal)', () => {
    expect(sameEntry(entry('app', 'a', { x: 1, y: 2 }), entry('app', 'a', { y: 2, x: 1 }))).toBe(true);
    expect(sameEntry(entry('app', 'a'), entry('app', 'a', {}))).toBe(true);
    expect(sameEntry(entry('app', 'a', { x: undefined }), entry('app', 'a'))).toBe(true);
    expect(sameEntry(entry('app', 'a', { x: 1 }), entry('app', 'a', { x: 2 }))).toBe(false);
    expect(sameEntry(entry('app', 'a'), entry('tab', 'a'))).toBe(false);
  });
});

describe('openApp (openPhone, selectTab)', () => {
  it('öffnet eine App vom Startbildschirm', () => {
    expect(ids(openApp(rootStack(), entry('app', 'core.messages')))).toEqual(['home', 'core.messages']);
  });

  it('legt die Unterseite über die offene App (Chat-Liste → Chat)', () => {
    const list = entry('app', 'core.messages');
    const stack = openApp(
      [HOME_ENTRY, list],
      entry('app', 'core.messages'),
      entry('app', 'core.messages', { contactId: 'a' }),
    );
    expect(ids(stack)).toEqual(['home', 'core.messages', 'core.messages{"contactId":"a"}']);
    expect(stack[1]).toBe(list);
  });

  it('geht zurück, wenn die Seite schon im Stapel liegt (Chat → Liste)', () => {
    const list = entry('app', 'core.messages');
    const chat = entry('app', 'core.messages', { contactId: 'a' });
    expect(openApp([HOME_ENTRY, list, chat], entry('app', 'core.messages'))).toEqual([HOME_ENTRY, list]);
  });

  it('von einem Chat in den anderen: über die Liste, nicht gestapelt', () => {
    const list = entry('app', 'core.messages');
    const stack = openApp(
      [HOME_ENTRY, list, entry('app', 'core.messages', { contactId: 'a' })],
      entry('app', 'core.messages'),
      entry('app', 'core.messages', { contactId: 'b' }),
    );
    expect(ids(stack)).toEqual(['home', 'core.messages', 'core.messages{"contactId":"b"}']);
    expect(stack[1]).toBe(list);
  });

  it('springt aus einer anderen App direkt in einen Chat, die Liste liegt darunter (wie ein Banner bei iOS)', () => {
    const stack = openApp(
      [HOME_ENTRY, entry('tab', 'business'), entry('section', 'goods.stock')],
      entry('app', 'core.messages'),
      entry('app', 'core.messages', { contactId: 'a' }),
    );
    expect(ids(stack)).toEqual(['home', 'core.messages', 'core.messages{"contactId":"a"}']);
  });

  it('dieselbe App noch einmal öffnen führt zu ihrer Wurzel', () => {
    const tab = entry('tab', 'business');
    const stack = [HOME_ENTRY, tab, entry('section', 'goods.stock'), entry('panel', 'goods.warehouse')];
    expect(openApp(stack, entry('tab', 'business'))).toEqual([HOME_ENTRY, tab]);
  });
});

describe('Details und Abschnitte', () => {
  it('openPanel legt Details oben drauf', () => {
    const stack = openPanel([HOME_ENTRY, entry('tab', 'staff')], entry('panel', 'staff.profile', { staffId: 1 }));
    expect(ids(stack)).toEqual(['home', 'staff', 'staff.profile{"staffId":1}']);
  });

  it('ein anderer Spot ersetzt den oberen Spot statt ihn zu stapeln', () => {
    let stack = openPanel(rootStack(), entry('panel', 'spots.spot', { spotId: 'a' }));
    stack = openPanel(stack, entry('panel', 'spots.spot', { spotId: 'b' }));
    stack = openPanel(stack, entry('panel', 'spots.spot', { spotId: 'c' }));
    expect(ids(stack)).toEqual(['home', 'spots.spot{"spotId":"c"}']);
  });

  it('Spot → Veedel → derselbe Spot geht zurück statt zu stapeln', () => {
    const spot = entry('panel', 'spots.spot', { spotId: 'a' });
    let stack = openPanel(rootStack(), spot);
    stack = openPanel(stack, entry('panel', 'veedel.veedel', { veedelId: 'x' }));
    expect(stack).toHaveLength(3);
    stack = openPanel(stack, entry('panel', 'spots.spot', { spotId: 'a' }));
    expect(stack).toEqual([HOME_ENTRY, spot]);
  });

  it('closePanel nimmt nur ein Panel weg', () => {
    const tab = entry('tab', 'staff');
    expect(closePanel([HOME_ENTRY, tab, entry('panel', 'p')])).toEqual([HOME_ENTRY, tab]);
    expect(closePanel([HOME_ENTRY, tab])).toEqual([HOME_ENTRY, tab]);
  });

  it('Abschnitte: öffnen, ersetzen, zurück zur Übersicht', () => {
    const tab = entry('tab', 'business');
    let stack = openSection([HOME_ENTRY, tab], entry('section', 'goods.stock'));
    expect(ids(stack)).toEqual(['home', 'business', 'goods.stock']);
    expect(currentSection(stack)?.id).toBe('goods.stock');
    stack = openSection(stack, entry('section', 'market.summary'));
    expect(ids(stack)).toEqual(['home', 'business', 'market.summary']);
    stack = openPanel(stack, entry('panel', 'market.overview', {}));
    expect(closeSections(stack)).toEqual([HOME_ENTRY, tab]);
    expect(closeSections([HOME_ENTRY, entry('app', 'x')])).toHaveLength(2);
  });

  it('Handy weglegen vergisst Details, die App bleibt', () => {
    const tab = entry('tab', 'business');
    const section = entry('section', 'goods.stock');
    expect(withoutPanels([HOME_ENTRY, tab, section, entry('panel', 'goods.warehouse')])).toEqual([
      HOME_ENTRY,
      tab,
      section,
    ]);
    expect(withoutPanels([HOME_ENTRY, entry('panel', 'spots.spot')])).toEqual([HOME_ENTRY]);
  });

  it('currentApp ist die oberste App-Seite (für ui.phone.app und params)', () => {
    const chat = entry('app', 'core.messages', { contactId: 'a' });
    expect(currentApp([HOME_ENTRY, entry('app', 'core.messages'), chat, entry('panel', 'p')])).toBe(chat);
    expect(currentApp(rootStack())).toBeNull();
    expect(currentApp([HOME_ENTRY, entry('panel', 'spots.spot')])).toBeNull();
  });
});

describe('Titel und montierte Seiten', () => {
  it('der Zurück-Knopf zeigt den Titel der Vorseite, lange Titel heißen "Zurück"', () => {
    expect(backLabel(HOME_ENTRY)).toBe('Start');
    expect(backLabel(entry('tab', 'business', undefined, 'Geschäft'))).toBe('Geschäft');
    expect(backLabel(entry('panel', 'x', undefined, 'Zülpicher Platz am Bahnhof'))).toBe('Zurück');
    expect(backLabel(entry('panel', 'x', undefined, 'x'.repeat(BACK_TITLE_MAX)))).toBe('x'.repeat(BACK_TITLE_MAX));
    expect(backLabel(entry('panel', 'x', undefined, '  '))).toBe('Zurück');
    expect(backLabel(null)).toBe('Zurück');
  });

  it('withTitle ändert nur die eine Seite und lässt den Rest gleich', () => {
    const tab = entry('tab', 'business', undefined, 'Geschäft');
    const chat = entry('app', 'core.messages', { contactId: 'a' }, 'Chat');
    const stack = withTitle([HOME_ENTRY, tab, chat], chat.key, 'Dragan');
    expect(stack[1]).toBe(tab);
    expect(stack[2].title).toBe('Dragan');
    expect(stack[2].key).toBe(chat.key);
  });

  it('montiert höchstens zwei Seiten unter der sichtbaren', () => {
    const stack = [HOME_ENTRY, entry('tab', 'a'), entry('section', 'b'), entry('panel', 'c'), entry('panel', 'd')];
    expect(ids(mountedEntries(stack))).toEqual(['b', 'c', 'd']);
    expect(ids(mountedEntries(stack.slice(0, 2)))).toEqual(['home', 'a']);
    expect(ids(mountedEntries(rootStack()))).toEqual(['home']);
  });
});

describe('transitionOf (Richtung der Übergänge)', () => {
  const home = [HOME_ENTRY];
  const tab = entry('tab', 'business');
  const section = entry('section', 'goods.stock');
  const list = entry('app', 'core.messages');
  const chatA = entry('app', 'core.messages', { contactId: 'a' });
  const chatB = entry('app', 'core.messages', { contactId: 'b' });

  it('App öffnen und schließen', () => {
    expect(transitionOf(home, [HOME_ENTRY, tab])).toBe('open');
    expect(transitionOf([HOME_ENTRY, tab, section], home)).toBe('close');
    // Vom Startbildschirm direkt in einen Chat (Liste darunter): auch Öffnen
    expect(transitionOf(home, [HOME_ENTRY, list, chatA])).toBe('open');
  });

  it('vor und zurück', () => {
    expect(transitionOf([HOME_ENTRY, tab], [HOME_ENTRY, tab, section])).toBe('push');
    expect(transitionOf([HOME_ENTRY, tab, section], [HOME_ENTRY, tab])).toBe('pop');
    expect(transitionOf([HOME_ENTRY, list, chatA], [HOME_ENTRY, list])).toBe('pop');
  });

  it('ersetzen in derselben App, wechseln in eine andere', () => {
    expect(transitionOf([HOME_ENTRY, list, chatA], [HOME_ENTRY, list, chatB])).toBe('replace');
    expect(transitionOf([HOME_ENTRY, tab, section], [HOME_ENTRY, list, chatA])).toBe('switch');
    expect(transitionOf([HOME_ENTRY, tab], [HOME_ENTRY, list])).toBe('switch');
  });

  it('nichts, wenn die oberste Seite gleich bleibt', () => {
    expect(transitionOf([HOME_ENTRY, tab], [HOME_ENTRY, tab])).toBe('none');
    expect(transitionOf(home, home)).toBe('none');
    // Titel geändert: dieselbe Seite
    expect(transitionOf([HOME_ENTRY, tab], withTitle([HOME_ENTRY, tab], tab.key, 'Neu'))).toBe('none');
  });
});
