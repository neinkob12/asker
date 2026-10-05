// Oberfläche der eigenen Produktion (Auftrag 42). Keine neue App: ein Abschnitt „Anbau“ in der Kunden-App (Slot
// trade.grow) mit den Zielen, den Regionen und ihren Fincas, dazu zwei Seiten: Region (Kartell, Behörden, Fincas
// kaufen oder pachten, Ausfuhr) und Finca (Pflanzung, Leute, Gewächshaus, Genetik, Verpackung). Verschifft wird auf der
// Einkaufsseite von trade (Ausfuhrhafen als Produzent). Dazu die Glas-Karten der Regionen (map.ts), ein Rat, wenn ein
// Angebot wartet, und der Flug in die Europa-Ansicht, sobald eine Region frei wird.

import { useState } from 'preact/hooks';
import { formatEuro, formatNumber, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  ActionSheet,
  type ChipSpec,
  Disclosure,
  Group,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerPanel,
  registerSlot,
  SegmentedControl,
  type SheetAction,
  Stepper,
  SummaryTiles,
  soundOnEvent,
  Toggle,
  useGame,
  useUi,
} from '../../../ui';
import { getRegion, REGIONS } from '../../city';
import { getProduct, productName } from '../../goods';
import { originStock, PRODUCERS, regionOrigin } from '../../trade';
import {
  bribeReadyAt,
  cartelPaid,
  costPerGram,
  cropDays,
  europeProgress,
  expectedHarvest,
  type Finca,
  fincaGardener,
  fincaQuality,
  fincaRunningCost,
  fincaSites,
  fincaWorkers,
  GENETICS,
  getFinca,
  getFincas,
  goalShares,
  greenhouseCost,
  growGoals,
  harvestToHarborDays,
  isGrowStarted,
  landPrice,
  leasePerWeek,
  nextGenetics,
  PACKINGS,
  PRODUCER_SHARE,
  REGION_ECONOMY,
  regionAttention,
  regionStatus,
  siteTaken,
  workersNeeded,
} from '../index';
import { regionsLayer } from './map';

declare module '../../../ui' {
  interface PanelRegistry {
    'grow.region': { regionId: string };
    'grow.finca': { fincaId: number };
  }
}

const DAY = 1440;
const kg = (grams: number) => `${formatNumber(Math.round(grams / 100) / 10, 1)} kg`;
const pct = (n: number) => `${Math.round(n * 100)} %`;
const perGram = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Billigster Einkaufspreis pro Gramm einer Ware bei den Produzenten (zum Vergleich). */
function purchasePerGram(productId: string): number | null {
  const shares = PRODUCERS.filter((p) => !p.byRoad)
    .map((p) => p.products[productId])
    .filter((x): x is number => x !== undefined);
  const base = getProduct(productId)?.basePrice ?? null;
  if (shares.length === 0 || base === null) return null;
  return Math.min(...shares) * base;
}

/** Wo eine Finca steht: Pflanzung, Ernte auf dem Weg, oder brach. */
function fincaPhase(state: GameState, finca: Finca): { label: string; color: ChipSpec['color']; icon: string } {
  if (finca.batch) {
    const label = { drying: 'trocknet', pressing: 'wird gepresst', packing: 'wird verpackt' }[finca.batch.stage];
    return { label, color: 'goods', icon: 'package' };
  }
  if (finca.crop) {
    const days = Math.max(0, Math.ceil((finca.crop.readyAt - state.time) / DAY));
    return { label: `Ernte in ${days} T.`, color: 'money', icon: 'leaf' };
  }
  return { label: 'brach', color: 'warn', icon: 'alert' };
}

function FincaRow({ finca }: { finca: Finca }) {
  const { state } = useGame();
  const ui = useUi();
  const phase = fincaPhase(state, finca);
  return (
    <ListItem onClick={() => ui.openPanel('grow.finca', { fincaId: finca.id })} value={`${finca.hectares} ha`}>
      <ItemContent
        icon="leaf"
        color="goods"
        title={finca.name}
        tags={[
          { label: phase.label, color: phase.color, icon: phase.icon },
          finca.crop && { label: productName(finca.crop.productId), color: 'goods' },
          finca.greenhouse && { label: 'Gewächshaus', color: 'place', icon: 'sun' },
        ]}
      />
    </ListItem>
  );
}

