// Messung im Browser (`npm run perf:browser`): startet den Dev-Server und Chromium, lädt einen Spielstand (oder
// spult ein frisches Spiel vor), lässt das Spiel mit Tempo laufen und misst, was pro Neuzeichnen der Oberfläche
// passiert: Preact-Renders (synchron gemessen, damit es nicht an der GPU hängt), GameMap.update je Layer,
// Simulationsschritte, Long Tasks, DOM-Größe, ein CPU-Profil (Top-Funktionen nach Self-Time) und Mikro-Benchmarks der
// Lesefunktionen (chatList, Live-Aktivitäten, Advisor, Badges). Danach erzeugt es viele offene Lieferanfragen und misst
// die Szenen noch einmal (Nachrichten-App offen, Chat offen, Handy zu).
//
//   node scripts/perf-browser.mjs [--save=pfad.json] [--days=3] [--seconds=25] [--speed=4] [--width=700 --height=500]
//     [--mobile] [--throttle=4] [--gpu] [--reduced-motion] [--traffic=off|low|normal] [--hour=8] [--scenes=ui,karte]
//
// Karte (Auftrag 31): --scenes=karte misst den Normalbetrieb auf der Karte (zehn offene Aufträge, eine laufende
// Lieferung, Tempo --speed, Zoom 14,5 an den Ringen) über die Messhilfe aus src/map/perf.ts (?perf=1): Bilder pro
// Sekunde, Arbeit pro Bild in den Animationen (Fahrzeuge, Verkehr, Figuren, Hotspots), Zeit pro Layer-update,
// setData-Aufrufe pro Quelle und Sekunde (Mittel und Spitze), Long Tasks. --mobile nimmt den iPhone-Viewport
// (390 × 844, Touch), --throttle=4 drosselt die CPU über CDP (Emulation.setCPUThrottlingRate), --gpu startet Chromium
// mit Fenster und echter GPU statt SwiftShader (nur auf einem Rechner mit Grafikkarte und Bildschirm sinnvoll; ohne
// GPU sind die Bilder pro Sekunde durch die Software-Grafik begrenzt, die Arbeit pro Bild und setData nicht).
// --hour=8 spult vor der Szene bis zur nächsten vollen Stunde 8 vor (Berufsverkehr: volle Zahl an Fahrzeugen).
//
// --save: Spielstand aus `PERF=1 PERF_SAVE=/tmp/perf.json npm run perf:sim` (Bot, Tag 20). Ohne --save wird ein
// frisches Spiel mit Seed 11 um --days Spieltage vorgespult (ohne Spieler passiert dabei wenig, die Nachrichten und
// Anfragen kommen trotzdem). Headless ohne GPU zeichnet die Karte nur mit wenigen Bildern pro Sekunde; die Zahlen zu
// Preact, Layern und Simulation sind davon unabhängig. WebGL-Natives im Profil deshalb ignorieren.
// Bericht und Hotspots: docs/perf/2026-10-messung.md.

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { findChromium, launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const SECONDS = Number(args.seconds ?? 25);
const SPEED = Number(args.speed ?? 4);
const MOBILE = 'mobile' in args;
const WIDTH = Number(args.width ?? (MOBILE ? 390 : 700));
const HEIGHT = Number(args.height ?? (MOBILE ? 844 : 500));
const DAYS = Number(args.days ?? 3);
const THROTTLE = Number(args.throttle ?? 1);
const SCENES = new Set((args.scenes || 'ui,karte').split(','));
const TRAFFIC = args.traffic || null;
const HOUR = args.hour === undefined ? null : Number(args.hour);

const { server, base } = await startServer();
const browser =
  'gpu' in args
    ? await chromium.launch({ executablePath: findChromium(), headless: false, args: ['--ignore-gpu-blocklist'] })
    : await launchBrowser();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  ...(MOBILE ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  ...('reduced-motion' in args ? { reducedMotion: 'reduce' } : {}),
});
await routeExternal(context, base);
if (TRAFFIC) {
  // Einstellung "Verkehr" (Einstellungen › Karte) vor dem Start setzen.
  await context.addInitScript((level) => {
    try {
      const prefs = JSON.parse(localStorage.getItem('koeln-tycoon:ui') || '{}');
      localStorage.setItem('koeln-tycoon:ui', JSON.stringify({ ...prefs, traffic: level }));
    } catch {}
  }, TRAFFIC);
}
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/AJAXError|Failed to load resource/.test(m.text())) errors.push(m.text());
});

