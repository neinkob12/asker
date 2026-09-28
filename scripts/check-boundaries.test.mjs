import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAll, checkImport, findImports } from './check-boundaries.mjs';

const f = (path) => resolve(import.meta.dirname, '..', path);

describe('Ordnerregeln (check-boundaries)', () => {
  it('das Repo hält die Regeln ein', () => {
    expect(checkAll()).toEqual([]);
  });

  it('Module nutzen andere Module nur über index.ts', () => {
    const file = f('src/modules/staff/index.ts');
    expect(checkImport(file, '../spots')).toBeNull();
    expect(checkImport(file, '../spots/index')).toBeNull();
    expect(checkImport(file, '../spots/config')).toMatch(/index.ts/);
    expect(checkImport(file, './config')).toBeNull();
  });

  it('Module nutzen den Kern nur über index.ts, Tests auch testing.ts', () => {
    expect(checkImport(f('src/modules/goods/index.ts'), '../../core')).toBeNull();
    expect(checkImport(f('src/modules/goods/index.ts'), '../../core/wallet')).toMatch(/Kern/);
    expect(checkImport(f('src/modules/goods/index.ts'), '../../core/testing')).toMatch(/Kern/);
    expect(checkImport(f('src/modules/goods/goods.test.ts'), '../../core/testing')).toBeNull();
  });

  it('nur der ui/-Ordner eines Moduls nutzt Oberfläche, Karte, Preact und MapLibre', () => {
    expect(checkImport(f('src/modules/spots/ui/index.tsx'), '../../../ui')).toBeNull();
    expect(checkImport(f('src/modules/spots/ui/map.ts'), '../../../map')).toBeNull();
    expect(checkImport(f('src/modules/spots/ui/map.ts'), 'maplibre-gl')).toBeNull();
    expect(checkImport(f('src/modules/spots/ui/index.tsx'), '../../../ui/registry')).toMatch(/index.ts/);
    expect(checkImport(f('src/modules/spots/index.ts'), '../../ui')).toMatch(/ui\/-Ordner/);
    expect(checkImport(f('src/modules/spots/index.ts'), 'preact')).toMatch(/ui\/-Ordner/);
    expect(checkImport(f('src/modules/spots/index.ts'), './ui/map')).toMatch(/ui\/-Ordner/);
  });

  it('der Kern importiert keine Module, UI oder Karte', () => {
    expect(checkImport(f('src/core/sim.ts'), '../modules/spots')).toMatch(/Kern/);
    expect(checkImport(f('src/core/sim.ts'), '../ui')).toMatch(/Kern/);
    expect(checkImport(f('src/core/sim.ts'), 'maplibre-gl')).toMatch(/DOM-frei/);
  });

  it('UI und Karte importieren keine Module', () => {
    expect(checkImport(f('src/ui/shell/Hud.tsx'), '../../modules/spots')).toMatch(/keine Module/);
    expect(checkImport(f('src/map/GameMap.ts'), '../core')).toBeNull();
  });

  it('findet auch Modul-Erweiterungen und dynamische Importe', () => {
    const src =
      "import a from './a';\nexport { b } from '../b';\ndeclare module '../../core' {}\nconst c = import('./c');";
    expect(findImports(src).map((i) => i.spec)).toEqual(['./a', '../b', './c', '../../core']);
  });
});
