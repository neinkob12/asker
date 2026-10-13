// Mitteilungen oben auf dem Startbildschirm (Feedback 13.10.2026): ein fester Streifen statt einer schwebenden
// Einblendung. Steht gerade eine kurze Rückmeldung an (ui.error: fehlgeschlagener Befehl oder ui.notice beim Tipp auf
// Gesperrtes), steht sie hier; sonst die neueste Meldung aus dem Verlauf, ungelesene hervorgehoben. Ein Tipp schließt
// die Rückmeldung bzw. öffnet den Verlauf.

import { clock } from '../../core';
import { Icon } from '../components';
import { shallowEqual, useRuntime, useRuntimeSelector } from '../hooks';

interface NoticeView {
  /** 'error' | 'hint' (kurze Rückmeldung), 'alert' (Verlauf), 'empty'. */
  kind: 'error' | 'hint' | 'alert' | 'empty';
  text: string;
  icon: string;
  /** Ungelesene Meldungen im Verlauf. */
  unread: number;
  time: string;
}

export function HomeNotices() {
  const { api } = useRuntime();
  const view = useRuntimeSelector((rt): NoticeView => {
    const { error, alerts } = rt.ui;
    const unread = alerts.filter((a) => !a.read).length;
    if (error)
      return {
        kind: error.hint ? 'hint' : 'error',
        text: error.text,
        icon: error.hint ? 'lock' : 'alert',
        unread,
        time: '',
      };
    const latest = alerts.find((a) => !a.read) ?? alerts[0];
    if (!latest) return { kind: 'empty', text: 'Nichts Neues.', icon: 'bell', unread: 0, time: '' };
    return {
      kind: 'alert',
      text: latest.text,
      icon: latest.icon ?? 'bell',
      unread,
      time: clock.formatTime(latest.time),
    };
  }, shallowEqual);
  const transient = view.kind === 'error' || view.kind === 'hint';
  return (
    <button
      type="button"
      class={`phone__notices is-${view.kind} ${view.unread > 0 && !transient ? 'has-unread' : ''}`}
      aria-live="polite"
      onClick={() => (transient ? api.dismissError() : api.openPhone('core.history'))}
    >
      <span class="phone__notices-head">
        <span>Mitteilungen</span>
        {view.unread > 0 && <span class="phone__notices-count">{view.unread}</span>}
        {view.time && <time>{view.time}</time>}
      </span>
      <span class="phone__notices-body">
        <Icon name={view.icon} class="phone__notices-icon" />
        <span class="phone__notices-text">{view.text}</span>
      </span>
    </button>
  );
}
