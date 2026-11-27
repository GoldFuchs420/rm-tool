/*
 * Rastert reMarkable-Striche (aus rmlines.js/rmsegment.js) in ein
 * Offscreen-Canvas: weißer Hintergrund, schwarze Tinte. Wird von jeder
 * Pipeline-Stufe genutzt, die ein Bild aus Vektordaten braucht (OCR-
 * Vorverarbeitung, Bild-/Zeichnungs-Extraktion). Siehe
 * docs/ocr-pipeline.md, Stufe 3.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  /**
   * @param {Array} strokes Liste von RmStroke-Objekten
   * @param {{minX,minY,maxX,maxY}} bounds z. B. von R.rmlines.bounds(strokes)
   * @param {{padding?: number, scale?: number}} [opts]
   *   padding: Rand in Quellkoordinaten (Default: 15% der Höhe, min. 4)
   *   scale: Auflösungs-Multiplikator (Default 1)
   * @returns {HTMLCanvasElement}
   */
  function toCanvas(strokes, bounds, opts) {
    opts = opts || {};
    const padding = opts.padding != null ? opts.padding : Math.max(4, (bounds.maxY - bounds.minY) * 0.15);
    const scale = opts.scale || 1;
    const w = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + padding * 2) * scale));
    const h = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + padding * 2) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const tx = function (x) { return (x - bounds.minX + padding) * scale; };
    const ty = function (y) { return (y - bounds.minY + padding) * scale; };

    strokes.forEach(function (stroke) {
      const pts = stroke.points;
      if (!pts.length) return;
      if (pts.length === 1) {
        // einzelner Punkt (z. B. ein i-Punkt): als Kreis zeichnen
        const r = Math.max(0.5, (pts[0].width || 1)) * scale / 2;
        ctx.beginPath();
        ctx.arc(tx(pts[0].x), ty(pts[0].y), r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // Eine konstante Linienbreite je Strich (Durchschnitt der Punktbreiten)
      // reicht für ein CTC-Erkennungsmodell aus; variable Breite pro Segment
      // wäre präziser, braucht aber viele Teilpfade statt eines.
      let sumW = 0;
      pts.forEach(function (p) { sumW += (p.width || 1); });
      const avgW = Math.max(0.6, sumW / pts.length) * scale;
      ctx.lineWidth = avgW;
      ctx.beginPath();
      ctx.moveTo(tx(pts[0].x), ty(pts[0].y));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i].x), ty(pts[i].y));
      ctx.stroke();
    });
    return canvas;
  }

  /**
   * Liest ein Canvas als Graustufenbild aus (ITU-R BT.601), skaliert auf
   * rohe [0,1]-Werte. Gemeinsame Vorverarbeitungsstufe für DE·HTR
   * ([0,1]) und SimpleHTR ([-0.5, 0.5] danach).
   * @param {HTMLCanvasElement} canvas
   * @returns {{data: Float32Array, width: number, height: number}}
   */
  function grayscale(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const data = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i++) {
      data[i] = (0.299 * img[i * 4] + 0.587 * img[i * 4 + 1] + 0.114 * img[i * 4 + 2]) / 255;
    }
    return { data: data, width: canvas.width, height: canvas.height };
  }

  R.rmrender = { toCanvas: toCanvas, grayscale: grayscale };
})();