await page.goto(new URL('?neu=normal&seed=11&tempo=0&perf=1', base).toString());
await page.waitForSelector('.shell-map', { timeout: 20000 });
await page.waitForTimeout(6000);

// Messfühler im Spiel: Renders zählen, UI-Listener und Karten-Update stoppen, Simulationsschritte stoppen.
await page.evaluate(async () => {
  const k = window.koeln;
  const p = {};
  window.__perf = p;
  p.reset = () =>
    Object.assign(p, {
      longTasks: [],
      renders: 0,
      byComp: {},
      frames: 0,
      ui: 0,
      uiMs: 0,
      uiMax: 0,
      map: 0,
      mapMs: 0,
      mapMax: 0,
      layerMs: {},
      steps: 0,
      stepMs: 0,
      stepMax: 0,
    });
  p.reset();
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) p.longTasks.push(e.duration);
  }).observe({ type: 'longtask' });
  const preactUrl = performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .find((n) => /\/preact\.js(\?|$)/.test(n));
  const preact = await import(preactUrl);
  preact.options.debounceRendering = (cb) => cb();
  const prevRender = preact.options.__r;
  preact.options.__r = (vnode) => {
    p.renders++;
    const name =
      typeof vnode.type === 'function' ? vnode.type.displayName || vnode.type.name || '?' : String(vnode.type);
    p.byComp[name] = (p.byComp[name] ?? 0) + 1;
    prevRender?.(vnode);
  };
  const listeners = k.runtime.listeners;
  const wrapped = new Set();
  for (const l of listeners)
    wrapped.add((...a) => {
      const t0 = performance.now();
      l(...a);
      const d = performance.now() - t0;
      p.ui++;
      p.uiMs += d;
      if (d > p.uiMax) p.uiMax = d;
    });
  listeners.clear();
  for (const f of wrapped) listeners.add(f);
  const registry = await import('/src/map/registry.ts');
  p.wrapMap = () => {
    const map = k.runtime.map;
    if (!map || map.__wrapped) return;
    map.__wrapped = true;
    const update = map.update.bind(map);
    map.update = (s, u) => {
      const t0 = performance.now();
      update(s, u);
      const d = performance.now() - t0;
      p.map++;
      p.mapMs += d;
      if (d > p.mapMax) p.mapMax = d;
    };
    const ids = registry.mapLayers().map((l) => l.id);
    (map.instances ?? []).forEach((entry, i) => {
      const inst = entry.instance ?? entry;
      if (!inst.update) return;
      const id = entry.id ?? ids[i] ?? `#${i}`;
      const u = inst.update.bind(inst);
      inst.update = (s, ui) => {
        const t0 = performance.now();
        u(s, ui);
        p.layerMs[id] = (p.layerMs[id] ?? 0) + performance.now() - t0;
      };
    });
  };
  p.wrapMap();
  const options = k.session.loop.options;
  const step = options.step;
  options.step = (n) => {
    const t0 = performance.now();
    step(n);
    const d = performance.now() - t0;
    p.steps += n;
    p.stepMs += d;
    if (d > p.stepMax) p.stepMax = d;
  };
  const raf = () => {
    p.frames++;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
});

const cdp = await context.newCDPSession(page);
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

function analyze(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const total = profile.endTime - profile.startTime;
  for (let i = 0; i < profile.samples.length; i++)
    self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  const byFn = new Map();
  const byCat = new Map();
  let idle = 0;
  const category = (url) => {
    if (!url) return '(native: DOM, WebGL, GC)';
    if (url.includes('maplibre')) return 'maplibre-gl';
    if (url.includes('preact')) return 'preact';
    if (url.includes('/src/map/')) return 'src/map';
    if (url.includes('/ui/')) return 'src/**/ui';
    if (url.includes('/src/core/')) return 'src/core';
    if (url.includes('/src/modules/')) return 'src/modules';
    return 'sonstiges';
  };
  for (const [id, us] of self) {
    const cf = nodes.get(id).callFrame;
    const url = cf.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
    const fn = cf.functionName || '(anonym)';
    if (fn === '(idle)') {
      idle += us;
      continue;
    }
    if (fn === '(root)') continue;
    const key = `${fn}  ${url}:${cf.lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + us);
    byCat.set(category(url), (byCat.get(category(url)) ?? 0) + us);
  }
  const busy = total - idle;
  const top = (m, n) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms ${((100 * v) / busy).toFixed(1).padStart(5)}%  ${k}`);
  return { total, busy, fn: top(byFn, 22), cat: top(byCat, 10) };
}

