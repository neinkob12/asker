// Musik-App: was gerade läuft, Stimmung nach Tageszeit, weiter, Musik an/aus, Lautstärke.

import { MUSIC_MOOD_NAMES } from '../../audio';
import { Button, Card, Empty, Icon, ProgressBar, Slider, Tag } from '../components';
import { useAudio } from '../useAudio';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;

export function MusicApp() {
  const audio = useAudio();
  const now = audio.nowPlaying();
  const s = audio.settings;
  return (
    <div class="music-app">
      <div class="music-app__cover" aria-hidden="true">
        <Icon name="music" />
      </div>
      {now ? (
        <div class="music-app__now">
          <strong>{now.track.title}</strong>
          <span>
            {now.track.moods.map((m) => (
              <Tag key={m} tone={m === audio.mood ? 'accent' : 'muted'}>
                {MUSIC_MOOD_NAMES[m]}
              </Tag>
            ))}
          </span>
          <ProgressBar value={now.elapsed / now.duration} label="Fortschritt" />
          <span class="music-app__time">
            {duration(Math.min(now.elapsed, now.duration))} / {duration(now.duration)}
          </span>
        </div>
      ) : (
        <Empty icon={audio.status === 'locked' ? 'lock' : 'music'}>
          {audio.status === 'locked'
            ? 'Die Musik startet nach dem ersten Klick.'
            : audio.status === 'unsupported'
              ? 'Dieser Browser kann keinen Ton abspielen.'
              : 'Musik ist aus.'}
        </Empty>
      )}
      <div class="music-app__controls">
        <Button
          icon={s.musicOn ? 'pause' : 'play'}
          onClick={() => audio.update({ musicOn: !s.musicOn })}
          aria-label={s.musicOn ? 'Musik aus' : 'Musik an'}
        >
          {s.musicOn ? 'Aus' : 'An'}
        </Button>
        <Button icon="skip" onClick={() => audio.next()} disabled={!s.musicOn || !now}>
          Weiter
        </Button>
        <Button
          icon={s.muted ? 'volumeOff' : 'volume'}
          active={s.muted}
          onClick={() => audio.toggleMute()}
          aria-label={s.muted ? 'Ton an' : 'Stumm'}
        >
          {s.muted ? 'Stumm' : 'Ton'}
        </Button>
      </div>
      <Slider label="Musik" icon="music" value={s.music} onChange={(v) => audio.update({ music: v })} />
      <Card title={`Stimmung jetzt: ${MUSIC_MOOD_NAMES[audio.mood]}`} icon="clock">
        <p class="ui-hint">
          Die Playlist folgt der Tageszeit: ruhig und düster in der Nacht, wärmer am Tag. Alle Stücke sind im Spiel
          selbst erzeugt.
        </p>
        <ul class="music-app__list">
          {audio.tracks.map((t) => (
            <li key={t.id} class={now?.track.id === t.id ? 'is-playing' : ''}>
              <Icon name={now?.track.id === t.id ? 'play' : 'music'} />
              <span>{t.title}</span>
              <span class="music-app__moods">{t.moods.map((m) => MUSIC_MOOD_NAMES[m]).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
