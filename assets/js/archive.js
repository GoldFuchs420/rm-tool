/*
 * Archive writers used by the export.
 *   RMX.archive.create('zip' | 'tar.gz') -> { addDir, addFile, finish }
 * ZIP is produced with JSZip (MIT), TAR is written by the code below
 * (POSIX ustar + PAX headers for long / non-ASCII names) and compressed with
 * the browser's CompressionStream, falling back to pako (MIT/Zlib).
 */
(function () {
  'use strict';
  var R = (window.RMX = window.RMX || {});
  var enc = new TextEncoder();

  /* ---------- helpers ---------- */

  /** Makes a single path segment safe for Windows, macOS and Linux. */
  function sanitizeSegment(name) {
    var s = String(name == null ? '' : name)
      .replace(/[\u0000-\u001f\u007f\\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+|[\s.]+$/g, '');
    if (!s) s = 'Unbenannt';
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = '_' + s;
    // keep below 255 bytes (UTF-8)
    while (enc.encode(s).length > 200) s = s.slice(0, -1);
    return s;
  }

  /* ---------- ZIP ---------- */

  function ZipWriter() {
    this.zip = new window.JSZip(); // library is loaded by create()
  }
  ZipWriter.prototype.addDir = function (path, date) {
    this.zip.file(path.replace(/\/?$/, '/'), null, { dir: true, date: date, createFolders: false });
  };
  ZipWriter.prototype.addFile = function (path, data, date) {
    this.zip.file(path, data, { binary: true, date: date, createFolders: false });
  };
  ZipWriter.prototype.finish = function (onProgress) {
    // Documents are already compressed (PDF / rmdoc) -> store only, much faster.
    return this.zip.generateAsync(
      { type: 'blob', compression: 'STORE', streamFiles: true, platform: 'UNIX', mimeType: 'application/zip' },
      onProgress ? function (m) { onProgress(m.percent / 100); } : undefined
    );
  };
  ZipWriter.extension = 'zip';

  /* ---------- TAR ---------- */

  function octal(num, len) {
    return Math.floor(num).toString(8).padStart(len - 1, '0') + '\0';
  }
  function put(buf, off, str, max) {
    var b = enc.encode(str);
    buf.set(b.length > max ? b.subarray(0, max) : b, off);
  }
  function header(name, size, mtime, type, mode) {
    var buf = new Uint8Array(512);
    put(buf, 0, name, 100);
    put(buf, 100, octal(mode, 8), 8);
    put(buf, 108, octal(0, 8), 8);
    put(buf, 116, octal(0, 8), 8);
    put(buf, 124, octal(size, 12), 12);
    put(buf, 136, octal(mtime, 12), 12);
    buf.fill(0x20, 148, 156);
    buf[156] = type.charCodeAt(0);
    put(buf, 257, 'ustar\0', 6);
    put(buf, 263, '00', 2);
    var sum = 0;
    for (var i = 0; i < 512; i++) sum += buf[i];
    put(buf, 148, sum.toString(8).padStart(6, '0') + '\0 ', 8);
    return buf;
  }
  function paxRecord(key, value) {
    var body = ' ' + key + '=' + value + '\n';
    var bl = enc.encode(body).length;
    var len = bl;
    for (;;) {
      var next = bl + String(len).length;
      if (next === len) break;
      len = next;
    }
    return enc.encode(len + body);
  }
  function asciiFallback(path) {
    var s = path.replace(/[^\x20-\x7e]/g, '_');
    return s.length > 100 ? s.slice(s.length - 100) : s;
  }
  function padTo512(size) {
    var r = size % 512;
    return r ? new Uint8Array(512 - r) : null;
  }

  function TarWriter() {
    this.parts = [];
  }
  TarWriter.prototype._entry = function (path, size, date, type, mode, data) {
    var mtime = Math.floor((date ? date.getTime() : Date.now()) / 1000);
    var needsPax = /[^\x20-\x7e]/.test(path) || enc.encode(path).length > 100;
    if (needsPax) {
      var rec = paxRecord('path', path);
      this.parts.push(header('PaxHeader/' + asciiFallback(path).slice(-80), rec.length, mtime, 'x', 0o644));
      this.parts.push(rec);
      var pad = padTo512(rec.length);
      if (pad) this.parts.push(pad);
    }
    this.parts.push(header(needsPax ? asciiFallback(path) : path, size, mtime, type, mode));
    if (data) {
      this.parts.push(data);
      var p2 = padTo512(size);
      if (p2) this.parts.push(p2);
    }
  };
  TarWriter.prototype.addDir = function (path, date) {
    this._entry(path.replace(/\/?$/, '/'), 0, date, '5', 0o755, null);
  };
  TarWriter.prototype.addFile = function (path, blob, date) {
    this._entry(path, blob.size, date, '0', 0o644, blob);
  };
  TarWriter.prototype.finish = async function () {
    this.parts.push(new Uint8Array(1024)); // end-of-archive marker
    var tar = new Blob(this.parts, { type: 'application/x-tar' });
    this.parts = [];
    if (typeof CompressionStream !== 'undefined' && tar.stream) {
      var stream = tar.stream().pipeThrough(new CompressionStream('gzip'));
      return await new Response(stream).blob();
    }
    await R.load.pako();
    var bytes = new Uint8Array(await tar.arrayBuffer());
    return new Blob([window.pako.gzip(bytes)], { type: 'application/gzip' });
  };
  TarWriter.extension = 'tar.gz';

  /* ---------- reading (import) ---------- */

  var ARCHIVE_RE = /\.(zip|tar|tar\.gz|tgz)$/i;

  function cstr(u8, off, len) {
    var end = off;
    while (end < off + len && u8[end] !== 0) end++;
    return new TextDecoder().decode(u8.subarray(off, end));
  }
  function paxPath(data) {
    var text = new TextDecoder().decode(data);
    var m = /(?:^|\n)\d+ path=([^\n]*)/.exec(text);
    return m ? m[1] : null;
  }
  async function gunzip(blob) {
    if (typeof DecompressionStream !== 'undefined' && blob.stream) {
      return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    await R.load.pako();
    return window.pako.ungzip(new Uint8Array(await blob.arrayBuffer())).buffer;
  }
  function untar(buf) {
    var u8 = new Uint8Array(buf);
    var out = [];
    var off = 0, pax = null, longName = null;
    while (off + 512 <= u8.length) {
      if (u8[off] === 0) break; // end marker
      var size = parseInt(cstr(u8, off + 124, 12).trim() || '0', 8) || 0;
      var type = String.fromCharCode(u8[off + 156] || 48);
      var prefix = cstr(u8, off + 345, 155);
      var path = (prefix ? prefix + '/' : '') + cstr(u8, off, 100);
      var data = u8.subarray(off + 512, off + 512 + size);
      off += 512 + Math.ceil(size / 512) * 512;
      if (type === 'x') pax = paxPath(data);
      else if (type === 'L') longName = new TextDecoder().decode(data).replace(/\0+$/, '');
      else if (type === '0') {
        out.push({ path: pax || longName || path, blob: new Blob([data]) });
        pax = longName = null;
      } else { pax = longName = null; }
    }
    return out;
  }
  /** Entries of a zip / tar / tar.gz as [{path, blob}], metadata files and hidden files left out. */
  async function read(file) {
    var n = file.name.toLowerCase();
    var entries = [];
    if (/\.zip$/.test(n)) {
      await R.load.jszip();
      var zip = await window.JSZip.loadAsync(file);
      var jobs = [];
      zip.forEach(function (path, e) { if (!e.dir) jobs.push(e.async('blob').then(function (b) { entries.push({ path: path, blob: b }); })); });
      await Promise.all(jobs);
    } else {
      entries = untar(/\.(tar\.gz|tgz)$/.test(n) ? await gunzip(file) : await file.arrayBuffer());
    }
    return entries
      .map(function (e) { return { path: e.path.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, ''), blob: e.blob }; })
      .filter(function (e) { return e.path && !/(^|\/)(\.[^/]*|__MACOSX)(\/|$)/.test(e.path); })
      .sort(function (a, b) { return a.path.localeCompare(b.path, undefined, { numeric: true }); });
  }

  R.archive = {
    sanitizeSegment: sanitizeSegment,
    isArchive: function (file) { return ARCHIVE_RE.test(file.name); },
    read: read,
    create: async function (kind) {
      if (kind === 'tar.gz') return new TarWriter();
      await R.load.jszip();
      return new ZipWriter();
    },
    extension: function (kind) {
      return kind === 'tar.gz' ? 'tar.gz' : 'zip';
    }
  };
})();
