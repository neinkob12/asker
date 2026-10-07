// Oberfläche der Geldwäsche (Auftrag 27): große App "Geldwäsche" im Handy. Oben Schwarzgeld und sauberes Geld
// nebeneinander, darunter die laufenden Wäschen mit Fortschritt und die drei Wege (Kumpel mit Kiosk, Waschsalon,
// Bauunternehmer), jeder mit Gebühr, Dauer, Obergrenze und Risiko als Chips, Betrag mit Stepper und Vorgaben oder
// Freischalten mit sauberem oder Schwarzgeld. Schwarzgeld und sauberes Geld im HUD öffnen diese App.

import { useState } from 'preact/hooks';
import { clock, formatEuro, formatNumber, formatPercent, type GameState, wallet } from '../../../core';
import {
  Chips,
  Disclosure,
  Group,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  ProgressBar,
  registerAdvisor,
  registerPhoneApp,
  registerSearch,
  SegmentedControl,
  Stepper,
  SummaryTiles,
  useGame,
} from '../../../ui';
import { cityName, isBusinessSold, presentCity } from '../../city';
import { tutorialAllows } from '../../tutorial';
import { veedelName } from '../../veedel';
import {
  amountInProgress,
  batchProgress,
  canUnlockChannel,
  channelCapacity,
  channelDuration,
  channelFee,
  channelFree,
  channelHeatAbove,
  getBatches,
  getChannel,
  isChannelUnlocked,
  LAUNDERING_CHANNELS,
  type LaunderingChannel,
  launderingCapacity,
  launderingCityFactor,
} from '../index';
import './laundering.css';

const STEP = 100;

/** Vorgaben je Weg: ein Viertel, die Hälfte, alles, was frei ist (gerundet auf Hunderter). */
function presets(free: number, min: number): number[] {
  const round = (v: number) => Math.floor(v / STEP) * STEP;
  return [...new Set([round(free / 4), round(free / 2), round(free)])].filter((v) => v >= min && v > 0);
}

/** "fertig 14:30" heute, "fertig morgen 14:30" am nächsten Tag, sonst mit Spieltag (Wäschen laufen bis zu 28 Stunden). */
function readyLabel(now: number, readyAt: number): string {
  const ahead = clock.day(readyAt) - clock.day(now);
  const when = ahead <= 0 ? '' : ahead === 1 ? 'morgen ' : `Tag ${clock.day(readyAt)}, `;
  return `fertig ${when}${clock.formatTime(readyAt)}`;
}

/** Risiko eines Wegs in einem Chip: kein Risiko, oder Heat ab so viel gleichzeitig. */
function riskChip(state: GameState, c: LaunderingChannel) {
  if (c.heatPer1000 === 0) return { label: 'fast kein Risiko', icon: 'shieldCheck', color: 'money' as const };
  const level = c.heatPer1000 >= 2 ? 'Heat' : 'etwas Heat';
  const above = channelHeatAbove(state, c.id);
  return { label: `${level} ab ${formatEuro(above)} auf einmal`, icon: 'flame', color: 'danger' as const };
}

