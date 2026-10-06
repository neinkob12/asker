// Varianten der Routine-Nachrichten des Personals (Auftrag 23), gewählt mit texts.pick (keine direkte Wiederholung).
// Platzhalter: {amount} (Lohn), {time} (Uhrzeit oder Wochentag und Uhrzeit), {veedel}.

export const STAFF_TEXTS = {
  /** Lohn nicht gezahlt, erste Beschwerde. */
  wageMissing: [
    'Chef, wo bleibt mein Geld? {amount} für gestern. Noch einen Tag mach ich das nicht mit.',
    'Hey, gestern kam nix. {amount}. Ich hab auch Miete, weißt du?',
    'Kurze Frage: Krieg ich meine {amount} noch? Sonst such ich mir was anderes.',
    'Ich steh hier jeden Tag für dich, und dann fehlen {amount}. Morgen will ich das sehen.',
    'Chef, die {amount} von gestern fehlen. Einmal sag ich nix. Zweimal schon.',
  ],
  /** Kündigt, weil die Loyalität weg ist. */
  quit: [
    'Ich bin raus. Such dir wen anders.',
    'Das war’s für mich. Viel Glück, ehrlich.',
    'Ich hör auf. Frag nicht warum, du weißt es.',
    'Hab was Besseres gefunden. Tschüss, Chef.',
    'Ich bin weg. Meine Sachen hol ich nicht mehr ab.',
  ],
  /** Warnung des Polizei-Kontakts vor einer Razzia. */
  raidWarning: [
    'Pass auf: Die Kollegen planen für {time} eine Razzia in {veedel}. Zieh deine Leute ab, wenn du schlau bist.',
    'Von mir hast du das nicht: {veedel}, {time}, Razzia. Mach was draus.',
    'Kleiner Tipp aus dem Präsidium: Um {time} kommen sie nach {veedel}. Ich würd da niemanden stehen lassen.',
    'Die Einsatzplanung hängt aus. {veedel}, {time}. Du hast nichts von mir gehört.',
    'Heute Morgen in der Lagebesprechung: {veedel}, gegen {time}. Sieh zu, dass deine Leute weg sind.',
  ],
  /** Warnung vor einer Großrazzia. */
  majorRaidWarning: [
    'Großes Ding: Die Kripo plant für {time} eine Großrazzia, auch in {veedel}. Zieh die Leute dort vorher ab.',
    'Die machen ernst: {time}, mehrere Viertel auf einmal, {veedel} ist dabei. Hol deine Leute runter.',
    'Das kommt von ganz oben: Großrazzia, {time}, unter anderem {veedel}. Ich kann dir nicht mehr helfen als das.',
    'Hundertschaften für {time}. {veedel} steht auf der Liste. Wenn du da wen hast: weg damit.',
    'Ich riskier hier meinen Job: Großrazzia {time}, auch {veedel}. Mach sauber.',
  ],
  /** Geht mit, weil jemand entlassen wurde, den die Person mag (Auftrag 34). Platzhalter {other}. */
  leaveWith: [
    'Du schmeißt {other} raus? Dann bin ich auch weg.',
    'Ohne {other} mach ich hier nicht weiter. Tschüss.',
    '{other} war der Grund, warum ich das hier mache. Ich bin raus.',
    'Wer {other} so behandelt, behandelt mich irgendwann genauso. Ich geh.',
  ],
} as const;