async function closeDialogs() {
  return page.evaluate(() => {
    const k = window.koeln;
    for (let i = 0; i < 5 && k.runtime.ui.dialog; i++) {
      if (k.runtime.ui.dialog.id === 'encounters.encounter')
        k.session.dispatch({ type: 'encounters.auto', payload: {} });
      k.runtime.api.closeDialog();
    }
    k.runtime.requestRender();
  });
}

async function measure(label) {
  await page.evaluate(() => {
    window.__perf.wrapMap();
    window.__perf.reset();
  });
  await cdp.send('Profiler.start');
  await page.evaluate((s) => window.koeln.runtime.api.setSpeed(s), SPEED);
  await page.waitForTimeout(SECONDS * 1000);
  await page.evaluate(() => window.koeln.runtime.api.setSpeed(0));
  const { profile } = await cdp.send('Profiler.stop');
  const info = await page.evaluate(() => {
    const p = window.__perf;
    const s = window.koeln.session.state;
    return {
      ...p,
      wrapMap: undefined,
      reset: undefined,
      byComp: Object.entries(p.byComp)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
      layerMs: Object.entries(p.layerMs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
      dom: document.getElementsByTagName('*').length,
      msgs: s.messages.list.length,
      open: s.modules.customers.orders.filter((o) => o.status === 'offered' || o.status === 'enRoute').length,
      phone: `${window.koeln.runtime.ui.phone.open}:${window.koeln.runtime.ui.phone.app ?? 'home'}`,
      dialog: window.koeln.runtime.ui.dialog?.id ?? null,
    };
  });
  const a = analyze(profile);
  const lt = info.longTasks;
  const ltSum = lt.reduce((x, y) => x + y, 0);
  const out = [
    `\n######## "${label}" (${SECONDS} s, ${SPEED}x, ${WIDTH}x${HEIGHT}${MOBILE ? ' Handy' : ''}${THROTTLE > 1 ? `, CPU ${THROTTLE}x gedrosselt` : ''}) ########`,
    `Zustand: msgs=${info.msgs} offene Orders=${info.open} Handy=${info.phone} Dialog=${info.dialog} DOM=${info.dom}`,
    `Frames: ${info.frames} (${(info.frames / SECONDS).toFixed(1)} fps) | Long Tasks: ${lt.length}, Summe ${ltSum.toFixed(0)} ms, max ${Math.max(0, ...lt).toFixed(0)} ms`,
    `Simulation: ${info.steps} Schritte, ${info.stepMs.toFixed(0)} ms = ${(info.stepMs / Math.max(1, info.steps)).toFixed(3)} ms/Schritt, max Block ${info.stepMax.toFixed(1)} ms`,
    `UI-Neuzeichnen (Preact synchron): ${info.ui}x, ${info.uiMs.toFixed(0)} ms = ${(info.uiMs / Math.max(1, info.ui)).toFixed(1)} ms/Neuzeichnen, max ${info.uiMax.toFixed(1)} ms | Komponenten-Renders ${info.renders} = ${(info.renders / Math.max(1, info.ui)).toFixed(0)}/Neuzeichnen`,
    `GameMap.update: ${info.map}x, ${info.mapMs.toFixed(0)} ms = ${(info.mapMs / Math.max(1, info.map)).toFixed(1)} ms/Aufruf, max ${info.mapMax.toFixed(1)} ms | Layer: ${info.layerMs.map(([k, v]) => `${k}=${v.toFixed(0)}`).join(', ')}`,
    `Top-Komponenten: ${info.byComp.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    `--- CPU beschäftigt ${(a.busy / 1000).toFixed(0)} ms von ${(a.total / 1000).toFixed(0)} ms ---`,
    ...a.cat,
    '--- Top-22 Funktionen (Self) ---',
    ...a.fn,
  ];
  console.log(out.join('\n'));
}

async function micro(label) {
  const r = await page.evaluate(async () => {
    const k = window.koeln;
    const s = k.session.state;
    const ui = k.runtime.ui;
    const mm = await import('/src/ui/phone/messagesModel.ts');
    const reg = await import('/src/ui/registry.ts');
    const ns = await import('/src/ui/shell/NextStep.tsx');
    const core = await import('/src/core/index.ts');
    const time = (name, fn, n = 50) => {
      fn();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) fn();
      return `${name}: ${((performance.now() - t0) / n).toFixed(2)} ms`;
    };
    const out = [];
    out.push(time('chatList(state)', () => mm.chatList(s)));
    out.push(time('messages.threads(state)', () => core.messages.threads(s)));
    out.push(
      time('hasOpenDeadline für alle Chats', () => {
        for (const c of mm.chatList(s)) core.messages.hasOpenDeadline(s, c.contactId);
      }),
    );
    out.push(time('collectLiveActivities(state)', () => reg.collectLiveActivities(s)));
    out.push(time('collectAdvice(state)', () => ns.collectAdvice(s)));
    const badges = [...reg.phoneApps.list(), ...reg.sidebarTabs.list()].filter((a) => a.badge);
    for (const a of badges) out.push(time(`badge ${a.id}`, () => a.badge(s, ui)));
    out.push(time('JSON.stringify(state) (Autosave)', () => JSON.stringify(s), 5));
    return { out, contacts: Object.keys(s.messages.contacts).length, msgs: s.messages.list.length };
  });
  console.log(
    `\n--- Mikro-Benchmarks "${label}" (Kontakte ${r.contacts}, Nachrichten ${r.msgs}) ---\n${r.out.join('\n')}`,
  );
}

if (args.save) {
  await page.evaluate(
    (text) => {
      window.koeln.session.importSave(text);
      window.koeln.runtime.requestRender();
    },
    readFileSync(args.save, 'utf8'),
  );
  console.log(`Spielstand geladen: ${args.save}`);
} else {
  await page.evaluate((days) => {
    const sim = window.koeln.session.sim;
    for (let i = 0; i < days * 1440; i++) sim.step();
    window.koeln.runtime.requestRender();
  }, DAYS);
  console.log(`Frisches Spiel um ${DAYS} Spieltage vorgespult`);
}
await page.waitForTimeout(2500);
await closeDialogs();
await page.waitForTimeout(1000);

if (SCENES.has('ui')) {
  await measure('Handy Startbildschirm');
  await page.evaluate(() => {
    window.koeln.runtime.api.openPhone('core.messages');
    window.koeln.runtime.requestRender();
  });
  await page.waitForTimeout(1500);
  await measure('Nachrichten-App offen');
  await micro('normal');

  // Viele offene Anfragen erzeugen (umgeht MAX_OPEN_ORDERS, indem die Liste kurz geleert wird).
  const made = await page.evaluate(async () => {
    const orders = await import('/src/modules/customers/orders.ts');
    const sim = window.koeln.session.sim;
    const ctx = sim.ctx('customers');
    const s = sim.state.modules.customers;
    const saved = s.orders;
    const created = [];
    for (let i = 0; i < 20; i++) {
      s.orders = [];
      const o = (i % 3 === 0 ? orders.offerWholesale : orders.offerDelivery)(ctx, true);
      if (o) created.push(o);
    }
    s.orders = [...saved, ...created];
    sim.step();
    window.koeln.runtime.requestRender();
    return { erzeugt: created.length, offen: s.orders.filter((o) => o.status === 'offered').length };
  });
  console.log('Anfragen erzeugt:', JSON.stringify(made));
  await page.waitForTimeout(1500);
  await measure('Viele offene Anfragen, Nachrichten-App offen');
  await micro('viele Anfragen');
  await page.evaluate(() => {
    const open = window.koeln.session.state.modules.customers.orders.find((o) => o.status === 'offered');
    if (open) window.koeln.runtime.api.openPhone('core.messages', { contactId: open.contactId });
    window.koeln.runtime.requestRender();
  });
  await page.waitForTimeout(1500);
  await measure('Viele offene Anfragen, ein Chat mit Frist offen');
  await page.evaluate(() => {
    window.koeln.runtime.api.closePhone();
    window.koeln.runtime.requestRender();
  });
  await page.waitForTimeout(1500);
  await measure('Viele offene Anfragen, Handy zu');
}

/** Karte im Normalbetrieb: Zahlen der Messhilfe (src/map/perf.ts) über SECONDS Sekunden bei Tempo SPEED. */
async function measureMap(label) {
  await closeDialogs();
  await page.evaluate(() => window.__ktMapPerf?.reset());
  await page.evaluate(() => window.__perf.reset());
  await page.evaluate((s) => window.koeln.runtime.api.setSpeed(s), SPEED);
  // Begegnungen und Übernahmen öffnen Dialoge, die das Spiel anhalten: während der Messung gleich wieder zu.
  for (let i = 0; i < SECONDS; i++) {
    await page.waitForTimeout(1000);
    await closeDialogs();
  }
  const info = await page.evaluate(() => {
    const stats = window.__ktMapPerf?.stats() ?? null;
    const p = window.__perf;
    const s = window.koeln.session.state;
    const map = window.koeln.runtime.map?.map;
    return {
      stats,
      longTasks: p.longTasks,
      steps: p.steps,
      stepMs: p.stepMs,
      uiMs: p.uiMs,
      ui: p.ui,
      zoom: map?.getZoom() ?? 0,
      open: s.modules.customers.orders.filter((o) => o.status === 'offered' || o.status === 'enRoute').length,
      enRoute: s.modules.customers.orders.filter((o) => o.status === 'enRoute').length,
      phone: window.koeln.runtime.ui.phone.open,
      dialog: window.koeln.runtime.ui.dialog?.id ?? null,
      speed: window.koeln.session.loop.speed,
    };
  });
  await page.evaluate(() => window.koeln.runtime.api.setSpeed(0));
  const st = info.stats;
  if (!st) {
    console.log(`\n######## "${label}": keine Messhilfe (?perf=1 nur im Dev-Build) ########`);
    return;
  }
  const lt = info.longTasks;
  const perSecond = (n) => (n / Math.max(0.001, st.seconds)).toFixed(1);
  const work = Object.entries(st.work)
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([k, v]) => `${k} ${(v.ms / Math.max(1, st.frames)).toFixed(2)} ms/Bild (max ${v.max.toFixed(1)})`);
  const layers = Object.entries(st.layers)
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 8)
    .map(([k, v]) => `${k} ${(v.ms / v.calls).toFixed(2)} ms × ${perSecond(v.calls)}/s`);
  const sources = Object.entries(st.setData)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${perSecond(v)}/s (Spitze ${st.setDataPeakPerSecond[k] ?? 0})`);
  console.log(
    [
      `\n######## "${label}" (${SECONDS} s, ${SPEED}x, ${WIDTH}x${HEIGHT}${MOBILE ? ' Handy' : ''}${THROTTLE > 1 ? `, CPU ${THROTTLE}x gedrosselt` : ''}${'reduced-motion' in args ? ', Bewegung reduziert' : ''}${TRAFFIC ? `, Verkehr ${TRAFFIC}` : ''}) ########`,
      `Zustand: offene Aufträge ${info.open} (unterwegs ${info.enRoute}), Zoom ${info.zoom.toFixed(1)}, Handy ${info.phone ? 'offen' : 'zu'}, Tempo ${info.speed}${info.dialog ? `, Dialog ${info.dialog}` : ''}`,
      `Bilder: ${st.fps.toFixed(1)} fps, längster Abstand ${st.maxInterval.toFixed(0)} ms, ${st.slowFrames} Bilder über 50 ms`,
      `Bild-Arbeit Karte (Animationen): ${st.frameMs.toFixed(2)} ms/Bild im Mittel, schlimmstes Bild ${st.maxFrameMs.toFixed(1)} ms`,
      `Anzahl: ${
        Object.entries(st.counts ?? {})
          .map(([k, c]) => `${k} ${c.mean.toFixed(0)} im Mittel (höchstens ${c.max})`)
          .join(' | ') || '–'
      }`,
      `  ${work.join(' | ') || '–'}`,
      `Layer-update: ${layers.join(' | ') || '–'}`,
      `setData: ${sources.join(' | ') || '–'}`,
      `Long Tasks: ${lt.length}, max ${Math.max(0, ...lt).toFixed(0)} ms (über 50 ms: ${lt.filter((d) => d > 50).length})`,
      `Simulation ${(info.stepMs / Math.max(1, info.steps)).toFixed(3)} ms/Schritt | UI ${(info.uiMs / Math.max(1, info.ui)).toFixed(1)} ms/Neuzeichnen`,
    ].join('\n'),
  );
}

