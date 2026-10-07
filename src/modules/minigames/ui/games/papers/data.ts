// Papiere fälschen (Auftrag 44, Teil 8): Papiere, Felder und Werte als reine Daten. Auf der Autobahn liegen Frachtbrief
// (CMR), Lieferschein und Zollanmeldung auf dem Tisch, am Kai Konnossement, Packliste und Zollanmeldung. Jedes Feld
// steht auf mehreren Papieren oder hat eine Vorlage auf dem Tisch (Waage, Kalender, Kamera): So lässt sich jeder
// Widerspruch finden. Neue Firmen, Länder und Waren sind nur Daten.

export type Setting = 'autobahn' | 'port';

/** Felder auf den Papieren. stamp ist der Ausfuhrstempel des Herkunftslandes auf der Zollanmeldung. */
export type FieldKey = 'sender' | 'receiver' | 'origin' | 'goods' | 'weight' | 'plate' | 'date' | 'stamp';

export const FIELD_KEYS: readonly FieldKey[] = [
  'sender',
  'receiver',
  'origin',
  'goods',
  'weight',
  'plate',
  'date',
  'stamp',
];

export interface PaperDef {
  id: string;
  title: string;
  /** Kleine Zeile unter dem Titel („CMR“, „Bill of Lading“). */
  sub: string;
  fields: readonly FieldKey[];
}

export const PAPERS: Record<Setting, readonly PaperDef[]> = {
  autobahn: [
    {
      id: 'cmr',
      title: 'Frachtbrief',
      sub: 'CMR · Internationaler Frachtbrief',
      fields: ['sender', 'receiver', 'origin', 'goods', 'weight', 'plate', 'date'],
    },
    {
      id: 'note',
      title: 'Lieferschein',
      sub: 'Ware und Menge',
      fields: ['sender', 'receiver', 'origin', 'goods', 'weight', 'date'],
    },
    {
      id: 'declaration',
      title: 'Zollanmeldung',
      sub: 'T1 · Versandschein',
      fields: ['sender', 'receiver', 'origin', 'goods', 'weight', 'plate', 'stamp'],
    },
  ],
  port: [
    {
      id: 'bill',
      title: 'Konnossement',
      sub: 'Bill of Lading',
      fields: ['sender', 'receiver', 'origin', 'goods', 'weight', 'plate', 'date'],
    },
    {
      id: 'packing',
      title: 'Packliste',
      sub: 'Packing List',
      fields: ['sender', 'receiver', 'origin', 'goods', 'weight', 'date'],
    },
    {
      id: 'declaration',
      title: 'Zollanmeldung',
      sub: 'Einfuhr · Summarische Anmeldung',
      fields: ['sender', 'receiver', 'origin', 'goods', 'weight', 'plate', 'stamp'],
    },
  ],
};

/** Beschriftung der Felder (plate heißt am Kai Containernummer). */
export function fieldLabel(key: FieldKey, setting: Setting): string {
  switch (key) {
    case 'sender':
      return 'Absender';
    case 'receiver':
      return 'Empfänger';
    case 'origin':
      return 'Herkunft';
    case 'goods':
      return 'Ware';
    case 'weight':
      return 'Gewicht';
    case 'plate':
      return setting === 'port' ? 'Container' : 'Kennzeichen';
    case 'date':
      return 'Datum';
    case 'stamp':
      return 'Stempel';
  }
}

/** Herkunftsländer mit Absendern (Firma, Ort). Auf der Autobahn aus Europa, am Kai aus Übersee. */
export const ORIGINS: Record<Setting, readonly { country: string; senders: readonly string[] }[]> = {
  autobahn: [
    { country: 'Niederlande', senders: ['Van Dijk Agro, Venlo', 'Bloemhof B.V., Aalsmeer', 'Kuipers Fresh, Venray'] },
    { country: 'Belgien', senders: ['Maes Logistics, Antwerpen', 'Peeters & Zoon, Gent', 'Agro Wouters, Hasselt'] },
    { country: 'Polen', senders: ['Trans-Kowalski, Poznań', 'Nowak Owoce, Łódź', 'Baltic Cargo, Szczecin'] },
    { country: 'Frankreich', senders: ['Primeurs Martin, Lille', 'Groupe Leroy, Reims', 'Sud Fruits, Perpignan'] },
    { country: 'Spanien', senders: ['Frutas Ortega, Almería', 'Hortalizas Ruiz, Murcia', 'Cítricos Vega, Valencia'] },
    { country: 'Tschechien', senders: ['Novák Trans, Plzeň', 'Morava Agro, Brno', 'Elbe Cargo, Ústí'] },
  ],
  port: [
    {
      country: 'Kolumbien',
      senders: ['Frutas del Valle, Cartagena', 'Café Montaña, Santa Marta', 'Agro Caribe, Barranquilla'],
    },
    { country: 'Ecuador', senders: ['Bananera Costa, Guayaquil', 'Flores Andinas, Quito', 'Pacífico Fruit, Machala'] },
    { country: 'Brasilien', senders: ['Frutas Tropicais, Santos', 'Café Serrado, Vitória', 'Norte Agro, Belém'] },
    { country: 'Marokko', senders: ['Agrumes Atlas, Agadir', 'Tanger Fresh, Tanger', 'Souss Primeurs, Agadir'] },
    { country: 'Panama', senders: ['Colón Trading, Colón', 'Istmo Cargo, Balboa', 'Chiriquí Fruit, David'] },
    { country: 'Peru', senders: ['Andes Export, Callao', 'Paita Frutas, Paita', 'Inca Agro, Lima'] },
  ],
};

