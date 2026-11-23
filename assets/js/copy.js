/*
 * Copy selected documents into the folder they are in ("Name (1)", "Name (2)", ...).
 * The document is downloaded as .rmdoc (keeps handwriting) and uploaded again.
 */
(function () {
  'use strict';
  var R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    var t = app.t, esc = app.esc, icon = app.icon, $ = app.$, state = app.state;
    var dlg = $('#dlg-copy');
    var abort = null;
    var running = false;

    app.copySelected = async function () {
      var docs = Array.from(state.selected).map(function (id) { return state.items.get(id); }).filter(function (it) { return it && !app.isFolder(it); });
      if (!docs.length || dlg.open) return;
      dlg.innerHTML = app.dlgHead('dlg-copy-title', t('copyTitle'), 'data-cp="close"') +
        '<div class="rmx-dialog__body"><ul class="rmx-files rmx-copies">' + docs.map(function (it, i) {
          return '<li data-i="' + i + '" data-state="idle"><div class="orow">' + icon(String(it.fileType).toLowerCase() === 'pdf' ? 'pdf' : 'notebook', 24) +
            '<span class="fname responsive-body-sm">' + esc(it.VissibleName) + '</span></div><div class="state responsive-body-sm"></div></li>';
        }).join('') + '</ul><div id="cp-summary" class="responsive-body-sm" aria-live="polite" hidden></div></div>' +
        '<div class="rmx-dialog__foot">' + app.btn(t('cancel'), 'data-cp="stop" id="cp-btn"') + '</div>';
      dlg.setAttribute('aria-labelledby', 'dlg-copy-title');
      dlg.showModal();

      abort = new AbortController();
      running = true;
      var used = {};
      var refreshed = {};
      var parents = {};
      var ok = 0;
      var set = function (i, st, text, ico) {
        var li = dlg.querySelector('li[data-i="' + i + '"]');
        li.setAttribute('data-state', st);
        li.querySelector('.state').innerHTML = (ico ? icon(ico, 18) : (st === 'working' ? '<span class="rmx-spinner" style="width:16px;height:16px"></span>' : '')) + '<span>' + esc(text) + '</span>';
      };
      for (var i = 0; i < docs.length && !abort.signal.aborted; i++) {
        var it = docs[i];
        var parent = app.pk(it);
        try {
          set(i, 'working', t('copyLoading'));
          var blob = await R.api.download(it.ID, 'rmdoc', abort.signal);
          if (!refreshed[parent]) { await app.reloadFolder(parent); refreshed[parent] = true; used[parent] = new Set(); }
          var name = app.outputs.finalName(it.VissibleName, parent, used[parent]);
          set(i, 'working', t('uploading'));
          var renamed = await R.rmdoc.rename(blob, name);
          await R.api.upload(new File([renamed], name + '.rmdoc', { type: 'application/octet-stream' }), parent, abort.signal);
          parents[parent] = true;
          ok++;
          set(i, 'done', t('copiedAs', { name: name }), 'check');
        } catch (e) {
          if (e.name === 'AbortError') { set(i, 'error', t('cancel'), 'warn'); break; }
          console.error(e);
          set(i, 'error', t('importFailed', { msg: e.message }), 'warn');
        }
      }
      running = false;
      for (var p in parents) await app.reloadFolder(p);
      var sum = $('#cp-summary');
      sum.hidden = false;
      sum.textContent = t('importDone', { ok: ok, n: docs.length });
      $('#cp-btn').hidden = true;
    };

    dlg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cp]');
      if (!b) return;
      if (b.getAttribute('data-cp') === 'stop') { if (abort) abort.abort(); return; }
      if (running) { abort.abort(); return; }
      dlg.close();
    });
    dlg.addEventListener('cancel', function (e) { if (running) { e.preventDefault(); abort.abort(); } });
  });
})();
