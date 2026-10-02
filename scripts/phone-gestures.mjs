// Gesten-Test im echten Browser (Playwright): bedient das Handy einmal mit der Maus (Desktop, 1440 × 900) und einmal
// mit dem Finger (Handy-Bildschirm 390 × 844, Touch über das DevTools-Protokoll) und prüft danach den Seitenstapel:
//
//   Rand-Wischen 60 % → zurück, 20 % → bleibt, schnelles kurzes Wischen → zurück, Hochwischen → Startbildschirm,
//   langer Druck → Kontextmenü (Esc schließt es), Blatt nach unten ziehen → zu.
//
// Zusätzlich, auf Wunsch:
//   --trace   Chrome-Trace beim App-Öffnen und Rand-Wischen (Desktop) nach screenshots/handy-trace-*.json, mit Bericht,
//             wie viel Layout während der Federn anfällt (Übergänge sollen nur transform/opacity ändern)
//   --video   kurze Videos der Übergänge nach screenshots/handy-videos/ (für den PR)
//
//   node scripts/phone-gestures.mjs                       (Desktop und Handy)
//   node scripts/phone-gestures.mjs --sizes=mobile --video
//
// Endet mit Fehlercode 1, wenn eine Geste nicht wirkt oder der Browser Fehler meldet.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, renameSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';
import { openGame, VIEWPORTS, waitForStill } from './phone-scenes.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : 'true'];
  }),
);
const sizes = (args.sizes ?? 'desktop,mobile').split(',');
const outDir = 'screenshots';
const videoDir = `${outDir}/handy-videos`;
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
let failures = 0;

// ------------------------------------------------------------------------------------------------ Eingabe

/**
 * Eingabe über das DevTools-Protokoll, mit eigener Zeitangabe je Ereignis: Ohne Grafikkarte zeichnet Chromium so
 * langsam, dass jede Bewegung sonst erst nach dem nächsten Bild ankäme und jedes Wischen langsam wirkte. So zählt
 * die geplante Geschwindigkeit. Die Maus ergibt Pointer Events mit pointerType "mouse", der Finger "touch" (dort gilt
 * touch-action wie auf einem echten Handy).
 */
async function cdpInput(page, kind) {
  const cdp = await page.context().newCDPSession(page);
  let start = 0;
  const stamp = (offset) => (start + offset) / 1000;
  const mouse = (type, x, y, offset) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      timestamp: stamp(offset),
    });
  const touch = (type, x, y, offset) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      timestamp: stamp(offset),
    });
  return {
    name: kind === 'touch' ? 'Touch' : 'Maus',
    async down(x, y) {
      start = Date.now();
      if (kind === 'touch') return touch('touchStart', x, y, 0);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, timestamp: stamp(0) });
      return mouse('mousePressed', x, y, 0);
    },
    move: (x, y, offset) => (kind === 'touch' ? touch('touchMove', x, y, offset) : mouse('mouseMoved', x, y, offset)),
    up: (x, y, offset) => (kind === 'touch' ? touch('touchEnd', x, y, offset) : mouse('mouseReleased', x, y, offset)),
  };
}

/**
 * Zieht von `from` nach `to` in `steps` Schritten über `ms` Millisekunden. Mit `hold` hält der Finger vor dem
 * Loslassen still (dann zählt nur der Weg, nicht die Geschwindigkeit).
 */
async function swipe(input, from, to, { ms = 360, steps = 12, hold = 0 } = {}) {
  await input.down(from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    const offset = (ms * i) / steps;
    await input.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, offset);
  }
  if (hold) {
    await sleep(hold);
    await input.move(to.x, to.y, ms + hold);
  }
  await input.up(to.x, to.y, ms + hold + 1);
}

async function longPress(input, at, ms = 800) {
  await input.down(at.x, at.y);
  await sleep(ms);
  await input.up(at.x, at.y, ms);
}

// ------------------------------------------------------------------------------------------------ Zustand

