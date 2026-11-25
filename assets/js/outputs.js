/*
 * Shared pieces for "import / convert" and "PDF tools":
 *   - target folder + name-conflict fields
 *   - result list with rename, remove, thumbnail, download per file and upload all
 *   - naming options as in the export dialog (date prefix, plain characters)
 *   - upload naming: if a document with the same name already exists in the
 *     target folder, "yyyy-mm-dd name" (and "... 2", "... 3") is used, because the
 *     device interface can neither replace nor delete documents.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    const t = app.t, esc = app.esc, icon = app.icon, state = app.state;
    const out = (app.outputs = {});

    const chev = '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>';

    /** HTML of the common fields. `p` is an id prefix, `current` the preselected folder. */
    out.fieldsHtml = function (p, current, withCreate) {
      const folders = [{ id: 'root', label: t('myFiles') }];
      app.allFolderIds().forEach(function (id) { folders.push({ id: id, label: app.pathLabel(id) }); });
      folders.sort(function (a, b) { return a.id === 'root' ? -1 : b.id === 'root' ? 1 : a.label.localeCompare(b.label, R.lang, { numeric: true }); });
      const target = current === 'root' || state.items.has(current) ? current : 'root';
      return '<div class="ark-field"><label for="' + p + '-target" class="responsive-body-md" style="font-weight:600">' + esc(t('target')) + '</label>' +
        '<div class="ark-select"><select id="' + p + '-target">' + folders.map(function (f) {
          return '<option value="' + esc(f.id) + '"' + (f.id === target ? ' selected' : '') + '>' + esc(f.label) + '</option>';
        }).join('') + '</select>' + chev + '</div></div>' +
        (withCreate ? '<label class="rmx-choice" id="' + p + '-createrow" hidden><input type="checkbox" class="ark-input-checkbox" id="' + p + '-create"><span class="txt"><span class="responsive-body-md">' + esc(t('createFolders')) + '</span><small>' + esc(t('createFoldersHint')) + '</small></span></label>' : '');
    };
    out.fieldValues = function (p) {
      const c = app.$('#' + p + '-create');
      const d = app.$('#' + p + '-date'), a = app.$('#' + p + '-ascii');
      return { target: app.$('#' + p + '-target').value, create: !!(c && c.checked), datePrefix: !!(d && d.checked), ascii: !!(a && a.checked) };
    };

    /** Naming options like in the export dialog (date prefix, plain characters only). */
    out.namingFieldsHtml = function (p, vals) {
      return '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('nameTemplate')) + '</legend>' +
        '<label class="rmx-choice"><input type="checkbox" class="ark-input-checkbox" id="' + p + '-date"' + (vals.datePrefix ? ' checked' : '') + '><span class="txt"><span class="responsive-body-md">' + esc(t('datePrefix')) + '</span></span></label>' +
        '<label class="rmx-choice"><input type="checkbox" class="ark-input-checkbox" id="' + p + '-ascii"' + (vals.ascii ? ' checked' : '') + '><span class="txt"><span class="responsive-body-md">' + esc(t('asciiNames')) + '</span></span></label></fieldset>';
    };

    function cleanBase(s) { return window.RMXShared.sanitizeFilename(s); }

    /** Free name in the target folder: "Name", then "Name (1)", "Name (2)" ... (only copies are counted). */
    out.finalName = function (base, target, used) {
      base = cleanBase(base);
      const existing = new Set();
      app.children(target).forEach(function (x) { if (!app.isFolder(x)) existing.add(String(x.VissibleName).toLowerCase()); });
      used.forEach(function (u) { existing.add(u); });
      let name = base;
      if (existing.has(name.toLowerCase())) {
        const stem = base.replace(/ \(\d+\)$/, '');
        let n = 1;
        while (existing.has((stem + ' (' + n + ')').toLowerCase())) n++;
        name = stem + ' (' + n + ')';
      }
      used.add(name.toLowerCase());
      return name;
    };

    /** Page size / font size options for text, Markdown and HTML conversions. */
    out.textOptionsHtml = function (vals) {
      const scale = vals.fontScale || 1;
      return '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('textFormat')) + '</legend><div class="rmx-inline">' +
        app.choice('radio', 'tfmt', 'remarkable', t('pageRmShort'), '', vals.tfmt === 'remarkable') +
        app.choice('radio', 'tfmt', 'a4', t('pageA4'), '', vals.tfmt === 'a4') + '</div></fieldset>' +
        '<div class="rmx-field-row" id="im-fontrow">' +
        '<label for="im-fontscale" class="responsive-body-sm rmx-muted">' + esc(t('fontSize')) + '</label>' +
        '<input id="im-fontscale" type="range" min="0.6" max="2.2" step="0.05" value="' + scale + '" />' +
        '<span id="im-fontscale-val" class="rmx-value-badge">' + Math.round(scale * 100) + '%</span></div>';
    };
    out.readTextOptions = function (root, vals) {
      const tfmt = root.querySelector('input[name="tfmt"]:checked'); if (tfmt) vals.tfmt = tfmt.value;
      const fs = root.querySelector('#im-fontscale'); if (fs) vals.fontScale = parseFloat(fs.value) || 1;
      return { page: vals.tfmt, fontScale: vals.fontScale || 1 };
    };
    
    const extOf = function (n) { const m = /\.([^.]+)$/.exec(n); return m ? m[1].toLowerCase() : ''; };
    const baseOf = function (n) { return n.replace(/\.[^.]+$/, ''); };
    const fmtSize = function (b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };
    const lc = function (x) { return String(x).toLowerCase(); };

    /** Experimental: the device interface has no "new folder"; an .rmdoc with a folder metadata is tried. */
    async function createFolder(parentId, name, signal) {
      await R.load.jszip();
      const id = R.uuid();
      const zip = new window.JSZip();
      zip.file(id + '.metadata', JSON.stringify({ visibleName: name, type: 'CollectionType', parent: parentId === 'root' ? '' : parentId, version: 0, lastModified: String(Date.now()), pinned: false, synced: false, deleted: false, modified: false, metadatamodified: false }));
      zip.file(id + '.content', '{}');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      await R.api.upload(new File([blob], name + '.rmdoc'), parentId, signal);
      await app.reloadFolder(parentId);
      const kids = app.children(parentId);
      const folder = kids.find(function (x) { return app.isFolder(x) && lc(x.VissibleName) === lc(name); });
      if (folder) return { id: folder.ID };
      return { junk: kids.some(function (x) { return !app.isFolder(x) && lc(x.VissibleName) === lc(name); }) };
    }

    /** Walks `parts` below `root`; missing folders are created only if asked for (and possible). */
    async function resolveFolder(root, parts, create, signal, memo) {
      const key = root + '/' + parts.join('/');
      if (memo.cache.has(key)) return memo.cache.get(key);
      let cur = root;
      const notes = [];
      for (let i = 0; i < parts.length; i++) {
        let f = app.children(cur).find(function (x) { return app.isFolder(x) && lc(x.VissibleName) === lc(parts[i]); });
        if (!f && create && !memo.noCreate) {
          const made = await createFolder(cur, parts[i], signal);
          if (made.id) f = app.state.items.get(made.id);
          else { memo.noCreate = true; notes.push(made.junk ? t('createJunk', { name: parts[i] }) : t('createFailed')); }
        }
        if (!f) { notes.push(t('foldersMissing', { path: parts.slice(i).join('/') })); break; }
        cur = f.ID;
      }
      const res = { id: cur, notes: notes };
      memo.cache.set(key, res);
      return res;
    }

    /**
     * Same document already in the folder? Compares by name and size (the existing document is exported
     * in the same format). Returns {same} to skip, or {stem} = existing name to number from.
     */
    async function findIdentical(folderId, base, ext, blob, signal) {
      // names an existing document may have: as is, without "(2)", without a leading backup date
      const names = [];
      const push = function (n) { if (n && names.indexOf(n) < 0) names.push(n); };
      const noNum = function (n) { return n.replace(/ \(\d+\)$/, ''); };
      push(base);
      push(noNum(base));
      [base, noNum(base)].forEach(function (n) { const m = /^\d{4}-\d{2}-\d{2}[ _](.+)$/.exec(n); if (m) { push(m[1]); push(noNum(m[1])); } });
      // archives store sanitised names ("a/b: c" -> "a_b_ c"), so compare sanitised
      const key = function (n) { return lc(R.archive.sanitizeSegment(n)); };
      const docs = app.children(folderId).filter(function (d) { return !app.isFolder(d); }).map(function (d) { return { d: d, k: key(d.VissibleName) }; });
      let firstStem = null;
      let budget = 6; // existing documents that may be downloaded for the size comparison
      for (let n = 0; n < names.length; n++) {
        const stem = key(names[n]);
        const cands = docs.filter(function (x) { return x.k === stem || (x.k.indexOf(stem + ' (') === 0 && /^ \(\d+\)$/.test(x.k.slice(stem.length))); });
        if (!cands.length) continue;
        if (firstStem === null) firstStem = noNum(cands[0].d.VissibleName);
        if (ext !== 'pdf' && ext !== 'rmdoc') break; // sizes of other formats cannot be compared
        for (let c = 0; c < cands.length && budget > 0; c++, budget--) {
          const existing = await R.api.download(cands[c].d.ID, ext, signal);
          if (existing.size === blob.size) return { same: cands[c].d };
        }
      }
      if (firstStem !== null) return { stem: firstStem };
      return {};
    }

    out.createList = function (host, items, getCtx) {
      const usedBy = {};   // folder id -> names taken during this run
      const memo = { cache: new Map(), noCreate: false };
      let abort = null;
      let skipped = 0;
      const pill = function (a, ico, text, title, cls) { return '<button type="button" class="rmx-pill rmx-pill--' + cls + '" data-o="' + a + '" aria-label="' + esc(title) + '" title="' + esc(title) + '">' + icon(ico, 16) + '<span>' + esc(text) + '</span></button>'; };
      // Left next to the title: small preview; the eye badge sits inside the
      // tile and opens the PDF preview (same interaction as in the import list).
      const leadHtml = function (ext) {
        const pv = ext === 'pdf';
        return '<div class="olead' + (pv ? '" data-o="pv" role="button" tabindex="0" aria-label="' + esc(t('preview')) + '" title="' + esc(t('preview')) : '') + '">' +
          (pv ? '<span class="othumb" hidden></span>' : '<span class="ofallback">' + icon('notebook', 26) + '</span>') +
          '<span class="obadge">' + icon(pv ? 'eye' : 'notebook', 13) + '</span></div>';
      };
      // Result row: left preview + type icon, right the (long, wrapping) title;
      // below it size and actions as a bottom panel.
      const rowHtml = function (it, i) {
        const ext = extOf(it.name);
        const dlText = ext === 'pdf' ? 'PDF' : ext === 'rmdoc' ? 'RMDoc' : ext.toUpperCase();
        const dlTitle = ext === 'pdf' ? t('downloadPdf') : ext === 'rmdoc' ? t('downloadRmdoc') : t('download') + ' ' + dlText;
        const rmTitle = t('remove') + ': ' + baseOf(it.name);
        return '<li data-i="' + i + '" data-ext="' + esc(ext) + '" data-state="idle"><div class="orow">' +
          leadHtml(ext) +
          '<div class="obody">' +
          '<div class="opanel opanel--top">' +
          '<div class="oname"><input type="text" class="ark-input" value="' + esc(baseOf(it.name)) + '" aria-label="' + esc(t('renameField')) + '" spellcheck="false" autocomplete="off"></div>' +
          '</div>' +
          '<div class="opanel opanel--bot">' +
          '<span class="osize rmx-muted responsive-body-sm">' + esc(fmtSize(it.blob.size)) + '</span>' +
          '<span class="rmx-flex"></span>' +
          pill('dl', 'importIcon', dlText, dlTitle, ext === 'pdf' ? 'pdf' : ext === 'rmdoc' ? 'rmdoc' : 'plain') +
          '<button type="button" class="rmx-iconbtn rmx-iconbtn--danger" data-o="rm" aria-label="' + esc(rmTitle) + '" title="' + esc(rmTitle) + '">' + icon('trash', 20) + '</button>' +
          '</div></div></div>' +
          (it.folderPath && it.folderPath.length ? '<div class="opath responsive-body-sm rmx-muted">' + icon('folderFull', 16) + '<span>' + esc(it.folderPath.join(' / ')) + '</span></div>' : '') +
          '<div class="state responsive-body-sm"></div></li>';
      };
      const paintThumb = function (anchor, blob) {
        if (!anchor || !R.pdfview || !R.pdfview.firstPageCanvas) return;
        R.pdfview.firstPageCanvas(blob, 128).then(function (canvas) {
          canvas.className = 'rmx-thumb';
          anchor.hidden = false;
          anchor.innerHTML = '';
          anchor.appendChild(canvas);
        }).catch(function () { /* no preview for this file */ });
      };
      host.innerHTML = '<ul class="rmx-files rmx-outs">' + items.map(rowHtml).join('') + '</ul>';
      const listEl = host.querySelector('ul');
      const li = function (i) { return host.querySelector('li[data-i="' + i + '"]'); };
      items.forEach(function (it, i) {
        if (extOf(it.name) === 'pdf') paintThumb(li(i).querySelector('.othumb'), it.blob);
      });
      const nameOf = function (i) {
        const inp = li(i).querySelector('input');
        return cleanBase(inp.value) + '.' + extOf(items[i].name);
      };
      const setState = function (i, st, text, ico) {
        const el = li(i);
        el.setAttribute('data-state', st);
        el.querySelector('.state').innerHTML = (ico ? icon(ico, 18) : (st === 'working' ? '<span class="rmx-spinner" style="width:16px;height:16px"></span>' : '')) + (text ? '<span>' + esc(text) + '</span>' : '');
      };

      const ctrl = {
        get count() { return items.length; },
        removeItem: function (i) {
          items.splice(i, 1);
          const doomed = host.querySelector('li[data-i="' + i + '"]');
          if (doomed) doomed.remove();
          Array.prototype.forEach.call(host.querySelectorAll('li[data-i]'), function (el) {
            const n = parseInt(el.getAttribute('data-i'), 10);
            if (n > i) el.setAttribute('data-i', String(n - 1));
          });
        },
        get skipped() { return skipped; },
        abort: function () { if (abort) abort.abort(); },
        nameOf: nameOf,
        addBatch: function (additions) {
          additions.forEach(function (o) {
            const i = items.length;
            items.push(o);
            if (listEl) {
              listEl.insertAdjacentHTML('beforeend', rowHtml(o, i));
              if (extOf(o.name) === 'pdf') paintThumb(li(i).querySelector('.othumb'), o.blob);
            }
          });
        },
        async uploadOne(i) {
          const ctx = getCtx();
          const item = items[i];
          if (item._uploaded) return true;
          if (!abort || abort.signal.aborted) abort = new AbortController();
          const signal = abort.signal;
          try {
            setState(i, 'working', t('uploading'));
            // 1) target folder (archives keep their folder structure)
            let folder = ctx.target, notes = [];
            if (item.folderPath && item.folderPath.length) {
              const r = await resolveFolder(ctx.target, item.folderPath, ctx.create, signal, memo);
              folder = r.id; notes = r.notes;
            }
            await app.reloadFolder(folder);
            const ext = extOf(item.name);
            let base = baseOf(nameOf(i));
            // naming options like in the export dialog
            if (ctx.ascii) base = app.asciiName(base);
            if (ctx.datePrefix) base = app.ymd(new Date()) + ' ' + base;
            // 2) archive entries: identical documents are skipped, different ones are numbered
            if (item.fromArchive) {
              const found = await findIdentical(folder, cleanBase(base), ext, item.blob, signal);
              if (found.same) {
                item._uploaded = true; skipped++;
                setState(i, 'done', t('skippedSame', { name: found.same.VissibleName }), 'check');
                return true;
              }
              if (found.stem) base = found.stem;
            }
            const used = usedBy[folder] || (usedBy[folder] = new Set());
            const name = out.finalName(base, folder, used);
            const type = ext === 'pdf' ? 'application/pdf'
              : ext === 'epub' ? 'application/epub+zip'
              : (item.blob.type || 'application/octet-stream');
            const data = ext === 'rmdoc' ? await R.rmdoc.rename(item.blob, name) : item.blob;
            await R.api.upload(new File([data], name + '.' + ext, { type: type }), folder, signal);
            item._uploaded = true;
            setState(i, 'done', t('uploadedAs', { name: name }) + (notes.length ? ' · ' + notes.join(' ') : ''), 'check');
            return true;
          } catch (e) {
            if (e.name === 'AbortError') setState(i, 'error', t('cancel'), 'warn');
            else { console.error(e); setState(i, 'error', t('importFailed', { msg: e.message }), 'warn'); }
            return false;
          }
        },
        async uploadAll() {
          let ok = 0;
          for (let i = 0; i < items.length; i++) {
            if (abort && abort.signal.aborted) break;
            if (await ctrl.uploadOne(i)) ok++;
          }
          await app.reloadFolder(getCtx().target);
          return ok;
        }
      };

      host.addEventListener('click', function (e) {
        const b = e.target.closest('[data-o]');
        if (!b) return;
        const i = parseInt(b.closest('li').getAttribute('data-i'), 10);
        const a = b.getAttribute('data-o');
        if (a === 'dl') app.saveBlob(items[i].blob, nameOf(i));
        else if (a === 'pv') app.previewBlob(items[i].blob, nameOf(i));
        else if (a === 'rm') ctrl.removeItem(i);
      });
      host.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const pv = e.target.closest ? e.target.closest('[data-o="pv"]') : null;
        if (!pv) return;
        e.preventDefault();
        const i = parseInt(pv.closest('li').getAttribute('data-i'), 10);
        app.previewBlob(items[i].blob, nameOf(i));
      });
      return ctrl;
    };
  });
})();
