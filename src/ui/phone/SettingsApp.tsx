// Einstellungen: eine App mit Abschnitten. "Ton & Musik" (Lautstärken, Musik, kleiner Player), "Karte" (Overlay,
// Kamera, Verkehr), die Abschnitte der Module aus dem Slot 'core.settings' (z.B. Wetter mit Vorhersage, Anfragen der Kunden),
// "Verlauf" (Ereignisse, Meldungen, Aufträge, Spielstand exportieren) und "Spiel" (Vibration, Spielstände). Musik
// ist keine eigene App mehr: Sie ist eine Einstellung mit Player. Ton, Karte und Spiel gelten nur für dieses Gerät.
// Aufbau wie iOS-Einstellungen: Abschnittskopf mit Symbol, eingerückte Gruppe, Schalter und Regler in den Zeilen.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MUSIC_MOOD_NAMES } from '../../audio';
import { exportSaveFile } from '../builtin/GameDialogs';
import { HistorySection } from '../builtin/HistoryApp';
import {
  Button,
  type ChipColor,
  categoryOf,
  ErrorBoundary,
  Icon,
  IconChip,
  isChipColor,
  ProgressBar,
  SegmentedControl,
  Slider,
  Tag,
  Toggle,
} from '../components';
import { useRuntime, useUi } from '../hooks';
import { slotContributions } from '../registry';
import { useAudio } from '../useAudio';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;

function Section(props: {
  icon: string;
  color: ChipColor;
  title: string;
  children: ComponentChildren;
  note?: ComponentChildren;
  /** Ohne die graue Gruppenfläche (für Beiträge, die eigene Gruppen mitbringen, z.B. den Verlauf). */
  plain?: boolean;
}) {
  return (
    <section
      class={`set-section ${props.plain ? 'set-section--plain' : ''}`}
      style={{ '--slider-tone': `var(--cat-${categoryOf(props.color)})` } as JSX.CSSProperties}
    >
      <header class="set-section__head">
        <IconChip icon={props.icon} color={props.color} solid size="sm" />
        <h3 class="set-section__title">{props.title}</h3>
      </header>
      {props.plain ? props.children : <div class="set-group">{props.children}</div>}
      {props.note && <p class="set-section__note">{props.note}</p>}
    </section>
  );
}

function Player() {
  const audio = useAudio();
  const s = audio.settings;
  // Die Musik läuft auch bei Pause weiter, das Spiel zeichnet dann aber nicht neu: Zeit und Balken sekündlich nachziehen.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
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

/** Abschnitte der Module (Slot 'core.settings'): jeder mit eigenem Kopf aus Titel, Symbol und Farbe des Beitrags. */
function ModuleSections() {
  return (
    <>
      {slotContributions('core.settings').map((item) => {
        const Component = item.component as unknown as () => JSX.Element | null;
        return (
          <Section
            key={item.id}
            icon={item.icon ?? 'sliders'}
            color={item.color && isChipColor(item.color) ? item.color : 'system'}
            title={item.title ?? 'Weitere'}
          >
            <ErrorBoundary name={item.id}>
              <Component />
            </ErrorBoundary>
          </Section>
        );
      })}
    </>
  );
}

/** Einstellungen als App im Spiel-Handy. */
export function SettingsApp() {
  const ui = useUi();
  const runtime = useRuntime();
  const audio = useAudio();
  const s = audio.settings;
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

      <Section icon="map" color="place" title="Karte">
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
        <div class="set-choice">
          <span class="set-choice__label">Verkehr</span>
          <SegmentedControl
            wide
            aria-label="Verkehr auf der Karte"
            options={[
              { value: 'off', label: 'Aus' },
              { value: 'low', label: 'Wenig' },
              { value: 'normal', label: 'Normal' },
            ]}
            value={ui.state.traffic}
            onChange={ui.setTraffic}
          />
        </div>
      </Section>

      <ModuleSections />

      <Section icon="journal" color="log" title="Verlauf" plain>
        <HistorySection />
      </Section>

      <Section icon="gear" color="system" title="Spiel">
        <Toggle
          label="Mehr Benachrichtigungen"
          hint="Auch Routine als Banner (Lieferung bestellt, Level-Aufstieg, jede Nachricht). Sonst nur Dringendes."
          checked={ui.state.moreNotifications}
          onChange={ui.setMoreNotifications}
        />
        <Toggle
          label="Vibrieren"
          hint="Wackeln bei neuen Nachrichten, leise Klicks bei Schaltern und Gesten"
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
        <button type="button" class="set-link" onClick={() => exportSaveFile(runtime)}>
          <span class="set-link__text">
            <span class="set-link__label">Spielstand exportieren</span>
            <span class="set-link__hint">Als Datei herunterladen, zum Weitergeben oder Sichern</span>
          </span>
          <Icon name="download" class="set-link__chevron" />
        </button>
      </Section>

      <Section icon="info" color="system" title="Über">
        <p class="set-note">
          Köln Tycoon ist ein Spiel. Alle Personen, Gangs und Geschäfte sind frei erfunden, die Orte sind echt.
        </p>
        <dl class="set-sources">
          <dt>Karte</dt>
          <dd>{'©\u00a0OpenFreeMap, ©\u00a0OpenMapTiles, ©\u00a0OpenStreetMap-Mitwirkende (ODbL)'}</dd>
          <dt>Straßen, Flüsse, Autobahnen</dt>
          <dd>{'©\u00a0OpenStreetMap-Mitwirkende, Overture Maps Foundation (ODbL)'}</dd>
          <dt>Veedel-Grenzen</dt>
          <dd>Stadt Köln, Offene Daten Köln (Datenlizenz Deutschland Zero 2.0)</dd>
        </dl>
      </Section>

      <p class="set-foot">Ton, Karte und Spiel gelten nur für dieses Gerät.</p>
    </div>
  );
}
