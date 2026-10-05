// Oberfläche der eigenen Produktion (Auftrag 42). Keine neue App: ein Abschnitt „Anbau“ in der App Handel (Slot
// trade.grow) mit den Zielen, den Regionen und ihren Fincas, dazu zwei Seiten: Region (Kartell, Behörden, Fincas
// kaufen oder pachten, Ausfuhr) und Finca (Pflanzung, Leute, Gewächshaus, Genetik, Verpackung). Verschifft wird auf der
// Einkaufsseite von trade (Ausfuhrhafen als Produzent). Dazu die Glas-Karten der Regionen (map.ts), ein Rat, wenn ein
// Angebot wartet, und der Flug in die Europa-Ansicht, sobald eine Region frei wird.

import { useState } from 'preact/hooks';
import { type CommandResult, formatEuro, formatNumber, type GameState } from '../../../core';
import { registerMapLayer } from '../../../map';
import {
  ActionSheet,
  type Advice,
  type ChipSpec,
  Disclosure,
  Group,
  HudPill,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerHudItem,
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
  CARTEL_HIT_CHANCE,
  CARTEL_HIT_LOSS,
  cartelPaid,
  costPerGram,
  cropDays,
  europeProgress,
  expectedHarvest,
  type Finca,
  fincaGardener,
  fincaQuality,
  fincaSites,
  fincaWages,
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
          <ItemContent
            icon="globe"
            color={goals.europe ? 'money' : 'people'}
            title="Europa"
            meta={goals.europe ? undefined : 'Jeder Kunde und jede Stadt in Europa zur Hälfte mit eigener Ware.'}
            // Auftrag 43: wen du noch versorgen musst (bis sechs, dann „+N“).
            tags={
              goals.europe
                ? undefined
                : [
                    ...europe.missing.slice(0, 6).map((name) => ({ label: name, color: 'danger' as const })),
                    europe.missing.length > 6 && {
                      label: `+${europe.missing.length - 6} weitere`,
                      color: 'danger' as const,
                    },
                  ]
            }
          >
            {!goals.europe && europe.total > 0 && (
              <ProgressBar value={europe.supplied / europe.total} tone="info" label="Kunden aus eigener Produktion" />
            )}
          </ItemContent>
        </ListItem>
        {!goals.europe && europe.missing.length > 0 && (
          <ListItem>
            <ItemContent
              icon="help"
              color="system"
              title="So kommst du hin"
              meta="Städte, die noch nicht kaufen, melden sich bei gutem Ruf (pünktlich). Wer schon kauft, braucht Lieferungen aus deinem Ausfuhrlager: Handel › Hafen › Einkauf › „Eigene Ernte“."
            />
          </ListItem>
        )}
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
  const ui = useUi();
  const [confirm, setConfirm] = useState<Confirm>(null);
  // Gekauft oder gepachtet: gleich zur Finca, dort fehlen noch Arbeiter (Auftrag 43).
  const openFinca = (result: CommandResult) => {
    if (!result.ok) return;
    const fincaId = (result.data as { fincaId?: number } | undefined)?.fincaId;
    if (fincaId !== undefined) ui.openPanel('grow.finca', { fincaId });
  };
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
  const called = regionStatus(state, regionId) === 'called';
  return (
    <div class="trade-app">
      {called && (
        // Auftrag 43: Vom Angebot auf der Karte kommt man hierher, also auch hier annehmen (keine Sackgasse).
        <Group title="Angebot" icon="phone" color="money" note={`${region.contact.name} wartet auf deine Antwort.`}>
          <List>
            <ListItem action icon="check" onClick={() => dispatch({ type: 'grow.openRegion', payload: { regionId } })}>
              {`Angebot von ${region.contact.name} annehmen`}
            </ListItem>
          </List>
        </Group>
      )}
      <Group title={region.area} icon="leaf" color="goods" note={region.pitch}>
        <List>
          {getFincas(state, regionId).map((f) => (
            <FincaRow key={f.id} finca={f} />
          ))}
          <ExportRow regionId={regionId} />
        </List>
      </Group>
      {/* Auftrag 43: Land zuerst, das ist der erste Schritt. */}
      {open && (
        <Group
          title="Land kaufen oder pachten"
          icon="pin"
          color="place"
          note="Zum Start pachten: Kaufen rechnet sich erst nach gut einem Jahr. Beides kostet sauberes Geld."
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
                            message: `${site.description} Sauberes Geld: kaufen ${formatEuro(price)} (rechnet sich nach ${Math.round(price / lease)} Wochen) oder pachten ${formatEuro(lease)} die Woche. Danach brauchst du Arbeiter, sonst fällt die Ernte aus.`,
                            actions: [
                              ...(state.wallet.clean < lease
                                ? [
                                    {
                                      label: `Geld waschen (dir fehlen ${formatEuro(lease - state.wallet.clean)} sauber)`,
                                      icon: 'washing',
                                      onSelect: run(() => ui.openPhone('laundering.app')),
                                    },
                                  ]
                                : []),
                              {
                                label:
                                  state.wallet.clean < price
                                    ? `Kaufen (${formatEuro(price)}, dir fehlen ${formatEuro(price - state.wallet.clean)} sauber)`
                                    : `Kaufen (${formatEuro(price)})`,
                                icon: 'key',
                                disabled: state.wallet.clean < price,
                                onSelect: run(() =>
                                  openFinca(dispatch({ type: 'grow.buyFinca', payload: { siteId: site.id } })),
                                ),
                              },
                              {
                                label: `Pachten (${formatEuro(lease)} die Woche)`,
                                icon: 'calendar',
                                disabled: state.wallet.clean < lease,
                                onSelect: run(() =>
                                  openFinca(dispatch({ type: 'grow.leaseFinca', payload: { siteId: site.id } })),
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
      <Group
        title={region.cartel.name}
        icon="handshake"
        color="danger"
        value={paid ? `${pct(economy.cartelShare)} der Ernte` : 'kein Anteil'}
        note={
          paid
            ? 'Mit Anteil kühlen die Behörden schneller ab, und das Kartell lässt deine Felder in Ruhe.'
            : `Ohne Anteil schlägt das Kartell an etwa ${Math.round(CARTEL_HIT_CHANCE * 100)} von 100 Tagen zu und nimmt ${Math.round(CARTEL_HIT_LOSS * 100)} % einer Ernte oder Ware.`
        }
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
  // Auftrag 43: netto zeigen, was nach dem Anteil des Kartells bleibt.
  const cartelCut = cartelPaid(state, finca.regionId)
    ? Math.round((harvest * (REGION_ECONOMY[finca.regionId]?.cartelShare ?? 0)) / 100) * 100
    : 0;
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
        {crops.length > 1 && <p class="ui-hint">Als Nächstes pflanzen:</p>}
        {crops.length > 1 && (
          <SegmentedControl
            wide
            aria-label="Als Nächstes pflanzen"
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
          <ListItem value={kg(harvest - cartelCut)}>
            <ItemContent
              icon="package"
              color={harvest > 0 ? 'goods' : 'danger'}
              title="Nächste Ernte"
              meta={harvest > 0 ? undefined : 'Ohne Arbeiter fällt sie aus.'}
              tags={[
                { label: `Qualität ${pct(quality)}`, color: 'goods', icon: 'gem' },
                cartelCut > 0 && { label: `dazu ${kg(cartelCut)} fürs Kartell`, color: 'danger', icon: 'handshake' },
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
        value={`${formatEuro(fincaWages(state, finca))}/Tag bar`}
        note={
          workers < needed
            ? `Für ${finca.hectares} Hektar brauchst du ${needed} Arbeiter.`
            : finca.tenure === 'leased'
              ? `Dazu Pacht ${formatEuro(Math.round(leasePerWeek(finca) / 7))}/Tag sauber.`
              : undefined
        }
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
              Gärtner anheuern (ohne: 15 % weniger Ernte, schlechtere Qualität)
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
              value={`${formatEuro(greenhouse)} sauber`}
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
              value={`${formatEuro(genetics.cost)} schwarz`}
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
          <ListItem value={packing.perKg > 0 ? `${formatEuro(packing.perKg)}/kg schwarz` : 'gratis'}>
            <ItemContent
              icon="anchor"
              color="law"
              title="Zoll-Risiko"
              tags={[
                {
                  label:
                    packing.risk < 1
                      ? `${Math.round((1 - packing.risk) * 100)} % seltener kontrolliert`
                      : 'normal kontrolliert',
                  color: 'law',
                  icon: 'shield',
                },
              ]}
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

/**
 * „Nächster Schritt“ in der Produktion (Auftrag 43): Angebot annehmen, erste Finca, fehlende Arbeiter vor der Ernte,
 * Ware im Ausfuhrlager verschiffen, wache Behörden, Finca liegt brach. Mehrere Räte, jeder führt an die Stelle.
 */
registerAdvisor({
  id: 'grow.offer',
  advise(state) {
    const list: Advice[] = [];
    const waiting = REGIONS.find((r) => regionStatus(state, r.id) === 'called');
    if (waiting) {
      list.push({
        id: 'grow.offer',
        priority: 72,
        icon: 'leaf',
        title: `Angebot aus ${waiting.name}: eigene Fincas`,
        text: 'Eigene Ware kostet einen Bruchteil vom Einkauf.',
        actionLabel: 'Ansehen',
        action: (ui) => ui.openPhone('trade.app', { view: 'grow' }),
      });
    }
    const fincas = getFincas(state);
    const open = REGIONS.filter((r) => regionStatus(state, r.id) === 'open');
    const empty = open.find((r) => fincas.every((f) => f.regionId !== r.id));
    if (empty) {
      list.push({
        id: 'grow.firstFinca',
        priority: 70,
        icon: 'home',
        title: `Noch keine Finca in ${empty.name}`,
        text: 'Pachten ist zum Start günstiger als kaufen.',
        actionLabel: 'Land ansehen',
        action: (ui) => ui.openPanel('grow.region', { regionId: empty.id }),
      });
    }
    // Ohne Arbeiter keine Ernte: dringend, solange etwas wächst.
    const short = fincas.find((f) => f.crop && fincaWorkers(state, f) < workersNeeded(f));
    if (short) {
      const none = fincaWorkers(state, short) === 0;
      list.push({
        id: 'grow.workers',
        priority: none ? 88 : 64,
        icon: 'users',
        title: none ? `Auf ${short.name} arbeitet niemand` : `Auf ${short.name} fehlen Arbeiter`,
        text: none ? 'Ohne Arbeiter fällt die Ernte aus.' : 'Mit weniger Leuten wird die Ernte kleiner.',
        actionLabel: 'Anheuern',
        action: (ui) => ui.openPanel('grow.finca', { fincaId: short.id }),
      });
    }
    // Ware im Ausfuhrlager: verschiffen.
    for (const r of open) {
      const origin = regionOrigin(r.id);
      if (!origin) continue;
      const grams = Object.values(originStock(state, origin.id)).reduce((sum, lot) => sum + lot.amount, 0);
      if (grams <= 0) continue;
      list.push({
        id: `grow.ship.${origin.id}`,
        priority: 76,
        icon: 'ship',
        title: `${kg(grams)} eigene Ware in ${origin.from}`,
        text: 'Verschiffen, dann liegt sie in ein paar Wochen in deinem Hafen.',
        actionLabel: 'Verschiffen',
        action: (ui) => ui.openPanel('trade.order', { producerId: origin.id }),
      });
    }
    const hot = open.find((r) => regionAttention(state, r.id) >= 60);
    if (hot) {
      list.push({
        id: 'grow.attention',
        priority: 62,
        icon: 'siren',
        title: `${getRegion(hot.id)?.authority ?? 'Die Behörden'} in ${hot.name} werden wach`,
        text: 'Kartell-Anteil zahlen oder schmieren kühlt sie ab.',
        actionLabel: 'Region',
        action: (ui) => ui.openPanel('grow.region', { regionId: hot.id }),
      });
    }
    const idle = fincas.find((f) => !f.crop && !f.batch);
    if (idle) {
      list.push({
        id: 'grow.idle',
        priority: 50,
        icon: 'leaf',
        title: `${idle.name} liegt brach`,
        action: (ui) => ui.openPanel('grow.finca', { fincaId: idle.id }),
      });
    }
    return list;
  },
});

onGameEvent('grow.regionOpened', 'grow.flyToRegion', (_payload, ui) => {
  // Die Europa-Ansicht wächst bis zur Region (city: Rahmen mit den freien Regionen).
  ui.flyToDeutschland();
});
onGameEvent('grow.packed', 'grow.packedToast', (payload, ui) => {
  ui.toast(
    `${kg(payload.grams)} ${productName(payload.productId)} verpackt im Ausfuhrlager: bereit zum Verschiffen.`,
    'good',
    {
      urgent: true,
    },
  );
});
// Auftrag 43: Was in der Produktion schiefgeht, sagt ein Banner (vorher nur stille Chats).
onGameEvent('grow.harvested', 'grow.failedToast', (payload, ui, state) => {
  if (payload.grams > 0) return;
  ui.toast(`Ernte auf ${getFinca(state, payload.fincaId)?.name ?? 'einer Finca'} ausgefallen: keine Arbeiter.`, 'bad');
});
onGameEvent('grow.unpaid', 'grow.unpaidToast', (payload, ui, state) => {
  const name = getFinca(state, payload.fincaId)?.name ?? 'einer Finca';
  ui.toast(
    payload.kind === 'lease'
      ? `Pacht für ${name} nicht bezahlt: Es fehlt sauberes Geld. Nach ein paar Tagen ist das Land weg.`
      : `Keine Löhne auf ${name}: Heute arbeitet dort niemand.`,
    'bad',
  );
});
onGameEvent('grow.stalled', 'grow.stalledToast', (payload, ui, state) => {
  ui.toast(
    `${getFinca(state, payload.fincaId)?.name ?? 'Eine Finca'} liegt brach: kein Geld für Saat und Dünger.`,
    'warn',
  );
});
onGameEvent('grow.fincaLost', 'grow.lostToast', (payload, ui) => {
  ui.toast(`${payload.name} ist weg: Die Pacht wurde nicht bezahlt.`, 'bad');
});
onGameEvent('grow.cartelHit', 'grow.cartelToast', (payload, ui, state) => {
  const finca = payload.fincaId !== null ? getFinca(state, payload.fincaId) : undefined;
  ui.toast(
    `Das Kartell hat zugeschlagen${finca ? ` auf ${finca.name}` : ''}: ${Math.round(payload.share * 100)} % weg.`,
    'bad',
  );
});
onGameEvent('grow.raided', 'grow.raidedToast', (payload, ui, state) => {
  ui.toast(`Razzia auf ${getFinca(state, payload.fincaId)?.name ?? 'einer Finca'}.`, 'bad');
});
onGameEvent('grow.goalReached', 'grow.goalToast', (payload, ui) => {
  ui.toast(
    payload.goal === 'producer' ? 'Produzent: die Hälfte aus eigener Ernte.' : 'Europa: alle Kunden aus eigener Ernte.',
    'good',
    { urgent: true },
  );
});
soundOnEvent('grow.goalReached', 'cash');
registerMapLayer(regionsLayer);

/**
 * HUD „Anbau“ (Auftrag 43): Ware im Ausfuhrlager und Tage bis zur nächsten Ernte; rot, wenn Pacht oder Löhne offen sind
 * oder die Behörden einer Region aufmerksam werden (ab 45 von 100, wie im Region-Panel).
 */
function GrowHud() {
  const { state } = useGame();
  const ui = useUi();
  if (!isGrowStarted(state)) return null;
  const fincas = getFincas(state);
  if (fincas.length === 0) return null;
  const exported = REGIONS.reduce((sum, r) => {
    const origin = regionOrigin(r.id);
    return origin ? sum + Object.values(originStock(state, origin.id)).reduce((a, lot) => a + lot.amount, 0) : sum;
  }, 0);
  const next = fincas
    .map((f) => f.crop?.readyAt ?? null)
    .filter((at): at is number => at !== null)
    .sort((a, b) => a - b)[0];
  const days = next === undefined ? null : Math.max(0, Math.ceil((next - state.time) / 1440));
  const trouble =
    fincas.some((f) => f.unpaidLease > 0 || f.unpaidWages || f.stalled) ||
    REGIONS.some((r) => regionStatus(state, r.id) !== 'none' && regionAttention(state, r.id) >= 45);
  const harvest = days === null ? 'keine Ernte' : days === 0 ? 'Ernte heute' : `Ernte in ${days} T.`;
  return (
    <HudPill
      icon="leaf"
      color="goods"
      label="Anbau"
      value={exported > 0 ? kg(exported) : harvest}
      title={`${kg(exported)} im Ausfuhrlager, ${harvest}${trouble ? ', es gibt Ärger auf einer Finca' : ''}`}
      tone={trouble ? 'bad' : undefined}
      onClick={() => ui.openPhone('trade.app', { view: 'grow' })}
    />
  );
}

registerHudItem({ id: 'grow.hud', order: 21, placement: 'more', icon: 'leaf', component: GrowHud });
