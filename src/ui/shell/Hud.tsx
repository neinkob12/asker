import { messages, SPEEDS } from '../../core';
import { Badge, Button, SegmentedControl } from '../components';
import { useRuntime } from '../hooks';
import { hudItems } from '../registry';

const SPEED_LABELS: Record<number, string> = { 0: 'Pause', 1: '1x', 2: '2x', 4: '4x' };

/** Leiste oben: Anzeigen der Module links, Steuerung rechts. */
export function Hud() {
  const runtime = useRuntime();
  const { session, api } = runtime;
  const state = runtime.state;
  const unread = state ? messages.unreadCount(state) : 0;
  return (
    <header class="shell-hud">
      <div class="shell-hud__brand">Köln Tycoon</div>
      <div class="shell-hud__items">
        {hudItems.list().map((item) => (
          <item.component key={item.id} />
        ))}
      </div>
      <div class="shell-hud__controls">
        <SegmentedControl
          aria-label="Spielgeschwindigkeit"
          options={SPEEDS.map((s) => ({ value: s, label: SPEED_LABELS[s] ?? `${s}x` }))}
          value={session.loop.speed}
          onChange={(s) => api.setSpeed(s)}
        />
        <div class="ui-segmented">
          <Button small onClick={api.flyToKoeln}>
            Köln
          </Button>
          <Button small onClick={api.flyToEuropa}>
            Europa
          </Button>
        </div>
        <div class="ui-segmented">
          <Button small onClick={() => api.openDialog('core.saves', {})} title="Spielstände">
            Menü
          </Button>
          <Button
            small
            active={runtime.ui.phone.open}
            onClick={() => (runtime.ui.phone.open ? api.closePhone() : api.openPhone())}
            aria-label="Handy"
          >
            Handy
            <Badge count={unread} />
          </Button>
        </div>
      </div>
    </header>
  );
}
