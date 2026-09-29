// Misst am laufenden Spiel, ob die Handy-Seiten die Grenzen der Barrierefreiheit einhalten (Apple HIG,
// Accessibility): Zieltreffer mindestens 44 × 44 px, Text nie unter 11 px, Kontrast 4.5:1 (Text bis 17 pt) bzw. 3:1
// (große oder fette Schrift). Gemessen wird mit den berechneten Farben der Seite, nicht mit Schätzungen.
//
//   npm run audit:phone
//   npm run audit:phone -- --appearance=light --sizes=desktop --scenes=home,chat
//
// Optionen wie bei screenshot:phone (--scenes, --sizes, --time, --appearance). Endet mit Fehlercode 1, wenn etwas
// unter der Grenze liegt. Text über Farbverläufen oder Bildern kann nicht gemessen werden und wird gezählt, aber nicht
// als Fehler gemeldet (dafür gilt contrast.test.ts für die Tokens).

import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';
import { openGame, SCENES, showScene, VIEWPORTS } from './phone-scenes.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const sizes = (args.sizes ?? 'desktop,mobile').split(',');
const advance = Number(args.time ?? 720);
const appearance = args.appearance === 'light' ? 'light' : 'dark';
const wanted = args.scenes ? args.scenes.split(',') : SCENES.map((s) => s.name);

/** Läuft im Browser: sammelt Verstöße innerhalb des Handys (und des Banners). */
function audit() {
  const TARGET = 44;
  const MIN_FONT = 11;

  const parse = (value) => {
    const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
    if (rgb) {
      const p = rgb[1]
        .split(/[,\s/]+/)
        .filter(Boolean)
        .map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
    }
    const srgb = /^color\(srgb ([^)]+)\)$/.exec(value);
    if (srgb) {
      const p = srgb[1]
        .split(/[\s/]+/)
        .filter(Boolean)
        .map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 };
    }
    return null;
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** Hintergrund hinter einem Element: Farben von innen nach außen übereinander legen. Null bei Verlauf/Bild. */
  const backdrop = (el) => {
    const layers = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.999) break;
      }
    }
    let acc = layers.length > 0 && layers[layers.length - 1].a >= 0.999 ? layers.pop() : { r: 0, g: 0, b: 0, a: 1 };
    while (layers.length) acc = over(layers.pop(), acc);
    return acc;
  };
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${text ? ` "${text}"` : ''}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  /** Liegt das Element im sichtbaren Ausschnitt seines scrollenden Elternelements? */
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    for (let node = el.parentElement; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) {
        const p = node.getBoundingClientRect();
        if (r.bottom <= p.top + 1 || r.top >= p.bottom - 1 || r.right <= p.left + 1 || r.left >= p.right - 1) {
          return false;
        }
      }
    }
    return true;
  };

  const roots = [...document.querySelectorAll('.phone, .phone-notice')];
  const issues = [];
  let textCount = 0;
  let unchecked = 0;
  const seen = new Set();
  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      if (seen.has(el) || !visible(el) || !inView(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      // Zieltreffer
      const interactive =
        el.matches('button, a[href], input, select, textarea, [role="switch"], [role="button"], [tabindex]') &&
        !el.disabled &&
        !el.closest('[aria-hidden="true"]');
      if (interactive && !el.matches('input[type="range"]')) {
        const r = el.getBoundingClientRect();
        // Eine Trefferfläche darf über ::before/::after größer sein als das sichtbare Element (z.B. die Island)
        let w = r.width;
        let h = r.height;
        for (const pseudo of ['::before', '::after']) {
          const pc = getComputedStyle(el, pseudo);
          if (pc.content !== 'none' && pc.position === 'absolute') {
            w = Math.max(w, Number.parseFloat(pc.width) || 0);
            h = Math.max(h, Number.parseFloat(pc.height) || 0);
          }
        }
        if (w < TARGET - 0.5 || h < TARGET - 0.5) {
          issues.push(`Ziel ${Math.round(w)}×${Math.round(h)}: ${describe(el)}`);
        }
      }
      // Text
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!own) continue;
      textCount++;
      const size = Number.parseFloat(cs.fontSize);
      if (size < MIN_FONT - 0.01) issues.push(`Schrift ${size}px: ${describe(el)}`);
      const fg = parse(cs.color);
      // Die Statusleiste liegt auf dem Startbildschirm über dem Wallpaper (Verlauf): dort gilt contrast.test.ts.
      const bg = el.closest('.phone__screen.is-home') && el.closest('.phone__status') ? null : backdrop(el);
      if (!fg || !bg) {
        unchecked++;
        continue;
      }
      const c = ratio(fg.a < 1 ? over(fg, bg) : fg, bg);
      const large = size >= 24 || (size >= 18.66 && Number.parseInt(cs.fontWeight, 10) >= 700);
      const need = large ? 3 : 4.5;
      if (c < need - 0.02) issues.push(`Kontrast ${c.toFixed(2)}:1 (nötig ${need}): ${describe(el)}`);
    }
  }
  return { issues, textCount, unchecked };
}

const { server, base } = await startServer();
const browser = await launchBrowser();
let total = 0;
try {
  for (const size of sizes) {
    const context = await browser.newContext({ ...VIEWPORTS[size], colorScheme: appearance });
    await routeExternal(context, base);
    const page = await context.newPage();
    await openGame(page, base, advance);
    await page.addStyleTag({ content: `.phone { color-scheme: ${appearance} !important; }` });
    for (const scene of SCENES.filter((s) => wanted.includes(s.name))) {
      await showScene(page, scene);
      const { issues, textCount, unchecked } = await page.evaluate(audit);
      const unique = [...new Set(issues)];
      total += unique.length;
      console.log(
        `${unique.length === 0 ? 'ok   ' : 'FEHLT'} ${size}/${scene.name}: ${textCount} Texte, ${unchecked} auf Verlauf ungeprüft`,
      );
      for (const line of unique.slice(0, 12)) console.log(`       ${line}`);
      if (unique.length > 12) console.log(`       … und ${unique.length - 12} weitere`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(total === 0 ? '\nAlles innerhalb der Grenzen.' : `\n${total} Verstöße.`);
process.exit(total === 0 ? 0 : 1);
