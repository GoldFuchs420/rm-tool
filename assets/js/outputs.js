/*
 * Shared pieces for "import / convert" and "PDF tools":
 *   - target folder + name-conflict fields
 *   - result list with rename, remove, download per file and upload all
 *   - upload naming: if a document with the same name already exists in the
 *     target folder, "yyyy-mm-dd name" (and "... 2", "... 3") is used, because the
 *     device interface can neither replace nor delete documents.
 */
(function () {
  'use strict';
  var R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    var t = app.t, esc = app.esc, icon = app.icon, state = app.state;
    var out = (app.outputs = {});

    var chev = '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>';

    /** HTML of the common fields. `p` is an id prefix, `current` the preselected folder. */
    out.fieldsHtml = function (p, current, withCreate) {
      var folders = [{ id: 'root', label: t('myFiles') }];
      app.allFolderIds().forEach(function (id) { folders.push({ id: id, label: app.pathLabel(id) }); });
      folders.sort(function (a, b) { return a.id === 'root' ? -1 : b.id === 'root' ? 1 : a.label.localeCompare(b.label, R.lang, { numeric: true }); });
      var target = current === 'root' || state.items.has(current) ? current : 'root';
      return '<div class="ark-field"><label for="' + p + '-target" class="responsive-body-md" style="font-weight:600">' + esc(t('target')) + '</label>' +
        '<div class="ark-select"><select id="' + p + '-target">' + folders.map(function (f) {
          return '<option value="' + esc(f.id) + '"' + (f.id === target ? ' selected' : '') + '>' + esc(f.label) + '</option>';
        }).join('') + '</select>' + chev + '</div></div>' +
        (withCreate ? '<label class="rmx-choice" id="' + p + '-createrow" hidden><input type="checkbox" class="ark-input-checkbox" id="' + p + '-create"><span class="txt"><span class="responsive-body-md">' + esc(t('createFolders')) + '</span><small>' + esc(t('createFoldersHint')) + '</small></span></label>' : '');
    };
    out.fieldValues = function (p) {
      var c = app.$('#' + p + '-create');
      return { target: app.$('#' + p + '-target').value, create: !!(c && c.checked) };
    };

    function cleanBase(s) { return window.RMXShared.sanitizeFilename(s); }

    /** Free name in the target folder: "Name", then "Name (1)", "Name (2)" ... (only copies are counted). */
    out.finalName = function (base, target, used) {
      base = cleanBase(base);
      var existing = new Set();
      app.children(target).forEach(function (x) { if (!app.isFolder(x)) existing.add(String(x.VissibleName).toLowerCase()); });
      used.forEach(function (u) { existing.add(u); });
      var name = base;
      if (existing.has(name.toLowerCase())) {
        var stem = base.replace(/ \(\d+\)$/, '');
        var n = 1;
        while (existing.has((stem + ' (' + n + ')').toLowerCase())) n++;
        name = stem + ' (' + n + ')';
      }
      used.add(name.toLowerCase());
      return name;
    };

    /** Page size / font size options for text, Markdown and HTML conversions. */
    out.textOptionsHtml = function (vals) {
      return '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('textFormat')) + '</legend><div class="rmx-inline">' +
        app.choice('radio', 'tfmt', 'remarkable', t('pageRmShort'), '', vals.tfmt === 'remarkable') +
        app.choice('radio', 'tfmt', 'a4', t('pageA4'), '', vals.tfmt === 'a4') + '</div></fieldset>' +
        '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('fontSize')) + '</legend><div class="rmx-inline">' +
        app.choice('radio', 'tfont', 'normal', t('fontNormal'), '', vals.tfont === 'normal') +
        app.choice('radio', 'tfont', 'large', t('fontLarge'), '', vals.tfont === 'large') + '</div></fieldset>';
    };
    out.readTextOptions = function (root, vals) {
      ['tfmt', 'tfont'].forEach(function (n) { var el = root.querySelector('input[name="' + n + '"]:checked'); if (el) vals[n] = el.value; });
      return { page: vals.tfmt, fontScale: vals.tfont === 'large' ? 1.23 : 1 };
    };

    var extOf = function (n) { var m = /\.([^.]+)$/.exec(n); return m ? m[1].toLowerCase() : ''; };
    var baseOf = function (n) { return n.replace(/\.[^.]+$/, ''); };
    var fmtSize = function (b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };
    var lc = function (x) { return String(x).toLowerCase(); };

    /** Experimental: the device interface has no "new folder"; an .rmdoc with a folder metadata is tried. */
    async function createFolder(parentId, name, signal) {
      await R.load.jszip();
      var id = R.uuid();
      var zip = new window.JSZip();
      zip.file(id + '.metadata', JSON.stringify({ visibleName: name, type: 'CollectionType', parent: parentId === 'root' ? '' : parentId, version: 0, lastModified: String(Date.now()), pinned: false, synced: false, deleted: false, modified: false, metadatamodified: false }));
      zip.file(id + '.content', '{}');
      var blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      await R.api.upload(new File([blob], name + '.rmdoc'), parentId, signal);
      await app.reloadFolder(parentId);
      var kids = app.children(parentId);
      var folder = kids.find(function (x) { return app.isFolder(x) && lc(x.VissibleName) === lc(name); });
      if (folder) return { id: folder.ID };
      return { junk: kids.some(function (x) { return !app.isFolder(x) && lc(x.VissibleName) === lc(name); }) };
    }

    /** Walks `parts` below `root`; missing folders are created only if asked for (and possible). */
    async function resolveFolder(root, parts, create, signal, memo) {
      var key = root + '/' + parts.join('/');
      if (memo.cache.has(key)) return memo.cache.get(key);
      var cur = root, notes = [];
      for (var i = 0; i < parts.length; i++) {
        var f = app.children(cur).find(function (x) { return app.isFolder(x) && lc(x.VissibleName) === lc(parts[i]); });
        if (!f && create && !memo.noCreate) {
          var made = await createFolder(cur, parts[i], signal);
          if (made.id) f = app.state.items.get(made.id);
          else { memo.noCreate = true; notes.push(made.junk ? t('createJunk', { name: parts[i] }) : t('createFailed')); }
        }
        if (!f) { notes.push(t('foldersMissing', { path: parts.slice(i).join('/') })); break; }
        cur = f.ID;
      }
      var res = { id: cur, notes: notes };
      memo.cache.set(key, res);
      return res;
    }

    /**
     * Same document already in the folder? Compares by name and size (the existing document is exported
     * in the same format). Returns {same} to skip, or {stem} = existing name to number from.
     */
    async function findIdentical(folderId, base, ext, blob, signal) {
      // names an existing document may have: as is, without "(2)", without a leading backup date
      var names = [];
      var push = function (n) { if (n && names.indexOf(n) < 0) names.push(n); };
      var noNum = function (n) { return n.replace(/ \(\d+\)$/, ''); };
      push(base);
      push(noNum(base));
      [base, noNum(base)].forEach(function (n) { var m = /^\d{4}-\d{2}-\d{2}[ _](.+)$/.exec(n); if (m) { push(m[1]); push(noNum(m[1])); } });
      // archives store sanitised names ("a/b: c" -> "a_b_ c"), so compare sanitised
      var key = function (n) { return lc(R.archive.sanitizeSegment(n)); };
      var docs = app.children(folderId).filter(function (d) { return !app.isFolder(d); }).map(function (d) { return { d: d, k: key(d.VissibleName) }; });
      var firstStem = null;
      var budget = 6; // existing documents that may be downloaded for the size comparison
      for (var n = 0; n < names.length; n++) {
        var stem = key(names[n]);
        var cands = docs.filter(function (x) { return x.k === stem || (x.k.indexOf(stem + ' (') === 0 && /^ \(\d+\)$/.test(x.k.slice(stem.length))); });
        if (!cands.length) continue;
        if (firstStem === null) firstStem = noNum(cands[0].d.VissibleName);
        if (ext !== 'pdf' && ext !== 'rmdoc') break; // sizes of other formats cannot be compared
        for (var c = 0; c < cands.length && budget > 0; c++, budget--) {
          var existing = await R.api.download(cands[c].d.ID, ext, signal);
          if (existing.size === blob.size) return { same: cands[c].d };
        }
      }
      if (firstStem !== null) return { stem: firstStem };
      return {};
    }

    out.createList = function (host, items, getCtx) {
      var usedBy = {};   // folder id -> names taken during this run
      var memo = { cache: new Map(), noCreate: false };
      var abort = null;
      var uploaded = {};
      var skipped = 0;
      host.innerHTML = '<ul class="rmx-files rmx-outs">' + items.map(function (it, i) {
        var ext = extOf(it.name);
        var pill = function (a, ico, text, title, cls) { return '<button type="button" class="rmx-pill rmx-pill--' + cls + '" data-o="' + a + '" aria-label="' + esc(title) + '" title="' + esc(title) + '">' + icon(ico, 16) + '<span>' + esc(text) + '</span></button>'; };
        var dlText = ext === 'pdf' ? 'PDF' : ext === 'rmdoc' ? 'RMDoc' : ext.toUpperCase();
        var dlTitle = ext === 'pdf' ? t('downloadPdf') : ext === 'rmdoc' ? t('downloadRmdoc') : t('download') + ' ' + dlText;
        // Größe ganz links, Buttons (Vorschau/Download/Upload) rechts
        // gruppiert in .obtns – reines Flexbox-Wrapping statt starrer
        // nth-child-Grid-Positionen, damit auf schmalen (mobilen)
        // Breiten nichts überlappt, sondern sauber umbricht.
        return '<li data-i="' + i + '" data-ext="' + esc(ext) + '" data-state="idle"><div class="orow">' +
          '<span class="osize rmx-muted responsive-body-sm">' + esc(fmtSize(it.blob.size)) + '</span>' +
          icon(ext === 'pdf' ? 'pdf' : 'notebook', 24) +
          '<div class="oname"><input type="text" class="ark-input" value="' + esc(baseOf(it.name)) + '" aria-label="' + esc(t('renameField')) + '" spellcheck="false" autocomplete="off"></div>' +
          '<div class="obtns">' +
          pill('dl', 'importIcon', dlText, dlTitle, ext === 'pdf' ? 'pdf' : ext === 'rmdoc' ? 'rmdoc' : 'plain') +
          '<button type="button" class="rmx-iconbtn" data-o="rm" aria-label="' + esc(t('remove')) + ': ' + esc(baseOf(it.name)) + '" title="' + esc(t('remove')) + ': ' + esc(baseOf(it.name)) + '">' + icon('close', 20) + '</button>' +
          '</div></div>' +
          (it.folderPath && it.folderPath.length ? '<div class="opath responsive-body-sm rmx-muted">' + icon('folderFull', 16) + '<span>' + esc(it.folderPath.join(' / ')) + '</span></div>' : '') +
          '<div class="state responsive-body-sm"></div></li>';
      }).join('') + '</ul>';

      var li = function (i) { return host.querySelector('li[data-i="' + i + '"]'); };
      var nameOf = function (i) {
        var inp = li(i).querySelector('input');
        return cleanBase(inp.value) + '.' + extOf(items[i].name);
      };
      var setState = function (i, st, text, ico) {
        var el = li(i);
        el.setAttribute('data-state', st);
        el.querySelector('.state').innerHTML = (ico ? icon(ico, 18) : (st === 'working' ? '<span class="rmx-spinner" style="width:16px;height:16px"></span>' : '')) + (text ? '<span>' + esc(text) + '</span>' : '');
      };

      var ctrl = {
        get count() { return items.length; },
        removeItem: function (i) {
          items.splice(i, 1);
          var doomed = host.querySelector('li[data-i="' + i + '"]');
          if (doomed) doomed.remove();
          Array.prototype.forEach.call(host.querySelectorAll('li[data-i]'), function (el) {
            var n = parseInt(el.getAttribute('data-i'), 10);
            if (n > i) el.setAttribute('data-i', String(n - 1));
          });
        },
        get skipped() { return skipped; },
        abort: function () { if (abort) abort.abort(); },
        nameOf: nameOf,
        async uploadOne(i) {
          if (uploaded[i]) return true;
          var ctx = getCtx();
          var item = items[i];
          if (!abort || abort.signal.aborted) abort = new AbortController();
          var signal = abort.signal;
          try {
            setState(i, 'working', t('uploading'));
            // 1) target folder (archives keep their folder structure)
            var folder = ctx.target, notes = [];
            if (item.folderPath && item.folderPath.length) {
              var r = await resolveFolder(ctx.target, item.folderPath, ctx.create, signal, memo);
              folder = r.id; notes = r.notes;
            }
            await app.reloadFolder(folder);
            var ext = extOf(item.name);
            var base = baseOf(nameOf(i));
            // 2) archive entries: identical documents are skipped, different ones are numbered
            if (item.fromArchive) {
              var found = await findIdentical(folder, cleanBase(base), ext, item.blob, signal);
              if (found.same) {
                uploaded[i] = true; skipped++;
                setState(i, 'done', t('skippedSame', { name: found.same.VissibleName }), 'check');
                return true;
              }
              if (found.stem) base = found.stem;
            }
            var used = usedBy[folder] || (usedBy[folder] = new Set());
            var name = out.finalName(base, folder, used);
            var type = ext === 'pdf' ? 'application/pdf' : (item.blob.type || 'application/octet-stream');
            var data = ext === 'rmdoc' ? await R.rmdoc.rename(item.blob, name) : item.blob;
            await R.api.upload(new File([data], name + '.' + ext, { type: type }), folder, signal);
            uploaded[i] = true;
            setState(i, 'done', t('uploadedAs', { name: name }) + (notes.length ? ' · ' + notes.join(' ') : ''), 'check');
            return true;
          } catch (e) {
            if (e.name === 'AbortError') setState(i, 'error', t('cancel'), 'warn');
            else { console.error(e); setState(i, 'error', t('importFailed', { msg: e.message }), 'warn'); }
            return false;
          }
        },
        async uploadAll() {
          var ok = 0;
          for (var i = 0; i < items.length; i++) {
            if (abort && abort.signal.aborted) break;
            if (await ctrl.uploadOne(i)) ok++;
          }
          await app.reloadFolder(getCtx().target);
          return ok;
        }
      };

      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-o]');
        if (!b) return;
        var i = parseInt(b.closest('li').getAttribute('data-i'), 10);
        var a = b.getAttribute('data-o');
        if (a === 'dl') app.saveBlob(items[i].blob, nameOf(i));
        else if (a === 'rm') ctrl.removeItem(i);
      });
      return ctrl;
    };
  });
})();