if (SCENES.has('karte')) {
  if (HOUR !== null) {
    const time = await page.evaluate((hour) => {
      const sim = window.koeln.session.sim;
      const t = sim.state.time;
      let target = Math.floor(t / 1440) * 1440 + hour * 60;
      if (target <= t) target += 1440;
      sim.advance(target - t);
      window.koeln.runtime.requestRender();
      return sim.state.time;
    }, HOUR);
    console.log(`Vorgespult bis ${String(Math.floor(time / 60) % 24).padStart(2, '0')}:00`);
    // Was beim Vorspulen passiert ist (z.B. eine Übernahme), öffnet seinen Dialog kurz danach; der hielte das Spiel an.
    await page.waitForTimeout(1500);
    await closeDialogs();
  }
  // Zehn offene Aufträge, einer davon unterwegs (Lieferung als Fahrzeug auf der Karte), Kamera an den Ringen.
  const made = await page.evaluate(async () => {
    const orders = await import('/src/modules/customers/orders.ts');
    const sim = window.koeln.session.sim;
    const ctx = sim.ctx('customers');
    const s = sim.state.modules.customers;
    const saved = s.orders.filter((o) => o.status === 'offered' || o.status === 'enRoute').slice(0, 10);
    const created = [];
    for (let i = 0; created.length + saved.length < 10 && i < 40; i++) {
      s.orders = [];
      const o = (i % 3 === 0 ? orders.offerWholesale : orders.offerDelivery)(ctx, true);
      if (o) created.push(o);
    }
    s.orders = [...saved, ...created];
    // Die Anfragen bleiben während der Messung offen (sonst laufen sie bei Tempo 4 nach Minuten ab).
    // Die Rechte Hand soll die Anfragen nicht abarbeiten: Aufgabe "Aufträge" für die Messung aus.
    const rh = sim.state.modules.hierarchy.rightHand;
    if (rh?.settings) rh.settings.orders = false;
    const later = sim.state.time + 100000;
    for (const o of s.orders) if (o.status === 'offered') o.expiresAt = later;
    for (const m of sim.state.messages.list)
      if (m.options && !m.answer && m.expiresAt !== undefined) m.expiresAt = later;
    const delivery = s.orders.find((o) => o.status === 'offered');
    if (delivery && !s.orders.some((o) => o.status === 'enRoute')) {
      Object.assign(delivery, {
        status: 'enRoute',
        deliveredBy: 'player',
        courierId: null,
        fromWarehouseId: null,
        startedAt: sim.state.time,
        arrivesAt: sim.state.time + 240,
        expiresAt: sim.state.time + 600,
      });
    }
    sim.step();
    window.koeln.runtime.api.closeDialog?.();
    window.koeln.runtime.map?.map.jumpTo({ center: [6.9385, 50.9335], zoom: 14.5 });
    window.koeln.runtime.requestRender();
    return s.orders.filter((o) => o.status === 'offered' || o.status === 'enRoute').length;
  });
  console.log(`Karte: ${made} offene Aufträge`);
  await closeDialogs();
  await page.waitForTimeout(3000);
  await measureMap('Karte Normalbetrieb, zehn offene Aufträge, eine Lieferung');
}

console.log(`\nBrowser-Fehler: ${errors.length}${errors.length ? `\n${errors.slice(0, 5).join('\n')}` : ''}`);
await browser.close();
await server.close();
