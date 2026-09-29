// Einstellungen: eine App mit drei Abschnitten. "Ton & Musik" (Lautstärken, Musik, kleiner Player), "Anzeige"
// (Karte und Kamera), "Spiel" (Vibration, Spielstände). Musik ist keine eigene App mehr: Sie ist eine Einstellung mit
// Player. Module hängen eigene Abschnitte in den Slot 'core.settings'. Alles gilt nur für dieses Gerät.
// Aufbau wie iOS-Einstellungen: Abschnittskopf mit Symbol, eingerückte Gruppe, Schalter und Regler in den Zeilen.

import type { ComponentChildren, JSX } from 'preact';
import { MUSIC_MOOD_NAMES } from '../../audio';
import {
  Button,
  type ChipColor,
  categoryOf,
  Icon,
  IconChip,
  ProgressBar,
  SegmentedControl,
  Slider,
  Tag,
  Toggle,
} from '../components';
import { useUi } from '../hooks';
import { slotContributions } from '../registry';
import { Slot } from '../shell/Slot';
import { useAudio } from '../useAudio';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;

function Section(props: {
  icon: string;
  color: ChipColor;
  title: string;
  children: ComponentChildren;
  note?: ComponentChildren;
}) {
  return (
    <section
      class="set-section"
      style={{ '--slider-tone': `var(--cat-${categoryOf(props.color)})` } as JSX.CSSProperties}
    >
      <header class="set-section__head">
        <IconChip icon={props.icon} color={props.color} solid size="sm" />
        <h3 class="set-section__title">{props.title}</h3>
      </header>
      <div class="set-group">{props.children}</div>
      {props.note && <p class="set-section__note">{props.note}</p>}
    </section>
  );
}

function Player() {
  const audio = useAudio();
  const s = audio.settings;
  const now = audio.nowPlaying();
  if (!s.musicOn) return null;
  if (!now) {
    return (
      <p class="set-note">
        {audio.status === 'locked'
          ? 'Die Musik startet nach dem ersten Klick oder Tippen.'
          : audio.status === 'unsupported'
            ? 'Dieser Browser kann keinen Ton abspielen.'
            : 'Gerade läuft nichts.'}
      </p>
    );
  }
  return (
    <div class="set-player">
      <IconChip icon="music" color="media" solid size="lg" shape="tile" />
      <div class="set-player__text">
        <strong class="set-player__title">{now.track.title}</strong>
        <span class="set-player__moods">
          {now.track.moods.map((m) => (
            <Tag
              key={m}
              category={m === audio.mood ? 'media' : undefined}
              tone={m === audio.mood ? undefined : 'muted'}
            >
              {MUSIC_MOOD_NAMES[m]}
            </Tag>
          ))}
        </span>
        <ProgressBar value={now.elapsed / now.duration} label="Fortschritt" tone="info" />
        <span class="set-player__time">
          {duration(Math.min(now.elapsed, now.duration))} / {duration(now.duration)}
        </span>
      </div>
      <Button icon="skip" aria-label="Nächstes Stück" title="Nächstes Stück" onClick={() => audio.next()} />
    </div>
  );
}

/** Einstellungen als App im Spiel-Handy. */
export function SettingsApp() {
  const ui = useUi();
  const audio = useAudio();
  const s = audio.settings;
  const hasModuleSettings = slotContributions('core.settings').length > 0;
  return (
    <div class="settings">
      <Section icon="volume" color="media" title="Ton & Musik">
        <Toggle
          label="Ton"
          hint={audio.status === 'locked' ? 'Startet nach dem ersten Klick oder Tippen.' : undefined}
          checked={!s.muted}
          onChange={(on) => audio.setMuted(!on)}
        />
        <Slider
          label="Gesamtlautstärke"
          value={s.master}
          onChange={(v) => audio.update({ master: v })}
          disabled={s.muted}
        />
        <Toggle label="Musik" checked={s.musicOn} onChange={(on) => audio.update({ musicOn: on })} />
        <Slider
          label="Musiklautstärke"
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
        <Player />
      </Section>

      <Section icon="map" color="place" title="Anzeige">
        <Toggle
          label="Überwachungs-Overlay"
          hint="Raster, Scanlines und Koordinaten auf der Karte"
          checked={ui.state.overlay}
          onChange={ui.setOverlay}
        />
        <div class="set-choice">
          <span class="set-choice__label">Kamera</span>
          <SegmentedControl
            wide
            aria-label="Kamera"
            options={[
              { value: '3d', label: '3D schräg' },
              { value: '2d', label: '2D Draufsicht' },
            ]}
            value={ui.state.camera}
            onChange={ui.setCameraMode}
          />
        </div>
      </Section>

      <Section icon="gear" color="system" title="Spiel">
        <Toggle
          label="Vibrieren"
          hint="Das Handy wackelt bei neuen Nachrichten"
          checked={ui.state.vibration}
          onChange={ui.setVibration}
        />
        <button type="button" class="set-link" onClick={() => ui.openDialog('core.saves', {})}>
          <span class="set-link__text">
            <span class="set-link__label">Spielstände</span>
            <span class="set-link__hint">Speichern, laden, neues Spiel</span>
          </span>
          <Icon name="chevronRight" class="set-link__chevron" />
        </button>
      </Section>

      {hasModuleSettings && (
        <Section icon="sliders" color="system" title="Weitere">
          <Slot name="core.settings" />
        </Section>
      )}

      <p class="set-foot">Diese Einstellungen gelten nur für dieses Gerät.</p>
    </div>
  );
}
