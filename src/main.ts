import './style.css';
import { KOELN_SPOTS } from './data/spots';
import { CUSTOMER_PATIENCE, GAME_MINUTES_PER_REAL_SECOND, PACKAGES, RUNNER_DAILY_WAGE, RUNNER_HIRE_COST } from './game/config';
import {
  createGame,
  customerRevenue,
  fireRunner,
  formatClock,
  hireRunner,
  orderShipment,
  serveAllAtSpot,
  serveCustomer,
  tick,
  type ActionResult,
  type GameState,
} from './game/engine';
import { clearSave, loadGame, saveGame } from './game/save';
import { GameMap } from './map/gameMap';

const spots = KOELN_SPOTS;
const spotById = new Map(spots.map((s) => [s.id, s]));

let state: GameState = loadGame() ?? createGame(spots);
let speed = 1;
let selectedSpotId: string | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const gameMap = new GameMap($('map'), spots, (id) => selectSpot(id));

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

let toastTimer = 0;
function toast(text: string): void {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

function act(result: ActionResult): void {
  if (!result.ok) toast(result.reason);
  render(true);
}

function selectSpot(id: string | null): void {
  selectedSpotId = id;
  $('spot-panel').hidden = id === null;
  render(true);
}

// Listen werden nur neu gebaut, wenn sich ihre Struktur ändert, sonst würden Klicks verloren gehen.
const signatures: Record<string, string> = {};
function renderIfChanged(key: string, signature: string, build: () => string, force: boolean): void {
  if (!force && signatures[key] === signature) return;
  signatures[key] = signature;
  $(key).innerHTML = build();
}

function render(force = false): void {
  $('money').textContent = euro(state.money);
  $('stock').textContent = `${state.stock} g`;
  $('clock').textContent = formatClock(state.time);

  renderIfChanged(
    'packages',
    PACKAGES.map((p) => state.money >= p.price).join(),
    () =>
      PACKAGES.map(
        (p) => `<button data-action="order" data-id="${p.id}" ${state.money < p.price ? 'disabled' : ''}>
          <strong>${p.label}</strong><span>${euro(p.price)}</span></button>`,
      ).join(''),
    force,
  );

  renderIfChanged(
    'shipments',
    state.shipments.map((s) => s.id).join(),
    () =>
      state.shipments.length === 0
        ? '<p class="empty">Keine Lieferung unterwegs.</p>'
        : state.shipments
            .map(
              (s) => `<div class="shipment" data-shipment="${s.id}">
                <span>${s.grams} g unterwegs</span>
                <div class="bar"><div class="fill"></div></div></div>`,
            )
            .join(''),
    force,
  );
  for (const s of state.shipments) {
    const fill = document.querySelector<HTMLElement>(`[data-shipment="${s.id}"] .fill`);
    if (fill) fill.style.width = `${Math.min(100, ((state.time - s.departedAt) / (s.arrivesAt - s.departedAt)) * 100)}%`;
  }

  renderIfChanged(
    'runners',
    state.runners.map((r) => r.spotId).join(),
    () =>
      state.runners.length === 0
        ? `<p class="empty">Noch keine Läufer. Klick auf einen Spot, um einen anzuheuern (${euro(RUNNER_HIRE_COST)}, ${euro(RUNNER_DAILY_WAGE)} pro Tag).</p>`
        : `<ul class="runner-list">${state.runners
            .map((r) => `<li><button class="link" data-action="select" data-id="${r.spotId}">${esc(spotById.get(r.spotId)?.name ?? r.spotId)}</button></li>`)
            .join('')}</ul><p class="hint">Löhne: ${euro(state.runners.length * RUNNER_DAILY_WAGE)} pro Tag</p>`,
    force,
  );

  $('stats').innerHTML = `
    <div class="kv"><span>Verkauft</span><span>${state.stats.gramsSold} g</span></div>
    <div class="kv"><span>Umsatz</span><span>${euro(state.stats.revenue)}</span></div>
    <div class="kv"><span>Verlorene Kunden</span><span>${state.stats.customersLost}</span></div>
    <div class="kv"><span>Wartende Kunden</span><span>${state.customers.length}</span></div>`;

  renderIfChanged(
    'log',
    String(state.log[0]?.id ?? 0),
    () => state.log.map((l) => `<li class="${l.kind}"><time>${formatClock(l.time).split(', ')[1]}</time> ${esc(l.text)}</li>`).join(''),
    force,
  );

  renderSpotPanel(force);
  gameMap.update(state, selectedSpotId);
}

function renderSpotPanel(force: boolean): void {
  if (!selectedSpotId) return;
  const spot = spotById.get(selectedSpotId);
  if (!spot) return;
  const waiting = state.customers.filter((c) => c.spotId === spot.id).sort((a, b) => a.expiresAt - b.expiresAt);
  const hasRunner = state.runners.some((r) => r.spotId === spot.id);
  $('spot-title').textContent = spot.name;

  const signature = [
    spot.id,
    hasRunner,
    state.money >= RUNNER_HIRE_COST,
    ...waiting.map((c) => `${c.id}:${state.stock >= c.grams}`),
  ].join('|');

  renderIfChanged(
    'spot-body',
    signature,
    () => {
      const customers =
        waiting.length === 0
          ? '<p class="empty">Gerade niemand da.</p>'
          : `<ul class="customers">${waiting
              .map(
                (c) => `<li data-customer="${c.id}">
                  <div class="c-info"><strong>${c.grams} g</strong><span>${euro(customerRevenue(c))} (${c.pricePerGram.toFixed(1)} €/g)</span></div>
                  <div class="bar patience"><div class="fill"></div></div>
                  <button data-action="serve" data-id="${c.id}" ${state.stock < c.grams ? 'disabled' : ''}>Verkaufen</button>
                </li>`,
              )
              .join('')}</ul>
            <button class="primary wide" data-action="serve-all" data-id="${spot.id}">Alle bedienen</button>`;
      const runner = hasRunner
        ? `<div class="runner-box"><span>Läufer arbeitet hier und bedient Kunden automatisch.</span>
             <button class="danger subtle" data-action="fire" data-id="${spot.id}">Entlassen</button></div>`
        : `<div class="runner-box"><span>Kein Läufer. Ein Läufer bedient hier automatisch.</span>
             <button data-action="hire" data-id="${spot.id}" ${state.money < RUNNER_HIRE_COST ? 'disabled' : ''}>Anheuern (${euro(RUNNER_HIRE_COST)})</button></div>`;
      return `<p class="hint">Preisniveau ${Math.round(spot.priceMultiplier * 100)} %, Andrang ${Math.round(spot.demand * 100)} %</p>${customers}${runner}`;
    },
    force,
  );

  for (const c of waiting) {
    const fill = document.querySelector<HTMLElement>(`[data-customer="${c.id}"] .fill`);
    if (!fill) continue;
    const left = Math.max(0, (c.expiresAt - state.time) / CUSTOMER_PATIENCE);
    fill.style.width = `${left * 100}%`;
    fill.classList.toggle('low', left < 1 / 3);
  }
}

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const id = target.dataset.id ?? '';
  switch (target.dataset.action) {
    case 'order':
      act(orderShipment(state, id));
      break;
    case 'serve':
      act(serveCustomer(state, Number(id)));
      break;
    case 'serve-all': {
      const served = serveAllAtSpot(state, id);
      if (served === 0) toast('Nicht genug im Lager.');
      render(true);
      break;
    }
    case 'hire':
      act(hireRunner(state, id, spotById.get(id)?.name ?? id));
      break;
    case 'fire':
      fireRunner(state, id);
      render(true);
      break;
    case 'select':
      selectSpot(id);
      break;
  }
});

