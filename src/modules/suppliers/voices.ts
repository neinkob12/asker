// Stimmen der Lieferanten (Auftrag 23): Jeder Ansprechpartner schreibt in seinem eigenen Ton. Gewählt wird mit dem
// Text-Helfer des Kerns (texts.pick), der dieselbe Variante nicht direkt wiederholt.
// Ton: Toni (Frankfurt) hektisch, Hein (Hamburg) wortkarg norddeutsch, Mirko (Berlin) Berliner Schnauze, Daan
// (Amsterdam) locker holländisch, Jansen (Rotterdam) geschäftsmäßig, Kalle (Köln) kölsch, Enzo (Verona) italienisch.
//
// Platzhalter: {goods} (z.B. "50 g Gras"), {reason} (Grund aus problems.ts, als Satzteil), {delay} (Dauer),
// {cost} (Aufpreis oder Schmiergeld), {debt}, {extra} (Ware obendrauf), {warehouse}, {share} (Teillieferung).

export type SupplierTextKey =
  /** Nach dem Freischalten. */
  | 'unlocked'
  /** Verspätung, ohne Rückfrage. */
  | 'delayed'
  /** Verspätung mit Rückfrage (Optionen hängen an der Nachricht). */
  | 'delayedAsk'
  /** Ware beschlagnahmt (bar bezahlt / auf Kredit). */
  | 'seized'
  | 'seizedCredit'
  /** Beschlagnahme droht, Schmieren möglich. */
  | 'seizeThreat'
  | 'bribeSaved'
  | 'bribeFailed'
  /** Schlechte Ware bei der Ankunft. */
  | 'badQuality'
  /** Schulden überfällig (erstes Mal / danach). */
  | 'overdue'
  | 'overdueAgain'
  /** Chancen: früher da, Ware obendrauf, bessere Qualität. */
  | 'early'
  | 'bonus'
  | 'betterQuality'
  /** Antworten auf Entscheidungen. */
  | 'detourDone'
  | 'partialDone'
  | 'redirectDone';

export type SupplierVoice = Readonly<Record<SupplierTextKey, readonly string[]>>;

