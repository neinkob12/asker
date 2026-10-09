// Touren des Tutorials (Auftrag 46c), reine Daten: eine Tour pro Stufe (stageTour) und die Touren der Momente
// (erste Lieferung, erster Fahrer, Handy-Bestellung, erster Gang-Angriff, Beschlagnahme = Tour der Stufe 9).
// Sprecher ist immer Peter, jeder Schritt ein, zwei Sätze (höchstens TOUR_TEXT_MAX Zeichen), Kölsch-Ton wie in seinen
// Quests. Schritte, die etwas öffnen (Handy, App, Seite, Kamera), tun das selbst im `before`. Anker nur aus
// TOUR_ANCHORS. Touren, in denen der Spieler selbst etwas tun muss, laufen mit laufender Uhr (pause: false) und sind
// überspringbar, falls die Voraussetzung fehlt (kein Bewerber, niemand für den Posten).

import type { GameState } from '../../../core';
import { isMobileLayout, type TourDef, type TourStep, type UiApi } from '../../../ui';
import { getLieutenants, getRightHand } from '../../hierarchy';
import { getSpot } from '../../spots';
import { getStaff, securityAt } from '../../staff';
import { LAST_STAGE, PETER, SCRIPTED_FIRST_ATTACK, TUTORIAL_STAGE2_SPOTS } from '../config';

/** Höchstlänge eines Tour-Texts (Auftrag 46c: ein, zwei Sätze). */
export const TOUR_TEXT_MAX = 140;

/** Was die Touren brauchen: die Oberfläche und den Zustand beim Start (für Orte auf der Karte). */
export interface TourContext {
  ui: UiApi;
  state: GameState;
}

const CITY = 'koeln';
const SPOT = SCRIPTED_FIRST_ATTACK.spotId;

/** Peter spricht. */
function step(s: Omit<TourStep, 'speaker'>): TourStep {
  return { speaker: PETER, ...s };
}

/** Handy aufnehmen und zum Startbildschirm. */
function home(ui: UiApi): void {
  ui.showPhone();
  ui.openPhone(null);
}

/** Am Handy-Bildschirm deckt das Handy die Karte zu: für Anker auf der Karte und im HUD weglegen. */
function onMap(ui: UiApi): void {
  if (isMobileLayout()) ui.closePhone();
}

function flyToSpot(ctx: TourContext, spotId: string, zoom: number): void {
  const spot = getSpot(ctx.state, spotId);
  if (spot) ctx.ui.flyTo({ lng: spot.lng, lat: spot.lat }, zoom);
}

/** Kamera auf die Mitte zwischen den Spots der Stufe 2. */
function flyToStage2(ctx: TourContext): void {
  const spots = TUTORIAL_STAGE2_SPOTS.map((id) => getSpot(ctx.state, id)).filter((s) => !!s);
  if (spots.length === 0) return;
  const lng = spots.reduce((sum, s) => sum + s.lng, 0) / spots.length;
  const lat = spots.reduce((sum, s) => sum + s.lat, 0) / spots.length;
  ctx.ui.flyTo({ lng, lat }, 14.6);
}

/** Erklär-Stufen (0, 3, 4, 10): Ihre Tour schickt am Ende 'tutorial.advance'. */
export const EXPLAIN_STAGES: readonly number[] = [0, 3, 4, 10];

/**
 * Stufen, deren Tour ein Moment startet statt das Erreichen der Stufe (9: die Beschlagnahme). Kam der Moment nicht,
 * kommt die Tour spätestens mit der nächsten Stufe.
 */
export const MOMENT_STAGES: readonly number[] = [9];

