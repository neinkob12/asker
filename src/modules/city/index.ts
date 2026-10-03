// Städte (Auftrag 30). Köln ist der Einstieg; wer Köln komplett übernimmt, bekommt einen Anruf aus dem Hamburger
// Hafen (Fiete Lührs): Er sucht jemanden mit Format für große Mengen am Kai. Um Köln zu verlassen, braucht es eine
// Rechte Hand mit voller Macht (hierarchy.fullPowerMissing, Etappe 3).
//
// Ablauf des Angebots (offer.status):
//   none → scheduled (30 Spielminuten nach "Köln komplett", nicht während einer Konfrontation) → calling (Anruf, siehe
//   messages.call) → Antwort über 'city.answerOffer':
//     come:  Rechte Hand bereit → accepted (Ereignis city.offerAccepted, die Oberfläche öffnet die Übergabe).
//            Sonst → house: Er schreibt, was fehlt, und ruft von selbst wieder an, sobald es passt.
//     later: Er meldet sich alle OFFER_REMINDER_DAYS Spieltage per Chat (mit denselben Antworten).
//     stay:  Endlosmodus; er schreibt einmal, dass das Angebot steht (zusagen geht über seinen Chat).
//
// Öffentliche API: offerStatus(state), hamburgMissing(state), HARBOR_CALLER
// Befehle: 'city.answerOffer'
// Ereignisse: 'city.offerAnswered', 'city.offerAccepted'

import {
  type CommandResult,
  type Ctx,
  clock,
  defineModule,
  type GameState,
  journal,
  MINUTES_PER_DAY,
  messages,
} from '../../core';
import { activeEncounters } from '../encounters';
import { fullPowerMissing } from '../hierarchy';
import { campaignProgress } from '../territory';
import { HARBOR_CALLER, OFFER_CALL_DELAY, OFFER_LINES, OFFER_REMINDER_DAYS, OFFER_TEXTS } from './config';

export { HARBOR_CALLER, OFFER_LINES } from './config';

export type OfferStatus = 'none' | 'scheduled' | 'calling' | 'house' | 'later' | 'declined' | 'accepted';
export type OfferChoice = 'come' | 'later' | 'stay';

export interface OfferState {
  status: OfferStatus;
  /** Wann er (wieder) anruft ('scheduled'). */
  callAt: number | null;
  /** Nächste Erinnerung per Chat ('later'). */
  remindAt: number | null;
}

export interface CityState {
  /** Das Angebot aus Hamburg. */
  offer: OfferState;
}

