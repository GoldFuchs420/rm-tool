/*
 * Ordnet die Ebenen einer Seite den drei Bereichs-Typen zu: Text, Formel,
 * Bild. Markierung erfolgt über Ebenennamen (falls remarkable-rm sie
 * liefert) oder über die Ebenen-Reihenfolge als Fallback - siehe
 * docs/ocr-pipeline.md, Stufe 5 (Verifikation gegen echte Daten offen).
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  const FORMULA_NAMES = /formel|formula|math/i;
  const IMAGE_NAMES = /bild|image|picture|photo/i;

  /**
   * @param {Object} page ein Eintrag aus RmDocument.pages
   * @param {{formulaLayerIndex?: number, imageLayerIndex?: number}} [fallback]
   *   Index-Fallback, falls Ebenen keine (erkannten) Namen tragen.
   * @returns {{text: Array, formula: Array, image: Array}} je eine flache Strichliste
   */
  function classifyLayers(page, fallback) {
    fallback = fallback || {};
    const out = { text: [], formula: [], image: [] };
    (page.layers || []).forEach(function (layer, idx) {
      const strokes = (layer.items || []).filter(function (it) { return it.type === 'stroke'; });
      const name = (layer.name || '').trim();
      let bucket = 'text';
      if (name && FORMULA_NAMES.test(name)) bucket = 'formula';
      else if (name && IMAGE_NAMES.test(name)) bucket = 'image';
      else if (!name && idx === fallback.formulaLayerIndex) bucket = 'formula';
      else if (!name && idx === fallback.imageLayerIndex) bucket = 'image';
      out[bucket] = out[bucket].concat(strokes);
    });
    return out;
  }

  /**
   * Fasst die Bild-Markierungs-Striche einer Seite zu einzelnen "Markierungen"
   * zusammen (eine Markierung = eine spätere Bild-Einfügestelle), sortiert
   * von oben nach unten. Nutzt dieselbe Zeilen-Logik wie Stufe 2.
   *
   * @param {Array} imageMarkerStrokes aus classifyLayers(page).image
   * @returns {Array<{top:number, bottom:number, strokes: Array}>} oben -> unten
   */
  function imageMarkers(imageMarkerStrokes) {
    return R.rmsegment.lines(imageMarkerStrokes, { minGapBins: 3 });
  }

  R.rmregions = { classifyLayers: classifyLayers, imageMarkers: imageMarkers };
})();