document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) =>
  btn.addEventListener('click', () => setSpeed(Number(btn.dataset.speed))),
);

function setSpeed(value: number): void {
  speed = value;
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
}

let speedBeforePause = 1;
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (speed === 0) setSpeed(speedBeforePause);
    else {
      speedBeforePause = speed;
      setSpeed(0);
    }
  }
  if (e.code === 'Escape') selectSpot(null);
});

$('spot-close').addEventListener('click', () => selectSpot(null));
$('btn-koeln').addEventListener('click', () => gameMap.flyToKoeln());
$('btn-europa').addEventListener('click', () => gameMap.flyToEuropa());
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Wirklich neu anfangen? Der aktuelle Spielstand geht verloren.')) return;
  clearSave();
  state = createGame(spots);
  selectSpot(null);
});

let last = performance.now();
let sinceRender = 0;
let sinceSave = 0;
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (speed > 0) tick(state, dt * GAME_MINUTES_PER_REAL_SECOND * speed, spots);
  sinceRender += dt;
  sinceSave += dt;
  if (sinceRender >= 0.1) {
    sinceRender = 0;
    render();
  }
  if (sinceSave >= 5) {
    sinceSave = 0;
    saveGame(state);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => saveGame(state));
render(true);
requestAnimationFrame(frame);
