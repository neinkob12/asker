// Banner einer Benachrichtigung (neue Nachricht …). Ist das Handy offen, erscheint es wie bei iOS oben im Handy
// (PhoneNotice), liegt es in der Tasche, oben über der Karte (NotificationBanner).
// Meldungen der Module (ui.toast) erscheinen seit dem Look "Glas" ebenfalls hier und nicht mehr als Toast über der
// Karte: Kachel in der Farbe der Meldung, Tipp öffnet die App Meldungen (bzw. fliegt zum Ort).
// Gesten im Handy: hochwischen = weg, herunterziehen = Mitteilungszentrale (Regeln in gestureModel.ts).

import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
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
        api.dismissNotification();
        api.openPhone(n.appId ?? null, n.params);
      },
      dismiss: api.dismissNotification,
    };
    if (tile.style) content.style = tile.style;
    return content;
  }
  const t = ui.toasts[0];
  if (!t) return null;
  return {
    key: `t${t.id}`,
    title: TOAST_TITLES[t.kind],
    text: t.text,
    icon: t.icon ?? TOAST_ICONS[t.kind],
    color: TOAST_CHIPS[t.kind],
    open: () => {
      api.dismissToast();
      if (t.target) api.flyTo(t.target, 15.5);
      else api.openPhone('core.alerts');
    },
    dismiss: api.dismissToast,
  };
}

function Notice(props: { class: string; swipe?: boolean }) {
  const { ui, api } = useRuntime();
  const box = useRef<HTMLDivElement>(null);
  const n = bannerContent(ui, api);
  if (!n) return null;
  const open = n.open;
  const paint = (y: number) => {
    if (box.current) box.current.style.transform = y === 0 ? '' : `translate3d(0,${y}px,0)`;
  };
  const swipe = (e: PointerEvent) => {
    if (!props.swipe || e.button !== 0 || !box.current) return;
    const height = box.current.offsetHeight || 80;
    startDrag(e, box.current, {
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
          from: dy < 0 ? dy : rubberBand(dy, height * 2),
          to,
          velocity: vy * 1000,
          onFrame: paint,
          onRest: () => {
            if (result === 'dismiss') n.dismiss();
          },
        });
      },
    });
  };
  return (
    <div
      class={`phone-notice ${props.class}`}
      role="status"
      aria-live="polite"
      key={n.key}
      ref={box}
      onPointerDown={(e) => swipe(e as unknown as PointerEvent)}
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

/** Banner im offenen Handy (hochwischen = weg, herunterziehen = Mitteilungszentrale). */
export function PhoneNotice() {
  return <Notice class="is-inside" swipe />;
}

/** Banner über der Karte, solange das Handy weggelegt ist. */
export function NotificationBanner() {
  const { ui } = useRuntime();
  if (ui.phone.open) return null;
  return <Notice class="is-floating" />;
}