function stage0(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'money',
      anchor: 'hud.money.dirty',
      tint: 'dirty',
      text: 'Dat is dein Schwarzgeld. Damit zahlst du Ware, Leute und alles, wat nicht aufs Konto darf.',
    }),
    step({
      id: 'heat',
      anchor: 'hud.heat',
      tint: 'danger',
      text: 'Die Heat: wie genau die Bullen hinschauen. Steigt durch Verkauf, Gewalt und Auffallen.',
    }),
    step({
      id: 'clock',
      anchor: 'hud.clock',
      text: 'Die Uhr. Kunden kommen je nach Tageszeit, nachts läuft et anders als mittags.',
    }),
    step({
      id: 'weather',
      anchor: 'hud.weather',
      text: 'Dat Wetter. Bei Regen bleiben die Leute zu Hause, bei Sonne ist die Straße voll.',
    }),
    step({
      id: 'speed',
      anchor: 'hud.speed',
      text: 'Hier stellst du dat Tempo ein. Pause, wenn du nachdenken willst.',
    }),
    step({
      id: 'phone',
      anchor: 'phone.home',
      before: () => home(ui),
      text: 'Dein Handy. Alles läuft hier drüber: Nachrichten, Leute, Geld.',
    }),
    step({
      id: 'messages',
      anchor: 'phone.app.core.messages',
      tint: 'chat',
      text: 'Nachrichten. Hier melden sich Lieferanten, Kunden und Gangs. Und ich.',
    }),
    step({
      id: 'staff',
      anchor: 'phone.screen',
      tint: 'people',
      before: () => ui.openPhone('tab:staff'),
      text: 'Personal. Am Anfang nur Läufer. Wer sich bewirbt, steht hier, oder du fragst selbst rum.',
    }),
    step({
      id: 'settings',
      anchor: 'phone.app.core.settings',
      before: () => ui.openPhone(null),
      text: 'Einstellungen: Ton, Karte, Verlauf. Und unter Einstieg, falls du mich loswerden willst.',
    }),
    step({
      id: 'mission',
      anchor: 'hud.mission',
      before: () => onMap(ui),
      text: 'Hier unten steht immer, wat als Nächstes dran ist. Los geht et am Neumarkt.',
    }),
  ];
}

function stage1(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'customer',
      anchor: 'spot.customer',
      anchorKey: SPOT,
      tint: 'place',
      before: () => {
        onMap(ui);
        ui.closePanel();
        flyToSpot(ctx, SPOT, 16);
      },
      text: 'Der Neumarkt, dein Spot. Steht ein Kunde da, erscheint hier die 1. Läuft seine Zeit ab, wird et rot.',
    }),
    step({
      id: 'panel',
      anchor: 'spot.panel',
      before: () => ui.openPanel('spots.spot', { spotId: SPOT }),
      text: 'Dat Spot-Fenster: Kunden, Preise, Leute. Alles für diese Ecke.',
    }),
    step({
      id: 'sell',
      anchor: 'spot.sell',
      tint: 'brand',
      waitFor: { event: 'sale.completed' },
      text: 'Verkauf einmal selbst: Tipp auf Verkaufen, sobald einer da ist.',
    }),
    step({
      id: 'price',
      anchor: 'spot.price',
      tint: 'money',
      text: 'Der Preis. Höher bringt mehr pro Tütchen, zu hoch und die Leute gehen weiter.',
    }),
    step({
      id: 'runner',
      anchor: 'spot.runner',
      tint: 'people',
      text: 'Läufer stehen für dich am Spot und verkaufen von allein. Dat kommt gleich.',
    }),
  ];
}

function stage2(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'zuelpicher',
      anchor: 'spot.marker',
      anchorKey: 'zuelpicher',
      tint: 'place',
      before: () => {
        onMap(ui);
        ui.closePanel();
        flyToStage2(ctx);
      },
      text: 'Zülpicher Platz, zu haben für 350 €. Graue Spots kannst du kaufen: antippen, Freischalten.',
    }),
    step({
      id: 'rudolfplatz',
      anchor: 'spot.marker',
      anchorKey: 'rudolfplatz',
      tint: 'place',
      text: 'Und der Rudolfplatz, auch 350 €. Hol dir beide, dann hast du drei Ecken in der Stadt.',
    }),
  ];
}

function stage3(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  const veedelId = getSpot(ctx.state, SPOT)?.veedelId ?? 'altstadt-sued';
  return [
    step({
      id: 'app',
      anchor: 'phone.app.tab:territory',
      before: () => home(ui),
      text: 'Neue App: Reviere. Köln hat zwölf Veedel, jedes mit Nachfrage, Kaufkraft und Polizei.',
    }),
    step({
      id: 'list',
      anchor: 'phone.screen',
      before: () => ui.openPhone('tab:territory'),
      text: 'Hier steht, wer wo dat Sagen hat. Verkaufst du in einem Veedel, wächst dein Einfluss dort.',
    }),
    step({
      id: 'own',
      anchor: 'phone.screen',
      tint: 'place',
      before: () => ui.openPanel('veedel.veedel', { veedelId }),
      text: 'Dein Veedel. Mehr Einfluss als alle anderen, und et gehört dir. Lässt du nach, holen sie et sich zurück.',
    }),
  ];
}

