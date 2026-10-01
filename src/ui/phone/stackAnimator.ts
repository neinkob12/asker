// Übergänge zwischen den Seiten des Handys, angetrieben von Federn (spring.ts) und nur über transform und opacity
// (dazu beim App-Öffnen die Ecken per clip-path, weil die Kachel zur Bildschirmform wird):
//
//   push/pop        neue Seite von rechts, die alte wandert auf −30 % und dunkelt ab; der Titel der Vorseite wandert
//                   in den Zurück-Knopf der neuen Seite (und beim Zurückgehen wieder hinaus)
//   open/close      App wächst aus ihrer Kachel auf den Bildschirm (Ecken vom Kachel- auf den Bildschirmradius), der
//                   Startbildschirm rückt dahinter auf 0,94 und dunkelt ab; schließen schrumpft zurück auf die Kachel,
//                   ist sie nicht zu sehen, in die Mitte
//   replace/switch  kurze Überblendung (anderer Spot, anderer Chat, Sprung in eine andere App)
//
// Jeder Übergang hat genau einen Federwert: push/pop die Lage der vorderen Seite (0 = da, 1 = rechts draußen),
// open/close die Öffnung der App (0 = Kachel, 1 = Vollbild), replace/switch die Deckkraft der alten Seite. Gesten
// führen diesen Wert direkt (Rand-Wischen, Home-Balken) und übergeben beim Loslassen ihre Geschwindigkeit; ein Übergang
// in die Gegenrichtung (zurück, während die Seite noch hereinfährt) lenkt dieselbe Feder um, ohne Sprung.
// Bei "Weniger Bewegung" bleibt nur Überblenden: kein Zoom, keine Parallaxe, kein wandernder Titel.

import { animateValue, type Motion, reducedMotion } from './motion';
import type { NavTransition } from './navModel';
import { SPRINGS, Spring, type SpringConfig } from './spring';

export type StackMotionKind = Exclude<NavTransition, 'none'>;

/** Wie weit die Vorseite beim Push nach links wandert (Anteil der Breite) und wie stark sie abdunkelt. */
const PARALLAX = 0.3;
const PUSH_DIM = 0.16;
/** Startbildschirm hinter einer offenen App: verkleinert und abgedunkelt. */
const HOME_SCALE = 0.94;
const HOME_DIM = 0.32;
/** Das Kachel-Symbol über der wachsenden App blendet in diesem ersten Teil des Öffnens aus. */
const ICON_FADE = 0.4;
/** Ohne sichtbare Kachel schrumpft die App auf ein Quadrat dieser Größe in der Mitte. */
const CENTER_TILE = 64;
/** Alte Seite beim Sprung in eine andere App: schrumpft leicht, während sie ausblendet. */
const SWITCH_SCALE = 0.96;

/** Start- und Zielwert der Feder je Übergang. */
const RANGE: Record<StackMotionKind, readonly [number, number]> = {
  push: [1, 0],
  pop: [0, 1],
  open: [0, 1],
  close: [1, 0],
  replace: [1, 0],
  switch: [1, 0],
};

const CONFIG: Record<StackMotionKind, SpringConfig> = {
  push: SPRINGS.push,
  pop: SPRINGS.push,
  open: SPRINGS.app,
  close: SPRINGS.app,
  replace: SPRINGS.snap,
  switch: SPRINGS.app,
};

/** Übergänge, die sich gegenseitig umkehren (gleiche Seiten, gleicher Wert, andere Richtung). */
const FAMILY: Record<StackMotionKind, string> = {
  push: 'slide',
  pop: 'slide',
  open: 'zoom',
  close: 'zoom',
  replace: 'fade',
  switch: 'fade',
};

export interface StackPlan {
  kind: StackMotionKind;
  /** Vordere Schicht (bewegt sich), hintere Schicht (wird freigelegt oder verdeckt). */
  front: string;
  back: string;
  /** App, deren Kachel beim Öffnen und Schließen das Ziel ist ('tab:<id>' oder App-ID). */
  appId: string | null;
  /** Seiten, die nur noch für diesen Übergang montiert sind. */
  exiting: string[];
}

