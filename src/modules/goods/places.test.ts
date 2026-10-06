import { describe, expect, it } from 'vitest';
import { WAREHOUSES } from './config';
import { fitArticles, warehouseGender, warehousePlace } from './places';

describe('Wendungen für Lagernamen (Auftrag 43, L3)', () => {
  it('nimmt den Artikel nach dem ersten Wort', () => {
    expect(warehousePlace('Halle Cargo City', 'into')).toBe('in die Halle Cargo City');
    expect(warehousePlace('Garage Barmbek', 'in')).toBe('in der Garage Barmbek');
    expect(warehousePlace('Lager Ehrenfeld', 'into')).toBe('ins Lager Ehrenfeld');
    expect(warehousePlace('Hinterhof Giesing', 'into')).toBe('in den Hinterhof Giesing');
    expect(warehousePlace('Keller Sülz', 'from')).toBe('aus dem Keller Sülz');
  });

  it('jedes Lager im Spiel hat ein bekanntes erstes Wort', () => {
    for (const site of WAREHOUSES) {
      const first = site.name.split(' ')[0];
      expect([
        'Lager',
        'Bootshaus',
        'Garage',
        'Halle',
        'Werkstatt',
        'Remise',
        'Keller',
        'Clubkeller',
        'Hinterhof',
      ]).toContain(first);
      expect(['m', 'f', 'n']).toContain(warehouseGender(site.name));
    }
  });

  it('passt Artikel in Vorlagen an („vom {warehouse}“ → „von der Garage“)', () => {
    const fill = (t: string, name: string) => fitArticles(t, 'warehouse', name).replace('{warehouse}', name);
    expect(fill('Wir wissen vom {warehouse}.', 'Garage Gallus')).toBe('Wir wissen von der Garage Gallus.');
    expect(fill('Dein {warehouse} ist bekannt.', 'Halle Osthafen')).toBe('Deine Halle Osthafen ist bekannt.');
    expect(fill('Der {warehouse} bleibt geheim.', 'Lager Ehrenfeld')).toBe('Das Lager Ehrenfeld bleibt geheim.');
    expect(fill('Einbruch im {warehouse}.', 'Keller Sülz')).toBe('Einbruch im Keller Sülz.');
    expect(fill('Beim {warehouse} war wer.', 'Remise Neuhausen')).toBe('Bei der Remise Neuhausen war wer.');
  });
});
