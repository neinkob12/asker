// Bude durchsuchen (Auftrag 48): Ego-Blick mit Taschenlampe in 3D (three.js). Du stehst in der Tür eines Raums,
// die Taschenlampe folgt Maus bzw. Finger (die Kamera schaut mit), echter Lichtkegel mit harten Schatten, Staub im
// Strahl. Dinge gehen beim Durchsuchen auf und bleiben offen. Fund: Scheine fliegen dir entgegen, warmes Aufblitzen.
// Lärm: alles wackelt; Nachbar hämmert: Staub rieselt, später Blaulicht am Fenster. Am Ende dreht sich der Schlüssel,
// die Lampe flackert und geht aus. Nur Optik: liest den Zustand aus model.ts (Math.random nur für Partikel).

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import {
  createFlashlight,
  ParticlePool,
  POLICE_BLUE,
  POLICE_RED,
  policeBlink,
  softDotTexture,
} from '../../kit/indoor3d';
import { type DayPhase, disposeObject } from '../../kit/scene3d';
import type { Stage3d } from '../../kit/stage3d';
import { ROOMS, type RoomId, type SearchSetup, type SearchState } from './model';
import {
  buildItemView,
  buildRoom,
  createMaterials,
  type ItemView,
  ROOM_D,
  ROOM_GAP,
  ROOM_H,
  type RoomView,
  setOpen,
} from './room3d';

/** Effekte, die die Komponente mitzählt (Sekunden seit …, −1 = noch nicht). */
export interface SearchFx {
  t: number;
  shake: number;
  /** Seit der Nachbar die Polizei ruft. */
  alertT: number;
  /** Seit Schritte im Treppenhaus. */
  stepsT: number;
  /** Seit sich der Schlüssel dreht. */
  keyT: number;
  /** Alles gefunden: Lampe aus, durchatmen. */
  clearT: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface SearchScene {
  /** Raum wechseln (sofort; das Überblenden macht die Komponente). */
  setRoom(room: RoomId): void;
  /** Wohin die Lampe zeigt: Bildschirmpunkt (Maus, Finger) bzw. ein Ding (Tastatur). */
  aimAt(px: number, py: number): void;
  aimItem(index: number): void;
  update(state: SearchState, fx: SearchFx, dt: number): void;
  render(stage: Stage3d): void;
  resize(width: number, height: number): void;
  /** Ding unter dem Bildschirmpunkt (im aktuellen Raum), sonst −1. */
  pick(px: number, py: number): number;
  /** Bildschirmlage der Mitte eines Dings (nach update). */
  itemScreen(index: number): ScreenPoint;
  /** Effekte: Fund (Scheine), leer (Staub), Lärm (Wackeln), Alarm (Staub von der Decke). */
  burst(kind: 'found' | 'empty' | 'noise' | 'alert', index: number): void;
  dispose(): void;
}

/** Augenhöhe und Stand in der Tür. */
const EYE = 1.55;
const STAND_Z = ROOM_D / 2 - 0.15;
/** Wie weit die Kamera mitschaut (Bogenmaß), quer bzw. hochkant. */
const YAW_WIDE = 0.55;
const YAW_TALL = 0.95;
const PITCH = 0.32;
/** Taschenlampe: Öffnungswinkel, Reichweite, Helligkeit. */
const BEAM_ANGLE = 0.5;
const BEAM_LEN = 5.5;
const BEAM_POWER = 12;
/** Streulicht der Lampe um dich herum (damit man Möbel am Rand des Kegels noch ahnt). */
const SPILL = 1.1;
/** Mitte des Bilds, in der die Kamera nicht mitdreht (Anteil der halben Breite bzw. Höhe): Was du anleuchtest, bleibt
 * unter dem Zeiger. Erst zum Rand hin schaut die Kamera mit. */
const DEAD_ZONE = 0.4;

const AMBIENT: Record<
  DayPhase,
  { sky: number; ground: number; hemi: number; moon: number; moonI: number; pane: number }
> = {
  day: { sky: 0xd8dde6, ground: 0x4a4036, hemi: 0.55, moon: 0xfff0d8, moonI: 1, pane: 0.9 },
  dusk: { sky: 0x8a7894, ground: 0x2c2420, hemi: 0.38, moon: 0xffa66a, moonI: 0.6, pane: 0.55 },
  night: { sky: 0x3a4a78, ground: 0x15130f, hemi: 0.3, moon: 0x8aa4ff, moonI: 0.45, pane: 0.35 },
};

/** Streifen der Jalousie auf dem Boden. */
function blindsTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    for (let y = 0; y < 128; y += 12) {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(0, y, 64, 6);
    }
    g.globalCompositeOperation = 'destination-in';
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.3, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 128);
  }
  return new CanvasTexture(c);
}

