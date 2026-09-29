// Banner einer Benachrichtigung (neue Nachricht …). Ist das Handy offen, erscheint es wie bei iOS oben im Handy
// (PhoneNotice), liegt es in der Tasche, oben über der Karte (NotificationBanner).

import { Icon, IconChip } from '../components';
import { useRuntime } from '../hooks';

function Notice(props: { class: string }) {
  const { ui, api } = useRuntime();
  const n = ui.notification;
  if (!n) return null;
  const open = () => {
    api.dismissNotification();
    api.openPhone(n.appId ?? null, n.params);
  };
  return (
    <div class={`phone-notice ${props.class}`} role="status" aria-live="polite" key={n.id}>
      <button type="button" class="phone-notice__main" onClick={open}>
        <IconChip icon={n.icon ?? 'bell'} color="green" size="md" shape="square" />
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

/** Banner im offenen Handy. */
export function PhoneNotice() {
  return <Notice class="is-inside" />;
}

/** Banner über der Karte, solange das Handy weggelegt ist. */
export function NotificationBanner() {
  const { ui } = useRuntime();
  if (ui.phone.open) return null;
  return <Notice class="is-floating" />;
}
