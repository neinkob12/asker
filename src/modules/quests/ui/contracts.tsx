// Oberfläche der Wochenverträge (Auftrag 32): Glas-Karte unter der Quest-Karte (HUD, Platz 'below') mit dem laufenden
// Vertrag oder dem Hinweis auf die Angebote der Woche, und der Abschnitt "Wochenverträge" auf der Seite "Alle Quests"
// (Angebote mit Annehmen, laufender Vertrag, die letzten Ergebnisse).

import { contactLook, type GameState } from '../../../core';
import {
  Avatar,
  Button,
  Chips,
  Group,
  Icon,
  IconChip,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerHudItem,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import {
  activeContract,
  type ContractOffer,
  contractHistory,
  contractOffers,
  contractProgress,
  getContractContact,
  getContractTemplate,
  rewardText,
} from '../index';

/** "noch 3 Tage" bzw. "noch 5 Std." bis zur Frist. */
export function deadlineText(state: GameState, deadline: number): string {
  const minutes = deadline - state.time;
  if (minutes <= 0) return 'abgelaufen';
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    return days === 1 ? 'noch 1 Tag' : `noch ${days} Tage`;
  }
  return `noch ${Math.max(1, Math.floor(minutes / 60))} Std.`;
}

function progressText(offer: ContractOffer, now: number, target: number): string {
  if (getContractTemplate(offer.templateId)?.euro) {
    return `${Math.floor(now).toLocaleString('de-DE')} / ${target.toLocaleString('de-DE')} €`;
  }
  return `${Math.floor(now)}/${target}`;
}

function ContractHud() {
  const { state } = useGame();
  const ui = useUi();
  const active = activeContract(state);
  const offers = contractOffers(state);
  if (!active) {
    if (offers.length === 0) return null;
    return (
      <button
        type="button"
        class="quest-hud quest-hud--mini quest-hud--contract"
        onClick={() => ui.openPanel('quests.list', {})}
        aria-label="Wochenverträge ansehen"
      >
        <Icon name="handshake" />
        <span class="quest-hud__mini-title">
          {offers.length === 1 ? 'Ein Vertrag angeboten' : `${offers.length} Verträge angeboten`}
        </span>
        <Icon name="chevronRight" />
      </button>
    );
  }
  const template = getContractTemplate(active.templateId);
  const contact = getContractContact(active.contactId);
  const [now, target] = contractProgress(state);
  const share = target > 0 ? now / target : 0;
  return (
    <section class="quest-hud quest-hud--contract" aria-label="Wochenvertrag">
      <header class="quest-hud__head">
        <span class="hud-label is-contract">Vertrag · {contact?.name.split(' (')[0] ?? ''}</span>
        <span class="quest-hud__count">{deadlineText(state, active.deadline)}</span>
      </header>
      <button type="button" class="quest-hud__main" onClick={() => ui.openPanel('quests.list', {})}>
        <IconChip icon={template?.icon ?? 'handshake'} color="money" size="md" />
        <span class="quest-hud__text">
          <strong class="quest-hud__title">{active.title}</strong>
        </span>
        <Icon name="chevronRight" class="quest-hud__go" />
      </button>
      <div class="quest-hud__progress">
        <span
          class="quest-hud__bar"
          role="progressbar"
          aria-valuenow={Math.round(share * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span class="quest-hud__fill" style={{ width: `${Math.min(100, share * 100)}%` }} />
        </span>
        <span class="quest-hud__count">{progressText(active, now, target)}</span>
      </div>
    </section>
  );
}

registerHudItem({ id: 'quests.contract', order: 41, placement: 'below', icon: 'handshake', component: ContractHud });

/**
 * Ein Angebot oder der laufende Vertrag als Zeile: Porträt der Figur, Titel, wer und wie lange, Belohnungen als Chips,
 * darunter "Annehmen" (bzw. der Stand).
 */
function OfferRow(props: { offer: ContractOffer; active?: boolean }) {
  const { state, dispatch } = useGame();
  const { offer } = props;
  const contact = getContractContact(offer.contactId);
  const [now, target] = props.active ? contractProgress(state) : [0, offer.target];
  return (
    <ListItem value={props.active ? progressText(offer, now, target) : undefined}>
      <span class="quest-contract">
        <Avatar name={contact?.name ?? ''} look={contactLook(contact)} size="sm" />
        <span class="quest-contract__main">
          <strong class="quest-contract__title">{offer.title}</strong>
          <span class="quest-contract__meta">
            {contact?.name ?? ''}, {deadlineText(state, offer.deadline)}
          </span>
          <Chips items={offer.rewards.map((r) => ({ label: rewardText(r), icon: 'gift', color: 'money' as const }))} />
          {!props.active && (
            <Button
              small
              variant="primary"
              onClick={() => dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } })}
            >
              Annehmen
            </Button>
          )}
        </span>
      </span>
    </ListItem>
  );
}

/** Abschnitt auf der Seite "Alle Quests". */
export function ContractsGroup() {
  const { state } = useGame();
  const active = activeContract(state);
  const offers = contractOffers(state);
  const history = contractHistory(state);
  return (
    <Group
      title="Wochenverträge"
      icon="handshake"
      color="money"
      value={active ? 'läuft' : offers.length > 0 ? `${offers.length} Angebote` : undefined}
      note={
        active || offers.length > 0
          ? 'Einer pro Woche, Frist Sonntag 23:59.'
          : 'Jeden Montag um 8 Uhr kommen drei neue Angebote.'
      }
    >
      <List>
        {active && <OfferRow offer={active} active />}
        {!active && offers.map((o) => <OfferRow key={o.id} offer={o} />)}
        {history.slice(0, 4).map((h) => (
          <ListItem key={`${h.templateId}-${h.at}`} value={h.result === 'done' ? 'erfüllt' : 'geplatzt'}>
            <ItemContent
              icon={h.result === 'done' ? 'checkCircle' : 'xCircle'}
              color={h.result === 'done' ? 'money' : 'danger'}
              title={h.title}
            />
          </ListItem>
        ))}
      </List>
    </Group>
  );
}

onGameEvent('contract.finished', 'quests.contractToast', (payload, ui) => {
  // Das Journal hat den Eintrag schon: Der Verlauf soll ihn nicht doppelt zeigen.
  if (payload.result === 'done') ui.toast('Vertrag erfüllt.', 'good', { urgent: true, icon: 'handshake', log: false });
  else ui.toast('Vertrag geplatzt: Die Frist ist vorbei.', 'warn', { log: false });
});
soundOnEvent('contract.finished', 'success', { when: (p) => p.result === 'done' });