function stage4(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'app',
      anchor: 'phone.app.tab:gangs',
      tint: 'danger',
      before: () => home(ui),
      text: 'Neue App: Gangs. Vier Familien teilen sich Köln, und keine will dich dabei haben.',
    }),
    step({
      id: 'power',
      anchor: 'phone.screen',
      tint: 'danger',
      before: () => ui.openPhone('tab:gangs'),
      text: 'Stärke: Leute, Geld, Ware. Wer stärker ist, bestimmt. Noch drohen sie nur per SMS.',
    }),
    step({
      id: 'grow',
      anchor: 'phone.screen',
      text: 'Deine Stärke wächst mit Leuten, Veedeln, Geld und Ware. Schlagen kannst du sie an ihren Spots.',
    }),
  ];
}

/**
 * Stufe 5 zum Mitmachen (Feedback 08.10.2026: In der Erklärung ließ sich kein Lieferant antippen und „Tipp auf Kaufen“
 * ging ins Leere, weil Weiter-Schritte alles sperren): Der Spieler tippt selbst einen Lieferanten an und bestellt
 * einmal; die Uhr läuft, überspringen geht.
 */
function stage5(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'app',
      anchor: 'phone.app.suppliers.app',
      tint: 'goods',
      before: () => home(ui),
      text: 'Neue App: Lieferanten. Kalle aus Köln und Toni aus Frankfurt liefern dir Ware.',
    }),
    step({
      id: 'list',
      anchor: 'phone.screen',
      before: () => ui.openPhone('suppliers.app'),
      waitFor: {
        ui: (state) => state.phone.open && state.phone.app === 'suppliers.app' && !!state.phone.params?.supplierId,
      },
      text: 'Hier stehen alle, die an dich liefern. Tipp einen an, dann siehst du sein Angebot. Mit mehr Umsatz kommen weitere.',
    }),
    step({
      id: 'offer',
      anchor: 'suppliers.offer',
      tint: 'goods',
      // Kein before: Der Lieferant, den der Spieler eben angetippt hat, bleibt offen.
      waitFor: { event: 'shipment.ordered' },
      text: 'Dat Angebot nach Warenart. Bestell jetzt einmal selbst: Tipp bei einem Paket auf Kaufen, die Ware fährt zu deinem Lager.',
    }),
    step({
      id: 'tip',
      anchor: 'phone.screen',
      text: 'Läuft. Merk dir: Mehr Produkte bringen mehr Kunden. Und Ware auf Lager lohnt sich immer.',
    }),
  ];
}

function stage6(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'mission',
      anchor: 'hud.mission',
      before: () => onMap(ui),
      text: 'Die Mission hat jetzt Teilziele: Geld, Spots, Läufer. Die Karte zeigt, wat noch fehlt.',
    }),
    step({
      id: 'map',
      anchor: 'map',
      tint: 'place',
      before: () => flyToSpot(ctx, SPOT, 14),
      text: 'Alle Spots in deinem Veedel und den Nachbarveedeln sind frei. Läufer verkaufen dort, während du weg bist.',
    }),
  ];
}

function stage7(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'app',
      anchor: 'phone.screen',
      tint: 'people',
      before: () => ui.openPhone('tab:staff'),
      text: 'Neu im Personal: Leutnants. Ein Leutnant führt bis zu drei Spots mit eigenen Leuten.',
    }),
    step({
      id: 'appoint',
      anchor: 'staff.lieutenants',
      tint: 'people',
      waitFor: { state: (s) => getLieutenants(s).length > 0 },
      text: 'Ernenn jetzt einen: Leutnant ernennen, Person und Spots wählen. Er will dafür mehr Lohn.',
    }),
  ];
}

function stage8(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'app',
      anchor: 'phone.app.laundering.app',
      tint: 'money',
      before: () => home(ui),
      text: 'Neue App: Geldwäsche. Schwarzgeld wird sauber, und sauber brauchst du für alles Legale.',
    }),
    step({
      id: 'kiosk',
      anchor: 'laundering.kiosk',
      tint: 'dirty',
      before: () => ui.openPhone('laundering.app'),
      text: 'Der Kiosk von deinem Kumpel: schnell, kleine Beträge, Gebühr. Fang damit an.',
    }),
    step({
      id: 'clean',
      anchor: 'hud.money.clean',
      tint: 'money',
      before: () => onMap(ui),
      text: 'Sauberes Geld steht jetzt im HUD. Damit zahlst du Liegeplatz, Lager und Fahrer.',
    }),
    step({
      id: 'port',
      anchor: 'port.berth',
      tint: 'goods',
      before: () => ui.openPanel('logistics.port', {}),
      text: 'Der Niehler Hafen. Mit Liegeplatz liefert Jansen aus Rotterdam per Schiff, viel billiger als die Städte.',
    }),
    step({
      id: 'driver',
      anchor: 'staff.hire',
      tint: 'people',
      before: () => ui.openPhone('tab:staff'),
      text: 'Mit dem Hafen gibt et Fahrer. Die holen Schiffsware am Kai ab und bringen sie ins Lager.',
    }),
  ];
}

