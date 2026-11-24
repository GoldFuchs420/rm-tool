/*
 * Thin wrapper around PDF.js (Apache-2.0, loaded on demand):
 *   - show(container, blob)   minimal viewer: pages only, no browser toolbar
 *   - firstPageCanvas(blob, height) canvas with page 1
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});
  let libPromise = null;

  function load() {
    if (!libPromise) {
      libPromise = import('/assets/vendor/pdfjs/pdf.min.js').then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs/pdf.worker.min.js';
        return lib;
      }).catch(function (e) { libPromise = null; throw e; });
    }
    return libPromise;
  }
  async function open(blob) {
    const lib = await load();
    const data = new Uint8Array(await blob.arrayBuffer());
    return lib.getDocument({ data: data, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  }

  /** Renders all pages lazily into `container`. Returns {destroy()}. */
  async function show(container, blob) {
    const doc = await open(blob);
    const first = await doc.getPage(1);
    const v1 = first.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = function () { return Math.max(200, container.clientWidth - 2); };
    const pages = [];
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= doc.numPages; i++) {
      const box = document.createElement('div');
      box.className = 'rmx-pv-page';
      box.style.aspectRatio = v1.width + ' / ' + v1.height;
      box.dataset.n = String(i);
      frag.appendChild(box);
      pages.push({ box: box, canvas: null, task: null, n: i });
    }
    container.innerHTML = '';
    container.appendChild(frag);

    let token = 0;
    async function renderPage(p) {
      if (p.canvas || p.busy) return;
      p.busy = true;
      const my = ++token;
      try {
        const page = await doc.getPage(p.n);
        const base = page.getViewport({ scale: 1 });
        const scale = (width() / base.width) * dpr;
        const vp = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
        canvas.style.width = '100%'; canvas.style.height = 'auto';
        p.box.style.aspectRatio = base.width + ' / ' + base.height;
        p.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await p.task.promise;
        if (p.destroyed || !p.visible) { canvas.width = canvas.height = 0; }
        else { p.box.appendChild(canvas); p.canvas = canvas; }
        page.cleanup();
      } catch (e) { /* cancelled or failed page: leave blank */ }
      p.busy = false; p.task = null; void my;
    }
    function release(p) {
      if (p.task) { try { p.task.cancel(); } catch (e) { /* ignore */ } }
      if (p.canvas) { p.canvas.width = p.canvas.height = 0; p.canvas.remove(); p.canvas = null; }
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        const p = pages[parseInt(en.target.dataset.n, 10) - 1];
        p.visible = en.isIntersecting;
        if (en.isIntersecting) renderPage(p); else release(p);
      });
    }, { root: container, rootMargin: '800px 0px' });
    pages.forEach(function (p) { io.observe(p.box); });
    first.cleanup();

    return {
      count: doc.numPages,
      destroy: function () {
        io.disconnect();
        pages.forEach(function (p) { p.destroyed = true; release(p); });
        doc.destroy();
        container.innerHTML = '';
      }
    };
  }

  /**
   * First page rendered into a canvas that is shown directly. The pixels are never read back,
   * so this also works in browsers that scramble canvas data (fingerprint protection).
   */
  async function firstPageCanvas(blob, height) {
    const doc = await open(blob);
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: height / base.height });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return canvas;
    } finally { doc.destroy(); }
  }

  R.pdfview = { load: load, show: show, firstPageCanvas: firstPageCanvas };
})();