/** Ausfuhrlager einer Region als Zeile; Tipp: Verschiffen (Einkaufsseite von trade). */
function ExportRow({ regionId }: { regionId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const origin = regionOrigin(regionId);
  if (!origin) return null;
  const lots = Object.entries(originStock(state, origin.id));
  const total = lots.reduce((sum, [, lot]) => sum + lot.amount, 0);
  return (
    <ListItem
      onClick={total > 0 ? () => ui.openPanel('trade.order', { producerId: origin.id }) : undefined}
      value={kg(total)}
    >
      <ItemContent
        icon="ship"
        color="place"
        title={`Ausfuhr ${origin.from}`}
        meta={total > 0 ? undefined : 'Leer bis zur nächsten Ernte.'}
        tags={lots.map(([id, lot]) => ({ label: `${kg(lot.amount)} ${productName(id)}`, color: 'goods' }))}
      />
    </ListItem>
  );
}

function GoalsGroup() {
  const { state } = useGame();
  const goals = growGoals(state);
  const shares = goalShares(state);
  const europe = europeProgress(state);
  return (
    <Group
      title="Ziele"
      icon="trophy"
      color="brand"
      note={
        goals.europe
          ? 'Ganz Europa aus eigener Produktion. Es geht offen weiter.'
          : 'Eigene Ware in den letzten zwei Wochen.'
      }
      more="Produzent: In den letzten zwei Wochen stammt die Hälfte der gelieferten Gramm aus deinen Fincas. Europa: Jeder Kunde, den du in den letzten vier Wochen beliefert hast, und jede Stadt in Europa bekommt bei Gras, Haze, Kush und Hasch mindestens zur Hälfte eigene Ware (Edibles, Öl und Vapes aus dem Labor zählen nicht)."
    >
      <List>
        <ListItem value={goals.producer ? 'erreicht' : `${pct(shares.share)} von ${pct(PRODUCER_SHARE)}`}>
          <ItemContent icon="leaf" color={goals.producer ? 'money' : 'goods'} title="Produzent">
            {!goals.producer && <ProgressBar value={shares.share / PRODUCER_SHARE} label="Anteil eigener Ware" />}
          </ItemContent>
        </ListItem>
        <ListItem value={goals.europe ? 'erreicht' : `${europe.supplied} von ${europe.total}`}>
          <ItemContent icon="globe" color={goals.europe ? 'money' : 'people'} title="Europa">
            {!goals.europe && europe.total > 0 && (
              <ProgressBar value={europe.supplied / europe.total} tone="info" label="Kunden aus eigener Produktion" />
            )}
          </ItemContent>
        </ListItem>
      </List>
    </Group>
  );
}

function GrowView() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  if (!isGrowStarted(state)) return null;
  const fincas = getFincas(state);
  const cost = costPerGram(state, 4);
  const shares = goalShares(state);
  return (
    <>
      <SummaryTiles
        items={[
          { icon: 'leaf', color: 'goods', value: fincas.length, label: 'Fincas' },
          { icon: 'coinEuro', color: 'money', value: cost === null ? '–' : perGram(cost), label: '€ pro g' },
          { icon: 'gem', color: 'brand', value: pct(shares.share), label: 'Eigen' },
        ]}
      />
      <GoalsGroup />
      {REGIONS.map((region) => {
        const status = regionStatus(state, region.id);
        if (status === 'none') return null;
        if (status === 'called') {
          return (
            <Group
              key={region.id}
              title={region.name}
              icon="phone"
              color="goods"
              value={`Ernte bis Hafen ${harvestToHarborDays(region.id)} T.`}
              note={region.pitch}
            >
              <List>
                <ListItem
                  action
                  icon="check"
                  onClick={() => dispatch({ type: 'grow.openRegion', payload: { regionId: region.id } })}
                >
                  {`Angebot von ${region.contact.name} annehmen`}
                </ListItem>
              </List>
            </Group>
          );
        }
        const list = getFincas(state, region.id);
        return (
          <Group
            key={region.id}
            title={region.name}
            icon="leaf"
            color="goods"
            value={`Ernte bis Hafen ${harvestToHarborDays(region.id)} T.`}
            note={list.length === 0 ? 'Noch keine Finca. Kaufen oder pachten unter Region.' : undefined}
          >
            <List>
              {list.map((f) => (
                <FincaRow key={f.id} finca={f} />
              ))}
              <ExportRow regionId={region.id} />
              <ListItem onClick={() => ui.openPanel('grow.region', { regionId: region.id })}>
                <ItemContent
                  icon="handshake"
                  color="danger"
                  title="Region, Kartell, Behörden"
                  tags={[
                    {
                      label: cartelPaid(state, region.id)
                        ? `Kartell ${pct(REGION_ECONOMY[region.id]?.cartelShare ?? 0)}`
                        : 'Kartell ohne Anteil',
                      color: cartelPaid(state, region.id) ? 'goods' : 'danger',
                      icon: 'handshake',
                    },
                    {
                      label: `Behörden ${Math.round(regionAttention(state, region.id))}`,
                      color: regionAttention(state, region.id) >= 45 ? 'danger' : 'law',
                      icon: 'shield',
                    },
                  ]}
                />
              </ListItem>
            </List>
          </Group>
        );
      })}
      <Disclosure label="Wie lohnt sich das?">
        Eigene Ware kostet nur die Löhne, die Pacht und den Dünger: ein Bruchteil des Einkaufs. Kaufen statt pachten,
        Gewächshäuser und bessere Genetik drücken den Preis pro Gramm weiter. Von der Ernte bis in den Hafen dauert es
        aus Marokko gut zwei, aus Kolumbien gut drei Wochen. Jede Finca kommt mit der Pflanzung des Vorbesitzers, die
        erste Ernte ist nach drei Wochen reif.
      </Disclosure>
    </>
  );
}

