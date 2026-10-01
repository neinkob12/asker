// Banner einer Benachrichtigung (neue Nachricht …). Ist das Handy offen, erscheint es wie bei iOS oben im Handy
// (PhoneNotice), liegt es in der Tasche, oben über der Karte (NotificationBanner).
// Gesten im Handy: hochwischen = weg, herunterziehen = Mitteilungszentrale (Regeln in gestureModel.ts).

import { useRef } from 'preact/hooks';
import { Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';
import { phoneApps } from '../registry';
import { startDrag } from './drag';
import { bannerSwipe, rubberBand } from './gestureModel';
import { animateValue } from './motion';
import { SPRINGS } from './spring';
import { tileColor } from './tile';

function Notice(props: { class: string; swipe?: boolean }) {
  const { ui, api } = useRuntime();
  const box = useRef<HTMLDivElement>(null);
  const n = ui.notification;
  if (!n) return null;
  // Kachel in der Farbe der App, zu der das Banner gehört (Nachrichten: Mint), mit dem Symbol des Absenders.
  const tile = tileColor((n.appId ? phoneApps.get(n.appId)?.color : undefined) ?? 'chat');
  const open = () => {
    api.dismissNotification();
    api.openPhone(n.appId ?? null, n.params);
  };
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
            if (result === 'dismiss') api.dismissNotification();
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
      key={n.id}
      ref={box}
      onPointerDown={(e) => swipe(e as unknown as PointerEvent)}
    >
      <button type="button" class="phone-notice__main" onClick={open}>
        <IconChip icon={n.icon ?? 'bell'} color={tile.color} style={tile.style} size="lg" shape="tile" solid />
        <span class="phone-notice__text">
          <span class="phone-notice__title">
            <span class="phone-notice__name">{n.title}</span>
            <span class="phone-notice__when">jetzt</span>
          </span>
          <span class="phone-notice__body">{n.text}</span>
        </span>
      </button>
      <button type="button" class="phone-notice__close" onClick={api.dismissNotification} aria-label="Ausblenden">
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
