/*
 * Englische Handschrifterkennung (wortbasiert) via
 * PellelNitram/xournalpp-htr-simple-htr (MIT, ONNX). Vorverarbeitung nach
 * Modellkarte: Graustufe, einheitliche Skalierung auf max. 128x32,
 * zentriert, Normalisierung auf [-0.5, 0.5].
 * Siehe docs/ocr-pipeline.md, Stufe 4.
 *
 * ACHTUNG - zwei Platzhalter, die vor Produktivnutzung verifiziert werden
 * müssen (Netron + Testwort, siehe docs/ocr-pipeline.md):
 *   - INPUT_NAME/OUTPUT_NAME: exakte Tensor-Namen per Netron prüfen
 *   - IAM_ALPHABET: Zeichensatz-Reihenfolge, falls nicht in der ONNX-Datei
 *     eingebettet, gegen ein bekanntes Testwort verifizieren
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  const MODEL_URL = '/assets/models/simple-htr/model.onnx';
  const INPUT_NAME = 'input';    // TODO: mit Netron gegenprüfen
  const OUTPUT_NAME = 'output';  // TODO: mit Netron gegenprüfen
  const TARGET_W = 128, TARGET_H = 32;

  // IAM-Standard-Zeichensatz (Platzhalter) - bei erkennbar verschobener
  // Ausgabe ist die Reihenfolge falsch (siehe docs/ocr-pipeline.md).
  const IAM_ALPHABET = ' !"#&\'()*+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

  let sessionPromise = null;

  function loadSession() {
    if (!sessionPromise) {
      sessionPromise = R.load.ort().then(function (ort) {
        return ort.InferenceSession.create(MODEL_URL);
      }).catch(function (e) { sessionPromise = null; throw e; });
    }
    return sessionPromise;
  }

  /** Einheitliche Skalierung (Seitenverhältnis erhalten) auf max. 128x32,
      zentriert auf weißer Leinwand, Normalisierung auf [-0.5, 0.5]. */
  function prepareInput(sourceCanvas) {
    const scale = Math.min(TARGET_W / sourceCanvas.width, TARGET_H / sourceCanvas.height, 1);
    const w = Math.max(1, Math.round(sourceCanvas.width * scale));
    const h = Math.max(1, Math.round(sourceCanvas.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, TARGET_W, TARGET_H);
    const offX = Math.floor((TARGET_W - w) / 2);
    const offY = Math.floor((TARGET_H - h) / 2);
    ctx.drawImage(sourceCanvas, offX, offY, w, h);
    const gray = R.rmrender.grayscale(canvas);
    for (let i = 0; i < gray.data.length; i++) gray.data[i] -= 0.5;
    return gray;
  }

  /**
   * Erkennt den Text eines einzelnen Wortes.
   * @param {Array} wordStrokes Striche eines Wortes, z. B. R.rmsegment.words(...)[i].strokes
   * @param {string[]} [alphabet] Zeichensatz in Modell-Reihenfolge (Default: IAM_ALPHABET)
   * @returns {Promise<string>}
   */
  async function recognizeWord(wordStrokes, alphabet) {
    const [ort, session] = await Promise.all([R.load.ort(), loadSession()]);
    const bounds = R.rmlines.bounds(wordStrokes);
    if (!bounds) return '';
    const raw = R.rmrender.toCanvas(wordStrokes, bounds, { scale: 2 });
    const prepped = prepareInput(raw);
    const tensor = new ort.Tensor('float32', prepped.data, [1, 1, prepped.height, prepped.width]);
    const feeds = {};
    feeds[INPUT_NAME] = tensor;
    const result = await session.run(feeds);
    const out = result[OUTPUT_NAME];
    return R.ocrCtc.decode(out.data, out.dims[0], out.dims[out.dims.length - 1], alphabet || IAM_ALPHABET);
  }

  R.ocrSimpleHtr = { recognizeWord: recognizeWord, prepareInput: prepareInput, IAM_ALPHABET: IAM_ALPHABET };
})();
