// Profil einer Figur im Handy (Seite 'core.contact', aus dem Kopf eines Chats): großes Porträt, Name, wer das ist,
// ein paar Sätze über die Person, ihr Aussehen als Chips und "Stimme anhören" (so klingt sie im Anruf).
// Gangs und Ticker haben kein Gesicht, dort steht das Wappen bzw. Symbol.

import { useEffect, useState } from 'preact/hooks';
import { audio } from '../../audio';
import { contactVoice, lookTraits, messages } from '../../core';
import { Avatar, Button, Chip, Chips, Empty, Group } from '../components';
import { useGame, useUi } from '../hooks';
import { registerPanel } from '../registry';
import { CONTACT_KIND_ICONS, CONTACT_KIND_LABELS, CONTACT_KIND_TONES, contactAvatar, lookOf } from './messagesModel';

declare module '../registry' {
  interface PanelRegistry {
    /** Profil einer Figur aus den Nachrichten. */
    'core.contact': { contactId: string };
  }
}

/** Was die Figur zum Anhören sagt: ihre letzte Nachricht an dich, sonst ein Gruß. */
function sampleLine(contactId: string, name: string, lastText: string | undefined): string {
  if (lastText && lastText.length <= 160) return lastText;
  const first = name.split(/[\s(]/)[0] || name;
  return contactId.startsWith('gang:')
    ? `Hier spricht ${name}. Wir sollten reden.`
    : `Hallo, ${first} hier. Melde dich.`;
}

function ContactProfile(props: { contactId: string }) {
  const { state } = useGame();
  const ui = useUi();
  const [speaking, setSpeaking] = useState(false);
  const contact = messages.contact(state, props.contactId);
  useEffect(() => () => audio.stopSpeaking(), []);
  if (!contact) return <Empty icon="user">Diesen Kontakt gibt es nicht mehr.</Empty>;
  const look = lookOf(contact);
  const kind = contact.kind;
  const role = contact.role ?? CONTACT_KIND_LABELS[kind];
  const last = [...messages.thread(state, contact.id)].reverse().find((m) => m.from === 'contact' && !m.call);
  const listen = () => {
    if (speaking) {
      audio.stopSpeaking();
      setSpeaking(false);
      return;
    }
    const stop = audio.speak(sampleLine(contact.id, contact.name, last?.text), contactVoice(contact), () =>
      setSpeaking(false),
    );
    if (stop) setSpeaking(true);
    else ui.toast('Stimmen sind aus oder der Browser kann nicht sprechen (Einstellungen › Ton).', 'info');
  };
  return (
    <div class="contact-profile">
      <div class="contact-profile__head">
        <Avatar
          name={contact.name}
          image={contactAvatar(contact.avatar, kind)}
          look={look}
          tone={CONTACT_KIND_TONES[kind]}
          size="xl"
        />
        <h2 class="contact-profile__name">{contact.name}</h2>
        <Chips>
          <Chip color={CONTACT_KIND_TONES[kind]} icon={CONTACT_KIND_ICONS[kind]}>
            {role}
          </Chip>
        </Chips>
      </div>
      {contact.about && (
        <Group title="Über" icon="user" color={CONTACT_KIND_TONES[kind]}>
          <p class="contact-profile__about">{contact.about}</p>
        </Group>
      )}
      {look && (
        <Group title="Aussehen" icon="eye" color="people">
          <Chips>
            {lookTraits(look).map((trait) => (
              <Chip key={trait}>{trait}</Chip>
            ))}
          </Chips>
        </Group>
      )}
      <div class="contact-profile__actions">
        <Button icon={speaking ? 'pause' : 'volume'} onClick={listen}>
          {speaking ? 'Stopp' : 'Stimme anhören'}
        </Button>
      </div>
    </div>
  );
}

export function registerContactProfile(): void {
  registerPanel({
    id: 'core.contact',
    title: () => 'Profil',
    component: ContactProfile,
  });
}
