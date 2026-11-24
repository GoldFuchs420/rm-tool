/*
 * Optional thumbnails of the first page, shown instead of the file type text.
 *  - only visible rows are loaded (IntersectionObserver), one at a time, background priority
 *  - thumbnails are canvases that are drawn directly, pixels are never read back, so browsers with
 *    fingerprint protection show them correctly
 *  - persistent cache (IndexedDB, keyed by id + modified date) only if the browser allows reading
 *    canvas data reliably; otherwise they are kept in memory for the session
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});
  R.features = R.features || [];
  R.features.push(function (app) {
    const esc = app.esc, state = app.state;
    const HEIGHT = 112;                 // px, ~1.75x display height
    const mem = new Map();              // key -> canvas | 'fail'
    let pending = [];                 // ids, newest last
    const queued = new Set();
    let running = false;
    let ctrl = null;
    let io = null;
    let dbp = null;

    const keyOf = function (it) { return it.ID + '|' + it.ModifiedClient + '|' + (it.Version == null ? '' : it.Version); };
    const sel = function (id) { return id.replace(/"/g, '\\"'); };

    function db() {
      if (!dbp) {
        dbp = new Promise(function (resolve) {
          try {
            const rq = indexedDB.open('rmx-thumbs', 1);
            rq.onupgradeneeded = function () { rq.result.createObjectStore('t'); };
            rq.onsuccess = function () { resolve(rq.result); };
            rq.onerror = function () { resolve(null); };
          } catch (e) { resolve(null); }
        });
      }
      return dbp;
    }
    function idbGet(key) {
      return db().then(function (d) {
        if (!d) return null;
        return new Promise(function (resolve) {
          try {
            const rq = d.transaction('t').objectStore('t').get(key);
            rq.onsuccess = function () { resolve(rq.result || null); };
            rq.onerror = function () { resolve(null); };
          } catch (e) { resolve(null); }
        });
      });
    }
    function idbPut(key, blob) {
      return db().then(function (d) { if (d) try { d.transaction('t', 'readwrite').objectStore('t').put(blob, key); } catch (e) { /* ignore */ } });
    }
    function remember(key, v) {
      mem.set(key, v);
      if (mem.size > 300) mem.delete(mem.keys().next().value); // keep memory bounded
    }

    /** HTML for the type cell of a document row. */
    app.thumbHtml = function (it) {
      const v = mem.get(keyOf(it));
      if (v === 'fail') return '<p class="responsive-body-sm">' + esc(app.typeLabel(it)) + '</p>';
      if (v) return '<canvas class="rmx-thumb" data-tc="' + esc(it.ID) + '" width="' + v.width + '" height="' + v.height + '"></canvas>';
      return '<span class="rmx-thumb rmx-thumb--ph" data-thumb="' + esc(it.ID) + '"></span>';
    };

    function drawAll(root) {
      (root || document).querySelectorAll('canvas.rmx-thumb[data-tc]').forEach(function (c) {
        const it = state.items.get(c.getAttribute('data-tc'));
        const src = it && mem.get(keyOf(it));
        if (src && src !== 'fail' && !c.dataset.done) { c.getContext('2d').drawImage(src, 0, 0); c.dataset.done = '1'; }
      });
    }
    function paint(id) {
      const it = state.items.get(id);
      if (!it) return;
      document.querySelectorAll('.rmx-thumb--ph[data-thumb="' + sel(id) + '"]').forEach(function (el) { el.outerHTML = app.thumbHtml(it); });
      drawAll();
    }

    async function produce(it) {
      const key = keyOf(it);
      let canvas = null;
      const safe = R.canvasSafe();
      const cached = safe ? await idbGet(key) : null;
      if (cached) {
        const bmp = await createImageBitmap(cached);
        canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d').drawImage(bmp, 0, 0);
        if (bmp.close) bmp.close();
      } else {
        const pdf = await app.getPdf(it.ID, ctrl.signal, { low: true });
        canvas = await R.pdfview.firstPageCanvas(pdf, HEIGHT);
        if (safe) canvas.toBlob(function (b) { if (b) idbPut(key, b); }, 'image/jpeg', 0.75);
      }
      remember(key, canvas);
    }

    async function pump() {
      if (running) return;
      running = true;
      if (!ctrl || ctrl.signal.aborted) ctrl = new AbortController();
      try {
        while (pending.length && state.thumbs) {
          const id = pending.pop();
          queued.delete(id);
          const it = state.items.get(id);
          if (!it || !document.querySelector('.rmx-thumb--ph[data-thumb="' + sel(id) + '"]')) continue;
          if (!mem.has(keyOf(it))) {
            try { await produce(it); }
            catch (e) { if (e.name === 'AbortError') break; console.warn('thumbnail failed', e); remember(keyOf(it), 'fail'); }
          }
          paint(id);
        }
      } finally { running = false; }
    }

    app.observeThumbs = function () {
      if (io) { io.disconnect(); io = null; }
      if (!state.thumbs) {
        pending = []; queued.clear();
        if (ctrl) ctrl.abort();
        return;
      }
      drawAll(document.getElementById('content'));
      const els = document.querySelectorAll('#content .rmx-thumb--ph');
      if (!els.length) return;
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          const id = en.target.getAttribute('data-thumb');
          if (en.isIntersecting && !queued.has(id)) { queued.add(id); pending.push(id); }
          else if (!en.isIntersecting && queued.has(id)) { queued.delete(id); pending = pending.filter(function (x) { return x !== id; }); }
        });
        pump();
      }, { rootMargin: '200px 0px' });
      els.forEach(function (el) { io.observe(el); });
    };
  });
})();
