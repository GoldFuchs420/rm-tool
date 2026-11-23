# Hinweis zu KI-unterstützt erstelltem Code

Teile des eigenen Codes dieser Extension wurden mithilfe von
KI-Assistenten erstellt. Dies betrifft:

- **Claude (Anthropic)** – Erstellung der Extension-Logik, der
  Dateimanager-Integration, der gemeinsamen Komponenten (`shared/`),
  von `libs/pdfkit.js` und `libs/readability.js` sowie der Tests;
  dokumentiert in der Sektion „Über diese Version" der `README.md`.
- **Mistral (Vibe Code, Mistral AI)** – Zusammenführung der
  übermittelten Dateien zur lauffähigen Repository-Struktur, Erstellung
  der Extension-Icons (`icons/icon16.png`, `icon48.png`, `icon128.png`
  als eigenständige Vektor-/Pixel-Renderings) und Ergänzung der
  Lizenz-Sammlung (`assets/vendor/licenses/`).

Alle fremden geistigen Eigentumsrechte sind ungeachtet dieser Herkunft
respektiert: Bootstrap-Implementierungen, die an fremde APIs
(jsPDF, Mozilla Readability) angelehnt sind, enthalten **keinen Quellcode
dieser Projekte** (siehe `README.md`, Abschnitt „Zum Vormerken:
vorgesehene künftige Ersetzung"). Mitgelieferte Originalbibliotheken
liegen gebündelt und unverändert unter `assets/vendor/` mit ihren
Lizenztexten in diesem Verzeichnis.

Die Verantwortung für Fehlfunktionen und die Veröffentlichung liegt
beim Maintainer des Projekts, nicht bei den KI-Anbietern.
