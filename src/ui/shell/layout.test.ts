import { describe, expect, it } from 'vitest';
import type { GameState } from '../../core';
import { registerTab } from '../registry';
import { tabShortcuts } from './layout';

describe('Tastenkürzel der Tabs', () => {
  it('ausgeblendete Tabs (hiddenWhen) haben kein Kürzel, die übrigen behalten ihren Buchstaben', () => {
    let locked = true;
    const component = () => null;
    registerTab({ id: 'test-gangs', title: 'Gangs', order: 1, component, hiddenWhen: () => locked });
    registerTab({ id: 'test-reviere', title: 'Reviere', order: 2, component });
    registerTab({ id: 'test-versteckt', title: 'Verlauf', order: 3, component, hidden: true });
    const state = {} as GameState;
    const all = tabShortcuts();
    expect(all.get('test-gangs')).toBe('G');
    expect(all.has('test-versteckt')).toBe(false);
    const now = tabShortcuts(state);
    expect(now.has('test-gangs')).toBe(false);
    expect(now.get('test-reviere')).toBe(all.get('test-reviere'));
    locked = false;
    expect(tabShortcuts(state).get('test-gangs')).toBe('G');
  });
});