const BILLS = 14;

export function createSearchScene(setup: SearchSetup, phase: DayPhase, reduced: boolean): SearchScene {
  const scene = new Scene();
  scene.background = new Color(0x050507);
  const camera = new PerspectiveCamera(62, 1, 0.05, 30);
  const amb = AMBIENT[phase];
  const m = createMaterials();
  const dot = softDotTexture();
  const blinds = blindsTexture();
  m.textures.push(dot, blinds);

  // ------------------------------------------------------------ Räume und Dinge
  const roomViews = new Map<RoomId, RoomView>();
  const origin = new Map<RoomId, number>();
  ROOMS.forEach((id, i) => {
    const view = buildRoom(id, m);
    view.group.position.x = i * ROOM_GAP;
    view.group.visible = false;
    scene.add(view.group);
    roomViews.set(id, view);
    origin.set(id, i * ROOM_GAP);
    if (view.windows.length > 0) {
      // Licht durch die Jalousie als Streifen auf dem Boden.
      const stripes = new Mesh(
        new PlaneGeometry(1.4, 1.6),
        new MeshBasicMaterial({
          map: blinds,
          color: amb.moon,
          transparent: true,
          opacity: phase === 'night' ? 0.18 : 0.3,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      stripes.rotation.x = -Math.PI / 2;
      stripes.rotation.z = 0.3;
      stripes.position.set(1.2, 0.01, -0.4);
      view.group.add(stripes);
    }
  });
  const items: ItemView[] = setup.items.map((item, i) => {
    const view = buildItemView(item, i, m);
    roomViews.get(item.room)?.group.add(view.group);
    return view;
  });

  // ------------------------------------------------------------ Licht
  const hemi = new HemisphereLight(amb.sky, amb.ground, amb.hemi);
  scene.add(hemi);
  const moon = new DirectionalLight(amb.moon, amb.moonI);
  moon.position.set(8, 3, -1);
  scene.add(moon);
  scene.add(moon.target);
  const torch = createFlashlight({
    angle: BEAM_ANGLE,
    range: BEAM_LEN,
    cone: 3.6,
    power: BEAM_POWER,
    penumbra: 0.85,
    shadow: 1024,
    reduced,
  });
  const lamp = torch.light;
  scene.add(lamp);
  scene.add(lamp.target);
  scene.add(torch.beam);
  const spill = new PointLight(0xffe9c8, SPILL, 3.2, 2);
  scene.add(spill);
  const police = new PointLight(0x3a7bff, 0, 8, 1.4);
  scene.add(police);
  const flash = new PointLight(0xffd36a, 0, 3, 1.6);
  scene.add(flash);

  // Funken, Staubwolken, Brösel (ein Punkt-System für alles).
  const sparks = new ParticlePool(dot, { count: 160, size: 0.05 });
  scene.add(sparks.points);
  const emit = sparks.emit.bind(sparks);

  // Scheine, die dir entgegenfliegen.
  const bills: { mesh: Mesh; v: Vector3; spin: Vector3; life: number }[] = [];
  const billGeo = new PlaneGeometry(0.16, 0.08);
  for (let i = 0; i < BILLS; i++) {
    const mesh = new Mesh(billGeo, m.bill);
    mesh.visible = false;
    scene.add(mesh);
    bills.push({ mesh, v: new Vector3(), spin: new Vector3(), life: 0 });
  }

  // ------------------------------------------------------------ Kamera und Zielen
  let width = 1;
  let height = 1;
  let room: RoomId = 'hall';
  let yaw = 0;
  let pitch = -0.15;
  let yawMax = YAW_WIDE;
  const aim = { x: 0.5, y: 0.55, item: -1 };
  const aimTarget = new Vector3(0, 1, -2);
  const v3 = new Vector3();
  const ndc = new Vector2();
  const raycaster = new Raycaster();

  const resize = (w: number, h: number) => {
    width = Math.max(1, w);
    height = Math.max(1, h);
    const aspect = width / height;
    camera.aspect = aspect;
    // Hochkant: höheres Sichtfeld (bis 80°), dafür schaut die Kamera weiter mit.
    camera.fov = aspect < 0.8 ? 78 : aspect < 1.2 ? 68 : 60;
    yawMax = aspect < 0.8 ? YAW_TALL : YAW_WIDE;
    camera.updateProjectionMatrix();
    lamp.shadow.mapSize.set(aspect < 0.8 ? 512 : 1024, aspect < 0.8 ? 512 : 1024);
  };
  resize(800, 600);

  const project = (x: number, y: number, z: number): ScreenPoint => {
    v3.set(x, y, z).project(camera);
    const sx = (v3.x * 0.5 + 0.5) * width;
    const sy = (-v3.y * 0.5 + 0.5) * height;
    return { x: sx, y: sy, visible: v3.z < 1 && sx > 0 && sx < width && sy > 0 && sy < height };
  };

  const worldCenter = (index: number, out: Vector3) => {
    const view = items[index];
    const ox = origin.get(view.room) ?? 0;
    return out.set(view.center[0] + ox, view.center[1], view.center[2]);
  };

  const setRoom = (id: RoomId) => {
    room = id;
    for (const [rid, view] of roomViews) view.group.visible = rid === id;
    for (const b of bills) {
      b.life = 0;
      b.mesh.visible = false;
    }
    yaw = 0;
    pitch = -0.15;
    aim.item = -1;
  };

  const update = (state: SearchState, fx: SearchFx, dt: number) => {
    const t = fx.t;
    const ox = origin.get(room) ?? 0;
    // Zielpunkt auf dem Bildschirm: Ding (Tastatur) oder Zeiger.
    if (aim.item >= 0) {
      const p = project(...(worldCenter(aim.item, v3).toArray() as [number, number, number]));
      aim.x += (p.x / width - aim.x) * Math.min(1, dt * 8);
      aim.y += (p.y / height - aim.y) * Math.min(1, dt * 8);
    }
    const edge = (v: number) => (Math.sign(v) * Math.max(0, Math.abs(v) - DEAD_ZONE)) / (1 - DEAD_ZONE);
    const nx = edge(Math.max(-1, Math.min(1, aim.x * 2 - 1)));
    const ny = edge(Math.max(-1, Math.min(1, aim.y * 2 - 1)));
    // Kamera schaut mit (weich), stärker zum Rand hin.
    const wantYaw = -Math.sign(nx) * Math.abs(nx) ** 1.1 * yawMax;
    const wantPitch = -0.15 - Math.sign(ny) * Math.abs(ny) ** 1.1 * PITCH;
    yaw += (wantYaw - yaw) * Math.min(1, dt * 2.6);
    pitch += (wantPitch - pitch) * Math.min(1, dt * 2.6);
    const shake = (reduced ? 0.25 : 1) * fx.shake;
    const sx = shake > 0.01 ? Math.sin(t * 63) * 0.03 * shake : 0;
    const sy = shake > 0.01 ? Math.cos(t * 51) * 0.02 * shake : 0;
    // Atmen: leichtes Wiegen.
    const breathe = reduced ? 0 : Math.sin(t * 1.3) * 0.006;
    camera.position.set(ox + sx, EYE + breathe + sy, STAND_Z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    // Lampe: aus der rechten Hand in Richtung des Zeigers.
    ndc.set(aim.x * 2 - 1, -(aim.y * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    const dir = raycaster.ray.direction;
    const hand = v3.set(0.22, -0.28, -0.1).applyMatrix4(camera.matrixWorld);
    const target = raycaster.ray.origin.clone().addScaledVector(dir, 4);
    aimTarget.lerp(target, Math.min(1, dt * 18));
    torch.aim(hand, aimTarget);
    spill.position.copy(camera.position);
    // Lampe flackert am Ende und geht aus (bzw. aus, wenn alles gefunden ist).
    let power = 1;
    if (fx.keyT >= 0) {
      const k = fx.keyT;
      power = k < 0.6 ? 1 : k < 1.4 ? (Math.sin(k * 60) > 0.2 ? 0.9 : 0.15) : Math.max(0, 1 - (k - 1.4) * 3);
    } else if (fx.clearT >= 0) power = Math.max(0.35, 1 - fx.clearT * 0.6);
    torch.setPower(power);
    spill.intensity = SPILL * power;
    // Staub im Strahl (Kamera-nah, treibt langsam).
    torch.update(t);
    // Dinge: auf beim Suchen (mit Wackeln), offen nach dem Suchen; Lärm lässt alles zittern.
    const current = state.current;
    for (const view of items) {
      if (view.room !== room) continue;
      const searching = current?.index === view.index;
      const k = state.searched[view.index]
        ? 1
        : searching
          ? Math.min(1, (current?.t ?? 0) / setup.items[view.index].duration)
          : 0;
      const prev = (view.group.userData.k ?? 0) as number;
      const next = prev + (k - prev) * Math.min(1, dt * 10);
      view.group.userData.k = next;
      setOpen(view, searching ? next * (0.85 + 0.15 * Math.sin(t * 30)) : next);
      const rattle = (view.group.userData.rattle ?? 0) as number;
      if (rattle > 0) view.group.userData.rattle = Math.max(0, rattle - dt * 2.5);
      const wob = (searching ? 0.006 : 0) + rattle * 0.02;
      view.group.position.x = wob > 0 ? Math.sin(t * 47 + view.index) * wob : 0;
      view.group.position.y = wob > 0 ? Math.abs(Math.cos(t * 39 + view.index)) * wob * 0.5 : 0;
    }
    // Fenster: Mondlicht bzw. nach dem Alarm Blaulicht.
    const blink = policeBlink(t);
    const alarm = fx.alertT >= 0 ? Math.min(1, fx.alertT / 1.5) : 0;
    const view = roomViews.get(room);
    for (const pane of view?.windows ?? []) {
      if (alarm > 0) {
        pane.emissive.setHex(blink ? POLICE_BLUE : POLICE_RED);
        pane.emissiveIntensity = 0.6 + 1.4 * alarm;
      } else {
        pane.emissive.setHex(0x6f86b8);
        pane.emissiveIntensity = amb.pane;
      }
    }
    police.intensity = alarm * (blink ? 9 : 5);
    police.color.setHex(blink ? POLICE_BLUE : POLICE_RED);
    police.position.set(ox + 1.9, 1.6, -0.6);
    // Treppenhaus: Licht unter der Tür, Schatten von Füßen, die näher kommen.
    if (view?.doorGap) {
      const steps = fx.stepsT >= 0 ? 0.25 + 0.5 * Math.abs(Math.sin(fx.stepsT * 4.2)) : 0.25;
      view.doorGap.opacity = fx.keyT > 0.6 ? 0.9 : steps;
    }
    if (view?.door) view.door.rotation.y = fx.keyT > 0.8 ? -Math.min(1.2, (fx.keyT - 0.8) * 1.4) : 0;
    // Aufblitzen bei Fund, Funken, Scheine.
    flash.intensity = Math.max(0, flash.intensity - dt * 18);
    sparks.update(dt);
    for (const b of bills) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.v.y -= 1.4 * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      if (b.life <= 0) b.mesh.visible = false;
    }
  };

  const pick = (px: number, py: number): number => {
    ndc.set((px / width) * 2 - 1, -(py / height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const groups: Object3D[] = items.filter((v) => v.room === room).map((v) => v.group);
    const hit = raycaster.intersectObjects(groups, true)[0];
    if (hit) return hit.object.userData.index as number;
    // Knapp daneben: das nächste Ding im Umkreis (am Handy mit dem Finger großzügiger).
    let best = -1;
    let bestD = Math.max(56, Math.min(width, height) * 0.1);
    for (const view of items) {
      if (view.room !== room) continue;
      const p = project(...(worldCenter(view.index, v3).toArray() as [number, number, number]));
      const d = Math.hypot(p.x - px, p.y - py);
      if (p.visible && d < bestD) {
        bestD = d;
        best = view.index;
      }
    }
    return best;
  };

  const burst: SearchScene['burst'] = (kind, index) => {
    const c = worldCenter(index, new Vector3());
    const n = reduced ? 6 : 24;
    if (kind === 'found') {
      flash.position.set(c.x, c.y + 0.3, c.z + 0.4);
      flash.intensity = 6;
      emit(c.x, c.y, c.z, n, 0xffd36a, 1.2, 1.5, 0.8);
      const toCam = camera.position.clone().sub(c).normalize();
      let launched = 0;
      for (const b of bills) {
        if (b.life > 0 || launched >= (reduced ? 4 : 10)) continue;
        launched += 1;
        b.mesh.position.copy(c);
        b.mesh.visible = true;
        b.life = 0.9 + Math.random() * 0.3;
        b.v.copy(toCam).multiplyScalar(1.6 + Math.random() * 1.2);
        b.v.x += (Math.random() - 0.5) * 1.6;
        b.v.y += 1.2 + Math.random() * 1.2;
        b.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      }
    } else if (kind === 'empty') {
      emit(c.x, c.y, c.z, Math.round(n * 0.6), 0x8c8070, 0.5, 0.4, 1);
    } else if (kind === 'noise') {
      for (const view of items) if (view.room === room) view.group.userData.rattle = view.index === index ? 1 : 0.4;
      emit(c.x, c.y, c.z, Math.round(n * 0.4), 0xfff0d0, 1.5, 4, 0.4);
    } else {
      // Der Nachbar hämmert: Putz rieselt von der Decke.
      const ox = origin.get(room) ?? 0;
      for (let i = 0; i < 4; i++)
        emit(
          ox + (Math.random() - 0.5) * 3,
          ROOM_H - 0.05,
          -1 + Math.random() * 1.5,
          Math.round(n / 3),
          0xb9b0a0,
          0.2,
          2.5,
          1.4,
        );
      for (const view of items) if (view.room === room) view.group.userData.rattle = 0.8;
    }
  };

  setRoom('hall');

  return {
    setRoom,
    aimAt: (px, py) => {
      aim.item = -1;
      aim.x = Math.max(0, Math.min(1, px / width));
      aim.y = Math.max(0, Math.min(1, py / height));
    },
    aimItem: (index) => {
      aim.item = index;
    },
    update,
    render: (stage) => stage.renderer.render(scene, camera),
    resize,
    pick,
    itemScreen: (index) => project(...(worldCenter(index, v3).toArray() as [number, number, number])),
    burst,
    dispose: () => {
      disposeObject(scene);
      for (const tex of m.textures) tex.dispose();
      torch.dispose();
    },
  };
}
