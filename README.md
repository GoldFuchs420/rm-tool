# reMarkable Toolkit (Chrome Extension) — Release-Kandidat

Artikel im Lesemodus oder ausgewählte Bilder einer Webseite als PDF an
ein reMarkable senden, plus eine vollwertige Dateiverwaltung für das
Gerät selbst — alles in einer Extension, mit gemeinsamer Server-
Konfiguration.

---

## Store-Beschreibung (Vorschlag für den Chrome Web Store)

> **reMarkable Toolkit** verwandelt jede Webseite in ein sauber
> formatiertes PDF auf deinem reMarkable — ganz ohne den Umweg über
> Drucken-als-PDF, E-Mail-an-mich-selbst oder manuelles Kopieren.
>
> **Artikel im Lesemodus senden**: Ein Klick extrahiert den eigentlichen
> Artikeltext einer Webseite (Werbung, Navigation und Sidebars werden
> automatisch entfernt) und wandelt ihn in ein sauber umbrochenes PDF —
> mit echten Kapitel-Umbrüchen (eine Überschrift steht nie allein am
> Seitenende), Aufzählungen, Zitaten und Bildern, die bei Bedarf um den
> Text fließen, statt ihn zu verdrängen.
>
> **Bilder einzeln oder gesammelt senden**: Die Extension findet alle
> echten Bilder einer Seite (keine Werbe- oder Hintergrundbilder) und
> zeigt sie als durchscrollbaren Streifen. Ein Bild sofort senden, oder
> mehrere auswählen und gemeinsam mit dem Artikel in einem Rutsch
> hochladen.
>
> **Eigene Dateiverwaltung**: Über das 🗂-Symbol öffnet sich eine
> vollständige Verwaltungsseite für dein reMarkable — Ordner anlegen und
> durchsuchen, Favoriten markieren, Dokumente als PDF oder RMDoc
> herunterladen, beliebige Dateien (PDF, EPUB, Bilder, Markdown, Text,
> HTML, ZIP/TAR-Archive) importieren und in PDFs umwandeln.
>
> **Mehrere Geräte/Proxys**: Beliebig viele reMarkable-Adressen
> hinterlegen (z.B. mehrere Geräte oder ein HTTPS-Proxy mit Basic-Auth
> davor), die Extension findet automatisch den gerade erreichbaren.
>
> Es wird nichts an einen fremden Server gesendet — die gesamte
> Umwandlung läuft lokal in deinem Browser, direkt zu deinem eigenen
> reMarkable (bzw. dem von dir konfigurierten Proxy davor).

**Berechtigungen, kurz erklärt:**
- *Speicher (storage)*: merkt sich deine Geräte-Adressen und
  Voreinstellungen lokal in Chrome.
- *Alle Websites (host_permissions)*: nötig, um (a) mit deinem
  reMarkable/Proxy zu sprechen, dessen Adresse frei wählbar ist, und
  (b) um Artikeltext und Bilder von der jeweils geöffneten Seite zu
  lesen.
- *Tabs / Scripting*: um die aktive Seite zu erkennen und den Lesemodus-
  bzw. Bilder-Scan dort auszuführen.
- Es werden keine Daten an Dritte gesendet, keine Tracker, keine Werbung.

---

## Funktionsüberblick

### Popup (schneller Weg)
- **Artikel + Bilder in einer Ansicht**, kein Moduswechsel mehr nötig:
  Artikel-Abschnitt (mit Ein/Aus-Schalter und Schriftgrößen-Regler samt
  Zahlenanzeige) und Bilder-Abschnitt (horizontal scrollbarer Streifen)
  stehen untereinander. **Ein Senden-Klick lädt Artikel und ausgewählte
  Bilder gemeinsam hoch**, falls beides aktiv ist.
- Jedes Bild hat zusätzlich einen eigenen ↑-Button zum sofortigen
  Einzel-Versand, unabhängig von der übrigen Auswahl.
- Schriftgröße wird **pro Website (Hostname)** gespeichert — besuchst du
  dieselbe Seite später wieder, ist dein letzter Wert schon vorausgewählt.
- **Zwei getrennte, kompakte Gruppierungen**: „Seite als PDF“ (Schalter,
  Status, Schriftgröße) und „Bilder“ (Streifen, Auswahl, Upload-Modus)
  sind eigene Umrandungen im Popup.
- **Bilder werden standardmäßig als ein zusammenhängendes PDF** (eine
  Seite je Bild) hochgeladen; der Schalter **„Ein Bild pro PDF“** (in 5
  Sprachen, Wahl wird gespeichert) schaltet um, dass jedes Bild als
  eigenes PDF gesendet wird.
