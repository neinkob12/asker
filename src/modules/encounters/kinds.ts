// Anlässe für Konfrontationen als reine Daten. Neuer Anlass = neuer Eintrag, sonst nichts.
// Platzhalter in Texten: {opponent} (Gegenseite), {place} (z.B. "am Ebertplatz"), {us} (dich / deine Leute),
// {stakeMoney} und {stakeGoods} (Einsatz aus der Anfrage).
// Welche Handlungen es gibt, steht in actions.ts. Folgen: siehe EncounterEffects in types.ts.

import type { EncounterKind } from './types';

export type { EncounterKind } from './types';

export const ENCOUNTER_KINDS: Record<string, EncounterKind> = {
  raidDefense: {
    name: 'Überfall abwehren',
    baseSuccess: 0.5,
    situation: '{opponent} tauchen {place} auf. Kapuzen, Baseballschläger. Sie wollen die Ware und die Kasse.',
    opponent: { label: 'Die Angreifer', strength: 50, count: [2, 4] },
    maxRounds: 5,
    joinable: true,
    actions: ['fight', 'intimidate', 'hold', 'negotiate', 'bribe', 'flee'],
    remoteActions: ['fight', 'hold', 'flee'],
    bribe: { base: 300, perOpponent: 150 },
    actionOverrides: {
      bribe: { label: 'Freikaufen', hint: 'Zahlen, damit sie abziehen. Das Geld ist in jedem Fall weg.' },
    },
    outcomes: {
      success: { influence: 2, reputation: 2, text: 'Überfall {place} abgewehrt. {opponent} ziehen ab.' },
      failure: {
        goods: [-25, -10],
        moneyShare: -0.1,
        moneyShareMax: 1000,
        influence: -3,
        opponentInfluence: 3,
        reputation: -3,
        text: '{opponent} haben dich {place} ausgenommen.',
      },
      retreat: { goods: [-12, -5], influence: -1, text: 'Rückzug {place}. Ein Teil der Ware ist weg.' },
    },
  },

  policeChase: {
    name: 'Polizeiflucht',
    baseSuccess: 0.6,
    situation: 'Blaulicht {place}. {opponent} will {us} kontrollieren. In den Taschen: Ware.',
    opponent: { label: 'Die Streife', strength: 55, count: 2 },
    maxRounds: 4,
    joinable: false,
    // Festnahme, Beschlagnahme und Heat regelt der Auslöser (police), hier nur was die Flucht selbst kostet.
    draw: 'failure',
    lethal: false,
    journal: false,
    actions: ['flee', 'dump', 'negotiate', 'bribe', 'fight'],
    remoteActions: ['flee', 'dump', 'negotiate'],
    bribe: { base: 500, perOpponent: 200 },
    actionOverrides: {
      flee: {
        hint: 'Tempo zählt. Wer entkommt, behält alles.',
        onSuccess: { resolve: 'success' },
      },
      dump: { onSuccess: { resolve: 'success' } },
      negotiate: { label: 'Rausreden', hint: 'Charisma zählt. Freundlich bleiben, nichts zugeben.' },
      fight: {
        base: 0.35,
        heat: 15,
        hint: 'Schlechte Idee. Gewalt gegen Polizei bringt viel Heat.',
      },
    },
    outcomes: {
      success: { text: 'Den Bullen {place} entkommen.' },
      failure: { reputation: -2, text: 'Gefasst {place}.' },
      retreat: { text: 'Mit Mühe {place} davongekommen.' },
    },
  },

  debtCollection: {
    name: 'Schulden eintreiben',
    baseSuccess: 0.6,
    situation: '{opponent} schuldet dir {stakeMoney}. Keine Lust zu zahlen. Treffpunkt {place}.',
    opponent: { label: 'Der Schuldner', strength: 35, count: 1 },
    maxRounds: 4,
    joinable: true,
    ifNobody: 'retreat',
    actions: ['intimidate', 'negotiate', 'fight', 'hold', 'flee'],
    remoteActions: ['negotiate', 'fight', 'flee'],
    actionOverrides: {
      flee: {
        label: 'Laufen lassen',
        hint: 'Abziehen. Kein Geld, aber auch kein Ärger.',
        base: 0.9,
      },
    },
    outcomes: {
      success: { stakeMoney: 1, reputation: 2, text: 'Schulden {place} eingetrieben.' },
      failure: {
        reputation: -3,
        text: 'Kein Geld {place}. Und alle haben gesehen, dass man dich nicht bezahlen muss.',
      },
      retreat: { reputation: -1, text: 'Laufen lassen {place}. Das spricht sich rum.' },
    },
  },

  dealGoneWrong: {
    name: 'Deal kippt',
    baseSuccess: 0.5,
    situation:
      'Übergabe {place}: {stakeGoods} gegen {stakeMoney}. Plötzlich blitzt ein Messer. {opponent} wollen beides.',
    opponent: { label: 'Die Geschäftspartner', strength: 50, count: [2, 3] },
    maxRounds: 5,
    joinable: true,
    ifNobody: 'retreat',
    actions: ['fight', 'intimidate', 'negotiate', 'hold', 'flee'],
    remoteActions: ['fight', 'negotiate', 'flee'],
    outcomes: {
      success: {
        stakeGoods: 1,
        reputation: 2,
        text: 'Deal {place} gerettet. Die Ware gehört dir, das Geld behältst du.',
      },
      failure: { stakeMoney: -1, reputation: -2, text: 'Abgezogen {place}: Geld weg, keine Ware.' },
      retreat: { text: 'Deal {place} geplatzt. Wenigstens ist das Geld noch da.' },
    },
  },

  gangSpotRaid: {
    name: 'Überfall auf Gang-Spot',
    baseSuccess: 0.45,
    situation: 'Ihr rückt {place} an. Im Hinterzimmer: Ware und Bargeld. {opponent} haben euch schon gesehen.',
    opponent: { label: 'Die Wachen', strength: 55, count: [2, 4] },
    maxRounds: 5,
    joinable: true,
    ifNobody: 'retreat',
    actions: ['fight', 'intimidate', 'hold', 'flee'],
    remoteActions: ['fight', 'hold', 'flee'],
    outcomes: {
      // Heat durch Gewalt meldet die Polizei selbst (reportViolence bei jeder Konfrontation im Veedel).
      success: {
        stakeGoods: 1,
        stakeMoney: 1,
        influence: 5,
        opponentInfluence: -10,
        reputation: 3,
        text: 'Spot {place} ausgeräumt.',
      },
      failure: { influence: -2, reputation: -4, text: 'Zurückgeschlagen {place}.' },
      retreat: { reputation: -1, text: 'Überfall {place} abgebrochen.' },
    },
  },
};
