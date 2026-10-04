// Stimmen der Gangs für Handy-Nachrichten (Auftrag 23): Jede Gang hat für jeden Anlass mindestens fünf eigene
// Varianten. Gewählt wird mit dem Text-Helfer des Kerns (texts.pick), der dieselbe Variante nicht direkt wiederholt.
// Platzhalter: {boss}, {gang} immer; {veedel} (warning, threat, war, offer), {tribute} (threat, tributeDue),
// {amount}, {price} (offer, Angebote), {enemy} (allianceOffer, Warnung vor Rivalen), weitere je Anlass unten.
//
// Ton (vom Spieler ausgewählt): Hafenkolonne grob, kölsch, kurz. Venloer Syndikat förmlich, juristisch, droht über
// Dritte. Schäl Sick rotzig, Preise, Masse. Marienburger Kreis leise, gebildet, kalt. Hamburg: Neonkrone Türsteher-Ton,
// Containerjungs grob vom Hafen, Kollektiv Plenum und WG, Elbchaussee-Club höflich-herablassend.

/** Anlässe für Nachrichten der Gangs. */
export type GangTextKey =
  | 'warning'
  | 'threat'
  | 'war'
  | 'raidWon'
  | 'raidLost'
  | 'attacked'
  | 'snitch'
  | 'tributeDue'
  | 'protectionRefused'
  | 'offer'
  | 'allianceOffer';

export type GangVoice = Readonly<Record<GangTextKey, readonly string[]>>;

