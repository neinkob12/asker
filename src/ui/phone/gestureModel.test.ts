import { describe, expect, it } from 'vitest';
import {
  bannerSwipe,
  dragAxis,
  edgeSwipeCommits,
  edgeSwipeProgress,
  homeSwipeCommits,
  homeSwipeOpenness,
  rubberBand,
  VelocityTracker,
} from './gestureModel';

describe('VelocityTracker', () => {
  it('misst px/ms aus den letzten Bewegungen', () => {
    const v = new VelocityTracker();
    v.add(0, 0, 0);
    v.add(10, 5, 10);
    v.add(20, 10, 20);
    expect(v.velocity()).toEqual({ vx: 1, vy: 0.5 });
  });

  it('vergisst langsame alte Bewegungen (nur die letzten 100 ms zählen)', () => {
    const v = new VelocityTracker();
    v.add(0, 0, 0);
    v.add(1, 0, 500);
    v.add(41, 0, 520);
    v.add(81, 0, 540);
    expect(v.velocity().vx).toBeCloseTo(2, 5);
  });

  it('ohne Bewegung 0', () => {
    const v = new VelocityTracker();
    expect(v.velocity()).toEqual({ vx: 0, vy: 0 });
    v.add(5, 5, 10);
    expect(v.velocity()).toEqual({ vx: 0, vy: 0 });
  });
});

describe('Rand-Wischen', () => {
  const width = 400;

  it('60 % geschafft: zurück; 20 %: bleibt', () => {
    expect(edgeSwipeCommits(edgeSwipeProgress(0.6 * width, width), 0)).toBe(true);
    expect(edgeSwipeCommits(edgeSwipeProgress(0.2 * width, width), 0)).toBe(false);
  });

  it('schnelles kurzes Wischen: zurück', () => {
    expect(edgeSwipeCommits(edgeSwipeProgress(40, width), 0.9)).toBe(true);
  });

  it('weit gezogen, aber zurück unterwegs: bleibt', () => {
    expect(edgeSwipeCommits(0.7, -0.4)).toBe(false);
  });

  it('Fortschritt bleibt zwischen 0 und 1', () => {
    expect(edgeSwipeProgress(-30, width)).toBe(0);
    expect(edgeSwipeProgress(900, width)).toBe(1);
  });
});

describe('Home-Balken', () => {
  const height = 800;

  it('Öffnung folgt dem Finger nach oben', () => {
    expect(homeSwipeOpenness(0, height)).toBe(1);
    expect(homeSwipeOpenness(-240, height)).toBeCloseTo(0.5, 5);
    expect(homeSwipeOpenness(-2000, height)).toBe(0);
    expect(homeSwipeOpenness(50, height)).toBe(1);
  });

  it('ein Achtel der Höhe oder schnell nach oben zählt', () => {
    expect(homeSwipeCommits(-120, height, 0)).toBe(true);
    expect(homeSwipeCommits(-60, height, 0)).toBe(false);
    expect(homeSwipeCommits(-30, height, -1.2)).toBe(true);
    expect(homeSwipeCommits(-150, height, 0.6)).toBe(false);
  });
});

describe('Banner und Achsen', () => {
  it('hoch = weg, runter = Mitteilungszentrale', () => {
    expect(bannerSwipe(-40, 0)).toBe('dismiss');
    expect(bannerSwipe(-5, -0.8)).toBe('dismiss');
    expect(bannerSwipe(80, 0)).toBe('center');
    expect(bannerSwipe(10, 0)).toBe('stay');
  });

  it('Achse erst ab der Schwelle', () => {
    expect(dragAxis(3, 2)).toBeNull();
    expect(dragAxis(20, 4)).toBe('x');
    expect(dragAxis(-3, -15)).toBe('y');
  });

  it('Gummiband: wächst langsamer als der Finger und nie über die Grenze', () => {
    expect(rubberBand(0, 300)).toBe(0);
    expect(rubberBand(100, 300)).toBeLessThan(100);
    expect(rubberBand(100, 300)).toBeGreaterThan(0);
    expect(rubberBand(-100, 300)).toBeCloseTo(-rubberBand(100, 300), 10);
    expect(rubberBand(100000, 300)).toBeLessThan(300);
  });
});
