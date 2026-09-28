// Einstellungen: Ton und Musik (Audio-Dienst), Karte (Overlay, Kamera) und Handy (Vibration).
// Als Dialog (HUD) und als App im Spiel-Handy. Module hängen eigene Abschnitte in den Slot 'core.settings'.

import { Card, Dialog, SegmentedControl, Slider, Toggle } from '../components';
import { useUi } from '../hooks';
import { Slot } from '../shell/Slot';
import { useAudio } from '../useAudio';

export function SettingsPanel() {
  const ui = useUi();
  const audio = useAudio();
  const s = audio.settings;
  return (
    <div class="settings">
      <Card title="Ton" icon="volume">
        <Toggle
          icon={s.muted ? 'volumeOff' : 'volume'}
          label="Ton an"
          hint={audio.status === 'locked' ? 'Startet nach dem ersten Klick oder Tippen.' : undefined}
          checked={!s.muted}
          onChange={(on) => audio.setMuted(!on)}
        />
        <Slider label="Gesamt" value={s.master} onChange={(v) => audio.update({ master: v })} disabled={s.muted} />
        <Toggle icon="music" label="Musik" checked={s.musicOn} onChange={(on) => audio.update({ musicOn: on })} />
        <Slider
          label="Musik"
          value={s.music}
          onChange={(v) => audio.update({ music: v })}
          disabled={s.muted || !s.musicOn}
        />
        <Slider
          label="Effekte und Geräusche"
          value={s.sfx}
          onChange={(v) => audio.update({ sfx: v })}
          disabled={s.muted}
        />
      </Card>
      <Card title="Karte" icon="map">
        <Toggle
          icon="scan"
          label="Überwachungs-Overlay"
          hint="Raster, Scanlines und Koordinaten"
          checked={ui.state.overlay}
          onChange={ui.setOverlay}
        />
        <div class="settings__row">
          <span>Kamera</span>
          <SegmentedControl
            aria-label="Kamera"
            options={[
              { value: '3d', label: '3D schräg' },
              { value: '2d', label: '2D Draufsicht' },
            ]}
            value={ui.state.camera}
            onChange={ui.setCameraMode}
          />
        </div>
      </Card>
      <Card title="Handy" icon="phone">
        <Toggle
          icon="vibrate"
          label="Vibrieren"
          hint="Bei neuen Nachrichten"
          checked={ui.state.vibration}
          onChange={ui.setVibration}
        />
      </Card>
      <Slot name="core.settings" />
      <p class="ui-hint settings__note">Diese Einstellungen gelten nur für dieses Gerät.</p>
    </div>
  );
}

export function SettingsDialog() {
  const ui = useUi();
  return (
    <Dialog title="Einstellungen" icon="sliders" onClose={ui.closeDialog}>
      <SettingsPanel />
    </Dialog>
  );
}
