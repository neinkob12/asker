// Banner einer Benachrichtigung (neue Nachricht …), ragt oben aus dem Handy bzw. am Handy vom oberen Rand.

import { Icon } from '../components';
import { useRuntime } from '../hooks';

export function NotificationBanner() {
  const { ui, api } = useRuntime();
  const n = ui.notification;
  if (!n) return null;
  const open = () => {
    api.dismissNotification();
    api.openPhone(n.appId ?? null, n.params);
  };
  return (
    <div class="phone-notice" role="status" aria-live="polite" key={n.id}>
      <button type="button" class="phone-notice__main" onClick={open}>
        <span class="phone-notice__icon" aria-hidden="true">
          <Icon name={n.icon ?? 'bell'} />
        </span>
        <span class="phone-notice__text">
          <span class="phone-notice__title">
            {n.title}
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
