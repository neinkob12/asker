// Szene der Verkehrskontrolle (Auftrag 47, neu in Auftrag 48, three.js): Du sitzt am Steuer und schaust nach links aus
// dem Fenster. Innen: Tür mit Verkleidung und Armlehne, Fensterrahmen mit A- und B-Säule, Dachhimmel mit Haltegriff,
// Außenspiegel, die Scheibe ist ein Stück heruntergelassen, die hintere Scheibe ist zu; auf beiden liegen Tropfen,
// in denen das Blaulicht aufblitzt (Glanzlichter getrennt, pro Bild in der Farbe des Blaulichts). Draußen: nasse
// Straße, Bordstein, Altbauten gegenüber, Laterne mit Lichtkegel, der Streifenwagen hinter dir, Regen. Der Beamte
// (officer.ts) steht am Fenster, geht nach hinten, funkt, leuchtet dir ins Gesicht; sein Gesicht ist das Porträt aus
// dem Look-System als Textur (faceTexture.ts). Nachbearbeitung: Bloom in halber Auflösung, Vignette und Körnung.
// Am Ende fährst du an (Gute Fahrt), gibst Gas (Flucht) oder er tritt zurück (Aussteigen). Nur Optik.

import {
  AdditiveBlending,
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Scene,
  Shape,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Look } from '../../../../../core';
import { buildCar, type CarParts, type DayPhase, disposeObject, lightScene, setBlueLight } from '../../kit/scene3d';
import type { Stage3d } from '../../kit/stage3d';
import { createFaceTextures, type Expression } from './faceTexture';
import type { TrafficState } from './model';
import { applyPose, blendPose, buildOfficer, POSES, type PoseName } from './officer';
import type { Vehicle, Visible } from './questions';
import { beamTexture, dropTextures, fabricTexture, facadeTextures, glowSprite } from './textures';

export interface TrafficSceneOptions {
  phase: DayPhase;
  rain: boolean;
  reduced: boolean;
  vehicle: Vehicle;
  visible: Visible;
  /** Aussehen des Beamten (Gesicht), Hautton und Farbe der Jacke wie im Porträt. */
  look: Look;
  skin: string;
  jacket: string;
  /** Fester Zufall für Tropfen und Fassaden. */
  seed: number;
}

/** Licht, das die Oberfläche über das Bild legt (nach update): Blaulicht, Blendung, Lage der Lampe auf dem Schirm. */
export interface SceneLight {
  /** Blau bzw. Rot des Blaulichts gerade (0 bis 1). */
  blue: number;
  red: number;
  /** Die Lampe blendet dich (0 bis 1) und wo ihre Linse auf dem Schirm ist (Anteil der Breite bzw. Höhe). */
  glare: number;
  glareX: number;
  glareY: number;
}

/** Was die Oberfläche zusätzlich zum Modell-Zustand sagt. */
export interface SceneCue {
  /** Ausdruck, den er gerade zeigt (aus Zustand und Reaktion der Oberfläche). */
  expression: Expression;
  /** Er hat gerade etwas gemerkt (ab hier rückt er heran und leuchtet), 0 bis 1 klingt ab. */
  alarm: number;
  /** Anspannung 0 bis 1 (Misstrauen): Atmen, wie nah er bleibt. */
  tension: number;
}

export interface TrafficScene {
  update(state: TrafficState, dt: number, cue: SceneCue): void;
  render(stage: Stage3d): void;
  resize(width: number, height: number): void;
  light: SceneLight;
  /** Kurzer Ruck der Kamera (Treffer, Klopfen), klingt von selbst ab. */
  shake(amount: number): void;
  /** Kamera zieht kurz heran (Treffer). */
  punch(amount: number): void;
  /** Für die Messung: Draw-Calls des letzten Bildes. */
  calls(): number;
  /** Für Entwicklung und Tests: Haltung und Lampe. */
  debug(): Record<string, unknown>;
  dispose(): void;
}

/** Wo der Beamte steht (Welt: x nach links negativ, z nach hinten positiv); face dreht die Figur (−π/2 = zum Auto). */
const SPOTS = {
  window: { x: -1.55, z: 0.12, face: -Math.PI / 2 },
  rear: { x: -1.6, z: 2.55, face: -Math.PI / 2 - 0.9 },
  radio: { x: -2.5, z: 1.05, face: -Math.PI / 2 + 0.35 },
  back: { x: -2.35, z: 0.6, face: -Math.PI / 2 + 0.15 },
};

/** Blaulicht im Doppelblitz: blau, blau, rot, rot (je Takt 0,9 s). */
function flash(t: number): { blue: number; red: number } {
  const p = (t / 0.9) % 1;
  const pulse = (a: number) => (p >= a && p < a + 0.09 ? 1 : p >= a + 0.09 && p < a + 0.16 ? 0.35 : 0);
  return { blue: Math.max(pulse(0), pulse(0.2)), red: Math.max(pulse(0.5), pulse(0.7)) };
}