- Server-Verwaltung (Liste, Erreichbarkeits-Check, Login bei Basic-Auth,
  Hinzufügen/Entfernen) ist jetzt eine **gemeinsame Komponente**
  (`shared/servers.js`), die exakt so auch im Dateimanager erscheint.
- **Kein erreichbarer Server → nur das Serverpanel**: Sowohl im Popup
  als auch im Dateimanager werden Dateilisten & Co. ausgeblendet, bis
  mindestens ein Server online ist (ohne Server können sie ohnehin
  nichts laden); die Login-Karte und "Hinzufügen" bleiben immer
  erreichbar.

### Dateimanager (`filemanager.html`, über 🗂 im Popup erreichbar)
Die von dir bereitgestellte erweiterte reMarkable-Weboberfläche,
eingebettet als vollwertige Extension-Seite:
- Ordner-Navigation, Favoriten, Suche/Filter (unverändert aus dem
  Original übernommen).
- **Import** (lokale Dateien: PDF, EPUB, RMDoc, Bilder, Markdown, Text,
  HTML, ZIP/TAR-Archive) — sobald eine Datei hinzugefügt wird, entsteht
  die Vorschau-Umwandlung automatisch; Einträge lassen sich aus der
  Liste wieder entfernen oder umbenennen (ohne Dateiendung) und die
  gesamte Liste wird mit einem einzigen "Alle hochladen" hochgeladen.
  Die Buttons "Vorschau" und "Zurück" sowie der direkte Einzel-Upload
  im Import-Dialog sind entfallen.
- **Export** als PDF oder RMDoc (unverändert).
- Server-Auswahl **unter dem Header, über "Meine Dateien"** — exakt die
  gemeinsame Komponente aus dem Popup; die **Basic-Auth-Anmeldung
  erscheint inline in der Serverliste** (keine eigenen Dialoge mehr).
  Jede Adresse hat einen Kopieren-Button (Zwischenablage) und einen
  Button zum Öffnen in einem neuen Browser-Tab.
- **Dateiliste**: Checkbox und Dateityp-Icon stehen in der ersten Zeile
  **links vom Titel**, darunter das vergrößerte Vorschaubild (feste
  Maximalbreite, etwas breiter als Checkbox plus Icon, klarer Abstand
  zur Titelspalte); Titelhöhe ist variabel, die Dateiendung entfällt
  (der Typ ist am Icon erkennbar). Die **PDF/RMDoc/Details-Buttons
  bekommen eine eigene, rechtsbündige Zeile** unter Titel und
  Metadaten, statt neben dem Seiten-Indikator umzubrechen; der
  Auswahlrahmen berührt Checkbox und Vorschaubild nicht mehr.
  Ausgewählte Dateien erhalten zur Hintergrundtönung einen
  deutlichen **Rahmen** (reMarkable-Primärfarbe).
- **Auswahl-Werkzeugleiste**: „Alles auswählen“ und „Auswahl aufheben“
  stehen in einer Zeile (auf Mobil daneben) und tragen Icons.
- **Filter**: Bezeichnung links, Element rechts (zweispaltig je Feld);
  die Datumsfelder zeigen das erwartete Format als sichtbaren Hinweis,
  die drei Schnellfilter (30 / 14 / 7 Tage) stehen nebeneinander und
  tragen je ein Kalender-Icon samt Tageszahl, daneben setzt ein
  Reset-Button den Zeitraum zurück.
- **Entfernt**: der ursprüngliche "URL importieren"-Button (externer
  Lesedienst) sowie der zwischenzeitlich hinzugefügte "Von Webseite
  importieren"-Button (Tab-Auswahl-Dialog) — auf deinen Wunsch entfernt,
  um bei den reinen Dateibrowser-Funktionen (Import/Export) zu bleiben.
  Das entsprechende Artikel/Bilder-Senden lebt stattdessen vollständig
  im Popup (siehe oben).

---

## Was wurde geändert, was ist Original

Ausgangsbasis war deine erweiterte reMarkable-Weboberfläche (eigener
Dateibrowser, Import/Export, Favoriten, Suche, mehrsprachig). Davon
sind **10 von 14 eigenen JS-Dateien sowie das komplette Design-System
(CSS, Logo, Schriften) zu 100 % unverändert**: `archive.js`,
`convert.js`, `import.js`, `pdfview.js`, `preview.js`,
`rmdoc.js`, `textpdf.js`, `thumbs.js`, `util.js`, dazu `assets/index.css`
und `assets/rm_logo.svg` (per `diff` gegengeprüft).

**Minimal, chirurgisch gepatcht:**
- **`assets/js/api.js`** — wartet jetzt auf `R.ready` (ein Promise, das
  erst auflöst, sobald `shared/servers.js` einen erreichbaren Server
  gefunden hat) und stellt dessen Basis-URL plus einen optionalen
  `Authorization`-Header voran. Grund: die Seite lief ursprünglich
  direkt auf dem Gerät (same-origin, kein Auth nötig), hier kommt sie
  aus der Extension und muss ggf. mehrere Server über einen Proxy mit
  Basic-Auth ansprechen. Kein bestehender Code wurde entfernt.
