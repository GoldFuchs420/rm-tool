/*
 * Extended reMarkable web interface.
 *  - folder navigation (breadcrumbs + tiles), favourites, search and filters
 *  - select single documents or whole folders
 *  - export / backup as PDF or .rmdoc, as ZIP or TAR.GZ with folder structure
 *  - import of PDF / EPUB / RMDOC and JPG / PNG / SVG (images become PDF)
 */
(function () {
  'use strict';
  var R = window.RMX;
  var t = R.t;
  var app = (R.app = {}); // shared with the feature modules (preview, import, tools)

  /* ================= helpers ================= */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { /* private mode */ }
    return null;
  }

  // Icons: Phosphor "regular" paths, the same set the original interface uses.
  var PATH = {
    folderFull: 'M216,72H131.31L104,44.69A15.88,15.88,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.41,15.41,0,0,0,39.39,216h177.5A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40Z',
    folderEmpty: 'M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z',
    notebook: 'M184,112a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h64A8,8,0,0,1,184,112Zm-8,24H112a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm48-88V208a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM48,208H72V48H48Zm160,0V48H88V208H208Z',
    pdf: 'M224,152a8,8,0,0,1-8,8H192v16h16a8,8,0,0,1,0,16H192v16a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8h32A8,8,0,0,1,224,152ZM92,172a28,28,0,0,1-28,28H56v8a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8H64A28,28,0,0,1,92,172Zm-16,0a12,12,0,0,0-12-12H56v24h8A12,12,0,0,0,76,172Zm88,8a36,36,0,0,1-36,36H112a8,8,0,0,1-8-8V152a8,8,0,0,1,8-8h16A36,36,0,0,1,164,180Zm-16,0a20,20,0,0,0-20-20h-8v40h8A20,20,0,0,0,148,180ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.69L160,51.31Z',
    importIcon: 'M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z',
    exportIcon: 'M216,112v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V112A16,16,0,0,1,56,96H80a8,8,0,0,1,0,16H56v96H200V112H176a8,8,0,0,1,0-16h24A16,16,0,0,1,216,112ZM93.66,69.66,120,43.31V136a8,8,0,0,0,16,0V43.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,69.66Z',
    sort: 'M128,128a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16h72A8,8,0,0,1,128,128ZM48,72H184a8,8,0,0,0,0-16H48a8,8,0,0,0,0,16Zm56,112H48a8,8,0,0,0,0,16h56a8,8,0,0,0,0-16Zm125.66-21.66a8,8,0,0,0-11.32,0L192,188.69V112a8,8,0,0,0-16,0v76.69l-26.34-26.35a8,8,0,0,0-11.32,11.32l40,40a8,8,0,0,0,11.32,0l40-40A8,8,0,0,0,229.66,162.34Z',
    caret: 'M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z',
    close: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
    check: 'M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z',
    warn: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z'
,
    star: 'M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z',
    starFill: 'M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z',
    infoIcon: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z',
    eye: 'M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.47,133.47,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z',
    search: 'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z',
    sliders: 'M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z',
    up: 'M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z',
    code: 'M69.12,94.35,28.27,128l40.85,33.65a8,8,0,1,1-10.24,12.3l-48-40a8,8,0,0,1,0-12.3l48-40a8,8,0,0,1,10.24,12.3Zm176,27.5-48-40a8,8,0,1,0-10.24,12.3L227.73,128l-40.85,33.65a8,8,0,1,0,10.24,12.3l48-40a8,8,0,0,0,0-12.3ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z',
    link: 'M137.54,186.36a8,8,0,0,1,0,11.31l-9.94,10A56,56,0,0,1,48.38,128.4L72.5,104.28A56,56,0,0,1,149.31,102a8,8,0,1,1-10.64,12,40,40,0,0,0-54.85,1.63L59.7,139.72a40,40,0,0,0,56.58,56.58l9.94-9.94A8,8,0,0,1,137.54,186.36Zm70.08-138a56.08,56.08,0,0,0-79.22,0l-9.94,9.95a8,8,0,0,0,11.32,11.31l9.94-9.94a40,40,0,0,1,56.58,56.58L172.18,140.4A40,40,0,0,1,117.33,142,8,8,0,1,0,106.69,154a56,56,0,0,0,76.81-2.26l24.12-24.12A56.08,56.08,0,0,0,207.62,48.38Z',
    down: 'M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z',
    trash: 'M224,56a8,8,0,0,1-8,8h-8V208a16,16,0,0,1-16,16H64a16,16,0,0,1-16-16V64H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,56ZM88,32h80a8,8,0,0,0,0-16H88a8,8,0,0,0,0,16Z',
    checks: 'M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48ZM72,168a8,8,0,0,1-5.66-2.34l-24-24a8,8,0,0,1,11.32-11.32L72,148.69l58.34-58.35a8,8,0,0,1,11.32,11.32l-64,64A8,8,0,0,1,72,168Zm141.66-66.34-64,64a8,8,0,0,1-11.32,0l-16-16a8,8,0,0,1,11.32-11.32L144,148.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z',
    copySimple: 'M192,72V216a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V72a8,8,0,0,1,8-8H184A8,8,0,0,1,192,72Zm24-40H72a8,8,0,0,0,0,16H208V184a8,8,0,0,0,16,0V40A8,8,0,0,0,216,32Z',
    calendarBlank: 'M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,48H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24Z'
  };
  function icon(name, size, extra) {
    var s = size || 24;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"' +
      (extra ? ' ' + extra : '') + '><path d="' + PATH[name] + '"/></svg>';
  }

  var CHEV = '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>';
  var rtf = null;
  try { rtf = new Intl.RelativeTimeFormat(R.lang, { numeric: 'auto' }); } catch (e) { /* old browser */ }
  function ago(value) {
    var d = new Date(value);
    if (isNaN(d.getTime()) || !rtf) return '';
    var m = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
    if (m < 1) return t('justNow');
    if (m < 60) return rtf.format(-m, 'minute');
    var h = Math.floor(m / 60);
    if (h < 48) return rtf.format(-h, 'hour');
    var days = Math.floor(h / 24);
    if (days < 60) return rtf.format(-days, 'day');
    var mo = Math.floor(days / 30);
    if (mo < 24) return rtf.format(-mo, 'month');
    return rtf.format(-Math.floor(days / 365), 'year');
  }
  function typeLabel(it) {
    if (it.Type === 'CollectionType') return t('typeFolder');
    var ft = String(it.fileType || 'notebook').toLowerCase();
    if (ft === 'notebook' || ft === '') return t('typeNotebook');
    return ft.toUpperCase();
  }
  function today() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  }
  function toast(msg, isError) {
    var el = document.createElement('div');
    el.className = 'rmx-toast responsive-body-sm' + (isError ? ' rmx-toast--error' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, isError ? 7000 : 4000);
  }

  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  function ymd(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function norm(x) {
    return String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function asciiName(x) {
    return String(x).replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue').replace(/\u00c4/g, 'Ae')
      .replace(/\u00d6/g, 'Oe').replace(/\u00dc/g, 'Ue').replace(/\u00df/g, 'ss').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_');
  }

  /* ================= state / model ================= */

  var state = {
    items: new Map(),       // id -> entry
    kids: new Map(),        // parent id ('root' for top level) -> [child ids]
    loaded: new Set(),      // folder ids whose entries are known ('root' included)
    pending: [],            // folder ids still to be listed
    crawlDone: 0,
    crawlTotal: 0,
    crawling: false,
    connection: true,
    folder: 'root',
    selected: new Set(),    // leaf ids: documents and empty folders
    sortKey: 'lastModified',
    sortReverse: false,
    sortOpen: false,
    filter: { q: '', type: '', fav: false, from: '', to: '', folder: 'all', sub: true },
    filterOpen: false,
    ver: 0,
    rowLimit: 300,
    thumbs: store('rmx.thumbs') === '1'
  };
  R.state = state; // handy for debugging

  var isFolder = function (it) { return it && it.Type === 'CollectionType'; };
  var pk = function (it) { return it.Parent === '' || it.Parent == null ? 'root' : it.Parent; };
  function children(id) {
    return (state.kids.get(id) || []).map(function (c) { return state.items.get(c); }).filter(Boolean);
  }
  function nameCmp(a, b) {
    return String(a.VissibleName).localeCompare(String(b.VissibleName), R.lang, { numeric: true, sensitivity: 'base' });
  }
  function sortedFolders(list) { return list.filter(isFolder).sort(nameCmp); }
  function sortedDocs(list) {
    var docs = list.filter(function (i) { return !isFolder(i); });
    var cmp;
    if (state.sortKey === 'visibleName') cmp = nameCmp;
    else if (state.sortKey === 'fileType') cmp = function (a, b) { return String(a.fileType || '').localeCompare(String(b.fileType || '')) || nameCmp(a, b); };
    else cmp = function (a, b) { return new Date(b.ModifiedClient) - new Date(a.ModifiedClient); }; // newest first
    docs.sort(cmp);
    if (state.sortReverse) docs.reverse();
    return docs;
  }

  /** Leaves under a node: documents and empty folders. Only what is already loaded. */
  function leaves(id) {
    var it = id === 'root' ? null : state.items.get(id);
    if (it && !isFolder(it)) return [id];
    if (!state.loaded.has(id)) return [];
    var kids = state.kids.get(id) || [];
    if (!kids.length) return id === 'root' ? [] : [id];
    var out = [];
    kids.forEach(function (k) { out.push.apply(out, leaves(k)); });
    return out;
  }
  var statCache = new Map();
  /** {total, sel, ready, fav} for a node, memoised per render */
  function stat(id) {
    var c = statCache.get(id);
    if (c) return c;
    var it = id === 'root' ? null : state.items.get(id);
    var s;
    if (it && !isFolder(it)) s = { total: 1, sel: state.selected.has(id) ? 1 : 0, ready: true, fav: it.Bookmarked ? 1 : 0 };
    else if (!state.loaded.has(id)) s = { total: 0, sel: 0, ready: false, fav: 0 };
    else {
      var kids = state.kids.get(id) || [];
      if (!kids.length) s = id === 'root' ? { total: 0, sel: 0, ready: true, fav: 0 } : { total: 1, sel: state.selected.has(id) ? 1 : 0, ready: true, fav: 0 };
      else {
        s = { total: 0, sel: 0, ready: true, fav: 0 };
        for (var i = 0; i < kids.length; i++) {
          var k = stat(kids[i]);
          s.total += k.total; s.sel += k.sel; s.fav += k.fav;
          if (!k.ready) s.ready = false;
        }
      }
    }
    statCache.set(id, s);
    return s;
  }
  function chainOf(id) {
    var chain = [];
    var cur = id;
    while (cur && cur !== 'root' && state.items.has(cur)) {
      var it = state.items.get(cur);
      chain.unshift(it);
      cur = pk(it);
    }
    return chain;
  }
  function pathLabel(id) {
    return [t('myFiles')].concat(chainOf(id).map(function (i) { return i.VissibleName; })).join(' › ');
  }

  /* ================= loading ================= */

  function ingest(folderId, list) {
    var key = folderId || 'root';
    var ids = [];
    list.forEach(function (it) {
      if (!it || !it.ID) return;
      state.items.set(it.ID, it);
      ids.push(it.ID);
      if (isFolder(it) && !state.loaded.has(it.ID) && state.pending.indexOf(it.ID) < 0 && !state.crawlSeen.has(it.ID)) {
        state.crawlSeen.add(it.ID);
        state.pending.push(it.ID);
        state.crawlTotal++;
      }
    });
    // drop entries that disappeared from this folder
    (state.kids.get(key) || []).forEach(function (old) {
      if (ids.indexOf(old) < 0) { state.items.delete(old); state.selected.delete(old); }
    });
    state.kids.set(key, ids);
    state.loaded.add(key);
    state.ver++;
  }
  state.crawlSeen = new Set();

  var renderTimer = null;
  function renderSoon() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () { renderTimer = null; render(); }, 350);
  }

  var crawlRun = 0;
  async function crawl() {
    var run = ++crawlRun;
    state.items = new Map(); state.kids = new Map(); state.loaded = new Set();
    state.crawlSeen = new Set(['root']);
    state.pending = ['root'];
    state.crawlDone = 0; state.crawlTotal = 1;
    state.crawling = true; state.connection = true;
    render();
    while (state.pending.length && run === crawlRun) {
      var id = state.pending.shift();
      try {
        ingest(id, await R.api.listFolder(id));
      } catch (e) {
        if (run !== crawlRun) return;
        if (e.name === 'NoConnectionError') {
          state.connection = false;
          state.crawling = false;
          state.pending = [];
          render();
          return;
        }
        console.error('Listing failed for', id, e);
        state.loaded.add(id); // do not wait forever for a folder that fails
        if (!state.kids.has(id)) state.kids.set(id, []);
      }
      state.crawlDone++;
      renderSoon();
    }
    if (run !== crawlRun) return;
    state.crawling = false;
    // forget selections that no longer exist
    Array.from(state.selected).forEach(function (id) { if (!state.items.has(id)) state.selected.delete(id); });
    if (state.folder !== 'root' && !state.items.has(state.folder)) navigate('root');
    render();
  }
  function want(id) {
    var i = state.pending.indexOf(id);
    if (i > 0) { state.pending.splice(i, 1); state.pending.unshift(id); }
  }
  async function reloadFolder(id) {
    try { ingest(id, await R.api.listFolder(id)); } catch (e) { /* ignore, shown on next full refresh */ }
    if (state.pending.length && !state.crawling) { /* new subfolders appear only via a full refresh */ }
    render();
  }

  /* ================= routing ================= */

  function readRoute() {
    var m = /^#\/folder\/(.+)$/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : 'root';
  }
  function navigate(id) {
    location.hash = id === 'root' ? '#/' : '#/folder/' + encodeURIComponent(id);
  }
  function onRoute() {
    state.folder = readRoute();
    state.sortOpen = false;
    state.rowLimit = 300;
    if (state.folder !== 'root') want(state.folder);
    window.scrollTo(0, 0);
    render();
  }

  /* ================= selection ================= */

  function toggleSelect(id) {
    var it = state.items.get(id);
    if (!it) return;
    if (isFolder(it)) {
      var lv = leaves(id);
      var all = lv.length > 0 && lv.every(function (x) { return state.selected.has(x); });
      lv.forEach(function (x) { if (all) state.selected.delete(x); else state.selected.add(x); });
    } else if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    refreshSelectionUI();
  }
  /** Updates checkboxes, row marks, counters in place instead of re-rendering the whole list. */
  function refreshSelectionUI() {
    var active = document.activeElement;
    var focusKey = active && active.dataset ? active.dataset.key : null;
    statCache = new Map();
    document.querySelectorAll('#content [data-chk]').forEach(function (c) {
      var st = stat(c.getAttribute('data-chk'));
      var checked = st.total > 0 && st.sel === st.total;
      if (c.checked !== checked) c.checked = checked;
      c.indeterminate = st.sel > 0 && st.sel < st.total;
      var row = c.closest('tr[data-row]') || c.closest('.rmx-tile');
      if (row) row.setAttribute('data-selected', String(checked));
    });
    renderActions();
    renderToolbar();
    if (focusKey) { var again = document.querySelector('[data-key="' + focusKey.replace(/"/g, '\\"') + '"]'); if (again && again !== active) again.focus({ preventScroll: true }); }
  }
  function selectedDocCount() {
    var n = 0;
    state.selected.forEach(function (id) { var it = state.items.get(id); if (it && !isFolder(it)) n++; });
    return n;
  }

  /* ================= rendering ================= */

  var NAV_LINKS = [
    ['https://remarkable.com/store/connect', 'syncConnect'],
    ['https://support.remarkable.com/s/article/Transferring-files-using-a-USB-cable', 'support'],
    ['https://remarkable.com/', null]
  ];
  function renderFrame() {
    var link = function (href, label) {
      return '<a href="' + href + '" target="_blank" rel="external noopener" class="ark-link"><span class="responsive-body-sm">' + esc(label) + '</span></a>';
    };
    $('#langsel').innerHTML = '<div class="ark-select rmx-lang"><select id="lang-select" aria-label="Language" title="Language">' +
      R.langs.map(function (l) { return '<option value="' + l[0] + '" title="' + esc(l[1]) + '"' + (l[0] === R.lang ? ' selected' : '') + '>' + l[0].toUpperCase() + '</option>'; }).join('') + '</select>' + CHEV + '</div>';
    $('[data-rmx-footer]').innerHTML = NAV_LINKS.slice(0, 2).map(function (l) { return link(l[0], t(l[1])); }).join('') +
      link('https://remarkable.com/legal/privacy', t('privacy')) +
      '<a href="/log.txt" class="ark-link"><span class="responsive-body-sm">' + esc(t('downloadLogs')) + '</span></a>' +
      link('https://remarkable.com/', 'remarkable.com');
    document.documentElement.lang = R.lang;
  }

  var short = function (n) { n = String(n); return n.length > 30 ? n.slice(0, 30) + '...' : n; };
  function renderCrumbs() {
    var chain = chainOf(state.folder);
    var html = '<ol><li><a class="ark-link" href="#/"' + (chain.length ? '' : ' aria-current="page"') + '><p class="responsive-heading-sm" style="font-weight:400;margin:0">' + esc(t('myFiles')) + '</p></a></li>';
    chain.forEach(function (it, i) {
      var last = i === chain.length - 1;
      html += '<li>' + icon('caret', 16) + '<a class="ark-link" href="#/folder/' + encodeURIComponent(it.ID) + '" title="' + esc(it.VissibleName) + '"' + (last ? ' aria-current="page"' : '') +
        '><p class="responsive-heading-sm" style="font-weight:400;margin:0">' + esc(short(it.VissibleName)) + '</p></a></li>';
    });
    if (state.folder !== 'root' && !state.items.has(state.folder)) html += '<li>' + icon('caret', 16) + '<span class="rmx-spinner"></span></li>';
    $('#crumbs').innerHTML = html + '</ol>';
  }

  /** long label on wide screens, short one on phones (keeps the menu in one row) */
  function label(k) {
    return '<p class="responsive-body-md"><span class="rmx-long">' + esc(t(k)) + '</span><span class="rmx-short">' + esc(t(k + 'Short')) + '</span></p>';
  }
  function renderActions() {
    var n = selectedDocCount();
    var busy = state.crawling || !state.connection;
    $('#actions').innerHTML =
      '<button type="button" class="ark-button ark-button--tertiary-neutral ark-button-large" data-act="import" data-key="act:import">' +
      icon('importIcon') + label('import') + '</button>' +
      '<button type="button" class="ark-button ark-button--tertiary-neutral ark-button-large" data-act="export" data-key="act:export"' + (busy ? ' disabled' : '') + '>' +
      icon('exportIcon') + label('export') +
      (n ? '<span class="rmx-count">' + n + '</span>' : '') + '</button>';
  }

  function renderBanner() {
    var el = $('#banner');
    if (!state.connection) {
      el.innerHTML = '<div class="rmx-banner rmx-banner--error"><span class="grow responsive-body-sm">' + esc(t('noConnection')) + '</span>' +
        '<button type="button" class="ark-button ark-button--secondary ark-button-small" data-act="refresh">' + esc(t('refresh')) + '</button></div>';
    } else if (state.crawling) {
      el.innerHTML = '<div class="rmx-banner"><span class="rmx-spinner"></span><span class="responsive-body-sm">' +
        esc(t('loadingStructure', { done: Math.min(state.crawlDone, state.crawlTotal), total: state.crawlTotal })) + '</span></div>';
    } else el.innerHTML = '';
  }

  function renderToolbar() {
    var n = state.selected.size;
    var nDocs = selectedDocCount();
    var sortLabels = { lastModified: t('sortLastUpdated'), visibleName: t('sortAlpha'), fileType: t('sortType') };
    var pool = curResults ? curResults.filter(function (x) { return !isFolder(x); }).map(function (x) { return x.ID; }) : leaves(state.folder);
    var allSelected = !pool.length || pool.every(function (x) { return state.selected.has(x); });
    var btn = function (act, label, disabled, ico) {
      return '<button type="button" class="ark-button ark-button--secondary ark-button-small" data-act="' + act + '" data-key="act:' + act + '"' + (disabled ? ' disabled' : '') + ' title="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon(ico, 16) + '<p class="responsive-body-sm">' + esc(label) + '</p></button>';
    };
    var html = curResults ? '<span class="rmx-resultcount responsive-body-md" aria-live="polite">' + esc(t('resultsCount', { n: curResults.length })) + '</span>' : '';
    html += '<div class="rmx-selbar">' + btn('select-all', t('selectAll'), allSelected, 'checks') + btn('clear', t('clearSelection'), !n, 'close') + btn('copy', t('copyBtn'), !nDocs, 'copySimple') + '</div>' +
      '<span class="spacer"></span><div class="rmx-viewbar">' +
      '<label class="rmx-choice rmx-thumbtoggle"><input type="checkbox" class="ark-input-checkbox" id="thumb-toggle" data-key="thumb:toggle"' + (state.thumbs ? ' checked' : '') + '><span class="txt"><span class="responsive-body-sm">' + esc(t('thumbnails')) + '</span></span></label>';

    html += '<div class="rmx-sort" data-reverse="' + state.sortReverse + '">' +
      '<button type="button" class="ark-button ark-button--tertiary-neutral ark-button-small" data-act="sort-menu" aria-haspopup="menu" aria-expanded="' + state.sortOpen + '" data-key="act:sort"><p class="responsive-body-sm">' + esc(sortLabels[state.sortKey]) + '</p></button>' +
      '<button type="button" class="rmx-sort__dir ark-button ark-button--tertiary-neutral ark-button-medium !rounded-none" style="border-radius:0" data-act="sort-reverse" aria-label="' + esc(t('sortReverse')) + '" data-key="act:sortdir">' + icon('sort', 24) + '</button>';
    if (state.sortOpen) {
      html += '<div class="rmx-menu" role="menu">' + ['lastModified', 'visibleName', 'fileType'].map(function (k) {
        return '<button type="button" role="menuitemradio" aria-checked="' + (state.sortKey === k) + '" data-sort="' + k + '" data-key="sort:' + k + '" class="responsive-body-sm">' + esc(sortLabels[k]) + '</button>';
      }).join('') + '</div>';
    }
    $('#toolbar').innerHTML = html + '</div></div>';
  }

  function checkboxHtml(id, name, st, key) {
    var checked = st.total > 0 && st.sel === st.total;
    var ind = st.sel > 0 && st.sel < st.total;
    return '<input type="checkbox" class="ark-input-checkbox" data-chk="' + esc(id) + '" data-key="' + key + '"' +
      (checked ? ' checked' : '') + (ind ? ' data-ind="1"' : '') + (st.ready === false || st.total === 0 ? ' disabled' : '') +
      ' aria-label="' + esc(t('selectItem', { name: name })) + '">';
  }
  function docStat(id) { return { total: 1, sel: state.selected.has(id) ? 1 : 0, ready: true }; }
  function folderIcon(it) {
    var empty = state.loaded.has(it.ID) && !(state.kids.get(it.ID) || []).length;
    return icon(empty ? 'folderEmpty' : 'folderFull', 24);
  }
  function docIcon(it) { return icon(String(it.fileType).toLowerCase() === 'pdf' ? 'pdf' : 'notebook', 24); }
  function rmxBtnIcon(kind) {
    return kind === 'upload' ? 'exportIcon' : kind === 'preview' ? 'eye' : 'importIcon';
  }
  function rmxBtnInner(kind, label) {
    return icon(rmxBtnIcon(kind), 18) + '<span>' + esc(label) + '</span>';
  }

  function stripExt(name) {
    return String(name).replace(/\.(pdf|epub|rm(doc|code)?|notebook)$/i, '');
  }
  function nameCell(it, showPath) {
    var doc = !isFolder(it);
    var star = it.Bookmarked ? '<span class="rmx-star" title="' + esc(t('bookmarked')) + '">' + icon('starFill', 16) + '</span>' : '';
    var title = doc ? stripExt(it.VissibleName) : it.VissibleName;
    var pg = doc && it.CurrentPage > 0 ? '<span class="rmx-pg rmx-muted">' + esc(t('pageShort', { n: it.CurrentPage + 1 })) + '</span>' : '';
    var date = doc ? '<span class="rmx-date rmx-muted">' + esc(ago(it.ModifiedClient)) + '</span>' : '';
    return '<div class="nm"><p class="responsive-body-sm">' + esc(title) + '</p>' + star + '</div>' +
      (doc ? '<div class="rmx-meta">' + pg + date + '</div>' : '') +
      (doc ? '<div class="rmx-acts far">' + actBtns(it) + '</div>' : '') +
      (showPath ? '<small class="rmx-path">' + esc(pathLabel(pk(it))) + '</small>' : '');
  }
  function actBtns(it) {
    var doc = !isFolder(it);
    var id = esc(it.ID), nm = esc(stripExt(it.VissibleName));
    var pill = function (fmt, label, title) {
      return '<button type="button" class="rmx-pill rmx-pill--' + fmt + '" data-dl="' + id + '" data-fmt="' + fmt + '" data-key="dl' + fmt + ':' + id + '" aria-label="' + esc(title) + ': ' + nm + '" title="' + esc(title) + '">' + icon('importIcon', 16) + '<span>' + label + '</span></button>';
    };
    var ib = function (attr, key, ico, title) {
      return '<button type="button" class="rmx-iconbtn" ' + attr + '="' + id + '" data-key="' + key + ':' + id + '" aria-label="' + esc(title) + ': ' + nm + '" title="' + esc(title) + '">' + icon(ico, 22) + '</button>';
    };
    return (doc ? pill('pdf', 'PDF', t('downloadPdf')) + pill('rmdoc', 'RMDoc', t('downloadRmdoc')) : '') +
      ib('data-info', 'info', 'infoIcon', t('info'));
  }
  function docRow(it, showPath) {
    var st = docStat(it.ID);
    return '<tr data-row="' + esc(it.ID) + '" data-selected="' + (st.sel === 1) + '">' +
      '<td class="c-side"><span class="c-side1"><span class="c-check">' + checkboxHtml(it.ID, it.VissibleName, st, 'chk:' + it.ID) + '</span><span class="c-icon">' + docIcon(it) + '</span></span><span class="c-type">' + (state.thumbs && app.thumbHtml ? app.thumbHtml(it) : '') + '</span></td>' +
      '<td class="c-main">' + nameCell(it, showPath) + '</td></tr>';
  }
  function favoritesHtml(favs) {
    if (!favs.length) return '';
    return '<section class="rmx-favs"><h3 class="rmx-sec responsive-body-md">' + icon('starFill', 18) + '<span>' + esc(t('favorites')) + '</span></h3>' +
      '<table class="rmx-table"><tbody>' + favs.map(function (d) { return docRow(d); }).join('') + '</tbody></table></section>';
  }

  /* ---------- search / filter ---------- */

  function typeKey(it) {
    var ft = String(it.fileType || '').toLowerCase();
    return ft && ft !== 'notebook' ? ft : 'notebook';
  }
  function filterCount() {
    var f = state.filter;
    return (f.type ? 1 : 0) + (f.fav ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.folder !== 'all' ? 1 : 0);
  }
  function filterActive() { return !!state.filter.q.trim() || filterCount() > 0; }
  function resetFilter() {
    state.filter = { q: '', type: '', fav: false, from: '', to: '', folder: 'all', sub: true };
    var q = $('#f-q'); if (q) q.value = '';
    syncFilterFields();
  }
  function inScope(it) {
    var f = state.filter;
    if (f.folder === 'all') return true;
    if (!f.sub) return pk(it) === f.folder;
    return chainOf(it.ID).some(function (x) { return x.ID === f.folder && x.ID !== it.ID; });
  }
  function searchResults() {
    var f = state.filter;
    var nq = norm(f.q.trim());
    var from = f.from ? new Date(f.from + 'T00:00:00') : null;
    var to = f.to ? new Date(f.to + 'T23:59:59.999') : null;
    var docOnly = !!(f.fav || f.from || f.to) || (f.type && f.type !== 'folder');
    var foldersOnly = f.type === 'folder';
    var folders = [];
    var docs = [];
    state.items.forEach(function (it) {
      if (isFolder(it)) {
        if (docOnly || (!nq && !foldersOnly) || (nq && (it._n || (it._n = norm(it.VissibleName))).indexOf(nq) < 0) || !inScope(it)) return;
        folders.push(it);
        return;
      }
      if (foldersOnly) return;
      if (nq && (it._n || (it._n = norm(it.VissibleName))).indexOf(nq) < 0) return;
      if (f.type && typeKey(it) !== f.type) return;
      if (f.fav && !it.Bookmarked) return;
      if (from || to) {
        var d = new Date(it.ModifiedClient);
        if (isNaN(d.getTime()) || (from && d < from) || (to && d > to)) return;
      }
      if (!inScope(it)) return;
      docs.push(it);
    });
    return sortedFolders(folders).concat(sortedDocs(docs));
  }
  var RESULT_CAP = 500;
  var curResults = null;
  function renderSearchView() {
    var res = curResults || [];
    if (!res.length) {
      return state.crawling ? '' : '<p class="rmx-empty responsive-body-sm rmx-muted">' + esc(t('noResults')) + '</p>';
    }
    var rows = res.slice(0, RESULT_CAP).map(function (it) {
      if (!isFolder(it)) return docRow(it, true);
      return '<tr class="is-folder" data-goto="' + esc(it.ID) + '"><td class="c-side"><span class="c-side1"><span class="c-icon">' + folderIcon(it) + '</span></span></td>' +
        '<td class="c-main">' + nameCell(it, true) + '</td></tr>';
    });
    return '<table class="rmx-table"><tbody>' + rows.join('') + '</tbody></table>' +
      (res.length > RESULT_CAP ? '<p class="responsive-body-sm rmx-muted" style="margin-top:16px">' + esc(t('resultsLimited', { n: RESULT_CAP })) + '</p>' : '');
  }

  var filterFolderSig = '';
  function buildFilterbar() {
    var chev = '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>';
    var sel = function (id, label, opts) {
      return '<label for="' + id + '" class="responsive-body-sm">' + esc(label) + '</label><div class="ark-select"><select id="' + id + '">' + opts + '</select>' + chev + '</div>';
    };
    var chk = function (id, label) {
      return '<label class="rmx-choice"><input type="checkbox" class="ark-input-checkbox" id="' + id + '"><span class="txt"><span class="responsive-body-sm">' + esc(label) + '</span></span></label>';
    };
    $('#filterbar').innerHTML =
      '<div class="rmx-search">' +
      '<div class="rmx-search__field">' + icon('search', 22) + '<input id="f-q" type="search" class="ark-input" autocomplete="off" spellcheck="false" placeholder="' + esc(t('searchPlaceholder')) + '" aria-label="' + esc(t('searchPlaceholder')) + '"></div>' +
      '<button type="button" class="ark-button ark-button--tertiary-neutral ark-button-medium" data-act="filter-toggle" id="f-toggle" aria-expanded="false" aria-controls="f-panel">' + icon('sliders', 20) + '<p class="responsive-body-md">' + esc(t('filters')) + '</p><span class="rmx-count" id="f-badge" hidden></span></button>' +
      '<button type="button" class="ark-button ark-button--tertiary-neutral ark-button-medium" data-act="filter-reset" id="f-reset" hidden><p class="responsive-body-md">' + esc(t('filtersReset')) + '</p></button></div>' +
      '<div class="rmx-filters" id="f-panel" hidden>' +
      '<div class="ark-field">' + sel('f-type', t('fType'), '<option value="">' + esc(t('fTypeAll')) + '</option>') + chk('f-fav', t('fFav')) + '</div>' +
      '<div class="ark-field">' + sel('f-folder', t('fFolder'), '') + chk('f-sub', t('fSub')) + '</div>' +
      '<div class="rmx-daterow">' +
      '<div class="ark-field"><label for="f-from" class="responsive-body-sm">' + esc(t('fFrom')) + '</label><input id="f-from" type="date" class="ark-input" title="' + esc(t('fDateHint')) + '"><small class="datehint responsive-body-sm">' + esc(t('fDateHint')) + '</small></div>' +
      '<div class="ark-field"><label for="f-to" class="responsive-body-sm">' + esc(t('fTo')) + '</label><input id="f-to" type="date" class="ark-input" title="' + esc(t('fDateHint')) + '"><small class="datehint responsive-body-sm">' + esc(t('fDateHint')) + '</small></div>' +
      '<div class="rmx-presets">' + ['7', '30', 'year'].map(function (p) { return '<button type="button" class="ark-button ark-button--secondary ark-button-small" data-preset="' + p + '">' + icon('calendarBlank', 16) + '<p class="responsive-body-sm">' + esc(t(p === '7' ? 'fPreset7' : p === '30' ? 'fPreset30' : 'fPresetYear')) + '</p></button>'; }).join('') + '</div>' +
      '</div></div>';
  }
  function syncFilterFields() {
    var f = state.filter;
    var set = function (id, v) { var el = $(id); if (el) el.value = v; };
    set('#f-type', f.type); set('#f-from', f.from); set('#f-to', f.to);
    var fav = $('#f-fav'); if (fav) fav.checked = f.fav;
    var sub = $('#f-sub'); if (sub) sub.checked = f.sub;
    var fo = $('#f-folder'); if (fo) fo.value = f.folder;
  }
  function updateFilterbar() {
    var sel = $('#f-folder');
    if (sel && state.filterOpen) {
      var ids = [];
      state.items.forEach(function (it) { if (isFolder(it)) ids.push(it.ID); });
      var sig = ids.length + ':' + state.ver + ':' + R.lang;
      if (sig !== filterFolderSig) {
        filterFolderSig = sig;
        var types = {};
        state.items.forEach(function (it) { if (!isFolder(it)) types[typeKey(it)] = 1; });
        var tsel = $('#f-type');
        if (tsel) {
          tsel.innerHTML = '<option value="">' + esc(t('fTypeAll')) + '</option><option value="folder">' + esc(t('typeFolder')) + '</option>' +
            Object.keys(types).sort().map(function (k) { return '<option value="' + esc(k) + '">' + esc(k === 'notebook' ? t('typeNotebook') : k.toUpperCase()) + '</option>'; }).join('');
          tsel.value = state.filter.type;
        }
        var opts = [{ id: 'all', label: t('fFolderAll') }].concat(ids.map(function (id) { return { id: id, label: pathLabel(id) }; })
          .sort(function (a, b) { return a.label.localeCompare(b.label, R.lang, { numeric: true }); }));
        sel.innerHTML = opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'; }).join('');
        sel.value = state.filter.folder;
      }
    }
    var n = filterCount();
    var badge = $('#f-badge');
    if (badge) { badge.hidden = !n; badge.textContent = n; }
    var reset = $('#f-reset'); if (reset) reset.hidden = !filterActive();
    var panel = $('#f-panel'); if (panel) panel.hidden = !state.filterOpen;
    var tg = $('#f-toggle'); if (tg) tg.setAttribute('aria-expanded', String(state.filterOpen));
  }
  var qTimer = null;
  function initFilterbar() {
    buildFilterbar();
    var bar = $('#filterbar');
    bar.addEventListener('input', function (e) {
      if (e.target.id !== 'f-q') return;
      state.filter.q = e.target.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(render, 160);
    });
    bar.addEventListener('change', function (e) {
      var f = state.filter;
      switch (e.target.id) {
        case 'f-type': f.type = e.target.value; break;
        case 'f-folder': f.folder = e.target.value; break;
        case 'f-sub': f.sub = e.target.checked; break;
        case 'f-from': f.from = e.target.value; break;
        case 'f-to': f.to = e.target.value; break;
        case 'f-fav': f.fav = e.target.checked; break;
        default: return;
      }
      render();
    });
    bar.addEventListener('click', function (e) {
      var p = e.target.closest('[data-preset]');
      if (p) {
        var d = new Date();
        var k = p.getAttribute('data-preset');
        if (k === 'year') d = new Date(d.getFullYear(), 0, 1); else d.setDate(d.getDate() - parseInt(k, 10));
        state.filter.from = ymd(d); state.filter.to = ymd(new Date());
        syncFilterFields(); render();
      }
    });
  }

  function moreHtml(total) {
    if (total <= state.rowLimit) return '';
    return '<div class="rmx-more"><button type="button" class="ark-button ark-button--secondary ark-button-medium" data-act="more"><p class="responsive-body-md">' + esc(t('showMore', { n: total - state.rowLimit })) + '</p></button></div>';
  }
  function renderFolderView() {
    var id = state.folder;
    if (id !== 'root' && !state.items.has(id)) {
      return state.crawling
        ? '<div class="rmx-empty"><span class="rmx-spinner" style="margin:0 auto"></span></div>'
        : '';
    }
    if (!state.loaded.has(id)) return '<div class="rmx-empty"><span class="rmx-spinner" style="margin:0 auto 12px"></span><p class="responsive-body-sm rmx-muted">' + esc(t('loadingFolder')) + '</p></div>';
    var kids = children(id);
    var folders = sortedFolders(kids);
    var all = sortedDocs(kids);
    var favs = all.filter(function (d) { return d.Bookmarked; });
    var docs = all.filter(function (d) { return !d.Bookmarked; });
    if (!folders.length && !all.length) {
      return '<p class="rmx-empty responsive-body-sm rmx-muted">' + esc(id === 'root' ? t('emptyLibrary') : t('emptyFolder')) + '</p>';
    }
    var html = favoritesHtml(favs);
    if (folders.length) {
      html += '<div class="rmx-tiles">' + folders.map(function (f) {
        var st = stat(f.ID);
        var sel = st.total > 0 && st.sel === st.total;
        return '<div class="rmx-tile" data-selected="' + sel + '"><a class="rmx-tile__link ark-link" href="#/folder/' + encodeURIComponent(f.ID) + '" data-key="tile:' + esc(f.ID) + '">' +
          icon(state.loaded.has(f.ID) && !(state.kids.get(f.ID) || []).length ? 'folderEmpty' : 'folderFull', 32) +
          '<p class="responsive-body-sm">' + esc(f.VissibleName) + '</p>' + (st.fav ? '<span class="rmx-star" title="' + esc(t('bookmarked')) + '">' + icon('starFill', 16) + '</span>' : '') + '</a>' +
          (st.ready ? checkboxHtml(f.ID, f.VissibleName, st, 'chk:' + f.ID) : '<span class="rmx-spinner rmx-tile__spinner" title="' + esc(t('loadingFolder')) + '"></span>') + '</div>';
      }).join('') + '</div>';
    }
    if (docs.length) {
      html += '<table class="rmx-table"><tbody>' + docs.slice(0, state.rowLimit).map(function (d) { return docRow(d); }).join('') + '</tbody></table>' + moreHtml(docs.length);
    }
    return html;
  }

  function render() {
    statCache = new Map();
    curResults = filterActive() ? searchResults() : null;
    var active = document.activeElement;
    var focusKey = active && active.dataset ? active.dataset.key : null;
    renderCrumbs();
    renderActions();
    renderBanner();
    renderToolbar();
    $('#content').innerHTML = curResults ? renderSearchView() : renderFolderView();
    if (app.observeThumbs) app.observeThumbs();
    updateFilterbar();
    // indeterminate state can only be set through the DOM
    document.querySelectorAll('input[data-ind]').forEach(function (c) { c.indeterminate = true; });
    document.documentElement.classList.toggle('rmx-thumbs-on', state.thumbs);
    if (focusKey) {
      var again = document.querySelector('[data-key="' + focusKey.replace(/"/g, '\\"') + '"]');
      if (again && again !== active) again.focus({ preventScroll: true });
    }
    if (state.sortOpen) {
      var first = document.querySelector('.rmx-menu [aria-checked="true"]') || document.querySelector('.rmx-menu button');
      if (first && !(active && active.closest && active.closest('.rmx-menu'))) first.focus();
    }
  }

  /* ================= events ================= */

  var folderIdsCache = { ver: -1, ids: [] };
  function allFolderIds() {
    if (folderIdsCache.ver !== state.ver) {
      var out = [];
      state.items.forEach(function (it) { if (isFolder(it)) out.push(it.ID); });
      folderIdsCache = { ver: state.ver, ids: out };
    }
    return folderIdsCache.ids.slice();
  }

  function onClick(e) {
    var target = e.target;
    var chk = target.closest('[data-chk]');
    if (chk) { e.stopPropagation(); toggleSelect(chk.getAttribute('data-chk')); return; }
    var infoBtn = target.closest('[data-info]');
    if (infoBtn) { e.stopPropagation(); if (app.openDetails) app.openDetails(infoBtn.getAttribute('data-info')); return; }
    var dlBtn = target.closest('[data-dl]');
    if (dlBtn) { e.stopPropagation(); if (app.downloadDocument) app.downloadDocument(dlBtn.getAttribute('data-dl'), dlBtn, dlBtn.getAttribute('data-fmt')); return; }
    var goRow = target.closest('tr[data-goto]');
    if (goRow && !target.closest('button')) { var gid = goRow.getAttribute('data-goto'); resetFilter(); if (readRoute() === gid) render(); else navigate(gid); return; }
    var sortBtn = target.closest('[data-sort]');
    if (sortBtn) {
      var k = sortBtn.getAttribute('data-sort');
      if (k !== state.sortKey) { state.sortKey = k; state.sortReverse = false; }
      state.sortOpen = false;
      render();
      var again = $('[data-key="act:sort"]'); if (again) again.focus();
      return;
    }
    var act = target.closest('[data-act]');
    if (act) {
      switch (act.getAttribute('data-act')) {
        case 'import': if (app.openImport) app.openImport([]); break;
        case 'export': openExport(); break;
        case 'refresh': crawl(); break;
        case 'select-all':
          (curResults ? curResults.filter(function (x) { return !isFolder(x); }).map(function (x) { return x.ID; }) : leaves(state.folder))
            .forEach(function (x) { state.selected.add(x); });
          refreshSelectionUI(); break;
        case 'more': state.rowLimit += 300; render(); break;
        case 'copy': if (app.copySelected) app.copySelected(); break;
        case 'filter-toggle': state.filterOpen = !state.filterOpen; updateFilterbar(); break;
        case 'filter-reset': resetFilter(); render(); break;
        case 'clear': state.selected.clear(); refreshSelectionUI(); break;
        case 'sort-menu': state.sortOpen = !state.sortOpen; render(); break;
        case 'sort-reverse': state.sortReverse = !state.sortReverse; render(); break;
      }
      return;
    }
    var row = target.closest('tr[data-row]');
    if (row && !target.closest('a')) {
      var rid = row.getAttribute('data-row');
      var it = state.items.get(rid);
      if (!isFolder(it)) toggleSelect(rid);
      return;
    }
    if (state.sortOpen && !target.closest('.rmx-sort')) { state.sortOpen = false; render(); }
  }
  function onKey(e) {
    if (e.key === 'Escape' && state.sortOpen) {
      state.sortOpen = false; render();
      var b = $('[data-key="act:sort"]'); if (b) b.focus();
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest && e.target.closest('.rmx-menu')) {
      e.preventDefault();
      var items = Array.from(document.querySelectorAll('.rmx-menu button'));
      var i = items.indexOf(e.target);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    }
  }
  function onChange(e) {
    if (e.target.id === 'lang-select') {
      R.setLang(e.target.value);
      try { rtf = new Intl.RelativeTimeFormat(R.lang, { numeric: 'auto' }); } catch (err) { /* old browser */ }
      var q = state.filter.q;
      renderFrame(); buildFilterbar(); $('#f-q').value = q; syncFilterFields(); filterFolderSig = ''; render();
    }
    else if (e.target.id === 'thumb-toggle') { state.thumbs = e.target.checked; store('rmx.thumbs', state.thumbs ? '1' : '0'); render(); }
    else if (e.target.id === 'import-input') {
      var files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length && app.openImport) app.openImport(files);
    }
  }

  /* ================= export ================= */

  var ex = { running: false, abort: null, blob: null, filename: '' };

  function scopeLeaves(scope) {
    if (scope === 'selection') return Array.from(state.selected).filter(function (id) { return state.items.has(id); });
    if (scope === 'folder') return leaves(state.folder);
    return leaves('root');
  }
  function countDocs(ids) {
    return ids.filter(function (id) { return !isFolder(state.items.get(id)); }).length;
  }

  /** Unique, sanitised path segments per folder (stable across partial exports). */
  function baseOf(it, naming) {
    var s = it.VissibleName;
    if (!isFolder(it) && naming && naming.prefix) s = ymd(it.ModifiedClient) + ' ' + s; // modification date before the title
    return naming && naming.ascii ? asciiName(s) : s;
  }
  function currentNaming() {
    var d = $('#ex-date');
    return d ? { prefix: d.checked, ascii: $('#ex-ascii').checked } : { prefix: false, ascii: false };
  }
  function nameResolver(fmt, naming) {
    var cache = new Map();
    function names(parent) {
      if (cache.has(parent)) return cache.get(parent);
      var used = new Set();
      var map = new Map();
      children(parent).slice().sort(function (a, b) { return nameCmp(a, b) || (a.ID < b.ID ? -1 : 1); }).forEach(function (it) {
        var base = R.archive.sanitizeSegment(baseOf(it, naming));
        var doc = !isFolder(it);
        var cand = doc ? base + '.' + fmt : base;
        for (var n = 2; used.has(cand.toLowerCase()); n++) cand = doc ? base + ' (' + n + ').' + fmt : base + ' (' + n + ')';
        used.add(cand.toLowerCase());
        map.set(it.ID, cand);
      });
      cache.set(parent, map);
      return map;
    }
    return {
      segs: function (id) {
        return chainOf(id).map(function (it) { return names(pk(it)).get(it.ID); });
      }
    };
  }

  function makePlan(leafIds, fmt, keep, naming) {
    var res = nameResolver(fmt, naming);
    var docs = [];
    var dirs = new Map();
    var flat = new Set();
    var addDirs = function (chain, segs, count) {
      for (var i = 0; i < count; i++) {
        var p = segs.slice(0, i + 1).join('/');
        if (!dirs.has(p)) dirs.set(p, new Date(chain[i].ModifiedClient));
      }
    };
    leafIds.forEach(function (id) {
      var it = state.items.get(id);
      if (!it) return;
      var chain = chainOf(id);
      var segs = res.segs(id);
      if (isFolder(it)) { if (keep) addDirs(chain, segs, segs.length); return; }
      var path;
      if (keep) {
        path = segs.join('/');
        addDirs(chain, segs, segs.length - 1);
      } else {
        var base = R.archive.sanitizeSegment(baseOf(it, naming));
        path = base + '.' + fmt;
        for (var n = 2; flat.has(path.toLowerCase()); n++) path = base + ' (' + n + ').' + fmt;
        flat.add(path.toLowerCase());
      }
      docs.push({ id: id, path: path, label: it.VissibleName, mtime: new Date(it.ModifiedClient) });
    });
    docs.sort(function (a, b) { return a.path.localeCompare(b.path, R.lang, { numeric: true }); });
    var dirList = Array.from(dirs.keys()).sort().map(function (p) { return { path: p, mtime: dirs.get(p) }; });
    return { docs: docs, dirs: dirList };
  }

  function choice(type, name, value, label, hint, checked) {
    return '<label class="rmx-choice" data-choice="' + name + ':' + value + '">' +
      '<input type="' + type + '" class="ark-input-' + (type === 'radio' ? 'radio' : 'checkbox') + '" name="' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="txt"><span class="responsive-body-md">' + esc(label) + '</span><small data-hint="' + name + ':' + value + '">' + (hint ? esc(hint) : '') + '</small></span></label>';
  }

  function openExport() {
    var dlg = $('#dlg-export');
    var hasSel = state.selected.size > 0;
    var inFolder = state.folder !== 'root' && state.items.has(state.folder);
    var defaultScope = hasSel ? 'selection' : (inFolder ? 'folder' : 'all');
    dlg.innerHTML =
      '<form method="dialog" id="ex-form" novalidate>' +
      '<div class="rmx-dialog__head"><h2 id="dlg-export-title" class="responsive-heading-sm" style="font-weight:400">' + esc(t('exportTitle')) + '</h2>' +
      '<button type="button" class="ark-button ark-button--tertiary-neutral ark-button-medium" data-ex="close" aria-label="' + esc(t('close')) + '">' + icon('close', 24) + '</button></div>' +
      '<div class="rmx-dialog__body">' +
      '<p class="responsive-body-sm rmx-muted" style="margin:0">' + esc(t('exportIntro')) + '</p>' +
      '<div id="ex-options" style="display:flex;flex-direction:column;gap:28px">' +
      '<div class="ark-field"><label for="ex-name" class="responsive-body-md" style="font-weight:600">' + esc(t('archiveName')) + '</label>' +
      '<div class="rmx-namefield"><input id="ex-name" class="ark-input" type="text" autocomplete="off" spellcheck="false" value=""><span class="ext responsive-body-md" id="ex-ext">.zip</span></div></div>' +
      '<div class="rmx-summary responsive-body-sm" id="ex-summary" aria-live="polite"></div>' +
      '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('scope')) + '</legend>' +
      choice('radio', 'scope', 'selection', t('scopeSelection'), '', defaultScope === 'selection') +
      (inFolder ? choice('radio', 'scope', 'folder', t('scopeFolder', { name: state.items.get(state.folder).VissibleName }), '', defaultScope === 'folder') : '') +
      choice('radio', 'scope', 'all', t('scopeAll'), '', defaultScope === 'all') + '</fieldset>' +
      '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('format')) + '</legend>' +
      choice('radio', 'format', 'pdf', t('fmtPdf'), t('fmtPdfHint'), true) +
      choice('radio', 'format', 'rmdoc', t('fmtRmdoc'), t('fmtRmdocHint'), false) + '</fieldset>' +
      '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('archive')) + '</legend><div class="rmx-inline">' +
      choice('radio', 'archive', 'zip', t('archZip'), '', true) +
      choice('radio', 'archive', 'tar.gz', t('archTar'), '', false) +
      choice('radio', 'archive', 'single', t('archSingle'), t('archSingleHint'), false) + '</div></fieldset>' +
      '<div class="rmx-switchrow"><span class="ark-switch"><input type="checkbox" role="switch" class="ark-switch--input" id="ex-keep" checked>' +
      '<span class="ark-switch--track"><span class="ark-switch--thumb"></span></span></span>' +
      '<label for="ex-keep" class="txt" style="cursor:pointer"><span class="responsive-body-md">' + esc(t('keepStructure')) + '</span><small>' + esc(t('keepStructureHint')) + '</small></label></div>' +
      '<fieldset class="rmx-fieldset"><legend class="responsive-body-md">' + esc(t('nameTemplate')) + '</legend>' +
      '<label class="rmx-choice"><input type="checkbox" class="ark-input-checkbox" id="ex-date"' + (store('rmx.dateprefix') !== '0' ? ' checked' : '') + '><span class="txt"><span class="responsive-body-md">' + esc(t('datePrefix')) + '</span></span></label>' +
      '<label class="rmx-choice"><input type="checkbox" class="ark-input-checkbox" id="ex-ascii"' + (store('rmx.ascii') === '1' ? ' checked' : '') + '><span class="txt"><span class="responsive-body-md">' + esc(t('asciiNames')) + '</span></span></label>' +
      '<small class="rmx-muted responsive-body-sm" id="ex-sample" style="word-break:break-all;margin-top:4px"></small></fieldset>' +
      '</div>' +
      '<div id="ex-run" class="rmx-run" hidden><div class="name responsive-body-md" id="ex-status"></div><div class="rmx-progress" id="ex-bar"><i></i></div><ul class="rmx-errlist" id="ex-errors" hidden></ul></div>' +
      '</div>' +
      '<div class="rmx-dialog__foot">' + app.btn(t('cancel'), 'data-ex="cancel" id="ex-cancel" hidden') + app.btn('', 'data-ex="again" id="ex-again" hidden') +
      '<button type="submit" class="ark-button ark-button-large" id="ex-start"></button></div></form>';
    ex.running = false; ex.nameTouched = false; ex.touchedArchive = false;
    refreshExport();
    if (!dlg.open) dlg.showModal();
    $('#ex-start').focus();
  }

  function exVal(name) {
    var el = $('#dlg-export input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  /** The button always says what you get: PDF, RMDoc or archive (ZIP / TAR.GZ). */
  function exportLabel(arch, fmt) {
    if (arch === 'single') return fmt === 'pdf' ? t('exportAsPdf') : t('exportAsRmdoc');
    return t('exportAsArchive', { type: arch === 'zip' ? 'ZIP' : 'TAR.GZ' });
  }
  function refreshExport() {
    var scope = exVal('scope');
    var fmt = exVal('format');
    var keep = $('#ex-keep').checked;
    var info = {};
    ['selection', 'folder', 'all'].forEach(function (s) {
      var ids = scopeLeaves(s);
      info[s] = { ids: ids, docs: countDocs(ids) };
      var radio = $('#dlg-export input[name="scope"][value="' + s + '"]');
      if (!radio) return;
      var disabled = s === 'selection' ? info[s].docs + 0 === 0 && ids.length === 0 : ids.length === 0;
      radio.disabled = disabled;
      radio.closest('.rmx-choice').setAttribute('data-disabled', String(disabled));
    });
    if (!$('#dlg-export input[name="scope"]:checked') || $('#dlg-export input[name="scope"]:checked').disabled) {
      var firstOk = Array.from(document.querySelectorAll('#dlg-export input[name="scope"]')).find(function (r) { return !r.disabled; });
      if (firstOk) { firstOk.checked = true; scope = firstOk.value; } else scope = null;
    }
    var naming = currentNaming();
    var plan = scope ? makePlan(info[scope].ids, fmt, keep, naming) : { docs: [], dirs: [] };
    var sample = $('#ex-sample');
    if (sample) sample.textContent = plan.docs.length ? plan.docs[0].path : '';
    var onlyIds = scope ? info[scope].ids : [];
    var singleOk = onlyIds.length === 1 && !isFolder(state.items.get(onlyIds[0])); // exactly one document, no (empty) folder
    var single = $('#dlg-export input[name="archive"][value="single"]');
    single.disabled = !singleOk;
    single.closest('.rmx-choice').setAttribute('data-disabled', String(!singleOk));
    if (single.checked && !singleOk) $('#dlg-export input[name="archive"][value="zip"]').checked = true;
    if (singleOk && scope === 'selection' && !ex.touchedArchive) single.checked = true;
    var arch = exVal('archive');
    $('#ex-ext').textContent = arch === 'single' ? '.' + fmt : '.' + arch;
    if (!ex.nameTouched) {
      var one = plan.docs.length === 1 ? plan.docs[0].path.split('/').pop().replace(/\.[^.]+$/, '') : '';
      $('#ex-name').value = one || (today() + ' remarkable-backup');
    }
    var kind = arch === 'single' ? fmt : 'archive';
    $('#ex-start').className = 'ark-button ark-button-large rmx-btn rmx-btn--' + kind;
    $('#ex-start').innerHTML = rmxBtnInner(kind, exportLabel(arch, fmt));
    $('#ex-name').disabled = arch === 'single';
    $('#ex-keep').disabled = arch === 'single';
    $('#ex-summary').textContent = t('dDocs', { n: plan.docs.length }) + (plan.dirs.length ? ' · ' + t('dFolders', { n: plan.dirs.length }) : '');
    $('#ex-start').disabled = !plan.docs.length && !plan.dirs.length;
  }

  async function runExport() {
    var scope = exVal('scope');
    var fmt = exVal('format');
    var arch = exVal('archive');
    var keep = $('#ex-keep').checked;
    var naming = currentNaming();
    store('rmx.dateprefix', naming.prefix ? '1' : '0'); store('rmx.ascii', naming.ascii ? '1' : '0');
    var plan = makePlan(scopeLeaves(scope), fmt, keep, naming);
    var n = plan.docs.length;
    if (!n && !plan.dirs.length) { toast(t('exportNothing'), true); return; }

    var ctrl = new AbortController();
    ex = { running: true, abort: ctrl, blob: null, filename: '', touchedArchive: true };
    var bar = $('#ex-bar');
    var status = $('#ex-status');
    $('#ex-options').hidden = true;
    $('#ex-run').hidden = false;
    $('#ex-start').hidden = true;
    $('#ex-cancel').hidden = false;
    var errList = $('#ex-errors');
    var setBar = function (frac) { bar.classList.remove('is-indeterminate'); bar.firstElementChild.style.width = Math.round(frac * 100) + '%'; };
    var errors = [];
    var ok = 0;
    var cancelled = false;
    var writer = arch === 'single' ? null : await R.archive.create(arch);
    var failStreak = 0;

    if (writer) plan.dirs.forEach(function (d) { writer.addDir(d.path, d.mtime); });

    for (var i = 0; i < n; i++) {
      var d = plan.docs[i];
      status.textContent = t('exportDownloading', { i: i + 1, n: n, name: d.label });
      setBar(i / n);
      try {
        var blob = await R.api.download(d.id, fmt, ctrl.signal);
        if (writer) writer.addFile(d.path, blob, d.mtime);
        else { ex.blob = blob; ex.filename = d.path.split('/').pop(); }
        ok++;
        failStreak = 0;
      } catch (e) {
        if (e.name === 'AbortError') { cancelled = true; break; }
        errors.push({ label: d.label, path: d.path, msg: e.message });
        failStreak++;
        if (failStreak >= 3 && e.name === 'NoConnectionError') { state.connection = false; render(); break; }
      }
    }
    setBar(n ? ok / n : 1);

    if (!cancelled && (ok > 0 || (writer && plan.dirs.length && !errors.length))) {
      try {
        if (!writer) {
          saveBlob(ex.blob, ex.filename);
        } else {
          if (errors.length) {
            var report = errors.map(function (er) { return er.path + '\t' + er.msg; }).join('\n') + '\n';
            writer.addFile(t('errorsFile'), new Blob([report], { type: 'text/plain' }), new Date());
          }
          status.textContent = t('exportPacking');
          bar.classList.add('is-indeterminate');
          var base = R.archive.sanitizeSegment(($('#ex-name').value || 'remarkable-backup').replace(/\.(zip|tar\.gz|tgz)$/i, ''));
          var out = await writer.finish(arch === 'zip' ? function (f) { bar.classList.remove('is-indeterminate'); setBar(f); } : null);
          ex.blob = out;
          ex.filename = base + '.' + R.archive.extension(arch);
          saveBlob(out, ex.filename);
        }
        setBar(1);
      } catch (e) {
        console.error(e);
        errors.push({ label: '', path: '', msg: e.message });
      }
    }

    ex.running = false;
    bar.classList.remove('is-indeterminate');
    status.textContent = cancelled ? t('exportCancelled') : t('exportDone', { ok: ok, n: n });
    if (errors.length) {
      errList.hidden = false;
      errList.innerHTML = '<li><strong>' + esc(t('exportFailedSome', { n: errors.length })) + '</strong></li>' +
        errors.slice(0, 50).map(function (er) { return '<li>' + esc((er.label ? er.label + ': ' : '') + er.msg) + '</li>'; }).join('');
    }
    $('#ex-cancel').hidden = true;
    var again = $('#ex-again');
    if (ex.blob) {
      again.hidden = false;
      var k2 = arch === 'single' ? fmt : 'archive';
      again.className = 'ark-button ark-button-large rmx-btn rmx-btn--' + k2;
      again.innerHTML = rmxBtnInner(k2, t('downloadAgain') + ' (' + (arch === 'single' ? (fmt === 'pdf' ? 'PDF' : 'RMDoc') : arch === 'zip' ? 'ZIP' : 'TAR.GZ') + ')');
      again.focus();
    }
  }

  function initExportDialog() {
    var dlg = $('#dlg-export');
    dlg.addEventListener('input', function (e) { if (e.target.id === 'ex-name') ex.nameTouched = true; });
    dlg.addEventListener('change', function (e) {
      if (e.target.name === 'archive') ex.touchedArchive = true;
      if (!ex.running) refreshExport();
    });
    dlg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ex]');
      if (!b) return;
      var a = b.getAttribute('data-ex');
      if (a === 'close' || a === 'cancel') {
        if (ex.running) { ex.abort.abort(); return; }
        dlg.close();
      } else if (a === 'again' && ex.blob) saveBlob(ex.blob, ex.filename);
    });
    dlg.addEventListener('submit', function (e) { e.preventDefault(); if (!ex.running) runExport(); });
    dlg.addEventListener('cancel', function (e) { if (ex.running) { e.preventDefault(); ex.abort.abort(); } });
    dlg.addEventListener('close', function () { ex.blob = null; });
  }

  /* ================= init ================= */

  function init() {
    // /folder/<id> deep links from the original UI -> hash route
    var m = /^\/folder\/([^/]+)/.exec(location.pathname);
    if (m && !location.hash) history.replaceState(null, '', '/#/folder/' + m[1]);
    renderFrame();
    var content = $('#content');
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('change', onChange);
    window.addEventListener('hashchange', onRoute);
    initExportDialog();
    initFilterbar();
    Object.assign(app, {
      R: R, t: t, $: $, esc: esc, icon: icon, toast: toast, saveBlob: saveBlob, store: store, state: state, choice: choice,
      isFolder: isFolder, pk: pk, children: children, chainOf: chainOf, pathLabel: pathLabel, leaves: leaves,
      allFolderIds: allFolderIds, reloadFolder: reloadFolder, render: render, typeLabel: typeLabel, ago: ago, ymd: ymd, asciiName: asciiName,
      toggleSelect: toggleSelect, typeKey: typeKey, refreshSelectionUI: refreshSelectionUI, chev: CHEV,
      dlgHead: function (id, title, closeAttr) {
        return '<div class="rmx-dialog__head"><h2 id="' + id + '" class="responsive-heading-sm" style="font-weight:400">' + esc(title) + '</h2>' +
          '<button type="button" class="ark-button ark-button--tertiary-neutral ark-button-medium" ' + closeAttr + ' aria-label="' + esc(t('close')) + '">' + icon('close', 24) + '</button></div>';
      },
      btn: function (label, attrs, kind) {
        var k = kind || 'secondary';
        var m = { pdf: 'pdf', rmdoc: 'rmdoc', archive: 'archive', primary: 'upload', upload: 'upload', preview: 'preview' };
        if (!m[k]) return '<button type="button" class="ark-button ark-button--' + k + ' ark-button-large" ' + attrs + '>' + esc(label) + '</button>';
        return '<button type="button" class="ark-button rmx-btn rmx-btn--' + m[k] + ' ark-button-large" ' + attrs + '>' + icon(rmxBtnIcon(m[k]), 18) + '<span>' + esc(label) + '</span></button>';
      }
    });
    (R.features || []).forEach(function (f) { f(app); });
    state.folder = readRoute();
    crawl();
    void content;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