const run = (page, js) => page.evaluate(js);
/** Schlüssel der Seiten im Stapel (unten zuerst). */
const stackKeys = (page) => page.evaluate(() => window.koeln.runtime.ui.phone.stack.map((e) => e.key));
const screenRect = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.phone__screen').getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
async function settle(page) {
  await sleep(150);
  await waitForStill(page);
  await sleep(100);
}

/** Startbildschirm, dann Geschäft → Lager: drei Seiten im Stapel (Start, Geschäft, Lager). */
async function openSection(page) {
  await run(
    page,
    `(() => {
      const api = window.koeln.runtime.api;
      api.toggleNotificationCenter(false);
      api.openPhone(null);
      api.selectTab('territory');
      api.openPanel('goods.warehouse', { warehouseId: 'ehrenfeld' });
    })()`,
  );
  await page.waitForSelector('.phone-page.is-top[data-kind="section"]');
  await settle(page);
  return stackKeys(page);
}

async function check(name, fn) {
  process.stdout.write(`- ${name} … `);
  try {
    await fn();
    console.log('ok');
  } catch (error) {
    failures++;
    console.log(`FEHLER\n    ${error.message.split('\n').join('\n    ')}`);
  }
}

// ------------------------------------------------------------------------------------------------ Gesten

async function gestures(page, input) {
  const edge = async (fraction, options) => {
    const r = await screenRect(page);
    const y = r.y + r.height * 0.55;
    await swipe(input, { x: r.x + 8, y }, { x: r.x + 8 + r.width * fraction, y: y + 4 }, options);
    await settle(page);
  };

  await check(`${input.name}: Rand-Wischen 60 % (langsam) → eine Seite zurück`, async () => {
    const before = await openSection(page);
    await edge(0.6, { ms: 600, hold: 220 });
    assert.deepEqual(await stackKeys(page), before.slice(0, -1));
  });

  await check(`${input.name}: Rand-Wischen 20 % (langsam) → bleibt`, async () => {
    const before = await openSection(page);
    await edge(0.2, { ms: 400, hold: 220 });
    assert.deepEqual(await stackKeys(page), before);
    // Die Seite liegt wieder ganz vorne (kein halber Übergang bleibt hängen).
    const offset = await page.evaluate(() => {
      const top = document.querySelector('.phone-page.is-top');
      return top ? Math.round(top.getBoundingClientRect().left - top.parentElement.getBoundingClientRect().left) : -1;
    });
    assert.equal(offset, 0, 'oberste Seite wieder an ihrem Platz');
  });

  await check(`${input.name}: schnelles kurzes Wischen (25 %) → zurück`, async () => {
    const before = await openSection(page);
    await edge(0.25, { ms: 50, steps: 4 });
    assert.deepEqual(await stackKeys(page), before.slice(0, -1));
  });

  await check(`${input.name}: Hochwischen am Home-Balken → Startbildschirm`, async () => {
    await openSection(page);
    const bar = await page.evaluate(() => {
      const r = document.querySelector('.phone__nav-button').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const r = await screenRect(page);
    await swipe(input, bar, { x: bar.x, y: bar.y - r.height * 0.3 }, { ms: 500, hold: 200 });
    await settle(page);
    assert.deepEqual(await stackKeys(page), ['home']);
    assert.equal(await page.locator('.phone').count(), 1, 'Handy bleibt offen');
  });

  await check(`${input.name}: langer Druck auf eine Kachel → Kontextmenü, Esc schließt es`, async () => {
    await run(page, 'window.koeln.runtime.api.openPhone(null)');
    await settle(page);
    const tile = await page.evaluate(() => {
      const el = document.querySelector('.phone__app[data-app-id="core.messages"] .phone__tile');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await longPress(input, tile);
    await page.waitForSelector('.ui-ctx-menu', { timeout: 4000 });
    await settle(page);
    assert.deepEqual(await stackKeys(page), ['home'], 'langer Druck öffnet die App nicht');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.ui-ctx-menu', { state: 'detached', timeout: 4000 });
    assert.equal(await page.locator('.phone').count(), 1, 'Esc schließt nur das Menü, nicht das Handy');
  });

  await check(`${input.name}: Blatt am Griff nach unten ziehen → zu`, async () => {
    await run(
      page,
      `(() => {
        const api = window.koeln.runtime.api;
        api.openPhone(null);
        api.selectTab('gangs');
        api.openPanel('gangs.gang', { gangId: Object.keys(window.koeln.session.state.modules.gangs.gangs)[0] });
      })()`,
    );
    await settle(page);
    await page.locator('.phone-page.is-top .ui-list__button', { hasText: 'Bündnis' }).click();
    await page.waitForSelector('.ui-sheet');
    await settle(page);
    const head = await page.evaluate(() => {
      const r = document.querySelector('.ui-sheet__head').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 12 };
    });
    const r = await screenRect(page);
    await swipe(input, head, { x: head.x, y: head.y + r.height * 0.4 }, { ms: 500, hold: 200 });
    await page.waitForSelector('.ui-sheet', { state: 'detached', timeout: 4000 });
    await settle(page);
  });
}

// ------------------------------------------------------------------------------------------------ Trace

/** Ereignisse des Chrome-Traces lesen und Layout und Stil-Neuberechnung zusammenzählen (in Millisekunden). */
function summarizeTrace(file) {
  const { traceEvents } = JSON.parse(readFileSync(file, 'utf8'));
  const sum = (name) => {
    const events = traceEvents.filter((e) => e.name === name && e.ph === 'X');
    const durations = events.map((e) => (e.dur ?? 0) / 1000);
    return {
      count: events.length,
      total: durations.reduce((a, b) => a + b, 0),
      max: durations.reduce((a, b) => Math.max(a, b), 0),
    };
  };
  const frames = traceEvents.filter((e) => e.name === 'BeginFrame' || e.name === 'DrawFrame').length;
  return { layout: sum('Layout'), style: sum('UpdateLayoutTree'), paint: sum('Paint'), frames };
}

async function traced(browser, page, name, action) {
  const file = `${outDir}/handy-trace-${name}.json`;
  await browser.startTracing(page, {
    path: file,
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
    ],
  });
  await action();
  await settle(page);
  await browser.stopTracing();
  const s = summarizeTrace(file);
  const ms = (v) => `${v.toFixed(1)} ms`;
  console.log(
    `  ${name}: Layout ${s.layout.count}× (zusammen ${ms(s.layout.total)}, längstes ${ms(s.layout.max)}), ` +
      `Stil ${s.style.count}× (${ms(s.style.total)}), Paint ${s.paint.count}×, Frames ${s.frames} → ${file}`,
  );
  return s;
}

async function trace(browser, page) {
  console.log('\nTrace (Desktop): Layout während der Federn');
  await check('App öffnen (Kachel antippen) ohne lange Layout-Frames', async () => {
    await run(page, 'window.koeln.runtime.api.openPhone(null)');
    await settle(page);
    const s = await traced(browser, page, 'app-oeffnen', async () => {
      await page.locator('.phone__app[data-app-id="core.messages"]').click();
    });
    // Die neue Seite wird einmal aufgebaut (ein Layout), danach bewegen Federn nur noch transform und opacity.
    assert.ok(s.layout.max < 50, `längstes Layout ${s.layout.max.toFixed(1)} ms`);
  });
  await check('Rand-Wischen ohne lange Layout-Frames', async () => {
    await openSection(page);
    const r = await screenRect(page);
    const y = r.y + r.height * 0.55;
    const mouse = await cdpInput(page, 'mouse');
    const s = await traced(browser, page, 'rand-wischen', () =>
      swipe(mouse, { x: r.x + 8, y }, { x: r.x + r.width * 0.7, y }, { ms: 600, steps: 16, hold: 150 }),
    );
    assert.ok(s.layout.max < 50, `längstes Layout ${s.layout.max.toFixed(1)} ms`);
  });
}

// ------------------------------------------------------------------------------------------------ Videos

/** Kurzer Rundgang mit allen Übergängen (App öffnen, Push, Rand-Wischen, Blatt, Kontextmenü, Hochwischen). */
async function tour(page, input) {
  const pause = () => sleep(900);
  await run(page, 'window.koeln.runtime.api.openPhone(null)');
  await settle(page);
  await pause();
  await page.locator('.phone__app[data-app-id="tab:territory"]').click();
  await settle(page);
  await pause();
  await page.locator('.phone-page.is-top .ui-list__button', { hasText: 'Altstadt-Nord' }).first().click();
  await settle(page);
  await pause();
  const r = await screenRect(page);
  const y = r.y + r.height * 0.55;
  await swipe(input, { x: r.x + 8, y }, { x: r.x + r.width * 0.75, y }, { ms: 900, steps: 24, hold: 150 });
  await settle(page);
  await pause();
  const bar = await page.evaluate(() => {
    const b = document.querySelector('.phone__nav-button').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await swipe(input, bar, { x: bar.x, y: bar.y - r.height * 0.35 }, { ms: 700, steps: 18, hold: 120 });
  await settle(page);
  await pause();
  const tile = await page.evaluate(() => {
    const t = document.querySelector('.phone__app[data-app-id="core.messages"] .phone__tile').getBoundingClientRect();
    return { x: t.left + t.width / 2, y: t.top + t.height / 2 };
  });
  await longPress(input, tile);
  await settle(page);
  await pause();
  await page.keyboard.press('Escape');
  await settle(page);
  await run(
    page,
    `(() => {
      const api = window.koeln.runtime.api;
      api.selectTab('gangs');
      api.openPanel('gangs.gang', { gangId: Object.keys(window.koeln.session.state.modules.gangs.gangs)[0] });
    })()`,
  );
  await settle(page);
  await pause();
  await page.locator('.phone-page.is-top .ui-list__button', { hasText: 'Bündnis' }).click();
  await settle(page);
  await pause();
  const head = await page.evaluate(() => {
    const h = document.querySelector('.ui-sheet__head').getBoundingClientRect();
    return { x: h.left + h.width / 2, y: h.top + 12 };
  });
  await swipe(input, head, { x: head.x, y: head.y + r.height * 0.45 }, { ms: 700, steps: 18, hold: 120 });
  await settle(page);
  await pause();
}

// ------------------------------------------------------------------------------------------------ Ablauf

const { server, base } = await startServer(5193);
const browser = await launchBrowser();
try {
  for (const size of sizes) {
    console.log(`\n${size === 'mobile' ? 'Handy-Bildschirm (390×844, Touch)' : 'Desktop (1440×900, Maus)'}`);
    const video = args.video ? { recordVideo: { dir: videoDir, size: VIEWPORTS[size].viewport } } : {};
    const context = await browser.newContext({ ...VIEWPORTS[size], colorScheme: 'dark', ...video });
    await routeExternal(context, base);
    const page = await context.newPage();
    const opened = Date.now();
    page.on('pageerror', (e) => errors.push(`[${size}] ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && !text.includes('AJAXError') && !text.includes('Failed to load resource')) {
        errors.push(`[${size}] ${text}`);
      }
    });
    await openGame(page, base, 720);
    const input = await cdpInput(page, size === 'mobile' ? 'touch' : 'mouse');
    if (args.video) {
      // Das Video beginnt mit dem Laden des Spiels; so lässt es sich kürzen (z.B. ffmpeg -ss).
      console.log(`  Rundgang ab ${((Date.now() - opened) / 1000).toFixed(1)} s im Video`);
      await tour(page, input);
    } else {
      await gestures(page, input);
      if (args.trace && size === 'desktop') await trace(browser, page);
    }
    const recorded = page.video();
    await context.close();
    if (recorded) {
      const file = `${videoDir}/uebergaenge-${size}.webm`;
      renameSync(await recorded.path(), file);
      console.log(`  Video: ${file}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (errors.length > 0) {
  console.error(`\nFehler im Browser:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
if (failures > 0) {
  console.error(`\n${failures} Geste(n) haben nicht gewirkt.`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log('\nAlle Gesten wirken.');
}
