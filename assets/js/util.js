/*
 * Small helpers shared by all modules:
 *   RMX.load.*       load big libraries only when they are needed (faster first paint)
 *   RMX.canvasSafe() false if the browser tampers with canvas pixel data (fingerprint protection)
 *   RMX.uuid()
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});
  const scripts = {};

  function script(url, test) {
    if (test && test()) return Promise.resolve();
    if (!scripts[url]) {
      scripts[url] = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = url;
        s.onload = function () { resolve(); };
        s.onerror = function () { delete scripts[url]; reject(new Error('Could not load ' + url)); };
        document.head.appendChild(s);
      });
    }
    return scripts[url];
  }
  R.load = {
    pdfLib: function () { return script('/assets/vendor/pdf-lib.min.js', function () { return window.PDFLib; }); },   // MIT, (c) 2019 Andrew Dillon
    jszip: function () { return script('/assets/vendor/jszip.min.js', function () { return window.JSZip; }); },       // MIT, (c) 2009-2016 Stuart Knightley et al.
    pako: function () { return script('/assets/vendor/pako.min.js', function () { return window.pako; }); },          // MIT/Zlib, (c) 2014-2017 Vitaly Puzrin, Andrei Tuputcyn
    marked: function () { return script('/assets/vendor/marked.min.js', function () { return window.marked; }); },     // MIT, (c) 2018+ MarkedJS, (c) 2011-2018 Christopher Jeffrey
    // OCR-Pipeline (docs/ocr-pipeline.md), beide Dateien werden manuell
    // beschafft (große npm-Builds) und liegen nicht im Repository:
    rmRm: function () { return script('/assets/vendor/remarkable-rm/index.global.js', function () { return window.RemarkableRM; }); }, // MIT, (c) Stewart McSporran (Scratchydisk)
    ort: function () {                                                                                                  // MIT, (c) Microsoft Corporation
      return script('/assets/vendor/onnxruntime-web/ort.min.js', function () { return window.ort; }).then(function () {
        window.ort.env.wasm.wasmPaths = '/assets/vendor/onnxruntime-web/';
        return window.ort;
      });
    }
  };

  let safe = null;
  /**
   * Reads back a known pattern. Browsers with fingerprint protection (Firefox resistFingerprinting,
   * Tor, canvas-blocker add-ons) return random noise: images created from canvas pixels then look like
   * coloured blocks. Small deviations (Brave's tiny "farbling") are tolerated.
   */
  R.canvasSafe = function () {
    if (safe !== null) return safe;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const x = c.getContext('2d', { willReadFrequently: true });
      const want = [[200, 30, 60], [30, 140, 60], [30, 60, 200], [240, 240, 240]];
      want.forEach(function (w, i) {
        x.fillStyle = 'rgb(' + w.join(',') + ')';
        x.fillRect((i % 2) * 4, (i >> 1) * 4, 4, 4);
      });
      const d = x.getImageData(0, 0, 8, 8).data;
      safe = want.every(function (w, i) {
        const p = (((i >> 1) * 4 + 1) * 8 + (i % 2) * 4 + 1) * 4;
        return Math.abs(d[p] - w[0]) <= 8 && Math.abs(d[p + 1] - w[1]) <= 8 && Math.abs(d[p + 2] - w[2]) <= 8;
      });
    } catch (e) { safe = false; }
    return safe;
  };

  R.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  };
})();