/**
 * Stufe 9: nach der Beschlagnahme (startet mit dem Moment 'seizure', nicht mit der Stufe). Kam keine, holt die
 * Oberfläche die Tour mit dem Wechsel auf Stufe 10 nach, dann ohne den Satz zum Zoll.
 */
function stage9(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  const police = 'Ab jetzt ist die Polizei scharf: Kontrollen, Razzien. Heat unter 40!';
  const seized = ctx.state.modules.tutorial?.scripted.seizure === true;
  return [
    step({
      id: 'police',
      anchor: 'hud.heat',
      tint: 'danger',
      before: () => onMap(ui),
      text: seized ? `Der Zoll hat deinen Container kassiert. ${police}` : police,
    }),
    step({
      id: 'specialists',
      anchor: 'phone.screen',
      tint: 'law',
      before: () => ui.openPhone('tab:staff'),
      text: 'Neu im Personal: Spezialisten. Ein Polizei-Kontakt senkt Zoll, Heat und Kontrollen, ein Anwalt holt Leute raus.',
    }),
    step({
      id: 'mode',
      anchor: 'suppliers.orderMode',
      tint: 'goods',
      before: () => ui.openPhone('suppliers.app', { supplierId: 'rotterdam' }),
      text: 'Einzeln oder Sammelbestellung: Sammeln ist billiger, fliegt et auf, ist alles weg. Dann: Papiere fälschen.',
    }),
  ];
}

function stage10(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'accountant',
      anchor: 'phone.screen',
      tint: 'people',
      before: () => ui.openPhone('tab:staff'),
      waitFor: { state: (s) => getStaff(s, { role: 'accountant', cityId: CITY }).length > 0 },
      text: 'Neu: der Buchhalter. Einer bringt mehr Gewinn und billigere Leute. Stell einen ein.',
    }),
    step({
      id: 'app',
      anchor: 'phone.app.finance.app',
      tint: 'money',
      before: () => ui.openPhone(null),
      text: 'Mit ihm geht die Kasse auf.',
    }),
    step({
      id: 'finance',
      anchor: 'phone.screen',
      tint: 'money',
      before: () => ui.openPhone('finance.app'),
      text: 'Gewinn und Verlust pro Tag, Spot und Leutnant. Hier siehst du, wo dat Geld bleibt.',
    }),
  ];
}

function stage11(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'staff',
      anchor: 'phone.screen',
      tint: 'people',
      before: () => ui.openPhone('tab:staff'),
      text: 'Sieben Veedel, Boss von Kölle. Jetzt brauchst du eine Rechte Hand: fährt Aufträge aus, übernimmt Aufgaben.',
    }),
    step({
      id: 'appoint',
      anchor: 'phone.screen',
      tint: 'brand',
      before: () => ui.openPanel('hierarchy.rightHand', {}),
      waitFor: { state: (s) => getRightHand(s, CITY) !== null },
      text: 'Nimm eine aus deinen Leutnants und ernenn sie. Mit Vollmacht regelt sie den Laden, wenn du weg bist.',
    }),
  ];
}

function stage12(ctx: TourContext): TourStep[] {
  const { ui } = ctx;
  return [
    step({
      id: 'germany',
      anchor: 'map',
      tint: 'brand',
      before: () => {
        onMap(ui);
        ui.flyToDeutschland();
      },
      text: 'Köln gehört dir. Mach die Stadt komplett, dann wartet Hamburg: da oben, am Ende der A1.',
    }),
  ];
}

const STAGE_TOURS: readonly ((ctx: TourContext) => TourStep[])[] = [
  stage0,
  stage1,
  stage2,
  stage3,
  stage4,
  stage5,
  stage6,
  stage7,
  stage8,
  stage9,
  stage10,
  stage11,
  stage12,
];

/** Die Tour einer Stufe (0 bis LAST_STAGE). */
export function stageTour(stage: number, ctx: TourContext): TourDef {
  const build = STAGE_TOURS[stage];
  if (!build) throw new Error(`Keine Tour für Stufe ${stage}.`);
  const steps = build(ctx);
  const manual = steps.some((s) => s.waitFor !== undefined && s.waitFor !== 'next');
  return {
    id: `tutorial:${stage}`,
    steps,
    // Muss der Spieler selbst etwas tun, läuft die Uhr (Kunden kommen, Bewerber melden sich), und die Tour ist
    // überspringbar, falls die Voraussetzung fehlt.
    pause: !manual,
    skippable: manual,
  };
}

