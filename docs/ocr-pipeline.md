# OCR-Pipeline (Stufen 1–6) — Setup & Dokumentation

Grundlage für die komplette OCR-/Transkriptions-Pipeline (Text, Formeln,
Bilder) für reMarkable-Notebooks: `.rm`-Dateien (Strichdaten) werden
eingelesen, in Zeilen/Wörter segmentiert, per ONNX-Modellen offline im
Browser erkannt und zu einem Markdown-Dokument zusammengesetzt.

Der Code dieser Pipeline liegt im Repository:

| Stufe | Baustein | Datei |
|---|---|---|
| 1 | `.rm`-Parser (via `remarkable-rm`) | `assets/js/rmlines.js` |
| 2 | Zeilen-/Wort-Segmentierung | `assets/js/rmsegment.js` |
| 3 | Rasterung + Graustufen | `assets/js/rmrender.js` |
| — | Gemeinsame CTC-Dekodierung | `assets/js/ocr-ctc.js` |
| 3 | DE·HTR (Deutsch, zeilenbasiert) | `assets/js/ocr-dehtr.js` |
| 4 | SimpleHTR (Englisch, wortbasiert) | `assets/js/ocr-simplehtr.js` |
| 5 | Bereichs-Markierung (Text/Formel/Bild) | `assets/js/rmregions.js` |
| 5 | Bild-Extraktion aus `.rmdoc` | `assets/js/rmimages.js` |
| 6 | CoMER/`ink-on` (Formeln → LaTeX) | `assets/js/ocr-formula.mjs` |
| 6 | Markdown-Zusammenbau + KaTeX | `assets/js/rmmarkdown.js` |
| 1–6 | End-to-End-Orchestrierung | `assets/js/ocrpipeline.js` |

Alle Module hängen am gemeinsamen Namespace `window.RMX` und laden große
Bibliotheken lazy über `R.load.*` in `assets/js/util.js` (wie `pdf.js`,
`pdf-lib`, `JSZip` im Rest des Projekts). Eingehängt ist die Pipeline in
`filemanager.html` (klassische Skripte + Import-Map + ES-Modul für Stufe 6).

---

## A. Manuell zu beschaffende Dateien

Kein CDN-Laden zur Laufzeit — alles läuft offline. Die folgenden Dateien
sind **nicht** im Repository (große npm-Builds bzw. Modell-Gewichte) und
müssen einmalig manuell abgelegt werden. Die Testsuite prüft nicht ihre
Existenz, sondern nur, dass jede Datei hier dokumentiert ist.

| Quelle | Ziel |
|---|---|
| `npm install remarkable-rm`, dann `cp node_modules/remarkable-rm/dist/index.global.js …` **oder** `https://cdn.jsdelivr.net/npm/remarkable-rm/dist/index.global.js` | `assets/vendor/remarkable-rm/index.global.js` |
| `npm install onnxruntime-web`, dann `cp -r node_modules/onnxruntime-web/dist/* assets/vendor/onnxruntime-web/` (kompletter `dist/`-Ordner — die WASM-Binärdateien gehören dazu) | `assets/vendor/onnxruntime-web/` |
| `https://huggingface.co/naeyn/de-htr-web-v2/resolve/main/model.onnx` (10,4 MB int8 — **nicht** die 40-MB-fp32-Variante) | `assets/models/de-htr-v2/model.onnx` |
| `https://huggingface.co/PellelNitram/xournalpp-htr-simple-htr/resolve/main/model.onnx` | `assets/models/simple-htr/model.onnx` |
| `npm install ink-on`, dann den `exports."./core"`-Pfad aus `node_modules/ink-on/package.json` kopieren (typischerweise `dist/core/`) | `assets/vendor/ink-on/core/` |
| `https://github.com/kimseungdae/ink-on/releases/download/v0.1.0/encoder_int8.onnx` | `assets/models/comer/encoder_int8.onnx` |
| `https://github.com/kimseungdae/ink-on/releases/download/v0.1.0/decoder_int8.onnx` | `assets/models/comer/decoder_int8.onnx` |
| `https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js` | `assets/vendor/katex/katex.min.js` |
| `https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css` | `assets/vendor/katex/katex.min.css` |
| `https://cdn.jsdelivr.net/npm/katex/dist/fonts/` (kompletter Ordner) | `assets/vendor/katex/fonts/` |

Zwischenzeitlich **im Repository** (kleine Textdateien, kein manueller Schritt
mehr nötig): `assets/models/de-htr-v2/config.json` und
`assets/models/comer/vocab.json`.

### A1. Ohne npm/git: Setup-Seite der Erweiterung

Alle Dateien aus Abschnitt A lassen sich auch **komplett ohne npm, git und
Kommandozeile** beschaffen — direkt im Browser:

