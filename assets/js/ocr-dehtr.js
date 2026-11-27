/*
 * Deutsche Handschrifterkennung (zeilenbasiert) via naeyn/de-htr-web-v2
 * (Apache-2.0, ONNX, läuft komplett offline im Browser über
 * onnxruntime-web). Vorverarbeitung/Decoding exakt nach Modellkarte:
 * Graustufe, Höhe 64, Breite auf Vielfaches von 4 gepadded, rohe [0,1]-
 * Werte (keine externe Normalisierung), greedy CTC-Dekodierung.
 * Siehe docs/ocr-pipeline.md, Stufe 3.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  const MODEL_URL = '/assets/models/de-htr-v2/model.onnx';
  const CONFIG_URL = '/assets/models/de-htr-v2/config.json';
  const TARGET_H = 64, MAX_W = 1024;

  let sessionPromise = null;
  let configPromise = null;

  function loadSession() {
    if (!sessionPromise) {
      sessionPromise = R.load.ort().then(function (ort) {
        return ort.InferenceSession.create(MODEL_URL);
      }).catch(function (e) { sessionPromise = null; throw e; });
    }
    return sessionPromise;
  }

  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch(CONFIG_URL).then(function (res) {
        if (!res.ok) throw new Error('config.json konnte nicht geladen werden');
        return res.json();
      }).catch(function (e) { configPromise = null; throw e; });
    }
    return configPromise;
  }

  /** Skaliert ein Canvas auf Höhe 64 (Seitenverhältnis erhalten) und
      paddet die Breite rechts mit Weiß auf ein Vielfaches von 4 - exakt
      die von der Modellkarte vorgeschriebene Vorverarbeitung. */
  function prepareInput(sourceCanvas) {
    const scale = TARGET_H / sourceCanvas.height;
    let w = Math.max(4, Math.round(sourceCanvas.width * scale));
    w = Math.min(MAX_W, Math.ceil(w / 4) * 4);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, TARGET_H);
    ctx.drawImage(sourceCanvas, 0, 0, w, TARGET_H);
    // Graustufe auf [0,1] - v2 erwartet rohe Werte, keine weitere
    // Mittelwert-/Std-Normalisierung.
    return R.rmrender.grayscale(canvas);
  }

  /**
   * Erkennt den Text einer einzelnen Zeile.
   * @param {Array} lineStrokes Striche einer Zeile, z. B. R.rmsegment.lines(...)[i].strokes
   * @returns {Promise<string>}
   */
  async function recognizeLine(lineStrokes) {
    const [ort, session, config] = await Promise.all([R.load.ort(), loadSession(), loadConfig()]);
    const bounds = R.rmlines.bounds(lineStrokes);
    if (!bounds) return '';
    const raw = R.rmrender.toCanvas(lineStrokes, bounds, { scale: 2 });
    const prepped = prepareInput(raw);
    const tensor = new ort.Tensor('float32', prepped.data, [1, 1, prepped.height, prepped.width]);
    const result = await session.run({ image: tensor });
    const logits = result.logits;
    return R.ocrCtc.decode(logits.data, logits.dims[1], logits.dims[2], config.alphabet);
  }

  R.ocrDeHtr = { recognizeLine: recognizeLine, prepareInput: prepareInput };
})();