export const GANG_VOICES: Readonly<Record<string, GangVoice>> = {
  // ⚓ Hafenkolonne, Jupp „Kran“ Wendeler: grob, kölsch, kurz.
  nord: {
    warning: [
      'Jung, du verkaufst in {veedel}. Dat is unser Pflaster. Nächstes Mal reden wir nicht.',
      'Jupp hier. {veedel} gehört der Kolonne. Pack deine Tütchen ein.',
      'Hör zu, Pänz. In {veedel} verkauft nur einer, und dat bist nicht du.',
      'Wir haben dich in {veedel} gesehen. Einmal sag ich dat. Einmal.',
      'Kleiner, dat hier is nicht dein Veedel. {veedel} is Hafen. Verpiss dich, solang du noch laufen kannst.',
      'Noch so ein Tag in {veedel} und meine Jungs kommen vorbei. Nicht zum Kaffee.',
    ],
    threat: [
      'Du hörst nicht zu. {tribute} die Woche, oder wir kommen nach {veedel}. Mit Kran.',
      'Jupp. Ab jetzt zahlst du. {tribute} pro Woche. Sonst gibt et Ärger, und zwar richtig.',
      '{tribute} jede Woche, bar. Dann darfst du in {veedel} weiter deinen Kram verticken.',
      'Letzte Ansage, Jung: {tribute} pro Woche. Is billiger als ein neues Gebiss.',
      'Meine Jungs sind schon unruhig. {tribute} die Woche beruhigt die. Du hast die Wahl.',
    ],
    war: [
      'Gut. Dann eben so. Ab heute schaust du dich besser um.',
      'Du willst Krieg? Kriegste. Grüß deine Leute, solang sie noch stehen.',
      'Jupp hat genug gequatscht. Ab jetzt redet der Kran.',
      'Ab heute bist du Freiwild in ganz Köln. Dat hast du dir selbst eingebrockt.',
      'Ich hab gefragt. Du hast gelacht. Jetzt lach mal weiter.',
    ],
    raidWon: [
      'Glück gehabt. Nächstes Mal bringen wir mehr Jungs mit.',
      'Dat war knapp für dich. Wir kommen wieder.',
      'Hast dich gewehrt. Respekt. Aber wir haben mehr Leute als du.',
      'Eins zu null für dich. Dat Spiel is lang.',
      'Meine Jungs bluten. Deine bald auch.',
    ],
    raidLost: [
      'Dat war die Quittung. Willst du noch eine?',
      'So fühlt sich dat an, Jung. Merk dir dat.',
      'Wir haben genommen, wat wir wollten. Nächstes Mal mehr.',
      'Kölsche Antwort auf deine Frechheit. Prost.',
      'Und dat war nur ein Abend. Wir haben viele Abende.',
    ],
    attacked: [
      'Du hast gerade einen Krieg angefangen, den du nicht gewinnen kannst.',
      'Meine Jungs. Mein Spot. Dat zahlst du doppelt zurück.',
      'Biste bekloppt? Die Kolonne vergisst so wat nicht.',
      'Dat war dein Fehler. Der Hafen hat ein langes Gedächtnis.',
      'Jetzt wird et ungemütlich für dich, Jung. Ganz ungemütlich.',
    ],
    snitch: [
      'Wir wissen, wer bei den Bullen gesungen hat. Du hörst von uns.',
      'Ein Spitzel. Ausgerechnet du. In Nippes hängt man so wat nicht an die große Glocke. Man regelt dat.',
      'Die Bullen waren bei uns. Und wir wissen, wer die geschickt hat.',
      'Petzen is dat Letzte, Jung. Dat Allerletzte.',
      'Du hast gesungen. Jetzt singen wir. Und dir wird dat Lied nicht gefallen.',
    ],
    tributeDue: [
      'Woche is rum. {tribute} für die nächste. Du weißt, wie dat läuft.',
      'Zahltag, Jung. {tribute}. Nicht vergessen.',
      'Jupp hier. Die nächsten {tribute} sind fällig.',
      'Neue Woche, neue {tribute}. Is wie Miete, nur ohne Mieterschutz.',
      'Meine Jungs fragen schon nach dir. {tribute}, dann sind die wieder ruhig.',
    ],
    protectionRefused: [
      'Diese Woche gibt et kein Geld. Hol et dir doch.',
      'Schutzgeld? Von uns? Vergiss et.',
      'Die Kasse is leer. Und wenn nicht: Komm und hol et.',
      'Die Kolonne zahlt nicht mehr. Wat willste machen?',
      'Hast du gedacht, dat geht ewig so? Diese Woche nix.',
    ],
    offer: [
      'Hab {amount} übrig, vom Hafen. {price}, Übergabe in {veedel}. Heute noch.',
      'Is wat reingekommen. {amount} für {price}. Treffpunkt {veedel}, keine Fragen.',
      'Jupp. {amount} Ware, {price}. Abholen in {veedel}, sonst geht et an wen anders.',
      'Freundschaftspreis, weil heut Sonntag is. Is nicht Sonntag? Egal. {amount} für {price}, in {veedel}.',
      'Wir haben zu viel. {amount} für {price}. In {veedel} am Kran. Bar.',
    ],
    allianceOffer: [
      '{enemy} wird uns zu frech. Du hilfst uns, wir lassen dich in Ruhe. {price}, dann bist du dabei.',
      'Jupp hier. Gemeinsamer Feind: {enemy}. Für {price} gehen wir zusammen drauf.',
      'Die von {enemy} brauchen eine Abreibung. Du zahlst {price}, wir machen den Rest.',
      'Ich mag dich nicht. {enemy} mag ich noch weniger. {price} und wir sind Kollegen.',
      'Feind von meinem Feind und so. {enemy}. {price}. Ja oder nein.',
    ],
  },
  // 🕸 Venloer Syndikat, Nadine Schrader („die Notarin“): förmlich, juristisch, droht über Dritte.
  west: {
    warning: [
      'Frau Schrader lässt ausrichten: Ihre Aktivitäten in {veedel} sind aufgefallen. Man könnte das dem Präsidium gegenüber erwähnen.',
      'Im Auftrag von Frau Schrader: Wir weisen darauf hin, dass {veedel} vertraglich vergeben ist. An uns.',
      'Eine freundliche Mitteilung des Syndikats: In {veedel} gelten Regeln. Sie kennen sie offenbar nicht.',
      'Frau Schrader hat Ihren Namen auf einer Liste gesehen. Noch ist es eine kurze Liste. {veedel}, bitte meiden.',
      'Man hat uns Ihre Geschäfte in {veedel} zugetragen. Wir würden ungern einen Bekannten bei der Kripo bemühen.',
    ],
    threat: [
      'Frau Schrader schlägt eine Vereinbarung vor: {tribute} pro Woche. Andernfalls erhält das Präsidium einen anonymen Hinweis zu {veedel}.',
      'Wir haben ein Angebot aufgesetzt: {tribute} wöchentlich, und {veedel} bleibt für Sie ruhig. Unterschreiben müssen Sie nicht. Zahlen schon.',
      'Die Notarin bittet um {tribute} pro Woche. Die Alternative wäre ein Gespräch zwischen unseren Freunden und Ihren Lagern.',
      'Wöchentliche Gebühr: {tribute}. Die Konditionen sind nicht verhandelbar, die Folgen bei Nichtzahlung leider auch nicht.',
      'Im Auftrag: {tribute} pro Woche sichern Ihnen Diskretion. Diskretion ist in {veedel} ein knappes Gut.',
    ],
    war: [
      'Frau Schrader betrachtet die Gespräche als gescheitert. Sie werden von uns hören. Über Umwege.',
      'Die Vereinbarung ist hinfällig. Ab heute kümmern sich andere um Sie. Wir bleiben im Hintergrund.',
      'Wir haben Ihnen eine Frist gesetzt. Sie ist verstrichen. Man wird Sie ab jetzt behandeln wie einen Fremden.',
      'Die Notarin hat entschieden. Gegen Sie. Die Akte ist eröffnet.',
      'Bedauerlich. Frau Schrader schätzt Einsicht. Sie haben sich für das Gegenteil entschieden.',
    ],
    raidWon: [
      'Frau Schrader nimmt zur Kenntnis, dass Sie sich gewehrt haben. Sie wird es bei der nächsten Planung berücksichtigen.',
      'Ein vorläufiges Ergebnis zu Ihren Gunsten. Vorläufig.',
      'Unsere Mitarbeiter waren unzureichend vorbereitet. Das wird nicht wieder vorkommen.',
      'Man gratuliert. Leise. Und plant neu.',
      'Ein Etappensieg. Die Notarin denkt in Instanzen.',
    ],
    raidLost: [
      'Betrachten Sie das als erste Mahnung. Die zweite kommt mit Kosten.',
      'Frau Schrader lässt ausrichten: Das war die höfliche Variante.',
      'Wir haben uns genommen, was uns zusteht. Mit Zinsen.',
      'Die Rechnung ist beglichen. Für diesen Monat.',
      'Sie wissen jetzt, wie wir arbeiten. Gründlich und ohne Zeugen.',
    ],
    attacked: [
      'Ein Angriff auf unsere Leute. Frau Schrader hat bereits einen Anwalt und zwei andere Herren informiert.',
      'Das war ungeschickt. Wir dokumentieren so etwas. Für die richtigen Stellen.',
      'Sie haben gerade aus einer Meinungsverschiedenheit einen Rechtsstreit gemacht. Nach unseren Regeln.',
      'Die Notarin ist verärgert. Das kommt selten vor. Es endet nie gut.',
      'Wir werden das nicht vergessen. Wir vergessen grundsätzlich nichts. Wir haben Archive.',
    ],
    snitch: [
      'Unsere Freunde im Präsidium haben uns verraten, wer uns verraten hat. Sie verstehen die Ironie.',
      'Frau Schrader weiß, von wem der Hinweis kam. Sie war darüber nicht amüsiert.',
      'Ein anonymer Hinweis. Wie originell. Unsere Quellen sind weniger anonym als Ihre.',
      'Sie haben die Polizei bemüht. Wir bemühen jetzt jemand anderen.',
      'Wir haben Leute im Präsidium. Haben Sie das wirklich nicht gewusst?',
    ],
    tributeDue: [
      'Erinnerung des Syndikats: Die nächste Rate von {tribute} ist fällig.',
      'Frau Schrader bittet um Überweisung von {tribute}. Bar, versteht sich.',
      'Die Vereinbarung verlängert sich um eine Woche, sobald {tribute} eingegangen sind.',
      'Fälligkeit: heute. Betrag: {tribute}. Mahngebühren erheben wir anders.',
      'Höfliche Erinnerung: {tribute}. Unhöfliche Erinnerungen verschicken wir ungern.',
    ],
    protectionRefused: [
      'Frau Schrader sieht sich diese Woche außerstande zu zahlen. Sie dürfen das gerne anfechten.',
      'Die Zahlung entfällt. Unsere Juristen sehen keine Grundlage mehr.',
      'Wir haben die Vereinbarung geprüft und für nichtig befunden. Holen Sie es sich, wenn Sie können.',
      'Keine Zahlung diese Woche. Beschwerden bitte schriftlich an niemanden.',
      'Das Syndikat zahlt nicht mehr. Die Gründe sind vertraulich.',
    ],
    offer: [
      'Frau Schrader hätte {amount} abzugeben. {price}, Übergabe in {veedel}, Kiosk an der Venloer.',
      'Ein Angebot unter Geschäftsleuten: {amount} für {price}. Abholung in {veedel}, nur heute.',
      'Wir haben einen Überhang von {amount}. Zu {price} gehört er Ihnen. Treffpunkt {veedel}, diskret.',
      'Im Auftrag: {amount}, {price}. Übergabe in einem Wettbüro in {veedel}. Fragen Sie nach Herrn K.',
      'Restposten, einwandfreie Ware: {amount} für {price}. In {veedel}. Die Frist ist kurz.',
    ],
    allianceOffer: [
      'Frau Schrader schlägt eine Partnerschaft gegen {enemy} vor. Ihr Beitrag: {price}.',
      '{enemy} stört unser Geschäft und Ihres. Gegen {price} kümmern wir uns gemeinsam darum.',
      'Ein Bündnis auf Zeit, gegen {enemy}. Die Notarin hat den Vertrag schon im Kopf. Kosten: {price}.',
      'Wir hätten Verwendung für Sie, gegen {enemy}. Einmalige Gebühr: {price}.',
      'Strategische Kooperation, Ziel {enemy}, Kostenanteil {price}. Frau Schrader erwartet Ihre Antwort.',
    ],
  },
  // 🔥 Schäl Sick, Kalle Brenner: rotzig, Preise, Masse.
  ost: {
    warning: [
      'Bei uns kostet dat Gramm 6 €. Bei dir 9? Viel Glück in {veedel}, Bruder.',
      'Kalle hier. {veedel}? Da sind wir billiger, mehr und schneller. Such dir wat anderes.',
      'Ey, du verkaufst in {veedel}? Lustig. Die Kunden laufen eh zu uns.',
      'Die Schäl Sick sieht dich, Bruder. {veedel} is unser Revier. Wir sind mehr als du.',
      'Kleiner Tipp vom Kalle: Mit deinen Preisen überlebst du in {veedel} keine Woche.',
    ],
    threat: [
      'Pass auf: {tribute} die Woche, dann lassen wir dich in {veedel} in Ruhe. Sonst fluten wir dat Veedel mit Ware für nix.',
      'Kalle. {tribute} pro Woche. Billiger kriegste dat nirgends, glaub mir.',
      '{tribute} jede Woche, Bruder. Oder wir verkaufen in {veedel} zum halben Preis, bis du pleite bist.',
      'Du zahlst {tribute} die Woche. Is Masse-Rabatt schon drin.',
      'Ey, {tribute}, jede Woche. Wir sind zwanzig, du bist allein. Rechne selbst.',
    ],
    war: [
      'Okay, dann Krieg. Wir sind mehr. Wir sind immer mehr.',
      'Kalle hat gesprochen: Ab heute machen wir dich fertig. Preise, Leute, alles.',
      'Bruder, du hast es verkackt. Jetzt kommt die ganze Schäl Sick.',
      'Ab heute bist du auf der rechten Rheinseite unerwünscht. Und auf der linken bald auch.',
      'Masse schlägt Klasse. Wirst du sehen.',
    ],
    raidWon: [
      'Glück gehabt. Wir haben noch dreißig von den Jungs.',
      'Ey, Respekt. Aber nächstes Mal kommen wir doppelt so viele.',
      'Hast gewonnen? Egal. Wir kaufen neue Leute.',
      'Dat war Pech. Für dich wird Pech noch teuer.',
      'Kalle lacht drüber. Lach du mal noch.',
    ],
    raidLost: [
      'Dat war die Quittung, Bruder. Masse, wie versprochen.',
      'Haben alles mitgenommen. Wird bei uns eh billiger verkauft.',
      'Siehste? Mehr Leute, mehr Spaß.',
      'Dein Zeug liegt jetzt bei uns im Regal. Für den halben Preis.',
      'Dat war ein Angebot, dat du nicht ablehnen konntest.',
    ],
    attacked: [
      'Du greifst die Schäl Sick an? Wir kommen über die Brücke. Alle.',
      'Ey, dat war mein Laden. Jetzt wird dein Laden mein Laden.',
      'Bruder, du hast keine Ahnung, wie viele wir sind.',
      'Kalle is sauer. Und wenn Kalle sauer is, wird et billig. Für dich teuer.',
      'Wir holen uns dat zurück. Mit Zinsen, in Ware.',
    ],
    snitch: [
      'Du hast die Bullen nach Kalk geschickt? Wir wissen dat. Kalk weiß alles.',
      'Spitzel. Auf der Schäl Sick gibt et dafür keinen Rabatt.',
      'Die Bullen waren da. Und sie haben deinen Namen fallen lassen. Dumm von denen, dumm von dir.',
      'Petze. Dat spricht sich rum. Schneller als unsere Preise.',
      'Wir haben dich für einen Konkurrenten gehalten. Bist aber nur ein Spitzel.',
    ],
    tributeDue: [
      'Kalle. {tribute}. Du weißt Bescheid.',
      'Neue Woche, gleicher Preis: {tribute}. Bei uns gibt et keine Inflation.',
      'Ey, {tribute} sind fällig. Bar oder in Ware.',
      'Zahltag, Bruder. {tribute}. Wir warten.',
      '{tribute} für die nächste Woche. Billig für dat, wat du dafür kriegst.',
    ],
    protectionRefused: [
      'Diese Woche nix, Bruder. Ware is teuer geworden.',
      'Kein Geld für dich. Komm doch rüber und hol et.',
      'Die Schäl Sick zahlt nicht mehr. Wir sind jetzt zu viele dafür.',
      'Schutzgeld? Wir schützen uns jetzt selbst. Kostet nix.',
      'Kalle sagt: is aus. Wat willste machen?',
    ],
    offer: [
      'Hab {amount} zu viel. {price}. Is spottbillig, Bruder. In {veedel}.',
      'Masse-Angebot: {amount} für {price}. Übergabe in {veedel}. Qualität? Frag nicht.',
      'Kalle hier. {amount}, {price}, {veedel}. Nur heute, dann geht et an die Straße.',
      'Restposten! {amount} für {price}. In {veedel} hinterm Kiosk.',
      'Billiger als bei mir kriegste nix: {amount} für {price}. In {veedel}.',
    ],
    allianceOffer: [
      '{enemy} wird zu fett. Du und wir, zusammen. {price} und wir sind Partner.',
      'Ey, {enemy} geht mir auf den Sack. Dir doch auch. {price}, dann machen wir die platt.',
      'Kalle bietet Bündnis gegen {enemy}. Kostet {price}. Masse plus Klasse, Bruder.',
      'Wir brauchen jemand, der {enemy} nervt. Du bist gut darin. {price}.',
      'Gemeinsam gegen {enemy}, Bruder? {price} und die Schäl Sick steht hinter dir.',
    ],
  },
  // ♛ Marienburger Kreis, Dr. Konstantin Aldenhoven: leise, gebildet, kalt.
  sued: {
    warning: [
      'Dr. Aldenhoven bittet um ein Gespräch. Diskret. Er schätzt Vernunft. Ihre Geschäfte in {veedel} sind unvernünftig.',
      'Der Doktor hat von Ihnen gehört. In {veedel}. Er würde das gerne ein einziges Mal erwähnen.',
      'Man verkehrt in {veedel} nicht ohne Einladung. Betrachten Sie dies als Ausladung.',
      'Ein Hinweis aus Marienburg: {veedel} ist ein ruhiges Viertel. Es soll ruhig bleiben.',
      'Dr. Aldenhoven schätzt Menschen, die einen Wink verstehen. Dies ist einer. {veedel}.',
    ],
    threat: [
      'Dr. Aldenhoven schlägt einen Ausgleich vor: {tribute} pro Woche. Er hält das für großzügig. Er irrt selten.',
      '{tribute} wöchentlich, und Ihre Lager bleiben das, was sie sind: unbekannt.',
      'Der Doktor rechnet nüchtern. {tribute} pro Woche sind weniger als das, was Sie sonst verlieren würden. In {veedel} und anderswo.',
      'Man erwartet {tribute} pro Woche. Man erwartet auch, dass Sie das nicht persönlich nehmen.',
      'Eine Gebühr für Ruhe: {tribute} jede Woche. Unruhe wäre kostspieliger. Für Sie.',
    ],
    war: [
      'Dr. Aldenhoven hat das Gespräch beendet. Er beginnt nie ein zweites.',
      'Der Doktor bedauert. Er bedauert selten etwas lange.',
      'Sie haben Vernunft ausgeschlagen. Was folgt, hat mit Vernunft wenig zu tun.',
      'Marienburg hat entschieden. Sie werden es nicht kommen sehen.',
      'Ab heute existieren Sie für den Kreis nur noch als Problem. Probleme löst man.',
    ],
    raidWon: [
      'Bemerkenswert. Der Doktor wird beim nächsten Mal sorgfältiger planen.',
      'Ein Ergebnis zu Ihren Gunsten. Genießen Sie es. In Maßen.',
      'Unsere Leute waren nachlässig. Das korrigieren wir.',
      'Der Doktor nimmt es sportlich. Noch.',
      'Sie haben gewonnen. Er notiert sich das.',
    ],
    raidLost: [
      'Eine Lektion. Der Doktor hält nichts von Wiederholungen.',
      'Betrachten Sie es als Rechnung. Unsere Preise sind nun mal höher.',
      'Diskret erledigt. Sie dürfen davon ausgehen, dass niemand etwas gesehen hat.',
      'Man hat genommen, was Ihnen ohnehin nicht zustand.',
      'Der Doktor hofft, dass Sie nun verstehen. Er hofft nicht oft.',
    ],
    attacked: [
      'Sie haben die Hand gegen den Kreis erhoben. Das war unklug.',
      'Dr. Aldenhoven ist nicht wütend. Er ist enttäuscht. Das ist schlimmer.',
      'Unsere Leute bluten selten. Wenn doch, bluten andere doppelt.',
      'Ein Angriff. Wie ungeschliffen. Der Doktor wird höflich antworten. Auf seine Art.',
      'Sie haben gerade eine sehr teure Entscheidung getroffen.',
    ],
    snitch: [
      'Der Doktor weiß, wer der Polizei geschrieben hat. Er hat mit dem Polizeipräsidenten studiert.',
      'Ein Hinweis an die Behörden. Wie bürgerlich von Ihnen.',
      'Sie haben gesungen. Der Doktor bevorzugt Kammermusik. Und Stille.',
      'Wir wissen es. Wir wussten es, bevor die Polizei kam.',
      'Verrat ist eine Frage des Stils. Ihrer ist schlecht.',
    ],
    tributeDue: [
      'Der Doktor erinnert an {tribute}. Pünktlichkeit ist eine Tugend.',
      'Die Woche ist um. {tribute}, bitte. Diskret, wie immer.',
      'Ein Bote holt {tribute} ab. Bitte halten Sie den Umschlag bereit.',
      'Fällig: {tribute}. Dr. Aldenhoven verlässt sich auf Sie.',
      'Die nächsten {tribute}. Der Kreis dankt im Voraus.',
    ],
    protectionRefused: [
      'Der Kreis zahlt diese Woche nicht. Der Doktor hält Sie für entbehrlich.',
      'Man sieht keine Veranlassung mehr zu zahlen. Sie dürfen widersprechen. Persönlich.',
      'Die Zahlungen ruhen. Bis Sie das Gegenteil beweisen.',
      'Der Doktor hat die Abmachung neu bewertet. Zu Ihren Ungunsten.',
      'Keine Zahlung. Der Kreis zahlt nur denen, die er fürchtet.',
    ],
    offer: [
      'Der Doktor hat {amount} erstklassige Ware übrig. {price}. Übergabe in {veedel}, Villa mit Rheinblick.',
      'Ein Angebot für Kenner: {amount} für {price}. In {veedel}, nur auf Empfehlung.',
      'Erlesene Ware, {amount}, {price}. Der Fahrer wartet in {veedel}. Er wartet nicht lange.',
      'Dr. Aldenhoven überlässt Ihnen {amount} zu {price}. Ein Zeichen guten Willens. In {veedel}.',
      'Aus privaten Beständen: {amount}, {price}. Abholung in {veedel}, Hintereingang.',
    ],
    allianceOffer: [
      'Dr. Aldenhoven schlägt eine Allianz gegen {enemy} vor. Ihr Beitrag: {price}. Sein Beitrag: Ergebnisse.',
      '{enemy} ist laut und gierig. Gegen {price} sorgen wir gemeinsam für Ruhe.',
      'Der Doktor bietet Ihnen eine Partnerschaft an. Ziel: {enemy}. Preis: {price}.',
      'Ein Arrangement unter Vernünftigen, gegen {enemy}. {price}. Der Doktor erwartet Diskretion.',
      'Man könnte {enemy} gemeinsam beschneiden. Kosten für Sie: {price}.',
    ],
  },
  // 🌹 Neonkrone (Hamburg), Rocco Brandt „der Portier“: Türsteher-Ton, Kiez.
  'hh-kiez': {
    warning: [
      'Moin. Auf dem Kiez fragt man vorher, wem die Tür gehört. In {veedel} gehören sie alle uns.',
      'Freundlicher Hinweis von der Tür: {veedel} ist kein Ort für Laufkundschaft wie dich.',
      'Der Portier hat dich gesehen. In {veedel}. Du stehst nicht auf der Liste.',
      'Heute nicht. In {veedel} nicht. Nie, wenn du schlau bist.',
      'Rocco hier. {veedel} ist mein Laden. Und in meinem Laden verkauft nur, wen ich reinlasse.',
    ],
    threat: [
      'Eintritt kostet. {tribute} die Woche, dann darfst du in {veedel} rein. Sonst bleibst du draußen.',
      'Der Portier will {tribute} pro Woche. Dafür bleibt die Tür in {veedel} für dich offen.',
      '{tribute} die Woche, wie jede Bar auf dem Kiez. Du bist nichts Besonderes.',
      'Garderobe, Eintritt, Mindestverzehr: {tribute} wöchentlich. Ohne gibt es Hausverbot.',
      'Rocco. {tribute} pro Woche. Und das ist der Preis für Freunde.',
    ],
    war: [
      'Hausverbot. Auf dem ganzen Kiez. Und meine Jungs vergessen keine Gesichter.',
      'Du stehst ab heute auf der schwarzen Liste. An jeder Tür.',
      'Der Portier macht dir nicht mehr auf. Ab jetzt kommen wir raus.',
      'Feierabend für dich. Licht an, Musik aus, raus.',
      'Auf dem Kiez gibt es keine zweite Chance. Du hattest deine.',
    ],
    raidWon: [
      'Hast dich durchgedrückt. Nächstes Mal stehen da mehr von uns.',
      'Respekt, Kleiner. Aber die Tür ist noch nicht zu.',
      'Glück an der Tür. Das hält nicht jede Nacht.',
      'Meine Jungs sind angeknackst. Die Nacht ist noch lang.',
      'Notiert. Und vergessen tun wir auf dem Kiez nichts.',
    ],
    raidLost: [
      'Das war die Rechnung vom Haus. Mit Trinkgeld.',
      'Rausgeflogen. So läuft das auf dem Kiez.',
      'Wir haben abgeräumt. Wie nach jeder guten Party.',
      'Die Garderobe gehört jetzt uns. Deine Ware auch.',
      'Ein Abend auf dem Kiez. Bezahlt hast du.',
    ],
    attacked: [
      'Du hast eine Tür eingetreten. Jetzt kommen alle Türsteher.',
      'Rocco ist nicht amüsiert. Und wenn Rocco nicht amüsiert ist, wird es laut.',
      'Das war meine Bar. Jetzt wird deine Bar Kleinholz.',
      'Auf dem Kiez schlägt man nicht ungestraft zu.',
      'Du hast gerade dem Portier ins Gesicht gespuckt. Das wäscht man mit Blut ab.',
    ],
    snitch: [
      'Du hast die Davidwache geschickt? Wir haben dort auch Kunden.',
      'Ein Petzer auf dem Kiez. Das hat es lange nicht gegeben. Das gibt es auch nicht lange.',
      'Wir wissen, wer gequatscht hat. Die Tür hat Ohren.',
      'Verpfiffen. Von dir. Rocco nimmt das persönlich.',
      'Die Bullen waren da. Dein Name stand auf ihrem Zettel. Und jetzt auf unserem.',
    ],
    tributeDue: [
      'Neue Woche, neuer Eintritt: {tribute}.',
      'Der Portier kassiert: {tribute}.',
      'Rocco hier. {tribute} sind fällig. Bar an der Tür.',
      '{tribute}, wie jede Woche. Der Kiez schläft nie, die Kasse auch nicht.',
      'Zahltag auf dem Kiez. {tribute}.',
    ],
    protectionRefused: [
      'Diese Woche zahlt die Tür nicht. Komm rein und hol es dir.',
      'Kein Geld. Der Portier sagt Nein.',
      'Die Neonkrone zahlt nicht mehr. Wir haben genug Türsteher.',
      'Schutzgeld? Wir sind der Schutz. Für uns selbst.',
      'Abgelehnt. Wie an der Tür.',
    ],
    offer: [
      'Ich hab {amount} über, beste Ware vom Kiez. {price}, abholen in {veedel}. Bis Ladenschluss.',
      'Rocco. {amount} für {price}. Hinterausgang, {veedel}.',
      'Aus der Bar-Kasse: {amount}, {price}. In {veedel}, frag nach dem Portier.',
      'Party war kleiner als gedacht. {amount} übrig, {price}. {veedel}.',
      'Kiez-Angebot: {amount} für {price}. Nur heute Nacht, in {veedel}.',
    ],
    allianceOffer: [
      '{enemy} macht uns die Türen streitig. {price} und du stehst mit uns an der Tür.',
      'Rocco bietet: zusammen gegen {enemy}. {price}.',
      'Wir brauchen Leute gegen {enemy}. Du hast welche. {price}, dann sind wir Partner.',
      'Der Kiez gegen {enemy}. Eintritt für dich: {price}.',
      'Gemeinsam räumen wir {enemy} von der Straße. Kostet dich {price}.',
    ],
  },
  // ⛓ Containerjungs (Hamburg), Hinnerk „Brecher“ Matthiesen: grob vom Hafen.
  'hh-hafen': {
    warning: [
      'Hör mal zu, Rheinländer. {veedel} ist Hafen. Und im Hafen wird nicht gefragt, da wird geschoben.',
      'Wir haben gesehen, was du in {veedel} treibst. Noch so ein Ding und du schwimmst.',
      'Brecher hier. {veedel} gehört uns, von Kai bis Kneipe.',
      'Rheinländer in {veedel}. Hatten wir lange nicht. Hatten wir auch nicht vermisst.',
      'Kleiner Tipp: Im Hafenbecken ist es kalt. {veedel} ist nicht dein Revier.',
    ],
    threat: [
      '{tribute} die Woche. Bar. Sonst verschwindet dein Kram so wie unsere Container: spurlos.',
      'Brecher. {tribute} pro Woche, oder wir räumen dein Lager mit dem Gabelstapler aus.',
      'Hafengebühr für {veedel}: {tribute} wöchentlich.',
      'Wir wollen {tribute} die Woche. Und wir kriegen immer, was wir wollen.',
      '{tribute} pro Woche, sonst gehst du baden. Wörtlich.',
    ],
    war: [
      'Jetzt ist Schluss mit lustig. Wir kommen mit dem Gabelstapler.',
      'Krieg, Rheinländer. Und wir haben mehr Kräne als du.',
      'Ab heute bist du Ladung. Und Ladung geht über Bord.',
      'Die Insel steht gegen dich. Alle.',
      'Brecher hat genug geredet. Jetzt wird gebrochen.',
    ],
    raidWon: [
      'Du hast Glück gehabt. Das Hafenbecken wartet trotzdem.',
      'Ein Container weniger. Wir haben tausend.',
      'Gewonnen? Wir kommen mit Verstärkung von der Insel.',
      'Hast dich gewehrt. Das macht es nur lustiger.',
      'Nächstes Mal bringen wir den Brecher selbst mit.',
    ],
    raidLost: [
      'Das war nur der erste Container. Wir haben noch tausend.',
      'Ausgeladen. Dein Kram gehört jetzt uns.',
      'Schön leer, dein Lager. So wie unsere Container nach Zoll.',
      'Hafen-Regel: Was rumliegt, gehört uns.',
      'Hat Spaß gemacht. Wir kommen wieder.',
    ],
    attacked: [
      'Du gehst auf die Containerjungs los? Wir versenken dich.',
      'Brecher ist wach. Und schlecht gelaunt.',
      'Das war ein Fehler, Rheinländer. Ein nasser Fehler.',
      'Wir zahlen das zurück. Mit Hafenzinsen.',
      'Die ganze Insel weiß jetzt, wer du bist.',
    ],
    snitch: [
      'Du hast die Wasserschutzpolizei geholt? Mutig. Dumm, aber mutig.',
      'Petze. Im Hafen wird so was über Bord geworfen.',
      'Wir wissen, wer gequatscht hat. Der Hafen redet.',
      'Die Bullen waren auf der Insel. Und wir wissen, wer die bestellt hat.',
      'Verpfiffen. Das vergisst der Brecher nie.',
    ],
    tributeDue: [
      'Hafengebühr fällig: {tribute}.',
      'Brecher. {tribute}. Wie jede Woche.',
      'Die Woche ist um, {tribute} bitte. Bar.',
      '{tribute}, sonst geht dein nächster Container verloren.',
      'Zahltag am Kai: {tribute}.',
    ],
    protectionRefused: [
      'Diese Woche gibt es nix. Komm auf die Insel und hol es dir.',
      'Kein Geld. Container sind teurer geworden.',
      'Die Containerjungs zahlen nicht mehr. Kannst ja klagen.',
      'Brecher sagt: Schluss mit Schutzgeld.',
      'Nix da. Wir haben selbst genug Muskeln.',
    ],
    offer: [
      'Is was vom Laster gefallen. {amount} für {price}, in {veedel} am Kai. Nicht quatschen.',
      'Container aufgegangen. {amount}, {price}, {veedel}.',
      'Brecher hat {amount} über. {price}. Abholen am Kai in {veedel}.',
      'Zollfrei, sozusagen: {amount} für {price}. In {veedel}.',
      'Restladung: {amount}, {price}. Heute noch, in {veedel}.',
    ],
    allianceOffer: [
      '{enemy} geht uns auf die Nerven. {price} und wir machen die zusammen fertig.',
      'Brecher bietet: gemeinsam gegen {enemy}. Kostet {price}.',
      'Hafen und Rheinland gegen {enemy}? {price}.',
      'Wir brauchen mehr Leute gegen {enemy}. Du zahlst {price}, wir liefern die Muskeln.',
      'Zusammen versenken wir {enemy}. {price}.',
    ],
  },
  // ✊ Das Kollektiv (Hamburg), Merle Asmussen „die Kassenwartin“: Plenum, WG, Polit-Ton.
  'hh-schanze': {
    warning: [
      'Hey. Wir haben das im Plenum besprochen: {veedel} ist unser Viertel. Deins ist es nicht.',
      'Nur damit das klar ist: In {veedel} weiß jede WG, wer du bist. Wir auch.',
      'Merle hier. Das Kollektiv bittet dich, {veedel} zu verlassen. Noch bitten wir.',
      'Gentrifizierung des Dealens in {veedel}? Nicht mit uns.',
      'Das Plenum hat über dich abgestimmt. Ergebnis: Du hast in {veedel} nichts verloren.',
    ],
    threat: [
      'Solidaritätsbeitrag: {tribute} die Woche, dann regeln wir das unter uns. Sonst nicht.',
      'Das Kollektiv schlägt vor: {tribute} wöchentlich in die Gemeinschaftskasse. Für {veedel}.',
      'Die Kassenwartin sagt: {tribute} pro Woche. Das ist fair. Wir haben es durchgerechnet.',
      '{tribute} pro Woche, oder wir machen in {veedel} eine Aktion. Gegen dich.',
      'Wer in {veedel} verdient, gibt ab. {tribute} die Woche. So funktioniert Gemeinschaft.',
    ],
    war: [
      'Das Plenum hat entschieden. Gegen dich. Einstimmig.',
      'Das Kollektiv erklärt dich zum Gegner. Wir organisieren uns.',
      'Kein Dialog mehr. Ab jetzt direkte Aktion.',
      'Merle hat die Liste rumgeschickt. Dein Name steht oben.',
      'Wir haben es friedlich versucht. Das Plenum hat jetzt andere Mittel beschlossen.',
    ],
    raidWon: [
      'Das war kein Sieg, das war ein Zwischenstand. Das Plenum tagt.',
      'Wir haben die Aktion ausgewertet. Nächstes Mal sind wir mehr.',
      'Rückschlag. Kommt vor. Wir sind geduldig.',
      'Die Bewegung lässt sich nicht aufhalten. Du schon.',
      'Glückwunsch. Wir machen eine Nachbesprechung.',
    ],
    raidLost: [
      'Umverteilung erfolgreich. Danke für die Spende.',
      'Das Kollektiv hat sich genommen, was der Gemeinschaft zusteht.',
      'Direkte Aktion, direkte Ergebnisse.',
      'Deine Ware ist jetzt Gemeingut.',
      'Das war die Ansage aus der Schanze. Verstanden?',
    ],
    attacked: [
      'Du greifst das Kollektiv an? Das ganze Viertel hat es gesehen.',
      'Gewalt gegen uns. Das Plenum tagt heute Nacht. Über dich.',
      'Das war ein Angriff auf alle. Alle antworten.',
      'Merle ist sauer. Und Merle hat die Kasse.',
      'Das kostet dich mehr als Geld. Das kostet dich das Viertel.',
    ],
    snitch: [
      'Uns verpfeift man nicht. Wir hatten die Bullen eine Stunde vorher auf dem Schirm. Und dich jetzt auch.',
      'Ein Spitzel. Wir haben im Plenum über dich gesprochen. Lange.',
      'Die Kollegen in Grün waren da. Wir wissen, wer sie gerufen hat.',
      'Verrat an der Bewegung. Das verzeiht die Schanze nicht.',
      'Wir haben unsere Quellen. Deine Quelle war zu laut.',
    ],
    tributeDue: [
      'Die Kassenwartin erinnert: {tribute} für die Gemeinschaftskasse.',
      'Solibeitrag fällig: {tribute}.',
      'Neue Woche, {tribute}. Quittung gibt es nicht.',
      'Merle hier. {tribute}, bitte. Die Kasse muss stimmen.',
      'Das Plenum erwartet {tribute}.',
    ],
    protectionRefused: [
      'Das Kollektiv zahlt diese Woche nicht. Beschluss des Plenums.',
      'Keine Zahlung. Die Kasse ist leer, und Merle ist streng.',
      'Wir haben abgestimmt: Ab jetzt zahlen wir nicht mehr.',
      'Schutzgeld ist kapitalistisch. Haben wir beschlossen.',
      'Diese Woche nix. Komm zur Versammlung, wenn du was willst.',
    ],
    offer: [
      'Wir haben {amount} zu viel, gute Qualität. {price}, Übergabe in {veedel}. Fair Trade.',
      'Aus Kollektiv-Anbau: {amount} für {price}. In {veedel}, Hinterhof.',
      'Merle hat {amount} übrig. {price}. In {veedel}, WG im dritten Stock.',
      'Solidarischer Preis: {amount} für {price}. {veedel}, nur heute.',
      'Überschuss der Gemeinschaft: {amount}, {price}, in {veedel}.',
    ],
    allianceOffer: [
      'Das Plenum schlägt vor: gemeinsam gegen {enemy}. Dein Solibeitrag: {price}.',
      '{enemy} ist das Problem. Für {price} sind wir solidarisch mit dir.',
      'Das Kollektiv bietet ein Bündnis gegen {enemy}. Kosten: {price}.',
      'Gemeinsame Aktion gegen {enemy}? Beitrag {price}.',
      'Wir organisieren uns gegen {enemy}. Mach mit, für {price}.',
    ],
  },
  // ⛵ Elbchaussee-Club (Hamburg), Frederik Brodersen-Lüth: höflich, herablassend, Anwälte.
  'hh-elbchaussee': {
    warning: [
      'Guten Tag. Ihre Geschäfte in {veedel} sind uns aufgefallen. Unser Anwalt meldet sich nicht ohne Grund.',
      'Man verkauft in {veedel} nicht ohne Einladung. Und Sie haben keine.',
      'Herr Brodersen-Lüth lässt grüßen. Und fragen, was Sie in {veedel} zu suchen haben.',
      'Ein Hinweis unter Kaufleuten: {veedel} ist ein gutes Viertel. Für gute Leute.',
      'Der Club wünscht in {veedel} keine Konkurrenz. Bitte richten Sie sich danach.',
    ],
    threat: [
      '{tribute} wöchentlich, dann sehen wir von weiteren Schritten ab. Das ist ein großzügiges Angebot.',
      'Der Club erhebt eine Gebühr: {tribute} pro Woche, für {veedel}.',
      'Herr Brodersen-Lüth schlägt {tribute} wöchentlich vor. Er schlägt selten zweimal vor.',
      'Mitgliedsbeitrag: {tribute} pro Woche. Ohne Mitgliedschaft wird es ungemütlich.',
      '{tribute} jede Woche, oder unser Anwalt und ein paar weniger höfliche Herren besuchen Sie.',
    ],
    war: [
      'Ich habe Sie gewarnt. Ab jetzt reden andere mit Ihnen. Die mögen keine Anwälte.',
      'Der Club kündigt Ihnen. Fristlos.',
      'Bedauerlich. Herr Brodersen-Lüth hat die Sache abgegeben. An Leute ohne Manieren.',
      'Sie haben sich gegen den Club entschieden. Der Club entscheidet sich gegen Sie.',
      'Ab heute sind Sie für uns ein Ärgernis. Ärgernisse werden beseitigt.',
    ],
    raidWon: [
      'Ein Achtungserfolg. Mehr nicht.',
      'Man ist überrascht. Angenehm ist anders.',
      'Unsere Leute waren unterbezahlt. Das ändern wir.',
      'Gewonnen. Wir kaufen uns bessere Leute.',
      'Notiert. Der Club denkt langfristig.',
    ],
    raidLost: [
      'Sehen Sie es als Rechnung. Unsere Preise sind nun mal höher.',
      'Man hat sich bedient. Mit Stil, versteht sich.',
      'Eine kleine Korrektur Ihres Inventars.',
      'Der Club holt sich, was ihm zusteht. Immer.',
      'Unsere Herren waren gründlich. Wir zahlen gut.',
    ],
    attacked: [
      'Ein Angriff auf den Club. Wie primitiv.',
      'Herr Brodersen-Lüth hat heute schon drei Anwälte und zwei Schläger angerufen.',
      'Sie haben gerade sehr viel Geld gegen sich aufgebracht.',
      'Das war eine Kriegserklärung. Wir haben die bessere Finanzierung.',
      'Man schlägt keine Mitglieder des Clubs. Man bezahlt dafür.',
    ],
    snitch: [
      'Ein Hinweis an die Polizei? Unser Anwalt hat ihn schon gelesen.',
      'Wie gewöhnlich, die Polizei zu rufen. Wir wissen, dass Sie es waren.',
      'Der Club hat Freunde in der Behörde. Sie offenbar nicht.',
      'Petzen ist unter Ihrem Niveau. Und das ist schon niedrig.',
      'Man hat uns Ihren Namen zugetragen. Freundlich, aber deutlich.',
    ],
    tributeDue: [
      'Der Club erinnert an den Beitrag: {tribute}.',
      'Fällig: {tribute}. Wir nehmen auch Schecks. Scherz.',
      'Die nächsten {tribute}, bitte. Pünktlich, wie es sich gehört.',
      'Herr Brodersen-Lüth wartet auf {tribute}.',
      'Mitgliedsbeitrag: {tribute}.',
    ],
    protectionRefused: [
      'Der Club zahlt diese Woche nicht. Klagen Sie doch.',
      'Unsere Buchhaltung sieht keine Grundlage mehr für Zahlungen.',
      'Keine Zahlung. Wir finanzieren lieber unsere Anwälte.',
      'Abgelehnt. Mit freundlichen Grüßen.',
      'Der Club hat die Zusammenarbeit überdacht. Ergebnis: nein.',
    ],
    offer: [
      'Wir hätten {amount} beste Qualität abzugeben. {price}. Abholung in {veedel}, diskret bitte.',
      'Aus dem Bootshaus: {amount} für {price}. In {veedel}.',
      'Herr Brodersen-Lüth überlässt Ihnen {amount} zu {price}. Ausnahmsweise. In {veedel}.',
      'Premium, {amount}, {price}. Übergabe am Steg in {veedel}.',
      'Exklusiv für Sie: {amount} für {price}. In {veedel}, nach Voranmeldung.',
    ],
    allianceOffer: [
      'Der Club schlägt eine Partnerschaft gegen {enemy} vor. Ihr Anteil: {price}.',
      '{enemy} ist unkultiviert. Gegen {price} korrigieren wir das gemeinsam.',
      'Herr Brodersen-Lüth bietet Ihnen eine Allianz gegen {enemy}. {price}.',
      'Eine Investition: {price} gegen {enemy}. Rendite garantiert.',
      'Gemeinsam gegen {enemy}, für {price}. Der Club stellt das Personal.',
    ],
  },
};

/** Fallback für Gangs ohne eigene Stimme (z.B. künftige Städte): die Hafenkolonne, aber mit Namen davor. */
export const DEFAULT_VOICE: GangVoice = Object.fromEntries(
  Object.entries(GANG_VOICES.nord).map(([key, list]) => [key, list.map((t) => `{boss}: ${t}`)]),
) as unknown as GangVoice;

/** Varianten einer Gang für einen Anlass. */
export function gangVariants(gangId: string, key: GangTextKey): readonly string[] {
  return (GANG_VOICES[gangId] ?? DEFAULT_VOICE)[key];
}
