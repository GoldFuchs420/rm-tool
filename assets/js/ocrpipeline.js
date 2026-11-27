/*
 * End-to-End-Orchestrierung der OCR-Pipeline (Stufen 1-6): .rm-Datei
 * parsen, Bereiche klassifizieren, Textzeilen (DE·HTR, lang "de") bzw.
 * Wörter (SimpleHTR, lang "en") erkennen, Formeln (CoMER) in LaTeX
 * überführen, eingebettete Bilder zuordnen und alles zu einem Markdown-
 * Dokument zusammensetzen. Siehe docs/ocr-pipeline.md.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  /** Erkennt alle Zeilen eines Text-Bereichs; in "en" werden die Zeilen
      zusätzlich in Wörter zerlegt und wortbasiert (SimpleHTR) erkannt. */
  async function recognizeRegions(strokes, opts) {
    const lines = R.rmsegment.lines(strokes);
    const out = [];
    for (const line of lines) {
      let text;
      if (opts.lang === 'en') {
        const words = R.rmsegment.words(line.strokes);
        const parts = [];
        for (const w of words) parts.push(await R.ocrSimpleHtr.recognizeWord(w.strokes));
        text = parts.join(' ');
      } else {
        text = await R.ocrDeHtr.recognizeLine(line.strokes);
      }
      out.push({ top: line.top, text: text });
    }
    return out;
  }

  /**
   * Führt die komplette Pipeline über eine Seite aus.
   * @param {ArrayBuffer|Uint8Array} rmBuf Inhalt der .rm-Datei
   * @param {{rmdocFile?: Blob, pageId?: string, pageIndex?: number,
   *          lang?: 'de'|'en', fallback?: Object, renderFormulas?: boolean}} [opts]
   *   rmdocFile/pageId: .rmdoc-Archiv + Seiten-UUID für eingebettete Bilder
   *   lang: "de" (Default, zeilenbasiert) oder "en" (wortbasiert)
   *   renderFormulas: $$...$$ per KaTeX in Bilder umwandeln (Default true)
   * @returns {Promise<{markdown: string, stats: Object}>}
   */
  async function recognizePage(rmBuf, opts) {
    opts = opts || {};
    const doc = await R.rmlines.parse(rmBuf);
    const page = doc.pages[opts.pageIndex || 0];
    const strokes = R.rmlines.strokesOf(page);
    const stats = { version: doc.version, strokes: strokes.length, lines: 0, formulas: 0, images: 0 };
    if (!strokes.length) return { markdown: '', stats: stats };

    const regions = R.rmregions.classifyLayers(page, opts.fallback);

    const textLines = await recognizeRegions(regions.text, opts);
    stats.lines = textLines.length;

    const formulaBlocks = [];
    if (regions.formula.length && R.ocrFormula) {
      const fb = R.rmlines.bounds(regions.formula);
      const latex = await R.ocrFormula.recognizeFormula(regions.formula);
      if (latex) formulaBlocks.push({ top: fb.minY, latex: latex });
    }
    stats.formulas = formulaBlocks.length;

    const imageSlots = [];
    if (opts.rmdocFile && opts.pageId) {
      const markers = R.rmregions.imageMarkers(regions.image);
      const files = await R.rmimages.extractEmbeddedImages(opts.rmdocFile, opts.pageId);
      markers.forEach(function (marker, i) {
        if (files[i]) imageSlots.push({ top: marker.top, file: URL.createObjectURL(files[i].blob) });
      });
    }
    stats.images = imageSlots.length;

    let markdown = R.rmmarkdown.assembleMarkdown(textLines, formulaBlocks, imageSlots);
    if (opts.renderFormulas !== false) markdown = await R.rmmarkdown.renderFormulasToImages(markdown);
    return { markdown: markdown, stats: stats };
  }

  R.ocrPipeline = { recognizePage: recognizePage };
})();
