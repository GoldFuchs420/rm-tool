/*
 * OCR-Setup-Seite (setup.html): lädt die in docs/ocr-pipeline.md (Abschnitt A)
 * beschriebenen Pipeline-Assets direkt im Browser aus den offiziellen Quellen
 * (jsDelivr, Hugging Face, GitHub) und packt sie als ZIP, das nur noch in den
 * Erweiterungsordner entpackt wird - ganz ohne npm, git und Kommandozeile.
 *
 * CORS-fähige Quellen (jsDelivr, Hugging Face) werden automatisch geladen.
 * Für die CoMER-Modelle aus GitHub-Releases gibt es je Zeile einen manuellen
 * Fallback: Link öffnen, Datei speichern, über die Dateiauswahl zuordnen.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  const ORT_VERSION = '1.19.2';
  const KATEX_VERSION = '0.16.11';
  const INKON_VERSION = '0.1.0';
  const jsdelivr = 'https://cdn.jsdelivr.net/npm/';
  const dataList = 'https://data.jsdelivr.com/v1/packages/npm/';
  const hf = 'https://huggingface.co/';
  const ghRelease = 'https://github.com/kimseungdae/ink-on/releases/download/v' + INKON_VERSION + '/';

  /* Feste Liste, falls die jsDelivr-List-API nicht erreichbar ist. */
  const ORT_DIST = ['ort.min', 'ort-wasm', 'ort-wasm-simd', 'ort-wasm-simd-threaded'].map(function (n) {
    return 'dist/' + n + '.js';
  });

  function ortFiles(names) {
    return names.filter(function (n) {
      return /^dist\/ort\.min\.js$/.test(n) || /^dist\/ort-wasm(-simd)?(-threaded)?\.wasm$/.test(n);
    }).map(function (n) {
      return { path: 'assets/vendor/onnxruntime-web/' + n.replace('dist/', ''), url: jsdelivr + 'onnxruntime-web@' + ORT_VERSION + '/' + n };
    });
  }

  function inkonFiles(names) {
    /* exports["./core"] zeigt auf dist-lib/core (das Bundle lädt seine
       Chunks relativ über ./chunks/...). Die Kern-Datei wird als
       core/index.js abgelegt (Pfad, den ocr-formula.mjs importiert),
       die Chunks bleiben relativ korrekt. */
    return names.filter(function (n) {
      return /^dist-lib\/core\.js$/.test(n) ||
        (n.indexOf('dist-lib/chunks/') === 0 && /\.js$/.test(n));
    }).map(function (n) {
      const rel = n.slice('dist-lib/'.length);
      const target = /^core\.js$/.test(rel)
        ? 'assets/vendor/ink-on/core/index.js'
        : 'assets/vendor/ink-on/core/' + rel;
      return { path: target, url: jsdelivr + 'ink-on@' + INKON_VERSION + '/' + n };
    });
  }

  function katexFiles(names) {
    return names.filter(function (n) {
      return /^dist\/katex\.min\.(js|css)$/.test(n) ||
        (n.indexOf('dist/fonts/') === 0 && /\.woff2$/.test(n));
    }).map(function (n) {
      return { path: 'assets/vendor/katex/' + n.slice(5), url: jsdelivr + 'katex@' + KATEX_VERSION + '/' + n };
    });
  }

  /* Einträge der Setup-Seite; deckt jede MANUAL_ASSETS-Gruppe aus
     tests/run.js ab (geprüft in Check 21). */
  const ITEMS = [
    {
      path: 'assets/vendor/remarkable-rm/index.global.js',
      url: jsdelivr + 'remarkable-rm/dist/' + 'index.global' + '.js',
      note: '.rm-Parser (v5/v6)'
    },
    {
      path: 'assets/vendor/onnxruntime-web/',
      list: dataList + 'onnxruntime-web@' + ORT_VERSION,
      pick: ortFiles,
      fallback: function () { return ortFiles(ORT_DIST.map(function (n) { return 'dist/' + n; })); },
      note: 'ONNX-Laufzeit (WebAssembly)'
    },
    {
      path: 'assets/models/de-htr-v2/model.onnx',
      url: hf + 'naeyn/de-htr-web-v2/resolve/main/model.onnx',
      note: 'DE-Handschrift (int8, rund 10 MB)'
    },
    {
      path: 'assets/models/simple-htr/model.onnx',
      url: hf + 'PellelNitram/xournalpp-htr-simple-htr/resolve/main/model.onnx',
      note: 'EN-Handschrift'
    },
    {
      path: 'assets/vendor/ink-on/core/',
      list: dataList + 'ink-on@' + INKON_VERSION,
      pick: inkonFiles,
      note: 'Formel-Erkennung (CoMER)'
    },
    {
      path: 'assets/models/comer/encoder_int8.onnx',
      url: ghRelease + 'encoder_int8.onnx',
      note: 'CoMER-Encoder, ggf. manuell'
    },
    {
      path: 'assets/models/comer/decoder_int8.onnx',
      url: ghRelease + 'decoder_int8.onnx',
      note: 'CoMER-Decoder, ggf. manuell'
    },
    {
      path: 'assets/vendor/katex/',
      list: dataList + 'katex@' + KATEX_VERSION,
      pick: katexFiles,
      note: 'Formel-Rendering (KaTeX, woff2)'
    }
  ];

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function fetchBlob(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob();
  }

  /* Löst die jsDelivr-Paketliste (verschachtelter Baum) zu vollständigen
     Pfaden auf; flache Listen funktionieren genauso. */
  function flatFiles(entries, prefix, out) {
    (entries || []).forEach(function (e) {
      const p = prefix + e.name;
      if (e.type === 'directory') flatFiles(e.files, p + '/', out);
      else out.push(p);
    });
    return out;
  }

  /* Löst einen Eintrag zur konkreten Dateiliste auf (List-API oder Einzel-URL). */
  async function expand(item) {
    if (!item.list) return [{ path: item.path, url: item.url }];
    let names = null;
    try {
      const j = await fetchJson(item.list);
      names = flatFiles(j.files, '', []);
    } catch (e) { /* Fallback unten */ }
    let files = names ? item.pick(names) : (item.fallback ? item.fallback() : []);
    if (!files.length && item.fallback) files = item.fallback();
    return files;
  }

  function el(tag, text) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    return e;
  }

  function setStatus(cell, text, color) {
    cell.textContent = text;
    cell.style.color = color;
  }

  /* Manueller Fallback: Dateiauswahl ordnet heruntergeladene Dateien
     anhand ihres Dateinamens den Zielpfaden zu. */
  function manualInput(item, statusCell) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', function () {
      const byName = new Map();
      Array.prototype.forEach.call(input.files, function (f) { byName.set(f.name, f); });
      item.files.forEach(function (f) {
        const got = byName.get(f.path.split('/').pop());
        if (got) f.blob = got;
      });
      updateStatus(item, statusCell);
    });
    return input;
  }

  function updateStatus(item, statusCell) {
    const files = item.files || [];
    const got = files.filter(function (f) { return f.blob; });
    const total = got.reduce(function (sum, f) { return sum + f.blob.size; }, 0);
    const mb = (total / 1048576).toFixed(1);
    if (!files.length) return;
    if (got.length === files.length) {
      setStatus(statusCell, 'fertig (' + mb + ' MB)', '#7ddf7d');
    } else if (got.length) {
      setStatus(statusCell, got.length + '/' + files.length + ' geladen, Rest manuell', '#ffb74d');
    } else {
      setStatus(statusCell, 'manuell nötig', '#ffb74d');
    }
  }

  /* Lädt einen Eintrag (bzw. alle seine Dateien) und baut die Tabellenzeile auf. */
  async function loadItem(item, bodyRow) {
    const statusCell = el('td');
    const actionCell = el('td');
    bodyRow.appendChild(statusCell);
    bodyRow.appendChild(actionCell);
    setStatus(statusCell, 'wird ermittelt …', '#ffd54f');
    let files = [];
    try {
      files = await expand(item);
    } catch (e) {
      setStatus(statusCell, 'Fehler: ' + e.message, '#ff8a80');
      return;
    }
    if (!files.length) {
      setStatus(statusCell, 'Liste leer - bitte laut docs/ocr-pipeline.md manuell beschaffen', '#ff8a80');
      return;
    }
    item.files = files;
    const link = el('a', 'Download-Seite öffnen');
    link.href = files.length === 1 ? files[0].url : item.list || item.url;
    link.target = '_blank';
    actionCell.appendChild(link);
    actionCell.appendChild(document.createElement('br'));
    actionCell.appendChild(manualInput(item, statusCell));

    let failed = 0;
    let done = 0;
    for (let i = 0; i < files.length; i++) {
      setStatus(statusCell, 'lädt ' + (done + 1) + '/' + files.length + ' …', '#ffd54f');
      try {
        files[i].blob = await fetchBlob(files[i].url);
        done++;
      } catch (e) {
        failed++;
      }
    }
    if (failed) {
      const miss = el('span', failed + ' Datei(en) nicht automatisch ladbar');
      miss.style.color = '#ffb74d';
      actionCell.appendChild(document.createElement('br'));
      actionCell.appendChild(miss);
    }
    updateStatus(item, statusCell);
  }

  async function buildZip(summary) {
    await R.load.jszip();
    const zip = new window.JSZip();
    let count = 0;
    const missing = [];
    ITEMS.forEach(function (item) {
      (item.files || []).forEach(function (f) {
        if (f.blob) { zip.file(f.path, f.blob); count++; } else missing.push(f.path);
      });
    });
    if (!count) {
      summary.textContent = 'Keine Dateien geladen - erst die Zeilen oben abarbeiten.';
      return;
    }
    summary.textContent = 'Paket wird erstellt …';
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = 'rm-tool-ocr-assets.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    summary.textContent = 'Fertig: rm-tool-ocr-assets.zip mit ' + count + ' Datei(en).' +
      (missing.length ? ' Es fehlen noch: ' + missing.join(', ') : ' Alles vollständig - ZIP in den Erweiterungsordner entpacken.');
  }

  function init() {
    const tbody = document.getElementById('setup-rows');
    const summary = document.getElementById('setup-summary');
    ITEMS.forEach(function (item) {
      const tr = document.createElement('tr');
      const pathCell = el('td');
      const code = el('strong', item.path);
      pathCell.appendChild(code);
      pathCell.appendChild(document.createElement('br'));
      pathCell.appendChild(el('small', item.note));
      tr.appendChild(pathCell);
      tbody.appendChild(tr);
      loadItem(item, tr);
    });
    document.getElementById('setup-build').addEventListener('click', function () { buildZip(summary); });
  }

  R.ocrSetup = { ITEMS: ITEMS, expand: expand };
  document.addEventListener('DOMContentLoaded', init);
})();