- **`assets/js/app.js`** — netto nur zwei kleine Änderungen: (1) der
  Toolbar-Import-Button ruft jetzt direkt `app.openImport([])` auf
  (öffnet den Dialog leer) statt zuerst die native Dateiauswahl zu
  öffnen; (2) der jetzt tote Sonderfall `k === 'url'` in der internen
  `label()`-Funktion wurde entfernt, nachdem der URL-Button selbst
  entfernt wurde (siehe unten).
- **`assets/js/i18n.js`** — unverändert bis auf eine entfernte Leerzeile
  (keine neuen/fehlenden Übersetzungsschlüssel mehr, nachdem der
  zwischenzeitlich ergänzte "Von Webseite importieren"-Dialog wieder
  entfernt wurde).
- **`assets/js/outputs.js`** — Zeilen-Layout der Import-Vorschau
  umgebaut (siehe "Import-Dialog" unten); das ist der einzige inhaltlich
  veränderte Original-Dateibrowser-Code.
- **`assets/app.css`** — nur Ergänzungen, kein bestehendes CSS entfernt
  oder überschrieben: neue, eigene Klassen (`.osize`/`.obtns`/
  `.rmx-pill--preview`/`.rmx-srv-panel-wrap`) ergänzt bzw. die alte,
  auf `nth-child`-Positionen basierende mobile Grid-Regel für die
  Ergebniszeile durch robustes Flexbox-Wrapping ersetzt (siehe unten).

**Entfernt** (auf deinen Wunsch, siehe oben): `assets/js/url.js`
(externer Lesedienst-Import) sowie der zwischenzeitlich ergänzte,
inzwischen wieder entfernte `assets/js/rmx-import.js` und
`assets/js/rmx-readability.js` samt der zugehörigen Dialog-Platzhalter
in `filemanager.html` und i18n-Einträgen.

**Komplett neu:**
- `assets/js/rmx-bridge.js` — bindet `shared/servers.js` unter dem
  Header ein, verdrahtet sie mit `R.configureServer`.
- `shared/servers.js` + `shared/servers.css` — die gemeinsame
  Server-Komponente (siehe unten).
- `shared/filename.js` — die gemeinsame Dateinamen-Bereinigung (siehe
  unten).

---

## Import-Dialog: automatische Vorschau, Liste, Dateinamen

Neuer Ablauf beim Import (`assets/js/import.js`, `assets/js/outputs.js`):

- **Vorschau entsteht automatisch**: Sobald Dateien hinzugefügt werden,
  startet die Umwandlung ohne weiteren Klick — die Buttons
  "Vorschau erstellen" und "Zurück" sind entfallen, ebenso der direkte
  Einzel-Upload. Nur noch "Alle hochladen" (ein Klick für die ganze
  Liste) und während der Umwandlung "Abbrechen" bleiben übrig.
  Der Dialog zeigt jetzt **immer** die Liste mit dem
  "Dateien hinzufügen"-Button, auch wenn er leer geöffnet wird.
- **Mini-Vorschau wie in der Dateiliste**: Aus PDF-Ergebnissen wird die
  erste Seite verkleinert unter Titel und Typ-Icon angezeigt (Bilder/
  Texte zeigen keine Vorschaubild-Zeile).
- **Zwei Panels pro Zeile**: oben Typ-Icon und Name, darunter getrennt
  Dateigröße sowie Download-Pille (farblich wie die PDF/RMDoc-Buttons
  in der Dateiliste) und Entfernen-Button.
- **Einträge sind jederzeit ergänz- und entfernbar**: über den
  "Dateien hinzufügen"-Button (auch im Ergebnis-Schritt) kommen weitere
  Dateien in die Liste und werden sofort umgewandelt; statt des ✕
  entfernt ein **roter Mülleimer** die Zeile (Neunummerierung
  inklusive). Umbenennen bleibt möglich, die Dateiendung wird nicht
  mehr angezeigt (der Typ ist am Icon erkennbar).
- **Namensoptionen wie im Export** ("Datum vor Dateinamen",
  "Nur einfache Zeichen ä → ae, é → e") stehen auch im Import zur
  Verfügung und werden beim Upload angewandt; die Wahl wird
  gespeichert.
- **Kein Überlappen auf schmalen/mobilen Breiten**: Die vorherige
  Lösung positionierte Elemente über starre `nth-child`-Grid-Zellen —
  fragil, weil sie bei jeder Strukturänderung der Zeile neu hätte
  nachgezogen werden müssen. Jetzt reines Flexbox mit `flex-wrap:
  wrap`: reicht die Breite nicht, brechen Dateiname, Größe und Buttons
  sauber in eigene Zeilen um, statt sich zu überlagern — garantiert
  durch die Wrap-Eigenschaft selbst, nicht durch Breitenberechnung von
  Hand.
