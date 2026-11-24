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
`node tests/run.js` (46 Checks; automatisch auch in CI bei jedem Push/PR).

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
pdf-lib, PDF.js, JSZip, pako, marked, tslib (alle `assets/vendor/licenses/`),
dazu Lizenztexte für Bibliotheken, die beim Austausch vorgesehener Komponenten
relevant werden. reMarkables Ark-Design-System, Logo und Schriften stammen aus
der Geräte-Firmware und sind Eigentum der reMarkable AG.

---

## Fazit

reMarkable Toolkit schließt die Lücke zwischen „im Browser lesen" und „auf dem
Tablet weiterhin lesen": der Lesemodus erzeugt Dokumente, die wirklich gut
aussehen statt einer rohen Druckseite, die Dateiverwaltung ersetzt den Umweg
über den Datei-Explorer, und die gemeinsame Serverkomponente hält alle
Zielgeräte an einem Ort. Der Code ist weitestgehend `const`/`let`-modern, ohne
Build-Schritt und mit einer selbstlaufenden Testsuite gesichert — zum
Ausprobieren genügen Ordner laden und Entwicklermodus.
