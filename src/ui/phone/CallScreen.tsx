// Anrufe im Spiel-Handy (Auftrag 30): Klingelt ein Anruf (messages.call), füllt er den Bildschirm des Handys wie bei
// iOS: Porträt, Name, wer anruft, unten Ablehnen und Annehmen als große runde Tasten. Klingelton und Vibrieren laufen,
// solange es klingelt; das Sprachmodell der Figur lädt derweil schon (audio.prepareVoice). Angenommen kommt das
// Gespräch: Musik, Effekte und Geräusche sind aus (audio.setCall), die Figur spricht ihre Zeilen mit eigener Stimme
// (audio.speak, Sprachmodell Piper im Browser, abschaltbar oben rechts und in den Einstellungen), dazu erscheinen sie
// als Untertitel; ohne Stimme im Tempo wie Tippen. Lädt das Modell noch, steht das unter dem Namen. Antippen zeigt alles. Am Ende die Antworten. Was danach kommt (ihre Reaktion, eine Rückfrage wie Fietes
// "Übergibst du jetzt?"), gehört noch zum Gespräch und wird dort beantwortet. Ist nichts mehr offen, legt die Figur auf
// und der Bildschirm geht von selbst zu. Auflegen geht immer; alles bleibt als Chat beim Kontakt stehen.
// Ob es klingelt, steht im Spielzustand; welches Gespräch offen ist, in UiState.call.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { audio, type VoiceModelState } from '../../audio';
import { clock, contactVoice, type GameState, type Message, messages, type VoiceSpec } from '../../core';
import { Avatar, Button, Icon } from '../components';
import { haptic } from '../haptics';
import { useRuntime } from '../hooks';
import { useAudio } from '../useAudio';
import { CONTACT_KIND_LABELS, CONTACT_KIND_TONES, contactAvatar, lookOf } from './messagesModel';

/** So schnell erscheinen die Zeilen: wie Tippen, etwas langsamer als im Chat (man hört ja zu). */
export const lineMs = (text: string) => Math.min(3200, Math.max(1100, 600 + text.length * 30));

const RING_EVERY_MS = 2600;

/** Klingelton und Vibrieren, solange der Anruf klingelt. */
function useRingtone(ringingId: number | null, vibration: boolean): void {
  useEffect(() => {
    if (ringingId === null) return;
    const ring = () => {
      audio.play('ring');
      if (vibration) {
        try {
          navigator.vibrate?.([400, 200, 400]);
        } catch {
          // Nicht jedes Gerät kann vibrieren.
        }
      }
    };
    ring();
    const timer = setInterval(ring, RING_EVERY_MS);
    return () => clearInterval(timer);
  }, [ringingId, vibration]);
}

function IncomingCall(props: { message: Message; state: GameState }) {
  const { api, ui } = useRuntime();
  const m = props.message;
  const contact = messages.contact(props.state, m.contactId);
  const name = contact?.name ?? m.contactId;
  const kind = contact?.kind ?? 'other';
  useRingtone(m.id, ui.vibration);
  // Solange es klingelt, lädt das Sprachmodell der Figur (aus dem Cache in Sekunden, sonst einmalig als Download).
  const voice = useMemo(() => contactVoice(contact, m.contactId), [contact, m.contactId]);
  useEffect(() => audio.prepareVoice(voice), [voice.feminine]);
  const attempt = m.call?.attempt ?? 1;
  return (
    <section class="call-screen is-incoming" aria-label={`Anruf von ${name}`} role="alertdialog">
      <div class="call-screen__who">
        <p class="call-screen__kicker">{attempt > 1 ? `ruft wieder an (${attempt}. Versuch)` : 'ruft an …'}</p>
        <h2 class="call-screen__name">{name}</h2>
        <p class="call-screen__role">{m.text || contact?.role || CONTACT_KIND_LABELS[kind]}</p>
      </div>
      <div class="call-screen__avatar">
        <Avatar
          name={name}
          image={contactAvatar(contact?.avatar, kind)}
          look={lookOf(contact)}
          tone={CONTACT_KIND_TONES[kind]}
          size="xl"
        />
      </div>
      <div class="call-screen__actions">
        <span class="call-screen__action">
          <button
            type="button"
            class="call-button is-decline"
            aria-label="Ablehnen"
            onClick={() => {
              haptic('light');
              api.dispatch({ type: 'messages.declineCall', payload: { messageId: m.id } });
            }}
          >
            <Icon name="callEnd" />
          </button>
          <span>Ablehnen</span>
        </span>
        <span class="call-screen__action">
          <button
            type="button"
            class="call-button is-accept"
            aria-label="Annehmen"
            onClick={() => {
              haptic('success');
              // Safari spricht nur, wenn die Sprachausgabe einmal aus einem Tippen heraus gestartet wurde.
              audio.primeSpeech();
              if (api.dispatch({ type: 'messages.acceptCall', payload: { messageId: m.id } }).ok) api.openCall(m.id);
            }}
          >
            <Icon name="call" />
          </button>
          <span>Annehmen</span>
        </span>
      </div>
    </section>
  );
}