export const SUPPLIER_VOICES: Readonly<Record<string, SupplierVoice>> = {
  // Toni, Frankfurt: hektisch, immer auf der Autobahn, viele Ausrufezeichen.
  frankfurt: {
    unlocked: [
      'Abgemacht! Alles in der Lieferanten-App, ich muss los!',
      'Super, Deal! Bestell einfach über die App, ich fahr eh ständig!',
      'Geil, wir sind im Geschäft! App auf, bestellen, ich bin unterwegs!',
    ],
    delayed: [
      'Mann, Mann, Mann! {reason}. Deine {goods} kommen ca. {delay} später, sorry!',
      'Toni hier, totaler Stress: {reason}. Rechne mit {delay} mehr für deine {goods}!',
      'Ich dreh durch! {reason}. {delay} später, die {goods} sind aber sicher!',
      'Sorry, sorry! {reason}. Deine {goods}: so {delay} Verspätung. Ich drück aufs Gas, sobald es geht!',
    ],
    delayedAsk: [
      'Notfall! {reason}. Deine {goods} hängen fest, so {delay}. Was machen wir, schnell!',
      'Toni! {reason}. Das kostet {delay}. Ich hab Ideen, aber du musst entscheiden, jetzt!',
      'Scheiße, {reason}. {delay} Verspätung für die {goods}. Sag mir, wie ich fahren soll!',
      'Ich steh hier rum! {reason}. Rund {delay}. Was willst du?',
    ],
    seized: [
      'Katastrophe! {reason}. Die {goods} sind weg. Pech, so läuft das Geschäft.',
      'Toni hier, die haben mich gefilzt! {reason}. Alles weg, {goods}. Ich bin raus, für heute.',
      'Alles futsch! {reason}. Deine {goods} hat jetzt die Polizei. Tut mir leid, echt!',
      'Ich fass es nicht! {reason}. {goods}, weg. Ich muss erst mal durchatmen.',
    ],
    seizedCredit: [
      'Katastrophe! {reason}. Die {goods} sind weg. Die Schulden bleiben trotzdem, sorry!',
      'Die haben alles, {goods}! {reason}. Du schuldest mir das Geld aber noch, das weißt du!',
      'Weg, alles weg! {reason}. Und die Rechnung ist trotzdem offen, tut mir leid!',
      'Ich wurde hochgenommen! {reason}. {goods} weg, Kredit läuft weiter.',
    ],
    seizeThreat: [
      'Hilfe! {reason}. Die wollen in den Wagen gucken! Mit {cost} krieg ich die vielleicht weich. Schnell!',
      'Toni, Panik! {reason}. {cost} unter der Hand, dann geht das vielleicht gut. Ja oder nein?!',
      'Die stehen schon am Kofferraum! {reason}. Ich könnte {cost} anbieten. Sag was!',
      'Mist, Mist! {reason}. Für {cost} gucken die vielleicht weg. Entscheide dich!',
    ],
    bribeSaved: [
      'Puh! Hat geklappt, die haben genommen und mich durchgewunken! Bin unterwegs!',
      'Gerettet! Die {goods} kommen, ich zittre noch!',
      'Läuft! Geld weg, Ware da. Toni fährt weiter!',
    ],
    bribeFailed: [
      'Haben das Geld genommen und trotzdem alles eingesackt! Schweine! {goods} weg.',
      'Hat nicht geklappt! Geld weg, Ware weg. Ich kotz gleich.',
      'Die wollten nicht! {goods} sind weg. Sorry, sorry, sorry!',
    ],
    badQuality: [
      'Ich sag’s lieber gleich: {reason}. Die Ware ist nicht so gut wie versprochen. Mein Fehler!',
      'Toni hier, Beichte: {reason}. Die letzte Ladung ist schlechter. Ich mach’s beim nächsten Mal gut!',
      'Mist, {reason}. Qualität ist nicht top. Kommt nicht wieder vor!',
      'Ehrlich gesagt: {reason}. Die Ware ist mies. Sorry!',
    ],
    overdue: [
      'Du schuldest mir {debt}! Das Geld war fällig! Ich liefer nix mehr, bis du zahlst!',
      'Toni wartet auf {debt}! Ich hab auch Rechnungen! Keine Lieferung ohne Geld!',
      'Hallo?! {debt} sind fällig! Bis dahin ist Lieferstopp!',
      'Ich brauch die {debt}, jetzt! Sonst fahr ich nicht mehr für dich!',
    ],
    overdueAgain: [
      'Immer noch keine {debt}! Meine Geduld ist bald am Ende!',
      'Ich ruf hier gleich jemanden an. {debt}, sofort!',
      'Toni ist nicht mehr nett. {debt}. Heute.',
      'Ernsthaft? Immer noch {debt} offen? Das wird teuer für dich!',
    ],
    early: [
      'Freie Bahn auf der {road}! Deine {goods} sind früher da!',
      'Toni ist durchgeflogen! {goods}, schneller als gedacht!',
      'Kein Stau, kein Blitzer! Bin früher bei dir!',
    ],
    bonus: [
      'Hab noch {extra} übrig, pack ich dir einfach mit rein! Geschenk!',
      'Bonus! {extra} obendrauf, weil du so ein guter Kunde bist!',
      'Ich leg dir {extra} dazu, keine Ahnung wohin damit sonst!',
    ],
    betterQuality: [
      'Gute Nachricht! Die Charge ist besser als gedacht, top Ware!',
      'Wow, die Ware diesmal! Besser als bestellt, kein Aufpreis!',
      'Toni hat Glück gehabt: erste Sahne diesmal. Viel Spaß!',
    ],
    detourDone: [
      'Okay, ich nehm den Umweg! Kostet, aber ich bin schneller da!',
      'Abfahrt genommen, Landstraße, Vollgas!',
      'Umweg läuft! Ich meld mich!',
    ],
    partialDone: [
      'Ich bring dir {share} jetzt, den Rest später! Hab umgepackt!',
      'Teile auf! {share} kommt pünktlich, der Rest hängt noch!',
      'Okay, {share} sofort, der Rest mit Verspätung!',
    ],
    redirectDone: [
      'Ich fahr zum {warehouse}, ist von hier näher!',
      'Neues Ziel: {warehouse}! Spart Zeit!',
      'Okay, {warehouse}! Bin unterwegs!',
    ],
  },
  // Hein, Hamburg: wortkarg, norddeutsch.
  hamburg: {
    unlocked: ['Jo. Läuft über die App.', 'Moin. Abgemacht. App.', 'Geht klar. Bestell über die App.'],
    delayed: [
      'Moin. {reason}. {goods} kommen {delay} später.',
      '{reason}. Wird {delay} später. Hein.',
      'Dauert. {reason}. {delay}.',
      'Jo. {reason}. {goods} kommen, aber {delay} später.',
    ],
    delayedAsk: [
      'Moin. {reason}. {delay} später. Was willst du?',
      '{reason}. Kostet {delay}. Entscheide.',
      'Hein. {reason}. {delay} Verzug. Wie weiter?',
      'Problem. {reason}. {delay}. Sag an.',
    ],
    seized: [
      '{reason}. {goods} weg. Pech.',
      'Moin. {reason}. Ware ist weg. Tschüss, {goods}.',
      'Is nich gut gegangen. {reason}. {goods} beschlagnahmt.',
      '{reason}. Alles weg. Kann man nix machen.',
    ],
    seizedCredit: [
      '{reason}. {goods} weg. Schulden bleiben.',
      'Is weg. {reason}. Rechnung gilt trotzdem.',
      '{reason}. Ware beschlagnahmt. Geld will ich trotzdem.',
      'Moin. {reason}. {goods} weg, Kredit offen.',
    ],
    seizeThreat: [
      '{reason}. Die wollen gucken. {cost} könnt helfen.',
      'Moin. {reason}. Für {cost} vielleicht nicht. Ja?',
      'Hein. {reason}. {cost} bar, dann klappt das vielleicht.',
      '{reason}. Ich hätte {cost}. Soll ich?',
    ],
    bribeSaved: ['Hat geklappt. Komme.', 'Jo. Durch.', 'Läuft. Bin unterwegs.'],
    bribeFailed: ['Hat nix genützt. Weg.', 'Geld genommen, Ware auch. Mist.', 'Nee. Alles weg.'],
    badQuality: [
      'Ehrlich: {reason}. Ware is nich so gut.',
      '{reason}. Qualität mäßig. Tut mir leid.',
      'Moin. {reason}. Nich mein bestes Zeug.',
      'Sag’s gleich: {reason}. Ware schlechter.',
    ],
    overdue: [
      '{debt} sind fällig. Erst Geld, dann Ware.',
      'Moin. {debt}. Bis dahin liefer ich nich.',
      'Hein wartet. {debt}.',
      'Geld fehlt. {debt}. Lieferstopp.',
    ],
    overdueAgain: [
      'Immer noch {debt}. Wird Zeit.',
      '{debt}. Ich frag nich mehr lange.',
      'Hein. {debt}. Jetzt.',
      'Nu aber. {debt}.',
    ],
    early: ['Freie Bahn. Bin früher da.', 'Ging fix. {goods} sind gleich da.', 'Früher da. Jo.'],
    bonus: ['Pack {extra} dazu. Passt schon.', '{extra} extra. Nich fragen.', 'Hab {extra} über. Nimm.'],
    betterQuality: ['Gute Charge. Freu dich.', 'Ware is besser als sonst.', 'Feines Zeug diesmal.'],
    detourDone: ['Jo. Umweg.', 'Nehm die Landstraße.', 'Umweg. Geht los.'],
    partialDone: ['{share} jetzt, Rest später.', 'Jo. {share} kommt gleich.', 'Teile. {share} vorweg.'],
    redirectDone: ['Fahr zum {warehouse}.', 'Jo. {warehouse}.', 'Neues Ziel: {warehouse}.'],
  },
  // Mirko, Berlin: Berliner Schnauze.
  berlin: {
    unlocked: [
      'Abjemacht, Keule. Allet in der App.',
      'Na also, jeht doch. Bestell über die App.',
      'Ick freu mir. Die App weeß Bescheid.',
    ],
    delayed: [
      'Wa? {reason}. Deine {goods} kommen {delay} später, kannste nix machen.',
      'Mirko hier. {reason}. Dit dauert, so {delay}.',
      'Keule, {reason}. Rechne ma mit {delay} mehr.',
      'Allet Mist: {reason}. {goods} kommen {delay} später, aber se kommen.',
    ],
    delayedAsk: [
      'Ey, {reason}. Dit kost {delay}. Wat machen wa?',
      'Mirko. {reason}. {delay} Verspätung für die {goods}. Sach an.',
      'Na toll, {reason}. {delay}. Ick hätt da Ideen, du entscheidest.',
      'Keule, wir ham n Problem: {reason}. {delay}. Wat soll ick tun?',
    ],
    seized: [
      'Ick gloob’s nich. {reason}. Die {goods} sind weg, so läuft dit eben.',
      'Allet weg, Keule. {reason}. Haste Pech jehabt.',
      'Mirko hier. {reason}. {goods} beschlagnahmt. Schön is anders.',
      'Dit war’s. {reason}. {goods}, futsch.',
    ],
    seizedCredit: [
      '{reason}. Die {goods} sind weg. Die Kohle schuldest du mir trotzdem, wa?',
      'Allet weg. {reason}. Kredit bleibt Kredit, Keule.',
      'Mirko. {reason}. Ware weg, Schulden nich.',
      'Pech. {reason}. Und bezahlt wird trotzdem.',
    ],
    seizeThreat: [
      'Ey, {reason}. Die wolln in die Karre gucken. Mit {cost} kriegen wa dit vielleicht hin.',
      'Mirko. {reason}. {cost} unterm Tisch, dann vielleicht nich. Wat sachste?',
      'Keule, {reason}. Ick könnt {cost} anbieten. Ja oder nee?',
      '{reason}. Für {cost} gucken die vielleicht wech. Entscheid dich.',
    ],
    bribeSaved: ['Hat jeklappt, Keule! Bin unterwegs.', 'Durchjewunken! Läuft.', 'Kohle weg, Ware sicher. Passt.'],
    bribeFailed: [
      'Die ham die Kohle jenommen und die Ware ooch. Wat für Halunken.',
      'Nüscht. Allet weg.',
      'Hat nich jeklappt. {goods} weg.',
    ],
    badQuality: [
      'Ehrlich jesacht: {reason}. Dit Zeug is nich der Hit.',
      'Mirko beichtet: {reason}. Qualität is mies, sorry.',
      '{reason}. Dit war keene jute Charge.',
      'Ick sach’s dir, bevor du’s merkst: {reason}. Ware is schwach.',
    ],
    overdue: [
      'Du schuldest mir {debt}, Keule. Ohne Kohle keene Ware.',
      'Mirko wartet auf {debt}. Bis dahin is Schicht.',
      '{debt} sind fällig. Ick liefer nüscht mehr, bis dit da is.',
      'Ey, {debt}! Wird Zeit.',
    ],
    overdueAgain: [
      'Immer noch {debt}? Meine Jeduld is bald alle.',
      'Keule, {debt}. Langsam werd ick ungemütlich.',
      '{debt}. Ick frag nich ewig.',
      'Mirko is sauer. {debt}, heute.',
    ],
    early: ['Freie Bahn, Keule! Bin früher da.', 'Durchjebrettert! {goods} gleich bei dir.', 'Schneller als jedacht!'],
    bonus: [
      'Hab {extra} übrig, kriegste jeschenkt.',
      'Bonus, Keule: {extra} obendruff.',
      'Leg dir {extra} dazu. Musste nich danke sagen.',
    ],
    betterQuality: [
      'Dit Zeug diesmal, Keule! Erste Sahne.',
      'Bessere Charge als jedacht. Freu dir.',
      'Feinste Ware, Hauptstadt-Qualität.',
    ],
    detourDone: ['Jut, Umweg. Wird teurer, aber schneller.', 'Landstraße, ick komme.', 'Abjebogen. Läuft.'],
    partialDone: ['{share} bring ick jetzt, Rest kommt.', 'Jeteilt: {share} vorab.', 'Okay, {share} sofort.'],
    redirectDone: [
      'Fahr zum {warehouse}, Keule.',
      'Neues Ziel: {warehouse}. Jeht klar.',
      '{warehouse}. Bin unterwegs.',
    ],
  },
  // Daan, Amsterdam: locker holländisch.
  amsterdam: {
    unlocked: [
      'Lekker, we zijn partners! Alles in de app, man.',
      'Top, deal. Bestel maar via de App.',
      'Gezellig! Ab jetzt über die App, ja?',
    ],
    delayed: [
      'Hoi! {reason}. Deine {goods} kommen {delay} später. Rustig aan, ja?',
      'Daan hier. {reason}. So {delay} mehr. Is nicht schlimm, man.',
      'Ach, {reason}. {delay} später. Chill, die {goods} kommen.',
      'Jammer: {reason}. Rechne mit {delay}. Doei!',
    ],
    delayedAsk: [
      'Hoi, {reason}. Das kostet {delay}. Was willst du machen?',
      'Daan. {reason}. {delay} später für die {goods}. Ich hab Optionen, ja?',
      'Probleempje: {reason}. {delay}. Sag mir, wie wir das machen.',
      'Ach man, {reason}. {delay}. Du entscheidest.',
    ],
    seized: [
      'Jammer, man. {reason}. Die {goods} sind weg.',
      'Daan hier. {reason}. Alles weg, {goods}. Shit happens.',
      'Oei. {reason}. {goods} beschlagnahmt. Sorry, ja?',
      'Echt balen. {reason}. Weg ist weg.',
    ],
    seizedCredit: [
      'Jammer. {reason}. {goods} weg, aber die Rechnung bleibt, ja?',
      '{reason}. Alles weg. Schulden sind Schulden, man.',
      'Daan. {reason}. Ware weg, Kredit nicht.',
      'Oei. {reason}. Und bezahlt wird trotzdem, sorry.',
    ],
    seizeThreat: [
      'Hoi, {reason}. Die wollen alles sehen. Mit {cost} vielleicht nicht, ja?',
      'Daan. {reason}. {cost} unter der Hand? Kann klappen.',
      'Problem: {reason}. Ich könnte {cost} geben. Wat denk je?',
      '{reason}. Für {cost} schauen die vielleicht weg. Ja of nee?',
    ],
    bribeSaved: ['Lekker, hat geklappt! Ich komme.', 'Geregeld, man. Bin unterwegs.', 'Top, durch!'],
    bribeFailed: ['Jammer, Geld weg und Ware weg.', 'Nee man, die haben alles.', 'Hat nicht geklappt. {goods} weg.'],
    badQuality: [
      'Eerlijk gezegd: {reason}. Die Ware ist nicht top.',
      'Daan hier. {reason}. Qualität ist meh, sorry.',
      '{reason}. Nicht meine beste Charge, ja?',
      'Ich sag es lieber: {reason}. Ware ist schwächer.',
    ],
    overdue: [
      'Hoi, {debt} sind fällig. Ohne Geld keine Ware, ja?',
      'Daan wartet auf {debt}. Bis dahin pauze.',
      '{debt} offen, man. Erst zahlen.',
      'Jo, {debt}. Dann liefer ich wieder.',
    ],
    overdueAgain: [
      'Immer noch {debt}, man? Nicht chill.',
      'Daan wird ungeduldig. {debt}.',
      '{debt}. Ich frag nicht mehr nett.',
      'Kom op, {debt}!',
    ],
    early: ['Lekker, freie Bahn! Bin früher da.', 'Schnell durchgekommen, {goods} sind gleich da.', 'Früher da, man!'],
    bonus: ['Ik geef je {extra} extra, ja?', 'Cadeautje: {extra} obendrauf.', '{extra} extra. Geniet ervan.'],
    betterQuality: ['Diesmal echt top Ware, man!', 'Bessere Charge als gedacht. Lekker!', 'Primo kwaliteit diesmal.'],
    detourDone: ['Oké, Umweg. Kostet, geht schneller.', 'Andere Route, ja. Geht los.', 'Umweg. Doei!'],
    partialDone: ['{share} jetzt, Rest später, ja?', 'Oké: {share} sofort.', 'Geteilt. {share} vorab.'],
    redirectDone: ['Ich fahr zum {warehouse}.', '{warehouse}, prima.', 'Oké, {warehouse}.'],
  },
  // Jansen, Rotterdam: geschäftsmäßig, sachlich.
  rotterdam: {
    unlocked: [
      'Vereinbart. Die Konditionen finden Sie in der Lieferanten-App.',
      'Wir sind im Geschäft. Bestellungen bitte über die App.',
      'Gut. Alles Weitere über die App.',
    ],
    delayed: [
      'Mitteilung: {reason}. Ihre {goods} verspäten sich um ca. {delay}.',
      'Jansen. {reason}. Neue Ankunft: ca. {delay} später.',
      'Zur Information: {reason}. Verzögerung etwa {delay}.',
      'Leider: {reason}. Die {goods} kommen ca. {delay} später an.',
    ],
    delayedAsk: [
      'Jansen. {reason}. Verzögerung ca. {delay}. Wie möchten Sie verfahren?',
      'Mitteilung: {reason}. {delay} Verzug. Es gibt Optionen.',
      '{reason}. Etwa {delay}. Bitte entscheiden Sie.',
      'Leider {reason}. {delay}. Ihre Anweisung?',
    ],
    seized: [
      'Bedauerlich: {reason}. Die {goods} sind verloren.',
      'Jansen. {reason}. Ladung beschlagnahmt: {goods}.',
      'Mitteilung: {reason}. Totalverlust, {goods}.',
      'Leider: {reason}. Die Ware ist weg. Das Risiko trägt der Käufer.',
    ],
    seizedCredit: [
      'Bedauerlich: {reason}. Die {goods} sind verloren. Die Forderung bleibt bestehen.',
      'Jansen. {reason}. Ladung weg. Der Kredit ist dennoch fällig.',
      '{reason}. Verlust der Ware, die Rechnung gilt.',
      'Leider: {reason}. Die Schulden bleiben davon unberührt.',
    ],
    seizeThreat: [
      'Jansen. {reason}. Mit {cost} ließe sich das eventuell regeln.',
      'Vertraulich: {reason}. Ein Betrag von {cost} könnte helfen.',
      '{reason}. Ich könnte {cost} einsetzen. Ihre Entscheidung.',
      'Mitteilung: {reason}. {cost} unter der Hand, Erfolg nicht garantiert.',
    ],
    bribeSaved: ['Erledigt. Die Ladung ist freigegeben.', 'Geregelt. Die Ware ist unterwegs.', 'Freigegeben.'],
    bribeFailed: [
      'Erfolglos. Das Geld ist weg, die Ware auch.',
      'Bedauerlich: abgelehnt. {goods} beschlagnahmt.',
      'Leider kein Erfolg.',
    ],
    badQuality: [
      'Zur Kenntnis: {reason}. Die Qualität liegt unter der Zusage.',
      'Jansen. {reason}. Die Ware entspricht nicht der Spezifikation.',
      'Mitteilung: {reason}. Qualität gemindert.',
      'Leider: {reason}. Ich bitte um Entschuldigung.',
    ],
    overdue: [
      'Ihre Zahlung über {debt} ist überfällig. Weitere Lieferungen erst nach Ausgleich.',
      'Jansen. Offen: {debt}. Lieferstopp bis zur Zahlung.',
      'Mahnung: {debt}. Wir liefern erst nach Zahlungseingang.',
      'Fällig: {debt}. Bitte begleichen.',
    ],
    overdueAgain: [
      'Zweite Mahnung: {debt}.',
      'Jansen. Noch immer {debt} offen. Das wird Konsequenzen haben.',
      'Letzte Erinnerung: {debt}.',
      '{debt}. Meine Geduld ist begrenzt.',
    ],
    early: [
      'Mitteilung: Die Ladung ist früher da.',
      'Gute Bedingungen auf dem Rhein. Früher da.',
      'Vorzeitige Ankunft.',
    ],
    bonus: [
      'Zur Kenntnis: {extra} zusätzlich, ohne Berechnung.',
      'Überschuss im Container: {extra}. Gehört Ihnen.',
      'Kulanz: {extra} extra.',
    ],
    betterQuality: [
      'Die Ladung übertrifft die Spezifikation.',
      'Qualität besser als zugesagt.',
      'Erfreulich: hervorragende Charge.',
    ],
    detourDone: ['Umleitung veranlasst.', 'Alternativroute gebucht.', 'Erledigt, schnellere Route.'],
    partialDone: ['Teillieferung: {share} vorab.', '{share} kommen pünktlich.', 'Aufgeteilt: {share} zuerst.'],
    redirectDone: ['Neues Ziel: {warehouse}.', 'Umgeleitet zum {warehouse}.', 'Lieferadresse geändert: {warehouse}.'],
  },
  // Kalle aus Kalk, Köln: kölsch.
  koeln: {
    unlocked: [
      'Jot, abjemaht. Alles in der App, Jung.',
      'Kalle hier. Mer sin em Jeschäff. App!',
      'Läuft. Bestell einfach über die App.',
    ],
    delayed: [
      'Kalle. {reason}. Deine {goods} kommen {delay} später. Et kütt, wie et kütt.',
      'Jung, {reason}. Dauert {delay} länger. Et hätt noch immer jot jejange.',
      'Ach du Schreck: {reason}. {delay} später, aber die {goods} kommen.',
      'Wat soll isch sagen? {reason}. {delay}.',
    ],
    delayedAsk: [
      'Kalle. {reason}. {delay} später. Wat mache mer?',
      'Jung, {reason}. Kost {delay}. Du sachst, wie et weitergeht.',
      '{reason}. {delay} Verspätung. Isch hätt da wat, wenn de willst.',
      'Hör ens: {reason}. {delay}. Entscheid du.',
    ],
    seized: [
      'Kalle. {reason}. Die {goods} sin wesch. Dat is Pech.',
      'Jung, {reason}. Alles wesch. Et is, wie et is.',
      '{reason}. {goods} haben die Bullen jetzt.',
      'Dat war nix. {reason}. {goods} futsch.',
    ],
    seizedCredit: [
      'Kalle. {reason}. {goods} wesch. Dat Jeld will isch trotzdem.',
      '{reason}. Alles wesch, Schulden bleiben, Jung.',
      'Jung, {reason}. Wat wesch is, is wesch. Dat Jeld nit.',
      '{reason}. Ware wesch, Rechnung jilt.',
    ],
    seizeThreat: [
      'Kalle. {reason}. Mit {cost} kriej isch dat vielleicht hin. Klüngel, du weißt.',
      'Jung, {reason}. {cost} für den Kollegen, dann sieht der nix. Ja?',
      '{reason}. Isch kenn da einen. {cost}. Wat meinste?',
      'Hör ens: {reason}. Für {cost} jeht dat vielleicht jut.',
    ],
    bribeSaved: ['Jeklappt! Kölsche Lösung. Bin unterwegs.', 'Klüngel wirkt. Ware kommt.', 'Läuft, Jung!'],
    bribeFailed: ['Hätt nit jeklappt. Allet wesch.', 'Der Kollesch wollt nit. {goods} wesch.', 'Nix. Wesch.'],
    badQuality: [
      'Kalle, ehrlich: {reason}. Dat Zeuch is nit so jut.',
      '{reason}. Qualität mau, Jung. Tut mir leid.',
      'Isch sach et lieber jetzt: {reason}. Ware schwach.',
      'Dat wor nix: {reason}. Mieses Zeuch diesmal.',
    ],
    overdue: [
      'Kalle. {debt} sin fällig. Ohne Jeld keine Ware.',
      'Jung, {debt}. Bis dahin liefer isch nix.',
      '{debt} offen. Isch hab auch Familie.',
      'Wat is mit de {debt}? Lieferstopp.',
    ],
    overdueAgain: [
      'Immer noch {debt}, Jung? Dat jeht nit.',
      'Kalle wird sauer. {debt}.',
      '{debt}. Isch frach nit ewisch.',
      'Jetzt aber: {debt}.',
    ],
    early: ['Kalle is fix! Bin früher da.', 'Kein Stau am Ring. {goods} jleich bei dir.', 'Früher da, Jung.'],
    bonus: ['Isch leg dir {extra} dazu. Für de Nachbarschaft.', '{extra} extra, Jung.', 'Hab {extra} über. Nimm.'],
    betterQuality: ['Diesmal is dat Zeuch prima!', 'Jute Charge, Jung. Jenieß et.', 'Erste Sahne diesmal.'],
    detourDone: ['Jot, isch fahr außenrum.', 'Umweg. Dauert nit lang.', 'Isch nehm de Abkürzung.'],
    partialDone: ['{share} bring isch jetzt.', 'Jot: {share} vorab, Rest später.', 'Jeteilt. {share} kommt.'],
    redirectDone: ['Isch fahr zum {warehouse}.', '{warehouse}, jot.', 'Neues Ziel: {warehouse}.'],
  },
  // Enzo, Verona (Auftrag 38): herzlich, italienisch gemischt, über den Brenner.
  italien: {
    unlocked: [
      'Perfetto! Benvenuto, amico. Bestell über die App, ich bring alles über den Brenner.',
      'Bene, bene. Wir sind im Geschäft. Die App, und ich fahre los.',
      'Allora, abgemacht. Beste Ware aus Verona, direkt zu dir.',
    ],
    delayed: [
      'Madonna. {reason}. {goods} kommen {delay} später, scusa.',
      'Amico, {reason}. Wird {delay} später, ma arriva.',
      'Pazienza: {reason}. {delay} Verspätung.',
      'Scusami. {reason}. {goods} kommen, nur {delay} später.',
    ],
    delayedAsk: [
      'Problema, amico: {reason}. {delay} später. Was machen wir?',
      'Enzo hier. {reason}. Das kostet {delay}. Du entscheidest.',
      'Allora. {reason}. {delay} Verzug. Wie willst du?',
      'Madonna santa, {reason}. {delay}. Dimmi.',
    ],
    seized: [
      'Disastro. {reason}. {goods} sind weg.',
      'Mi dispiace, amico. {reason}. Alles beschlagnahmt.',
      '{reason}. {goods} weg. Che sfortuna.',
      'Brutto giorno. {reason}. Die Ware ist verloren.',
    ],
    seizedCredit: [
      '{reason}. {goods} weg. Aber der Kredit bleibt, capisci.',
      'Mi dispiace. {reason}. Ware weg, Rechnung bleibt.',
      'Disastro: {reason}. Das Geld brauche ich trotzdem, amico.',
      '{reason}. Alles weg. Die Schulden leider nicht.',
    ],
    seizeThreat: [
      'Attenzione: {reason}. Mit {cost} redet der Mann vielleicht anders.',
      'Enzo. {reason}. {cost}, und wir fahren weiter. Sì?',
      'Amico, {reason}. Ich kenne einen, {cost}. Soll ich?',
      '{reason}. Für {cost} schaut er vielleicht weg. Dimmi.',
    ],
    bribeSaved: ['Fatto! Wir fahren weiter.', 'Perfetto, durch. Arrivo.', 'Grazie, amico. Alles gut.'],
    bribeFailed: ['Niente. Geld weg, Ware weg.', 'Madonna. Hat nicht geklappt.', 'Mi dispiace. Nix zu machen.'],
    badQuality: [
      'Sincero: {reason}. Die Ware ist nicht wie sonst.',
      '{reason}. Qualität mittel, scusa.',
      'Amico, {reason}. Nicht mein bestes Zeug diesmal.',
      'Ich sag es gleich: {reason}. Schlechter als sonst.',
    ],
    overdue: [
      'Amico, {debt} sind fällig. Erst das Geld, poi la merce.',
      'Enzo wartet auf {debt}. Bis dahin fahre ich nicht.',
      '{debt}, per favore. Sonst kein Brenner mehr.',
      'Allora. {debt}. Dann reden wir weiter.',
    ],
    overdueAgain: [
      'Immer noch {debt}. Non va bene.',
      '{debt}, amico. Meine Geduld ist auch aus Verona, nicht aus Stahl.',
      'Enzo wird ungemütlich. {debt}.',
      'Basta. {debt}. Jetzt.',
    ],
    early: [
      'Freie Fahrt am Brenner! Bin früher da.',
      'Veloce! {goods} sind gleich bei dir.',
      'Prima del previsto. Früher da.',
    ],
    bonus: ['Ich leg {extra} dazu. Un regalo.', '{extra} extra, per te.', 'Hab {extra} übrig. Prendi.'],
    betterQuality: ['Che qualità! Beste Charge.', 'Diesmal ist es eccellente.', 'Feinste Ware vom Gardasee.'],
    detourDone: [
      'Va bene, ich fahre über den Reschenpass.',
      'Umweg. Andiamo.',
      'Ich nehme die Landstraße, tranquillo.',
    ],
    partialDone: ['{share} sofort, der Rest dopo.', 'Bene: {share} vorweg.', 'Geteilt. {share} kommt jetzt.'],
    redirectDone: ['Ich fahre zum {warehouse}.', '{warehouse}, perfetto.', 'Neues Ziel: {warehouse}.'],
  },
};

/** Fallback für Lieferanten ohne eigene Stimme: Jansens sachlicher Ton. */
export function supplierVariants(supplierId: string, key: SupplierTextKey): readonly string[] {
  return (SUPPLIER_VOICES[supplierId] ?? SUPPLIER_VOICES.rotterdam)[key];
}
