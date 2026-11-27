# reMarkable Toolkit v1.2

[![tests](https://github.com/GoldFuchs420/rm-tool/actions/workflows/tests.yml/badge.svg)](https://github.com/GoldFuchs420/rm-tool/actions/workflows/tests.yml)

**reMarkable Toolkit** ist eine Chrome-Erweiterung (Manifest V3), die Web-Artikel
im Lesemodus und Bilder einer Webseite als sauber formatierte PDFs direkt an ein
reMarkable-Tablet sendet — plus eine vollwertige Dateiverwaltung für das Gerät,
in der Optik von reMarkables eigenem Ark-Design.

---

## Funktionen

### Popup — senden mit einem Klick
- **Artikel als PDF im Lesemodus**: Werbung, Navigation und Sidebars werden
  entfernt; echtes Kapitel-Umbrechen (keine Überschrift allein am Seitenende),
  Aufzählungen, Zitate, Fußzeile mit Quelle und Bild-Umfluss inkl. Orphan-Schutz.
- **Bilder sammeln**: Alle echten Bilder der Seite (keine Werbe-/Schmuckbilder)
  als durchscrollbarer Streifen — zusammenhängend als ein PDF oder, per Schalter
  „Ein Bild pro PDF", als Einzeldateien. Bildnamen aus dem Alt-Text, sonst
  „Bilder von {Titel} – n". Minimalbreiten-Slider filtert Icons und Zierbilder.
- **Kombinierbar**: Webseite und Bilder gehen mit einem Klick gemeinsam an alle
  erreichbaren Server; der Status-Expander zeigt je Datei ✓/✗ je Server.
- **Schriftgröße pro Website und Dokumenttyp** (Artikel, PDF, Code, Markdown)
  gespeichert; der letzte Wert gilt als Default. 5 Sprachen (de, en, it, es, fr)
  direkt im Popup umschaltbar.
- **Code-/Markdown-Links**: sources mit Endung `.js`, `.ts`, `.py`, `.sh`, ...
  oder `.html` landen als formatierter Code im PDF (Zeilennummern,
  GitHub-artiges Syntax-Highlighting, Klassen/Blöcke werden nicht zerteilt,
  kompakte Ränder mit Zeilennummern am Seitenrand); der Dateiname trägt die
  Endung (z. B. `widgets.js.pdf`) und `.md` wird weiter als lesbares Dokument
  gerendert. Die Schriftgröße kommt aus dem Popup-Slider.
- **EPUB-Durchreichung**: `.epub`-Dateien und EPUB-Links werden unverändert
  an das Tablet gesendet — der Geräteimport unterstützt EPUB nativ, eine
  PDF-Umwandlung entfällt.
- **Verbindungs-Gating**: Ohne erreichbaren Server wird nur die Serverliste
  gezeigt — kein Senden-Button, der ins Leere läuft.

### Dateimanager — das reMarkable im Browser
- Ordner-Navigation, Favoriten, Suche und Filter (Zeitraum 30/14/7 Tage mit
  Kalender-Icon, Dateitypen PDF/EPUB/Notebook je Checkbox).
- **Import** von PDF, EPUB, RMDoc, JPG/PNG/SVG, Markdown, Text, Code-Dateien
  (JS/TS/PY/SH ... werden als formatiertes PDF mit Zeilennummern umgewandelt,
  HTML ebenfalls als Code) sowie ZIP/TAR-Archiven: Vorschau entsteht
  automatisch, Einträge sind jederzeit ergänz- und entfernbar, ein Klick lädt
  die ganze Liste hoch; Namensoptionen (Datumspräfix, nur einfache Zeichen)
  wie im Export.
- **Export** als PDF oder RMDoc, einzeln oder als ZIP/TAR.GZ mit Ordnerstruktur.
- Inline-PDF-Vorschau, Details-Dialog, Mini-Vorschaubilder in der Dateiliste.

### OCR-Pipeline — Notebook-Notizen als Markdown (Stufen 1–6, neu)
- **`.rm`-Parsing**: reMarkable-`.rm`-Dateien (Firmware v5 und v6) werden über
  die MIT-lizenzierte Bibliothek `remarkable-rm` offline im Browser gelesen —
  kein eigener Binär-Parser, kein Server.
- **Zeilen-/Wort-Segmentierung**: reine Geometrie auf den Vektordaten
  (Tinten-Histogramm + Lücken-Erkennung), Grundlage für die OCR.
- **Handschrift-OCR**: Deutsch zeilenbasiert via `naeyn/de-htr-web-v2`
  (ONNX, onnxruntime-web, komplett offline), Englisch wortbasiert via
  `xournalpp-htr-simple-htr`; gemeinsame Greedy-CTC-Dekodierung.
- **Formeln**: stroke-basierte Erkennung via CoMER (`ink-on`) → LaTeX,
  gerendert per KaTeX.
- **Bereiche**: Ebenen markieren Text/Formel/Bild; eingefügte Bilder werden
  direkt aus dem `.rmdoc`-Archiv gelesen.
- **Ergebnis**: ein einziges Markdown-Dokument, sortiert nach y-Position.
  Setup, Verifikation und offene Verifikationsschritte: `docs/ocr-pipeline.md`.
- **Setup ohne npm/git**: fehlende Modell- und Vendor-Dateien lädt die
  Setup-Seite der Erweiterung (Dateimanager → **OCR-Setup**, bzw.
  `setup.html`) direkt aus den offiziellen Quellen und packt sie als ZIP;
  Anleitung in `docs/ocr-pipeline.md`, Abschnitt A1.

### Server-Verwaltung — bei beiden Ansichten
- Mehrere Server (Standard `https://10.11.99.1`), Erreichbarkeits-Check mit
  Ampel-Status (grün / pulsierend = verbinde / rot).
- **Basic-Auth-Login inline in der Serverliste** (alternativ der Browser-Dialog),
  Knöpfe zum Kopieren der Adresse und zum Öffnen im neuen Tab.
- Eine gemeinsame Komponente (`shared/servers.js`) für Popup und Dateimanager —
  identisches Verhalten ohne doppelten Code.

---

## Systemvoraussetzungen

| Bestandteil | Anforderung |
|---|---|
| Browser | Chrome, Edge oder Brave mit Manifest-V3-Unterstützung; das PDF-Vorschaubild nutzt pdf.js |
| Gerät | reMarkable-Tablet mit erreichbarem REST-Proxy (`/upload`-Endpunkt), alternativ direkt `https://10.11.99.1` |
| Authentifizierung | optional Basic-Auth (Zugangsdaten im Browser gespeichert, `chrome.storage.local`) |
| Internet | keine — außer für das Herunterladen der Bilder der aktuellen Webseite |

Es werden keine Daten an Dritte gesendet; alles bleibt zwischen Browser und den
selbst konfigurierten Servern.

---

## Installation

1. Repository herunterladen oder klonen:
   `git clone https://github.com/GoldFuchs420/rm-tool.git`
2. `chrome://extensions` öffnen.
3. **Entwicklermodus** rechts oben aktivieren.
4. **Entpackte Erweiterung laden** und den geklonten Ordner auswählen.
5. Popup-Icon anklicken, Serverkonfiguration prüfen (Standard
   `https://10.11.99.1`), ggf. Zugangsdaten hinterlegen — sobald ein Server
   grün ist, erscheinen Senden-Button und Dateimanager (Ablage-Symbol 🗂).

Die Testsuite läuft ohne Abhängigkeiten direkt mit Node:
`node tests/run.js` (60 Checks; automatisch auch in CI bei jedem Push/PR).

---

## Changelog — Commits auf main seit dem letzten Merge

Letzter Merge in `main`: PR #30 (`71f45ac`, 24.11.2026). Die folgenden 44
Commits sind seitdem direkt auf `main` gelandet (Stand 27.11.2026):

**2026-11-24**

| Commit | Änderung |
|---|---|
| [`95cad20c`](https://github.com/GoldFuchs420/rm-tool/commit/95cad20c80b45a020d81dcebe2309b21ef700492) | textpdf.js — revert html to pdf renderer |
| [`eeed6836`](https://github.com/GoldFuchs420/rm-tool/commit/eeed6836b2fdc2bce532b4732373c313aed25705) | README.md |
| [`a494d383`](https://github.com/GoldFuchs420/rm-tool/commit/a494d3838656a307ad33b94e0e9f560e7ef76009) | popup.js — Bilder-Streifen auch nach Seitenende (Verwandtes/Weitere Themen) |
| [`e27b6403`](https://github.com/GoldFuchs420/rm-tool/commit/e27b6403ea0bbd568434a2732fc29484e54df1aa) | popup.js — mehr Abstand zwischen Kapiteln im Renderer |
| [`80f082b4`](https://github.com/GoldFuchs420/rm-tool/commit/80f082b4d14a337cbf77ccc947b5e5cf6cbed00b) | textpdf.js — Fix: ungültiges Highlighting, wenn ein Regex Anführungszeichen ersetzt, aber nicht selbst in Anführungszeichen steht |

**2026-11-25**

| Commit | Änderung |
|---|---|
| [`adc23598`](https://github.com/GoldFuchs420/rm-tool/commit/adc2359813ee9831acfa8ada3555d4c06fda24c5) | textpdf.js — Tokenizer für Code-Highlighting verbessert |
| [`39182695`](https://github.com/GoldFuchs420/rm-tool/commit/391826950e06a43abbca15d507726c806461bc83) | outputs.js — Schriftskalierung in den Import einbezogen |
| [`ea206b8b`](https://github.com/GoldFuchs420/rm-tool/commit/ea206b8b8849c3a714114e2e39ec2b081c83eea2) | import.js — Events/Änderungen für Fontscale im Dateimanager |
| [`81301828`](https://github.com/GoldFuchs420/rm-tool/commit/8130182892b14609ee7d6181eb6505592003ddbb) | import.js — Fix: Sichtbarkeit Fontscale |
| [`339c9735`](https://github.com/GoldFuchs420/rm-tool/commit/339c97350ae6026c89a6d26305404176a08f210f) | i18n.js — fehlende Übersetzung ergänzt (vom Test gefunden) |
| [`b96d1950`](https://github.com/GoldFuchs420/rm-tool/commit/b96d19508dd63d48f46f7eb101fcaec32f9bfa89) | i18n.js — Übersetzungen korrigiert |
| [`408e9aee`](https://github.com/GoldFuchs420/rm-tool/commit/408e9aeee3dd4d50a75a274eeee1d9b6b4d023a4) | i18n.js — Übersetzungen korrigiert |
| [`136e93db`](https://github.com/GoldFuchs420/rm-tool/commit/136e93db551976bac8a5d82ebab9ab1f63b7a710) | outputs.js — Import-Block-Fontscale zurückgenommen |
| [`7d3ca91a`](https://github.com/GoldFuchs420/rm-tool/commit/7d3ca91adc3021f8d2b170fd1c4c4c9e90ae13d9) | import.js — infile scaling p1 |
| [`27edaa94`](https://github.com/GoldFuchs420/rm-tool/commit/27edaa948ea8795325a0727ea02ae3bc8bf5fd6e) | outputs.js — infile fontsize scaling p2 |
| [`85d3b197`](https://github.com/GoldFuchs420/rm-tool/commit/85d3b19772a43204fde5065ddec882edf475a023) | app.css — fehlende Styles ergänzt (Slider in der Vorschau) |
| [`100effae`](https://github.com/GoldFuchs420/rm-tool/commit/100effae6100e69f04b3210f207816129be99ae7) | popup.css — Fontscaling der Vorschau |
| [`98696e5f`](https://github.com/GoldFuchs420/rm-tool/commit/98696e5fe48196c15dd167e32eb512e3d7fcaf3e) | popup.js |
| [`95dc13c9`](https://github.com/GoldFuchs420/rm-tool/commit/95dc13c971431aeec69ecf48457729f0d4232639) | outputs.js — fontscale preview und import inline |
| [`6818dd93`](https://github.com/GoldFuchs420/rm-tool/commit/6818dd93bbc50f32fb7dd0a0cf66cca5feccd46f) | preview.js — preview fontscale |
| [`e0814578`](https://github.com/GoldFuchs420/rm-tool/commit/e0814578a7618ac46fb7e163da199f7ae99e2e50) | outputs.js — Fix: Fontscaling-Fehler im Test |
| [`1f1a31fa`](https://github.com/GoldFuchs420/rm-tool/commit/1f1a31faee5570f8beb0a723eb9c3d2bb37a757a) | app.css — Nachbesserung nach CSS-Test-Fail |
| [`79af7959`](https://github.com/GoldFuchs420/rm-tool/commit/79af7959ae76421366172b96828d9bbdf0e05fef) | popup.html — problematische Double-Slider-Entscheidung durch robustere Lösung ersetzt |
| [`cd5d360a`](https://github.com/GoldFuchs420/rm-tool/commit/cd5d360abd11d52312e0124200d3ba23b52253a3) | popup.css — Double-Slider-CSS |
| [`118f5703`](https://github.com/GoldFuchs420/rm-tool/commit/118f5703e1f05f026677c066d614a3ef5852e931) | popup.js — Double-Slider-Code (zukünftig gern als Klasse; TS/MVVM-Rework geplant) |
| [`25379c70`](https://github.com/GoldFuchs420/rm-tool/commit/25379c700e33116e1d447ce052f980b4aa822345) | popup.js — missing fix |
| [`96836fee`](https://github.com/GoldFuchs420/rm-tool/commit/96836fee027ac196a8311e769d56752e6bb8d3a3) | popup.css |
| [`160089d6`](https://github.com/GoldFuchs420/rm-tool/commit/160089d67443430040b039c6832a996191aa1cb9) | app.css |
| [`dc556a68`](https://github.com/GoldFuchs420/rm-tool/commit/dc556a6860ecf347cb5bfbbcd035a5b0e7e8d23f) | popup.css |
| [`322f731a`](https://github.com/GoldFuchs420/rm-tool/commit/322f731ab4957afa03d305e33e2b9537f12f7da6) | app.css |
| [`248c31b8`](https://github.com/GoldFuchs420/rm-tool/commit/248c31b899014a124fbfb0e91213d79bc68d5bde) | textpdf.js — besseres CSS-Highlighting |
| [`a18b1840`](https://github.com/GoldFuchs420/rm-tool/commit/a18b18406e62f5b1e1c7ec2d79f8ed3965361ced) | import.js |

**2026-11-26**

| Commit | Änderung |
|---|---|
| [`a05bd252`](https://github.com/GoldFuchs420/rm-tool/commit/a05bd2525c5a55f5ff65a6907fa375120d18e7f5) | outputs.js — preview scaling fix |
| [`b0f244f5`](https://github.com/GoldFuchs420/rm-tool/commit/b0f244f5e66be92dab410e3e95ad25b14a47ec84) | textpdf.js — XML/HTML/JSON-Styling und Skalierung für HTML-Seiten |
| [`df919a30`](https://github.com/GoldFuchs420/rm-tool/commit/df919a3096c301ba3b28c397db9064d2ac097221) | import.js |
| [`d2a2e01e`](https://github.com/GoldFuchs420/rm-tool/commit/d2a2e01eabeb72d3ff1e9760630718e3d7292b0b) | outputs.js |
| [`5cdf44b6`](https://github.com/GoldFuchs420/rm-tool/commit/5cdf44b69aad5b29382775fb73c6c67c0c7bf85e) | app.css |
| [`e6f061ef`](https://github.com/GoldFuchs420/rm-tool/commit/e6f061efebe6082bb92fefb258a7143e34f6c550) | i18n.js |
| [`3f77aed7`](https://github.com/GoldFuchs420/rm-tool/commit/3f77aed7f7f9a3c51fb188e0777c8370b1d5e5a8) | textpdf.js |
| [`d75bfb42`](https://github.com/GoldFuchs420/rm-tool/commit/d75bfb425dfc84bd46cf01d380ef8882f5649b6b) | outputs.js |
| [`40797114`](https://github.com/GoldFuchs420/rm-tool/commit/407971149de41175f170498f5715f2789290c213) | import.js |
| [`0d2147fe`](https://github.com/GoldFuchs420/rm-tool/commit/0d2147fede9d08eba838578a24c631efa9d5572e) | textpdf.js |
| [`1b0c3afe`](https://github.com/GoldFuchs420/rm-tool/commit/1b0c3afe80bdc13163b3b3471072c472e1342eb8) | textpdf.js |

---

## FAQ

**Funktioniert das ohne extra Software auf dem reMarkable?**
Das Tablet braucht einen kleinen REST-Proxy mit `/upload`-Endpunkt (z. B. von
eines der bekannten Community-Projekte); die Extension spricht simple
HTTP-POSTs. Direkt per USB-Adresse `https://10.11.99.1` geht es ohne Proxy,
sofern die Weboberfläche ergänzt wurde.

**Kann ich mehrere Server parallel nutzen?**
Ja — der Senden-Klick lädt an alle aktuell erreichbaren Server. Der Status
wird je Datei und Server im Status-Expander aufgeschlüsselt.

**Wo landen meine Bilder/Artikel-Namen?**
Bilder heißen nach ihrem Alt-Text, sonst „Bilder von {Seitentitel} – 1, 2, …".
Artikel heißen wie der Seitentitel; `\ : * ? " < > |` werden bereinigt, auf
Wunsch (Import/Export) ä → ae, é → e.

**Warum sehe ich im Popup nur die Serverliste?**
Bis mindestens ein Server als erreichbar geprüft ist, sind Senden und weitere
Bereiche bewusst ausgeblendet — genau so im Dateimanager (dort Dateiliste und
Filter).

**Welche Sprachen gibt es?**
Deutsch, Englisch, Italienisch, Spanisch, Französisch — umschaltbar im Popup
(neben dem Dateimanager-Icon) und im Dateimanager-Header; ein Test stellt sicher,
dass alle Sprachen dieselben Schlüssel und Platzhalter haben.

**Wie wird eine neue Version erzeugt?**
`node tools/bump-version.js [patch|minor|major]` erhöht die Version in
`manifest.json` (ein 1-Zeilen-Diff).

**Welche Bibliotheken sind im Paket?**
pdf-lib, PDF.js, JSZip, pako, marked, tslib (alle `assets/vendor/licenses/`).
Die OCR-Pipeline lädt zusätzlich `remarkable-rm`, `onnxruntime-web`, `ink-on`
und KaTeX sowie die ONNX-Modelle — diese großen npm-Builds/Modelle werden
einmalig beschafft und liegen nicht im Repository; ohne npm/git übernimmt das
die Setup-Seite (**OCR-Setup** im Dateimanager), Details in
`docs/ocr-pipeline.md`. Dazu Lizenztexte für Bibliotheken, die beim
Austausch vorgesehener Komponenten relevant werden. reMarkables
Ark-Design-System, Logo und Schriften stammen aus der Geräte-Firmware und
sind Eigentum der reMarkable AG.

---

## Fazit

reMarkable Toolkit schließt die Lücke zwischen „im Browser lesen" und „auf dem
Tablet weiterhin lesen": der Lesemodus erzeugt Dokumente, die wirklich gut
aussehen statt einer rohen Druckseite, die Dateiverwaltung ersetzt den Umweg
über den Datei-Explorer, und die gemeinsame Serverkomponente hält alle
Zielgeräte an einem Ort. Der Code ist weitestgehend `const`/`let`-modern, ohne
Build-Schritt und mit einer selbstlaufenden Testsuite gesichert — zum
Ausprobieren genügen Ordner laden und Entwicklermodus.