1. Dateimanager öffnen und oben rechts auf **OCR-Setup** klicken
   (oder `setup.html` der Erweiterung direkt öffnen).
2. Die Seite lädt jede Gruppe aus ihrer offiziellen Quelle (jsDelivr,
   Hugging Face) und zeigt den Fortschritt je Zeile.
3. Zeilen, die nicht automatisch geladen werden können (GitHub-Release-
   Downloads der CoMER-Modelle senden teils keine CORS-Header): Link öffnen,
   Datei speichern und über die Dateiauswahl der Zeile zuordnen.
4. **ZIP-Paket erstellen** klicken. Das Archiv enthält alle Dateien mit der
   korrekten Ordnerstruktur (`assets/…`) und wird in den Erweiterungsordner
   entpackt.

Die Zuordnung Allowlist → Setup-Eintrag wird von Check 21 der Testsuite
sichergestellt (`setup.html` / `assets/js/ocr-setup.js`).

**Lizenzen** (Details in `assets/vendor/THIRD_PARTY_NOTICES.txt`):
`remarkable-rm` MIT (c) Stewart McSporran (Scratchydisk); gebündelte
Noto-Sans-Schriften SIL OFL 1.1 (nur für Node-Rendering, nicht für
`parse()`/`renderToSvg()`). `onnxruntime-web` MIT (Microsoft). Modell-
Gewichte: de-htr-web-v2 Apache-2.0 (Trainingsdaten-Zuschreibung bei
Weiterveröffentlichung: ScaDS.AI German Handwriting Dataset, CC BY 4.0);
xournalpp-htr-simple-htr MIT; ink-on/CoMER Apache-2.0. KaTeX MIT.

**CSP:** Die ONNX-Inferenz braucht WebAssembly. `manifest.json` trägt
deshalb `script-src 'self' 'wasm-unsafe-eval'` — die MV3-Standardsicherheit
(kein `unsafe-eval`, keine Remote-Scripts) bleibt unverändert.

---

## B. Architektur-Entscheidungen

1. **Kein eigener `.rm`-Parser.** Das Binärformat (insbesondere das
   getaggte Block-/CRDT-Format von v6) selbst nachzubauen wäre unnötig
   riskant — `remarkable-rm` deckt v5 und v6 ab und läuft offline.
2. **Lazy-Loading zentral.** Alle externen Bibliotheken laufen über
   `R.load.rmRm()` / `R.load.ort()` in `util.js`; die Pipeline-Module
   enthalten keinen eigenen Skript-Loader mehr (Refaktorierung gegenüber
   der ursprünglichen Setup-Vorlage, die den Loader je Modul duplizierte).
3. **Gemeinsame Bausteine statt Duplikate.** Die Greedy-CTC-Dekodierung
   (identisch für Logits und Log-Wahrscheinlichkeiten) liegt einmal in
   `ocr-ctc.js`; die BT.601-Graustufen-Auslesung liegt in `rmrender.js`
   und wird von DE·HTR (`[0,1]`) und SimpleHTR (`[-0.5, 0.5]` danach)
   geteilt.
4. **`ink-on` als ES-Modul.** `ocr-formula.mjs` wird per
   `<script type="module">` geladen; eine Import-Map brückt dessen
   `onnxruntime-web`-Import auf den bereits lazy geladenen UMD-Build
   (`window.ort`) — siehe `assets/vendor/onnxruntime-web-shim.mjs`. Der
   Shim löst Zugriffe per Proxy erst bei Gebrauch auf, weil `ort.min.js`
   später lädt als der Modul-Import.
5. **Ebenen als Bereichs-Markierung.** Die Position eingefügter Bilder
   steckt im CRDT-Blockformat, das bewusst nicht dekodiert wird.
   Stattdessen: Ebene „Formel" → Formel-Inhalt, Ebene „Bild" → Bild-
   Markierung, alles andere → Text; welche Bilddatei zu welcher Markierung
   gehört, wird über die Lesereihenfolge (oben nach unten) bestimmt.

---

## C. Verifikation

Zum Testen einer eigenen `.rm`-Datei (z. B. aus einem entpackten
`.rmdoc`-Archiv) in der Browser-Konsole des Dateimanagers:

```js
const res = await fetch('/pfad/zur/datei.rm');
const doc = await R.rmlines.parse(await res.arrayBuffer());
console.log('Version:', doc.version, 'Seiten:', doc.pages.length);

const page = doc.pages[0];
console.log(page.layers.map(l => ({ name: l.name, items: l.items.length })));

const strokes = R.rmlines.strokesOf(page);
const lines = R.rmsegment.lines(strokes);
lines.forEach(function (line, i) {
  const words = R.rmsegment.words(line.strokes);
  console.log('Zeile', i, 'Striche:', line.strokes.length,
    'Wörter:', words.length, 'y:', line.top.toFixed(0), '…', line.bottom.toFixed(0));
});
```

