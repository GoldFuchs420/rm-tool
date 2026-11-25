/*
 * Preview (PDF in an embedded viewer) and details dialog.
 *  - documents on the device: the device renders /download/{id}/pdf
 *  - generated files: the blob is shown before upload
 *  - downloads live only in the file list and the import upload list,
 *    the preview shows and nothing else
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    const t = app.t, esc = app.esc, icon = app.icon, $ = app.$, state = app.state;

    /* small LRU of downloaded PDFs: details, preview and thumbnails share one download */
    const pdfCache = new Map();
    app.getPdf = async function (id, signal, opts) {
      const it = state.items.get(id);
      const key = id + '|' + (it ? it.ModifiedClient : '') + '|' + (it && it.Version != null ? it.Version : '');
      if (pdfCache.has(key)) { const hit = pdfCache.get(key); pdfCache.delete(key); pdfCache.set(key, hit); return hit; }
      const blob = await R.api.download(id, 'pdf', signal, { low: !!(opts && opts.low) });
      pdfCache.set(key, blob);
      if (pdfCache.size > 4) pdfCache.delete(pdfCache.keys().next().value);
      return blob;
    };

    /* ---------- preview ---------- */
    let cur = null;
    const dlgP = $('#dlg-preview');

    function cleanup() {
      if (!cur) return;
      cur.ctrl.abort();
      if (cur.viewer) cur.viewer.destroy();
      cur = null;
      dlgP.innerHTML = '';
    }
    dlgP.addEventListener('close', cleanup);
    dlgP.addEventListener('click', function (e) {
      const b = e.target.closest('[data-pv]');
      if (b && cur && b.getAttribute('data-pv') === 'close') dlgP.close();
    });
    dlgP.addEventListener('input', function (e) {
      if (e.target.id !== 'pv-fontscale') return;
      const scale = parseFloat(e.target.value) || 1;
      const val = $('#pv-fontscale-val');
      if (val) val.textContent = Math.round(scale * 100) + '%';
      e.target.style.setProperty('--fill', (((scale - 0.6) / 1.6) * 100) + '%');
    });
    dlgP.addEventListener('change', async function (e) {
      if (e.target.id !== 'pv-fontscale' || !cur || !cur.onFontChange) return;
      const mine = cur;
      const scale = parseFloat(e.target.value) || 1;
      const slider = e.target;
      const spin = $('#pv-font-spin');
      slider.disabled = true;
      if (spin) spin.hidden = false;
      try {
        const blob = await mine.onFontChange(scale);
        if (cur !== mine) return;
        mine.scale = scale;
        if (mine.viewer) mine.viewer.destroy();
        mine.viewer = await R.pdfview.show($('#pv-pages'), blob);
      } catch (err) {
        if (cur === mine) app.toast(t('importFailed', { msg: err.message }), true);
      } finally {
        if (cur === mine) {
          const pct = ((mine.scale - 0.6) / 1.6) * 100;
          slider.value = String(mine.scale);
          slider.style.setProperty('--fill', pct + '%');
          const val = $('#pv-fontscale-val');
          if (val) val.textContent = Math.round(mine.scale * 100) + '%';
          slider.disabled = false;
          if (spin) spin.hidden = true;
        }
      }
    });

    /** o: {title, name, loader(signal) -> Promise<Blob>} */
    app.openPreview = async function (o) {
      cleanup();
      const ctrl = new AbortController();
      cur = { ctrl: ctrl, viewer: null, name: o.name || 'preview.pdf', onFontChange: o.onFontChange, scale: o.fontScale || 1 };
      const mine = cur;
      const startScale = o.fontScale || 1;
      const startPct = ((startScale - 0.6) / 1.6) * 100;
      const fontRow = o.onFontChange
        ? '<div class="rmx-pv-font"><label for="pv-fontscale" class="responsive-body-sm rmx-muted">' + esc(t('fontSize')) + '</label>' +
          '<input id="pv-fontscale" class="rmx-scale-slider" type="range" min="0.6" max="2.2" step="0.05" value="' + startScale + '" style="--fill:' + startPct + '%">' +
          '<span id="pv-fontscale-val" class="rmx-value-badge">' + Math.round(startScale * 100) + '%</span>' +
          '<span class="rmx-spinner rmx-inline-spin" id="pv-font-spin" hidden></span></div>'
        : '';
      dlgP.innerHTML = app.dlgHead('dlg-preview-title', o.title || t('preview'), 'data-pv="close"') +
        '<div class="rmx-dialog__body rmx-pv-body"><div class="rmx-pv-status responsive-body-sm" id="pv-msg" role="status"><span class="rmx-spinner"></span><span>' + esc(t('previewLoading')) + '</span></div>' +
        '<div class="rmx-pv-pages" id="pv-pages" hidden></div>' + fontRow + '</div>';
      dlgP.setAttribute('aria-labelledby', 'dlg-preview-title');
      if (!dlgP.open) dlgP.showModal();
      try {
        const blob = await o.loader(ctrl.signal);
        if (cur !== mine) return;
        const host = $('#pv-pages');
        host.hidden = false;
        mine.viewer = await R.pdfview.show(host, blob);
        if (cur !== mine) { mine.viewer.destroy(); return; }
        $('#pv-msg').hidden = true;
      } catch (e) {
        if (cur !== mine || e.name === 'AbortError') return;
        $('#pv-msg').innerHTML = '<span>' + esc(t('previewFailed', { msg: e.message })) + '</span>';
      }
    };

    app.previewDocument = function (id) {
      const it = state.items.get(id);
      if (!it) return;
      app.openPreview({
        title: it.VissibleName,
        name: R.archive.sanitizeSegment(it.VissibleName) + '.pdf',
        loader: function (signal) { return app.getPdf(id, signal); }
      });
    };
    app.downloadDocument = async function (id, btn, fmt) {
      const it = state.items.get(id);
      if (!it || btn.disabled) return;
      const html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="rmx-spinner" style="width:14px;height:14px"></span><span>' + (fmt === 'rmdoc' ? 'RMDoc' : 'PDF') + '</span>';
      try {
        const blob = fmt === 'rmdoc' ? await R.api.download(id, 'rmdoc') : await app.getPdf(id);
        app.saveBlob(blob, R.archive.sanitizeSegment(it.VissibleName) + '.' + (fmt === 'rmdoc' ? 'rmdoc' : 'pdf'));
      } catch (e) { app.toast(it.VissibleName + ': ' + e.message, true); }
      btn.innerHTML = html;
      btn.disabled = false;
    };
    app.previewBlob = function (blob, name, extra) {
      app.openPreview(Object.assign({ title: name, name: name, loader: function () { return Promise.resolve(blob); } }, extra || {}));
    };

    /* ---------- details ---------- */
    const dlgD = $('#dlg-detail');
    dlgD.addEventListener('click', function (e) {
      const b = e.target.closest('[data-dt]');
      if (!b) return;
      const a = b.getAttribute('data-dt');
      if (a === 'close') dlgD.close();
      else if (a === 'prev') app.previewDocument(dlgD.getAttribute('data-id'));
    });

    let detailTok = 0;
    dlgD.addEventListener('close', function () { detailTok++; });
    app.openDetails = function (id) {
      const it = state.items.get(id);
      if (!it) return;
      const doc = !app.isFolder(it);
      const d = new Date(it.ModifiedClient);
      const rows = [
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
        const lv = app.leaves(id).filter(function (x) { return !app.isFolder(state.items.get(x)); }).length;
        const sub = app.children(id).filter(app.isFolder).length;
        rows.push([t('dContains'), t('dDocs', { n: lv }) + ', ' + t('dFolders', { n: sub })]);
      }
      rows.push([t('dId'), it.ID]);
      dlgD.setAttribute('data-id', id);
      dlgD.innerHTML = app.dlgHead('dlg-detail-title', t('detailTitle'), 'data-dt="close"') +
        '<div class="rmx-dialog__body">' +
        (doc ? '<div class="rmx-dpv" id="dt-prev" data-dt="prev" role="button" tabindex="0" aria-label="' + esc(t('preview')) + '"><span class="rmx-spinner"></span></div>' : '') +
        '<dl class="rmx-dl">' + rows.map(function (r) {
          return '<div><dt class="responsive-body-sm rmx-muted">' + esc(r[0]) + '</dt><dd class="responsive-body-md">' + esc(r[1]) + (r[0] === t('dFav') && it.Bookmarked ? ' ' + icon('starFill', 16, 'class="rmx-starinl"') : '') + '</dd></div>';
        }).join('') + '</dl></div>';
      dlgD.setAttribute('aria-labelledby', 'dlg-detail-title');
      if (!dlgD.open) dlgD.showModal();
      if (doc) {
        const tok = ++detailTok;
        app.getPdf(id).then(function (pdf) { return R.pdfview.firstPageCanvas(pdf, 560); }).then(function (canvas) {
          const host = $('#dt-prev');
          if (tok !== detailTok || !host) return;
          host.innerHTML = '';
          host.appendChild(canvas);
          /* Augen-Badge als Klick-Hinweis: das Bild ist die Vorschau */
          const hint = document.createElement('span');
          hint.className = 'rmx-dpv-eye';
          hint.setAttribute('aria-hidden', 'true');
          hint.innerHTML = icon('eye', 16);
          host.appendChild(hint);
          host.classList.add('is-ready');
        }).catch(function (e) {
          const host = $('#dt-prev');
          if (tok === detailTok && host) { host.textContent = t('previewFailed', { msg: e.message }); host.classList.add('is-failed'); }
        });
      }
    };
  });
})();
