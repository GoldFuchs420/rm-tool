/*
 * Zeilen-/Wort-Segmentierung auf Basis der Strichdaten aus rmlines.js.
 * Reine Geometrie (Tinten-Histogramm + Lücken-Erkennung), kein Rendern,
 * kein Modell - Grundlage für die sprachspezifische OCR-Vorverarbeitung
 * (DE·HTR: Zeilen, SimpleHTR: Wörter). Siehe docs/ocr-pipeline.md, Stufe 2.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  /** Begrenzendes Rechteck + Mittelpunkt/Höhe eines einzelnen Strichs. */
  function strokeBounds(stroke) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    stroke.points.forEach(function (p) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, midY: (minY + maxY) / 2, height: maxY - minY };
  }

  function median(nums) {
    const s = nums.slice().sort(function (a, b) { return a - b; });
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  }

  /**
   * Gruppiert Striche einer Seite in Zeilen (vertikales Tinten-Histogramm:
   * zusammenhängende Bänder mit Tinte, getrennt durch (fast) leere Bins,
   * ergeben je eine Zeile - robuster als ein Mittelpunkt-Clusteransatz, weil
   * Ober-/Unterlängen zwischen zwei Zeilen überlappen dürfen, solange die
   * Haupt-Tintenmasse in unterschiedlichen Bändern liegt).
   *
   * @param {Array} strokes aus R.rmlines.strokesOf(page)
   * @param {{binSize?: number, minGapBins?: number}} [opts]
   * @returns {Array<{top:number, bottom:number, strokes: Array}>} von oben nach unten sortiert
   */
  function lines(strokes, opts) {
    opts = opts || {};
    if (!strokes.length) return [];
    const withBounds = strokes.map(function (s) { return { stroke: s, b: strokeBounds(s) }; });
    const allMinY = Math.min.apply(null, withBounds.map(function (x) { return x.b.minY; }));
    const allMaxY = Math.max.apply(null, withBounds.map(function (x) { return x.b.maxY; }));
    const medianHeight = median(withBounds.map(function (x) { return x.b.height; }).filter(function (h) { return h > 0; })) || 20;
    const binSize = opts.binSize || Math.max(2, medianHeight / 4);
    const nBins = Math.max(1, Math.ceil((allMaxY - allMinY) / binSize) + 1);
    const ink = new Array(nBins).fill(0);
    withBounds.forEach(function (x) {
      const b0 = Math.max(0, Math.floor((x.b.minY - allMinY) / binSize));
      const b1 = Math.min(nBins - 1, Math.floor((x.b.maxY - allMinY) / binSize));
      for (let b = b0; b <= b1; b++) ink[b]++;
    });

    // Zusammenhängende Bänder mit Tinte finden; Lücken >= minGapBins trennen Zeilen.
    const minGapBins = opts.minGapBins || 1;
    const bands = [];
    let curStart = null, gap = 0;
    for (let b = 0; b < nBins; b++) {
      if (ink[b] > 0) {
        if (curStart === null) curStart = b;
        gap = 0;
      } else if (curStart !== null) {
        gap++;
        if (gap >= minGapBins) { bands.push([curStart, b - gap]); curStart = null; gap = 0; }
      }
    }
    if (curStart !== null) bands.push([curStart, nBins - 1]);
    if (!bands.length) bands.push([0, nBins - 1]);

    const result = bands.map(function (band) {
      return { top: allMinY + band[0] * binSize, bottom: allMinY + (band[1] + 1) * binSize, strokes: [] };
    });
    withBounds.forEach(function (x) {
      // Strich der Zeile mit der größten Überdeckung zuordnen (fängt auch
      // Ausreißer wie einzelne i-Punkte/t-Striche sauber ein).
      let best = -1, bestOverlap = -Infinity;
      result.forEach(function (line, idx) {
        const overlap = Math.min(line.bottom, x.b.maxY) - Math.max(line.top, x.b.minY);
        if (overlap > bestOverlap) { bestOverlap = overlap; best = idx; }
      });
      result[best].strokes.push(x.stroke);
    });
    return result
      .filter(function (l) { return l.strokes.length > 0; })
      .sort(function (a, b) { return a.top - b.top; });
  }

  /**
   * Gruppiert die Striche EINER Zeile in Wörter (horizontale Lücken-Erkennung:
   * eine Lücke, die deutlich größer als ein normaler Buchstabenabstand ist,
   * markiert eine Wortgrenze; der Schwellwert skaliert mit der Zeilenhöhe).
   *
   * @param {Array} lineStrokes Striche einer einzelnen Zeile (aus lines()[i].strokes)
   * @param {{gapFactor?: number}} [opts] gapFactor: Vielfaches der Zeilenhöhe als Lücken-Schwelle (Default 0.6)
   * @returns {Array<{left:number, right:number, strokes: Array}>} von links nach rechts sortiert
   */
  function words(lineStrokes, opts) {
    opts = opts || {};
    if (!lineStrokes.length) return [];
    const withBounds = lineStrokes.map(function (s) { return { stroke: s, b: strokeBounds(s) }; });
    withBounds.sort(function (a, b) { return a.b.minX - b.b.minX; });
    const medianHeight = median(withBounds.map(function (x) { return x.b.height; }).filter(function (h) { return h > 0; })) || 20;
    const gapThreshold = (opts.gapFactor || 0.6) * medianHeight;

    const out = [];
    let cur = null, curRight = -Infinity;
    withBounds.forEach(function (x) {
      if (cur && x.b.minX - curRight > gapThreshold) {
        out.push(cur);
        cur = null;
      }
      if (!cur) cur = { left: x.b.minX, right: x.b.maxX, strokes: [] };
      cur.strokes.push(x.stroke);
      cur.left = Math.min(cur.left, x.b.minX);
      cur.right = Math.max(cur.right, x.b.maxX);
      curRight = Math.max(curRight, x.b.maxX);
    });
    if (cur) out.push(cur);
    return out;
  }

  R.rmsegment = { strokeBounds: strokeBounds, lines: lines, words: words };
})();