- **Optionen nur passend zur Auswahl**: Die Bild-/Text-Formatoptionen
  erscheinen nur, wenn die Liste ausschließlich aus dieser Art besteht;
  die Option zum Beibehalten der Ordnerstruktur nur, wenn mehrere
  Dateien mit Unterordnern importiert wurden.
- **Sonderzeichen-Bereinigung beim Umbenennen**: Das Umbenennen-Feld im
  Import-Dialog nutzt jetzt dieselbe robuste Bereinigung wie das Popup
  (`shared/filename.js`, siehe unten) — vorher wurden nur `\`, `/` und
  Steuerzeichen ersetzt, jetzt zusätzlich die auf vielen Dateisystemen
  ungültigen Zeichen `: * ? " < > |`.

---

## Gemeinsame Bausteine (`shared/`)

Zwei Dinge wurden früher doppelt (für Popup und Dateimanager getrennt)
implementiert und sind jetzt **ein einziger Code-Pfad**, von beiden
Seiten identisch genutzt:

- **`shared/filename.js`** — `RMXShared.sanitizeFilename(name, fallback)`
  (entfernt dateisystem-kritische Zeichen, fasst Leerraum zusammen,
  kürzt auf 120 Zeichen; genutzt von `popup.js` für Artikel-/Bildnamen
  und `assets/js/outputs.js` für das Umbenennen-Feld im Import-Dialog),
  dazu `RMXShared.asciiName(x)` (Umlaute → ae/oe/ue/ss, Akzente über
  NFD entfernt, Rest → `_`; Export-Namensoption) und
  `RMXShared.ymd(value)` (Datum → `JJJJ-MM-TT`, leer bei ungültigem
  Datum) — drei Helfer für beide Seiten, `app.js` verweist nur noch
  darauf statt eigene Kopien zu pflegen.
- **`shared/servers.js` + `shared/servers.css`** — die komplette
  Server-Verwaltung (Liste, Erreichbarkeits-Check, Basic-Auth-Login,
  Hinzufügen/Entfernen, Ein-/Ausblenden nicht erreichbarer Server) als
  eigenständige, mountbare Komponente:
  ```js
  const srv = RMXServers.mount(containerEl, {
    onChange(readyServers) { /* z.B. Senden-Button aktivieren */ }
  });
  srv.refresh();        // manuell neu prüfen
  srv.readyServers();   // aktuell erreichbare (online) Server
  ```
  Im Popup gemountet in `#serverPanel` (oben im Header-Bereich), im
  Dateimanager von `rmx-bridge.js` unter dem Header, über "Meine
  Dateien", eingefügt. **Bugfix enthalten**: `runDiscovery()` mutiert
  jedes Server-Objekt direkt (`s._status = await probe(s)`) statt per
  Index in der äußeren Liste nachzuschlagen (`servers[i]._status = r`).
  Die alte Variante stürzte mit `Cannot set properties of undefined`
  ab, wenn während eines laufenden Erreichbarkeits-Checks ein Server
  hinzugefügt oder entfernt wurde (die äußere Liste wird dann neu
  zugewiesen und kürzer/länger, der gespeicherte Index zeigt ins Leere).
  Mit einem gezielten Node-Test nachgestellt und als behoben bestätigt.

---

## Design: an reMarkables eigenes Ark-Design-System angeglichen

Das Popup lädt jetzt **dieselben** Stylesheets wie der Dateimanager
(`/assets/index.css`, `/assets/app.css`) und nutzt deren echte
Komponenten-Klassen (`.ark-button`, `.ark-switch`, `.ark-input`,
responsive Typografie-Klassen) sowie die echten Farb-Tokens
(`--ark-text-default: #211e1c`, `--ark-interaction-primary-default:
#2559F4`, warme Neutraltöne `--rmx-page: #f9f6f1` / `--rmx-surface:
#ede8de` statt des vorherigen generischen Blau-auf-Weiß). `popup.css`
enthält dadurch nur noch popup-spezifisches Layout (Breite, Abstände,
Bilder-Streifen) — Buttons, Inputs, Switches, Farben und Schrift kommen
jetzt aus genau derselben Quelle wie im Dateimanager.

---

## Entfernt: "Bilder nach Textende entfernen"

Die Checkbox samt der Funktion `stripTrailingImagesFromHtml()` wurde
komplett aus Popup und Code entfernt (Checkbox-UI, Speicher-Schlüssel,
Aufruf in der Sende-Logik) — auf deinen Wunsch, da sie durch die neue
kombinierte Artikel+Bilder-Ansicht im Popup ohnehin redundant wurde: du
siehst und wählst die Bilder jetzt ja ohnehin direkt aus.

