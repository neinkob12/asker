// Handlungsmöglichkeiten in einer Runde, als reine Daten. Welche ein Anlass anbietet, steht in kinds.ts.
// Die Texte nennen niemanden beim Namen (sonst stimmt "du" / "er" nicht), wen es erwischt, ergänzt die Engine.

import type { EncounterAction } from './types';

export const ENCOUNTER_ACTIONS: Record<string, EncounterAction> = {
  fight: {
    label: 'Kämpfen',
    hint: 'Stärke und Überzahl zählen. Es kann jeden erwischen.',
    stat: 'strength',
    statMode: 'avg',
    base: 0.5,
    numbers: true,
    onSuccess: { edge: 25, knockdown: 0.55, hitChance: 0.1 },
    onFailure: { edge: -20, hitChance: 0.55 },
    texts: {
      success: [
        'Ihr geht als Erste dazwischen.',
        'Kurzes, hässliches Gerangel. Diesmal habt ihr die Oberhand.',
        'Ein Schlag sitzt. Die anderen weichen zurück.',
      ],
      failure: [
        'Die anderen sind schneller. Ein Schlag, dann Blut auf dem Asphalt.',
        'Jemand zieht ein Messer. Ihr müsst zurück.',
        'Ihr verfehlt. Die anderen setzen nach.',
      ],
    },
  },
  intimidate: {
    label: 'Einschüchtern',
    hint: 'Nur als Boss vor Ort. Wer Angst hat, kämpft schlecht.',
    stat: 'strength',
    statMode: 'best',
    base: 0.45,
    requiresPlayer: true,
    onSuccess: { edge: 30, scare: 0.6 },
    onFailure: { edge: -15, hitChance: 0.45 },
    texts: {
      success: [
        'Du trittst vor und sagst leise, was passiert, wenn sie bleiben.',
        'Ein Blick, ein Satz. Sie werden unsicher.',
      ],
      failure: ['Sie lachen dich aus. Jetzt wird es persönlich.', 'Die Drohung verpufft. Einer spuckt vor dir aus.'],
    },
  },
  negotiate: {
    label: 'Verhandeln',
    hint: 'Charisma zählt. Wenig Risiko, aber es dauert.',
    stat: 'charisma',
    statMode: 'best',
    base: 0.4,
    onSuccess: { edge: 25 },
    onFailure: { edge: -12, hitChance: 0.2 },
    texts: {
      success: ['Ruhige Worte. Die Lage entspannt sich.', 'Die richtigen Worte zur richtigen Zeit.'],
      failure: ['Sie wollen nicht reden.', 'Ein falsches Wort. Die Stimmung kippt.'],
    },
  },
  hold: {
    label: 'Deckung halten',
    hint: 'Vorsicht zählt. Kleiner Vorteil, kleines Risiko.',
    stat: 'caution',
    statMode: 'avg',
    base: 0.55,
    onSuccess: { edge: 10 },
    onFailure: { edge: -8, hitChance: 0.25 },
    texts: {
      success: ['Ihr bleibt ruhig und lasst sie kommen. Sie machen Fehler.', 'Ihr haltet die Stellung.'],
      failure: ['Die Deckung ist schlecht. Sie rücken näher.', 'Zu lange gewartet.'],
    },
  },
  bribe: {
    label: 'Bestechen',
    hint: 'Kostet Schwarzgeld, auch wenn es nicht klappt.',
    stat: 'charisma',
    statMode: 'best',
    base: 0.55,
    costsBribe: true,
    onSuccess: { resolve: 'success' },
    onFailure: { edge: -10 },
    texts: {
      success: ['Ein Umschlag wechselt den Besitzer. Plötzlich sehen alle woanders hin.'],
      failure: ['Sie nehmen das Geld und bleiben trotzdem.', 'Das Geld ist weg. Geholfen hat es nichts.'],
    },
  },
  flee: {
    label: 'Abhauen',
    hint: 'Tempo zählt. Klappt es, ist die Sache vorbei, aber etwas bleibt zurück.',
    stat: 'speed',
    statMode: 'avg',
    base: 0.5,
    onSuccess: { resolve: 'retreat' },
    onFailure: { edge: -15, hitChance: 0.35 },
    texts: {
      success: ['Ihr rennt. Hinterhöfe, Zäune, weg.', 'Eine Lücke, ein Sprint, geschafft.'],
      failure: ['Die Straße ist dicht. Sie schneiden euch den Weg ab.', 'Zu langsam.'],
    },
  },
  dump: {
    label: 'Ware wegwerfen',
    hint: 'Vorsicht zählt. Die Ware ist weg, aber ohne sie gibt es nichts zu beweisen.',
    stat: 'caution',
    statMode: 'best',
    base: 0.6,
    dropsGoods: [5, 15],
    onSuccess: { resolve: 'retreat' },
    onFailure: { edge: -12 },
    texts: {
      success: ['Die Tüte landet im Gully. Kontrolle ohne Befund.'],
      failure: ['Sie haben gesehen, was ihr weggeworfen habt.'],
    },
  },
};