export const RECEIVERS: Record<Setting, readonly string[]> = {
  autobahn: [
    'Rheinland Frische GmbH, Köln',
    'Großhandel Lindner, Köln',
    'Hansa Food Service, Hamburg',
    'Spree Gemüse KG, Berlin',
    'Isar Frucht GmbH, München',
    'Main Import GmbH, Frankfurt',
  ],
  port: [
    'Maas Fruit B.V., Rotterdam',
    'Waalhaven Trading, Rotterdam',
    'Delta Cold Store, Rotterdam',
    'Europoort Food, Rotterdam',
    'Noordzee Import, Rotterdam',
  ],
};

export const GOODS: Record<Setting, readonly string[]> = {
  autobahn: ['Tomaten', 'Paprika', 'Schnittblumen', 'Fliesen', 'Altkleider', 'Autoteile', 'Orangen', 'Gurken'],
  port: ['Bananen', 'Kaffeebohnen', 'Ananas', 'Schnittblumen', 'Fliesen', 'Gefrierfisch', 'Avocados', 'Kakao'],
};

/** Gewicht der Ladung in kg (Transporter bzw. Container). */
export const WEIGHT_RANGE: Record<Setting, readonly [number, number]> = {
  autobahn: [900, 3400],
  port: [14_000, 26_000],
};

/** Kennzeichen der Transporter: Ortskürzel. Container: Präfixe der Reedereien. */
export const PLATE_PREFIXES = ['K', 'BN', 'D', 'AC', 'NE', 'GL', 'SU', 'LEV'];
export const CONTAINER_PREFIXES = ['MSKU', 'MAEU', 'CMAU', 'HLXU', 'MSCU', 'TGHU', 'OOLU'];

/** Was der Zöllner sagt. {feld} wird die Beschriftung des Felds, {papier} der Name des Papiers. */
export type OfficerLine =
  | 'greet'
  | 'browse'
  | 'nextPaper'
  | 'ok'
  | 'hit'
  | 'hitWeight'
  | 'hitDate'
  | 'hitPlate'
  | 'hitStampMissing'
  | 'hitStampWrong'
  | 'pass'
  | 'fail'
  | 'bribeOk'
  | 'bribeNo'
  | 'giveUp';

export const OFFICER_LINES: Record<OfficerLine, readonly string[]> = {
  greet: ['Papiere bitte. Alle.', 'Alle Papiere auf den Tisch.', 'Dann zeigen Sie mal her.'],
  browse: ['Mal sehen …', 'Hm.', 'So, so.'],
  nextPaper: ['Dann der {papier}.', 'Weiter. {papier}.', 'Jetzt der {papier}.'],
  ok: ['Hm.', 'Gut.', 'Weiter.'],
  hit: [
    '{feld} passt nicht zu den anderen Papieren.',
    'Moment. {feld}, hier steht was anderes.',
    'Und warum ist {feld} hier anders?',
  ],
  hitWeight: ['Das Gewicht stimmt nicht mit der Waage.', 'Die Waage sagt was anderes als Ihr Papier.'],
  hitDate: ['Das Datum ist nicht von heute.', 'Von welchem Tag ist das denn?'],
  hitPlate: ['Das ist nicht die Nummer da draußen.', 'Die Nummer stimmt nicht. Ich hab sie doch vor mir.'],
  hitStampMissing: ['Wo ist der Ausfuhrstempel?', 'Hier fehlt der Stempel.'],
  hitStampWrong: ['Der Stempel passt nicht zur Herkunft.', 'Ausfuhrstempel aus dem falschen Land?'],
  pass: ['Passt. Stempel drauf, weiter.', 'In Ordnung. Gute Fahrt.', 'Alles da. Sie können.'],
  fail: ['Das reicht. Ladung öffnen.', 'Zwei Fehler. Wir schauen jetzt rein.', 'Aufmachen. Sofort.'],
  bribeOk: ['… Ich habe nichts gesehen.', 'Stempel. Und jetzt weg hier.'],
  bribeNo: ['Stecken Sie das weg. Sofort.', 'Wollen Sie mich bestechen? Das notiere ich.'],
  giveUp: ['Sie lassen die Ladung hier? Dann gehen Sie.', 'Dann bleibt das hier. Und Sie gehen.'],
};