/** Ein Satz im Gespräch: Zeilen des Anrufs und alles, was danach im Chat kam (deine Antwort, seine Reaktion). */
interface TalkEntry {
  key: string;
  from: 'contact' | 'player';
  text: string;
  via?: string;
  time?: number;
}

/** So lange steht "Anruf beendet", bevor der Bildschirm zugeht. */
const HANG_UP_MS = 2400;
/** Kurze Pause zwischen zwei Sätzen der Figur. */
const PAUSE_MS = 280;

/**
 * Spricht die Sätze der Figur nacheinander (Stimme, sonst im Tempo wie Tippen). shown: wie viele Einträge schon zu
 * sehen sind; speaking: der letzte gezeigte Satz wird noch gesprochen. Deine Antworten erscheinen sofort.
 */
function useTalk(talk: TalkEntry[], voice: VoiceSpec) {
  const [shown, setShown] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const next = talk[shown];
  useEffect(() => {
    if (speaking || !next) return;
    const timer = setTimeout(
      () => {
        setShown(shown + 1);
        if (next.from === 'contact') setSpeaking(true);
      },
      next.from === 'player' ? 0 : shown === 0 ? 500 : PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [shown, speaking, next?.key]);
  useEffect(() => {
    if (!speaking) return;
    const line = talk[shown - 1];
    if (!line) {
      setSpeaking(false);
      return;
    }
    let active = true;
    const finish = () => {
      if (active) setSpeaking(false);
    };
    const stop = audio.speak(line.text, voice, finish);
    const timer = stop ? undefined : setTimeout(finish, lineMs(line.text));
    return () => {
      active = false;
      stop?.();
      clearTimeout(timer);
    };
  }, [speaking, shown]);
  /** Antippen: alles sofort zeigen, die Stimme verstummt. */
  const skip = () => {
    audio.stopSpeaking();
    setShown(talk.length);
    setSpeaking(false);
  };
  return { shown, speaking, done: shown >= talk.length && !speaking, skip };
}

/** Was unter dem Namen steht, solange das Sprachmodell noch lädt (sonst nichts). */
function voiceNote(state: VoiceModelState | null): string | null {
  if (state?.kind !== 'loading') return null;
  if (state.phase === 'init') return 'Stimme wird vorbereitet …';
  return `Stimme wird geladen … ${Math.round((state.loaded / Math.max(1, state.total)) * 100)} %`;
}

function ActiveCall(props: { message: Message; state: GameState }) {
  const { api } = useRuntime();
  const sound = useAudio().settings;
  const m = props.message;
  const contact = messages.contact(props.state, m.contactId);
  const name = contact?.name ?? m.contactId;
  const kind = contact?.kind ?? 'other';
  const voice = useMemo(() => contactVoice(contact, m.contactId), [contact, m.contactId]);
  const [seconds, setSeconds] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  // Was danach im Chat kam (deine Antwort, seine Reaktion, eine Rückfrage), gehört noch zum Gespräch.
  const after = messages.thread(props.state, m.contactId).filter((x) => x.id > m.id && !x.call);
  const talk: TalkEntry[] = [
    ...(m.call?.lines ?? []).map((text, i) => ({ key: `l${i}`, from: 'contact' as const, text })),
    ...after.map((x) => ({ key: `m${x.id}`, from: x.from, text: x.text, via: x.via, time: x.time })),
  ];
  const { shown, speaking, done, skip } = useTalk(talk, voice);
  const note = sound.voices && !sound.muted ? voiceNote(audio.voiceState(voice)) : null;
  // Offene Frage im Gespräch: die des Anrufs selbst oder eine Rückfrage danach (z.B. Fiete: "Übergibst du jetzt?").
  const question = done
    ? [m, ...after].filter((x) => x.from === 'contact' && messages.canAnswer(props.state, x)).pop()
    : undefined;
  // Nichts mehr zu sagen und nichts zu antworten: Die Figur legt auf, kurz danach geht der Bildschirm zu.
  const ended = done && !question;
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => api.endCall(), HANG_UP_MS);
    return () => clearTimeout(timer);
  }, [ended]);
  // Im Gespräch ist alles andere still; die Zeilen rechnet das Sprachmodell schon vor. Auflegen räumt auf.
  useEffect(() => {
    audio.setCall(true);
    audio.prepareSpeech(m.call?.lines ?? [], voice);
    return () => {
      audio.setCall(false);
      audio.stopSpeaking();
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [shown, !!question]);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const first = name.split(/[\s(]/)[0] || name;
  return (
    <section class="call-screen is-active" aria-label={`Gespräch mit ${name}`}>
      <header class="call-screen__bar">
        <span class={`call-screen__speaker ${speaking ? 'is-speaking' : ''}`}>
          <Avatar
            name={name}
            image={contactAvatar(contact?.avatar, kind)}
            look={lookOf(contact)}
            tone={CONTACT_KIND_TONES[kind]}
            size="md"
          />
        </span>
        <span class="call-screen__bar-text">
          <strong>{name}</strong>
          {ended ? (
            <span class="is-ended">{first} hat aufgelegt</span>
          ) : note ? (
            <span class="call-screen__note">
              <Icon name="download" /> {note}
            </span>
          ) : (
            <span>
              <Icon name="call" /> {duration}
            </span>
          )}
        </span>
        <button
          type="button"
          class={`call-screen__voice ${sound.voices ? 'is-on' : ''}`}
          aria-pressed={sound.voices}
          aria-label={sound.voices ? 'Stimme aus (nur Untertitel)' : 'Stimme an'}
          title={sound.voices ? 'Stimme aus (nur Untertitel)' : 'Stimme an'}
          onClick={() => {
            haptic('selection');
            if (sound.voices) audio.stopSpeaking();
            audio.update({ voices: !sound.voices });
          }}
        >
          <Icon name={sound.voices && !sound.muted ? 'volume' : 'volumeOff'} />
        </button>
      </header>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Antippen überspringt nur das Tempo, alles ist auch so lesbar */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: siehe oben */}
      <div class="call-screen__talk" onClick={done ? undefined : skip}>
        <ol class={`msg-bubbles msg-bubbles--${kind}`}>
          {talk.slice(0, shown).map((x, i) => (
            <li
              key={x.key}
              class={`msg-bubble msg-bubble--${x.from} ${speaking && i === shown - 1 ? 'is-speaking' : ''}`}
            >
              {x.via && <small class="msg-via">{x.via}</small>}
              <p>{x.text}</p>
              {x.time !== undefined && <time>{clock.formatTime(x.time)}</time>}
            </li>
          ))}
          {shown === 0 && (
            <li class="msg-bubble msg-bubble--contact msg-typing" aria-label={`${name} spricht`}>
              <span />
              <span />
              <span />
            </li>
          )}
        </ol>
        {!done && <p class="call-screen__skip">Antippen, um alles zu lesen</p>}
        {ended && <p class="call-screen__skip">Das Gespräch steht im Chat.</p>}
        <div ref={bottom} />
      </div>
      <footer class="call-screen__footer">
        {question && (
          <div class="msg-options">
            {(question.options ?? []).map((o, i) => (
              <Button
                key={o.id}
                wide
                big
                variant={i === 0 ? 'primary' : 'default'}
                onClick={() =>
                  api.dispatch({ type: 'messages.answer', payload: { messageId: question.id, optionId: o.id } })
                }
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}
        <span class="call-screen__action">
          <button
            type="button"
            class="call-button is-decline"
            aria-label="Auflegen"
            onClick={() => {
              haptic('light');
              audio.stopSpeaking();
              api.endCall();
            }}
          >
            <Icon name="callEnd" />
          </button>
          <span>Auflegen</span>
        </span>
      </footer>
    </section>
  );
}

/** Anruf über dem Bildschirm des Handys: klingelnd oder im Gespräch. Sonst nichts. */
export function CallScreen(props: { state: GameState }) {
  const { ui, api } = useRuntime();
  const ringing = messages.ringingCalls(props.state)[0];
  const activeId = ui.call?.messageId ?? null;
  const active = activeId !== null ? messages.get(props.state, activeId) : undefined;
  // Das Gespräch gibt es nicht mehr (z.B. neues Spiel): auflegen.
  useEffect(() => {
    if (activeId !== null && active?.call?.state !== 'accepted') api.endCall();
  }, [activeId, active?.call?.state]);
  if (ringing && ringing.id !== activeId)
    return <IncomingCall key={ringing.id} message={ringing} state={props.state} />;
  if (active?.call?.state === 'accepted') return <ActiveCall key={active.id} message={active} state={props.state} />;
  return null;
}
