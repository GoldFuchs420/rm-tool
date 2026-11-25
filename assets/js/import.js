/*
 * Import dialog: PDF / EPUB / RMDOC are uploaded as they are, everything else is
 * converted to PDF first (images, Markdown, text, source code and HTML as code).
 * Flow: add files -> previews are created automatically -> remove or rename
 * entries if needed -> upload the whole list at once.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    const t = app.t, esc = app.esc, icon = app.icon, $ = app.$, state = app.state;
    const dlg = $('#dlg-import');

    let items = [];        // {id, file, kind: native|image|text, fromUrl}
    let uid = 0;
    let adding = Promise.resolve();   // serialises late additions in the results view
    let mode = 'setup';    // setup | working | results
    let ctrl = null;       // result list controller
    let abort = null;
    const vals = { page: 'remarkable', merge: false, mergeName: '', tfmt: 'remarkable', fontScale: 1, datePrefix: false, ascii: false };
    let previewedItem = null;   // Element, das gerade in der grossen Vorschau offen ist (fuer Live-Update beim Schriftgroessen-Regler)
    const NATIVE = ['pdf', 'epub', 'rmdoc'];
    const extOf = function (n) { const m = /\.([^.]+)$/.exec(n); return m ? m[1].toLowerCase() : ''; };

    function kindOf(file) {
      if (NATIVE.indexOf(extOf(file.name)) >= 0) return 'native';
      if (R.convert.isImage(file)) return 'image';
      if (R.textpdf.kindOf(file)) return 'text';
      return null;
    }

    /* ---------- Vorschauleiste links vom Titel (Auge ueber Canvas) ---------- */
    function leadHtml(it) {
      const previewable = it.kind !== 'native' || extOf(it.file.name) === 'pdf';
      const ico = it.kind === 'native' ? (extOf(it.file.name) === 'pdf' ? 'pdf' : 'notebook') : (it.kind === 'image' ? 'notebook' : 'pdf');
      return '<span class="ilead' + (previewable ? '" data-im-pv="' + it.id + '" role="button" tabindex="0" aria-label="' + esc(t('preview')) + '" title="' + esc(t('preview')) + '"' : '"') + '>' +
        '<span class="ihost" hidden></span><span class="ifallback">' + icon(ico, 24) + '</span>' +
        (previewable ? '<span class="obadge">' + icon('eye', 13) + '</span>' : '') + '</span>';
    }
    function imageCanvas(file, height) {
      return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
          const w = Math.max(1, Math.round(height * (img.naturalWidth / (img.naturalHeight || 1))));
          const c = document.createElement('canvas');
          c.width = w; c.height = height;
          c.getContext('2d').drawImage(img, 0, 0, w, height);
          URL.revokeObjectURL(url); resolve(c);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('preview')); };
        img.src = url;
      });
    }
    function showLeadCanvas(id, canvas) {
      const host = dlg.querySelector('li[data-id="' + id + '"] .ilead');
      if (!host) return;
      host.querySelector('.ihost').hidden = false;
      host.querySelector('.ihost').innerHTML = '';
      host.querySelector('.ihost').appendChild(canvas);
      host.classList.add('is-ready');
    }
    function paintLeads() {
      items.forEach(function (it) {
        if (it.kind === 'native') {
          R.pdfview.firstPageCanvas(it.file, 72).then(function (canvas) {
            showLeadCanvas(it.id, canvas);
          }).catch(function () { /* keine Vorschau */ });
        } else if (it.kind === 'image') {
          imageCanvas(it.file, 72).then(function (canvas) {
            showLeadCanvas(it.id, canvas);
          }).catch(function () { /* keine Vorschau */ });
        }
      });
    }
    async function openItemPreview(it) {
      previewedItem = it;
      try {
        let blob;
        if (it.kind === 'native') blob = it.file;
        else if (it.kind === 'image') blob = await R.convert.imageToPdf(it.file, { pageMode: vals.page });
        else blob = await R.textpdf.convert(it.file, app.outputs.readTextOptions(dlg, vals));
        app.previewBlob(blob, it.file.name);
      } catch (e) { app.toast(t('importFailed', { msg: e.message }), true); }
    }
    /* Regler losgelassen: laeuft die grosse Vorschau gerade fuer ein Textdokument,
       wird sie mit der neuen Schriftgroesse neu erzeugt. Fuer Bilder/native Dateien
       passiert nichts, da fontScale dort keine Wirkung hat. */
    function refreshOpenTextPreview() {
      if (!previewedItem || previewedItem.kind !== 'text') return;
      if (!$('#dlg-preview').open) return;
      openItemPreview(previewedItem);
    }
    const NOISE = /(^|\/)_(export-fehler|export-errors|errori-esportazione|errores-exportacion|erreurs-exportation)\.txt$/i;
    /** Already in the list (same name and size)? Repeated file selection then
     *  only refreshes the existing entries instead of piling up duplicates. */
    function indexOfExisting(file) {
      return items.findIndex(function (x) {
        return x.file && x.file.name === file.name && x.file.size === file.size;
      });
    }

    /** Adds files; zip / tar.gz archives are opened and their entries keep the folder path. */
    async function addFiles(files) {
      let skippedEntries = 0;
      let duplicates = 0;
      for (let n = 0; n < files.length; n++) {
        const f = files[n];
        if (R.archive.isArchive(f)) {
          const sum = $('#im-summary');
          sum.hidden = false; sum.textContent = t('archiveReading', { name: f.name });
          try {
            const entries = await R.archive.read(f);
            entries.forEach(function (e) {
              const parts = e.path.split('/');
              const file = new File([e.blob], parts.pop());
              const k = NOISE.test(e.path) ? null : kindOf(file);
              if (!k) { skippedEntries++; return; }
              if (indexOfExisting(file) >= 0) { duplicates++; return; }
              items.push({ id: ++uid, file: file, kind: k, folderPath: parts, fromArchive: true });
            });
          } catch (e) { console.error(e); app.toast(t('archiveFailed', { name: f.name, msg: e.message }), true); }
          sum.hidden = true;
          continue;
        }
        const kind = kindOf(f);
        if (!kind) { app.toast(t('unsupported', { name: f.name }), true); continue; }
        const at = indexOfExisting(f);
        if (at >= 0) { items[at].file = f; items[at].kind = kind; duplicates++; continue; }
        items.push({ id: ++uid, file: f, kind: kind });
      }
      if (skippedEntries) app.toast(t('archiveSkipped', { n: skippedEntries }));
      if (duplicates) app.toast(t('alreadyList', { n: duplicates }));
    }

    app.openImport = async function (files) {
      if (!dlg.open) {
        items = []; mode = 'setup'; ctrl = null; fails = [];
        vals.mergeName = '';
        vals.datePrefix = app.store('rmx.im.date') === '1';
        vals.ascii = app.store('rmx.im.ascii') !== '0';
        buildShell();
        dlg.showModal();
        renderMain();   /* also with an empty dialog: this creates the "Add files" button */
      } else if (mode === 'working') {
        return; /* while converting, queued files are completed first */
      }
      if (!files.length) return;
      if (mode === 'setup') {
        await addFiles(files);
        if (!items.length) return;
        renderMain();
        /* Nur automatisch starten, wenn es nichts einzustellen gibt (reine
           PDF/EPUB/RMDOC-Uploads). Sobald Bild- oder Text-Optionen angezeigt
           werden (inkl. Schriftgroessen-Regler), wartet der Dialog auf den
           Start-Button in renderFoot() - sonst wuerde run() den Optionen-
           Bereich sofort durch die Ergebnisliste ueberschreiben. */
        if (!hasConfigurable) run();
      } else {
        /* results: fold the new files in at any time and append them to the list */
        adding = adding.then(async function () {
          const from = items.length;
          await addFiles(files);
          await runMore(items.slice(from));
        });
        await adding;
      }
    };

    function buildShell() {
      dlg.innerHTML = app.dlgHead('dlg-import-title', t('importTitle'), 'data-im="close"') +
        '<div class="rmx-dialog__body"><div id="im-main" style="display:flex;flex-direction:column;gap:28px"></div>' +
        '<div id="im-common" style="display:flex;flex-direction:column;gap:28px">' + app.outputs.fieldsHtml('im', state.folder, true) + app.outputs.namingFieldsHtml('im', vals) + '</div>' +
        '<div id="im-summary" class="responsive-body-sm" aria-live="polite" hidden></div></div>' +
        '<div class="rmx-dialog__foot" id="im-foot"></div>';
      dlg.setAttribute('aria-labelledby', 'dlg-import-title');
    }

    function readOptions() {
      const g = function (n) { const el = dlg.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : null; };
      vals.page = g('page') || vals.page;
      const mg = $('#im-merge'); if (mg) vals.merge = mg.checked;
      const mn = $('#im-mergename'); if (mn) vals.mergeName = mn.value;
      const d = $('#im-date'); if (d) vals.datePrefix = d.checked;
      const a = $('#im-ascii'); if (a) vals.ascii = a.checked;
    }

    function renderMain() {
      readOptions();
      const main = $('#im-main');
      const images = items.filter(function (i) { return i.kind === 'image' && !i.fromArchive; });
      const texts = items.filter(function (i) { return i.kind === 'text'; });
      const mergeable = images.length > 1;
      const defName = vals.mergeName || (images.length ? images[0].file.name.replace(/\.[^.]+$/, '') : '');

      const list = '<ul class="rmx-files" id="im-files">' + items.map(function (it, idx) {
        const label = it.kind === 'native' ? '' : t('toPdf');
        return '<li data-id="' + it.id + '" data-state="idle">' + leadHtml(it) + '<span class="fname responsive-body-sm">' + (it.folderPath && it.folderPath.length ? '<span class="rmx-muted">' + esc(it.folderPath.join(' / ')) + ' / </span>' : '') + esc(it.file.name) + '</span>' +
          '<span class="state responsive-body-sm">' + esc(label) + '</span>' +
          (it.kind === 'image' && mergeable && vals.merge
            ? '<button type="button" class="rmx-iconbtn" data-im-up="' + it.id + '" aria-label="' + esc(t('moveUp')) + '" title="' + esc(t('moveUp')) + '"' + (idx === 0 ? ' disabled' : '') + '>' + icon('up', 20) + '</button>' +
              '<button type="button" class="rmx-iconbtn" data-im-down="' + it.id + '" aria-label="' + esc(t('moveDown')) + '" title="' + esc(t('moveDown')) + '"' + (idx === items.length - 1 ? ' disabled' : '') + '>' + icon('down', 20) + '</button>' : '') +
          '<button type="button" class="rmx-iconbtn rmx-iconbtn--danger" data-im-rm="' + it.id + '" aria-label="' + esc(t('remove')) + '" title="' + esc(t('remove')) + '">' + icon('trash', 20) + '</button></li>';
      }).join('') + '</ul>';

      const add = addRowHtml();

      /* Optionen, die nur eine Art von Datei betreffen (Seitenformat für Bilder,
         Text-Format für Texte), erscheinen nur, wenn die ganze Liste aus dieser
         Art besteht – bei mehreren gemischten Dateien bleiben sie weg. */
      let opts = '';
      if (images.length && images.length === items.length) {
        opts += '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('pageSize')) + '</legend>' +
          app.choice('radio', 'page', 'original', t('pageOriginal'), t('pageOriginalHint'), vals.page === 'original') +
          app.choice('radio', 'page', 'remarkable', t('pageRm'), t('pageRmHint'), vals.page === 'remarkable') + '</fieldset>';
        if (mergeable) {
          opts += '<div class="rmx-switchrow"><span class="ark-switch"><input type="checkbox" role="switch" class="ark-switch--input" id="im-merge"' + (vals.merge ? ' checked' : '') + '><span class="ark-switch--track"><span class="ark-switch--thumb"></span></span></span>' +
            '<label for="im-merge" class="txt" style="cursor:pointer"><span class="responsive-body-md">' + esc(t('mergeImages')) + '</span></label></div>' +
            (vals.merge ? '<div class="ark-field"><label for="im-mergename" class="responsive-body-md" style="font-weight:600">' + esc(t('mergeName')) + '</label><input id="im-mergename" class="ark-input" type="text" value="' + esc(defName) + '" autocomplete="off"></div>' : '');
        }
      }
      if (texts.length && texts.length === items.length) {
        opts += app.outputs.textOptionsHtml(vals);
      }
      hasConfigurable = !!opts;
      main.innerHTML = list + add + opts;
      paintLeads();
      /* Flatten option (missing folders are created or not) only makes sense with
         several files that bring folder structures with them */
      const cr = $('#im-createrow');
      if (cr) cr.hidden = !(items.length > 1 && items.some(function (i) { return i.fromArchive && i.folderPath && i.folderPath.length; }));
      renderFoot();
    }

    function addRowHtml() {
      return '<div class="rmx-addrow"><button type="button" class="ark-button ark-button--secondary ark-button-medium" data-im="add"><p class="responsive-body-md">' + esc(t('addFiles')) + '</p></button>' +
        '<span class="rmx-muted responsive-body-sm">' + esc(t('importTypes')) + '</span></div>';
    }

    function renderFoot() {
      const f = $('#im-foot');
      f.innerHTML = mode === 'working'
        ? app.btn(t('cancel'), 'data-im="stop"')
        : mode === 'results'
          ? app.btn(t('uploadAll'), 'data-im="uploadall"', 'primary')
          : (mode === 'setup' && items.length && hasConfigurable ? app.btn(t('startConvert'), 'data-im="start"', 'primary') : '');
    }

    /* ---------- build / upload ---------- */
    function setItemState(id, st, text, ico) {
      const li = dlg.querySelector('li[data-id="' + id + '"]');
      if (!li) return;
      li.setAttribute('data-state', st);
      li.querySelector('.state').innerHTML = (ico ? icon(ico, 18) : (st === 'working' ? '<span class="rmx-spinner" style="width:16px;height:16px"></span>' : '')) + '<span>' + esc(text || '') + '</span>';
    }

    // nachher
    let fails = [];
    let hasConfigurable = false;   // true, sobald renderMain() einstellbare Optionen (Bild/Text) gefunden hat
    async function build(subset) {
      readOptions();
      const list = subset || items;
      const outs = [];
      const images = list.filter(function (i) { return i.kind === 'image' && !i.fromArchive; });
      const merge = images.length > 1 && vals.merge;
      let mergedDone = false;
      const page = vals.page;
      const textOpts = app.outputs.readTextOptions(dlg, vals);
      for (let k = 0; k < list.length; k++) {
        const it = list[k];
        if (abort.signal.aborted) break;
        try {
          const meta = { folderPath: it.folderPath, fromArchive: it.fromArchive };
          if (it.kind === 'native') {
            outs.push(Object.assign({ name: it.file.name, blob: it.file }, meta));
          } else if (it.kind === 'image' && merge && !it.fromArchive) {
            if (!mergedDone) {
              images.forEach(function (im) { setItemState(im.id, 'working', t('converting')); });
              const f = await R.convert.imagesToPdf(images.map(function (x) { return x.file; }), { pageMode: page, name: (vals.mergeName || images[0].file.name.replace(/\.[^.]+$/, '')).trim() });
              outs.push({ name: f.name, blob: f });
              mergedDone = true;
              images.forEach(function (im) { setItemState(im.id, 'done', '', 'check'); });
            }
          } else {
            setItemState(it.id, 'working', t('converting'));
            const pdf = it.kind === 'image' ? await R.convert.imageToPdf(it.file, { pageMode: page }) : await R.textpdf.convert(it.file, textOpts);
            outs.push(Object.assign({ name: pdf.name, blob: pdf }, meta));
            setItemState(it.id, 'done', '', 'check');
          }
        } catch (e) {
          console.error(e);
          fails.push(it.file.name + ': ' + e.message);
          setItemState(it.id, 'error', t('importFailed', { msg: e.message }), 'warn');
        }
      }
      return outs;
    }

    async function run() {
      mode = 'working';
      abort = new AbortController();
      renderFoot();
      fails = [];
      const outs = await build();
      if (abort.signal.aborted) { dlg.close(); return; }
      if (!outs.length) { mode = 'setup'; renderMain(); return; }
      mode = 'results';
      const main = $('#im-main');
      main.innerHTML = '<h3 class="responsive-body-md" style="font-weight:600;margin:0">' + esc(t('results')) + '</h3><div id="im-results"></div>' +
        addRowHtml() +
        (fails.length ? '<ul class="rmx-errlist">' + fails.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '');
      ctrl = app.outputs.createList($('#im-results'), outs, function () { return app.outputs.fieldValues('im'); });
      renderFoot();
    }
    /* nachgereicht: nur die neuen Einträge umwandeln und an die Liste anhängen */
    async function runMore(newItems) {
      abort = new AbortController();
      const sum = $('#im-summary');
      const btn = dlg.querySelector('[data-im="uploadall"]');
      if (btn) btn.disabled = true;
      sum.hidden = false;
      sum.textContent = t('converting');
      const before = fails.length;
      const outs = await build(newItems);
      if (!abort.signal.aborted && outs.length && ctrl) ctrl.addBatch(outs);
      sum.hidden = fails.length === before;
      sum.textContent = fails.length > before ? fails[fails.length - 1] : '';
      if (btn) btn.disabled = false;
    }
    async function uploadAll() {
      const sum = $('#im-summary');
      const btn = dlg.querySelector('[data-im="uploadall"]');
      if (btn) btn.disabled = true;
      const ok = await ctrl.uploadAll();
      sum.hidden = false;
      sum.textContent = t('importDone', { ok: ok, n: ctrl.count }) + (ctrl.skipped ? ' ' + t('skippedCount', { n: ctrl.skipped }) : '');
      if (btn) btn.disabled = false;
    }

    dlg.addEventListener('click', function (e) {
      const pv = e.target.closest('[data-im-pv]');
      if (pv) {
        const cur = items.filter(function (x) { return String(x.id) === pv.getAttribute('data-im-pv'); })[0];
        if (cur) openItemPreview(cur);
        return;
      }
      const rm = e.target.closest('[data-im-rm]');
      if (rm) { items = items.filter(function (i) { return String(i.id) !== rm.getAttribute('data-im-rm'); }); renderMain(); return; }
      const mv = e.target.closest('[data-im-up],[data-im-down]');
      if (mv) {
        const up = mv.hasAttribute('data-im-up');
        const id = parseInt(mv.getAttribute(up ? 'data-im-up' : 'data-im-down'), 10);
        const i = items.findIndex(function (x) { return x.id === id; });
        const j = up ? i - 1 : i + 1;
        if (i >= 0 && j >= 0 && j < items.length) { const tmp = items[i]; items[i] = items[j]; items[j] = tmp; renderMain(); }
        return;
      }
      const b = e.target.closest('[data-im]');
      if (!b) return;
      switch (b.getAttribute('data-im')) {
        case 'close': if (ctrl) ctrl.abort(); if (abort) abort.abort(); dlg.close(); break;
        case 'stop': if (ctrl) ctrl.abort(); if (abort) abort.abort(); dlg.close(); break;
        case 'add': $('#import-input').click(); break;
        case 'start': run(); break;
        case 'uploadall': uploadAll(); break;
      }
    });
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const pv = e.target.closest ? e.target.closest('[data-im-pv]') : null;
      if (!pv) return;
      e.preventDefault();
      const cur = items.filter(function (x) { return String(x.id) === pv.getAttribute('data-im-pv'); })[0];
      if (cur) openItemPreview(cur);
    });
    dlg.addEventListener('input', function (e) {
      if (e.target.id !== 'im-fontscale') return;
      const label = $('#im-fontscale-val');
      if (label) label.textContent = Math.round(parseFloat(e.target.value) * 100) + '%';
    });
    dlg.addEventListener('change', function (e) {
      if (e.target.id === 'im-date' || e.target.id === 'im-ascii') {
        readOptions();
        app.store('rmx.im.date', vals.datePrefix ? '1' : '0');
        app.store('rmx.im.ascii', vals.ascii ? '1' : '0');
        return;
      }
      if (e.target.id === 'im-fontscale') { vals.fontScale = parseFloat(e.target.value) || 1; refreshOpenTextPreview(); return; }
      if (e.target.id === 'im-merge' || e.target.name === 'page') renderMain();
    });
    dlg.addEventListener('cancel', function (e) { if (mode === 'working') { e.preventDefault(); abort.abort(); } });
    dlg.addEventListener('close', function () { if (ctrl) ctrl.abort(); items = []; ctrl = null; });
    $('#dlg-preview').addEventListener('close', function () { previewedItem = null; });
    
    /* ---------- drag & drop anywhere ---------- */
    const zone = $('#dropzone');
    let depth = 0;
    const hasFiles = function (e) { return e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0; };
    window.addEventListener('dragenter', function (e) { if (hasFiles(e)) { depth++; zone.firstElementChild.textContent = t('dropHint'); zone.hidden = false; e.preventDefault(); } });
    window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) zone.hidden = true; });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; zone.hidden = true;
      const files = Array.from(e.dataTransfer.files);
      if (!$('#dlg-export').open && !$('#dlg-preview').open) app.openImport(files);
    });
  });
})();
