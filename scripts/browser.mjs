// Gemeinsame Hilfen für Screenshots und den Ende-zu-Ende-Test: Dev-Server starten, Chromium finden und starten,
// Kartenkacheln über Node laden (dann zeigt die Karte auch in abgeschotteten Umgebungen das echte Luftbild).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

/**
 * Node lädt Kacheln nur über einen gesetzten Proxy, wenn NODE_USE_ENV_PROXY=1 beim Start gesetzt ist.
 * Ist ein Proxy da, die Variable aber nicht, startet sich das Skript damit neu. Gibt true zurück, wenn der
 * Neustart gelaufen ist (dann soll der Aufrufer nichts mehr tun).
 */
export function restartWithProxySupport() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY === '1') return false;
  const result = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(result.status ?? 1);
}

export function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  if (existsSync(`${base}/chromium`)) return `${base}/chromium`;
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  const exe = dir && `${base}/${dir}/chrome-linux/chrome`;
  return exe && existsSync(exe) ? exe : undefined;
}

/** Vite-Dev-Server auf einem freien Port. */
export async function startServer(port = 5190) {
  const server = await createServer({
    server: { port, strictPort: false, forwardConsole: false },
    logLevel: 'warn',
  });
  await server.listen();
  return { server, base: server.resolvedUrls.local[0] };
}

export async function launchBrowser() {
  return chromium.launch({
    executablePath: findChromium(),
    // Software-WebGL, damit MapLibre auch ohne GPU zeichnet.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/**
 * Anfragen an fremde Hosts (Kartenkacheln, Schriften) lädt Node statt des Browsers. So klappt es auch hinter
 * einem Proxy, den Chromium nicht nutzen kann. Schlägt das fehl, bekommt der Browser einen Fehler (die Karte
 * bleibt dann an der Stelle dunkel, das Spiel läuft trotzdem).
 */
export async function routeExternal(context, base) {
  const local = new URL(base).host;
  let failures = 0;
  await context.route(
    (url) => url.host !== local && (url.protocol === 'https:' || url.protocol === 'http:'),
    async (route) => {
      const request = route.request();
      try {
        const response = await fetch(request.url(), { method: request.method(), headers: { accept: '*/*' } });
        const body = Buffer.from(await response.arrayBuffer());
        const headers = {};
        const type = response.headers.get('content-type');
        if (type) headers['content-type'] = type;
        headers['access-control-allow-origin'] = '*';
        await route.fulfill({ status: response.status, headers, body });
      } catch {
        failures++;
        await route.abort();
      }
    },
  );
  return () => failures;
}