interface Tile {
  x: number;
  y: number;
  size: number;
  radius: number;
  element: HTMLElement | null;
}

interface TitleMorph {
  label: HTMLElement;
  title: HTMLElement;
  /** Linke Mitte von Titel (auf der Vorseite) und Zurück-Knopf (auf der neuen Seite), in Ruhe. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Größe des Titels im Verhältnis zur Beschriftung des Zurück-Knopfs. */
  scale: number;
}

interface Active {
  kind: StackMotionKind;
  front: string;
  back: string;
  exiting: string[];
  spring: Spring;
  motion: Motion | null;
  interactive: boolean;
  /** Von einer Geste begonnen: Der folgende Wechsel im Stapel führt sie zu Ende, egal wie er heißt. */
  gesture: boolean;
  reduced: boolean;
  width: number;
  height: number;
  screenRadius: number;
  tile: Tile | null;
  icon: HTMLElement | null;
  titles: TitleMorph | null;
  touched: Set<HTMLElement>;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function relativeRect(element: Element, container: Element) {
  const r = element.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  return { x: r.left - c.left, y: r.top - c.top, width: r.width, height: r.height };
}

export class StackAnimator {
  /** Montierte Seiten (Schlüssel → Element), von PageStack gepflegt. */
  readonly layers = new Map<string, HTMLElement>();
  /** Fläche aller Seiten (für Maße). */
  container: HTMLElement | null = null;
  /** Ein Übergang ist fertig: Seiten, die nur für ihn montiert waren, können weg. */
  onSettled: (exiting: string[]) => void = () => {};
  /** Eine stillstehende Seite wird gleich sichtbar (Geste, Übergang): einmal frisch zeichnen. */
  onReveal: (key: string) => void = () => {};

  private active: Active | null = null;
  private topKey = 'home';

  /** Läuft gerade ein Übergang (oder eine Geste)? */
  get busy(): boolean {
    return this.active !== null;
  }

  /** Nach jedem Zeichnen: nur die oberste Seite (und die eines laufenden Übergangs) ist sichtbar. */
  layout(topKey: string): void {
    this.topKey = topKey;
    const a = this.active;
    for (const [key, element] of this.layers) {
      const visible = key === topKey || (a !== null && (key === a.front || key === a.back));
      element.classList.toggle('is-top', key === topKey);
      element.classList.toggle('is-hidden', !visible);
      element.classList.toggle('is-leaving', !!a?.exiting.includes(key));
      // Hinter einem offenen Blatt (data-modal, siehe Sheet.tsx) bleibt auch die oberste Seite inert.
      const blocked = key !== topKey || element.hasAttribute('data-modal');
      element.inert = blocked;
      if (blocked) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
    }
  }

  /** Übergang nach einem Wechsel im Stapel starten (oder einen laufenden in die neue Richtung lenken). */
  start(plan: StackPlan): void {
    const prev = this.active;
    const sameLayers = prev && prev.front === plan.front && prev.back === plan.back;
    if (prev && sameLayers && (prev.gesture || FAMILY[prev.kind] === FAMILY[plan.kind])) {
      // Umkehr (zurück, während die Seite noch hereinfährt) oder Abschluss einer Geste: dieselbe Feder weiter.
      // (Rand-Wischen an der Wurzel einer App schiebt die Seite zum Startbildschirm, statt zu schrumpfen.)
      if (!prev.gesture) prev.kind = plan.kind;
      prev.exiting = plan.exiting;
      if (!prev.interactive) this.run(prev, RANGE[plan.kind][1]);
      this.layout(this.topKey);
      return;
    }
    if (prev) this.finish(prev);
    const active = this.prepare(plan.kind, plan.front, plan.back, plan.appId, plan.exiting);
    if (!active) return;
    this.apply(active, RANGE[plan.kind][0]);
    this.layout(this.topKey);
    this.run(active, RANGE[plan.kind][1]);
  }

