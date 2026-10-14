// Mitteilungen oben auf dem Startbildschirm (Feedback 13.10.2026): ein fester Streifen statt einer schwebenden
// Einblendung. Steht gerade eine kurze Rückmeldung an (ui.error: fehlgeschlagener Befehl oder ui.notice beim Tipp auf
// Gesperrtes), steht sie hier; sonst ein dringender Rat (Chat mit Frist, Kunden warten …; früher eine eigene Zeile
// „Dringend“ darunter), sonst die neueste Meldung aus dem Verlauf. Ein Tipp schließt die Rückmeldung, führt zum
// dringenden Rat bzw. öffnet den Verlauf. Ohne Zähler (Feedback 14.10.2026): Ein Badge gibt es nur an den Nachrichten.

import { clock, type GameState } from '../../core';
import { Icon } from '../components';
import { shallowEqual, useRuntime, useRuntimeSelector } from '../hooks';
import type { Advice } from '../registry';
import { collectAdvice } from '../shell/NextStep';

/** Ab dieser Priorität steht ein Rat in den Mitteilungen (z.B. Chat mit Frist, Ware alle). */
export const URGENT_ADVICE = 80;

/** Der dringende Rat, sofern es einen gibt. */
export function urgentAdvice(state: GameState): Advice | null {
  const top = collectAdvice(state)[0];
  return top && top.priority >= URGENT_ADVICE ? top : null;
}

interface NoticeView {
  /** 'error' | 'hint' (kurze Rückmeldung), 'urgent' (dringender Rat), 'alert' (Verlauf), 'empty'. */
  kind: 'error' | 'hint' | 'urgent' | 'alert' | 'empty';
  text: string;
  icon: string;
  time: string;
}

export function HomeNotices() {
  const runtime = useRuntime();
  const { api } = runtime;
  const view = useRuntimeSelector((rt): NoticeView => {
    const { error, alerts } = rt.ui;
    if (error)
      return { kind: error.hint ? 'hint' : 'error', text: error.text, icon: error.hint ? 'lock' : 'alert', time: '' };
    const urgent = rt.state ? urgentAdvice(rt.state) : null;
    if (urgent) return { kind: 'urgent', text: urgent.title, icon: urgent.icon, time: '' };
    const latest = alerts[0];
    if (!latest) return { kind: 'empty', text: 'Nichts Neues.', icon: 'bell', time: '' };
    return { kind: 'alert', text: latest.text, icon: latest.icon ?? 'bell', time: clock.formatTime(latest.time) };
  }, shallowEqual);
  const transient = view.kind === 'error' || view.kind === 'hint';
  return (
    <button
      type="button"
      class={`phone__notices is-${view.kind}`}
      aria-live="polite"
      onClick={() => {
        if (transient) return api.dismissError();
        // Den Rat erst beim Tipp holen (die Aktion ist eine Funktion und steht nicht im Auszug).
        const urgent = view.kind === 'urgent' && runtime.state ? urgentAdvice(runtime.state) : null;
        if (urgent?.action) urgent.action(api);
        else api.openPhone('core.history');
      }}
    >
      <span class="phone__notices-head">
        <span>Mitteilungen</span>
        {view.time && <time>{view.time}</time>}
      </span>
      <span class="phone__notices-body">
        <Icon name={view.icon} class="phone__notices-icon" />
        <span class="phone__notices-text">{view.text}</span>
      </span>
    </button>
  );
}
