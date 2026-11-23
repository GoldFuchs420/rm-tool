/*
 * Import dialog: PDF / EPUB / RMDOC are uploaded as they are, everything else is
 * converted to PDF first (images, Markdown, text, HTML, web pages by URL).
 * Flow: add files -> previews are created automatically -> remove or rename
 * entries if needed -> upload the whole list at once.
 */
(function () {
  'use strict';
  var R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    var t = app.t, esc = app.esc, icon = app.icon, $ = app.$, state = app.state;
    var dlg = $('#dlg-import');

    var items = [];        // {id, file, kind: native|image|text, fromUrl}
    var uid = 0;
    var adding = Promise.resolve();   // serialises late additions in the results view
    var mode = 'setup';    // setup | working | results
    var ctrl = null;       // result list controller
    var abort = null;
    var vals = { page: 'remarkable', merge: false, mergeName: '', tfmt: 'remarkable', tfont: 'normal', datePrefix: false, ascii: false };
    var NATIVE = ['pdf', 'epub', 'rmdoc'];
    var extOf = function (n) { var m = /\.([^.]+)$/.exec(n); return m ? m[1].toLowerCase() : ''; };

    function kindOf(file) {
      if (NATIVE.indexOf(extOf(file.name)) >= 0) return 'native';
      if (R.convert.isImage(file)) return 'image';
      if (R.textpdf.kindOf(file)) return 'text';
      return null;
    }
    var NOISE = /(^|\/)_(export-fehler|export-errors|errori-esportazione|errores-exportacion|erreurs-exportation)\.txt$/i;
    /** Adds files; zip / tar.gz archives are opened and their entries keep the folder path. */
    async function addFiles(files) {
      var skippedEntries = 0;
      for (var n = 0; n < files.length; n++) {
        var f = files[n];
        if (R.archive.isArchive(f)) {
          var sum = $('#im-summary');
          sum.hidden = false; sum.textContent = t('archiveReading', { name: f.name });
          try {
            var entries = await R.archive.read(f);
            entries.forEach(function (e) {
              var parts = e.path.split('/');
              var file = new File([e.blob], parts.pop());
              var k = NOISE.test(e.path) ? null : kindOf(file);
              if (!k) { skippedEntries++; return; }
              items.push({ id: ++uid, file: file, kind: k, folderPath: parts, fromArchive: true });
            });
          } catch (e) { console.error(e); app.toast(t('archiveFailed', { name: f.name, msg: e.message }), true); }
          sum.hidden = true;
          continue;
        }
        var kind = kindOf(f);
        if (!kind) { app.toast(t('unsupported', { name: f.name }), true); continue; }
        items.push({ id: ++uid, file: f, kind: kind });
      }
      if (skippedEntries) app.toast(t('archiveSkipped', { n: skippedEntries }));
    }

    app.openImport = async function (files) {
      if (!dlg.open) {
        items = []; mode = 'setup'; ctrl = null; fails = [];
        vals.mergeName = '';
        vals.datePrefix = app.store('rmx.dateprefix') !== '0';
        vals.ascii = app.store('rmx.ascii') === '1';
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
        run();
      } else {
        /* results: fold the new files in at any time and append them to the list */
        adding = adding.then(async function () {
          var from = items.length;
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
      var g = function (n) { var el = dlg.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : null; };
      vals.page = g('page') || vals.page;
      var mg = $('#im-merge'); if (mg) vals.merge = mg.checked;
      var mn = $('#im-mergename'); if (mn) vals.mergeName = mn.value;
      var d = $('#im-date'); if (d) vals.datePrefix = d.checked;
      var a = $('#im-ascii'); if (a) vals.ascii = a.checked;
    }

    function renderMain() {
      readOptions();
      var main = $('#im-main');
      var images = items.filter(function (i) { return i.kind === 'image' && !i.fromArchive; });
      var texts = items.filter(function (i) { return i.kind === 'text'; });
      var mergeable = images.length > 1;
      var defName = vals.mergeName || (images.length ? images[0].file.name.replace(/\.[^.]+$/, '') : '');

      var list = '<ul class="rmx-files" id="im-files">' + items.map(function (it, idx) {
        var label = it.kind === 'native' ? '' : t('toPdf');
        var ico = it.kind === 'native' ? (extOf(it.file.name) === 'pdf' ? 'pdf' : 'notebook') : (it.kind === 'image' ? 'notebook' : 'pdf');
        return '<li data-id="' + it.id + '" data-state="idle">' + icon(ico, 24) + '<span class="fname responsive-body-sm">' + (it.folderPath && it.folderPath.length ? '<span class="rmx-muted">' + esc(it.folderPath.join(' / ')) + ' / </span>' : '') + esc(it.file.name) + '</span>' +
          '<span class="state responsive-body-sm">' + esc(label) + '</span>' +
          (it.kind === 'image' && mergeable && vals.merge
            ? '<button type="button" class="rmx-iconbtn" data-im-up="' + it.id + '" aria-label="' + esc(t('moveUp')) + '" title="' + esc(t('moveUp')) + '"' + (idx === 0 ? ' disabled' : '') + '>' + icon('up', 20) + '</button>' +
              '<button type="button" class="rmx-iconbtn" data-im-down="' + it.id + '" aria-label="' + esc(t('moveDown')) + '" title="' + esc(t('moveDown')) + '"' + (idx === items.length - 1 ? ' disabled' : '') + '>' + icon('down', 20) + '</button>' : '') +
          '<button type="button" class="rmx-iconbtn rmx-iconbtn--danger" data-im-rm="' + it.id + '" aria-label="' + esc(t('remove')) + '" title="' + esc(t('remove')) + '">' + icon('trash', 20) + '</button></li>';
      }).join('') + '</ul>';

      var add = addRowHtml();

      /* Optionen, die nur eine Art von Datei betreffen (Seitenformat für Bilder,
         Text-Format für Texte), erscheinen nur, wenn die ganze Liste aus dieser
         Art besteht – bei mehreren gemischten Dateien bleiben sie weg. */
      var opts = '';
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
      main.innerHTML = list + add + opts;
      /* Flatten option (missing folders are created or not) only makes sense with
         several files that bring folder structures with them */
      var cr = $('#im-createrow');
      if (cr) cr.hidden = !(items.length > 1 && items.some(function (i) { return i.fromArchive && i.folderPath && i.folderPath.length; }));
      renderFoot();
    }

    function addRowHtml() {
      return '<div class="rmx-addrow"><button type="button" class="ark-button ark-button--secondary ark-button-medium" data-im="add"><p class="responsive-body-md">' + esc(t('addFiles')) + '</p></button>' +
        '<span class="rmx-muted responsive-body-sm">' + esc(t('importTypes')) + '</span></div>';
    }

    function renderFoot() {
      var f = $('#im-foot');
      f.innerHTML = mode === 'working'
        ? app.btn(t('cancel'), 'data-im="stop"')
        : mode === 'results'
          ? app.btn(t('uploadAll'), 'data-im="uploadall"', 'primary')
          : '';
    }

    /* ---------- build / upload ---------- */
    function setItemState(id, st, text, ico) {
      var li = dlg.querySelector('li[data-id="' + id + '"]');
      if (!li) return;
      li.setAttribute('data-state', st);
      li.querySelector('.state').innerHTML = (ico ? icon(ico, 18) : (st === 'working' ? '<span class="rmx-spinner" style="width:16px;height:16px"></span>' : '')) + '<span>' + esc(text || '') + '</span>';
    }

    var fails = [];
    async function build(subset) {
      readOptions();
      var list = subset || items;
      var outs = [];
      var images = list.filter(function (i) { return i.kind === 'image' && !i.fromArchive; });
      var merge = images.length > 1 && vals.merge;
      var mergedDone = false;
      var page = vals.page;
      var textOpts = app.outputs.readTextOptions(dlg, vals);
      for (var k = 0; k < list.length; k++) {
        var it = list[k];
        if (abort.signal.aborted) break;
        try {
          var meta = { folderPath: it.folderPath, fromArchive: it.fromArchive };
          if (it.kind === 'native') {
            outs.push(Object.assign({ name: it.file.name, blob: it.file }, meta));
          } else if (it.kind === 'image' && merge && !it.fromArchive) {
            if (!mergedDone) {
              images.forEach(function (im) { setItemState(im.id, 'working', t('converting')); });
              var f = await R.convert.imagesToPdf(images.map(function (x) { return x.file; }), { pageMode: page, name: (vals.mergeName || images[0].file.name.replace(/\.[^.]+$/, '')).trim() });
              outs.push({ name: f.name, blob: f });
              mergedDone = true;
              images.forEach(function (im) { setItemState(im.id, 'done', '', 'check'); });
            }
          } else {
            setItemState(it.id, 'working', t('converting'));
            var pdf = it.kind === 'image' ? await R.convert.imageToPdf(it.file, { pageMode: page }) : await R.textpdf.convert(it.file, textOpts);
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
      var outs = await build();
      if (abort.signal.aborted) { dlg.close(); return; }
      if (!outs.length) { mode = 'setup'; renderMain(); return; }
      mode = 'results';
      var main = $('#im-main');
      main.innerHTML = '<h3 class="responsive-body-md" style="font-weight:600;margin:0">' + esc(t('results')) + '</h3><div id="im-results"></div>' +
        addRowHtml() +
        (fails.length ? '<ul class="rmx-errlist">' + fails.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '');
      ctrl = app.outputs.createList($('#im-results'), outs, function () { return app.outputs.fieldValues('im'); });
      renderFoot();
    }
    /* nachgereicht: nur die neuen Einträge umwandeln und an die Liste anhängen */
    async function runMore(newItems) {
      abort = new AbortController();
      var sum = $('#im-summary');
      var btn = dlg.querySelector('[data-im="uploadall"]');
      if (btn) btn.disabled = true;
      sum.hidden = false;
      sum.textContent = t('converting');
      var before = fails.length;
      var outs = await build(newItems);
      if (!abort.signal.aborted && outs.length && ctrl) ctrl.addBatch(outs);
      sum.hidden = fails.length === before;
      sum.textContent = fails.length > before ? fails[fails.length - 1] : '';
      if (btn) btn.disabled = false;
    }
    async function uploadAll() {
      var sum = $('#im-summary');
      var btn = dlg.querySelector('[data-im="uploadall"]');
      if (btn) btn.disabled = true;
      var ok = await ctrl.uploadAll();
      sum.hidden = false;
      sum.textContent = t('importDone', { ok: ok, n: ctrl.count }) + (ctrl.skipped ? ' ' + t('skippedCount', { n: ctrl.skipped }) : '');
      if (btn) btn.disabled = false;
    }

    dlg.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-im-rm]');
      if (rm) { items = items.filter(function (i) { return String(i.id) !== rm.getAttribute('data-im-rm'); }); renderMain(); return; }
      var mv = e.target.closest('[data-im-up],[data-im-down]');
      if (mv) {
        var up = mv.hasAttribute('data-im-up');
        var id = parseInt(mv.getAttribute(up ? 'data-im-up' : 'data-im-down'), 10);
        var i = items.findIndex(function (x) { return x.id === id; });
        var j = up ? i - 1 : i + 1;
        if (i >= 0 && j >= 0 && j < items.length) { var tmp = items[i]; items[i] = items[j]; items[j] = tmp; renderMain(); }
        return;
      }
      var b = e.target.closest('[data-im]');
      if (!b) return;
      switch (b.getAttribute('data-im')) {
        case 'close': if (ctrl) ctrl.abort(); if (abort) abort.abort(); dlg.close(); break;
        case 'stop': if (ctrl) ctrl.abort(); if (abort) abort.abort(); dlg.close(); break;
        case 'add': $('#import-input').click(); break;
        case 'uploadall': uploadAll(); break;
      }
    });
    dlg.addEventListener('change', function (e) {
      if (e.target.id === 'im-date' || e.target.id === 'im-ascii') {
        readOptions();
        app.store('rmx.dateprefix', vals.datePrefix ? '1' : '0');
        app.store('rmx.ascii', vals.ascii ? '1' : '0');
        return;
      }
      if (e.target.id === 'im-merge' || e.target.name === 'page') renderMain();
    });
    dlg.addEventListener('cancel', function (e) { if (mode === 'working') { e.preventDefault(); abort.abort(); } });
    dlg.addEventListener('close', function () { if (ctrl) ctrl.abort(); items = []; ctrl = null; });

    /* ---------- drag & drop anywhere ---------- */
    var zone = $('#dropzone');
    var depth = 0;
    var hasFiles = function (e) { return e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0; };
    window.addEventListener('dragenter', function (e) { if (hasFiles(e)) { depth++; zone.firstElementChild.textContent = t('dropHint'); zone.hidden = false; e.preventDefault(); } });
    window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) zone.hidden = true; });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; zone.hidden = true;
      var files = Array.from(e.dataTransfer.files);
      if (!$('#dlg-export').open && !$('#dlg-preview').open && !$('#dlg-copy').open) app.openImport(files);
    });
  });
})();