/** Ein freigeschalteter Weg: Kennzahlen als Chips, Betrag, Vorgaben, Waschen. */
function OpenChannel(props: { channel: LaunderingChannel }) {
  const { state, dispatch } = useGame();
  const c = props.channel;
  const dirty = Math.floor(wallet.balance(state, 'dirty'));
  const free = channelFree(state, c.id);
  const capacity = channelCapacity(state, c.id);
  const max = Math.min(dirty, free);
  const [amount, setAmount] = useState(() => Math.min(max, Math.max(c.minAmount, 500)));
  const value = Math.min(amount, max);
  const fee = channelFee(state, c.id);
  const ok = value >= c.minAmount;
  const running = amountInProgress(state, c.id);
  const wash = () => dispatch({ type: 'laundering.launder', payload: { amount: value, channel: c.id } });
  const options = presets(max, c.minAmount);
  return (
    <Group
      // Auftrag 46c: Anker der Tour (Stufe 8 zeigt den Kiosk).
      data-tour={c.id === 'kiosk' ? 'laundering.kiosk' : undefined}
      title={c.name}
      icon={c.icon}
      color="dirty"
      value={`Gebühr ${formatPercent(fee)}`}
      note={c.how}
      more={
        c.veedelId
          ? `${c.who} Das Geschäft steht in ${veedelName(c.veedelId)}: Läuft dort zu viel auf einmal, steigt der Heat im Veedel. Kleinster Betrag ${formatEuro(c.minAmount)}, gleichzeitig höchstens ${formatEuro(capacity)}.`
          : `${c.who} Kleinster Betrag ${formatEuro(c.minAmount)}, gleichzeitig höchstens ${formatEuro(capacity)}.`
      }
    >
      <Chips
        class="laundering-facts"
        items={[
          {
            label: `Dauer ${clock.formatDuration(channelDuration(c.id, Math.max(value, c.minAmount)))}`,
            icon: 'clock',
          },
          {
            label: running > 0 ? `${formatEuro(free)} von ${formatEuro(capacity)} frei` : `bis ${formatEuro(capacity)}`,
            icon: 'gauge',
            color: free <= 0 ? 'warn' : 'system',
          },
          riskChip(state, c),
        ]}
      />
      <List>
        <ListItem
          aside={
            <Stepper
              label={`Betrag ${c.name}`}
              value={value}
              min={0}
              max={max}
              step={STEP}
              format={(v) => formatEuro(v)}
              onChange={setAmount}
            />
          }
        >
          <ItemContent
            icon="moneyBag"
            color="dirty"
            title="Betrag"
            meta={
              ok
                ? `${formatEuro(value - Math.round(value * fee))} sauber in ca. ${clock.formatDuration(channelDuration(c.id, value))}`
                : max < c.minAmount
                  ? free < c.minAmount
                    ? 'Gerade nichts frei'
                    : `Zu wenig Schwarzgeld (ab ${formatEuro(c.minAmount)})`
                  : `Mindestens ${formatEuro(c.minAmount)}`
            }
          />
        </ListItem>
        <ListItem action disabled={!ok} onClick={wash} value={ok ? formatEuro(value) : undefined}>
          <ItemContent
            icon="washing"
            color="money"
            title="Jetzt waschen"
            meta={ok ? `Gebühr ${formatEuro(Math.round(value * fee))}` : `Ab ${formatEuro(c.minAmount)}`}
          />
        </ListItem>
      </List>
      {options.length > 0 && (
        <SegmentedControl
          wide
          aria-label={`Betrag wählen (${c.name})`}
          value={options.includes(value) ? value : -1}
          options={options.map((p, i) => ({
            value: p,
            label: i === options.length - 1 && p === max ? `Alles (${formatEuro(p)})` : formatEuro(p),
          }))}
          onChange={(v) => setAmount(v)}
        />
      )}
    </Group>
  );
}

/** Ein gesperrter Weg: was er bringt, was er kostet, was fehlt. */
function LockedChannel(props: { channel: LaunderingChannel }) {
  const { state, dispatch } = useGame();
  const c = props.channel;
  const check = canUnlockChannel(state, c.id);
  const cost = c.unlock ?? { clean: 0, dirty: 0 };
  const unlock = (pay: 'clean' | 'dirty') => dispatch({ type: 'laundering.unlock', payload: { channel: c.id, pay } });
  return (
    <Group
      title={c.name}
      icon="lock"
      color="system"
      value={`Gebühr ${formatPercent(channelFee(state, c.id))}`}
      note={check.ok ? c.how : check.reason}
      more={`${c.who} ${c.how}`}
    >
      <Chips
        class="laundering-facts"
        items={[
          { label: `ab ${formatEuro(c.minAmount)}`, icon: 'coins' },
          { label: `bis ${formatEuro(channelCapacity(state, c.id))} auf einmal`, icon: 'gauge' },
          riskChip(state, c),
          c.unlock?.reputation !== undefined && {
            label: `Ruf ab ${c.unlock.reputation}`,
            icon: 'star',
            color: check.ok ? 'money' : 'warn',
          },
          c.unlock?.veedel !== undefined && {
            label: `oder ${c.unlock.veedel} Veedel`,
            icon: 'flag',
            color: check.ok ? 'money' : 'warn',
          },
        ]}
      />
      <List>
        <ListItem
          action
          disabled={!check.ok || state.wallet.clean < cost.clean}
          value={formatEuro(cost.clean)}
          onClick={() => unlock('clean')}
        >
          <ItemContent
            icon="coinEuro"
            color="money"
            title="Einsteigen mit sauberem Geld"
            meta="Legal, bleibt unauffällig"
          />
        </ListItem>
        <ListItem
          action
          disabled={!check.ok || state.wallet.dirty < cost.dirty}
          value={formatEuro(cost.dirty)}
          onClick={() => unlock('dirty')}
        >
          <ItemContent icon="moneyBag" color="dirty" title="Einsteigen mit Schwarzgeld" meta="Teurer, dafür sofort" />
        </ListItem>
      </List>
    </Group>
  );
}

