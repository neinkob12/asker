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
