// Regen und Schnee als Canvas über der Karte (unter den Markern). Liest den gewünschten Niederschlag aus
// setPrecipitation() und läuft nur, solange etwas fällt. Reine Optik: Zufall hier ist echter Zufall.

import { currentPrecipitation, type PrecipitationKind } from './atmosphere';

interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  phase: number;
}

const RAIN_PER_PIXEL = 1 / 1700;
const SNOW_PER_PIXEL = 1 / 3800;

export class PrecipitationLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private particles: Particle[] = [];
  private kind: PrecipitationKind = 'none';
  private frame = 0;
  private last = 0;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private destroyed = false;

  constructor(parent: HTMLElement, before: Node | null) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-precipitation';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.insertBefore(this.canvas, before);
    this.g = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** Vom Neuzeichnen der Karte aufgerufen: startet die Animation, wenn etwas fällt. */
  sync(): void {
    const p = currentPrecipitation();
    if (p.kind !== 'none' && p.intensity > 0 && !this.frame && !this.destroyed) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }

  private readonly resize = () => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect?.width || window.innerWidth));
    this.height = Math.max(1, Math.round(rect?.height || window.innerHeight));
    this.ratio = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
  };

  private spawn(kind: PrecipitationKind, anywhere: boolean): Particle {
    return {
      x: Math.random() * this.width,
      y: anywhere ? Math.random() * this.height : -20 - Math.random() * 40,
      speed: kind === 'snow' ? 30 + Math.random() * 50 : 700 + Math.random() * 500,
      size: kind === 'snow' ? 1 + Math.random() * 2.2 : 10 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    const g = this.g;
    if (!g || this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const p = currentPrecipitation();
    const active = p.kind !== 'none' && p.intensity > 0;
    if (active && p.kind !== this.kind) {
      this.kind = p.kind;
      this.particles = [];
    }
    const density = this.kind === 'snow' ? SNOW_PER_PIXEL : RAIN_PER_PIXEL;
    const target = active ? Math.round(this.width * this.height * density * p.intensity * (this.reduced ? 0.3 : 1)) : 0;
    while (this.particles.length < target) this.particles.push(this.spawn(this.kind, true));

    const wind = p.wind ?? 0.15;
    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    g.clearRect(0, 0, this.width, this.height);
    const slow = this.reduced ? 0.4 : 1;
    if (this.kind === 'rain') {
      g.strokeStyle = 'rgba(190, 214, 255, 0.5)';
      g.lineWidth = 1.3;
      g.beginPath();
    } else {
      g.fillStyle = 'rgba(235, 242, 255, 0.78)';
    }
    const keep: Particle[] = [];
    for (const q of this.particles) {
      if (this.kind === 'rain') {
        const dx = wind * 0.35 * q.speed * dt * slow;
        q.x += dx;
        q.y += q.speed * dt * slow;
        g.moveTo(q.x, q.y);
        g.lineTo(q.x - wind * q.size * 0.35, q.y - q.size);
      } else {
        q.phase += dt * 1.5;
        q.x += (Math.sin(q.phase) * 18 + wind * 40) * dt * slow;
        q.y += q.speed * dt * slow;
        g.beginPath();
        g.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        g.fill();
      }
      const out = q.y > this.height + 20 || q.x < -40 || q.x > this.width + 40;
      // Fällt weniger, als da ist, verschwinden Tropfen unten und kommen nicht nach.
      if (out) {
        if (keep.length + 1 <= target) keep.push(this.spawn(this.kind, false));
      } else {
        keep.push(q);
      }
    }
    if (this.kind === 'rain') g.stroke();
    this.particles = keep;
    if (this.particles.length > 0 || active) this.frame = requestAnimationFrame(this.tick);
    else g.clearRect(0, 0, this.width, this.height);
  };
}
