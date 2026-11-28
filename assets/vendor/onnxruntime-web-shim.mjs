/*
 * Brücke zwischen dem lazy nachgeladenen UMD-Build von onnxruntime-web
 * (window.ort, siehe R.load.ort in assets/js/util.js) und dem ESM-Import
 * in assets/vendor/ink-on/core/chunks/inference-4T2UM6yg.js (ink-on).
 * Der Chunk importiert diesen Shim direkt; eine Import-Map scheidet aus,
 * weil die MV3-CSP Inline-Import-Maps blockiert (docs/ocr-pipeline.md, B.4).
 * Alle Zugriffe werden erst beim tatsächlichen Gebrauch aufgelöst (Proxy),
 * nicht beim Modul-Import - der UMD-Build ist zu diesem Zeitpunkt noch
 * nicht geladen. Einstellungen an ort.env.wasm (numThreads, simd) trifft
 * der Chunk schon beim Modul-Load; sie werden hier gepuffert und beim
 * ersten echten ort-Zugriff nachgetragen.
 */
let pendingWasm = {};
let pendingApplied = false;

function resolveOrt() {
  if (!window.ort) throw new Error('onnxruntime-web ist noch nicht geladen (erst R.load.ort() abwarten)');
  if (!pendingApplied) {
    try {
      Object.assign(window.ort.env.wasm, pendingWasm);
      pendingApplied = true;
    } catch (e) {
      /* env.wasm noch nicht bereit: beim nächsten Zugriff erneut versuchen */
    }
  }
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

export const InferenceSession = new Proxy(function () {}, {
  get: function (_, p) { return resolveOrt().InferenceSession[p]; },
  apply: function (_, thisArg, args) { return resolveOrt().InferenceSession.apply(thisArg, args); },
  construct: function (_, args) { return new (resolveOrt().InferenceSession)(...args); }
});

export const Tensor = new Proxy(function () {}, {
  get: function (_, p) { return resolveOrt().Tensor[p]; },
  apply: function (_, thisArg, args) { return resolveOrt().Tensor.apply(thisArg, args); },
  construct: function (_, args) { return new (resolveOrt().Tensor)(...args); }
});

/* ort.env.wasm: Schreibzugriffe vor dem Laden von ort.min.js werden
   gepuffert (pendingWasm) und beim ersten echten ort-Zugriff angewendet;
   Lesezugriffe vor dem Laden liefern den gepufferten Wert. */
export const env = new Proxy({}, {
  get: function (_, p) {
    if (p === 'wasm') {
      return new Proxy({}, {
        get: function (_, k) {
          try { return resolveOrt().env.wasm[k]; }
          catch (e) { return pendingWasm[k]; }
        },
        set: function (_, k, v) {
          pendingWasm[k] = v;
          try { resolveOrt().env.wasm[k] = v; } catch (e) { /* später anwenden */ }
          return true;
        }
      });
    }
    return resolveOrt().env[p];
  },
  set: function (_, p, v) {
    if (p === 'wasm' && v && typeof v === 'object') {
      Object.assign(pendingWasm, v);
      try { Object.assign(resolveOrt().env.wasm, v); } catch (e) { /* später anwenden */ }
      return true;
    }
    try { resolveOrt().env[p] = v; } catch (e) { /* ohne Puffer nicht rekonstruierbar */ }
    return true;
  }
});
