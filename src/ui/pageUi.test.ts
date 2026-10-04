import { describe, expect, it } from 'vitest';
import { pageUiState } from './pageUi';
import type { NavEntry } from './phone/navModel';
import type { UiState } from './runtime';

const entry = (id: string, params?: Record<string, unknown>): NavEntry => ({
  kind: 'app',
  id,
  title: id,
  key: `${id}:${JSON.stringify(params ?? {})}`,
  ...(params ? { params } : {}),
});

function fakeUi(): UiState {
  return { phone: { open: true, app: 'core.messages', stack: [] }, popover: null } as unknown as UiState;
}

describe('pageUiState', () => {
  it('zeigt app und params der Seite, nicht die der obersten', () => {
    const ui = fakeUi();
    const list = entry('core.messages');
    const chat = entry('core.messages', { contactId: 'gang:a' });
    ui.phone = { ...ui.phone, app: 'core.messages', params: chat.params as Record<string, unknown> };
    expect(pageUiState(ui, list).phone.params).toBeUndefined();
    expect(pageUiState(ui, chat).phone.params).toEqual({ contactId: 'gang:a' });
    expect(pageUiState(ui, entry('core.finance')).phone.app).toBe('core.finance');
  });

  it('ist keine Kopie: Später geänderter Zustand ist sofort zu sehen, auch wenn ui.phone ersetzt wird', () => {
    const ui = fakeUi();
    const view = pageUiState(ui, entry('core.finance'));
    const phone = view.phone;
    expect(phone.open).toBe(true);
    ui.phone = { ...ui.phone, open: false };
    ui.popover = 'menu';
    expect(view.popover).toBe('menu');
    // Auch eine früher geholte phone-Sicht folgt dem neuen Objekt.
    expect(phone.open).toBe(false);
    expect(view.phone.open).toBe(false);
    expect(view.phone.app).toBe('core.finance');
  });

  it('gleiche Seite, gleiche Sicht (Identität bleibt über das Neuzeichnen gleich)', () => {
    const ui = fakeUi();
    const e = entry('core.finance');
    expect(pageUiState(ui, e)).toBe(pageUiState(ui, e));
    expect(pageUiState(ui, entry('core.finance'))).not.toBe(pageUiState(ui, e));
  });

  it('Spread und in-Prüfung verhalten sich wie bei einem normalen Objekt', () => {
    const ui = fakeUi();
    const chat = entry('core.messages', { contactId: 'x' });
    const phone = pageUiState(ui, chat).phone;
    expect({ ...phone }).toEqual({ open: true, app: 'core.messages', stack: [], params: { contactId: 'x' } });
    expect('params' in phone).toBe(true);
    const plain = pageUiState(ui, entry('core.finance')).phone;
    expect('params' in plain).toBe(false);
    expect(Object.keys(plain).sort()).toEqual(['app', 'open', 'stack']);
  });
});
