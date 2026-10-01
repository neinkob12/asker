// Dynamic Island des Spiel-Handys: zeigt wie bei iOS laufende Live-Aktivitäten der Module (registerLiveActivity):
// Überfälle, Lieferungen mit Restzeit, Fristen, Razzien, Umsatz des Tages … Kompakt links neben der Kamera ein
// Symbol mit kurzem Wort, rechts der Wert. Gibt es eine zweite Aktivität, hängt sie als kleiner Kreis daneben
// (minimale Darstellung). Aufgeklappt (Maus drüber, Tipp am Touchscreen) stehen alle Aktivitäten untereinander.
// Neue dringende Aktivitäten (Priorität ab 80) klappen die Island kurz von selbst auf, kurze Auftritte
// (ui.pulseIsland, z.B. "+120 €") erscheinen für ein paar Sekunden. Maße nach Apples HIG (Live Activities):
// Radius 44, Innenabstand 14, kräftige Farben auf Schwarz, mindestens mittlere Schriftstärke. Kompakt höchstens 230 pt
// breit (Uhrzeit und Symbole der Statusleiste bleiben frei), Restzeiten nur in Stunden (islandModel.ts).
// Wechselt sie die Größe (kompakt ↔ aufgeklappt, Auftritt), wächst sie als eine Form per Feder (useIslandMorph).

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { formatEuro } from '../../core';
import { Icon } from '../components';
import { useRuntime } from '../hooks';
import { collectLiveActivities, type LiveActivity } from '../registry';
import type { IslandPulse } from '../runtime';
import { animateValue, type Motion, reducedMotion } from './motion';
import { SPRINGS } from './spring';

/** Ab dieser Priorität klappt eine neue Aktivität die Island kurz von selbst auf (wie ein Alert bei iOS). */
const ALERT_PRIORITY = 80;
const ALERT_MS = 3000;
/** Hover öffnet/schließt erst nach kurzer Absicht (streifende Maus), aufgeklappt klappt es sonst von selbst wieder zu. */
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 350;
const AUTO_COLLAPSE_MS = 7000;
/** Aufgeklappt höchstens so viele Aktivitäten. */
const EXPANDED_MAX = 4;

export { islandCountdown } from './islandModel';

