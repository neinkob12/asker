// Durchspielen im echten Browser: Der Balancing-Bot (src/playtest/bot.ts) spielt eine Session von etwa 20 Minuten
// (Standard 8 Spieltage, das sind bei Tempo 2x rund 20 echte Minuten) und hält die wichtigen Momente als Screenshot
// fest: erster Verkauf, Läufer an den Spots, Drohung einer Gang im Handy, Konfrontation, Warnung vor einer Razzia,
// Leutnant, Festnahme mit Ersetzen, Kasse, Tagesbericht der Rechten Hand, eigenes Veedel, Nacht. Am Ende eine
// Übersicht, welche Systeme vorkamen. Die Rechte Hand kommt meist erst nach 10–14 Spieltagen (--days=14).
//
//   npm run playthrough
//   npm run playthrough -- --days=12 --seed=4 --size=mobile --out=docs/integration

import { mkdirSync } from 'node:fs';
import { launchBrowser, restartWithProxySupport, routeExternal, startServer } from './browser.mjs';

restartWithProxySupport();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const days = Number(args.days ?? 8);
const seed = Number(args.seed ?? 2);
const size = args.size ?? 'desktop';
const outDir = args.out ?? 'screenshots';
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
mkdirSync(outDir, { recursive: true });

const { server, base } = await startServer(5192);
const browser = await launchBrowser();
const errors = [];
const isTileError = (text) => text.includes('AJAXError') || text.includes('Failed to load resource');
const taken = new Set();