  /**
   * Geste beginnt: Rand-Wischen (pop) oder Home-Balken (close). Die Geste führt danach den Wert mit drag();
   * end() lässt los (mit Geschwindigkeit in Wert pro Sekunde).
   */
  beginGesture(kind: 'pop' | 'close', front: string, back: string, appId: string | null): boolean {
    if (this.active) this.finish(this.active);
    const active = this.prepare(kind, front, back, appId, []);
    if (!active) return false;
    active.interactive = true;
    active.gesture = true;
    active.spring.jump(RANGE[kind][0]);
    this.apply(active, active.spring.value);
    this.layout(this.topKey);
    return true;
  }

  /** Wert aus der Geste (pop: Lage 0–1, close: Öffnung 1–0). */
  drag(value: number): void {
    const a = this.active;
    if (!a?.interactive) return;
    a.spring.jump(value);
    this.apply(a, value);
  }

  /**
   * Geste losgelassen: mit Schwung zum Ziel (commit) oder zurückfedern. Wird committet, folgt der Wechsel im Stapel.
   * false, wenn die Geste inzwischen von einem anderen Übergang abgelöst wurde (dann nichts mehr auslösen).
   */
  endGesture(commit: boolean, velocity: number): boolean {
    const a = this.active;
    if (!a?.interactive) return false;
    a.interactive = false;
    const [from, to] = RANGE[a.kind];
    a.spring.velocity = velocity;
    this.run(a, commit ? to : from);
    return true;
  }

  /** Läuft gerade eine Geste? */
  get gesturing(): boolean {
    return this.active?.interactive === true;
  }

  /** Alles sofort beenden (z.B. wenn das Handy weggelegt wird). */
  stop(): void {
    if (this.active) this.finish(this.active);
  }

  private prepare(
    kind: StackMotionKind,
    frontKey: string,
    backKey: string,
    appId: string | null,
    exiting: string[],
  ): Active | null {
    const front = this.layers.get(frontKey);
    const back = this.layers.get(backKey);
    const container = this.container;
    if (!front || !back || !container) return null;
    const reduced = reducedMotion();
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    const screen = container.closest('.phone__screen') ?? container;
    const screenRadius = Number.parseFloat(getComputedStyle(screen).borderTopLeftRadius) || 0;
    const active: Active = {
      kind,
      front: frontKey,
      back: backKey,
      exiting,
      spring: new Spring(CONFIG[kind], RANGE[kind][0]),
      motion: null,
      interactive: false,
      gesture: false,
      reduced,
      width,
      height,
      screenRadius,
      tile: null,
      icon: null,
      titles: null,
      touched: new Set([front, back]),
    };
    if (!reduced && (kind === 'open' || kind === 'close')) {
      active.tile = this.findTile(appId, back, container);
      if (active.tile?.element) active.icon = this.iconOverlay(active.tile, front, width, height);
      front.style.transformOrigin = '0 0';
      back.style.transformOrigin = '50% 50%';
    }
    if (!reduced && (kind === 'push' || kind === 'pop')) active.titles = this.findTitles(front, back, container);
    if (backKey !== this.topKey) this.onReveal(backKey);
    front.style.willChange = reduced ? 'opacity' : 'transform, opacity';
    if (!reduced) back.style.willChange = 'transform';
    front.classList.add('is-front');
    this.active = active;
    return active;
  }

  /** Kachel der App auf dem Startbildschirm (sofern sichtbar), relativ zur Fläche der Seiten. */
  private findTile(appId: string | null, home: HTMLElement, container: HTMLElement): Tile | null {
    if (!appId) return null;
    const button = home.querySelector<HTMLElement>(`[data-app-id="${CSS.escape(appId)}"]`);
    const tile = button?.querySelector<HTMLElement>('.phone__tile') ?? null;
    if (!tile) return null;
    const r = relativeRect(tile, container);
    // Außerhalb des sichtbaren Bereichs (weggescrollt): in die Mitte schrumpfen
    const scroller = tile.closest('.phone__home-scroll');
    if (scroller && !tile.closest('.phone__dock')) {
      const s = relativeRect(scroller, container);
      if (r.y < s.y || r.y + r.height > s.y + s.height) return null;
    }
    if (r.width <= 0) return null;
    return { x: r.x, y: r.y, size: r.width, radius: r.width * 0.225, element: tile };
  }

