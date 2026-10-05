// Varianten der Hafen-Nachrichten (Auftrag 23) pro Stadt, gewählt mit texts.pick (keine direkte Wiederholung).
// Platzhalter: {goods}, {duration}, {quay}.

export const PORT_TEXTS: Readonly<
  Record<string, Readonly<Record<'docked' | 'seized' | 'welcome', readonly string[]>>>
> = {
  koeln: {
    docked: [
      'Dein Container ist da: {goods}. Hol ihn in den nächsten {duration} ab, danach schaut der Zoll genauer hin.',
      'Schiff ist rein, {goods} stehen an Kai 7. Du hast {duration}, dann wird’s ungemütlich.',
      'Moin aus Niehl. {goods} für dich, frisch vom Rhein. Abholen in {duration}, sonst kann ich nix mehr machen.',
      'Container für dich, {goods}. Der Zoll macht um die Zeit Pause. Noch {duration}.',
      'Deine Ladung ist angekommen: {goods}. Bitte zügig, so {duration} hast du.',
    ],
    seized: [
      'Zu spät. Der Zoll war an deinem Container, {goods} sind weg. Ich hab dir gesagt, hol das Zeug ab.',
      'Die vom Zoll haben deinen Container aufgemacht. {goods}, alles weg. Ich hab nix gesehen.',
      'Schlechte Nachrichten: Zollkontrolle an Kai 7. {goods} beschlagnahmt.',
      'Hab dich gewarnt. Der Zoll hat {goods} mitgenommen. Nächstes Mal schneller.',
      'Zoll war da, Hund dabei. {goods} sind futsch.',
    ],
    welcome: [
      'Willkommen im Hafen. Dein Platz ist Kai 7. Was da ankommt, holst du ab. Ich seh nix, ich hör nix.',
      'Kai 7 gehört jetzt dir. Ich bin der Hafenmeister, ich frag nicht und ich zähl nicht.',
      'Dein Liegeplatz ist Kai 7. Kommt was an, sag ich Bescheid. Mehr will ich nicht wissen.',
      'Willkommen in Niehl. Kai 7, Schlüssel liegt beim Pförtner. Und zügig abholen, klar?',
    ],
  },
  hamburg: {
    docked: [
      'Dein Container ist da: {goods}. Hol ihn in den nächsten {duration} ab, danach schaut der Zoll genauer hin.',
      'Moin. {goods} am {quay}. Der Zoll schläft hier nicht lange, du hast {duration}.',
      'Container ist durch, {goods}. Jetzt {duration}, dann kommt die nächste Kontrollrunde.',
      'Ladung für dich am {quay}: {goods}. Nicht trödeln, {duration}.',
      'Is angekommen. {goods}. {duration}, dann kann ich für nix garantieren.',
    ],
    seized: [
      'Zu spät. Der Zoll war an deinem Container, {goods} sind weg. Ich hab dir gesagt, hol das Zeug ab.',
      'Zoll am {quay}. {goods} beschlagnahmt. Tja.',
      'Die haben deinen Container durchleuchtet. {goods}, weg. Pech.',
      'Kontrolle am Kai, {goods} weg. Hamburg ist nicht Köln, min Jung.',
      'Zollfahndung. {goods} sind sichergestellt. Ich kenn dich nicht.',
    ],
    welcome: [
      'Moin. Dein Platz ist {quay}. Was da ankommt, holst du ab, und zwar zügig. Der Zoll hier schläft nicht.',
      'Willkommen im Hamburger Hafen. {quay} ist deiner. Schnell abholen, dann gibt’s keinen Ärger.',
      '{quay}, das ist jetzt dein Platz. Hier wird nicht lange gefackelt, also hol deine Sachen fix.',
      'Moin moin. {quay}. Der Zoll ist hier fleißiger als in Köln, nur damit du’s weißt.',
    ],
  },
};