try {
  const context = await browser.newContext(VIEWPORTS[size]);
  await routeExternal(context, base);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isTileError(m.text())) errors.push(m.text());
  });
  await page.goto(new URL(`?neu=normal&seed=${seed}&tempo=0`, base).toString());
  await page.waitForFunction(() => window.koeln?.session?.state?.time > 0);
  await page.waitForTimeout(4000);

  // Bot und Beobachter im Browser laden (der Dev-Server übersetzt TypeScript).
  await page.evaluate(async () => {
    const bot = await import('/src/playtest/bot.ts');
    const { session, runtime } = window.koeln;
    const stats = bot.newBotStats();
    const seen = {};
    session.sim.onEvent((e) => {
      seen[e.type] = (seen[e.type] ?? 0) + 1;
    });
    window.playtest = {
      seen,
      /** Spielt so viele Minuten; hält an, sobald eine Konfrontation offen ist (damit man sie sieht). */
      play(minutes, stopOnEncounter) {
        const sim = session.sim;
        const end = sim.state.time + minutes;
        while (sim.state.time < end && !sim.state.outcome.gameOver) {
          if (stopOnEncounter && sim.state.modules.encounters.active.some((x) => x.phase !== 'done')) break;
          const encounters = sim.state.modules.encounters.active.length;
          if (!stopOnEncounter || encounters === 0) bot.botTurn(sim, stats, bot.DEFAULT_BOT);
          sim.advance(Math.min(10, end - sim.state.time));
        }
        runtime.requestRender();
        return bot.snapshot(sim.state);
      },
      snapshot: () => bot.snapshot(session.state),
      ui: runtime.api,
    };
  });

  const shot = async (name, wait = 600) => {
    if (taken.has(name)) return;
    taken.add(name);
    await page.waitForTimeout(wait);
    const file = `${outDir}/session-${String(taken.size).padStart(2, '0')}-${name}-${size}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
    console.log(`  Screenshot: ${file}`);
  };
  const ui = (fn, ...a) => page.evaluate(([f, x]) => window.playtest.ui[f](...x), [fn, a]);
  const closeAll = async () => {
    await ui('closePhone');
    await ui('closePanel');
    await ui('closeDialog');
  };

  await shot('start');
  let last = null;
  for (let hour = 0; hour < days * 24; hour++) {
    last = await page.evaluate(() => window.playtest.play(60, true));
    const state = await page.evaluate(() => {
      const s = window.koeln.session.state;
      const open = s.modules.encounters.active.find((e) => e.phase !== 'done');
      const gangThreat = s.messages.list.find((m) => m.contactId.startsWith('gang:') && m.options?.length);
      const warning = s.messages.list.find((m) => m.options?.some((o) => o.id === 'lieLow'));
      // Festnahme mit Ersetzen: deine Antwort "Ersetzen" auf die Frage nach der Festnahme oder die Meldung des
      // Leutnants bzw. der Rechten Hand, die den Ausfall selbst ersetzt haben.
      const arrests = s.messages.list.filter((m) => m.options?.some((o) => o.id === 'replace'));
      const arrest =
        arrests.find((m) => m.answer === 'replace' || m.answer === 'fireReplace') ??
        s.messages.list.find((m) => /sitzt.*übernimmt|steht jetzt jemand anderes/.test(m.text)) ??
        null;
      const report = s.messages.list.find((m) => m.options?.some((o) => o.id === 'openFinance'));
      return {
        time: s.time,
        hour: Math.floor(s.time / 60) % 24,
        encounter: open?.id ?? null,
        gangThreat: gangThreat?.contactId ?? null,
        warning: warning?.contactId ?? null,
        arrest: arrest?.contactId ?? null,
        report: report?.contactId ?? null,
        lieutenants: Object.keys(s.modules.hierarchy.posts),
        runners: s.modules.staff.members.filter((m) => m.role === 'runner' && m.assignment).length,
      };
    });
    if (state.runners >= 2 && !taken.has('laeufer')) {
      await page.evaluate(() => window.playtest.ui.flyTo({ lng: 6.94, lat: 50.931 }, 15.2));
      await page.waitForTimeout(2500);
      await shot('laeufer');
      await page.evaluate(() => window.playtest.ui.flyToKoeln());
      await page.waitForTimeout(1500);
    }
    if (state.gangThreat && !taken.has('gang-drohung')) {
      await ui('openPhone', 'core.messages', { contactId: state.gangThreat });
      await shot('gang-drohung');
      await closeAll();
    }
    if (state.encounter !== null) {
      await ui('openDialog', 'encounters.encounter', { encounterId: state.encounter });
      await shot('konfrontation');
      await page.evaluate((id) => {
        const sim = window.koeln.session.sim;
        const e = sim.state.modules.encounters.active.find((x) => x.id === id);
        if (e?.phase === 'briefing')
          sim.dispatch({ type: 'encounters.join', payload: { encounterId: id, present: false } });
        sim.dispatch({ type: 'encounters.auto', payload: { encounterId: id } });
      }, state.encounter);
      await closeAll();
    }
    if (state.warning && !taken.has('razzia-warnung')) {
      await ui('openPhone', 'core.messages', { contactId: state.warning });
      await shot('razzia-warnung');
      await closeAll();
    }
    if (state.lieutenants.length > 0 && !taken.has('leutnant')) {
      await ui('openPanel', 'hierarchy.lieutenant', { staffId: state.lieutenants[0] });
      await shot('leutnant');
      await closeAll();
    }
    if (state.arrest && !taken.has('festnahme-ersetzt')) {
      await ui('openPhone', 'core.messages', { contactId: state.arrest });
      await shot('festnahme-ersetzt', 1800);
      await closeAll();
    }
    if (hour >= 2 * 24 + 20 && !taken.has('kasse')) {
      await ui('openPhone', 'finance.app');
      await shot('kasse', 1800);
      await closeAll();
    }
    if (state.report && !taken.has('tagesbericht')) {
      await ui('openPhone', 'core.messages', { contactId: state.report });
      await shot('tagesbericht', 1800);
      await closeAll();
    }
    if (last.veedel > 0 && !taken.has('reviere')) {
      await ui('selectTab', 'territory');
      await shot('reviere');
      await ui('selectTab', 'business');
    }
    if (state.hour === 23 && hour > 24 && !taken.has('nacht')) await shot('nacht');
    if (last.gameOver) break;
  }
  await ui('selectTab', 'journal');
  await shot('ende');

  const seen = await page.evaluate(() => window.playtest.seen);
  const systems = {
    'Verkäufe (Straße)': seen['sale.completed'],
    'Lieferungen angekommen': seen['shipment.arrived'],
    'Läufer/Leute eingestellt': seen['staff.hired'],
    Leutnants: seen['hierarchy.appointed'],
    'Rechte Hand': seen['hierarchy.rightHandAppointed'],
    Tagesberichte: seen['hierarchy.dailyReport'],
    Festnahmen: seen['police.arrest'],
    'Polizei-Stufe gewechselt': seen['police.tierChanged'],
    'Einfluss/Kontrollwechsel': seen['territory.controlChanged'],
    'Gang-Eskalationen': seen['gang.escalated'],
    'Gang-Vorstöße': seen['gang.pushStarted'],
    Konfrontationen: seen['encounter.started'],
    'Polizei-Kontrollen': seen['police.check'],
    'Razzien geplant': seen['police.raidPlanned'],
    'Handy-Nachrichten': seen['message.received'],
    Wetterwechsel: seen['weather.changed'],
    Stammkunden: seen['customer.regularGained'],
  };
  console.log(`\nNach ${days} Spieltagen (Seed ${seed}): ${JSON.stringify(last)}`);
  for (const [name, count] of Object.entries(systems)) console.log(`  ${name}: ${count ?? 0}`);
  await context.close();
} finally {
  await browser.close();
  await server.close();
}

if (errors.length > 0) {
  console.error(`\nFehler im Browser:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