  /** Kopie der Kachel über der wachsenden App: zu Beginn sieht die App genau aus wie ihre Kachel. */
  private iconOverlay(tile: Tile, front: HTMLElement, width: number, height: number): HTMLElement | null {
    if (!tile.element) return null;
    const icon = tile.element.cloneNode(true) as HTMLElement;
    icon.classList.add('phone-page__icon');
    icon.removeAttribute('id');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.setProperty('--chip-size', `${tile.size}px`);
    icon.style.left = `${(width - tile.size) / 2}px`;
    icon.style.top = `${(height - tile.size) / 2}px`;
    icon.style.transform = `scale(${width / tile.size})`;
    front.appendChild(icon);
    return icon;
  }

  /** Großer Titel der Vorseite und Beschriftung des Zurück-Knopfs der neuen Seite (für den wandernden Titel). */
  private findTitles(front: HTMLElement, back: HTMLElement, container: HTMLElement): TitleMorph | null {
    const label = front.querySelector<HTMLElement>('.phone-screen__back span');
    const screen = back.querySelector<HTMLElement>('.phone-screen');
    if (!label || !screen) return null;
    const title = screen.classList.contains('is-collapsed')
      ? screen.querySelector<HTMLElement>('.phone-screen__center .phone-screen__title')
      : screen.querySelector<HTMLElement>('.phone-screen__large');
    if (!title || title.textContent?.trim() !== label.textContent?.trim()) return null;
    const l = relativeRect(label, container);
    const t = relativeRect(title, container);
    if (l.height <= 0 || t.height <= 0 || t.y + t.height < 0 || t.y > container.clientHeight) return null;
    label.style.transformOrigin = '0 50%';
    title.style.transformOrigin = '0 50%';
    label.style.willChange = 'transform, opacity';
    title.style.willChange = 'transform, opacity';
    return {
      label,
      title,
      from: { x: t.x, y: t.y + t.height / 2 },
      to: { x: l.x, y: l.y + l.height / 2 },
      scale: t.height / l.height,
    };
  }

  private run(active: Active, to: number): void {
    active.motion?.stop();
    const { motion } = animateValue({
      config: CONFIG[active.kind],
      from: active.spring.value,
      to,
      spring: active.spring,
      onFrame: (value) => this.apply(active, value),
      onRest: () => this.finish(active),
    });
    active.motion = motion;
  }

  /** Ein Bild eines Übergangs. */
  private apply(a: Active, value: number): void {
    const front = this.layers.get(a.front);
    const back = this.layers.get(a.back);
    if (!front || !back) return;
    switch (a.kind) {
      case 'push':
      case 'pop':
        this.applySlide(a, front, back, value);
        break;
      case 'open':
      case 'close':
        this.applyZoom(a, front, back, value);
        break;
      default: {
        // Alte Seite blendet aus und gibt die neue frei.
        front.style.opacity = String(clamp01(value));
        if (a.kind === 'switch' && !a.reduced)
          front.style.transform = `scale(${lerp(SWITCH_SCALE, 1, clamp01(value))})`;
      }
    }
  }

