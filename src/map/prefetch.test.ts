import { describe, expect, it } from 'vitest';
import { tileAt, tilesFor } from './prefetch';

describe('Kacheln vorladen', () => {
  it('rechnet die Kachel eines Punkts wie Web Mercator', () => {
    // Kölner Dom auf Zoom 14 (nachgerechnet mit asinh(tan(lat))).
    expect(tileAt({ lng: 6.958, lat: 50.9413 }, 14)).toEqual([8508, 5489]);
    expect(tileAt({ lng: 0, lat: 0 }, 1)).toEqual([1, 1]);
  });

  it('nimmt zwei Zoomstufen, Mitte zuerst, ohne über maxzoom zu gehen', () => {
    const tiles = tilesFor({ lng: 9.975, lat: 53.553 }, 12.6, { width: 1440, height: 900 }, 14);
    expect(tiles[0]).toEqual({ z: 12, ...xy(tileAt({ lng: 9.975, lat: 53.553 }, 12)) });
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set([12, 11]));
    expect(tiles.length).toBeLessThanOrEqual(60);
    const high = tilesFor({ lng: 9.975, lat: 53.553 }, 16, { width: 800, height: 600 }, 14);
    expect(Math.max(...high.map((t) => t.z))).toBe(14);
  });
});

function xy([x, y]: [number, number]) {
  return { x, y };
}
