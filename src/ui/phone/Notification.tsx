// Banner einer Benachrichtigung (neue Nachricht …). Ist das Handy offen, erscheint es wie bei iOS oben im Handy
// (PhoneNotice), liegt es in der Tasche, oben über der Karte (NotificationBanner).
// Meldungen der Module (ui.toast) erscheinen seit dem Look "Glas" ebenfalls hier und nicht mehr als Toast über der
// Karte: Kachel in der Farbe der Meldung, Tipp öffnet die App Meldungen (bzw. fliegt zum Ort).
// Gesten im Handy: hochwischen = weg, herunterziehen = Mitteilungszentrale (Regeln in gestureModel.ts).

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type ChipColor, Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { phoneApps } from '../registry';
import type { Toast, UiApi } from '../runtime';
import { TOAST_CHIPS, TOAST_ICONS } from '../shell/AlertCenter';
import { startDrag } from './drag';
import { bannerSwipe, rubberBand } from './gestureModel';
import { animateValue } from './motion';
import { SPRINGS } from './spring';
import { tileColor } from './tile';

const TOAST_TITLES: Record<Toast['kind'], string> = {
  bad: 'Dringend',
  warn: 'Achtung',
  good: 'Meldung',
  info: 'Meldung',
};

/** Was das Banner zeigt: eine Benachrichtigung (Vorrang) oder die erste Meldung aus der Warteschlange. */
interface BannerContent {
  key: string;
  title: string;
  text: string;
  icon: string;
  color: ChipColor;
  style?: JSX.CSSProperties;
  open(): void;
  dismiss(): void;
}

function bannerContent(ui: ReturnType<typeof useRuntime>['ui'], api: UiApi): BannerContent | null {
  const n = ui.notification;
  if (n) {
    // Kachel in der Farbe der App, zu der das Banner gehört (Nachrichten: Mint), mit dem Symbol des Absenders.
    const tile = tileColor((n.appId ? phoneApps.get(n.appId)?.color : undefined) ?? 'chat');
    const content: BannerContent = {
      key: `n${n.id}`,
      title: n.title,
      text: n.text,
      icon: n.icon ?? 'bell',
      color: tile.color,
      open: () => {
        api.dismissNotification(n.id);
        api.openPhone(n.appId ?? null, n.params);
      },
      // Mit ID: Kommt während des Wegwischens ein neues Banner, bleibt es stehen.
      dismiss: () => api.dismissNotification(n.id),
    };
    if (tile.style) content.style = tile.style;
    return content;
  }
  const t = ui.toasts[0];
  if (!t) return null;
  // Eigene Farbe (z.B. Gold für Quests) wie bei den Apps: Bedeutungsfarbe oder, für alte Module, eine CSS-Farbe.
  const tile = t.color ? tileColor(t.color) : { color: TOAST_CHIPS[t.kind] };
  const content: BannerContent = {
    key: `t${t.id}`,
    title: t.title ?? TOAST_TITLES[t.kind],
    text: t.text,
    icon: t.icon ?? TOAST_ICONS[t.kind],
    color: tile.color,
    open: () => {
      api.dismissToast(t.id);
      if (t.appId) api.openPhone(t.appId, t.params);
      else if (t.target) api.flyTo(t.target, 15.5);
      else api.openPhone('core.history');
    },
    dismiss: () => api.dismissToast(t.id),
  };
  if (tile.style) content.style = tile.style;
  return content;
}

/** Maus (nicht Finger oder Stift): Nur sie schwebt über dem Banner, ein Tipp löst sonst ein Pausieren ohne Ende aus. */
function isMouse(e: PointerEvent): boolean {
  return e.pointerType === 'mouse';
}

