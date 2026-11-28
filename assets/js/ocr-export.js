/*
 * Transcript: Notizbuch-Transkription aus dem Dateimanager. Lädt das
 * .rmdoc-Archiv über die bestehende API, entpackt es lokal, findet die
 * Seiten (.rm-Dateien, Reihenfolge aus der .content-Datei), erkennt jede
 * Seite über die bestehende Pipeline (R.ocrPipeline.recognizePage) und
 * stellt alles als eine Markdown-Datei zusammen (mit Bildern als
 * ZIP-Paket). Siehe docs/ocr-pipeline.md, Abschnitt Transcript.
 *
 * Bewusst getrennt von der UI in app.js: Diese Datei orchestriert nur
 * Archiv + Pipeline; Dialog/Bedienung hängen sich über R.features an.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});
  R.features = R.features || [];

  /* Lokale Pipeline-Dateien (Diagnose, siehe checkAssets). Im Fehlerfall
     zeigt der Dialog die offizielle Bezugsquelle an. */
  const REQUIRED_RUNTIME = [
    { path: '/assets/vendor/remarkable-rm/index.global.js', url: 'https://cdn.jsdelivr.net/npm/remarkable-rm/dist/' + 'index.global' + '.js' },
    { path: '/assets/vendor/onnxruntime-web/ort.min.js', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min' + '.js' },
    { path: '/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort-wasm-simd-threaded.mjs' },
    { path: '/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort-wasm-simd-threaded.wasm' }
  ];
  const REQUIRED_LANG = {
    de: [
      { path: '/assets/models/de-htr-v2/model.onnx', url: 'https://huggingface.co/naeyn/de-htr-web-v2/resolve/main/model.onnx' },
      { path: '/assets/models/de-htr-v2/config.json', url: 'https://huggingface.co/naeyn/de-htr-web-v2/resolve/main/config.json' }
    ],
    en: [
      { path: '/assets/models/simple-htr/model.onnx', url: 'https://huggingface.co/PellelNitram/xournalpp-htr-simple-htr/resolve/main/model.onnx' }
    ]
  };
  /* Formeln (CoMER/ink-on) werden bewusst nicht vorab geprüft: Fehlt eine
     Formel-Komponente, schlägt die Formel-Stufe je Seite fehl, während die
     Texterkennung weiterläuft (recognizePage fängt das ab). */

  /* ---------- reine Helfer (vm-testbar über R.ocrExport) ---------- */

  /** Eine .rm-Seite: der letzte Pfadabschnitt endet auf .rm. Je nach Quelle
     liegen die Seiten im Archiv-Wurzelverzeichnis (<uuid>.rm) oder in einem
     Dokument-Unterordner (<docid>/<pageid>.rm, so liefern reMarkable-Proxys
     das Archiv aus). */
  function isPageEntry(name) {
    return /^[^/]+\.rm$/i.test(String(name).split('/').pop());
  }

  /**
   * Findet die Seiten eines .rmdoc-Archivs und sortiert sie.
   * @param {string[]} entries Dateipfade im Archiv (Wurzelebene genügt)
   * @param {string} [contentText] Inhalt der .content-Datei (cPages bestimmt
   *        die Reihenfolge); ohne ihn fällt die Sortierung auf den Dateinamen zurück
   * @returns {string[]} Pfade der .rm-Dateien in Lesereihenfolge
   */
  function discoverPages(entries, contentText) {
    const pages = (entries || []).filter(isPageEntry);
    let order = null;
    if (contentText) {
      try {
        const c = JSON.parse(contentText);
        const list = c && c.cPages && Array.isArray(c.cPages.pages) ? c.cPages.pages : null;
        if (list) {
          order = [];
          list.forEach(function (p) {
            const id = p && (p.id || p.Id);
            if (!id) return;
            const hit = pages.find(function (n) { return String(n).split('/').pop().toLowerCase() === String(id).toLowerCase() + '.rm'; });
            if (hit) order.push(hit);
          });
          if (!order.length) order = null;
        }
      } catch (e) { order = null; }
    }
    return order || pages.slice().sort();
  }

  /**
   * Ersetzt blob:-Bildverweise einer Seite durch feste Pfade images/<name>.
   * Der k-te Verweis gehört zur k-ten Datei (die Pipeline ordnet
   * Bild-Markierungen in Lesereihenfolge den extrahierten Dateien zu).
   * @returns {{md: string, used: Object[], urls: string[]}}
   *   used: eingesetzte Dateien, urls: alle gefundenen blob:-URLs (zum Aufräumen)
   */
  function remapImages(md, files) {
    const used = [];
    const urls = [];
    const out = String(md).replace(/!\[[^\]]*\]\((blob:[^)]+)\)/g, function (whole, url) {
      urls.push(url);
      const f = files && files[urls.length - 1];
      if (!f) return whole; // nichts zuordnen: Verweis bleibt erhalten
      used.push(f);
      return '![](images/' + f.name + ')';
    });
    return { md: out, used: used, urls: urls };
  }

  /**
   * Baut das Gesamtdokument: Titel + Seiten in Reihenfolge. Seiten ohne
   * Erkennungsergebnis entfallen; Überschriften erfolgreicher Seiten
   * bleiben in Notebook-Reihenfolge erhalten.
   */
  function assembleDocument(title, pages) {
    let body = '';
    (pages || []).forEach(function (p) {
      const md = String(p.md || '').trim();
      if (!md) return;
      body += '\n## ' + p.heading + '\n\n' + md + '\n';
    });
    return '# ' + String(title || 'Transcript') + '\n' + (body ? '\n' + body : '');
  }

  /** Ziel-Dateiname: bereinigt, mit Endung. */
  function outputName(name, ext) {
    const base = (window.RMXShared && RMXShared.sanitizeFilename
      ? RMXShared.sanitizeFilename(name, 'Transcript')
      : String(name || 'Transcript'));
    return base + (ext || '.md');
  }

  /* ---------- UI / Orchestrierung (hängt sich an app.js an) ---------- */

  R.features.push(function (app) {
    const t = app.t, $ = app.$, esc = app.esc;
    let session = null; // { ctrl, running, lastId }

    /** Prüft die lokalen Pipeline-Dateien (HEAD-Request, eigener Ursprung). */
    async function checkAssets(lang) {
      const missing = [];
      const probe = async function (entry) {
        try {
          const r = await fetch(entry.path, { method: 'HEAD' });
          if (!r.ok) missing.push(entry);
        } catch (e) { missing.push(entry); }
      };
      for (const entry of REQUIRED_RUNTIME) await probe(entry);
      for (const entry of (REQUIRED_LANG[lang] || [])) await probe(entry);
      return { ok: !missing.length, missing: missing };
    }

    function missingHtml(list) {
      return '<ul class="rmx-errlist">' + list.map(function (m) {
        return '<li><code>' + esc(m.path) + '</code><br><a href="' + esc(m.url) + '" target="_blank" rel="noreferrer">' + esc(m.url) + '</a></li>';
      }).join('') + '</ul>';
    }

    function openTranscript(id) {
      const dlg = $('#dlg-transcript');
      const it = app.state.items.get(id);
      const name = it ? app.stripExt(it.VissibleName) : '';
      dlg.innerHTML =
        '<form method="dialog" id="tr-form" novalidate>' +
        app.dlgHead('dlg-transcript-title', t('trTitle') + (name ? ': ' + name : ''), 'data-trx="close"') +
        '<div class="rmx-dialog__body">' +
        '<p class="responsive-body-sm rmx-muted" style="margin:0 0 14px">' + esc(t('trIntro')) + '</p>' +
        '<div id="tr-options" style="display:flex;flex-direction:column;gap:14px">' +
        '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('trLang')) + '</legend>' +
        app.choice('radio', 'trlang', 'de', t('trDe'), '', true) +
        app.choice('radio', 'trlang', 'en', t('trEn'), '', false) + '</fieldset>' +
        '</div>' +
        '<div id="tr-run" class="rmx-run" hidden><div class="name responsive-body-md" id="tr-status"></div>' +
        '<div class="rmx-progress" id="tr-bar"><i></i></div><ul class="rmx-errlist" id="tr-errors" hidden></ul></div>' +
        '</div>' +
        '<div class="rmx-dialog__foot">' +
        app.btn(t('cancel'), 'data-trx="cancel" id="tr-cancel" hidden') +
        '<button type="submit" class="ark-button ark-button-large" id="tr-start">' + esc(t('trStart')) + '</button></div></form>';
      if (!dlg.open) dlg.showModal();
      $('#tr-start').focus();
    }

    function setBar(frac) {
      $('#tr-bar').firstElementChild.style.width = Math.round(frac * 100) + '%';
    }

    function trxVal() {
      const el = $('#dlg-transcript input[name="trlang"]:checked');
      return el ? el.value : 'de';
    }

    function finish(msgKey, vars) {
      session.running = false;
      $('#tr-status').textContent = t(msgKey, vars);
      $('#tr-cancel').hidden = true;
      $('#tr-start').hidden = false;
      $('#tr-start').disabled = false;
    }

    function showErrors(html) {
      const errList = $('#tr-errors');
      errList.hidden = false;
      errList.innerHTML = html;
    }

    async function runTranscript() {
      const id = session.lastId;
      const name = app.stripExt(app.state.items.get(id).VissibleName);
      const lang = trxVal();
      const ctrl = session.ctrl;
      const errors = [];
      $('#tr-options').hidden = true;
      $('#tr-run').hidden = false;
      $('#tr-errors').hidden = true;
      $('#tr-start').hidden = true;
      $('#tr-cancel').hidden = false;
      session.running = true;
      const status = function (key, vars) { $('#tr-status').textContent = t(key, vars); };
      setBar(0);

      // Diagnose: lokale Pipeline-Dateien vorhanden?
      status('trChecking');
      const assets = await checkAssets(lang);
      if (!assets.ok) {
        showErrors('<li><strong>' + esc(t('trDeps')) + '</strong></li>' + missingHtml(assets.missing));
        return finish('trFailed');
      }

      // Notizbuch laden
      status('trDownloading');
      let blob;
      try {
        blob = await R.api.download(id, 'rmdoc', ctrl.signal);
      } catch (e) {
        if (e.name === 'AbortError') return finish('trCancelled', { ok: 0, n: 0 });
        showErrors('<li>' + esc(e.message) + '</li>');
        return finish('trFailed');
      }

      // Archiv öffnen + Seiten finden
      status('trUnpacking');
      await R.load.jszip();
      let zip;
      try {
        zip = await window.JSZip.loadAsync(blob);
      } catch (e) {
        showErrors('<li>' + esc(t('trBadArchive')) + '</li>');
        return finish('trFailed');
      }
      let contentText = null;
      const contentPath = Object.keys(zip.files).find(function (n) { return /^[^/]+\.content$/i.test(String(n).split('/').pop()); });
      if (contentPath) {
        try { contentText = await zip.file(contentPath).async('string'); } catch (e) { contentText = null; }
      }
      const pages = discoverPages(Object.keys(zip.files), contentText);
      if (!pages.length) {
        showErrors('<li>' + esc(t('trNoPages')) + '</li>');
        return finish('trFailed');
      }

      // Seiten erkennen
      const parts = [];
      const imageFiles = [];
      let ok = 0;
      for (let i = 0; i < pages.length; i++) {
        if (ctrl.signal.aborted) {
          setBar(i / pages.length);
          return finish('trCancelled', { ok: ok, n: pages.length });
        }
        status('trPage', { i: i + 1, n: pages.length });
        setBar(i / pages.length);
        const pageId = pages[i].split('/').pop().replace(/\.rm$/i, '');
        try {
          const rmBuf = await zip.file(pages[i]).async('arraybuffer');
          const res = await R.ocrPipeline.recognizePage(rmBuf, { rmdocFile: blob, pageId: pageId, lang: lang, renderFormulas: false });
          let files = null;
          if (res.markdown.indexOf('blob:') >= 0) {
            try { files = await R.rmimages.extractEmbeddedImages(blob, pageId); } catch (e) { files = null; }
            if (files) {
              files.forEach(function (f, k) {
                const dot = f.name.lastIndexOf('.');
                f.name = 'p' + (i + 1) + '-' + (k + 1) + (dot >= 0 ? f.name.slice(dot) : '.png');
              });
            }
          }
          const remapped = remapImages(res.markdown, files);
          remapped.used.forEach(function (f) { imageFiles.push({ name: f.name, blob: f.blob }); });
          remapped.urls.forEach(function (u) { URL.revokeObjectURL(u); });
          parts.push({ heading: t('trPageHeading', { n: i + 1 }), md: remapped.md });
          ok++;
        } catch (e) {
          errors.push(t('trPageHeading', { n: i + 1 }) + ': ' + e.message);
        }
      }
      setBar(1);
      if (ctrl.signal.aborted) return finish('trCancelled', { ok: ok, n: pages.length });

      // Zusammenbauen + herunterladen (bei Teilerfolgen: erfolgreiches behalten)
      if (!ok) {
        showErrors(errors.map(function (er) { return '<li>' + esc(er) + '</li>'; }).join(''));
        return finish('trFailed');
      }
      status('trPacking');
      const md = assembleDocument(name, parts);
      const base = outputName(name, '').replace(/\.(md|zip)$/i, '');
      let outBlob, filename;
      if (imageFiles.length) {
        const out = new window.JSZip();
        out.file(base + '.md', md);
        imageFiles.forEach(function (f) { out.file('images/' + f.name, f.blob); });
        outBlob = await out.generateAsync({ type: 'blob' });
        filename = outputName(name, '.zip');
      } else {
        outBlob = new Blob([md], { type: 'text/markdown' });
        filename = outputName(name, '.md');
      }
      app.saveBlob(outBlob, filename);

      if (errors.length) {
        showErrors('<li><strong>' + esc(t('trFailedSome', { n: errors.length })) + '</strong></li>' +
          errors.slice(0, 50).map(function (er) { return '<li>' + esc(er) + '</li>'; }).join(''));
      }
      finish('trDone', { ok: ok, n: pages.length });
    }

    const dlg = $('#dlg-transcript');
    dlg.addEventListener('click', function (e) {
      const b = e.target.closest('[data-trx]');
      if (!b) return;
      const a = b.getAttribute('data-trx');
      if (a === 'close' || a === 'cancel') {
        if (session && session.running) { session.ctrl.abort(); return; }
        dlg.close();
      }
    });
    dlg.addEventListener('submit', function (e) {
      e.preventDefault();
      if (session && !session.running) runTranscript();
    });
    dlg.addEventListener('cancel', function (e) {
      if (session && session.running) { e.preventDefault(); session.ctrl.abort(); }
    });

    app.openTranscript = function (id) {
      session = { ctrl: new AbortController(), running: false, lastId: id };
      openTranscript(id);
    };
  });

  /* ---------- Export für Tests / Wiederverwendung ---------- */
  R.ocrExport = {
    isPageEntry: isPageEntry,
    discoverPages: discoverPages,
    remapImages: remapImages,
    assembleDocument: assembleDocument,
    outputName: outputName
  };
})();
