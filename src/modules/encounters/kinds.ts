// Anlässe für Konfrontationen als reine Daten. Neuer Anlass = neuer Eintrag, sonst nichts.
// Platzhalter in Texten: {opponent} (Gegenseite), {place} (z.B. "am Ebertplatz"), {us} (dich / deine Leute),
// {stakeMoney} und {stakeGoods} (Einsatz aus der Anfrage).
// Welche Handlungen es gibt, steht in actions.ts, die Absichten der Gegenseite in intents.ts. Folgen: siehe
// EncounterEffects in types.ts; verlorene Einsätze kosten anteilig, was im Ausgang steht (tactics.ts, stakeEffects).
// Situationstexte: situations mit Ort (settings), Tagesabschnitt (phases) und Wetter; der genaueste passende gewinnt,
// bei Gleichstand würfelt die Engine.

import type { EncounterKind } from './types';

export type { EncounterKind } from './types';

/** Absichten bei Gangs und Geschäftspartnern. */
const GANG_INTENTS = [
  'grabGoods',
  'grabCash',
  'knife',
  'leaderTalks',
  'exit',
  'noise',
  'bruiserUp',
  'nervousWavers',
] as const;

export const ENCOUNTER_KINDS: Record<string, EncounterKind> = {
  raidDefense: {
    name: 'Überfall abwehren',
    baseSuccess: 0.5,
    situation: '{opponent} tauchen {place} auf. Kapuzen, Baseballschläger. Sie wollen die Ware und die Kasse.',
    situations: [
      {
        text: '{opponent} tauchen {place} auf. Kapuzen, Baseballschläger. Sie wollen die Ware und die Kasse.',
        settings: ['spot'],
      },
      {
        text: 'Mitten in der Nacht {place}: Zwei Autos ohne Licht, Türen auf, {opponent} steigen aus. Sie wollen alles.',
        settings: ['spot'],
        phases: ['night'],
      },
      {
        text: 'Regen peitscht {place}, keiner ist unterwegs. Genau darauf haben {opponent} gewartet.',
        weather: ['rain', 'storm'],
      },
      {
        text: 'Helllichter Tag {place}, Leute auf der Straße. {opponent} ist das egal: Sie kommen direkt auf euch zu.',
        settings: ['spot'],
        phases: ['day'],
      },
      {
        text: 'In der Dämmerung {place}: {opponent} kommen von zwei Seiten. Einer hat einen Bolzenschneider dabei.',
        phases: ['dawn', 'dusk'],
      },
      {
        text: '{opponent} brechen {place} das Rolltor auf. Drinnen liegt dein Vorrat.',
        settings: ['warehouse'],
      },
      {
        text: 'Schnee knirscht {place}. {opponent} haben sich warm angezogen und wollen die Ware.',
        weather: ['snow'],
      },
    ],
    opponent: { label: 'Die Angreifer', strength: 50, count: [2, 4] },
    gauges: { aggression: 45, resolve: 70 },
    clock: 6,
    stakes: ['goods', 'cash', 'people', 'spot', 'noise'],
    // Im Lager gibt es keinen Spot, auf der Auftragsfahrt (Straße) auch keine Kasse.
    stakesBySetting: {
      warehouse: ['goods', 'cash', 'people', 'noise'],
      street: ['goods', 'people', 'noise'],
    },
    lootLimit: 70,
    intents: [...GANG_INTENTS, 'wreck'],
    maxRounds: 10,
    joinable: true,
    briefingOptions: ['self', 'crew', 'backup', 'payoff', 'tipoff', 'abandon'],
    actions: ['negotiate', 'intimidate', 'talkNervous', 'bluff', 'hold', 'fight', 'bribe', 'callCops', 'flee'],
    // Per Handy geht fast alles, nur Einschüchtern braucht den Boss vor Ort.
    remoteActions: ['negotiate', 'talkNervous', 'bluff', 'hold', 'fight', 'bribe', 'callCops', 'flee'],
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
      retreat: {
        goods: [-12, -5],
        influence: -3,
        opponentInfluence: 2,
        text: 'Rückzug {place}. Ein Teil der Ware ist weg.',
      },
    },
  },

  policeChase: {
    name: 'Polizeiflucht',
    baseSuccess: 0.6,
    situation: 'Blaulicht {place}. {opponent} will {us} kontrollieren. In den Taschen: Ware.',
    situations: [
      { text: 'Blaulicht {place}. {opponent} will {us} kontrollieren. In den Taschen: Ware.' },
      {
        text: 'Taschenlampen in der Nacht {place}. {opponent} ruft: „Stehen bleiben!“ In den Taschen: Ware.',
        phases: ['night'],
      },
      {
        text: 'Mittagsverkehr {place}, und mittendrin {opponent}. Zivil, aber jeder sieht es. In den Taschen: Ware.',
        phases: ['day'],
      },
      {
        text: 'Regen {place}, die Kapuze tief im Gesicht. Hat nichts genützt: {opponent} kommt direkt auf {us} zu.',
        weather: ['rain', 'storm'],
      },
      {
        text: 'Feierabend {place}, die Straßen voll. {opponent} schiebt sich durch die Menge, genau auf {us} zu.',
        phases: ['dusk'],
      },
    ],
    opponent: { label: 'Die Streife', strength: 55, count: 2 },
    roles: { leader: 1, nervous: 1 },
    gauges: { aggression: 30, resolve: 65 },
    clock: 4,
    // Läuft die Uhr ab, ist die zweite Streife da: gefasst.
    clockOutcome: 'failure',
    // Kein Fluchtwagen und kein Wegbringen: Wer der Polizei davonfährt, ist nicht "sicher raus".
    moves: ['block', 'secondTalk'],
    stakes: ['goods', 'people', 'noise'],
    intents: ['search', 'radio', 'askPapers', 'grab', 'hesitate'],
    maxRounds: 8,
    joinable: false,
    // Ohne Briefing (nicht joinable); falls doch: Bullen rufen und Freikaufen ergeben hier keinen Sinn.
    briefingOptions: ['self', 'crew', 'abandon'],
    // Festnahme, Beschlagnahme und Heat regelt der Auslöser (police), hier nur was die Flucht selbst kostet.
    draw: 'failure',
    lethal: false,
    journal: false,
    actions: ['run', 'dump', 'negotiate', 'bribe', 'fight'],
    remoteActions: ['run', 'dump', 'negotiate'],
    bribe: { base: 500, perOpponent: 200 },
    actionOverrides: {
      negotiate: { label: 'Rausreden', hint: 'Charisma zählt. Freundlich bleiben, nichts zugeben.' },
      fight: {
        heat: 15,
        strike: 0.3,
        hint: 'Schlechte Idee. Gewalt gegen Polizei bringt viel Heat.',
      },
    },
    outcomes: {
      success: { text: 'Den Bullen {place} entkommen.' },
      failure: { reputation: -2, text: 'Gefasst {place}.' },
      retreat: { text: 'Mit Mühe {place} davongekommen.' },
    },
  },

  vehicleCheck: {
    name: 'Verkehrskontrolle',
    baseSuccess: 0.6,
    situation: 'Kelle raus {place}. {opponent} winkt den Transporter raus. Hinten drin: {stakeGoods} Ware.',
    situations: [
      { text: 'Kelle raus {place}. {opponent} winkt den Transporter raus. Hinten drin: {stakeGoods} Ware.' },
      {
        text: 'Nachts {place}, Straße leer, nur ein Streifenwagen am Rand. Die Kelle geht hoch. Hinten drin: {stakeGoods} Ware.',
        phases: ['night'],
      },
      {
        text: 'Berufsverkehr {place}. {opponent} zieht den Transporter aus der Schlange. Hinten drin: {stakeGoods} Ware.',
        phases: ['day', 'dawn'],
      },
      {
        text: 'Scheibenwischer auf Stufe zwei {place}. {opponent} steht trotzdem im Regen und winkt raus. Hinten drin: {stakeGoods} Ware.',
        weather: ['rain', 'storm'],
      },
      {
        text: 'Glatteis-Kontrolle {place}: {opponent} prüft die Reifen. Und vielleicht mehr. Hinten drin: {stakeGoods} Ware.',
        weather: ['snow'],
      },
    ],
    opponent: { label: 'Die Streife', strength: 50, count: 2 },
    roles: { leader: 1, nervous: 1 },
    gauges: { aggression: 20, resolve: 72 },
    clock: 3,
    clockOutcome: 'failure',
    // Kein Fluchtwagen und kein Wegbringen: Wer der Polizei davonfährt, ist nicht "sicher raus".
    moves: ['block', 'secondTalk'],
    stakes: ['goods', 'people', 'noise'],
    stakeLabels: { goods: 'Ladung' },
    intents: ['searchVan', 'radio', 'askPapers', 'grab', 'hesitate'],
    maxRounds: 8,
    joinable: false,
    // Ladung, Festnahme und Heat regelt der Auslöser (logistics), hier nur was die Kontrolle selbst kostet.
    draw: 'failure',
    lethal: false,
    journal: false,
    actions: ['papers', 'negotiate', 'speedOff', 'bribe', 'fight'],
    remoteActions: ['papers', 'negotiate', 'speedOff'],
    bribe: { base: 600, perOpponent: 250 },
    actionOverrides: {
      negotiate: {
        label: 'Ruhig bleiben',
        hint: 'Charisma zählt. Freundlich sein, nicht nach hinten gucken.',
        texts: {
          strong: ['Der Beamte gähnt.', 'Ein Witz über den FC, die Stimmung ist gut.'],
          weak: ['Der Beamte will doch mal hinten reingucken.', 'Zu nervös. Das merken die.'],
        },
      },
      fight: { strike: 0.25, heat: 20, hint: 'Ganz schlechte Idee. Gewalt gegen Polizei bringt viel Heat.' },
    },
    outcomes: {
      success: { text: 'Kontrolle {place} überstanden. Weiter geht die Fahrt.' },
      failure: { text: 'Ladung {place} aufgeflogen.' },
      retreat: { text: '{place} den Bullen davongefahren.' },
    },
  },

  customsCheck: {
    name: 'Zollkontrolle',
    baseSuccess: 0.55,
    situation:
      'Zollkontrolle {place}. {opponent} winkt den Transporter auf den Parkplatz: Spürhund, Taschenlampen, ' +
      'Fragen nach Ladung und Lieferschein. Hinten drin: {stakeGoods} Ware.',
    situations: [
      {
        text:
          'Zollkontrolle {place}. {opponent} winkt den Transporter auf den Parkplatz: Spürhund, Taschenlampen, ' +
          'Fragen nach Ladung und Lieferschein. Hinten drin: {stakeGoods} Ware.',
        settings: ['autobahn'],
      },
      {
        text: 'Rastplatz {place}, drei Uhr nachts. Ein Zollbus mit Blaulicht, {opponent} winkt raus. Hinten drin: {stakeGoods} Ware.',
        settings: ['autobahn'],
        phases: ['night'],
      },
      {
        text: 'Am Kai {place}: {opponent} will den Container sehen, bevor er rausgeht. Drin: {stakeGoods} Ware.',
        settings: ['port'],
      },
      {
        text: 'Nebel über dem Hafen {place}. {opponent} kommt mit Hund und Röntgenwagen. Im Container: {stakeGoods} Ware.',
        settings: ['port'],
        weather: ['cloudy', 'rain'],
      },
      {
        text: 'Regen auf der Autobahn {place}. {opponent} steht unter dem Vordach und winkt den Transporter rüber. Hinten drin: {stakeGoods} Ware.',
        settings: ['autobahn'],
        weather: ['rain', 'storm'],
      },
      {
        text: 'Schichtwechsel am Hafen {place}. Ausgerechnet jetzt will {opponent} genau diesen Container öffnen. Drin: {stakeGoods} Ware.',
        settings: ['port'],
        phases: ['dawn', 'dusk'],
      },
    ],
    opponent: { label: 'Der Zoll', strength: 62, count: 3 },
    roles: { leader: 1, nervous: 1 },
    gauges: { aggression: 15, resolve: 65 },
    clock: 5,
    clockOutcome: 'failure',
    // Kein Fluchtwagen und kein Wegbringen: Wer der Polizei davonfährt, ist nicht "sicher raus".
    moves: ['block', 'secondTalk'],
    stakes: ['goods', 'people'],
    stakeLabels: { goods: 'Ladung' },
    intents: ['dog', 'tarp', 'deliveryNote', 'callOffice', 'hesitate'],
    maxRounds: 8,
    joinable: false,
    // Ladung, Festnahme und Heat regelt der Auslöser (logistics, später der Hafen).
    draw: 'failure',
    lethal: false,
    journal: false,
    actions: ['papers', 'distract', 'bribe', 'giveUp'],
    remoteActions: ['papers', 'distract', 'giveUp'],
    bribe: { base: 900, perOpponent: 300 },
    actionOverrides: {
      bribe: { hint: 'Kostet Schwarzgeld. Beim Zoll teuer, aber wirksam.' },
    },
    outcomes: {
      success: { text: 'Zoll {place} durch. Weiter geht die Fahrt.' },
      failure: { text: 'Ladung {place} beim Zoll aufgeflogen.' },
      retreat: { text: '{place} am Zoll vorbeigekommen.' },
    },
  },

  debtCollection: {
    name: 'Schulden eintreiben',
    baseSuccess: 0.6,
    situation: '{opponent} schuldet dir {stakeMoney}. Keine Lust zu zahlen. Treffpunkt {place}.',
    situations: [
      { text: '{opponent} schuldet dir {stakeMoney}. Keine Lust zu zahlen. Treffpunkt {place}.' },
      {
        text: 'Hinterzimmer einer Kneipe {place}, spät in der Nacht. {opponent} schuldet dir {stakeMoney} und tut, als wüsste er von nichts.',
        phases: ['night'],
      },
      {
        text: 'Treffpunkt {place}, heller Tag. {opponent} schuldet dir {stakeMoney} und hat schon die Ausreden parat.',
        phases: ['day'],
      },
      {
        text: 'Regen {place}. {opponent} schuldet dir {stakeMoney} und hat dich extra im Nassen warten lassen.',
        weather: ['rain', 'storm'],
      },
      {
        text: 'Abends {place}, die Straßenlaternen gehen an. {opponent} schuldet dir {stakeMoney}. Er schaut sich nervös um.',
        phases: ['dusk', 'dawn'],
      },
    ],
    opponent: { label: 'Der Schuldner', strength: 35, count: 1 },
    roles: { leader: 1, nervous: 0 },
    gauges: { aggression: 35, resolve: 60 },
    clock: 6,
    stakes: ['cash', 'people', 'noise'],
    stakeLabels: { cash: 'Schulden' },
    intents: ['hideMoney', 'whine', 'knife', 'callFriends', 'noise', 'bruiserUp', 'nervousWavers'],
    maxRounds: 10,
    joinable: true,
    ifNobody: 'retreat',
    briefingOptions: ['self', 'crew', 'backup'],
    actions: ['intimidate', 'negotiate', 'bluff', 'fight', 'hold', 'flee'],
    remoteActions: ['negotiate', 'bluff', 'fight', 'flee'],
    actionOverrides: {
      flee: {
        label: 'Laufen lassen',
        hint: 'Abziehen. Kein Geld, aber auch kein Ärger.',
        endHit: 0,
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
    situations: [
      {
        text: 'Übergabe {place}: {stakeGoods} gegen {stakeMoney}. Plötzlich blitzt ein Messer. {opponent} wollen beides.',
      },
      {
        text: 'Parkhaus {place}, Deck drei, nachts. {stakeGoods} gegen {stakeMoney}. Dann gehen bei {opponent} die Kofferräume auf, und da ist kein Geld drin.',
        phases: ['night'],
      },
      {
        text: 'Übergabe am helllichten Tag {place}: {stakeGoods} gegen {stakeMoney}. {opponent} lächeln zu viel.',
        phases: ['day'],
      },
      {
        text: 'Regen {place}, alle wollen schnell fertig werden. {stakeGoods} gegen {stakeMoney}. Dann zieht einer von {opponent} die Kapuze runter: Das wird kein Geschäft.',
        weather: ['rain', 'storm'],
      },
      {
        text: 'Dämmerung {place}: {stakeGoods} gegen {stakeMoney}. {opponent} sind zu viele, und sie stehen schon im Halbkreis.',
        phases: ['dawn', 'dusk'],
      },
    ],
    opponent: { label: 'Die Geschäftspartner', strength: 50, count: [2, 3] },
    gauges: { aggression: 55, resolve: 70 },
    clock: 5,
    stakes: ['goods', 'cash', 'people', 'noise'],
    lootLimit: 90,
    intents: [...GANG_INTENTS],
    maxRounds: 10,
    joinable: true,
    ifNobody: 'retreat',
    briefingOptions: ['self', 'crew', 'backup', 'tipoff'],
    actions: ['negotiate', 'intimidate', 'talkNervous', 'bluff', 'hold', 'fight', 'callCops', 'flee'],
    remoteActions: ['negotiate', 'talkNervous', 'bluff', 'fight', 'flee'],
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
    situations: [
      { text: 'Ihr rückt {place} an. Im Hinterzimmer: Ware und Bargeld. {opponent} haben euch schon gesehen.' },
      {
        text: 'Drei Uhr nachts {place}. Im Hinterzimmer brennt noch Licht: Ware und Bargeld. {opponent} spielen Karten, bis einer euch sieht.',
        phases: ['night'],
      },
      {
        text: 'Mittags {place}, der Laden vorne ist offen. Hinten: Ware und Bargeld. {opponent} stehen sofort auf.',
        phases: ['day'],
      },
      {
        text: 'Regen {place}, keiner auf der Straße. Ihr geht durch den Hof rein. {opponent} haben euch trotzdem gehört.',
        weather: ['rain', 'storm', 'snow'],
      },
      {
        text: 'Schichtwechsel {place} in der Dämmerung: Die einen gehen, die anderen kommen. Ihr seid mittendrin, {opponent} auch.',
        phases: ['dawn', 'dusk'],
      },
    ],
    opponent: { label: 'Die Wachen', strength: 55, count: [2, 4] },
    gauges: { aggression: 50, resolve: 75 },
    clock: 5,
    stakes: ['goods', 'cash', 'people', 'noise'],
    stakeLabels: { goods: 'Beute', cash: 'Bargeld' },
    intents: ['hideLoot', 'emptyTill', 'knife', 'callFriends', 'exit', 'noise', 'bruiserUp', 'nervousWavers'],
    maxRounds: 10,
    joinable: true,
    ifNobody: 'retreat',
    briefingOptions: ['self', 'crew', 'backup'],
    actions: ['fight', 'intimidate', 'talkNervous', 'bluff', 'hold', 'flee'],
    remoteActions: ['fight', 'talkNervous', 'bluff', 'flee'],
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
