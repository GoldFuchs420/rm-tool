/*
 * Gemeinsame Greedy-CTC-Dekodierung für die ONNX-Handschriftmodelle
 * (DE·HTR, Stufe 3; SimpleHTR, Stufe 4): pro Zeitschritt argmax,
 * Wiederholungen zusammenfassen, Blank (Index 0) verwerfen. Argmax auf
 * rohen Logits und auf Log-Wahrscheinlichkeiten ist identisch, daher
 * reicht eine Implementierung für beide Modelle.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  /**
   * @param {Float32Array} logitsData Werte im Format [time, classes]
   * @param {number} timeSteps Anzahl Zeitschritte
   * @param {number} numClasses Anzahl Klassen (inkl. Blank an Index 0)
   * @param {string[]} alphabet Zeichensatz in Modell-Reihenfolge
   * @returns {string} dekodierter Text
   */
  function ctcDecode(logitsData, timeSteps, numClasses, alphabet) {
    let out = '';
    let prev = -1;
    for (let t = 0; t < timeSteps; t++) {
      let best = 0, bestVal = -Infinity;
      for (let c = 0; c < numClasses; c++) {
        const v = logitsData[t * numClasses + c];
        if (v > bestVal) { bestVal = v; best = c; }
      }
      if (best !== 0 && best !== prev) out += alphabet[best - 1];
      prev = best;
    }
    return out;
  }

  R.ocrCtc = { decode: ctcDecode };
})();
