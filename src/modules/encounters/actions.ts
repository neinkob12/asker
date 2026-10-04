// Handlungsmöglichkeiten in einer Runde, als reine Daten. Welche ein Anlass anbietet, steht in kinds.ts.
// Jede Handlung verschiebt die beiden Zeiger der Gegenseite (Aggression, Entschlossenheit; negativ = gut für euch).
// Der Würfel entscheidet nur die Stärke, der Wert der Beteiligten und die Absicht der Gegenseite verstärken oder
// dämpfen (tactics.ts). Die Texte nennen niemanden beim Namen (sonst stimmt "du" / "er" nicht).

import type { EncounterAction } from './types';

export const ENCOUNTER_ACTIONS: Record<string, EncounterAction> = {
  fight: {
    label: 'Zuschlagen',
    hint: 'Stärke und Überzahl zählen. Bringt sie ins Wanken, aber es wird eine Schlägerei.',
    stat: 'strength',
    statMode: 'avg',
    numbers: true,
    shift: { aggression: 25, resolve: -12 },
    strike: 0.5,
    texts: {
      strong: ['Ihr geht als Erste dazwischen.', 'Ein Schlag sitzt. Die anderen weichen zurück.'],
      weak: ['Kurzes, hässliches Gerangel. Keiner gewinnt.', 'Ihr verfehlt. Die anderen setzen nach.'],
    },
  },
  intimidate: {
    label: 'Anführer einschüchtern',
    hint: 'Nur als Boss vor Ort. Knickt der Anführer ein, gehen alle.',
    stat: 'strength',
    statMode: 'best',
    target: 'leader',
    requiresPlayer: true,
    shift: { aggression: 8, resolve: -22 },
    texts: {
      strong: [
        'Du trittst vor den Anführer und sagst leise, was passiert, wenn sie bleiben.',
        'Ein Blick, ein Satz. Der Anführer wird unsicher.',
      ],
      weak: ['Der Anführer lacht dich aus.', 'Die Drohung verpufft. Einer spuckt vor dir aus.'],
    },
  },
  talkNervous: {
    label: 'Den Nervösen bearbeiten',
    hint: 'Charisma zählt. Der Nervöse geht, die anderen werden unsicher.',
    stat: 'charisma',
    statMode: 'best',
    target: 'nervous',
    removesTarget: true,
    shift: { aggression: -4, resolve: -6 },
    texts: {
      strong: ['Ein paar ruhige Worte an den Jüngsten. Er dreht sich um und geht.'],
      weak: ['Der Nervöse zögert, dann verdrückt er sich doch. Die anderen haben es gemerkt.'],
    },
  },
  negotiate: {
    label: 'Verhandeln',
    hint: 'Charisma zählt. Nimmt Druck raus, kostet aber Zeit.',
    stat: 'charisma',
    statMode: 'best',
    shift: { aggression: -14, resolve: -5 },
    texts: {
      strong: ['Ruhige Worte. Die Lage entspannt sich.', 'Die richtigen Worte zur richtigen Zeit.'],
      weak: ['Sie hören kaum zu.', 'Ein falsches Wort. Viel bringt es nicht.'],
    },
  },
  hold: {
    label: 'Hinhalten',
    hint: 'Vorsicht zählt. Zeit schinden, bis die Streife näher kommt. Das macht auch sie nervös.',
    stat: 'caution',
    statMode: 'avg',
    shift: { aggression: -6, resolve: -2 },
    texts: {
      strong: ['Ihr bleibt ruhig und lasst sie reden. Die Zeit läuft für euch.', 'Ihr haltet die Stellung.'],
      weak: ['Sie rücken näher.', 'Zu lange gewartet.'],
    },
  },
  bluff: {
    label: 'Bluffen',
    hint: 'Charisma zählt. „Meine Jungs sind gleich da.“ Wirkt stark, macht aber wütend.',
    stat: 'charisma',
    statMode: 'best',
    shift: { aggression: 6, resolve: -14 },
    texts: {
      strong: ['Ein Anruf, laut genug: „Kommt alle her.“ Sie schauen sich um.'],
      weak: ['Sie glauben kein Wort.', 'Der Bluff ist zu dünn.'],
    },
  },
  bribe: {
    label: 'Bestechen',
    hint: 'Kostet Schwarzgeld. Senkt die Entschlossenheit stark.',
    stat: 'charisma',
    statMode: 'best',
    costsBribe: true,
    shift: { aggression: -10, resolve: -30 },
    texts: {
      strong: ['Ein Umschlag wechselt den Besitzer. Plötzlich sehen alle woanders hin.'],
      weak: ['Sie nehmen das Geld und wollen mehr.', 'Das Geld ist weg. Geholfen hat es nur ein bisschen.'],
    },
  },
  flee: {
    label: 'Abhauen',
    hint: 'Tempo zählt. Sofort vorbei, aber was nicht geschützt ist, bleibt zurück.',
    stat: 'speed',
    statMode: 'avg',
    shift: { aggression: 0, resolve: 0 },
    ends: 'retreat',
    ending: 'fled',
    endHit: 0.3,
    texts: {
      strong: ['Ihr rennt. Hinterhöfe, Zäune, weg.', 'Eine Lücke, ein Sprint, geschafft.'],
      weak: ['Raus, aber knapp. Sie sind dicht dran.'],
    },
  },
  run: {
    label: 'Wegrennen',
    hint: 'Tempo zählt. Jede Gasse bringt Abstand, aber sie bleiben dran, bis sie aufgeben.',
    stat: 'speed',
    statMode: 'avg',
    shift: { aggression: 8, resolve: -24 },
    texts: {
      strong: ['Ihr rennt. Hinterhöfe, Zäune, Abstand.', 'Eine Lücke, ein Sprint.'],
      weak: ['Die Straße ist dicht. Sie bleiben dran.', 'Zu langsam.'],
    },
  },
  speedOff: {
    label: 'Gas geben',
    hint: 'Tempo zählt. Geben sie auf, ist die Ladung sicher, aber im Veedel wird gesucht.',
    stat: 'speed',
    statMode: 'best',
    shift: { aggression: 15, resolve: -26 },
    heat: 6,
    gaveUp: 'retreat',
    texts: {
      strong: ['Vollgas über die Kreuzung, die Streife bleibt im Verkehr hängen.'],
      weak: ['Die Streife klebt an der Stoßstange.', 'Sackgasse.'],
    },
  },
  dump: {
    label: 'Ware wegwerfen',
    hint: 'Vorsicht zählt. Die Ware ist weg, aber ohne sie gibt es nichts zu beweisen.',
    stat: 'caution',
    statMode: 'best',
    dropsGoods: [5, 15],
    shift: { aggression: -5, resolve: -22 },
    texts: {
      strong: ['Die Tüte landet im Gully. Nichts zu sehen.'],
      weak: ['Weg ist sie, aber vielleicht hat es jemand gesehen.'],
    },
  },
  callCops: {
    label: 'Bullen rufen',
    hint: 'Die Streife kommt in der nächsten Runde. Dann verlieren beide Seiten.',
    stat: 'none',
    statMode: 'best',
    requiresVeedel: true,
    clock: 'call',
    shift: { aggression: 5, resolve: -5 },
    texts: {
      strong: ['Ein kurzer Anruf. In der Ferne schon das Martinshorn.'],
      weak: ['Ein kurzer Anruf. Sie haben es gesehen.'],
    },
  },
  papers: {
    label: 'Papiere zeigen',
    hint: 'Vorsicht zählt. Lieferschein, Fahrzeugschein, alles sauber, solange keiner genau hinsieht.',
    stat: 'caution',
    statMode: 'best',
    shift: { aggression: -10, resolve: -14 },
    texts: {
      strong: ['Die Papiere passen. Der Beamte blättert nur noch.', 'Lieferschein, Stempel, alles da.'],
      weak: ['Der Beamte liest jede Zeile zweimal.', 'Ein Stempel fehlt. Das fällt auf.'],
    },
  },
  distract: {
    label: 'Ablenken',
    hint: 'Tempo zählt. Reden, Kaffee anbieten, auf den Stau zeigen: schützt diese Runde die Ladung.',
    stat: 'speed',
    statMode: 'best',
    shields: 'goods',
    shift: { aggression: -4, resolve: -6 },
    texts: {
      strong: ['Ein Witz über den Stau, eine Frage nach dem Weg. Keiner schaut nach hinten.'],
      weak: ['Sie lassen sich kaum ablenken.'],
    },
  },
  giveUp: {
    label: 'Ladung aufgeben',
    hint: 'Die Ladung ist weg, dafür kommt niemand mit aufs Revier.',
    stat: 'none',
    statMode: 'best',
    shift: { aggression: 0, resolve: 0 },
    ends: 'failure',
    ending: 'surrendered',
    texts: {
      strong: ['„Gehört nicht mir.“ Die Ladung bleibt da, der Fahrer darf gehen.'],
      weak: ['„Gehört nicht mir.“ Die Ladung bleibt da, der Fahrer darf gehen.'],
    },
  },
};