/** Nach der ersten Lieferung (Moment 'delivery'): das Lager im HUD und die Lieferungen in der App. */
export function deliveryTour(ctx: TourContext): TourDef {
  const { ui } = ctx;
  return {
    id: 'tutorial:delivery',
    steps: [
      step({
        id: 'stock',
        anchor: 'hud.stock',
        tint: 'goods',
        before: () => onMap(ui),
        text: 'Deine erste Lieferung ist da. Neu im HUD: dat Lager. Tipp drauf, dann siehst du, wat drin ist.',
      }),
      step({
        id: 'shipments',
        anchor: 'phone.screen',
        tint: 'goods',
        before: () => ui.openPhone('suppliers.app'),
        text: 'Wat noch unterwegs ist, steht hier oben in der App. Bestell nach, bevor dat Lager leer ist.',
      }),
    ],
  };
}

/** Nach dem ersten Fahrer (Moment 'driver'): Abholen am Kai und Routen nach Fahrplan. */
export function driverTour(ctx: TourContext): TourDef {
  const { ui } = ctx;
  return {
    id: 'tutorial:driver',
    steps: [
      step({
        id: 'port',
        anchor: 'phone.screen',
        tint: 'goods',
        before: () => ui.openPanel('logistics.port', {}),
        text: 'Dein erster Fahrer. Liegt Ware am Kai, holt er sie: Hafen-Seite, Abholen lassen.',
      }),
      step({
        id: 'routes',
        anchor: 'routes.new',
        tint: 'goods',
        before: () => ui.openPanel('logistics.routes', {}),
        text: 'Mit zwei Lagern fahren Fahrer Routen nach Fahrplan: Neue Route, Fahrer draufsetzen, läuft von allein.',
      }),
    ],
  };
}

/** Handy-Bestellung (Moment 'phoneOrder'): die Nachricht des Kunden. */
export function phoneOrderTour(ctx: TourContext, contactId: string | undefined): TourDef {
  const { ui } = ctx;
  return {
    id: 'tutorial:phoneOrder',
    steps: [
      step({
        id: 'order',
        anchor: 'chat.reply',
        tint: 'chat',
        before: () => ui.openPhone('core.messages', contactId ? { contactId } : undefined),
        text: 'Ein Kunde bestellt übers Handy. Du fährst selbst hin und kassierst vor Ort. Läufer tun dat nicht.',
      }),
    ],
  };
}

/** Erster Gang-Angriff (Moment 'firstAttack'): Hotspot-Regel, Sicherheit einstellen und auf den Neumarkt setzen. */
export function firstAttackTour(ctx: TourContext, gangName: string): TourDef {
  const { ui } = ctx;
  return {
    id: 'tutorial:firstAttack',
    pause: false,
    skippable: true,
    steps: [
      step({
        id: 'raid',
        anchor: 'spot.marker',
        anchorKey: SPOT,
        tint: 'danger',
        before: () => {
          onMap(ui);
          ui.closePanel();
          flyToSpot(ctx, SPOT, 16);
        },
        text: `Dat war ${gangName}: Ware und Bargeld weg. An Hotspots wie dem Neumarkt passiert mehr, da lohnt Sicherheit.`,
      }),
      step({
        id: 'hire',
        anchor: 'phone.screen',
        tint: 'people',
        before: () => ui.openPhone('tab:staff'),
        waitFor: { state: (s) => getStaff(s, { role: 'security', cityId: CITY }).length > 0 },
        text: 'Neu im Personal: Sicherheit. Nimm einen Bewerber oder frag rum, und stell einen ein.',
      }),
      step({
        id: 'assign',
        anchor: 'spot.runner',
        tint: 'danger',
        before: () => ui.openPanel('spots.spot', { spotId: SPOT }),
        waitFor: { state: (s) => securityAt(s, { spotId: SPOT }).length > 0 },
        text: 'Setz ihn auf den Neumarkt. Dann überlegen die et sich zweimal.',
      }),
    ],
  };
}

/** Alle Touren, die es gibt (für die Prüfung: Anker, Textlänge, Stufen 0 bis 12). */
export function allTours(ctx: TourContext): TourDef[] {
  return [
    ...Array.from({ length: LAST_STAGE + 1 }, (_, stage) => stageTour(stage, ctx)),
    deliveryTour(ctx),
    driverTour(ctx),
    phoneOrderTour(ctx, 'customer:area-altstadt-sued'),
    firstAttackTour(ctx, 'die Hafenkolonne'),
  ];
}
