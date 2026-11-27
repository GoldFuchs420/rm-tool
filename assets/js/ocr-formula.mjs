/*
 * Formel-Erkennung (stroke-basiert) über das npm-Paket "ink-on"
 * (Apache-2.0), das CoMER (ECCV 2022, Coverage-guided Multi-scale
 * Encoder-decoder Transformer) als 7,2-MB-ONNX bereitstellt. Läuft als
 * ES-Modul; "onnxruntime-web" wird über die Import-Map in
 * filemanager.html auf den bereits lazy geladenen UMD-Build (window.ort)
 * gebrückt, siehe assets/vendor/onnxruntime-web-shim.mjs.
 * Siehe docs/ocr-pipeline.md, Stufe 6.
 */
import { InferenceEngine, preprocessStrokes, isStrokeMeaningful, loadVocab } from '/assets/vendor/ink-on/core/index.js';

window.RMX = window.RMX || {};
const R = window.RMX;

const ENCODER_URL = '/assets/models/comer/encoder_int8.onnx';
const DECODER_URL = '/assets/models/comer/decoder_int8.onnx';
const VOCAB_URL = '/assets/models/comer/vocab.json';
const BEAM_WIDTH = 3;

let enginePromise = null;
let vocabPromise = null;

function getEngine() {
  if (!enginePromise) {
    enginePromise = (async function () {
      await R.load.ort(); // UMD-Build muss vor der ersten Inferenz da sein
      const engine = new InferenceEngine({
        encoderUrl: ENCODER_URL,
        decoderUrl: DECODER_URL,
        beamWidth: BEAM_WIDTH
      });
      await engine.init();
      return engine;
    })().catch(function (e) { enginePromise = null; throw e; });
  }
  return enginePromise;
}

function getVocab() {
  if (!vocabPromise) {
    vocabPromise = loadVocab(VOCAB_URL).catch(function (e) { vocabPromise = null; throw e; });
  }
  return vocabPromise;
}

/** rmlines-Striche (x, y, width, ...) -> ink-ons Stroke-Format
    (points {x, y}[], ein lineWidth je Strich). */
function toInkOnStrokes(strokes) {
  return strokes.map(function (s) {
    let sumW = 0;
    s.points.forEach(function (p) { sumW += (p.width || 1); });
    return {
      points: s.points.map(function (p) { return { x: p.x, y: p.y }; }),
      lineWidth: Math.max(0.6, sumW / s.points.length)
    };
  });
}

/**
 * @param {Array} rmStrokes Striche eines Formel-Bereichs, z. B.
 *        R.rmregions.classifyLayers(page).formula
 * @returns {Promise<string|null>} LaTeX-String, oder null bei zu wenig/
 *        unsinniger Eingabe
 */
async function recognizeFormula(rmStrokes) {
  const strokes = toInkOnStrokes(rmStrokes);
  if (!isStrokeMeaningful(strokes)) return null;
  const [engine, vocab] = await Promise.all([getEngine(), getVocab()]);
  const input = preprocessStrokes(strokes);
  const result = await engine.recognize(input, vocab);
  return result.latex;
}

R.ocrFormula = { recognizeFormula: recognizeFormula };