End-to-End über den Orchestrator:

```js
const rmBuf = await (await fetch('/pfad/zur/datei.rm')).arrayBuffer();
const { markdown, stats } = await R.ocrPipeline.recognizePage(rmBuf, {
  lang: 'de',            // 'en' = wortbasiert via SimpleHTR
  renderFormulas: false  // true: $$...$$ per KaTeX in Bilder umwandeln
});
console.log(stats, markdown);
```

**Erwartung:** `doc.version` ist `6` (bei aktueller Firmware), die Zeilen-
Anzahl entspricht grob den handschriftlichen Textzeilen; ordentliche
Absätze werden von DE·HTR großteils erkannt (Benchmark-WER ~32 %), bei
Zeichnungen (Strichmännchen, Wellen) ist Unsinn erwartbar — dafür ist die
Bereichs-Markierung (Stufe 5) da, damit nur echte Textbereiche in die OCR
laufen.

### Offene Verifikationsschritte (bewusst nicht geraten)

| Punkt | Wie klären |
|---|---|
| Stufe 4: Tensor-Namen (`INPUT_NAME`/`OUTPUT_NAME` in `ocr-simplehtr.js`) | `assets/models/simple-htr/model.onnx` in [netron.app](https://netron.app) öffnen, Konstanten ersetzen |
| Stufe 4: Zeichensatz-Reihenfolge (`IAM_ALPHABET`) | Bekanntes Testwort (z. B. „TEST" in Blockschrift) erkennen lassen; bei erkennbar verschobener Ausgabe Reihenfolge aus dem `xournalpp_htr`-Trainingscode nachrecherchieren |
| Stufe 5: Ebenennamen | `doc.pages[0].layers.map(l => l.name)` gegen echte Daten prüfen; fehlen Namen, Fallback-Indizes (`formulaLayerIndex`/`imageLayerIndex`) nutzen |
| Stufe 6: `ink-on/core`-Pfad | `node_modules/ink-on/package.json`, Eintrag `"exports"."./core"`, Ordner komplett kopieren |

---

## D. Bekannte Grenzen (bewusst in Kauf genommen)

- **Schräge/gekippte Zeilen** können fälschlich zerfallen oder verschmelzen;
  das Histogramm geht von einigermaßen horizontalen Zeilen aus.
- **Sehr eng stehende Zeilen** können verschmelzen, wenn der leere
  Bin-Zwischenraum zu klein ist (`binSize`/`minGapBins` nachjustierbar).
- **Wortgrenzen** sind ein pauschaler Faktor der Zeilenhöhe
  (`gapFactor`), nicht pro Schreiber kalibriert.
- **DE·HTR:** 112-Symbol-Alphabet (keine typografischen Anführungszeichen
  u. a.), kein Sprachmodell, schwach bei Mathe/Symbolen; historische
  Schriften (Kurrent, Sütterlin) werden nicht unterstützt.
- **SimpleHTR:** Nur Einzelwort-Erkennung, greedy CTC, 78-Zeichen-
  Zeichensatz (keine nicht-lateinischen Schriften).
- **Formeln:** Nur ~36 % exakte Erkennung (CROHME 2014, int8, beam=3),
  ~66 % höchstens 2 Token-Fehler daneben — Formeln manuell gegenlesen.
  `ink-on` ist ein junges, kaum verbreitetes Paket (v0.1.0) — vor
  Produktivnutzung gründlich selbst testen.
- **Bild-Zuordnung:** Reihenfolge der Bilddateien im Archiv (alphabetisch
  nach UUID) entspricht nicht zwingend der Lesereihenfolge; bei genau
  einem Bild pro Markierung meist unkritisch.

---

## E. Status

| Stufe | Baustein | Status |
|---|---|---|
| 1 | `.rm`-Parser (via `remarkable-rm`) | ✅ Code im Repo |
| 2 | Zeilen-/Wort-Segmentierung | ✅ Code im Repo |
| 3 | DE·HTR-Integration (Deutsch, zeilenbasiert) | ✅ Code im Repo |
| 4 | SimpleHTR-Integration (Englisch, wortbasiert) | ⚠️ Tensor-Namen & Zeichensatz zu verifizieren |
| 5 | Bereichs-Markierung + Bild-Extraktion | ⚠️ Ebenennamen-Annahme zu verifizieren |
| 6 | CoMER/`ink-on` (Formeln → LaTeX) + Markdown | ⚠️ `ink-on/core`-Pfad nach `npm install` bestätigen |

Die drei ⚠️-Punkte sind Verifikationsschritte gegen echte Dateien (Anleitung
oben), keine offene Implementierung. Alle Stufen sind architektonisch
vollständig, modularisiert, dedupliziert und durch die Testsuite
(`tests/run.js`, Abschnitte 19–20) abgesichert.
