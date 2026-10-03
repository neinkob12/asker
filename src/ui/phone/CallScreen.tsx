// Anrufe im Spiel-Handy (Auftrag 30): Klingelt ein Anruf (messages.call), füllt er den Bildschirm des Handys wie bei
// iOS: Avatar, Name, wer anruft, unten Ablehnen und Annehmen als große runde Tasten. Klingelton und Vibrieren laufen,
// solange es klingelt. Angenommen kommt das Gespräch: Die Zeilen erscheinen nacheinander als Sprechblasen (Tempo wie
// Tippen, Antippen zeigt alles), am Ende die Antworten. Auflegen lässt alles als Chat beim Kontakt stehen.
// Ob es klingelt, steht im Spielzustand; welches Gespräch offen ist, in UiState.call.

import { useEffect, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio';
import { clock, type GameState, type Message, messages } from '../../core';
import { Avatar, Button, Icon } from '../components';
import { haptic } from '../haptics';
import { useRuntime } from '../hooks';
import { CONTACT_KIND_LABELS, CONTACT_KIND_TONES, contactAvatar } from './messagesModel';

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
  const attempt = m.call?.attempt ?? 1;
  return (
    <section class="call-screen is-incoming" aria-label={`Anruf von ${name}`} role="alertdialog">
      <div class="call-screen__who">
        <p class="call-screen__kicker">{attempt > 1 ? `ruft wieder an (${attempt}. Versuch)` : 'ruft an …'}</p>
        <h2 class="call-screen__name">{name}</h2>
        <p class="call-screen__role">{m.text || CONTACT_KIND_LABELS[kind]}</p>
      </div>
      <div class="call-screen__avatar">
        <Avatar name={name} image={contactAvatar(contact?.avatar, kind)} tone={CONTACT_KIND_TONES[kind]} size="lg" />
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

function ActiveCall(props: { message: Message; state: GameState }) {
  const { api } = useRuntime();
  const m = props.message;
  const contact = messages.contact(props.state, m.contactId);
  const name = contact?.name ?? m.contactId;
  const kind = contact?.kind ?? 'other';
  const lines = m.call?.lines ?? [];
  const [shown, setShown] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const done = shown >= lines.length;
  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setShown((n) => n + 1), lineMs(lines[shown] ?? ''));
    return () => clearTimeout(timer);
  }, [shown, done]);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  // Was danach im Chat kam (deine Antwort, seine Reaktion), gehört noch zum Gespräch.
  const after = messages.thread(props.state, m.contactId).filter((x) => x.id > m.id && !x.call);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [shown, after.length]);
  const answerable = done && messages.canAnswer(props.state, m);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <section class="call-screen is-active" aria-label={`Gespräch mit ${name}`}>
      <header class="call-screen__bar">
        <Avatar name={name} image={contactAvatar(contact?.avatar, kind)} tone={CONTACT_KIND_TONES[kind]} size="sm" />
        <span class="call-screen__bar-text">
          <strong>{name}</strong>
          <span>
            <Icon name="call" /> {duration}
          </span>
        </span>
      </header>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Antippen überspringt nur das Tempo, alles ist auch so lesbar */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: siehe oben */}
      <div class="call-screen__talk" onClick={() => setShown(lines.length)}>
        <ol class={`msg-bubbles msg-bubbles--${kind}`}>
          {lines.slice(0, shown).map((line, i) => (
            <li key={`l${i}`} class="msg-bubble msg-bubble--contact">
              <p>{line}</p>
            </li>
          ))}
          {!done && (
            <li class="msg-bubble msg-bubble--contact msg-typing" aria-label={`${name} spricht`}>
              <span />
              <span />
              <span />
            </li>
          )}
          {done &&
            after.map((x) => (
              <li key={x.id} class={`msg-bubble msg-bubble--${x.from}`}>
                {x.via && <small class="msg-via">{x.via}</small>}
                <p>{x.text}</p>
                <time>{clock.formatTime(x.time)}</time>
              </li>
            ))}
        </ol>
        {!done && <p class="call-screen__skip">Antippen, um alles zu hören</p>}
        <div ref={bottom} />
      </div>
      <footer class="call-screen__footer">
        {answerable && (
          <div class="msg-options">
            {(m.options ?? []).map((o, i) => (
              <Button
                key={o.id}
                wide
                big
                variant={i === 0 ? 'primary' : 'default'}
                onClick={() => api.dispatch({ type: 'messages.answer', payload: { messageId: m.id, optionId: o.id } })}
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
