/*
 * Small helpers shared by all modules:
 *   RMX.load.*       load big libraries only when they are needed (faster first paint)
 *   RMX.canvasSafe() false if the browser tampers with canvas pixel data (fingerprint protection)
 *   RMX.uuid()
 */
(function () {
  'use strict';
  var R = (window.RMX = window.RMX || {});
  var scripts = {};

  function script(url, test) {
    if (test && test()) return Promise.resolve();
    if (!scripts[url]) {
      scripts[url] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
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
    marked: function () { return script('/assets/vendor/marked.min.js', function () { return window.marked; }); }     // MIT, (c) 2018+ MarkedJS, (c) 2011-2018 Christopher Jeffrey
  };

  var safe = null;
  /**
   * Reads back a known pattern. Browsers with fingerprint protection (Firefox resistFingerprinting,
   * Tor, canvas-blocker add-ons) return random noise: images created from canvas pixels then look like
   * coloured blocks. Small deviations (Brave's tiny "farbling") are tolerated.
   */
  R.canvasSafe = function () {
    if (safe !== null) return safe;
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 8;
      var x = c.getContext('2d', { willReadFrequently: true });
      var want = [[200, 30, 60], [30, 140, 60], [30, 60, 200], [240, 240, 240]];
      want.forEach(function (w, i) {
        x.fillStyle = 'rgb(' + w.join(',') + ')';
        x.fillRect((i % 2) * 4, (i >> 1) * 4, 4, 4);
      });
      var d = x.getImageData(0, 0, 8, 8).data;
      safe = want.every(function (w, i) {
        var p = (((i >> 1) * 4 + 1) * 8 + (i % 2) * 4 + 1) * 4;
        return Math.abs(d[p] - w[0]) <= 8 && Math.abs(d[p + 1] - w[1]) <= 8 && Math.abs(d[p + 2] - w[2]) <= 8;
      });
    } catch (e) { safe = false; }
    return safe;
  };

  R.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  };
})();
