import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../core';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs';

function memory(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    keys: () => [...data.keys()],
  };
}

describe('Einstellungen pro Gerät', () => {
  it('Handy ist standardmäßig dunkel, der White Mode bleibt gemerkt', () => {
    const storage = memory();
    expect(loadPrefs(storage).phoneTheme).toBe('dark');
    savePrefs(storage, { ...DEFAULT_PREFS, phoneTheme: 'light' });
    expect(loadPrefs(storage).phoneTheme).toBe('light');
  });

  it('alte Stände mit Kamera-Feld und ohne Farbe laden dunkel', () => {
    const storage = memory();
    storage.setItem('koeln-tycoon:ui', JSON.stringify({ v: 2, overlay: false, camera: '3d', traffic: 'low' }));
    const prefs = loadPrefs(storage);
    expect(prefs.phoneTheme).toBe('dark');
    expect(prefs.traffic).toBe('low');
    expect('camera' in prefs).toBe(false);
  });
});
