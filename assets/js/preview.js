/*
 * Preview (PDF in an embedded viewer) and details dialog.
 *  - documents on the device: the device renders /download/{id}/pdf
 *  - generated files: the blob is shown before upload
 */
(function () {
  'use strict';
  var R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    var t = app.t, esc = app.esc, icon = app.icon, $ = app.$, state = app.state;

    /* small LRU of downloaded PDFs: details, preview and thumbnails share one download */
    var pdfCache = new Map();
    app.getPdf = async function (id, signal, opts) {
      var it = state.items.get(id);
      var key = id + '|' + (it ? it.ModifiedClient : '') + '|' + (it && it.Version != null ? it.Version : '');
      if (pdfCache.has(key)) { var hit = pdfCache.get(key); pdfCache.delete(key); pdfCache.set(key, hit); return hit; }
      var blob = await R.api.download(id, 'pdf', signal, { low: !!(opts && opts.low) });
      pdfCache.set(key, blob);
      if (pdfCache.size > 4) pdfCache.delete(pdfCache.keys().next().value);
      return blob;
    };

    /* ---------- preview ---------- */
    var cur = null;
    var dlgP = $('#dlg-preview');

    function cleanup() {
      if (!cur) return;
      cur.ctrl.abort();
      if (cur.viewer) cur.viewer.destroy();
      cur = null;
      dlgP.innerHTML = '';
    }
    dlgP.addEventListener('close', cleanup);
    dlgP.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pv]');
      if (!b || !cur) return;
      var a = b.getAttribute('data-pv');
      if (a === 'close') dlgP.close();
      else if (a === 'dl' && cur.blob) app.saveBlob(cur.blob, cur.name);
      else if (a === 'up' && cur.onUpload) {
        b.disabled = true;
        Promise.resolve(cur.onUpload()).then(function (ok) { if (ok) { var m = $('#pv-msg'); if (m) m.textContent = ''; } else b.disabled = false; });
      }
    });

    /** o: {title, name, loader(signal) -> Promise<Blob>, onUpload?} */
    app.openPreview = async function (o) {
      cleanup();
      var ctrl = new AbortController();
      cur = { ctrl: ctrl, viewer: null, blob: null, name: o.name || 'preview.pdf', onUpload: o.onUpload };
      var mine = cur;
      dlgP.innerHTML = app.dlgHead('dlg-preview-title', o.title || t('preview'), 'data-pv="close"') +
        '<div class="rmx-dialog__body rmx-pv-body"><div class="rmx-pv-status responsive-body-sm" id="pv-msg" role="status"><span class="rmx-spinner"></span><span>' + esc(t('previewLoading')) + '</span></div>' +
        '<div class="rmx-pv-pages" id="pv-pages" hidden></div></div>' +
        '<div class="rmx-dialog__foot">' + app.btn(t('downloadPdf'), 'data-pv="dl" disabled', 'pdf') +
        (o.onUpload ? app.btn(t('uploadNow'), 'data-pv="up" disabled', 'primary') : '') + '</div>';
      dlgP.setAttribute('aria-labelledby', 'dlg-preview-title');
      if (!dlgP.open) dlgP.showModal();
      try {
        var blob = await o.loader(ctrl.signal);
        if (cur !== mine) return;
        mine.blob = blob;
        var host = $('#pv-pages');
        host.hidden = false;
        mine.viewer = await R.pdfview.show(host, blob);
        if (cur !== mine) { mine.viewer.destroy(); return; }
        $('#pv-msg').hidden = true;
        dlgP.querySelectorAll('[data-pv]').forEach(function (b) { b.disabled = false; });
      } catch (e) {
        if (cur !== mine || e.name === 'AbortError') return;
        $('#pv-msg').innerHTML = '<span>' + esc(t('previewFailed', { msg: e.message })) + '</span>';
        if (mine.blob) dlgP.querySelectorAll('[data-pv="dl"]').forEach(function (b) { b.disabled = false; });
      }
    };

    app.previewDocument = function (id) {
      var it = state.items.get(id);
      if (!it) return;
      app.openPreview({
        title: it.VissibleName,
        name: R.archive.sanitizeSegment(it.VissibleName) + '.pdf',
        loader: function (signal) { return app.getPdf(id, signal); }
      });
    };
    app.downloadDocument = async function (id, btn, fmt) {
      var it = state.items.get(id);
      if (!it || btn.disabled) return;
      var html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="rmx-spinner" style="width:14px;height:14px"></span><span>' + (fmt === 'rmdoc' ? 'RMDoc' : 'PDF') + '</span>';
      try {
        var blob = fmt === 'rmdoc' ? await R.api.download(id, 'rmdoc') : await app.getPdf(id);
        app.saveBlob(blob, R.archive.sanitizeSegment(it.VissibleName) + '.' + (fmt === 'rmdoc' ? 'rmdoc' : 'pdf'));
      } catch (e) { app.toast(it.VissibleName + ': ' + e.message, true); }
      btn.innerHTML = html;
      btn.disabled = false;
    };
    app.previewBlob = function (blob, name, extra) {
      app.openPreview(Object.assign({ title: name, name: name, loader: function () { return Promise.resolve(blob); } }, extra || {}));
    };

    /* ---------- details ---------- */
    var dlgD = $('#dlg-detail');
    dlgD.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dt]');
      if (!b) return;
      var a = b.getAttribute('data-dt');
      var id = dlgD.getAttribute('data-id');
      var it = state.items.get(id);
      if (a === 'close') dlgD.close();
      else if (a === 'prev') app.previewDocument(id);
      else if (a === 'sel' && it) { app.toggleSelect(id); app.openDetails(id); }
      else if (a === 'pdf' || a === 'rmdoc') {
        b.disabled = true;
        R.api.download(id, a).then(function (blob) {
          app.saveBlob(blob, R.archive.sanitizeSegment(it.VissibleName) + '.' + a);
        }).catch(function (err) { app.toast(err.message, true); }).then(function () { b.disabled = false; });
      }
    });

    var detailTok = 0;
    dlgD.addEventListener('close', function () { detailTok++; });
    app.openDetails = function (id) {
      var it = state.items.get(id);
      if (!it) return;
      var doc = !app.isFolder(it);
      var d = new Date(it.ModifiedClient);
      var rows = [
        [t('dName'), it.VissibleName],
        [t('dPath'), app.pathLabel(app.pk(it))],
        [t('dType'), app.typeLabel(it)],
        [t('dModified'), isNaN(d.getTime()) ? '' : d.toLocaleString(R.lang) + ' (' + app.ago(it.ModifiedClient) + ')']
      ];
      if (doc) {
        rows.push([t('dFav'), it.Bookmarked ? t('dYes') : t('dNo')]);
        rows.push([t('dPage'), it.CurrentPage > 0 ? String(it.CurrentPage + 1) : '1']);
        if (it.Version != null) rows.push([t('dVersion'), String(it.Version)]);
      } else {
        var lv = app.leaves(id).filter(function (x) { return !app.isFolder(state.items.get(x)); }).length;
        var sub = app.children(id).filter(app.isFolder).length;
        rows.push([t('dContains'), t('dDocs', { n: lv }) + ', ' + t('dFolders', { n: sub })]);
      }
      rows.push([t('dId'), it.ID]);
      var sel = doc ? state.selected.has(id) : false;
      dlgD.setAttribute('data-id', id);
      dlgD.innerHTML = app.dlgHead('dlg-detail-title', t('detailTitle'), 'data-dt="close"') +
        '<div class="rmx-dialog__body">' +
        (doc ? '<div class="rmx-dpv" id="dt-prev" data-dt="prev" role="button" tabindex="0" aria-label="' + esc(t('preview')) + '"><span class="rmx-spinner"></span></div>' : '') +
        '<dl class="rmx-dl">' + rows.map(function (r) {
          return '<div><dt class="responsive-body-sm rmx-muted">' + esc(r[0]) + '</dt><dd class="responsive-body-md">' + esc(r[1]) + (r[0] === t('dFav') && it.Bookmarked ? ' ' + icon('starFill', 16, 'class="rmx-starinl"') : '') + '</dd></div>';
        }).join('') + '</dl></div>' +
        (doc ? '<div class="rmx-dialog__foot rmx-foot--list">' : '<div hidden>') + (doc
          ? app.btn(t('downloadPdf'), 'data-dt="pdf"', 'pdf') + app.btn(t('downloadRmdoc'), 'data-dt="rmdoc"', 'rmdoc') +
            app.btn(sel ? t('deselect') : t('select'), 'data-dt="sel"') + app.btn(t('preview'), 'data-dt="prev"', 'primary')
          : '') + '</div>';
      dlgD.setAttribute('aria-labelledby', 'dlg-detail-title');
      if (!dlgD.open) dlgD.showModal();
      if (doc) {
        var tok = ++detailTok;
        app.getPdf(id).then(function (pdf) { return R.pdfview.firstPageCanvas(pdf, 560); }).then(function (canvas) {
          var host = $('#dt-prev');
          if (tok !== detailTok || !host) return;
          host.innerHTML = '';
          host.appendChild(canvas);
          host.classList.add('is-ready');
        }).catch(function (e) {
          var host = $('#dt-prev');
          if (tok === detailTok && host) { host.textContent = t('previewFailed', { msg: e.message }); host.classList.add('is-failed'); }
        });
      }
    };
  });
})();
