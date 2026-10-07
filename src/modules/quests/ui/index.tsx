// Oberfläche der Wochenverträge (Auftrag 32): Glas-Karte unter Geld und Heat (HUD, Platz 'below') mit dem laufenden
// Vertrag oder dem Hinweis auf die Angebote der Woche, und die Seite „Wochenverträge“ im Handy (Angebote mit Annehmen,
// laufender Vertrag, die letzten Ergebnisse). Auftrag 46d: Peters Quest-Karte und die Seite „Alle Quests“ sind weg.

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
  registerHudItem,
  registerPanel,
  registerSearch,
  soundOnEvent,
  useGame,
  useUi,
} from '../../../ui';
import {
  activeContract,
  type ContractOffer,
  canAcceptContract,
  contractHistory,
  contractOffers,
  contractProgress,
  contractsOpen,
  getContractContact,
  getContractTemplate,
  rewardText,
} from '../index';
import './quests.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'quests.contracts': Record<string, never>;
  }
}

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
        class="contract-hud contract-hud--mini"
        onClick={() => ui.openPanel('quests.contracts', {})}
        aria-label="Wochenverträge ansehen"
      >
        <Icon name="handshake" />
        <span class="contract-hud__mini-title">
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
    <section class="contract-hud" aria-label="Wochenvertrag">
      <header class="contract-hud__head">
        <span class="hud-label is-contract">Vertrag · {contact?.name.split(' (')[0] ?? ''}</span>
        <span class="contract-hud__count">{deadlineText(state, active.deadline)}</span>
      </header>
      <button type="button" class="contract-hud__main" onClick={() => ui.openPanel('quests.contracts', {})}>
        <IconChip icon={template?.icon ?? 'handshake'} color="money" size="md" />
        <span class="contract-hud__text">
          <strong class="contract-hud__title">{active.title}</strong>
        </span>
        <Icon name="chevronRight" class="contract-hud__go" />
      </button>
      <div class="contract-hud__progress">
        <span
          class="contract-hud__bar"
          role="progressbar"
          aria-valuenow={Math.round(share * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span class="contract-hud__fill" style={{ width: `${Math.min(100, share * 100)}%` }} />
        </span>
        <span class="contract-hud__count">{progressText(active, now, target)}</span>
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
  const allowed = canAcceptContract(state, offer);
  return (
    <ListItem value={props.active ? progressText(offer, now, target) : undefined}>
      <span class="contract-row">
        <Avatar name={contact?.name ?? ''} look={contactLook(contact)} size="sm" />
        <span class="contract-row__main">
          <strong class="contract-row__title">{offer.title}</strong>
          <Chips
            items={[
              { label: contact?.name ?? '', icon: 'user', color: 'people' },
              { label: deadlineText(state, offer.deadline), icon: 'clock' },
            ]}
          />
          <Chips items={offer.rewards.map((r) => ({ label: rewardText(r), icon: 'gift', color: 'money' as const }))} />
          {!props.active && (
            <Button
              small
              variant="primary"
              disabled={!allowed.ok}
              onClick={() => dispatch({ type: 'quests.acceptContract', payload: { offerId: offer.id } })}
            >
              Annehmen
            </Button>
          )}
          {!props.active && !allowed.ok && <span class="contract-row__meta">{allowed.reason}</span>}
        </span>
      </span>
    </ListItem>
  );
}

/** Seite „Wochenverträge“ im Handy. */
function ContractsPage() {
  const { state } = useGame();
  const active = activeContract(state);
  const offers = contractOffers(state);
  const history = contractHistory(state);
  return (
    <div class="contract-list">
      <Group
        title="Wochenverträge"
        icon="handshake"
        color="money"
        value={active ? 'läuft' : offers.length > 0 ? `${offers.length} Angebote` : undefined}
        note={
          active || offers.length > 0
            ? 'Einer pro Woche, Frist Sonntag 23:59.'
            : contractsOpen(state)
              ? 'Jeden Montag um 8 Uhr kommen drei neue Angebote.'
              : 'Angebote kommen, sobald Köln dir ganz gehört oder du in einer anderen Stadt bist.'
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
    </div>
  );
}

registerPanel({ id: 'quests.contracts', title: () => 'Wochenverträge', component: ContractsPage });
registerSearch({
  id: 'quests.search',
  label: 'Verträge',
  order: 5,
  items: (state) => {
    if (!contractsOpen(state)) return [];
    const active = activeContract(state);
    return [
      {
        id: 'quests.contracts',
        title: 'Wochenverträge',
        subtitle: active ? `Läuft: ${active.title}` : 'Angebote und Ergebnisse',
        icon: 'handshake',
        keywords: 'Vertrag Woche Angebot Belohnung',
        run: (ui) => ui.openPanel('quests.contracts', {}),
      },
    ];
  },
});

// Das Journal hat den Eintrag (das Modul schreibt ihn selbst), hier nur der Ton zum erfüllten Vertrag.
soundOnEvent('contract.finished', 'success', { when: (p) => p.result === 'done' });
