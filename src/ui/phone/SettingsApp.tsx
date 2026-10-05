// Einstellungen: eine App mit Abschnitten. "Ton & Musik" (Lautstärken, Musik, kleiner Player), "Karte" (Overlay,
// Kamera, Verkehr), die Abschnitte der Module aus dem Slot 'core.settings' (z.B. Wetter mit Vorhersage, Anfragen der Kunden),
// "Verlauf" (Ereignisse, Meldungen, Aufträge, Spielstand exportieren) und "Spiel" (Vibration, Spielstände). Musik
// ist keine eigene App mehr: Sie ist eine Einstellung mit Player. Ton, Karte und Spiel gelten nur für dieses Gerät.
// Aufbau wie iOS-Einstellungen: Abschnittskopf mit Symbol, eingerückte Gruppe, Schalter und Regler in den Zeilen.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { formatMegabytes, MUSIC_MOOD_NAMES, type PiperVoice, type VoiceModelState } from '../../audio';
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
import { top } from './navModel';
import { usePage } from './page';

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

/** Stand eines Sprachmodells in einem Satz. */
function voiceStateText(state: VoiceModelState, voice: PiperVoice): string {
  const size = formatMegabytes(voice.bytes);
  switch (state.kind) {
    case 'ready':
      return `Bereit · ${size} auf diesem Gerät`;
    case 'loading':
      return state.phase === 'init'
        ? 'Wird vorbereitet …'
        : `Lädt … ${Math.round((state.loaded / Math.max(1, state.total)) * 100)} % von ${size}`;
    case 'error':
      return state.message;
    default:
      return state.cached ? `${size} auf diesem Gerät` : `Nicht geladen · ${size}, einmalig von Hugging Face`;
  }
}

/** Die Sprachmodelle (eine Männer-, eine Frauenstimme): Stand, Laden, Entfernen. */
function VoiceModels() {
  const audio = useAudio();
  const models = audio.voiceModels;
  if (models.length === 0)
    return (
      <p class="set-voices__note">
        Dieser Browser kann das Sprachmodell nicht ausführen. Anrufe nutzen die Sprachausgabe des Browsers.
      </p>
    );
  return (
    <div class="set-voices">
      {models.map(({ voice, state }) => {
        const onDevice = state.kind === 'ready' || (state.kind === 'idle' && state.cached === true);
        return (
          <div key={voice.id} class="set-voice">
            <div class="set-voice__text">
              <span class="set-voice__label">
                {voice.feminine ? 'Frauenstimme' : 'Männerstimme'} „{voice.name}“
              </span>
              <span class={`set-voice__hint ${state.kind === 'error' ? 'is-bad' : ''}`}>
                {voiceStateText(state, voice)}
              </span>
              {state.kind === 'loading' && (
                <ProgressBar value={state.loaded / Math.max(1, state.total)} label={`${voice.name} lädt`} />
              )}
            </div>
            {state.kind === 'loading' ? null : onDevice ? (
              <Button small icon="trash" onClick={() => audio.removeVoiceModel(voice.id)}>
                Entfernen
              </Button>
            ) : (
              <Button small icon="download" onClick={() => audio.loadVoiceModel(voice.id)}>
                {state.kind === 'error' ? 'Noch mal' : 'Laden'}
              </Button>
            )}
          </div>
        );
      })}
      <p class="set-voices__note">
        Die Stimmen rechnet das Sprachmodell Piper auf diesem Gerät; die Modelle kommen einmalig von Hugging Face und
        bleiben im Browser. Beim ersten Anruf laden sie von selbst (nicht im Datensparmodus).
      </p>
    </div>
  );
}

function Player() {
  const audio = useAudio();
  const s = audio.settings;
  // Die Musik läuft auch bei Pause weiter, das Spiel zeichnet dann aber nicht neu: Zeit und Balken sekündlich nachziehen.
  // Nur, solange die Seite zu sehen ist (Handy offen, Einstellungen oben auf dem Stapel, Musik an): Verdeckt oder
  // weggelegt wäre das ein Neuzeichnen pro Sekunde für nichts.
  const [, tick] = useState(0);
  const { ui } = useRuntime();
  const page = usePage();
  const visible = ui.phone.open && (!page || top(ui.phone.stack).key === page.entry.key) && s.musicOn;
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [visible]);
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
        <Toggle
          label="Stimmen im Anruf"
          hint={
            audio.canSpeakAtAll
              ? 'Figuren sprechen am Telefon mit eigener Stimme; im Gespräch ist alles andere still. Aus: nur Untertitel.'
              : 'Dieser Browser hat keine Sprachausgabe, Anrufe laufen mit Untertiteln.'
          }
          checked={s.voices}
          onChange={(on) => {
            if (!on) audio.stopSpeaking();
            audio.update({ voices: on });
          }}
          disabled={s.muted}
        />
        {s.voices && !s.muted && <VoiceModels />}
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
          label="Ruhiger Modus"
          hint="Banner nur für Schlimmes (Razzia, Festnahme), höchstens eins alle 15 Sekunden. Alles andere bleibt im Verlauf und am Badge."
          checked={ui.state.quietNotifications}
          onChange={ui.setQuietNotifications}
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
          <dt>Stadtteile Hamburg und Berlin</dt>
          <dd>{'©\u00a0OpenStreetMap-Mitwirkende, Overture Maps Foundation (ODbL)'}</dd>
          <dt>Stimmen</dt>
          <dd>
            Piper (Rhasspy, MIT) mit espeak-ng (GPL-3.0) und ONNX Runtime (Microsoft, MIT); Stimme „Thorsten“ aus
            Thorsten-Voice (CC0), Stimme „Kerstin“ aus Piper Voices (Hugging Face)
          </dd>
        </dl>
      </Section>

      <p class="set-foot">Ton, Karte und Spiel gelten nur für dieses Gerät.</p>
    </div>
  );
}