registerSlot('trade.grow', { id: 'grow.view', order: 10, component: GrowView });

// ---------------------------------------------------------------------------------------------
// Region: Kartell, Behörden, Fincas kaufen oder pachten

type Confirm = { title: string; message: string; actions: SheetAction[] } | null;

function RegionPanel({ regionId }: { regionId: string }) {
  const { state, dispatch } = useGame();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const region = getRegion(regionId);
  const economy = REGION_ECONOMY[regionId];
  if (!region || !economy) return null;
  const open = regionStatus(state, regionId) === 'open';
  const attention = regionAttention(state, regionId);
  const paid = cartelPaid(state, regionId);
  const bribeWait = bribeReadyAt(state, regionId);
  const run = (fn: () => void) => () => {
    fn();
    setConfirm(null);
  };
  return (
    <div class="trade-app">
      <Group title={region.area} icon="leaf" color="goods" note={region.pitch}>
        <List>
          {getFincas(state, regionId).map((f) => (
            <FincaRow key={f.id} finca={f} />
          ))}
          <ExportRow regionId={regionId} />
        </List>
      </Group>
      <Group
        title={region.cartel.name}
        icon="handshake"
        color="danger"
        value={paid ? `${pct(economy.cartelShare)} der Ernte` : 'kein Anteil'}
        note={paid ? 'Das Kartell hält dir die Polizei vom Hals.' : 'Ohne Anteil brennen Felder und Ware verschwindet.'}
      >
        <Toggle
          icon="handshake"
          label="Anteil zahlen"
          hint={`${region.cartel.contact.name} nimmt ${pct(economy.cartelShare)} jeder Ernte.`}
          checked={paid}
          disabled={!open}
          onChange={(pay) => dispatch({ type: 'grow.setCartel', payload: { regionId, pay } })}
        />
      </Group>
      <Group
        title={region.authority}
        icon="shield"
        color="law"
        value={`${Math.round(attention)} von 100`}
        note="Viel Anbau macht sie wach, über 45 kommen Razzien."
      >
        <ProgressBar value={attention / 100} tone={attention >= 45 ? 'bad' : 'info'} label="Aufmerksamkeit" />
        <List>
          <ListItem
            action
            icon="handshake"
            value={formatEuro(economy.bribeCost)}
            disabled={!open || bribeWait !== null || state.wallet.dirty < economy.bribeCost}
            onClick={() =>
              setConfirm({
                title: `${region.authority} schmieren?`,
                message: `Senkt die Aufmerksamkeit um 30. Kostet ${formatEuro(economy.bribeCost)} Schwarzgeld, höchstens einmal pro Woche.`,
                actions: [
                  {
                    label: `Schmieren (${formatEuro(economy.bribeCost)})`,
                    icon: 'check',
                    onSelect: run(() => dispatch({ type: 'grow.bribe', payload: { regionId } })),
                  },
                ],
              })
            }
          >
            {bribeWait !== null ? 'Gerade geschmiert' : 'Schmieren'}
          </ListItem>
        </List>
      </Group>
      {open && (
        <Group
          title="Land kaufen oder pachten"
          icon="pin"
          color="place"
          note="Kaufen ist auf Dauer billiger, Pacht kostet jede Woche."
        >
          <List>
            {fincaSites(regionId).map((site) => {
              const taken = siteTaken(state, site.id);
              const price = landPrice(site);
              const lease = leasePerWeek(site);
              return (
                <ListItem
                  key={site.id}
                  value={`${site.hectares} ha`}
                  disabled={taken}
                  onClick={
                    taken
                      ? undefined
                      : () =>
                          setConfirm({
                            title: site.name,
                            message: `${site.description} Sauberes Geld: kaufen ${formatEuro(price)} oder pachten ${formatEuro(lease)} die Woche.`,
                            actions: [
                              {
                                label: `Kaufen (${formatEuro(price)})`,
                                icon: 'key',
                                disabled: state.wallet.clean < price,
                                onSelect: run(() => dispatch({ type: 'grow.buyFinca', payload: { siteId: site.id } })),
                              },
                              {
                                label: `Pachten (${formatEuro(lease)} die Woche)`,
                                icon: 'calendar',
                                disabled: state.wallet.clean < lease,
                                onSelect: run(() =>
                                  dispatch({ type: 'grow.leaseFinca', payload: { siteId: site.id } }),
                                ),
                              },
                            ],
                          })
                  }
                >
                  <ItemContent
                    icon="leaf"
                    color={taken ? 'system' : 'goods'}
                    title={site.name}
                    tags={
                      taken
                        ? [{ label: 'deine', color: 'money', icon: 'check' }]
                        : [
                            { label: formatEuro(price), color: 'money', icon: 'key' },
                            { label: `${formatEuro(lease)}/Woche`, color: 'money', icon: 'calendar' },
                          ]
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Group>
      )}
      <ActionSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        actions={confirm?.actions ?? []}
      />
    </div>
  );
}

registerPanel({
  id: 'grow.region',
  title: ({ regionId }) => getRegion(regionId)?.name ?? 'Region',
  component: RegionPanel,
});

// ---------------------------------------------------------------------------------------------
// Finca: Pflanzung, Leute, Ausbau, Verpackung

function FincaPanel({ fincaId }: { fincaId: number }) {
  const { state, dispatch } = useGame();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const finca = getFinca(state, fincaId);
  if (!finca) return null;
  const economy = REGION_ECONOMY[finca.regionId];
  const crops = economy?.crops ?? [];
  const phase = fincaPhase(state, finca);
  const workers = fincaWorkers(state, finca);
  const needed = workersNeeded(finca);
  const gardener = fincaGardener(state, finca);
  const harvest = expectedHarvest(state, finca);
  const quality = fincaQuality(state, finca);
  const genetics = nextGenetics(finca);
  const greenhouse = greenhouseCost(finca);
  const packing = PACKINGS.find((p) => p.id === finca.packing) ?? PACKINGS[0];
  const productId = finca.crop?.productId ?? finca.plan;
  const buy = productId ? purchasePerGram(productId) : null;
  const run = (fn: () => void) => () => {
    fn();
    setConfirm(null);
  };
  const progress = finca.crop
    ? (state.time - finca.crop.plantedAt) / Math.max(1, finca.crop.readyAt - finca.crop.plantedAt)
    : 0;
  return (
    <div class="trade-app">
      <Group
        title={finca.name}
        icon="leaf"
        color="goods"
        value={phase.label}
        note={`${finca.hectares} Hektar, ${finca.tenure === 'owned' ? 'gekauft' : 'gepachtet'}, Ernte alle ${cropDays(finca)} Tage.`}
      >
        {finca.crop && <ProgressBar value={progress} label="Bis zur Ernte" />}
        {crops.length > 1 && (
          <SegmentedControl
            wide
            aria-label="Was wächst"
            value={finca.plan ?? crops[0]}
            options={crops.map((id) => ({ value: id, label: productName(id) }))}
            onChange={(id) => dispatch({ type: 'grow.plant', payload: { fincaId, productId: id } })}
          />
        )}
        <List>
          {!finca.crop && (
            <ListItem
              action
              icon="leaf"
              disabled={!finca.plan}
              onClick={() => dispatch({ type: 'grow.plant', payload: { fincaId, productId: finca.plan } })}
            >
              {`${productName(finca.plan ?? crops[0] ?? 'weed')} pflanzen`}
            </ListItem>
          )}
          <ListItem value={kg(harvest)}>
            <ItemContent
              icon="package"
              color="goods"
              title="Nächste Ernte"
              tags={[
                { label: `Qualität ${pct(quality)}`, color: 'goods', icon: 'gem' },
                finca.crop &&
                  finca.crop.loss > 0 && { label: `${pct(finca.crop.loss)} verloren`, color: 'danger', icon: 'flame' },
              ]}
            />
          </ListItem>
          {finca.batch && (
            <ListItem value={kg(finca.batch.grams)}>
              <ItemContent
                icon="package"
                color="goods"
                title={`${productName(finca.batch.productId)} ${phase.label}`}
                meta={`fertig in ${Math.max(0, Math.ceil((finca.batch.until - state.time) / DAY))} Tagen`}
              />
            </ListItem>
          )}
        </List>
      </Group>
      <Group
        title="Leute"
        icon="users"
        color="people"
        value={`${formatEuro(fincaRunningCost(state, finca))}/Tag`}
        note={workers < needed ? `Für ${finca.hectares} Hektar brauchst du ${needed} Arbeiter.` : undefined}
      >
        <Stepper
          label="Arbeiter"
          value={workers}
          min={0}
          max={needed * 2}
          format={(v) => `${v} von ${needed} Arbeitern`}
          onChange={(v) =>
            v > workers
              ? dispatch({ type: 'grow.hire', payload: { fincaId, role: 'worker', count: v - workers } })
              : dispatch({ type: 'grow.dismiss', payload: { fincaId, role: 'worker', count: workers - v } })
          }
        />
        <List>
          {gardener ? (
            <ListItem value={`Level ${gardener.level}`}>
              <ItemContent icon="flask" color="people" title={gardener.name} meta="Gärtner" />
            </ListItem>
          ) : (
            <ListItem
              action
              icon="userPlus"
              onClick={() => dispatch({ type: 'grow.hire', payload: { fincaId, role: 'gardener' } })}
            >
              Gärtner anheuern
            </ListItem>
          )}
        </List>
      </Group>
      <Group title="Ausbau" icon="sun" color="place">
        <List>
          {!finca.greenhouse && (
            <ListItem
              action
              icon="sun"
              value={formatEuro(greenhouse)}
              disabled={state.wallet.clean < greenhouse}
              onClick={() =>
                setConfirm({
                  title: 'Gewächshaus bauen?',
                  message: `Ernte alle ${cropDays({ greenhouse: true })} statt ${cropDays({ greenhouse: false })} Tage, etwas bessere Qualität. Kostet ${formatEuro(greenhouse)} sauberes Geld.`,
                  actions: [
                    {
                      label: `Bauen (${formatEuro(greenhouse)})`,
                      icon: 'check',
                      onSelect: run(() => dispatch({ type: 'grow.buildGreenhouse', payload: { fincaId } })),
                    },
                  ],
                })
              }
            >
              Gewächshaus
            </ListItem>
          )}
          {genetics ? (
            <ListItem
              action
              icon="flask"
              value={formatEuro(genetics.cost)}
              disabled={state.wallet.dirty < genetics.cost}
              onClick={() =>
                setConfirm({
                  title: `Genetik Stufe ${genetics.level}?`,
                  message: `Qualität ${pct(GENETICS[genetics.level].quality)}, Ernte ×${formatNumber(GENETICS[genetics.level].yield, 1)}, ab der nächsten Aussaat. Kostet ${formatEuro(genetics.cost)} Schwarzgeld.`,
                  actions: [
                    {
                      label: `Kaufen (${formatEuro(genetics.cost)})`,
                      icon: 'check',
                      onSelect: run(() => dispatch({ type: 'grow.upgradeGenetics', payload: { fincaId } })),
                    },
                  ],
                })
              }
            >
              {`Bessere Genetik (Stufe ${genetics.level})`}
            </ListItem>
          ) : (
            <ListItem value="Stufe 3">
              <ItemContent icon="flask" color="goods" title="Genetik" meta="Die beste Linie, die es gibt." />
            </ListItem>
          )}
        </List>
      </Group>
      <Group title="Verpackung" icon="package" color="law" note={packing.description}>
        <SegmentedControl
          wide
          aria-label="Verpackung"
          value={finca.packing}
          options={PACKINGS.map((p) => ({ value: p.id, label: p.label }))}
          onChange={(v) => dispatch({ type: 'grow.setPacking', payload: { fincaId, packing: v as Finca['packing'] } })}
        />
        <List>
          <ListItem value={packing.perKg > 0 ? `${formatEuro(packing.perKg)}/kg` : 'gratis'}>
            <ItemContent
              icon="anchor"
              color="law"
              title="Zoll schaut hin"
              tags={[{ label: `× ${formatNumber(packing.risk, 1)}`, color: 'law', icon: 'shield' }]}
            />
          </ListItem>
        </List>
      </Group>
      {buy !== null && (
        <Disclosure label="Was kostet ein Gramm?">
          {`Bei den Produzenten zahlst du für ${productName(productId ?? 'weed')} mindestens ${perGram(buy)} pro Gramm. Eigene Ware kostet nur Löhne, Pacht, Dünger und Verpackung; die Kasse zeigt sie unter „Fincas“ und „Anbau“.`}
        </Disclosure>
      )}
      <ActionSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        actions={confirm?.actions ?? []}
      />
    </div>
  );
}

registerPanel({
  id: 'grow.finca',
  title: () => 'Finca',
  component: FincaPanel,
});

// ---------------------------------------------------------------------------------------------
// Rat, Ereignisse, Karte

registerAdvisor({
  id: 'grow.offer',
  advise(state) {
    const waiting = REGIONS.find((r) => regionStatus(state, r.id) === 'called');
    if (waiting) {
      return {
        id: 'grow.offer',
        priority: 55,
        icon: 'leaf',
        title: `Angebot aus ${waiting.name}: eigene Fincas`,
        action: (ui) => ui.openPhone('trade.app'),
      };
    }
    const idle = getFincas(state).find((f) => !f.crop && !f.batch);
    if (idle) {
      return {
        id: 'grow.idle',
        priority: 50,
        icon: 'leaf',
        title: `${idle.name} liegt brach`,
        action: (ui) => ui.openPanel('grow.finca', { fincaId: idle.id }),
      };
    }
    return null;
  },
});

onGameEvent('grow.regionOpened', 'grow.flyToRegion', (_payload, ui) => {
  // Die Europa-Ansicht wächst bis zur Region (city: Rahmen mit den freien Regionen).
  ui.flyToDeutschland();
});
onGameEvent('grow.packed', 'grow.packedToast', (payload, ui) => {
  ui.toast(`${kg(payload.grams)} ${productName(payload.productId)} bereit zur Verschiffung.`, 'good');
});
onGameEvent('grow.raided', 'grow.raidedToast', (payload, ui, state) => {
  ui.toast(`Razzia auf ${getFinca(state, payload.fincaId)?.name ?? 'einer Finca'}.`, 'bad');
});
onGameEvent('grow.goalReached', 'grow.goalToast', (payload, ui) => {
  ui.toast(
    payload.goal === 'producer' ? 'Produzent: die Hälfte aus eigener Ernte.' : 'Europa: alle Kunden aus eigener Ernte.',
    'good',
  );
});
soundOnEvent('grow.goalReached', 'cash');
registerMapLayer(regionsLayer);
