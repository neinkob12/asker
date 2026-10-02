// Gedämpfte Feder wie bei SwiftUI (`.spring(response:dampingFraction:)`): Bewegungen im Handy (Seiten, Apps, Blätter,
// Island) laufen über Federn statt über feste Kurven. Eine Feder übernimmt eine Startgeschwindigkeit (z.B. aus einer
// Wischgeste), lässt sich mitten in der Bewegung auf ein neues Ziel umlenken, ohne zu springen, und rechnet exakt
// (geschlossene Lösung der Schwingungsgleichung), egal wie lang ein Bild dauert. Rein rechnerisch, ohne DOM und ohne
// Zeitquelle; die Bilder treibt motion.ts an. Getestet in spring.test.ts.
//
//   response         Dauer einer ungedämpften Schwingung in Sekunden (größer = träger)
//   dampingFraction  1 = kritisch gedämpft (kein Überschwingen), kleiner = federt nach, größer = schleicht ans Ziel

export interface SpringConfig {
  response: number;
  dampingFraction: number;
}

/**
 * Federwerte des Handys. Ausgangspunkt waren die Werte aus Auftrag 22, nach Gefühl am laufenden Spiel justiert:
 * - push: Seiten vor und zurück. Fast kritisch gedämpft (0,86), damit die Seite nicht über den Rand hinausschwingt
 *   (sonst blitzt die Vorseite rechts auf); 0,35 s fühlt sich an wie UINavigationController.
 * - app: App öffnen und schließen. Etwas träger (0,45 s) und mit hauchzartem Nachfedern (0,8, ca. 1,5 %), das ist
 *   das "Aufploppen" aus der Kachel.
 * - sheet: Blätter. Zwischen beiden (0,4 s, 0,85): Rasten sollen spürbar, aber nicht wackelig sein.
 * - island: Dynamic Island. Kurz und federnd (0,3 s, 0,7, ca. 5 % Überschwingen), die Island darf "lebendig" wirken.
 * - snap: kleine Rückmeldungen (Zeile zurückschnappen, Banner zurück): schnell und ohne Nachfedern.
 */
export const SPRINGS = {
  push: { response: 0.35, dampingFraction: 0.86 },
  app: { response: 0.45, dampingFraction: 0.8 },
  sheet: { response: 0.4, dampingFraction: 0.85 },
  island: { response: 0.3, dampingFraction: 0.7 },
  snap: { response: 0.25, dampingFraction: 1 },
} as const satisfies Record<string, SpringConfig>;

/** Ab hier gilt die Feder als in Ruhe (bei Fortschritt 0–1: ein Tausendstel, kaum mehr als ein Pixel). */
const REST_DELTA = 0.001;
const REST_SPEED = 0.01;

/** Zustand nach t Sekunden für Auslenkung x0 (Wert minus Ziel) und Geschwindigkeit v0. */
export function springState(config: SpringConfig, x0: number, v0: number, t: number): { x: number; v: number } {
  const response = Math.max(0.01, config.response);
  const zeta = Math.max(0, config.dampingFraction);
  const w0 = (2 * Math.PI) / response;
  if (zeta < 1) {
    // Unterdämpft: abklingende Schwingung
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * t);
    const a = x0;
    const b = (v0 + zeta * w0 * x0) / wd;
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    const x = decay * (a * cos + b * sin);
    const v = decay * (-zeta * w0 * (a * cos + b * sin) + (-a * wd * sin + b * wd * cos));
    return { x, v };
  }
  if (zeta === 1) {
    // Kritisch gedämpft: schnellstes Ankommen ohne Überschwingen
    const decay = Math.exp(-w0 * t);
    const b = v0 + w0 * x0;
    return { x: (x0 + b * t) * decay, v: (b - w0 * (x0 + b * t)) * decay };
  }
  // Überdämpft: kriecht ans Ziel
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - root);
  const r2 = -w0 * (zeta + root);
  const c2 = (v0 - r1 * x0) / (r2 - r1);
  const c1 = x0 - c2;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { x: c1 * e1 + c2 * e2, v: c1 * r1 * e1 + c2 * r2 * e2 };
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  config: SpringConfig;
  /**
   * Ab dieser Auslenkung und Geschwindigkeit ist die Feder in Ruhe. Die Vorgabe passt zu Werten von 0 bis 1; bei
   * Pixeln ist sie viel zu streng (ein Blatt wäre erst nach über einer Sekunde "fertig", obwohl man es nach 0,3 s
   * nicht mehr sieht): dort ca. 0,5 setzen (animateValue: precision).
   */
  restDelta = REST_DELTA;
  restSpeed = REST_SPEED;

  constructor(config: SpringConfig, value = 0, target = value) {
    this.config = config;
    this.value = value;
    this.target = target;
  }

  /**
   * Neues Ziel. Der Wert bleibt, wo er ist (kein Sprung); die Geschwindigkeit läuft weiter oder wird übernommen,
   * z.B. aus einer Geste (Einheit: Wert pro Sekunde).
   */
  setTarget(target: number, velocity = this.velocity): this {
    this.target = target;
    this.velocity = velocity;
    return this;
  }

  /** Sofort auf einen Wert setzen, ohne Bewegung (z.B. während eine Geste die Seite führt). */
  jump(value: number, target = value): this {
    this.value = value;
    this.target = target;
    this.velocity = 0;
    return this;
  }

  /** Um dt Sekunden weiterrechnen, liefert den neuen Wert. Exakt für jede Bilddauer. */
  step(dt: number): number {
    if (this.settled) return this.value;
    const { x, v } = springState(this.config, this.value - this.target, this.velocity, Math.max(0, dt));
    this.value = this.target + x;
    this.velocity = v;
    if (this.settled) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }

  /** In Ruhe am Ziel? */
  get settled(): boolean {
    return Math.abs(this.value - this.target) < this.restDelta && Math.abs(this.velocity) < this.restSpeed;
  }
}

/**
 * Feder als CSS-Kurve (`linear(...)`) mit passender Dauer, für Bewegungen, die CSS selbst übernimmt (z.B. HUD und
 * Overlays über der Karte, die dem Ein- und Ausklappen des Handys folgen). Von 0 nach 1 ohne Startgeschwindigkeit;
 * die Dauer endet, sobald die Feder in Ruhe ist. `points` = Stützstellen (mehr = genauer, 40 reichen für ein Nachfedern).
 */
export function springEasing(config: SpringConfig, points = 40): { easing: string; durationMs: number } {
  let t = 0;
  const dt = 1 / 240;
  while (t < 4) {
    const { x, v } = springState(config, -1, 0, t);
    if (Math.abs(x) < REST_DELTA && Math.abs(v) < REST_SPEED) break;
    t += dt;
  }
  const duration = Math.max(dt, t);
  const stops: string[] = [];
  for (let i = 0; i <= points; i++) {
    const value = i === points ? 1 : 1 + springState(config, -1, 0, (duration * i) / points).x;
    stops.push(String(Math.round(value * 10000) / 10000));
  }
  return { easing: `linear(${stops.join(', ')})`, durationMs: Math.round(duration * 1000) };
}