/** Rahmen mit Loch als flache, abgerundete Form (in der Ebene der Tür: x = −z der Welt, y = Höhe). */
function frameShape(
  outer: [number, number, number, number],
  holes: { z0: number; z1: number; y0: number; y1: number; slant?: number; r: number }[],
): Shape {
  const [oz0, oz1, oy0, oy1] = outer;
  const s = new Shape();
  s.moveTo(-oz1, oy0);
  s.lineTo(-oz0, oy0);
  s.lineTo(-oz0, oy1);
  s.lineTo(-oz1, oy1);
  s.lineTo(-oz1, oy0);
  for (const h of holes) {
    const p = new Shape();
    const slant = h.slant ?? 0;
    // Gegen den Uhrzeigersinn: unten hinten, unten vorn, oben vorn (A-Säule schräg), oben hinten, mit runden Ecken.
    p.moveTo(-h.z1 + h.r, h.y0);
    p.lineTo(-h.z0 - h.r, h.y0);
    p.quadraticCurveTo(-h.z0, h.y0, -h.z0 + slant * 0.05, h.y0 + h.r);
    p.lineTo(-h.z0 - slant, h.y1 - h.r);
    p.quadraticCurveTo(-h.z0 - slant, h.y1, -h.z0 - slant - h.r, h.y1);
    p.lineTo(-h.z1 + h.r, h.y1);
    p.quadraticCurveTo(-h.z1, h.y1, -h.z1, h.y1 - h.r);
    p.lineTo(-h.z1, h.y0 + h.r);
    p.quadraticCurveTo(-h.z1, h.y0, -h.z1 + h.r, h.y0);
    s.holes.push(p);
  }
  return s;
}

