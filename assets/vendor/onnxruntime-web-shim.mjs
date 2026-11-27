/*
 * Brücke zwischen dem lazy nachgeladenen UMD-Build von onnxruntime-web
 * (window.ort, siehe R.load.ort in assets/js/util.js) und dem ESM-Import
 * "onnxruntime-web" in assets/js/ocr-formula.mjs (ink-on). Vermeidet eine
 * zweite onnxruntime-web-Variante im Paket. Alle Zugriffe werden erst beim
 * tatsächlichen Gebrauch aufgelöst (Proxy), nicht beim Modul-Import - der
 * UMD-Build ist zu diesem Zeitpunkt noch nicht geladen.
 */
function resolveOrt() {
  if (!window.ort) throw new Error('onnxruntime-web ist noch nicht geladen (erst R.load.ort() abwarten)');
  return window.ort;
}

function lazyOrt() {
  return new Proxy(function () {}, {
    get: function (_, prop) { return resolveOrt()[prop]; },
    apply: function (_, thisArg, args) { return resolveOrt().apply(thisArg, args); }
  });
}

const ortLazy = lazyOrt();
export default ortLazy;
export const InferenceSession = new Proxy({}, { get: function (_, p) { return resolveOrt().InferenceSession[p]; } });
export const Tensor = new Proxy({}, { get: function (_, p) { return resolveOrt().Tensor[p]; } });
export const env = new Proxy({}, { get: function (_, p) { return resolveOrt().env[p]; } });