---

## Testabdeckung dieser Version

Da hier keine Browser-/Geräte-Umgebung zur Verfügung steht, wurde jede
nennenswerte Logikänderung gegen die **tatsächlichen, unveränderten
Funktionen** verifiziert (nicht nachgebaut):

- **`buildPdfFromArticle`** (Kapitel-Umbruch, Listen, Zitate, Bild-
  Umfluss/Orphan-Schutz, Fußzeile): mit einem selbstgebauten, aber
  funktional echten HTML-Parser-Polyfill (da Node kein `DOMParser`
  kennt) direkt aus der aktuellen `popup.js` geladen und mit einem
  mehrteiligen Testartikel (Überschriften, Liste, Zitat, schmales und
  breites Bild, verschachtelter Wrapper-`<div>`) durchlaufen lassen.
  Ergebnis mit `qpdf --check` validiert und als PNG gerendert — keine
  Überlappung, alle Elemente korrekt positioniert.
- **`buildImagesPdf`** (randlose, bild-proportionale Seiten): mit drei
  echten JPEGs unterschiedlichster Seitenverhältnisse getestet,
  Seitenformat der erzeugten PDF stimmt auf vier Nachkommastellen mit
  dem Bild-Seitenverhältnis überein.
- **`shared/servers.js`**: mit zwei simulierten Servern (einer ohne
  Zugangsdaten → korrekt "Login nötig", einer mit hinterlegten,
  korrekten Zugangsdaten → korrekt "online" samt richtig kodiertem
  Basic-Auth-Header) sowie gezielt der Race-Condition-Absturz
  nachgestellt und als behoben bestätigt.
- **`sendNow()`** (kombiniertes Senden im Popup): drei Szenarien
  durchgespielt — Artikel+2 Bilder kombiniert, nur Artikel, nur 1 Bild —
  jeweils korrekte Abschnitts-Überschriften, korrekte Dateinamen
  (Alt-Text bei Einzelbild, Seitentitel bei mehreren) und korrekte
  Reihenfolge der Ergebnis-Einträge bestätigt.
- Alle `document.getElementById(...)`-Aufrufe in `popup.js` wurden
  automatisiert gegen die tatsächlich vorhandenen IDs in `popup.html`
  abgeglichen (keine Lücken).

**Nicht getestet werden konnte** (kein Browser/Gerät hier verfügbar):
das tatsächliche Rendering/Verhalten in einem echten Chrome, insbesondere
`<dialog>`-Verhalten im Dateimanager, das Laden der `pdf.js`-Worker-
Datei per dynamischem `import()`, und das reale Zusammenspiel mit einem
echten reMarkable/Proxy. Vor der Veröffentlichung empfiehlt sich ein
manueller Durchlauf mit `chrome://extensions` (Entwicklermodus,
"Entpackte Erweiterung laden").

---

## Lizenzen

### Eigener Extension-Code
*(Lizenz der eigenen Code-Teile — Popup, Dateimanager-Integration,
`shared/`, `libs/pdfkit.js`, `libs/readability.js` — vom Maintainer zu
ergänzen.)*

### Mit der Extension ausgelieferte Drittanbieter-Bibliotheken
Alle Lizenztexte liegen zusätzlich vollständig unter
`assets/vendor/licenses/` und in `assets/vendor/THIRD_PARTY_NOTICES.txt`:

