/*
 * Fügt erkannte Textzeilen, Formeln (als LaTeX) und Bild-Markierungen zu
 * einem einzigen Markdown-Dokument zusammen (sortiert nach y-Position),
 * und wandelt in einem zweiten Durchlauf $$...$$/$...$ per KaTeX +
 * SVG-foreignObject-Screenshot in eingebettete Bilder um.
 * Siehe docs/ocr-pipeline.md, Stufe 6.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  /**
   * @param {Array<{top:number, text:string}>} textLines
   * @param {Array<{top:number, latex:string}>} formulaBlocks
   * @param {Array<{top:number, file:string}>} imageSlots file: Pfad/URL zum eingebetteten Bild
   * @returns {string} Markdown mit $$...$$ für Formeln, ![]() für Bilder
   */
  function assembleMarkdown(textLines, formulaBlocks, imageSlots) {
    const items = [];
    textLines.forEach(function (l) { items.push({ top: l.top, kind: 'text', content: l.text }); });
    formulaBlocks.forEach(function (f) { if (f.latex) items.push({ top: f.top, kind: 'formula', content: f.latex }); });
    imageSlots.forEach(function (im) { items.push({ top: im.top, kind: 'image', content: im.file }); });
    items.sort(function (a, b) { return a.top - b.top; });
    return items.map(function (it) {
      if (it.kind === 'formula') return '$$' + it.content.replace(/\s+/g, ' ').trim() + '$$';
      if (it.kind === 'image') return '![](' + it.content + ')';
      return it.content;
    }).join('\n\n');
  }

  let katexCssText = null;
  function loadKatex() {
    if (window.katex && katexCssText) return Promise.resolve();
    const steps = [];
    if (!window.katex) {
      steps.push(new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = '/assets/vendor/katex/katex.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      }));
    }
    if (!katexCssText) {
      steps.push(fetch('/assets/vendor/katex/katex.min.css').then(function (r) { return r.text(); }).then(function (t) { katexCssText = t; }));
    }
    return Promise.all(steps);
  }

  /** Rendert ein KaTeX-HTML-Fragment über den foreignObject-Trick in ein
      PNG-Data-URI. */
  async function htmlSnippetToPngDataUrl(html) {
    const host = document.createElement('div');
    host.style.cssText = 'all:initial; display:inline-block; background:#fff; padding:4px; font-size:24px;';
    const style = document.createElement('style');
    style.textContent = katexCssText.replace(/url\(fonts\//g, '/assets/vendor/katex/fonts/');
    host.appendChild(style);
    const content = document.createElement('div');
    content.innerHTML = html;
    host.appendChild(content);
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed; left:-100000px; top:0;';
    stage.appendChild(host);
    document.body.appendChild(stage);
    try {
      const w = Math.max(1, host.scrollWidth), h = Math.max(1, host.scrollHeight);
      const xml = new XMLSerializer().serializeToString(host);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
        '<foreignObject width="100%" height="100%">' + xml + '</foreignObject></svg>';
      const img = await new Promise(function (resolve, reject) {
        const image = new Image();
        image.onload = function () { resolve(image); };
        image.onerror = reject;
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    } finally {
      stage.remove();
    }
  }

  /** Ersetzt jedes $$...$$/$...$ im Markdown durch ein eingebettetes Formel-Bild. */
  async function renderFormulasToImages(markdown) {
    await loadKatex();
    const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let result = '', last = 0, m;
    while ((m = regex.exec(markdown))) {
      result += markdown.slice(last, m.index);
      const latex = m[1] !== undefined ? m[1] : m[2];
      const displayMode = m[1] !== undefined;
      try {
        const html = window.katex.renderToString(latex, { throwOnError: false, displayMode: displayMode });
        result += '![formula](' + await htmlSnippetToPngDataUrl(html) + ')';
      } catch (e) {
        result += m[0];
      }
      last = regex.lastIndex;
    }
    result += markdown.slice(last);
    return result;
  }

  R.rmmarkdown = { assembleMarkdown: assembleMarkdown, renderFormulasToImages: renderFormulasToImages };
})();