interface Box {
  w: number;
  h: number;
  r: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Island als eine Form: Ändert sich die Größe ihres Kastens, wächst die schwarze Fläche per Feder (Breite, Höhe und
 * Radius) von der alten zur neuen Form, ohne Layout pro Bild (nur transform und der Radius). Bei weniger Bewegung
 * springt sie sofort.
 */
function useIslandMorph() {
  const island = useRef<HTMLDivElement>(null);
  const shape = useRef<HTMLSpanElement>(null);
  const shown = useRef<Box | null>(null);
  const target = useRef<Box | null>(null);
  const motion = useRef<Motion | null>(null);

  useLayoutEffect(() => {
    const el = island.current;
    const form = shape.current;
    if (!el || !form) return;
    const style = getComputedStyle(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const r = Math.min(Number.parseFloat(style.borderTopLeftRadius) || 0, h / 2, w / 2);
    const next = { w, h, r };
    const before = target.current;
    target.current = next;
    if (!before || (Math.abs(before.w - w) < 0.5 && Math.abs(before.h - h) < 0.5)) {
      if (!motion.current?.running) shown.current = next;
      return;
    }
    const from = shown.current ?? before;
    motion.current?.stop();
    if (reducedMotion() || w <= 0 || h <= 0) {
      shown.current = next;
      el.classList.remove('is-morphing');
      return;
    }
    el.classList.add('is-morphing');
    const frame = (t: number) => {
      const box = { w: lerp(from.w, w, t), h: lerp(from.h, h, t), r: lerp(from.r, r, t) };
      shown.current = box;
      const sx = Math.max(0.01, box.w / w);
      const sy = Math.max(0.01, box.h / h);
      form.style.transform = `scale(${sx},${sy})`;
      form.style.borderRadius = `${box.r / sx}px / ${box.r / sy}px`;
    };
    frame(0);
    motion.current = animateValue({
      config: SPRINGS.island,
      from: 0,
      to: 1,
      onFrame: frame,
      onRest: () => {
        form.style.transform = '';
        form.style.borderRadius = '';
        el.classList.remove('is-morphing');
        shown.current = next;
      },
    }).motion;
  });
  useEffect(() => () => motion.current?.stop(), []);
  return { island, shape };
}

function pulseText(pulse: IslandPulse): string {
  if (pulse.amount !== undefined) return `${pulse.amount >= 0 ? '+' : '−'}${formatEuro(Math.abs(pulse.amount))}`;
  return pulse.text;
}

function ActivityRow(props: { activity: LiveActivity; onOpen: () => void }) {
  const a = props.activity;
  return (
    <button type="button" class={`island-row tone-${a.tone ?? 'neutral'}`} onClick={props.onOpen}>
      <span class="island-row__icon">
        <Icon name={a.icon} />
      </span>
      <span class="island-row__text">
        <span class="island-row__title">{a.title}</span>
        {a.detail && <span class="island-row__detail">{a.detail}</span>}
        {a.progress !== undefined && (
          <span class="island-row__bar">
            <span style={{ width: `${Math.round(Math.min(1, Math.max(0, a.progress)) * 100)}%` }} />
          </span>
        )}
      </span>
      <span class="island-row__value">{a.trailing}</span>
    </button>
  );
}

/**
 * floating: schwebt über der Karte (Handy weggelegt). clock: echtes Handy, keine Kamera-Attrappe: Die Pille zeigt links
 * die Spielzeit, daneben die wichtigste Aktivität.
 */
export function DynamicIsland(props: { floating?: boolean; clock?: string }) {
  const runtime = useRuntime();
  const { ui, api } = runtime;
  const state = runtime.state;
  const seen = useRef<Set<string> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const [alertId, setAlertId] = useState<string | null>(null);
  const morph = useIslandMorph();
  const activities = state ? collectLiveActivities(state) : [];
  const ids = activities.map((a) => a.id).join('|');

  // Neue dringende Aktivität: kurz aufklappen. Beim ersten Anzeigen nicht (sonst klappt sie nach dem Laden auf).
  useEffect(() => {
    // Jede Aktivität alarmiert nur einmal (auch wenn sie kurz verschwindet und wiederkommt).
    const current = new Set(ids ? ids.split('|') : []);
    const known = seen.current;
    if (known) {
      const fresh = activities.find((a) => a.priority >= ALERT_PRIORITY && !known.has(a.id));
      if (fresh && !ui.island.expanded) setAlertId(fresh.id);
      for (const id of current) known.add(id);
    } else {
      seen.current = current;
    }
  }, [ids]);
  useEffect(() => {
    if (!alertId) return;
    const timer = setTimeout(() => setAlertId(null), ALERT_MS);
    return () => clearTimeout(timer);
  }, [alertId]);

  // Aufgeklappt bleibt die Island nicht ewig stehen (Touch kennt kein "Maus weg").
  const expandedNow = ui.island.expanded;
  useEffect(() => {
    if (!expandedNow) return;
    const timer = setTimeout(() => api.toggleIsland(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [expandedNow, ids]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  if (!state) return null;
  const alert = alertId ? activities.find((a) => a.id === alertId) : undefined;
  const pulse = ui.island.pulse;
  const top = activities[0];
  const expanded = ui.island.expanded && activities.length > 0;
  const mode = expanded ? 'expanded' : alert ? 'alert' : pulse ? 'pulse' : top ? 'compact' : 'idle';
  // Weggelegtes Handy: Die Island schwebt nur, wenn es etwas zu zeigen gibt.
  if (props.floating && mode === 'idle') return null;

  const open = (a: LiveActivity) => {
    api.toggleIsland(false);
    setAlertId(null);
    a.open?.(api);
  };
  const extra = activities.length - 1;
  const second = activities[1];
  const hoverable = () => window.matchMedia?.('(hover: hover)').matches ?? false;

  const clockText = props.clock ? <span class="island__clock">{props.clock}</span> : null;
  // Ohne Kamera (echtes Handy) steht statt der Lücke für die Kamera die Spielzeit in der Pille.
  const cam = clockText ? null : <span class="island__cam" aria-hidden="true" />;

  return (
    <div class={`island-wrap ${props.floating ? 'is-floating' : ''} ${clockText ? 'is-pill' : ''}`}>
      <div
        ref={morph.island}
        class={`island is-${mode}`}
        role="status"
        aria-live="polite"
        aria-label={top ? `${top.title}: ${top.trailing}` : 'Keine laufenden Aktivitäten'}
        onMouseEnter={() => {
          if (!hoverable() || activities.length === 0) return;
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(() => api.toggleIsland(true), HOVER_OPEN_MS);
        }}
        onMouseLeave={() => {
          if (!hoverable()) return;
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(() => api.toggleIsland(false), HOVER_CLOSE_MS);
        }}
      >
        <span class="island__shape" ref={morph.shape} aria-hidden="true" />
        {mode === 'idle' && clockText && <span class="island__idle">{clockText}</span>}
        {(mode === 'compact' || mode === 'pulse') && (
          <button
            type="button"
            class="island__compact"
            onClick={() => {
              if (hoverable() && top) open(top);
              else api.toggleIsland();
            }}
          >
            {clockText}
            {mode === 'pulse' && pulse ? (
              <>
                <span class={`island__lead tone-${pulse.tone ?? 'accent'}`}>
                  <Icon name={pulse.icon} />
                </span>
                {cam}
                <span class={`island__trail tone-${pulse.tone ?? 'accent'}`} key={pulse.amount ?? pulse.text}>
                  {pulseText(pulse)}
                </span>
              </>
            ) : top ? (
              <>
                <span class={`island__lead tone-${top.tone ?? 'neutral'}`}>
                  <Icon name={top.icon} />
                  <span class="island__lead-text">{top.leading}</span>
                </span>
                {cam}
                <span class={`island__trail tone-${top.tone ?? 'neutral'}`} key={top.trailing}>
                  {top.trailing}
                </span>
              </>
            ) : null}
          </button>
        )}
        {mode === 'alert' && alert && (
          <div class="island__expanded">
            <ActivityRow activity={alert} onOpen={() => open(alert)} />
          </div>
        )}
        {mode === 'expanded' && (
          <div class="island__expanded">
            {activities.slice(0, EXPANDED_MAX).map((a) => (
              <ActivityRow key={a.id} activity={a} onOpen={() => open(a)} />
            ))}
            {activities.length > EXPANDED_MAX && (
              <span class="island__more">+{activities.length - EXPANDED_MAX} weitere</span>
            )}
          </div>
        )}
      </div>
      {mode === 'compact' && second && (
        <button
          type="button"
          class={`island-minimal tone-${second.tone ?? 'neutral'}`}
          onClick={() => api.toggleIsland(true)}
          aria-label={`${extra} weitere Aktivitäten`}
          title={second.title}
        >
          <Icon name={second.icon} />
          {extra > 1 && <span class="island-minimal__count">{extra}</span>}
        </button>
      )}
    </div>
  );
}