function LaunderingApp() {
  const { state } = useGame();
  const dirty = Math.floor(wallet.balance(state, 'dirty'));
  const batches = getBatches(state);
  const inProgress = amountInProgress(state);
  const sold = isBusinessSold(state);
  const open = LAUNDERING_CHANNELS.filter((c) => isChannelUnlocked(state, c.id));
  // Nach dem Verkauf (Auftrag 43, H9) kommst du an die Geschäfte in den alten Veedeln nicht mehr heran.
  const locked = LAUNDERING_CHANNELS.filter((c) => !isChannelUnlocked(state, c.id) && !c.harborOnly && !sold);
  return (
    <div class="laundering-app">
      <SummaryTiles
        items={[
          { icon: 'moneyBag', color: 'dirty', value: formatEuro(dirty), label: 'Schwarz' },
          { icon: 'coinEuro', color: 'money', value: formatEuro(Math.floor(state.wallet.clean)), label: 'Sauber' },
        ]}
      />
      <p class="laundering-lead">
        {sold
          ? 'Schwarzgeld wird über Zeit zu sauberem Geld, das du für Legales brauchst (Hallen, Lkw, Schiffe, Liegegeld).'
          : 'Schwarzgeld wird über Zeit zu sauberem Geld, das du für Legales brauchst (Lager, Liegeplatz, Einstieg bei Geschäften).'}
        {launderingCityFactor(state) > 1 &&
          ` In ${cityName(presentCity(state))} fallen größere Summen weniger auf: Jeder Weg fasst das ${formatNumber(launderingCityFactor(state), 1)}-Fache.`}
      </p>
      {batches.length > 0 && (
        <Group
          title="In der Wäsche"
          icon="washing"
          color="dirty"
          count={batches.length}
          value={formatEuro(inProgress)}
          collapsible
          note={`Frei über alle Wege: ${formatEuro(Math.max(0, launderingCapacity(state) - inProgress))}.`}
        >
          <List>
            {batches.map((b) => (
              <ListItem key={b.id} value={readyLabel(state.time, b.readyAt)}>
                <ItemContent
                  icon={getChannel(b.channel).icon}
                  color="dirty"
                  title={formatEuro(b.amount)}
                  tags={[
                    { label: getChannel(b.channel).name, icon: getChannel(b.channel).icon, color: 'dirty' },
                    { label: `${formatEuro(b.amount - b.fee)} sauber`, icon: 'coinEuro', color: 'money' },
                  ]}
                >
                  <ProgressBar value={batchProgress(state, b)} label="Geldwäsche" />
                </ItemContent>
              </ListItem>
            ))}
          </List>
        </Group>
      )}
      {open.map((c) => (
        <OpenChannel key={c.id} channel={c} />
      ))}
      {locked.map((c) => (
        <LockedChannel key={c.id} channel={c} />
      ))}
      <Disclosure label="Wie funktioniert Geldwäsche?">
        <p>
          Jeder Weg hat eine Gebühr, eine Dauer und eine Obergrenze, wie viel gleichzeitig laufen kann. Kleine Wege sind
          schnell und teuer, große langsam und billig.
        </p>
        <p>
          Läuft über einen Weg zu viel auf einmal, steigt der Heat im Veedel des Geschäfts. Ein Buchhalter senkt die
          Gebühr auf allen Wegen.
        </p>
      </Disclosure>
    </div>
  );
}

registerPhoneApp({
  id: 'laundering.app',
  name: 'Geldwäsche',
  icon: 'washing',
  order: 40,
  color: 'money',
  component: LaunderingApp,
  // Handy Schritt für Schritt: kommt mit Peters Quest „Wasch 500 €“ (quests, PHONE_APP_STEPS).
  // Auftrag 46b: Im Tutorial kommt die App mit ihrer Stufe.
  hiddenWhen: (state) => !tutorialAllows(state, 'app.laundering'),
});
registerSearch({
  id: 'laundering.search',
  label: 'Geldwäsche',
  order: 45,
  items: (state) => [
    {
      id: 'laundering.app',
      title: 'Geldwäsche',
      subtitle: `${formatEuro(Math.floor(wallet.balance(state, 'dirty')))} Schwarzgeld, ${formatEuro(amountInProgress(state))} in der Wäsche`,
      icon: 'washing',
      keywords: 'waschen sauber schwarzgeld geld kiosk waschsalon bauunternehmer',
      run: (ui) => ui.openPhone('laundering.app'),
    },
  ],
});
onGameEvent('laundering.completed', 'laundering.toast', (payload, ui) =>
  ui.toast(`${formatEuro(payload.amount - payload.fee)} sind jetzt sauber.`, 'good'),
);
onGameEvent('laundering.unlocked', 'laundering.unlockedToast', (payload, ui) =>
  ui.toast(`${getChannel(payload.channel).name} wäscht jetzt für dich.`, 'good', { urgent: false }),
);

registerAdvisor({
  id: 'laundering.advice',
  advise: (state) => {
    const dirty = Math.floor(wallet.balance(state, 'dirty'));
    if (dirty < 4000 || launderingCapacity(state) - amountInProgress(state) <= 0) return null;
    return {
      id: 'laundering.wash',
      priority: 35,
      icon: 'washing',
      title: 'Geld waschen',
      // Nach dem Verkauf (Auftrag 43) sind es Lkw, Halle, Liegeplatz und Schiffe.
      text: isBusinessSold(state)
        ? 'Sauberes Geld brauchst du für Lkw, Halle, Liegeplatz und Schiffe. Große Beträge über Jansens Reederei.'
        : 'Sauberes Geld brauchst du für alles Legale, zum Beispiel Lager und Autos.',
      actionLabel: 'Öffnen',
      action: (ui) => ui.openPhone('laundering.app'),
    };
  },
});