declare module '../../core' {
  interface ModuleStates {
    city: CityState;
  }
  interface GameCommands {
    /** Antwort auf Fietes Angebot (aus dem Anruf oder seinem Chat). Chefsache. */
    'city.answerOffer': { choice: OfferChoice };
  }
  interface GameEvents {
    'city.offerAnswered': { choice: OfferChoice; ready: boolean };
    /** Zusage mit bereiter Rechter Hand: Die Übergabe von Köln kann beginnen. */
    'city.offerAccepted': Record<string, never>;
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen

export function offerStatus(state: GameState): OfferStatus {
  return state.modules.city.offer.status;
}

/** Was fehlt, damit du Köln deiner Rechten Hand übergeben und nach Hamburg gehen kannst (leer = nichts). */
export function hamburgMissing(state: GameState): string[] {
  return fullPowerMissing(state, 'koeln');
}

// ---------------------------------------------------------------------------------------------
// Schreiben

const OPTIONS = {
  come: { id: 'come', label: 'Ich komme nach Hamburg', reply: 'Ich komme nach Hamburg.' },
  later: { id: 'later', label: 'Ich brauch noch Zeit', reply: 'Ich brauch noch Zeit.' },
  stay: { id: 'stay', label: 'Köln reicht mir', reply: 'Köln reicht mir.' },
  comeAfterAll: { id: 'come', label: 'Ich komme doch nach Hamburg', reply: 'Ich komme doch nach Hamburg.' },
} as const;

function option(key: keyof typeof OPTIONS, choice: OfferChoice) {
  return { ...OPTIONS[key], command: { type: 'city.answerOffer' as const, payload: { choice } } };
}

function tell(ctx: Ctx, text: string, withOptions?: 'all' | 'comeOnly'): void {
  const options =
    withOptions === 'all'
      ? [option('come', 'come'), option('later', 'later'), option('stay', 'stay')]
      : withOptions === 'comeOnly'
        ? [option('comeAfterAll', 'come')]
        : undefined;
  messages.send(ctx, { contact: HARBOR_CALLER, text, ...(options ? { options } : {}) });
}

/** Offene Fragen von Fiete erledigen sich, sobald eine Antwort gefallen ist (egal in welchem Chat-Eintrag). */
function retractOpenQuestions(ctx: Ctx): void {
  messages.retractWhere(ctx, (m) => m.contactId === HARBOR_CALLER.id);
}

function placeCall(ctx: Ctx): void {
  const offer = ctx.state.modules.city.offer;
  offer.status = 'calling';
  offer.callAt = null;
  messages.call(ctx, {
    contact: HARBOR_CALLER,
    lines: [...OFFER_LINES],
    options: [option('come', 'come'), option('later', 'later'), option('stay', 'stay')],
    summary: OFFER_TEXTS.summary,
    missedText: OFFER_TEXTS.missed,
    gaveUpText: OFFER_TEXTS.gaveUp,
  });
  journal.add(ctx, 'Anruf aus dem Hamburger Hafen.', 'info');
}

export function answerOffer(ctx: Ctx, choice: OfferChoice): CommandResult {
  const offer = ctx.state.modules.city.offer;
  if (offer.status === 'none' || offer.status === 'scheduled') return { ok: false, reason: 'Es gibt kein Angebot.' };
  if (offer.status === 'accepted') return { ok: true };
  retractOpenQuestions(ctx);
  const ready = choice === 'come' && hamburgMissing(ctx.state).length === 0;
  ctx.emit('city.offerAnswered', { choice, ready });
  if (choice === 'come') {
    if (ready) {
      offer.status = 'accepted';
      offer.remindAt = null;
      tell(ctx, OFFER_TEXTS.ready);
      journal.add(ctx, 'Du hast Fiete zugesagt: Hamburg. Jetzt die Übergabe in Köln regeln.', 'good');
      ctx.emit('city.offerAccepted', {});
    } else {
      offer.status = 'house';
      offer.remindAt = null;
      tell(ctx, OFFER_TEXTS.notReady);
      tell(
        ctx,
        `Was mir fehlt:\n${hamburgMissing(ctx.state)
          .map((line) => `– ${line}`)
          .join('\n')}`,
      );
    }
  } else if (choice === 'later') {
    offer.status = 'later';
    offer.remindAt = ctx.now + OFFER_REMINDER_DAYS * MINUTES_PER_DAY;
    tell(ctx, OFFER_TEXTS.later);
  } else {
    offer.status = 'declined';
    offer.remindAt = null;
    tell(ctx, OFFER_TEXTS.stay, 'comeOnly');
  }
  return { ok: true };
}

/** Köln komplett: Er ruft OFFER_CALL_DELAY Spielminuten später an (einmal). */
function schedule(ctx: Ctx): void {
  const offer = ctx.state.modules.city.offer;
  if (offer.status !== 'none') return;
  offer.status = 'scheduled';
  offer.callAt = ctx.now + OFFER_CALL_DELAY;
}

function tick(ctx: Ctx): void {
  const state = ctx.state;
  const offer = state.modules.city.offer;
  // Alte Spielstände, die Köln schon komplett haben (ohne das Ereignis), kommen auch dran.
  if (offer.status === 'none' && campaignProgress(state, 'koeln').complete) schedule(ctx);
  if (offer.status === 'scheduled' && offer.callAt !== null && ctx.now >= offer.callAt) {
    // Nicht mitten in eine Konfrontation hinein: dann danach.
    if (activeEncounters(state).length === 0) placeCall(ctx);
  }
  if (offer.status === 'house' && clock.minute(ctx.now) === 0 && hamburgMissing(state).length === 0) {
    tell(ctx, OFFER_TEXTS.houseReady);
    offer.status = 'scheduled';
    offer.callAt = ctx.now + OFFER_CALL_DELAY;
  }
  if (offer.status === 'later' && offer.remindAt !== null && ctx.now >= offer.remindAt) {
    retractOpenQuestions(ctx);
    tell(ctx, OFFER_TEXTS.reminder, 'all');
    offer.remindAt = ctx.now + OFFER_REMINDER_DAYS * MINUTES_PER_DAY;
  }
}

export default defineModule({
  id: 'city',
  version: 1,
  dependsOn: ['territory', 'hierarchy'],
  init: () => ({ offer: { status: 'none', callAt: null, remindAt: null } }),
  tickEvery: 5,
  tick,
  commands: {
    'city.answerOffer': (ctx, { choice }) => answerOffer(ctx, choice),
  },
  on: {
    'campaign.won': (ctx, { cityId }) => {
      if ((cityId ?? 'koeln') === 'koeln') schedule(ctx);
    },
  },
});