function Notice(props: { class: string; swipe?: boolean }) {
  const { ui, api } = useRuntime();
  const box = useRef<HTMLDivElement>(null);
  const n = bannerContent(ui, api);
  const key = n?.key;
  // Verschwindet oder wechselt das Banner unter dem Zeiger, kommt kein Loslassen mehr: dann hier lösen.
  useEffect(() => () => api.holdBanner(false), [key, api]);
  if (!n) return null;
  const open = n.open;
  const swipe = (e: PointerEvent) => {
    // Das Element merken: Kommt während der Animation ein neues Banner (neuer Schlüssel), darf sie nicht das neue bewegen.
    const el = box.current;
    if (!props.swipe || e.button !== 0 || !el) return;
    const paint = (y: number) => {
      el.style.transform = y === 0 ? '' : `translate3d(0,${y}px,0)`;
    };
    const height = el.offsetHeight || 80;
    startDrag(e, el, {
      axis: 'y',
      onMove: ({ dy }) => paint(dy < 0 ? dy : rubberBand(dy, height * 2)),
      onEnd: ({ dy, vy }) => {
        const result = bannerSwipe(dy, vy);
        if (result === 'center') {
          paint(0);
          api.toggleNotificationCenter(true);
          return;
        }
        const to = result === 'dismiss' ? -height - 40 : 0;
        animateValue({
          config: SPRINGS.snap,
          precision: 0.5,
          from: dy < 0 ? dy : rubberBand(dy, height * 2),
          to,
          velocity: vy * 1000,
          onFrame: paint,
          onRest: () => {
            // n.dismiss trägt die ID: Ein inzwischen eingetroffenes neues Banner bleibt sichtbar.
            if (result === 'dismiss') n.dismiss();
          },
        });
      },
    });
  };
  return (
    // Die Ansage für Screenreader macht NoticeAnnouncer (dauerhaft eingehängt); ein neu eingehängtes role="status"
    // wird meist nicht vorgelesen.
    <div
      class={`phone-notice ${props.class}`}
      key={n.key}
      ref={box}
      onPointerDown={(e) => swipe(e as unknown as PointerEvent)}
      onPointerEnter={(e) => isMouse(e as unknown as PointerEvent) && api.holdBanner(true)}
      onPointerLeave={(e) => isMouse(e as unknown as PointerEvent) && api.holdBanner(false)}
      onFocusIn={() => api.holdBanner(true)}
      onFocusOut={() => api.holdBanner(false)}
    >
      <button type="button" class="phone-notice__main" onClick={open}>
        <IconChip icon={n.icon} color={n.color} style={n.style} size="lg" shape="tile" solid />
        <span class="phone-notice__text">
          <span class="phone-notice__title">
            <span class="phone-notice__name">{n.title}</span>
            <span class="phone-notice__when">jetzt</span>
          </span>
          <span class="phone-notice__body">{n.text}</span>
        </span>
      </button>
      <button type="button" class="phone-notice__close" onClick={n.dismiss} aria-label="Ausblenden">
        <Icon name="close" />
      </button>
    </div>
  );
}

/**
 * Dauerhaft eingehängte Live-Region (nur für Screenreader): Der Text wechselt, die Region bleibt. Das Banner selbst
 * wird bei jedem neuen Eintrag neu gezeichnet; eine so neu angelegte Region melden Screenreader meist nicht.
 * Kurz leeren und dann füllen, damit auch derselbe Text zweimal angesagt wird.
 */
function NoticeAnnouncer(props: { id: string | undefined; text: string }) {
  const [said, setSaid] = useState('');
  useEffect(() => {
    setSaid('');
    if (!props.text) return;
    const timer = setTimeout(() => setSaid(props.text), 60);
    return () => clearTimeout(timer);
  }, [props.id]);
  return (
    <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-live-region="">
      {said}
    </div>
  );
}

/** Banner im offenen Handy (hochwischen = weg, herunterziehen = Mitteilungszentrale). */
export function PhoneNotice() {
  return <Notice class="is-inside" swipe />;
}

/** Banner über der Karte, solange das Handy weggelegt ist. */
export function NotificationBanner() {
  const { ui, api } = useRuntime();
  // Die Ansage gehört zu jedem Banner, ob im offenen Handy oder darüber: eine Region, immer da.
  const n = bannerContent(ui, api);
  return (
    <>
      <NoticeAnnouncer id={n?.key} text={n ? `${n.title}. ${n.text}` : ''} />
      {!ui.phone.open && <Notice class="is-floating" />}
    </>
  );
}
