import { messages, SPEEDS } from '../../core';
import { Button, Icon, IconButton, SegmentedControl } from '../components';
import { useRuntime } from '../hooks';
import { hudItems } from '../registry';
import { useAudio } from '../useAudio';

const SPEED_LABELS: Record<number, string> = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' };

/** HUD-Einträge ab dieser Ordnung stehen fest neben dem Tempo (die Uhr), die übrigen in der wischbaren Leiste. */
const TIME_ORDER = 90;

/** Leiste oben: Marke, Anzeigen der Module, rechts Tempo, Menü, Ton und das Spiel-Handy. */
export function Hud() {
  const runtime = useRuntime();
  const { session, api, ui } = runtime;
  const state = runtime.state;
  const audio = useAudio();
  const unread = state ? messages.unreadCount(state) : 0;
  const muted = audio.settings.muted;
  const items = hudItems.list();
  return (
    <header class="shell-hud">
      <div class="shell-hud__brand">
        <Icon name="target" class="shell-hud__logo" />
        <span>Köln Tycoon</span>
      </div>
      <div class="shell-hud__items">
        {items
          .filter((item) => item.order < TIME_ORDER)
          .map((item) => (
            <item.component key={item.id} />
          ))}
      </div>
      <div class="shell-hud__time">
        {items
          .filter((item) => item.order >= TIME_ORDER)
          .map((item) => (
            <item.component key={item.id} />
          ))}
      </div>
      <div class="shell-hud__controls">
        <SegmentedControl
          aria-label="Spielgeschwindigkeit"
          options={SPEEDS.map((s) => ({
            value: s,
            label: SPEED_LABELS[s] ?? `${s}×`,
            icon: s === 0 ? ('pause' as const) : undefined,
          }))}
          value={session.loop.speed}
          onChange={(s) => api.setSpeed(s)}
        />
        <div class="shell-hud__buttons">
          <IconButton icon="menu" label="Spielstände" onClick={() => api.openDialog('core.saves', {})} />
          <IconButton icon="sliders" label="Einstellungen" onClick={() => api.openDialog('core.settings', {})} />
          <IconButton
            icon={muted ? 'volumeOff' : 'volume'}
            label={muted ? 'Ton an' : 'Ton aus'}
            active={false}
            onClick={() => audio.toggleMute()}
          />
        </div>
        <Button
          icon="phone"
          variant="primary"
          class={`shell-hud__phone ${ui.buzz > 0 ? `is-buzzing-${ui.buzz % 2}` : ''}`}
          active={ui.phone.open}
          badge={unread}
          aria-label={unread > 0 ? `Handy, ${unread} ungelesen` : 'Handy'}
          onClick={() => (ui.phone.open ? api.closePhone() : api.openPhone())}
        >
          <span class="shell-hud__phone-label">Handy</span>
        </Button>
      </div>
    </header>
  );
}
