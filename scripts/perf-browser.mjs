// Messung im Browser (`npm run perf:browser`): startet den Dev-Server und Chromium, lädt einen Spielstand (oder
// spult ein frisches Spiel vor), lässt das Spiel mit Tempo laufen und misst, was pro Neuzeichnen der Oberfläche
// passiert: Preact-Renders (synchron gemessen, damit es nicht an der GPU hängt), GameMap.update je Layer,
// Simulationsschritte, Long Tasks, DOM-Größe, ein CPU-Profil (Top-Funktionen nach Self-Time) und Mikro-Benchmarks der
// Lesefunktionen (chatList, Live-Aktivitäten, Advisor, Badges). Danach erzeugt es viele offene Lieferanfragen und misst
// die Szenen noch einmal (Nachrichten-App offen, Chat offen, Handy zu).
//
//   node scripts/perf-browser.mjs [--save=pfad.json] [--days=3] [--seconds=25] [--speed=4] [--width=700 --height=500]
//
// --save: Spielstand aus `PERF=1 PERF_SAVE=/tmp/perf.json npm run perf:sim` (Bot, Tag 20). Ohne --save wird ein
// frisches Spiel mit Seed 11 um --days Spieltage vorgespult (ohne Spieler passiert dabei wenig, die Nachrichten und
// Anfragen kommen trotzdem). Headless ohne GPU zeichnet die Karte nur mit wenigen Bildern pro Sekunde; die Zahlen zu
// Preact, Layern und Simulation sind davon unabhängig. WebGL-Natives im Profil deshalb ignorieren.
// Bericht und Hotspots: docs/perf/2026-10-messung.md.

import { readFileSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const SECONDS = Number(args.seconds ?? 25);
const SPEED = Number(args.speed ?? 4);
const WIDTH = Number(args.width ?? 700);
const HEIGHT = Number(args.height ?? 500);
const DAYS = Number(args.days ?? 3);

const { server, base } = await startServer();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
await routeExternal(context, base);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/AJAXError|Failed to load resource/.test(m.text())) errors.push(m.text());
});

await page.goto(new URL('?neu=normal&seed=11&tempo=0', base).toString());
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
    (map.instances ?? []).forEach((inst, i) => {
      if (!inst.update) return;
      const id = ids[i] ?? `#${i}`;
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
    `\n######## "${label}" (${SECONDS} s, ${SPEED}x, ${WIDTH}x${HEIGHT}) ########`,
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

console.log(`\nBrowser-Fehler: ${errors.length}${errors.length ? `\n${errors.slice(0, 5).join('\n')}` : ''}`);
await browser.close();
await server.close();
