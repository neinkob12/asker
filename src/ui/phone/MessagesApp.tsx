// Einfache Nachrichten-App auf Basis des Nachrichtendienstes im Kern. Auftrag 14 baut die richtige App.

import { useEffect, useState } from 'preact/hooks';
import { clock, messages } from '../../core';
import { Badge, Button, Empty } from '../components';
import { useGame } from '../hooks';

export function MessagesApp() {
  const { state, dispatch } = useGame();
  const [contactId, setContactId] = useState<string | null>(null);
  const unreadInThread = contactId ? messages.unreadCount(state, contactId) : 0;

  useEffect(() => {
    if (contactId && unreadInThread > 0) dispatch({ type: 'messages.markRead', payload: { contactId } });
  }, [contactId, unreadInThread, dispatch]);

  if (!contactId) {
    const threads = messages.threads(state);
    return (
      <div class="msg">
        <h3 class="msg__title">Nachrichten</h3>
        {threads.length === 0 && <Empty>Noch keine Nachrichten.</Empty>}
        <ul class="msg__threads">
          {threads.map((t) => (
            <li key={t.contact.id}>
              <button type="button" class="msg__thread" onClick={() => setContactId(t.contact.id)}>
                <strong>
                  {t.contact.name}
                  <Badge count={t.unread} />
                </strong>
                <span>{t.last.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const contact = messages.contact(state, contactId);
  return (
    <div class="msg">
      <div class="msg__head">
        <Button small variant="subtle" onClick={() => setContactId(null)}>
          ‹
        </Button>
        <h3 class="msg__title">{contact?.name ?? contactId}</h3>
      </div>
      <ol class="msg__bubbles">
        {messages.thread(state, contactId).map((m) => (
          <li key={m.id} class={`msg__bubble msg__bubble--${m.from}`}>
            <p>{m.text}</p>
            <time>{clock.formatTime(m.time)}</time>
            {messages.canAnswer(state, m) && (
              <div class="msg__options">
                {m.options?.map((o) => (
                  <Button
                    key={o.id}
                    small
                    onClick={() => dispatch({ type: 'messages.answer', payload: { messageId: m.id, optionId: o.id } })}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            )}
            {m.expired && !m.answer && <em class="msg__expired">Keine Antwort mehr möglich.</em>}
          </li>
        ))}
      </ol>
    </div>
  );
}
