/*
 * Client for the device's built-in HTTP API (USB web interface):
 *   GET  /documents/            -> entries of the root folder
 *   GET  /documents/{id}        -> entries of a folder
 *   GET  /download/{id}/{fmt}   -> fmt = pdf | rmdoc
 *   POST /upload  (multipart "file")  -> 201
 *
 * All calls run strictly one after another (like the original UI does).
 * The device is slow and keeps state: an upload lands in the folder that was
 * listed last, so list + upload must never be interleaved with other calls.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  /* ---------------------------------------------------------------------
   * Erweiterung für die Chrome-Extension: Im Original lief diese Seite
   * direkt auf dem Gerät (same-origin, keine Auth nötig). Hier kommt sie
   * aus der Extension und spricht einen von mehreren konfigurierten
   * Servern an, oft über einen Proxy mit Basic-Auth. request() wartet
   * daher auf R.ready, bevor der erste echte Request rausgeht (gesetzt
   * von assets/js/rmx-bridge.js, sobald ein Server ausgewählt ist), und
   * stellt die Basis-URL + ggf. einen Authorization-Header voran.
   * ------------------------------------------------------------------- */
  let baseUrl = '';
  let authHeader = null;
  let readyResolve;
  R.ready = new Promise(function (res) { readyResolve = res; });
  R.configureServer = function (url, auth) {
    baseUrl = url || '';
    authHeader = auth || null;
    if (readyResolve) { readyResolve(); readyResolve = null; }
  };

  function NoConnection() {
    const e = new Error('No connection to device');
    e.name = 'NoConnectionError';
    return e;
  }
  function AbortErr() {
    const e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  }

  // Two lanes, one request at a time: interactive calls always run before background
  // work (thumbnails), so the UI never waits behind a pile of preview downloads.
  const highQ = [], lowQ = [];
  let running = false;
  function enqueue(task, signal, low) {
    return new Promise(function (resolve, reject) {
      (low ? lowQ : highQ).push({ task: task, signal: signal, resolve: resolve, reject: reject });
      pump();
    });
  }
  async function pump() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const job = highQ.shift() || lowQ.shift();
        if (!job) break;
        if (job.signal && job.signal.aborted) { job.reject(AbortErr()); continue; }
        try { job.resolve(await job.task()); } catch (e) { job.reject(e); }
      }
    } finally { running = false; }
  }

  /** fetch + read body inside one timeout window. as: 'json' | 'blob' | 'none' */
  async function request(url, opts, o) {
    await R.ready; // wartet, bis rmx-bridge.js einen Server konfiguriert hat
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, o.timeout);
    const onAbort = function () { ctrl.abort(); };
    if (o.signal) o.signal.addEventListener('abort', onAbort, { once: true });
    try {
      /* credentials: "omit" — die Auth läuft ausschließlich ueber den
         Authorization-Header; mit Credentials müsste Chrome bei 401 den
         nativen Basic-Login-Dialog öffnen (Fetch-Spec: Prompt erfordert
         includeCredentials). */
      const merged = Object.assign({ credentials: 'omit', signal: ctrl.signal }, opts);
      if (authHeader) merged.headers = Object.assign({}, opts.headers || {}, { Authorization: authHeader });
      const res = await fetch((baseUrl || '') + url, merged);
      let body = null;
      if (res.status === 200 || res.status === 201) {
        if (o.as === 'json') body = await res.json();
        else if (o.as === 'blob') body = await res.blob();
      }
      return { status: res.status, body: body, headers: res.headers };
    } catch (e) {
      if (o.signal && o.signal.aborted) throw AbortErr();
      throw NoConnection();
    } finally {
      clearTimeout(timer);
      if (o.signal) o.signal.removeEventListener('abort', onAbort);
    }
  }

  async function rawList(id) {
    const url = !id || id === 'root' ? '/documents/' : '/documents/' + encodeURIComponent(id);
    const r = await request(url, { method: 'GET' }, { timeout: 30000, as: 'json' });
    if (r.status !== 200) throw new Error('Get documents failed (' + r.status + ')');
    return Array.isArray(r.body) ? r.body : [];
  }

  async function rawDownload(id, fmt, signal) {
    let attempts = 0;
    for (;;) {
      attempts++;
      try {
        const r = await request('/download/' + encodeURIComponent(id) + '/' + fmt, { method: 'GET' },
          { timeout: 300000, as: 'blob', signal: signal });
        if (r.status !== 200) throw new Error('Download failed (' + r.status + ')');
        return r.body;
      } catch (e) {
        if (e.name === 'NoConnectionError' && attempts < 2) continue; // one retry
        throw e;
      }
    }
  }

  async function rawUpload(file, signal) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await request('/upload', { method: 'POST', body: fd }, { timeout: 300000, as: 'none', signal: signal });
    if (r.status !== 201) throw new Error('Upload failed (' + r.status + ')');
  }

  R.api = {
    NoConnection: NoConnection,
    listFolder: function (id, signal) {
      return enqueue(function () { return rawList(id); }, signal);
    },
    /** opts.low = background priority (thumbnails) */
    download: function (id, fmt, signal, opts) {
      return enqueue(function () { return rawDownload(id, fmt, signal); }, signal, !!(opts && opts.low));
    },
    /** Selects the target folder on the device (by listing it) and uploads right after. */
    upload: function (file, folderId, signal) {
      return enqueue(async function () {
        await rawList(folderId);
        await rawUpload(file, signal);
      }, signal);
    }
  };
})();