| Bibliothek | Lizenz | Copyright |
|---|---|---|
| [pdf-lib](https://pdf-lib.js.org/) | MIT | © 2019 Andrew Dillon |
| [pdf-lib/standard-fonts](https://github.com/Hopding/standard-fonts) | MIT | siehe `pdf-lib-standard-fonts.LICENSE.md` |
| [pdf-lib/upng](https://github.com/photopea/UPNG.js) | MIT-ähnlich | siehe `pdf-lib-upng.LICENSE` |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Apache-2.0 | © Mozilla Foundation |
| [JSZip](https://stuk.github.io/jszip/) | MIT (bzw. GPLv3, zur Wahl) | © 2009–2016 Stuart Knightley u.a. |
| [pako](https://github.com/nodeca/pako) | MIT/zlib | © 2014–2017 Vitaly Puzrin, Andrei Tuputcyn |
| [marked](https://marked.js.org/) | MIT | © 2018+ MarkedJS, © 2011–2018 Christopher Jeffrey |
| [tslib](https://github.com/Microsoft/tslib) | 0BSD | © Microsoft Corporation |
| reMarkable Ark Design-System, Logo, Schriften (`assets/index.css`, `assets/rm_logo.svg`, `reMarkableSans*.woff2`) | Eigentum von reMarkable AG | aus der Geräte-Firmware übernommen, nicht quelloffen — Nutzung nur im Kontext dieser Extension für reMarkable-Geräte sinnvoll |

### Zum Vormerken: vorgesehene künftige Ersetzung
Auf Wunsch des Maintainers werden `libs/pdfkit.js` (eigener,
jsPDF-ähnlicher PDF-Writer) und `libs/readability.js` (eigener,
Arc90/Readability-ähnlicher Lesemodus-Extraktor) absehbar durch die
echten Originalbibliotheken ersetzt. **Zur Klarstellung**: Die
aktuellen Dateien sind eigenständige, unabhängig geschriebene
Implementierungen mit absichtlich ähnlicher Aufruf-API — sie enthalten
keinen Code der folgenden Projekte, deren Lizenzen hier bereits
vorsorglich dokumentiert sind:

| Bibliothek | Lizenz | Copyright | Projekt |
|---|---|---|---|
| jsPDF | MIT | © 2010–2021 James Hall u.a. | https://github.com/parallax/jsPDF |
| Mozilla Readability | Apache-2.0 | © Mozilla Foundation | https://github.com/mozilla/readability |

Beim tatsächlichen Austausch sind jeweils die MIT- bzw. Apache-2.0-
Lizenzbedingungen (Copyright- und Lizenzhinweis beilegen) einzuhalten
und die Dateien unter `assets/vendor/licenses/` zu ergänzen.

Die früher mitgelieferte, nie geladene Kopie `libs/jspdf.js` (echte
jsPDF-Quelle, wegen ES-Modul-Syntax im MV3-Kontext nicht nutzbar) ist
inzwischen **aus dem Projekt entfernt**; das Global `window.jspdf`,
das `popup.js` verwendet, stammt ausschließlich von `libs/pdfkit.js`.

---

## UI-Überarbeitung (Dateimanager): Liste, Buttons, Dialoge

- **Dateiliste** (`assets/js/app.js`, `assets/app.css`): Jede Zeile hat
  zwei Spalten — links Checkbox, Dateitypen-Icon und darunter das
  Vorschaubild in unveränderter Größe (darunter flexibler freier
  Raum), rechts der Titel in variabler Höhe mit einer Meta-Zeile
  darunter (Seite, Datum, Freiraum, PDF/RMDoc/Details-Buttons). Die
  Dateiendung (z. B. `.pdf`) wird im Titel nicht mehr angezeigt, der
  Typ ist am Icon erkennbar.
- **Buttons außerhalb der Dateiliste** (Export-, Import- und
  Vorschau-Dialoge): rechteckig, mit Icon vor dem Text und Outline in
  derselben Farbe wie die Schrift — farblich passend zu den
  Dateityp-Buttons (PDF = rot, RMDoc = schwarz, Upload = Interaktions-
  blau, Archiv = neutral). In der Dateiliste bleiben die Pillen
  rund (`.rmx-pill`).
- **Eingabefelder**: aktiv (Fokus) dezent über den blauen Fokusring
  hervorgehoben, gesperrte Felder gedämpft hinterlegt,
  schreibgeschützte ohne Füllung — alles in gedeckten Farben.
- **Details-Dialog**: nur noch Vorschau-Button; die Dateitypen-Downloads
  und das An-/Abwählen sind hier entfallen.
- **Vorschau-Dialog**: hier lässt sich das PDF und — soweit verfügbar
  — das RMDoc herunterladen; ist das RMDoc nicht verfügbar, erscheint
  ein dezenter Hinweis-Toast.
- **Server-Panel** (`shared/servers.js`/`servers.css`, gemeinsam mit dem
  Popup): Login-Karte nutzt die vorhandenen Ark-Eingabefelder (inkl.
  Fokusring), jede Serverzeile erhält Kopieren- und Tab-Öffnen-Button.

## UI-Kompaktheits-Durchgang (Dateimanager)

Auf Nachbesserung hin durchgängig verdichtet, Werte bleiben überall
mindestens so groß wie das jeweils kleinste bereits vorhandene Element
(`.ark-button-small` = 2rem bleibt z.B. unverändert die untere Grenze
für Dialog-Buttons):

- **Vorschau-Button aus der Dateiliste entfernt** (samt totem Klick-
  Handler) – redundant, da die Detailansicht (Info-Button) die Vorschau
  bereits automatisch beim Öffnen lädt.
- **Server-Panel neu verankert**: hängt jetzt als erstes Kind direkt in
  `.rmx-container` (statt als eigenständiges Geschwister-Element davor)
  – erbt dadurch automatisch exakt dieselbe Breite/Zentrierung/
  Seitenränder wie "Meine Dateien", Suche und Import/Export, die vorher
  zu große und uneinheitliche eigene Polsterung ist komplett entfallen.
  Behebt gleichzeitig das zu große Spacing *und* die fehlende
  Bündigkeit in einem Schritt (gleiche Ursache: eine falsch gewählte
  CSS-Variable für die Seitenränder).
- **Checkbox-Höhe** (`.ark-input-checkbox`) in einer einzigen globalen
  Regel von 2rem auf 1.5rem reduziert – dadurch automatisch überall
  einheitlich (Dateiliste, Ordner-Kacheln, alle Dialoge).
- **Dateiansicht** (Tabellenzeilen): Zeilenpolsterung 22px→12px (bzw.
  10px→8px im Thumbnail-Modus).
- **Ordneransicht** (Kachel-Grid): Polsterung 8px→6px, Icon 32px→28px.
- **PDF/RMDoc-Buttons** (gleiche `.rmx-pill`-Klasse in Dateiansicht und
  Import-Dialog): Höhe 32px→26px.
- **Suchfeld & Filterleiste**: Eingabehöhe 3rem→2.5rem.
- **Import-/Export-/Vorschau-/Detail-Dialoge**: Eingabe- und
  Auswahlfelder 3rem→2.5rem, mittlere/große Buttons rücken näher an die
  kleine Variante heran (2rem bleibt unverändert die Grenze nach unten),
  Schalter (Switches) leicht verkleinert.

## Code-Optimierung: Mehrsprachigkeit, wiederverwendbare Helfer, Testsuite

Durchgängiger Aufräum-Durchgang über den gesamten Code:

- **Vollständige Mehrsprachigkeit** — die letzten hartkodierten
  deutschen Texte wurden auf die fünf Sprachen (de/en/it/es/fr) umge-
  stellt: sämtliche Statusmeldungen des Popups (Artikel-/Bilder-Scan,
  Upload-Ergebnisse, Fehlertexte), die komplette Server-Komponente
  `shared/servers.js` (Login-Karte, Status, Kopieren/Öffnen-Tipps,
  Leer-Zustände) und die statischen Popup-Texte via `data-i18n`/
  `data-i18n-title`. Die Helfer haben robuste deutsche Fallbacks,
  falls `i18n.js` einmal nicht geladen sein sollte.
- **Wiederverwendbare Helfer ausgelagert** — `asciiName()` und `ymd()`
  existierten doppelt (popup.js/app.js bzw. app.js); sie liegen jetzt
  in `shared/filename.js` neben `sanitizeFilename()`, und `app.js`
  nutzt nur noch Verweise darauf.
- **Tote Codezeilen entfernt** — ungenutztes `libs/jspdf.js`
  (181 KB, nicht ladbar) aus dem Projekt; ungenutzte Variable
  `imagesScanned` aus `popup.js`; verwaiste CSS-Regeln aus
  `assets/app.css` (`.rmx-note*`, `.rmx-adv*`, `.obtns`) samt
  Doppeldefinition von `.rmx-copies .orow` entfernt und einen
  veralteten Kommentar korrigiert.
- **Testsuite neu** — `tests/run.js` (31 automatisierte Prüfungen,
  ohne Abhängigkeiten), läuft mit `node tests/run.js`:
  * `shared/filename.js`: alle drei Helfer inkl. Grenzfälle
    (Sonderzeichen, Steuerzeichen, 120-Zeichen-Grenze, Fallback,
    Umlaut-Mapping, NFD-Akzente, ungültiges Datum),
  * i18n-Integrität: jeder der 200+ Schlüssel ist
    für alle 5 Sprachen übersetzt, keine leeren Texte, keine
    doppelten Schlüssel,
  * Referenzauflösung: jeder im JS/HTML genutzte `t("...")`-bzw.
    `data-i18n`-Schlüssel existiert in der Tabelle,
  * Dateireferenzen: alle `src`/`href` in beiden HTML-Seiten, alle
    `R.load`-Pfade und alle Icon-Pfade aus `manifest.json` existieren,
  * `manifest.json` ist gültiges MV3-Manifest,
  * `node --check`-Syntaxprüfung aller eigenen JS-Dateien,
  * keine Referenz mehr auf die entfernte `libs/jspdf.js`; die aktive
    `libs/pdfkit.js` wird weiterhin geladen.

---

## Popup-Expander, Statusliste und Feinschliff (Dateimanager)

Aktuelle Runde UX-Verbesserungen:

- **Popup: Gruppen als Expander** — „Seite als PDF“ ist eine offene
  Gruppe mit Häkchen in der Überschrift (statt des alten Schalters);
  „Bilder“ ist eine zuklappbare Gruppe. Die Bild-Anzahl-Texte sind
  entfallen, der Einzel-Upload-Button pro Bild ebenso. Der Schalter
  heißt jetzt „Einzelmodus“ (jedes Bild als eigenes PDF).
- **Senden-Button zeigt, was gesendet wird** — z. B. „Webseite und
  4 Bilder senden“, „Webseite senden“, „4 Bilder senden“, je
  nach Auswahl, in fünf Sprachen.
- **Status-Expander vor dem Senden-Button** — erscheint beim Senden
  und ist auffaltbar; zugeklappt zeigt er „x von n Dateien“. Eine
  Zeile pro Datei (Webseite, zusammengefasstes Bilder-PDF bzw. je
  Bild im Einzelmodus) mit Spinner, dann Grün/Rot/Gelb-Status und
  den Server-Ergebnissen im Tooltip.
- **Dateimanager mobil und ikonografisch** — Toolbar/Schaltleisten
  umbrechen auf schmalen Displays sauber, Dateizeilen haben hori-
  zontale Polster (Auswahlrahmen überlappt keinen Inhalt mehr), die
  Datums-Presets sind reine Icons (Kalender mit Gegen-Uhrzeigersinn-
  Pfeil), „Auswahl aufheben“ nutzt die Negativversion des
  Alles-auswählen-Icons, Vorschaubilder ~20 % größer.
- **Import-Ergebniszeilen** — Vorschau und Dateityp-Badge links vor
  dem mehrzeiligen Titel; wiederholte Auswahl bereits gelisteter
  Dateien aktualisiert sie, statt Duplikate anzulegen.
- **Details-Dialog** — der Vorschau-Knopf in der Fußeile ist ent-
  fernt; das Vorschaubild (Seitenformate abseits von A4 bleiben erhalten)
  trägt ein Augen-Badge als Klick-Hinweis. In der Dateiliste zeigt
  ein Augen-Icon direkt neben „Details“ die Vorschau an.
- Eingabefelder haben dezente Standard-Outlines, der Fokusring bleibt
  klar; bei der Suche/Filterung bleibt alles zweispaltig kompatibel.

---

## Popup ohne Checkboxen: Expander-Zustand steuert das Senden

Weitere UX-Runde nach Feedback:

- **Popup**: der Reload-Button in der Bildgruppe ist entfallen —
  Bilder werden beim Öffnen des Popups ohnehin neu geladen.
- **Beide Gruppen sind Expander**: „Seite als PDF“ ist ausgeklappt
  (und dann enthalten), „Bilder“ eingeklappt. Der Zustand der Gruppen
  steuert, was gesendet wird — Checkboxen sind entfallen. Der
  Auffalt-Pfeil sitzt ganz rechts am Rand; unter dem Titel der
  Seitengruppe ist mehr Abstand.
- **Zählbadges im Expander-Kopf** (links außen, mit reserviertem
  Platz wie der Auswahl-Zähler im Export): die Seitengruppe zeigt 1
  solange sie enthalten ist, die Bildgruppe die Anzahl gewählter
  Bilder (unsichtbar bei 0).
- **Senden-Button**: nennt die Anzahl der erzeugten PDFs — „In 2 PDF
  senden“, „In 5 PDF senden“ usw. (Webseite + Bilder zusammengefasst
  bzw. je Bild im Einzelmodus), in fünf Sprachen.

## Dateimanager: Aufräumen und kompaktere Filter

- **Kopieren entfernt**: die Funktion „Kopieren“ in der Dateiliste ist
  ersatzlos entfernt (`copy.js` gelöscht, Dialog, Button, Styles und
  Übersetzungen bereinigt).
- **Vorschau/Details enger**: das Augen-Icon und das Details-Icon
  stehen jetzt als Paar dicht beieinander in der Aktionsspalte.
- **Datumsfilter**: Schnellfilter sind jetzt **30 / 14 / 7 Tage** und
  zeigen die Tageszahl am Button; daneben setzt ein Reset-Icon den
  Zeitraum zurück.
- **Export**: hinter dem Dateinamen steht keine Dateitypen-Endung
  (.pdf/.zip) mehr — die Endung entsteht beim Download ohnehin.

---

## Installation (Entwicklung/Test)
1. `chrome://extensions` öffnen.
2. **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden**, diesen Ordner auswählen.
4. Popup-Icon anklicken: Server (Standard `https://10.11.99.1`)
   konfigurieren, ggf. Zugangsdaten hinterlegen.
5. 🗂 im Popup-Header öffnet die vollständige Dateiverwaltung.

## Über diese Version
Code, Dateimanager-Integration, gemeinsame Komponenten und Tests dieser
Extension wurden in Zusammenarbeit mit **Claude (Anthropic)** erstellt,
auf Basis der vom Maintainer bereitgestellten erweiterten reMarkable-
Weboberfläche. Angaben zu Maintainer, Kontakt, Versionsnummer und
Store-Metadaten werden vom Maintainer ergänzt.