/** Vignette und Körnung als letzter Schritt (Bild wie gemalt, Ränder dunkler). */
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    amount: { value: 0.045 },
    vignette: { value: 0.42 },
    flash: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float amount;
    uniform float vignette;
    uniform float flash;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, dot(d, d) * 2.2);
      c.rgb *= mix(1.0 - vignette, 1.0, v);
      c.rgb = mix(c.rgb, vec3(0.75, 0.08, 0.06), flash * (1.0 - v) * 0.55);
      c.rgb += (hash(vUv * 731.0) - 0.5) * amount;
      gl_FragColor = c;
    }`,
};

export function createTrafficScene(options: TrafficSceneOptions): TrafficScene {
  const { phase, rain, reduced } = options;
  const night = phase === 'night';
  const dusk = phase === 'dusk';
  const scene = new Scene();
  const camera = new PerspectiveCamera(58, 16 / 9, 0.03, 260);
  const sun = lightScene(scene, phase, { fogNear: 12, fogFar: night ? 70 : dusk ? 110 : 160 });
  // Keine Schatten: Sie kosten am Handy viel und fallen im Regen kaum auf.
  sun.castShadow = false;
  const glowMap = glowSprite();
  const beamMap = beamTexture();

  // Alles draußen hängt an einer Gruppe: Fährst du an, rollt sie nach hinten weg.
  const outside = new Group();
  scene.add(outside);

  // ---------------------------------------------------------------- Straße
  const wet = rain || night;
  const asphalt = new MeshStandardMaterial({
    color: night ? 0x16181d : 0x2a2d33,
    roughness: rain ? 0.18 : 0.85,
    metalness: rain ? 0.35 : 0.02,
  });
  const ground = new Mesh(new PlaneGeometry(220, 220), asphalt);
  ground.rotation.x = -Math.PI / 2;
  outside.add(ground);
  const walkMat = new MeshStandardMaterial({ color: night ? 0x35363a : 0x86847e, roughness: wet ? 0.45 : 0.95 });
  const walk = new Mesh(new PlaneGeometry(7, 220), walkMat);
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(-14.5, 0.13, 0);
  outside.add(walk);
  const curb = new Mesh(
    new BoxGeometry(0.3, 0.15, 220),
    new MeshStandardMaterial({ color: night ? 0x4e4f53 : 0xaaa79f }),
  );
  curb.position.set(-10.9, 0.075, 0);
  outside.add(curb);
  // Gehweg auf deiner Seite (hinter dem Beamten ist die Straße; rechts von dir der Bordstein).
  // Mittelstriche als ein Mesh (ein Draw-Call statt einem je Strich).
  const dashes: BufferGeometry[] = [];
  for (let z = -60; z < 60; z += 7)
    dashes.push(new PlaneGeometry(0.14, 3).rotateX(-Math.PI / 2).translate(-5.4, 0.01, z));
  const dashMesh = new Mesh(mergeGeometries(dashes), new MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.6 }));
  for (const g of dashes) g.dispose();
  outside.add(dashMesh);

  // ---------------------------------------------------------------- Häuser gegenüber
  const fac = facadeTextures(options.seed, night || dusk);
  const tints = [0xe2d6c2, 0xc7ae8f, 0xb4735a, 0xa5abb2, 0xd9c79d];
  const houseGeo = new BoxGeometry(1, 1, 1);
  const cornices: BufferGeometry[] = [];
  let z = -60;
  let k = 0;
  while (z < 70) {
    const w = 9 + (k % 3) * 2.5;
    const h = 15 + ((k * 7) % 4) * 1.5;
    const map = fac.map.clone();
    map.repeat.set(w / 9, 1);
    map.needsUpdate = true;
    const glowTex = fac.glow.clone();
    glowTex.repeat.set(w / 9, 1);
    glowTex.offset.x = (k * 0.37) % 1;
    glowTex.needsUpdate = true;
    const mat = new MeshStandardMaterial({
      color: tints[k % tints.length],
      map,
      emissiveMap: glowTex,
      emissive: 0xffffff,
      emissiveIntensity: night ? 0.55 : dusk ? 0.3 : 0,
      roughness: 0.85,
    });
    const house = new Mesh(houseGeo, mat);
    house.scale.set(10, h, w);
    house.position.set(-23, h / 2, z + w / 2);
    outside.add(house);
    cornices.push(new BoxGeometry(10.6, 0.5, w + 0.2).translate(-23, h + 0.25, z + w / 2));
    z += w + 0.15;
    k += 1;
  }
  // Gesimse aller Häuser als ein Mesh.
  outside.add(new Mesh(mergeGeometries(cornices), new MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.8 })));
  for (const g of cornices) g.dispose();

  // ---------------------------------------------------------------- Laterne (hinter dem Beamten, gibt ihm Kontur)
  const poleMat = new MeshStandardMaterial({ color: 0x2f3236, roughness: 0.5, metalness: 0.6 });
  const pole = new Mesh(new CylinderGeometry(0.06, 0.09, 6.2, 10), poleMat);
  pole.position.set(-4.6, 3.1, 4.2);
  outside.add(pole);
  const arm = new Mesh(new CylinderGeometry(0.04, 0.04, 1.4, 8), poleMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-4.0, 6.1, 4.2);
  outside.add(arm);
  const lampHead = new Mesh(
    new RoundedBoxGeometry(0.6, 0.16, 0.36, 2, 0.05),
    new MeshStandardMaterial({ color: 0x24272b, emissive: 0xffd9a0, emissiveIntensity: night || dusk ? 2.2 : 0 }),
  );
  lampHead.position.set(-3.4, 6.0, 4.2);
  outside.add(lampHead);
  if (night || dusk) {
    const street = new PointLight(0xffcf8f, night ? 26 : 12, 18, 1.6);
    street.position.set(-3.4, 5.6, 4.2);
    outside.add(street);
    const halo = new Sprite(
      new SpriteMaterial({
        map: glowMap,
        color: 0xffd39a,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.setScalar(2.2);
    halo.position.set(-3.4, 5.9, 4.2);
    outside.add(halo);
    const cone = new Mesh(
      new CylinderGeometry(0.2, 2.4, 5.8, 20, 1, true),
      new MeshBasicMaterial({
        map: beamMap,
        color: 0xffd39a,
        transparent: true,
        opacity: rain ? 0.22 : 0.12,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2,
        fog: false,
      }),
    );
    cone.position.set(-3.4, 3.0, 4.2);
    outside.add(cone);
  }

  // ---------------------------------------------------------------- Streifenwagen hinter dir, ein parkendes Auto
  const police: CarParts = buildCar('police', 0xf2f2f2);
  police.group.position.set(-2.4, 0, 8.4);
  police.group.rotation.y = 0.28;
  police.front.emissiveIntensity = night ? 2.4 : 0.8;
  outside.add(police.group);
  const policeGlow = new Sprite(
    new SpriteMaterial({
      map: glowMap,
      color: 0x3a7bff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  policeGlow.scale.setScalar(3.2);
  policeGlow.position.set(-2.4, 1.9, 8.2);
  outside.add(policeGlow);
  if (night) {
    for (const side of [-1, 1]) {
      const hl = new SpotLight(0xfff1d0, 120, 30, 0.45, 0.6, 1.4);
      hl.position.set(side * 0.7, 0.8, -2.2);
      hl.target.position.set(side * 0.4, 0, -25);
      police.group.add(hl, hl.target);
    }
  }
  const parked = buildCar('car', 0x5b6068);
  parked.group.position.set(-9.4, 0, -6);
  parked.group.rotation.y = Math.PI;
  parked.front.emissiveIntensity = 0;
  parked.rear.emissiveIntensity = 0;
  outside.add(parked.group);
  // Blaulicht draußen: färbt den Beamten von hinten, die Straße und den Innenraum.
  const blueLight = new PointLight(0x3a7bff, 0, 14, 1.5);
  blueLight.position.set(-2.2, 2.0, 6.5);
  outside.add(blueLight);

  // ---------------------------------------------------------------- Innenraum
  const interior = new Group();
  scene.add(interior);
  const isVan = options.vehicle === 'transporter';
  const sill = isVan ? 1.14 : 0.98;
  const roofY = isVan ? 1.98 : 1.55;
  const doorX = -0.9;
  const fabric = fabricTexture(options.seed);
  fabric.repeat.set(4, 4);
  // Innen dunkler als draußen, aber nicht schwarz: Kunststoff, Stoff und der helle Dachhimmel haben Form.
  const trimDark = new MeshStandardMaterial({ color: 0x272a30, roughness: 0.62, roughnessMap: fabric });
  const trimSoft = new MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.85 });
  const headliner = new MeshStandardMaterial({ color: night ? 0x8a8b90 : 0xd8d3c8, roughness: 0.95, map: fabric });
  const chrome = new MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.9 });
  const trimPlain = new MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.7 });
  const openZ0 = -0.62;
  const openZ1 = 0.92;
  const rearZ0 = 1.08;
  const rearZ1 = 1.62;
  // Fensterrahmen (Tür oben) mit dem Ausschnitt der vorderen und der hinteren Scheibe.
  const frame = new Mesh(
    new ExtrudeGeometry(
      frameShape(
        [-1.0, 2.0, sill - 0.04, roofY + 0.12],
        [
          { z0: openZ0, z1: openZ1, y0: sill, y1: roofY - 0.05, slant: 0.32, r: 0.07 },
          { z0: rearZ0, z1: rearZ1, y0: sill, y1: roofY - 0.06, r: 0.06 },
        ],
      ),
      { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 8 },
    ),
    trimDark,
  );
  frame.rotation.y = Math.PI / 2;
  frame.position.x = doorX - 0.05;
  interior.add(frame);
  // Türverkleidung unter dem Fenster: weich gepolstert, Armlehne, Griff, Fensterheber mit Lämpchen.
  const panel = new Mesh(new RoundedBoxGeometry(0.1, sill - 0.2, 2.5, 3, 0.04), trimSoft);
  panel.position.set(doorX, 0.2 + (sill - 0.2) / 2, 0.45);
  interior.add(panel);
  const sillTop = new Mesh(new RoundedBoxGeometry(0.16, 0.05, 2.5, 3, 0.02), trimPlain);
  sillTop.position.set(doorX + 0.02, sill - 0.015, 0.45);
  interior.add(sillTop);
  const armrest = new Mesh(new RoundedBoxGeometry(0.15, 0.07, 0.55, 3, 0.03), trimSoft);
  armrest.position.set(doorX + 0.09, sill - 0.2, 0.12);
  interior.add(armrest);
  const handle = new Mesh(new RoundedBoxGeometry(0.03, 0.035, 0.16, 2, 0.012), chrome);
  handle.position.set(doorX + 0.06, sill - 0.08, -0.32);
  interior.add(handle);
  const switchLed = new Mesh(
    new BoxGeometry(0.02, 0.006, 0.03),
    new MeshStandardMaterial({ color: 0x111111, emissive: 0xff9a3a, emissiveIntensity: 0.45 }),
  );
  switchLed.position.set(doorX + 0.14, sill - 0.16, 0.25);
  interior.add(switchLed);
  // Dachhimmel mit Haltegriff, Holm über der Tür.
  const roof = new Mesh(new BoxGeometry(2.1, 0.05, 2.9), headliner);
  roof.position.set(0.15, roofY + 0.08, 0.4);
  interior.add(roof);
  const grip = new Mesh(new TorusGeometry(0.07, 0.014, 8, 18, Math.PI), trimPlain);
  grip.rotation.set(0, Math.PI / 2, Math.PI);
  grip.position.set(doorX + 0.12, roofY + 0.03, 0.15);
  interior.add(grip);
  // Außenspiegel an der A-Säule.
  const mirror = new Mesh(
    new SphereGeometry(0.11, 16, 12),
    new MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.3, metalness: 0.4 }),
  );
  mirror.scale.set(0.55, 0.75, 1);
  mirror.position.set(doorX - 0.2, sill + 0.1, -0.74);
  interior.add(mirror);
  const mirrorGlass = new Mesh(
    new PlaneGeometry(0.1, 0.13),
    new MeshStandardMaterial({ color: 0xa8b8cc, roughness: 0.05, metalness: 1, emissive: 0x000000 }),
  );
  mirrorGlass.rotation.y = Math.PI / 2 - 0.5;
  mirrorGlass.position.set(doorX - 0.16, sill + 0.1, -0.68);
  interior.add(mirrorGlass);
  // Tagsüber kommt Licht durchs Fenster in den Innenraum; nachts nur das Blaulicht und der Tacho.
  const fill = new PointLight(night ? 0x4a6aa8 : 0xfff2dc, night ? 1.1 : 2.2, 3.2, 1.3);
  fill.position.set(-0.5, sill + 0.2, 0.3);
  interior.add(fill);
  // Licht aus dem Wagen aufs Gesicht des Beamten (Innenlicht, Tacho): nachts sonst nur ein Schatten vor dem Blaulicht.
  const faceFill = new PointLight(0xffe0bd, night ? 2.4 : dusk ? 1.2 : 0, 2.6, 1.2);
  faceFill.position.set(doorX + 0.15, sill + 0.35, 0.05);
  interior.add(faceFill);
  const dashGlow = new PointLight(0x4a9cff, night ? 1.6 : 0.3, 2, 1.6);
  dashGlow.position.set(0.1, sill + 0.05, -0.75);
  interior.add(dashGlow);

  // Scheiben: vorn ein Stück heruntergelassen (oben offen, er spricht durch den Spalt), hinten zu. Tropfen und
  // Rinnsale bei Regen, sonst nur ein Hauch Spiegelung.
  const glassTop = sill + (roofY - sill) * 0.34;
  const drops = rain ? dropTextures(options.seed, false) : null;
  const streaks = rain ? dropTextures(options.seed, true) : null;
  const glassMats: MeshStandardMaterial[] = [];
  const pane = (z0: number, z1: number, y0: number, y1: number, layer: 'drops' | 'streaks', inset: number) => {
    const tex = layer === 'drops' ? drops : streaks;
    const map = tex?.map.clone();
    const glints = tex?.glints.clone();
    for (const t of [map, glints]) {
      if (!t) continue;
      t.repeat.set((z1 - z0) / 1.1, (y1 - y0) / 1.1);
      t.needsUpdate = true;
    }
    const mat = new MeshStandardMaterial({
      color: rain ? 0xffffff : 0x8fa4bf,
      map: map ?? null,
      emissiveMap: glints ?? null,
      emissive: 0x000000,
      transparent: true,
      opacity: rain ? 1 : 0.1,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
    });
    glassMats.push(mat);
    const mesh = new Mesh(new PlaneGeometry(z1 - z0, y1 - y0), mat);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(doorX - 0.02 + inset, (y0 + y1) / 2, (z0 + z1) / 2);
    interior.add(mesh);
    return mat;
  };
  pane(openZ0 + 0.04, openZ1, sill, glassTop, 'drops', 0);
  pane(rearZ0, rearZ1, sill, roofY - 0.06, 'drops', 0);
  const streakMats = rain
    ? [
        pane(openZ0 + 0.04, openZ1, sill, glassTop, 'streaks', 0.004),
        pane(rearZ0, rearZ1, sill, roofY - 0.06, 'streaks', 0.004),
      ]
    : [];
  // Kante der heruntergelassenen Scheibe: ein heller Strich, an dem man sie erkennt.
  const edge = new Mesh(new BoxGeometry(0.012, 0.008, openZ1 - openZ0 - 0.04), trimPlain);
  edge.position.set(doorX - 0.02, glassTop, (openZ0 + 0.04 + openZ1) / 2);
  interior.add(edge);

  // ---------------------------------------------------------------- Der Beamte
  const faces = createFaceTextures(options.look);
  const officer = buildOfficer({ skin: options.skin, jacket: options.jacket, face: faces.get('calm'), night });
  officer.group.position.set(SPOTS.window.x, 0, SPOTS.window.z);
  officer.group.rotation.y = SPOTS.window.face;
  outside.add(officer.group);
  const faceMat = officer.face.material as MeshStandardMaterial;
  let shownExpression: Expression = 'calm';
  // Beim hohen Transporter steht er aufrechter, beim flachen Wagen beugt er sich tiefer herunter.
  const leanBoost = isVan ? -0.12 : 0.08;
  const pos = { x: SPOTS.window.x, z: SPOTS.window.z, face: SPOTS.window.face, torch: 0, step: 0 };

  // ---------------------------------------------------------------- Regen draußen (feine Striche, aus dem Seed)
  let rainLines: LineSegments | null = null;
  let rainPos: Float32Array | null = null;
  if (rain) {
    const n = reduced ? 160 : 420;
    let s = options.seed ^ 0x2f17;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = -1.3 - rnd() * 14;
      const y = rnd() * 9;
      const zz = (rnd() - 0.4) * 24;
      rainPos.set([x, y, zz, x + 0.02, y - 0.35, zz], i * 6);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(rainPos, 3));
    rainLines = new LineSegments(
      geo,
      new LineBasicMaterial({ color: night ? 0x9fb4d4 : 0xd8e2ee, transparent: true, opacity: night ? 0.35 : 0.28 }),
    );
    scene.add(rainLines);
  }

  // ---------------------------------------------------------------- Nachbearbeitung
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let grade: ShaderPass | null = null;
  let lastRenderer: Stage3d['renderer'] | null = null;
  const ensureComposer = (stage: Stage3d) => {
    if (composer && lastRenderer === stage.renderer) return composer;
    composer?.dispose();
    lastRenderer = stage.renderer;
    composer = new EffectComposer(stage.renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Bloom in halber Auflösung: weich genug, am Handy viel billiger.
    bloom = new UnrealBloomPass(
      new Vector2(stage.width / 2, stage.height / 2),
      night ? 0.55 : 0.28,
      0.6,
      night ? 0.72 : 0.9,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GRADE_SHADER);
    composer.addPass(grade);
    composer.setPixelRatio(stage.dpr);
    composer.setSize(stage.width, stage.height);
    return composer;
  };

  // ---------------------------------------------------------------- Kamera und Bild
  const eyeY = isVan ? 1.42 : 1.2;
  const camBase = new Vector3(0.08, eyeY, 0.1);
  const lookNow = new Vector3(-3, eyeY + 0.15, 0.15);
  const headWorld = new Vector3();
  const lensWorld = new Vector3();
  const lensDir = new Vector3();
  const toCam = new Vector3();
  const tmp = new Vector3();
  const shoulderWorld = new Vector3();
  const parentQ = new Quaternion();
  const aimQ = new Quaternion();
  const down = new Vector3(0, -1, 0);
  // Hinten leuchtet er durch die Scheibe in den Laderaum, nicht nach vorn zu dir.
  const rearWindow = new Vector3(0.6, sill - 0.25, 2.2);
  let aimK = 0;
  const light: SceneLight = { blue: 0, red: 0, glare: 0, glareX: 0.5, glareY: 0.4 };
  let t = 0;
  let kick = 0;
  let zoom = 0;
  let drive = 0;
  let driveV = 0;
  let blink = 0;
  let nextBlink = 2.5;
  let baseFov = 58;
  let portrait = false;

  const update = (state: TrafficState, dt: number, cue: SceneCue) => {
    t += dt;
    // ---- Wohin er geht und wie er steht.
    const end = state.phase === 'end';
    let spotName: keyof typeof SPOTS = 'window';
    let poseName: PoseName = 'window';
    if (state.phase === 'walk') {
      spotName = 'rear';
      poseName = 'rear';
    } else if (state.phase === 'radio') {
      spotName = 'radio';
      poseName = 'radio';
    } else if (end && (state.outcome === 'fail' || state.outcome === 'flee')) {
      spotName = 'back';
      poseName = 'fail';
    } else if (end && state.outcome === 'pass') {
      spotName = state.phaseT > 0.5 ? 'back' : 'window';
      poseName = state.phaseT > 0.5 ? 'wave' : 'window';
    } else if (end && state.outcome === 'bribe') {
      poseName = 'take';
    } else if (cue.alarm > 0.2) {
      poseName = 'glare';
    } else if (state.phase === 'ask' && cue.tension > 0.3) {
      poseName = 'ask';
    }
    const spot = SPOTS[spotName];
    const walkK = Math.min(1, (spotName === 'back' && state.outcome === 'flee' ? 6 : 1.8) * dt);
    pos.x += (spot.x - pos.x) * walkK;
    pos.z += (spot.z - pos.z) * walkK;
    pos.face += (spot.face - pos.face) * walkK;
    // Schritte: Gehen lässt ihn leicht auf und ab wippen.
    const moving = Math.abs(spot.x - pos.x) + Math.abs(spot.z - pos.z) > 0.05;
    pos.step = moving ? pos.step + dt * 9 : pos.step;
    officer.group.position.set(pos.x, moving ? Math.abs(Math.sin(pos.step)) * 0.025 : 0, pos.z);
    officer.group.rotation.y = pos.face;
    const target = { ...POSES[poseName] };
    if (spotName === 'window') target.lean += leanBoost + cue.tension * 0.08;
    blendPose(officer, target, Math.min(1, (cue.alarm > 0.2 ? 7 : 3) * dt));
    applyPose(officer, t, 1.6 + cue.tension * 1.6);
    // Lampe zielen: Beim Blenden zeigt der Arm genau auf deine Augen, hinten durch die hintere Scheibe.
    const aimAt =
      poseName === 'glare' || poseName === 'fail' ? camera.position : poseName === 'rear' ? rearWindow : null;
    aimK += ((aimAt ? 1 : 0) - aimK) * Math.min(1, 6 * dt);
    if (aimK > 0.01) {
      // Der Oberarm hebt die Lampe auf Schulterhöhe neben den Kopf (Pose), der Unterarm zielt.
      const target = aimAt ?? camera.position;
      officer.right.elbow.updateWorldMatrix(true, false);
      officer.right.elbow.getWorldPosition(shoulderWorld);
      tmp.copy(target).sub(shoulderWorld).normalize();
      officer.right.shoulder.getWorldQuaternion(parentQ);
      tmp.applyQuaternion(parentQ.invert());
      aimQ.setFromUnitVectors(down, tmp);
      officer.right.elbow.quaternion.slerp(aimQ, aimK);
    }
    // ---- Gesicht: Ausdruck aus der Oberfläche, Blinzeln dazwischen.
    if (t > nextBlink) {
      blink = 0.13;
      nextBlink = t + 2.2 + Math.random() * 3.2;
    }
    blink = Math.max(0, blink - dt);
    const expression: Expression = blink > 0 && cue.expression === 'calm' ? 'blink' : cue.expression;
    if (expression !== shownExpression) {
      shownExpression = expression;
      faceMat.map = faces.get(expression);
      faceMat.needsUpdate = true;
    }
    // ---- Taschenlampe: an, wenn er nach hinten leuchtet, misstrauisch ist oder dich blendet; nachts heller.
    const wantTorch =
      poseName === 'rear' || poseName === 'glare' || poseName === 'fail' || (night && cue.tension > 0.5) ? 1 : 0;
    pos.torch += (wantTorch - pos.torch) * Math.min(1, 5 * dt);
    officer.lamp.intensity = pos.torch * (night ? 70 : 28);
    officer.lensMat.emissiveIntensity = pos.torch * 3;
    (officer.beam.material as MeshBasicMaterial).opacity = pos.torch * (night ? 0.07 : 0.03);
    // Blendung: wie genau die Lampe auf dein Auge zeigt.
    officer.flare.getWorldPosition(lensWorld);
    officer.lamp.target.getWorldPosition(tmp);
    lensDir.subVectors(tmp, lensWorld).normalize();
    toCam.subVectors(camera.position, lensWorld).normalize();
    const aim = Math.max(0, (lensDir.dot(toCam) - 0.8) / 0.2);
    const glare = Math.min(1, aim * aim * pos.torch);
    (officer.flare.material as SpriteMaterial).opacity = glare * (night ? 1 : 0.7);
    officer.flare.scale.setScalar(0.18 + glare * 0.55);
    light.glare = glare * (night ? 1 : 0.65);
    tmp.copy(lensWorld).project(camera);
    light.glareX = (tmp.x + 1) / 2;
    light.glareY = (1 - tmp.y) / 2;
    // ---- Schein in der Hand beim Bestechen.
    officer.note.visible = end && state.outcome === 'bribe' && state.phaseT > 0.25;
    // ---- Blaulicht: Licht draußen, Schein am Wagen, Glanz in den Tropfen und auf den Reflexstreifen.
    setBlueLight(police, t, 1);
    const f = flash(t);
    light.blue = f.blue;
    light.red = f.red;
    const strength = night ? 1 : dusk ? 0.6 : 0.3;
    const lit = Math.max(f.blue, f.red);
    blueLight.color.setHex(f.blue >= f.red ? 0x3a7bff : 0xff3a3a);
    blueLight.intensity = lit * 22 * strength;
    (policeGlow.material as SpriteMaterial).color.setHex(f.blue >= f.red ? 0x3a7bff : 0xff3a3a);
    (policeGlow.material as SpriteMaterial).opacity = lit * 0.9 * strength;
    const glint = tmp.set(0.2 * f.red + 0.05 * f.blue, 0.25 * f.blue + 0.05 * f.red, 0.95 * f.blue + 0.15 * f.red);
    const glassGlow = (night ? 1.6 : 0.5) + pos.torch * 0.8;
    for (const mat of glassMats)
      mat.emissive.setRGB(glint.x * glassGlow + 0.05, glint.y * glassGlow + 0.06, glint.z * glassGlow + 0.08);
    officer.reflect.emissive.setRGB(
      glint.x * strength * 0.6 + 0.02,
      glint.y * strength * 0.6 + 0.02,
      glint.z * strength * 0.6 + 0.03,
    );
    // Rinnsale laufen langsam die Scheibe hinunter.
    if (!reduced)
      for (const mat of streakMats) {
        if (mat.map) mat.map.offset.y = (mat.map.offset.y + dt * 0.035) % 1;
        if (mat.emissiveMap) mat.emissiveMap.offset.y = mat.map?.offset.y ?? 0;
      }
    // ---- Anfahren: Gute Fahrt rollt langsam an, Gas reißt los.
    if (end && state.outcome === 'pass' && state.phaseT > 1.1) driveV = Math.min(3, driveV + dt * 1.4);
    if (end && state.outcome === 'flee') driveV = Math.min(16, driveV + dt * 22);
    drive += driveV * dt;
    outside.position.z = drive;
    // ---- Kamera: atmet, folgt dem Kopf mit dem Blick, ruckt bei Treffern, zieht heran.
    kick = Math.max(0, kick - dt * 2.6);
    zoom = Math.max(0, zoom - dt * 1.8);
    officer.head.getWorldPosition(headWorld);
    // Blick auf den Kopf; hochkant etwas tiefer, damit er oben im Bild steht (unten liegen die Antworten).
    // Nach hinten dreht der Kopf nur so weit, wie man sich am Steuer umdreht.
    const wantLook = tmp.set(
      headWorld.x * 0.82 - 0.4,
      headWorld.y - (portrait ? 0.2 : 0.12),
      Math.min(1.1, headWorld.z * 0.85),
    );
    lookNow.lerp(wantLook, Math.min(1, 2.2 * dt));
    const shakeOn = kick > 0 && !reduced;
    camera.position.set(
      camBase.x + Math.sin(t * 0.5) * 0.004,
      camBase.y + Math.sin(t * 0.9) * 0.004 + (shakeOn ? (Math.sin(t * 53) * kick) / 45 : 0),
      camBase.z +
        (shakeOn ? (Math.sin(t * 71) * kick) / 35 : 0) -
        (state.outcome === 'flee' && end ? Math.min(0.08, drive * 0.01) : 0),
    );
    camera.lookAt(lookNow);
    const fov = baseFov * (1 - zoom * 0.08) + (state.outcome === 'flee' && end ? Math.min(8, driveV) : 0);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // ---- Regen draußen.
    if (rainLines && rainPos) {
      const geo = rainLines.geometry.getAttribute('position') as BufferAttribute;
      const fall = 10 * dt;
      for (let i = 0; i < rainPos.length; i += 6) {
        rainPos[i + 1] -= fall;
        rainPos[i + 4] -= fall;
        if (rainPos[i + 4] < 0) {
          rainPos[i + 1] += 9;
          rainPos[i + 4] += 9;
        }
      }
      geo.needsUpdate = true;
    }
  };

  let lastCalls = 0;
  const render = (stage: Stage3d) => {
    if (grade) {
      grade.uniforms.time.value = reduced ? 0 : t % 10;
      grade.uniforms.flash.value = zoom;
    }
    // Draw-Calls über alle Durchgänge (Szene, Bloom, Nachbearbeitung) zählen, nicht nur den letzten.
    const info = stage.renderer.info;
    info.autoReset = false;
    info.reset();
    ensureComposer(stage).render();
    lastCalls = info.render.calls;
  };
  const resize = (width: number, height: number) => {
    portrait = width < height;
    camera.aspect = width / height;
    baseFov = portrait ? 72 : 62;
    // Hochkant sitzt du näher an der Tür (sonst ist er zu klein), quer weiter drin (Rahmen und Säulen im Bild).
    camBase.x = portrait ? 0.02 : 0.08;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    composer?.setSize(width, height);
    bloom?.setSize(width / 2, height / 2);
  };
  const dispose = () => {
    composer?.dispose();
    // Texturen der Materialien (Klone je Haus und Scheibe, Jacke, Gesicht) zuerst, dann Geometrie und Material.
    scene.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (!m || Array.isArray(m)) return;
      for (const tex of [m.map, m.emissiveMap, m.roughnessMap]) tex?.dispose();
    });
    disposeObject(scene);
    faces.dispose();
    for (const tex of [
      glowMap,
      beamMap,
      fabric,
      fac.map,
      fac.glow,
      drops?.map,
      drops?.glints,
      streaks?.map,
      streaks?.glints,
    ])
      tex?.dispose();
  };
  return {
    update,
    render,
    resize,
    light,
    shake: (amount) => {
      kick = Math.max(kick, amount);
    },
    punch: (amount) => {
      zoom = Math.max(zoom, reduced ? amount * 0.3 : amount);
    },
    calls: () => lastCalls,
    debug: () => ({
      pose: { ...officer.pose },
      shoulder: officer.right.shoulder.rotation.toArray(),
      elbow: officer.right.elbow.rotation.toArray(),
      aimK,
      torch: pos.torch,
      lens: officer.flare.getWorldPosition(new Vector3()).toArray(),
      shoulderAt: officer.right.shoulder.getWorldPosition(new Vector3()).toArray(),
      elbowAt: officer.right.elbow.getWorldPosition(new Vector3()).toArray(),
      head: officer.head.getWorldPosition(new Vector3()).toArray(),
      camera: camera.position.toArray(),
      glare: light.glare,
    }),
    dispose,
  };
}
