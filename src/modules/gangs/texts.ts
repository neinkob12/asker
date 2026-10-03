// Texte der Gangs für Handy-Nachrichten. Platzhalter: {boss}, {gang}, {veedel}, {tribute}, {amount}, {price},
// {enemy}. Pro Anlass mehrere Varianten, eine wird zufällig gewählt.

export const GANG_TEXTS = {
  warning: [
    '{boss}: Man hört, du verkaufst in {veedel}. Das ist unser Pflaster. Such dir was anderes, solange wir noch fragen.',
    '{boss}: Kleiner Tipp unter Kollegen. {veedel} gehört uns. Wir reden einmal. Einmal.',
  ],
  threat: [
    '{boss}: Du hast nicht zugehört. Ab jetzt zahlst du {tribute} die Woche. Oder wir kommen vorbei.',
    '{boss}: Letzte Ansage. {tribute} pro Woche, dann darfst du in {veedel} weiter deine Tütchen verkaufen.',
  ],
  war: [
    '{boss}: Du willst es nicht anders. Schau dich in Zukunft besser um.',
    '{boss}: Ab heute bist du Freiwild. Grüß deine Leute von uns.',
  ],
  raidWon: ['{boss}: Glück gehabt. Nächstes Mal bringen wir mehr Leute mit.'],
  raidLost: ['{boss}: Das war die Quittung. Willst du noch eine?', '{boss}: Nur damit du weißt, wie sich das anfühlt.'],
  attacked: ['{boss}: Du hast gerade einen Krieg angefangen, den du nicht gewinnen kannst.'],
  snitch: ['{boss}: Wir wissen, wer bei den Bullen gesungen hat. Du hörst von uns.'],
  tributeDue: ['{boss}: Die Woche ist rum. {tribute} für die nächste. Du weißt, wie das läuft.'],
  protectionRefused: ['{boss}: Diese Woche gibt es kein Geld. Hol es dir doch.'],
  offer: [
    '{boss}: Hab {amount} übrig. {price}, Übergabe in {veedel}. Heute noch, sonst ist es weg.',
    '{boss}: Freundschaftspreis: {amount} für {price}. Treffpunkt {veedel}. Keine Fragen.',
  ],
  allianceOffer: [
    '{boss}: {enemy} wird uns zu groß. Du hilfst uns, wir lassen dich in Ruhe. Für {price} bist du dabei.',
  ],
} as const;

type GangTextKey = keyof typeof GANG_TEXTS;

/**
 * Eigene Stimmen (Auftrag 30): Die Hamburger Gangs reden anders. Fehlt ein Anlass hier, gilt GANG_TEXTS.
 */
export const GANG_VOICES: Readonly<Record<string, Partial<Record<GangTextKey, readonly string[]>>>> = {
  'hh-kiez': {
    warning: [
      '{boss}: Moin. Auf dem Kiez fragt man vorher, wem die Tür gehört. In {veedel} gehören sie alle uns.',
      '{boss}: Freundlicher Hinweis von der Tür: {veedel} ist kein Ort für Laufkundschaft wie dich.',
    ],
    threat: [
      '{boss}: Eintritt kostet. {tribute} die Woche, dann darfst du in {veedel} rein. Sonst bleibst du draußen.',
    ],
    war: ['{boss}: Hausverbot. Auf dem ganzen Kiez. Und meine Jungs vergessen keine Gesichter.'],
    raidLost: ['{boss}: Das war die Rechnung vom Haus. Mit Trinkgeld.'],
    offer: ['{boss}: Ich hab {amount} über, beste Ware vom Kiez. {price}, abholen in {veedel}. Bis Ladenschluss.'],
  },
  'hh-hafen': {
    warning: [
      '{boss}: Hör mal zu, Rheinländer. {veedel} ist Hafen. Und im Hafen wird nicht gefragt, da wird geschoben.',
      '{boss}: Wir haben gesehen, was du in {veedel} treibst. Noch so ein Ding und du schwimmst.',
    ],
    threat: ['{boss}: {tribute} die Woche. Bar. Sonst verschwindet dein Kram so wie unsere Container: spurlos.'],
    war: ['{boss}: Jetzt ist Schluss mit lustig. Wir kommen mit dem Gabelstapler.'],
    raidLost: ['{boss}: Das war nur der erste Container. Wir haben noch tausend.'],
    offer: ['{boss}: Is was vom Laster gefallen. {amount} für {price}, in {veedel} am Kai. Nicht quatschen.'],
  },
  'hh-schanze': {
    warning: [
      '{boss}: Hey. Wir haben das im Plenum besprochen: {veedel} ist unser Viertel. Deins ist es nicht.',
      '{boss}: Nur damit das klar ist: In {veedel} weiß jede WG, wer du bist. Wir auch.',
    ],
    threat: ['{boss}: Solidaritätsbeitrag: {tribute} die Woche, dann regeln wir das unter uns. Sonst nicht.'],
    war: ['{boss}: Das Plenum hat entschieden. Gegen dich. Einstimmig.'],
    snitch: [
      '{boss}: Uns verpfeift man nicht. Wir hatten die Bullen eine Stunde vorher auf dem Schirm. Und dich jetzt auch.',
    ],
    offer: ['{boss}: Wir haben {amount} zu viel, gute Qualität. {price}, Übergabe in {veedel}. Fair Trade.'],
  },
  'hh-elbchaussee': {
    warning: [
      '{boss}: Guten Tag. Ihre Geschäfte in {veedel} sind uns aufgefallen. Unser Anwalt meldet sich nicht ohne Grund.',
      '{boss}: Man verkauft in {veedel} nicht ohne Einladung. Und Sie haben keine.',
    ],
    threat: [
      '{boss}: {tribute} wöchentlich, dann sehen wir von weiteren Schritten ab. Das ist ein großzügiges Angebot.',
    ],
    war: ['{boss}: Ich habe Sie gewarnt. Ab jetzt reden andere mit Ihnen. Die mögen keine Anwälte.'],
    raidLost: ['{boss}: Sehen Sie es als Rechnung. Unsere Preise sind nun mal höher.'],
    offer: ['{boss}: Wir hätten {amount} beste Qualität abzugeben. {price}. Abholung in {veedel}, diskret bitte.'],
  },
};
