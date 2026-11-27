/*
 * Parser für reMarkable-.rm-Dateien (v5 und v6): dünner Wrapper um die
 * MIT-lizenzierte, abhängigkeitsfreie Bibliothek "remarkable-rm"
 * (https://www.npmjs.com/package/remarkable-rm). Kein eigener Parser: das
 * Binärformat (insbesondere das getaggte Block-/CRDT-Format von v6) selbst
 * nachzubauen wäre unnötig riskant, da es bereits eine verifizierte,
 * offline-fähige Implementierung gibt. Siehe docs/ocr-pipeline.md, Stufe 1.
 *
 * Die Bibliothek wird lazy über R.load.rmRm() (assets/js/util.js) geladen,
 * genau wie pdf.js/pdf-lib/JSZip im Rest des Projekts.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  /**
   * Parst den Inhalt einer .rm-Datei in ein RmDocument
   * ({ version: 5|6, pages: [{ layers: [{ name, items: [...] }] }] }).
   * @param {ArrayBuffer|Uint8Array} buffer Inhalt einer .rm-Datei
   * @returns {Promise<Object>} RmDocument
   */
  async function parse(buffer) {
    const lib = await R.load.rmRm().then(function () { return window.RemarkableRM; });
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return lib.parse(bytes);
  }

  /**
   * Alle Striche einer Seite, über alle Layer hinweg, flach. Für die
   * Segmentierung (Stufe 2) reicht eine flache Liste; die Layer-Gruppierung
   * ist für die reine Text-OCR nicht relevant (Regionen kommen über
   * rmregions.js).
   * @param {Object} page ein Eintrag aus RmDocument.pages
   * @returns {Array} Liste von RmStroke-Objekten
   */
  function strokesOf(page) {
    const out = [];
    (page.layers || []).forEach(function (layer) {
      (layer.items || []).forEach(function (item) {
        if (item.type === 'stroke') out.push(item);
      });
    });
    return out;
  }

  /**
   * Begrenzendes Rechteck über eine Liste von Strichen - Grundlage für
   * Zeilen-/Wort-Segmentierung und für den Zuschnitt einzelner Bereiche.
   * @param {Array} strokes Liste von RmStroke-Objekten
   * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null} null bei leerer Liste
   */
  function bounds(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    if (minX === Infinity) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  R.rmlines = { parse: parse, strokesOf: strokesOf, bounds: bounds };
})();