  /** Lage x der vorderen Seite: 0 = an ihrem Platz, 1 = rechts draußen. */
  private applySlide(a: Active, front: HTMLElement, back: HTMLElement, x: number): void {
    const shown = 1 - clamp01(x); // 0 = Vorseite allein, 1 = neue Seite ganz da
    if (a.reduced) {
      front.style.opacity = String(shown);
      return;
    }
    const frontOffset = Math.max(0, x) * a.width;
    const backOffset = -PARALLAX * a.width * shown;
    front.style.transform = `translate3d(${frontOffset}px,0,0)`;
    back.style.transform = `translate3d(${backOffset}px,0,0)`;
    setDim(back, PUSH_DIM * shown);
    const t = a.titles;
    if (t) {
      // Gemeinsamer Weg von Titel und Zurück-Knopf: vom großen Titel der Vorseite in die Leiste der neuen Seite.
      const px = lerp(t.from.x, t.to.x, shown);
      const py = lerp(t.from.y, t.to.y, shown);
      const labelScale = lerp(t.scale, 1, shown);
      t.label.style.transform = `translate(${px - (t.to.x + frontOffset)}px,${py - t.to.y}px) scale(${labelScale})`;
      t.label.style.opacity = String(clamp01((shown - 0.25) / 0.6));
      t.title.style.transform = `translate(${px - (t.from.x + backOffset)}px,${py - t.from.y}px) scale(${labelScale / t.scale})`;
      t.title.style.opacity = String(clamp01(1 - shown / 0.6));
    }
  }

  /** Öffnung z der App: 0 = so groß wie ihre Kachel, 1 = Vollbild. */
  private applyZoom(a: Active, front: HTMLElement, home: HTMLElement, z: number): void {
    const zc = clamp01(z);
    if (a.reduced) {
      front.style.opacity = String(zc);
      return;
    }
    const w0 = a.width;
    const h0 = a.height;
    const tile = a.tile ?? {
      x: (w0 - CENTER_TILE) / 2,
      y: (h0 - CENTER_TILE) / 2,
      size: CENTER_TILE,
      radius: CENTER_TILE * 0.225,
      element: null,
    };
    // Sichtbares Rechteck zwischen Kachel und Bildschirm; der Inhalt wird gleichmäßig mitskaliert.
    const x = lerp(tile.x, 0, zc);
    const y = lerp(tile.y, 0, zc);
    const w = lerp(tile.size, w0, zc);
    const h = lerp(tile.size, h0, zc);
    const k = w / w0;
    const top = y + h / 2 - (k * h0) / 2;
    front.style.transform = `translate3d(${x}px,${top}px,0) scale(${k})`;
    const inset = Math.max(0, h0 / 2 - h / (2 * k));
    const radius = lerp(tile.radius, a.screenRadius, zc) / k;
    front.style.clipPath = zc >= 1 ? '' : `inset(${inset}px 0px ${inset}px 0px round ${radius}px)`;
    if (a.icon) a.icon.style.opacity = String(clamp01(1 - zc / ICON_FADE));
    if (!a.tile) front.style.opacity = String(clamp01(zc / 0.3));
    home.style.transform = `scale(${lerp(1, HOME_SCALE, zc)})`;
    setDim(home, HOME_DIM * zc);
  }

  /** Übergang beenden: Stile zurücksetzen, nur die oberste Seite bleibt sichtbar. */
  private finish(active: Active): void {
    active.motion?.stop();
    if (this.active === active) this.active = null;
    for (const element of active.touched) {
      element.style.transform = '';
      element.style.transformOrigin = '';
      element.style.opacity = '';
      element.style.clipPath = '';
      element.style.willChange = '';
      element.classList.remove('is-front');
      setDim(element, 0);
    }
    active.icon?.remove();
    if (active.titles) {
      for (const el of [active.titles.label, active.titles.title]) {
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.opacity = '';
        el.style.willChange = '';
      }
    }
    this.layout(this.topKey);
    if (active.exiting.length > 0) this.onSettled(active.exiting);
  }
}

function setDim(layer: HTMLElement, amount: number): void {
  const dim = layer.querySelector<HTMLElement>(':scope > .phone-page__dim');
  if (!dim) return;
  dim.style.opacity = amount > 0.001 ? String(amount) : '';
  dim.style.visibility = amount > 0.001 ? 'visible' : '';
}
