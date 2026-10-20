// Bausteine für Minispiele in Innenräumen (Auftrag 48, Teil D): Partikel, weicher Lichtfleck, Taschenlampe mit
// sichtbarem Kegel und Staub im Strahl, Licht durch Ritzen (unter Türen und Toren), Takt des Blaulichts und ein
// kurzer Stillstand bei Treffern (Hit-Stop). Genutzt von Razzia (`games/stash/`) und Bude (`games/search/`).
// Nur Optik: Math.random nur für Partikel, nie für den Ablauf. Alles, was hier entsteht, räumt disposeObject aus
// scene3d.ts mit der Szene auf; Texturen gibt dispose() der jeweiligen Bausteine frei.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SpotLight,
  type Vector3,
} from 'three';

/** Blaulicht im Wechsel mit Rot (Streife), wie in der Jagd. */
export const POLICE_BLUE = 0x3a7bff;
export const POLICE_RED = 0xff4a3a;

/** Takt des Blaulichts: an (blau) oder aus (rot), `rate` Wechsel pro Sekunde. */
export function policeBlink(t: number, rate = 2.2): boolean {
  return (t * rate) % 1 < 0.5;
}

/** Farbe des Blaulichts zum Zeitpunkt t. */
export function policeColor(t: number, rate = 2.2): number {
  return policeBlink(t, rate) ? POLICE_BLUE : POLICE_RED;
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

/** Weicher Fleck (Partikel, Lichtschein): weiß, nach außen durchsichtig. */
export function softDotTexture(): CanvasTexture {
  const { c, g } = canvas(64, 64);
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

/** Lichtstreifen für Ritzen: in der Mitte der Länge nach hell, quer schnell auslaufend. */
function crackTexture(): CanvasTexture {
  const { c, g } = canvas(64, 32);
  if (g) {
    const across = g.createLinearGradient(0, 0, 0, 32);
    across.addColorStop(0, 'rgba(255,255,255,1)');
    across.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    across.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = across;
    g.fillRect(0, 0, 64, 32);
    g.globalCompositeOperation = 'destination-in';
    const along = g.createLinearGradient(0, 0, 64, 0);
    along.addColorStop(0, 'rgba(0,0,0,0)');
    along.addColorStop(0.15, 'rgba(0,0,0,1)');
    along.addColorStop(0.85, 'rgba(0,0,0,1)');
    along.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = along;
    g.fillRect(0, 0, 64, 32);
  }
  return new CanvasTexture(c);
}

/** Lichtkegel der Lampe: an der Spitze hell, nach vorn auslaufend. */
function beamTexture(): CanvasTexture {
  const { c, g } = canvas(4, 128);
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.12, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
  }
  return new CanvasTexture(c);
}

// ---------------------------------------------------------------------------------------------- Partikel

export interface ParticleOptions {
  /** Höchstzahl gleichzeitig (Ring: die ältesten werden überschrieben). */
  count?: number;
  /** Größe in Metern. */
  size?: number;
  /** Tiefer fällt nichts (Boden). */
  floor?: number;
}

/**
 * Ein Punkt-System für Funken, Staub, Spritzer und Brösel: ein Draw-Call, nichts wird pro Bild angelegt. Farben
 * verblassen über die Lebenszeit, Schwerkraft je Teilchen.
 */
export class ParticlePool {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly gravity: Float32Array;
  private readonly floor: number;
  private readonly tint = new Color();
  private next = 0;
  private live = 0;

  constructor(texture: CanvasTexture, options: ParticleOptions = {}) {
    const n = options.count ?? 200;
    this.floor = options.floor ?? 0.01;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.gravity = new Float32Array(n);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    geometry.setAttribute('color', new BufferAttribute(this.col, 3));
    this.points = new Points(
      geometry,
      new PointsMaterial({
        size: options.size ?? 0.1,
        map: texture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -99;
  }

  /** n Teilchen an (x, y, z): Tempo nach außen und oben, Schwerkraft, Lebenszeit in Sekunden. */
  emit(
    x: number,
    y: number,
    z: number,
    n: number,
    color: number | Color,
    speed: number,
    gravity: number,
    life: number,
  ): void {
    const c = typeof color === 'number' ? this.tint.setHex(color) : color;
    const size = this.life.length;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % size;
      if (this.life[i] <= 0) this.live += 1;
      this.pos.set(
        [x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.08, z + (Math.random() - 0.5) * 0.2],
        i * 3,
      );
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.8;
      this.vel.set([Math.cos(a) * speed * 0.7, up * speed, Math.sin(a) * speed * 0.5], i * 3);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.max[i] = this.life[i];
      this.gravity[i] = gravity;
    }
  }

  /** Alle Teilchen weg (Raumwechsel). */
  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < this.life.length; i++) this.pos[i * 3 + 1] = -99;
    this.live = 0;
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  update(dt: number): void {
    // Nichts unterwegs: auch nichts hochladen.
    if (this.live <= 0) return;
    let live = 0;
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -99;
        continue;
      }
      live += 1;
      this.vel[j + 1] -= this.gravity[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] = Math.max(this.floor, this.pos[j + 1] + this.vel[j + 1] * dt);
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const fade = 0.97 + 0.025 * (this.life[i] / this.max[i]);
      this.col[j] *= fade;
      this.col[j + 1] *= fade;
      this.col[j + 2] *= fade;
    }
    this.live = live;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------- Ritzen

export interface CrackLight {
  mesh: Mesh;
  /** Helligkeit (0 aus) und Farbe des Lichts von draußen. */
  set(opacity: number, color: number): void;
  dispose(): void;
}

/**
 * Licht, das unter einer Tür oder einem Tor durchfällt: ein flacher Streifen auf dem Boden (Länge w, Tiefe d), an der
 * Ritze hell, in den Raum hinein auslaufend. Die Ritze liegt an der Kante −z (nach dem Drehen: an der Tür).
 */
export function createCrackLight(w: number, d: number): CrackLight {
  const texture = crackTexture();
  const material = new MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(new PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return {
    mesh,
    set: (opacity, color) => {
      material.opacity = Math.max(0, opacity);
      material.color.setHex(color);
      mesh.visible = opacity > 0.005;
    },
    dispose: () => texture.dispose(),
  };
}

// ---------------------------------------------------------------------------------------------- Taschenlampe

export interface FlashlightOptions {
  /** Halber Öffnungswinkel (Bogenmaß). */
  angle: number;
  /** Reichweite des Lichts und Länge des sichtbaren Kegels (Meter). */
  range: number;
  cone?: number;
  power: number;
  /** Weicher Rand (0 hart, 1 ganz weich). */
  penumbra?: number;
  color?: number;
  /** Schattenkarte (0: ohne Schatten). */
  shadow?: number;
  /** Staubkörner im Strahl. */
  dust?: number;
  reduced?: boolean;
}

export interface Flashlight {
  light: SpotLight;
  /** Gruppe mit Kegel und Staub; hängt in die Szene. */
  beam: Group;
  /** Von der Hand auf einen Punkt richten. */
  aim(from: Vector3, to: Vector3): void;
  /** Helligkeit 0 bis 1 (Flackern, aus). */
  setPower(k: number): void;
  /** Staub treiben lassen. */
  update(t: number): void;
  dispose(): void;
}

/** Taschenlampe: SpotLight mit Schatten, sichtbarer Kegel und Staub, der im Strahl treibt. */
export function createFlashlight(o: FlashlightOptions): Flashlight {
  const color = o.color ?? 0xfff0d6;
  const coneLen = o.cone ?? o.range * 0.65;
  const light = new SpotLight(color, o.power, o.range * 1.6, o.angle, o.penumbra ?? 0.75, 1.3);
  if (o.shadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(o.shadow, o.shadow);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = o.range * 2;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.015;
  }
  const beamTex = beamTexture();
  const dot = softDotTexture();
  const beam = new Group();
  const coneGeo = new ConeGeometry(Math.tan(o.angle) * coneLen, coneLen, 24, 1, true);
  coneGeo.translate(0, -coneLen / 2, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const coneOpacity = o.reduced ? 0.03 : 0.055;
  const coneMat = new MeshBasicMaterial({
    map: beamTex,
    color,
    transparent: true,
    opacity: coneOpacity,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  beam.add(new Mesh(coneGeo, coneMat));
  const n = o.dust ?? 90;
  const dustPos = new Float32Array(n * 3);
  const dustSeed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) dustSeed.set([Math.random(), Math.random() * Math.PI * 2, Math.random()], i * 3);
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
  const dustMat = new PointsMaterial({
    size: 0.016,
    map: dot,
    color: 0xfff3dc,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  beam.add(dust);
  const tanA = Math.tan(o.angle) * 0.9;
  return {
    light,
    beam,
    aim: (from, to) => {
      light.position.copy(from);
      light.target.position.copy(to);
      light.target.updateMatrixWorld();
      beam.position.copy(from);
      beam.lookAt(to);
    },
    setPower: (k) => {
      light.intensity = o.power * k;
      coneMat.opacity = coneOpacity * k;
      dustMat.opacity = 0.8 * k;
    },
    update: (t) => {
      for (let i = 0; i < n; i++) {
        const z = 0.4 + ((dustSeed[i * 3 + 2] * coneLen * 0.9 + t * 0.05) % (coneLen * 0.9));
        const a = dustSeed[i * 3 + 1] + t * 0.15 * (i % 2 ? 1 : -1);
        const r = Math.sqrt(dustSeed[i * 3]) * z * tanA;
        dustPos[i * 3] = Math.cos(a) * r;
        dustPos[i * 3 + 1] = Math.sin(a) * r + Math.sin(t * 0.7 + i) * 0.02;
        dustPos[i * 3 + 2] = z;
      }
      dustGeo.attributes.position.needsUpdate = true;
    },
    dispose: () => {
      beamTex.dispose();
      dot.dispose();
      light.shadow.map?.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------- Hit-Stop

/**
 * Kurzer Stillstand bei Treffern (40 bis 90 ms): `hold` hält die Welt an, `filter` gibt solange 0 statt dt zurück.
 * Mit reduzierter Bewegung halb so lang. Gehört eigentlich in einen gemeinsamen kit/juice.ts (Teil F); bis dahin hier.
 */
export class HitStop {
  private left = 0;
  constructor(private readonly reduced = false) {}
  hold(seconds: number): void {
    this.left = Math.max(this.left, this.reduced ? seconds / 2 : seconds);
  }
  get active(): boolean {
    return this.left > 0;
  }
  filter(dt: number): number {
    if (this.left <= 0) return dt;
    const used = Math.min(this.left, dt);
    this.left -= used;
    return dt - used;
  }
}
